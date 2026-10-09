package expo.modules.aifounditnative

import android.net.TrafficStats
import android.os.Process
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class AifounditNativeModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("AiFoundItNative")

    Events("onIndexProgress", "onToken", "onGenerateDone", "onGenerateError", "onFileOpsProgress")

    OnCreate {
      appContext.reactContext?.let { AiState.init(it) }
    }

    Function("getModelsDir") {
      val dir = File(ctx().getExternalFilesDir(null), "models")
      if (!dir.exists()) dir.mkdirs()
      dir.absolutePath
    }

    Function("hasAllFilesAccess") {
      Intents.hasAllFilesAccess()
    }

    AsyncFunction("openAllFilesAccessSettings") {
      Intents.openAllFilesAccessSettings(ctx())
    }

    AsyncFunction("openBatterySettings") {
      Intents.openBatterySettings(ctx())
    }

    AsyncFunction("configure").Coroutine { scan: ScanConfigArg, models: ModelConfigArg ->
      AiState.scanConfig = scan
      AiState.modelConfig = models
      if (models.embedderPath != AiState.embedder.currentPath() ||
        (models.embedderPath != null && AiState.embedder.backend == "none")
      ) {
        withContext(Dispatchers.IO) {
          AiState.embedder.init(ctx(), models.embedderPath, models.useGpu)
        }
      }
      AiState.statusMap()
    }

    AsyncFunction("runScanNow").Coroutine { ->
      Scanner.runScan { body -> sendEvent("onIndexProgress", body) }
    }

    AsyncFunction("cancelScan") {
      AiState.cancelled.set(true)
    }

    AsyncFunction("getStatus") {
      AiState.statusMap()
    }

    AsyncFunction("drainInbox").Coroutine { limit: Int ->
      withContext(Dispatchers.IO) { AiState.inbox.drain(limit) }
    }

    AsyncFunction("ackInbox").Coroutine { ids: List<Int> ->
      withContext(Dispatchers.IO) { AiState.inbox.ack(ids) }
    }

    AsyncFunction("embedText").Coroutine { text: String ->
      withContext(Dispatchers.Default) {
        AiState.embedder.embedText(text)?.map { it.toDouble() }
          ?: throw CodedException("ERR_NO_EMBEDDER", "no embedding model loaded", null)
      }
    }

    AsyncFunction("generate") { requestId: String, req: GenerateRequestArg ->
      val job = AiState.scope.launch {
        if (AiState.llm.backend == "none") {
          AiState.llm.init(ctx(), AiState.modelConfig.llmPath, AiState.modelConfig.useGpu)
        }
        AiState.llm.generate(requestId, req) { event, body -> sendEvent(event, body) }
      }
      AiState.llm.register(requestId, job)
    }

    AsyncFunction("stopGenerate") { requestId: String ->
      AiState.llm.stop(requestId)
    }

    AsyncFunction("thumbnail").Coroutine { path: String, opts: ThumbnailOptsArg ->
      withContext(Dispatchers.IO) {
        val f = File(path)
        if (!f.exists()) return@withContext null
        val bmp = when (f.extension.lowercase()) {
          "pdf" -> Extract.pdfPageBitmap(path, opts.page ?: 0)
          "mp4", "mkv", "mov", "3gp", "webm", "avi" -> Extract.videoMeta(path).second
          else -> {
            val bounds = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
            android.graphics.BitmapFactory.decodeFile(path, bounds)
            if (bounds.outWidth > 0) Extract.decodeScaled(path, bounds, opts.size) else null
          }
        }
        bmp?.let { Extract.saveThumb(ctx(), it, "$path:${opts.size}:${opts.page ?: 0}") }
      }
    }

    AsyncFunction("readText").Coroutine { path: String, maxChars: Int ->
      withContext(Dispatchers.IO) {
        val f = File(path)
        if (!f.exists()) return@withContext ""
        val ext = f.extension.lowercase()
        val kind = when (ext) {
          "pdf" -> "pdf"
          "docx", "doc", "pptx", "ppt", "xlsx", "xls", "rtf", "odt", "ods" -> "doc"
          else -> "text"
        }
        if (kind == "text") {
          Extract.readTextFile(path, maxChars)
        } else {
          val ex = Extract.extract(ctx(), path, ext, kind)
          ex.textChunks.joinToString("\n") { it["text"] as? String ?: "" }.take(maxChars)
        }
      }
    }

    AsyncFunction("openFile") { path: String, how: String ->
      Intents.openFile(ctx(), path, how == "chooser")
    }

    AsyncFunction("showInFolder") { path: String ->
      Intents.showInFolder(ctx(), path)
    }

    AsyncFunction("runFileOps").Coroutine { batchId: String, ops: List<FileOpArg> ->
      withContext(Dispatchers.IO) {
        FileOps.run(ctx(), batchId, ops) { body -> sendEvent("onFileOpsProgress", body) }
      }
    }

    AsyncFunction("bytesSent") {
      TrafficStats.getUidTxBytes(Process.myUid()).toDouble()
    }

    AsyncFunction("scheduleBackground") { opts: BackgroundOptsArg ->
      val constraints = Constraints.Builder()
        .setRequiresCharging(opts.requireCharging)
        .build()
      val req = PeriodicWorkRequestBuilder<ScanWorker>(
        opts.everyHours.coerceAtLeast(1).toLong(), TimeUnit.HOURS
      ).setConstraints(constraints).build()
      WorkManager.getInstance(ctx())
        .enqueueUniquePeriodicWork("aifoundit-scan", ExistingPeriodicWorkPolicy.UPDATE, req)
    }

    AsyncFunction("cancelBackground") {
      WorkManager.getInstance(ctx()).cancelUniqueWork("aifoundit-scan")
    }
  }

  private fun ctx() = appContext.reactContext
    ?.also { AiState.init(it) }
    ?: throw CodedException("ERR_CONTEXT", "react context unavailable", null)
}
