package expo.modules.aifounditnative

import android.content.Context
import android.os.Environment
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.types.OptimizedRecord
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

@OptimizedRecord
class TypesArg : Record {
  @Field val images: Boolean = true
  @Field val documents: Boolean = true
  @Field val audio: Boolean = true
  @Field val video: Boolean = true
}

@OptimizedRecord
class ScanConfigArg : Record {
  @Field val mode: String = "wholePhone"
  @Field val includeRoots: List<String> = emptyList()
  @Field val excludes: List<String> = emptyList()
  @Field val types: TypesArg = TypesArg()
  @Field val respectNomedia: Boolean = true
  @Field val minImageBytes: Int = 0
  @Field val maxDocBytes: Int = 0
}

@OptimizedRecord
class ModelConfigArg : Record {
  @Field val embedderPath: String? = null
  @Field val llmPath: String? = null
  @Field val useGpu: Boolean = true
  @Field val dims: Int = 256
}

@OptimizedRecord
class GenerateRequestArg : Record {
  @Field val system: String? = null
  @Field val prompt: String = ""
  @Field val imagePath: String? = null
  @Field val audioPath: String? = null
  @Field val maxTokens: Int = 256
  @Field val temperature: Double = 0.2
}

@OptimizedRecord
class FileOpArg : Record {
  @Field val op: String = ""
  @Field val from: String? = null
  @Field val to: String = ""
}

@OptimizedRecord
class ThumbnailOptsArg : Record {
  @Field val size: Int = 256
  @Field val page: Int? = null
}

@OptimizedRecord
class BackgroundOptsArg : Record {
  @Field val everyHours: Int = 12
  @Field val requireCharging: Boolean = true
  @Field val watchNewMedia: Boolean = false
}

/** Byte counts are doubles because JS numbers above 2 GB do not fit an Int. */
@OptimizedRecord
class DownloadRequestArg : Record {
  @Field val id: String = ""
  @Field val url: String = ""
  @Field val fallbackUrl: String? = null
  @Field val fileName: String = ""
  @Field val expectedBytes: Double = 0.0
  @Field val token: String? = null
  @Field val wifiOnly: Boolean = true
}

/** Plain copies of the JS config, so the background worker can restore them without Expo records. */
data class ScanCfg(
  val mode: String = "wholePhone",
  val includeRoots: List<String> = emptyList(),
  val excludes: List<String> = emptyList(),
  val images: Boolean = true,
  val documents: Boolean = true,
  val audio: Boolean = true,
  val video: Boolean = true,
  val respectNomedia: Boolean = true,
  val minImageBytes: Int = 0,
  val maxDocBytes: Int = 0,
)

data class ModelCfg(
  val embedderPath: String? = null,
  val llmPath: String? = null,
  val useGpu: Boolean = true,
)

fun ScanConfigArg.toCfg() = ScanCfg(
  mode = if (mode == "selected") "selected" else "wholePhone",
  includeRoots = includeRoots.filter { it.isNotBlank() },
  excludes = excludes.filter { it.isNotBlank() },
  images = types.images,
  documents = types.documents,
  audio = types.audio,
  video = types.video,
  respectNomedia = respectNomedia,
  minImageBytes = minImageBytes.coerceAtLeast(0),
  maxDocBytes = maxDocBytes.coerceAtLeast(0),
)

fun ModelConfigArg.toCfg() = ModelCfg(
  embedderPath = embedderPath?.takeIf { it.isNotBlank() },
  llmPath = llmPath?.takeIf { it.isNotBlank() },
  useGpu = useGpu,
)

object ConfigJson {
  private fun strings(a: JSONArray?): List<String> =
    if (a == null) emptyList() else (0 until a.length()).map { a.getString(it) }

  fun encode(s: ScanCfg, m: ModelCfg): String = JSONObject()
    .put("mode", s.mode)
    .put("includeRoots", JSONArray(s.includeRoots))
    .put("excludes", JSONArray(s.excludes))
    .put("images", s.images)
    .put("documents", s.documents)
    .put("audio", s.audio)
    .put("video", s.video)
    .put("respectNomedia", s.respectNomedia)
    .put("minImageBytes", s.minImageBytes)
    .put("maxDocBytes", s.maxDocBytes)
    .put("embedderPath", m.embedderPath ?: JSONObject.NULL)
    .put("llmPath", m.llmPath ?: JSONObject.NULL)
    .put("useGpu", m.useGpu)
    .toString()

