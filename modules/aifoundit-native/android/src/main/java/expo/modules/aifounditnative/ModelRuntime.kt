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
import com.google.ai.edge.litertlm.MessageCallback
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
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

private const val TAG = "AiFoundIt"
private const val DIMS = 256
private const val VISION_TOKENS = 70
private const val CANCEL_WAIT_MS = 10_000L
private const val RETRY_SIDE = 448
private const val RETRY_PAUSE_MS = 300L
private const val WARMUP_SIDE = 224
private const val WARMUP_TRIES = 5

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
    if (embedder != null && backend != "none" && newPath == path) return@withContext
    closeNow()
    path = newPath
    if (newPath.isNullOrBlank() || !File(newPath).exists()) return@withContext
    val delegates = if (useGpu) listOf(Delegate.GPU, Delegate.CPU) else listOf(Delegate.CPU)
    for (d in delegates) {
      try {
        val created = create(ctx, newPath, d)
        embedder = created
        backend = if (d == Delegate.GPU) "gpu" else "cpu"
        warmUp(created)
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
      embedPicture(e, bitmap) ?: retryAfterPause(e, bitmap) ?: retrySmaller(e, bitmap)
    } finally {
      imageNanos += System.nanoTime() - started
      imageCount++
      if (imageCount % 20 == 0) logTiming()
    }
  }

  private fun embedPicture(e: UniversalEmbedder, bitmap: Bitmap, quiet: Boolean = false): FloatArray? =
    try {
      e.embedImage(BitmapImageBuilder(bitmap).build()).embeddings().firstOrNull()?.to256()
    } catch (t: Throwable) {
      if (!quiet) {
        Log.w(TAG, "embedImage failed (" + bitmap.width + "x" + bitmap.height + " " + bitmap.config + "): " + t.message?.lineSequence()?.firstOrNull())
      }
      null
    }

  // The first picture embeds after a model loads can fail while the vision engine settles; absorb that here.
  private fun warmUp(e: UniversalEmbedder) {
    val blank = Bitmap.createBitmap(WARMUP_SIDE, WARMUP_SIDE, Bitmap.Config.ARGB_8888)
    try {
      for (attempt in 1..WARMUP_TRIES) {
        if (embedPicture(e, blank, quiet = true) != null) {
          Log.i(TAG, "picture embedding ready after " + attempt + " tries")
          return
        }
      }
      Log.w(TAG, "picture embedding did not warm up")
    } finally {
      blank.recycle()
    }
  }

  private fun retryAfterPause(e: UniversalEmbedder, bitmap: Bitmap): FloatArray? {
    Thread.sleep(RETRY_PAUSE_MS)
    val v = embedPicture(e, bitmap, quiet = true)
    if (v != null) Log.i(TAG, "embedImage worked on a second try (" + bitmap.width + "x" + bitmap.height + ")")
    return v
  }

  private fun retrySmaller(e: UniversalEmbedder, bitmap: Bitmap): FloatArray? {
    val longest = maxOf(bitmap.width, bitmap.height)
    if (longest <= RETRY_SIDE) return null
    val scale = RETRY_SIDE.toFloat() / longest
    val smaller = Bitmap.createScaledBitmap(
      bitmap,
      maxOf(1, (bitmap.width * scale).toInt()),
      maxOf(1, (bitmap.height * scale).toInt()),
      true
    )
    return try {
      embedPicture(e, smaller)
    } finally {
      smaller.recycle()
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
      val finished = CompletableDeferred<Throwable?>()
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
        try {
          conv.sendMessageAsync(
            Contents.of(*parts.toTypedArray()),
            object : MessageCallback {
              override fun onMessage(message: Message) {
                val token = messageText(message)
                if (token.isEmpty()) return
                if (pieces == 0) firstAt = System.nanoTime()
                pieces++
                emit("onToken", mapOf("requestId" to requestId, "token" to token))
              }

              override fun onDone() {
                finished.complete(null)
              }

              override fun onError(throwable: Throwable) {
                finished.complete(throwable)
              }
            }
          )
        } catch (t: Throwable) {
          finished.complete(t)
        }
        val failure = finished.await()
        if (failure != null && failure !is CancellationException) throw failure
        Log.i(
          TAG,
          "llm answer: first word after " + ((firstAt - started) / 1_000_000L) + " ms, " + pieces +
            " pieces in " + ((System.nanoTime() - started) / 1_000_000L) + " ms"
        )
        emit("onGenerateDone", mapOf("requestId" to requestId))
      } catch (e: CancellationException) {
        stopNative(conv, finished)
        emit("onGenerateDone", mapOf("requestId" to requestId))
        throw e
      } catch (t: Throwable) {
        emit("onGenerateError", mapOf("requestId" to requestId, "error" to (t.message ?: "generate failed")))
      } finally {
        closeConversation(conv, finished)
      }
    }
  }

  private suspend fun stopNative(conv: Conversation?, finished: CompletableDeferred<Throwable?>) {
    if (conv == null || finished.isCompleted) return
    withContext(NonCancellable) {
      try {
        conv.cancelProcess()
      } catch (t: Throwable) {
        Log.w(TAG, "cancelProcess failed: " + t.message)
      }
      withTimeoutOrNull(CANCEL_WAIT_MS) { finished.await() }
    }
  }

  // Freeing a conversation that is still generating crashes the native runtime, so one that never stopped is leaked.
  private fun closeConversation(conv: Conversation?, finished: CompletableDeferred<Throwable?>) {
    if (conv == null) return
    if (!finished.isCompleted) {
      Log.w(TAG, "conversation still running, not closing it")
      return
    }
    try {
      conv.close()
    } catch (_: Throwable) {
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

  private suspend fun closeEngine() {
    val caller = currentCoroutineContext()[Job]
    jobs.entries.filter { it.value !== caller }.forEach { (id, job) ->
      jobs.remove(id)
      job.cancel()
    }
    generateLock.withLock {
      try {
        engine?.close()
      } catch (_: Throwable) {
      }
      engine = null
      loadedPath = null
      backend = "none"
    }
  }

  suspend fun close() = closeEngine()
}
