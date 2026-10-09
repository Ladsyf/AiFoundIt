package expo.modules.aifounditnative

import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Content
import com.google.ai.edge.litertlm.Contents
import com.google.ai.edge.litertlm.Conversation
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.Message
import com.google.ai.edge.litertlm.SamplerConfig
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.components.containers.Embedding
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.retrieval.universalembedder.UniversalEmbedder
import com.google.mediapipe.tasks.retrieval.universalembedder.UniversalEmbedderOptions
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import kotlin.math.min
import kotlin.math.sqrt
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

private const val TAG = "AiFoundIt"
private const val DIMS = 256
private const val VISION_TOKENS = 70

/**
 * GPU contexts are bound to the thread that created them, and the embedder is not documented as
 * thread-safe. Every embedder call (load, text, image) runs on this one thread, which also serializes them.
 */
object EmbedThread {
  val dispatcher: CoroutineDispatcher = Executors.newSingleThreadExecutor { r ->
    Thread(r, "aifoundit-embed").apply { isDaemon = true }
  }.asCoroutineDispatcher()
}

class EmbedderHolder {
  private var embedder: UniversalEmbedder? = null
  @Volatile private var path: String? = null

  @Volatile var backend: String = "none"
    private set

  fun currentPath(): String? = path

  /** Loads the model on the embed thread: GPU first, CPU if the GPU delegate fails. */
  suspend fun init(ctx: Context, newPath: String?, useGpu: Boolean) = withContext(EmbedThread.dispatcher) {
    closeNow()
    path = newPath
    if (newPath.isNullOrBlank() || !File(newPath).exists()) return@withContext
    val delegates = if (useGpu) listOf(Delegate.GPU, Delegate.CPU) else listOf(Delegate.CPU)
    for (d in delegates) {
      try {
        embedder = create(ctx, newPath, d)
        backend = if (d == Delegate.GPU) "gpu" else "cpu"
        Log.i(TAG, "embedder ready on $backend")
        return@withContext
      } catch (t: Throwable) {
        Log.w(TAG, "embedder init failed on $d: ${t.message}")
      }
    }
    backend = "none"
  }

  private fun create(ctx: Context, modelPath: String, delegate: Delegate): UniversalEmbedder {
    // UniversalEmbedder reads the model from a file path (or a file descriptor). A memory-mapped buffer is
    // rejected, and needs a MediaPipe native library that nothing has loaded at this point.
    val base = BaseOptions.builder().setModelAssetPath(modelPath).build()
    val cache = File(ctx.cacheDir, "embedder-cache").apply { mkdirs() }
    val opts = UniversalEmbedderOptions.builder()
      .setBaseOptions(base)
      .setTextDelegate(delegate)
      .setVisionDelegate(delegate)
      .setL2Normalize(true)
      // The model reads a picture as a number of "tokens"; fewer is faster and cooler. This is plenty for finding
      // a photo by what is in it (words on screenshots come from OCR, not from this).
      .setVisionTokensPerImage(VISION_TOKENS)
      .setCacheDir(cache.absolutePath)
      .build()
    return UniversalEmbedder.createFromOptions(ctx, opts)
  }

  suspend fun embedText(text: String): FloatArray? = withContext(EmbedThread.dispatcher) {
    val e = embedder ?: return@withContext null
    val started = System.nanoTime()
    try {
      e.embedText(text).embeddings().firstOrNull()?.to256()
    } catch (t: Throwable) {
      Log.w(TAG, "embedText failed: ${t.message}")
      null
    } finally {
      textNanos += System.nanoTime() - started
      textCount++
    }
  }

  // Timing of the embed calls, so a slow scan can be explained. Only touched on the embed thread.
  private var imageCount = 0
  private var imageNanos = 0L
  private var textCount = 0
  private var textNanos = 0L

  private fun logTiming() {
    Log.i(
      TAG,
      "embed timing: images " + imageCount + " avg " + (imageNanos / imageCount / 1_000_000L) + " ms, texts " +
        textCount + " avg " + (if (textCount > 0) textNanos / textCount / 1_000_000L else 0L) + " ms"
    )
  }

  suspend fun embedImage(bitmap: Bitmap): FloatArray? = withContext(EmbedThread.dispatcher) {
    val e = embedder ?: return@withContext null
    val started = System.nanoTime()
    try {
      e.embedImage(BitmapImageBuilder(bitmap).build()).embeddings().firstOrNull()?.to256()
    } catch (t: Throwable) {
      Log.w(TAG, "embedImage failed: ${t.message}")
      null
    } finally {
      imageNanos += System.nanoTime() - started
      imageCount++
      if (imageCount % 20 == 0) logTiming()
    }
  }

  /** Matryoshka cut to 256 dimensions, then L2-normalized again. */
  private fun Embedding.to256(): FloatArray {
    val src = floatEmbedding()
    val n = min(DIMS, src.size)
    val out = FloatArray(n)
    var sum = 0.0
    for (i in 0 until n) {
      out[i] = src[i]
      sum += src[i] * src[i]
    }
    val norm = sqrt(sum).toFloat().takeIf { it > 0f } ?: 1f
    for (i in 0 until n) out[i] /= norm
    return out
  }

  private fun closeNow() {
    try {
      embedder?.close()
    } catch (_: Throwable) {
    }
    embedder = null
    backend = "none"
  }