  fun decode(raw: String): Pair<ScanCfg, ModelCfg> {
    val o = JSONObject(raw)
    val scan = ScanCfg(
      mode = o.optString("mode", "wholePhone"),
      includeRoots = strings(o.optJSONArray("includeRoots")),
      excludes = strings(o.optJSONArray("excludes")),
      images = o.optBoolean("images", true),
      documents = o.optBoolean("documents", true),
      audio = o.optBoolean("audio", true),
      video = o.optBoolean("video", true),
      respectNomedia = o.optBoolean("respectNomedia", true),
      minImageBytes = o.optInt("minImageBytes", 0),
      maxDocBytes = o.optInt("maxDocBytes", 0),
    )
    val models = ModelCfg(
      embedderPath = if (o.isNull("embedderPath")) null else o.optString("embedderPath").takeIf { it.isNotBlank() },
      llmPath = if (o.isNull("llmPath")) null else o.optString("llmPath").takeIf { it.isNotBlank() },
      useGpu = o.optBoolean("useGpu", true),
    )
    return Pair(scan, models)
  }
}

object AiState {
  @Volatile private var context: Context? = null
  val ctx: Context
    get() = requireNotNull(context) { "module not initialized" }

  val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

  @Volatile var scanCfg: ScanCfg = ScanCfg()
  @Volatile var modelCfg: ModelCfg = ModelCfg()
  @Volatile var configured: Boolean = false

  val running = AtomicBoolean(false)
  val cancelled = AtomicBoolean(false)
  @Volatile var done: Int = 0
  @Volatile var total: Int = 0
  @Volatile var failed: Int = 0

  val inbox: InboxDb by lazy { InboxDb(ctx) }
  val embedder = EmbedderHolder()
  val llm = LlmHolder()

  fun init(ctx: Context) {
    if (context == null) context = ctx.applicationContext
    NetStats.init()
  }

  /** Remembers the settings in memory and on disk so a background run after a restart uses them. */
  fun applyConfig(scan: ScanCfg, models: ModelCfg) {
    val before = if (configured) scanCfg else savedScanCfg()
    scanCfg = scan
    modelCfg = models
    configured = true
    try {
      inbox.putMeta("config", ConfigJson.encode(scan, models))
    } catch (_: Throwable) {
    }
    if (before != null) forgetLoosened(before, scan)
  }

  private fun savedScanCfg(): ScanCfg? = try {
    inbox.getMeta("config")?.let { ConfigJson.decode(it).first }
  } catch (_: Throwable) {
    null
  }

  /** Files in a folder that was skipped before and is not now are indexed again by the next scan. */
  private fun forgetLoosened(before: ScanCfg, after: ScanCfg) {
    if (before.mode == after.mode && before.includeRoots == after.includeRoots && before.excludes == after.excludes) return
    try {
      val root = Environment.getExternalStorageDirectory() ?: return
      val freed = inbox.seenFingerprints().keys.filter {
        val rel = Scanner.folderOfPath(root, it)
        Scanner.skipFolder(rel, before) && !Scanner.skipFolder(rel, after)
      }
      inbox.forget(freed)
    } catch (_: Throwable) {
    }
  }

  /** Loads the saved settings when this process has not been configured by JS yet (background runs). */
  fun restoreConfig(): Boolean {
    if (configured) return true
    return try {
      val raw = inbox.getMeta("config") ?: return false
      val (scan, models) = ConfigJson.decode(raw)
      scanCfg = scan
      modelCfg = models
      configured = true
      true
    } catch (_: Throwable) {
      false
    }
  }

  /**
   * Loads the embedder (waits for it) and starts the chat model in the background.
   * Called after configure, so the first question does not pay for model loading.
   */
  suspend fun ensureModels(ctx: Context, loadChat: Boolean = true) {
    val m = modelCfg
    if (m.embedderPath != embedder.currentPath() || (m.embedderPath != null && embedder.backend == "none")) {
      embedder.init(ctx, m.embedderPath, m.useGpu)
    }
    if (loadChat && m.llmPath != null && (m.llmPath != llm.currentPath() || llm.backend == "none") && !llm.loading) {
      scope.launch { llm.ensureLoaded(ctx, m.llmPath, m.useGpu) }
    }
    if (m.llmPath == null && llm.backend != "none") {
      llm.close()
    }
  }

  fun statusMap(): Map<String, Any?> = mapOf(
    "running" to running.get(),
    "done" to done,
    "total" to total,
    "failed" to failed,
    "embedder" to embedder.backend,
    "llm" to llm.backend,
    "llmLoading" to llm.loading
  )
}
