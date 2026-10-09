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
import java.io.FileInputStream
import java.nio.channels.FileChannel
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.withContext
import kotlin.math.min
import kotlin.math.sqrt

private const val TAG = "AiFoundIt"
private const val DIMS = 256

class EmbedderHolder {
  private var embedder: UniversalEmbedder? = null
  private val initializing = AtomicBoolean(false)
  @Volatile private var path: String? = null

  @Volatile var backend: String = "none"
    private set

  fun currentPath(): String? = path

  fun init(ctx: Context, path: String?, useGpu: Boolean) {
    close()
    this.path = path
    if (path.isNullOrBlank() || !File(path).exists() || !initializing.compareAndSet(false, true)) {
      if (!initializing.get()) backend = "none"
      return
    }
    try {
      val delegates = if (useGpu) listOf(Delegate.GPU, Delegate.CPU) else listOf(Delegate.CPU)
      for (d in delegates) {
        try {
          embedder = create(ctx, path, d)
          backend = if (d == Delegate.GPU) "gpu" else "cpu"
          Log.i(TAG, "embedder ready on $backend")
          return
        } catch (t: Throwable) {
          Log.w(TAG, "embedder init failed on $d: ${t.message}")
        }
      }
      backend = "none"
    } finally {
      initializing.set(false)
    }
  }

  private fun create(ctx: Context, path: String, delegate: Delegate): UniversalEmbedder {
    val buf = FileInputStream(path).channel.use {
      it.map(FileChannel.MapMode.READ_ONLY, 0, File(path).length())
    }
    val base = BaseOptions.builder().setModelAssetBuffer(buf).build()
    val opts = UniversalEmbedderOptions.builder()
      .setBaseOptions(base)
      .setTextDelegate(delegate)
      .setVisionDelegate(delegate)
      .setL2Normalize(true)
      .build()
    return UniversalEmbedder.createFromOptions(ctx, opts)
  }

  fun embedText(text: String): FloatArray? {
    val e = embedder ?: return null
    return try {
      e.embedText(text).embeddings().firstOrNull()?.to256()
    } catch (t: Throwable) {
      Log.w(TAG, "embedText failed: ${t.message}")
      null
    }
  }

  fun embedImage(bitmap: Bitmap): FloatArray? {
    val e = embedder ?: return null
    return try {
      e.embedImage(BitmapImageBuilder(bitmap).build()).embeddings().firstOrNull()?.to256()
    } catch (t: Throwable) {
      Log.w(TAG, "embedImage failed: ${t.message}")
      null
    }
  }

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

  fun close() {
    try { embedder?.close() } catch (_: Throwable) {}
    embedder = null
    backend = "none"
  }
}

class LlmHolder {
  private var engine: Engine? = null
  private val jobs = ConcurrentHashMap<String, Job>()
  private var conversation: Conversation? = null

  @Volatile var backend: String = "none"
    private set

  suspend fun init(ctx: Context, path: String?, useGpu: Boolean) {
    close()
    if (path.isNullOrBlank() || !File(path).exists()) {
      backend = "none"
      return
    }
    val backends = if (useGpu) listOf(Backend.GPU(), Backend.CPU()) else listOf(Backend.CPU())
    for (b in backends) {
      try {
        val e = withContext(Dispatchers.IO) {
          Engine(
            EngineConfig(
              modelPath = path,
              backend = b,
              visionBackend = b,
              cacheDir = ctx.cacheDir.absolutePath
            )
          ).also { it.initialize() }
        }
        engine = e
        backend = if (b is Backend.GPU) "gpu" else "cpu"
        Log.i(TAG, "llm ready on $backend")
        return
      } catch (t: Throwable) {
        Log.w(TAG, "llm init failed on $b: ${t.message}")
      }
    }
    backend = "none"
  }

  suspend fun generate(
    requestId: String,
    req: GenerateRequestArg,
    emit: (String, Map<String, Any?>) -> Unit
  ) {
    val eng = engine ?: run {
      emit("onGenerateError", mapOf("requestId" to requestId, "error" to "no chat model loaded"))
      return
    }
    val conv = try {
      eng.createConversation(
        ConversationConfig(
          systemInstruction = req.system?.takeIf { it.isNotBlank() }?.let { Contents.of(it) },
          samplerConfig = SamplerConfig(topK = 40, topP = 0.95, temperature = req.temperature)
        )
      )
    } catch (t: Throwable) {
      emit("onGenerateError", mapOf("requestId" to requestId, "error" to (t.message ?: "engine error")))
      return
    }
    conversation = conv
    try {
      val parts = mutableListOf<Content>(Content.Text(req.prompt))
      req.imagePath?.takeIf { it.isNotBlank() }?.let { parts += Content.ImageFile(it) }
      conv.sendMessageAsync(Contents.of(*parts.toTypedArray())).collect { m ->
        val token = messageText(m)
        if (token.isNotEmpty()) {
          emit("onToken", mapOf("requestId" to requestId, "token" to token))
        }
      }
      emit("onGenerateDone", mapOf("requestId" to requestId))
    } catch (_: CancellationException) {
      emit("onGenerateDone", mapOf("requestId" to requestId))
      throw CancellationException()
    } catch (t: Throwable) {
      emit("onGenerateError", mapOf("requestId" to requestId, "error" to (t.message ?: "generate failed")))
    } finally {
      conversation = null
      try { conv.close() } catch (_: Throwable) {}
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

  fun close() {
    jobs.values.forEach { it.cancel() }
    jobs.clear()
    try { conversation?.close() } catch (_: Throwable) {}
    conversation = null
    try { engine?.close() } catch (_: Throwable) {}
    engine = null
    backend = "none"
  }
}