  suspend fun close() = withContext(EmbedThread.dispatcher) { closeNow() }
}

class LlmHolder {
  private var engine: Engine? = null
  private val jobs = ConcurrentHashMap<String, Job>()
  private val loadLock = Mutex()
  private val generateLock = Mutex()
  @Volatile private var loadedPath: String? = null

  @Volatile var backend: String = "none"
    private set

  @Volatile var loading: Boolean = false
    private set

  @Volatile var lastError: String? = null
    private set

  fun currentPath(): String? = loadedPath

  /**
   * Loads the chat model once. Callers that arrive while it is loading wait for that load instead of
   * starting another, so the first question never loads a multi-gigabyte model twice.
   */
  suspend fun ensureLoaded(ctx: Context, path: String?, useGpu: Boolean) {
    if (path.isNullOrBlank() || !File(path).exists()) return
    if (engine != null && loadedPath == path) return
    loadLock.withLock {
      if (engine != null && loadedPath == path) return
      loading = true
      try {
        loadLocked(ctx, path, useGpu)
      } finally {
        loading = false
      }
    }
  }

  private suspend fun loadLocked(ctx: Context, path: String, useGpu: Boolean) {
    closeEngine()
    lastError = null
    // Text-only models have no vision encoder, so the vision attempts fail and the later ones succeed.
    val attempts = ArrayList<Pair<Backend, Boolean>>()
    if (useGpu) attempts.add(Pair(Backend.GPU(), true))
    attempts.add(Pair(Backend.CPU(), true))
    if (useGpu) attempts.add(Pair(Backend.GPU(), false))
    attempts.add(Pair(Backend.CPU(), false))

    for ((b, withVision) in attempts) {
      var candidate: Engine? = null
      try {
        val ready = withContext(Dispatchers.IO) {
          val e = Engine(
            EngineConfig(
              modelPath = path,
              backend = b,
              visionBackend = if (withVision) b else null,
              cacheDir = ctx.cacheDir.absolutePath
            )
          )
          candidate = e
          e.initialize()
          e
        }
        engine = ready
        loadedPath = path
        backend = if (b is Backend.GPU) "gpu" else "cpu"
        Log.i(TAG, "llm ready on " + backend + ", vision " + withVision)
        return
      } catch (t: Throwable) {
        lastError = t.message
        Log.w(TAG, "llm init failed, vision " + withVision + ": " + t.message)
        try {
          candidate?.close()
        } catch (_: Throwable) {
        }
      }
    }
    loadedPath = null
    backend = "none"
  }

  suspend fun generate(
    requestId: String,
    req: GenerateRequestArg,
    emit: (String, Map<String, Any?>) -> Unit
  ) {
    val eng = engine
    if (eng == null) {
      emit("onGenerateError", mapOf("requestId" to requestId, "error" to (lastError ?: "no chat model loaded")))
      return
    }
    // One conversation at a time: a second request waits instead of fighting for the model.
    generateLock.withLock {
      var conv: Conversation? = null
      try {
        conv = eng.createConversation(
          ConversationConfig(
            systemInstruction = req.system?.takeIf { it.isNotBlank() }?.let { Contents.of(it) },
            samplerConfig = SamplerConfig(topK = 40, topP = 0.95, temperature = req.temperature),
            maxOutputToken = req.maxTokens.takeIf { it > 0 }
          )
        )
        val parts = ArrayList<Content>()
        req.imagePath?.takeIf { it.isNotBlank() }?.let { parts.add(Content.ImageFile(it)) }
        parts.add(Content.Text(req.prompt))
        val started = System.nanoTime()
        var firstAt = 0L
        var pieces = 0
        conv.sendMessageAsync(Contents.of(*parts.toTypedArray())).collect { m ->
          val token = messageText(m)
          if (token.isNotEmpty()) {
            if (pieces == 0) firstAt = System.nanoTime()
            pieces++
            emit("onToken", mapOf("requestId" to requestId, "token" to token))
          }
        }
        Log.i(
          TAG,
          "llm answer: first word after " + ((firstAt - started) / 1_000_000L) + " ms, " + pieces +
            " pieces in " + ((System.nanoTime() - started) / 1_000_000L) + " ms"
        )
        emit("onGenerateDone", mapOf("requestId" to requestId))
      } catch (e: CancellationException) {
        emit("onGenerateDone", mapOf("requestId" to requestId))
        throw e
      } catch (t: Throwable) {
        emit("onGenerateError", mapOf("requestId" to requestId, "error" to (t.message ?: "generate failed")))
      } finally {
        try {
          conv?.close()
        } catch (_: Throwable) {
        }
      }
    }
  }

  private fun messageText(m: Message): String = m.toString()

  fun register(requestId: String, job: Job) {
    jobs[requestId] = job
    job.invokeOnCompletion { jobs.remove(requestId) }
  }

  fun stop(requestId: String) {
    jobs.remove(requestId)?.cancel()
  }

  private fun closeEngine() {
    jobs.values.forEach { it.cancel() }
    jobs.clear()
    try {
      engine?.close()
    } catch (_: Throwable) {
    }
    engine = null
    loadedPath = null
    backend = "none"
  }

  fun close() = closeEngine()
}
