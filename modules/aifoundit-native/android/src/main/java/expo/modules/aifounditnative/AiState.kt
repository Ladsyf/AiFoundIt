package expo.modules.aifounditnative

import android.content.Context
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.types.OptimizedRecord
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

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

object AiState {
  @Volatile private var context: Context? = null
  val ctx: Context
    get() = requireNotNull(context) { "module not initialized" }

  val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

  @Volatile var scanConfig: ScanConfigArg = ScanConfigArg()
  @Volatile var modelConfig: ModelConfigArg = ModelConfigArg()

  @Volatile var running: Boolean = false
  val cancelled = AtomicBoolean(false)
  @Volatile var done: Int = 0
  @Volatile var total: Int = 0
  @Volatile var failed: Int = 0

  val inbox: InboxDb by lazy { InboxDb(ctx) }
  val embedder = EmbedderHolder()
  val llm = LlmHolder()

  fun init(ctx: Context) {
    if (context == null) context = ctx.applicationContext
  }

  fun statusMap(): Map<String, Any?> = mapOf(
    "running" to running,
    "done" to done,
    "total" to total,
    "failed" to failed,
    "embedder" to embedder.backend,
    "llm" to llm.backend
  )
}
