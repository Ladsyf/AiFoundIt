package expo.modules.aifounditnative

import android.graphics.BitmapFactory
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class AifounditNativeModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("AiFoundItNative")

    Events(
      "onIndexProgress",
      "onToken",
      "onGenerateDone",
      "onGenerateError",
      "onFileOpsProgress",
      "onModelDownload"
    )

    OnCreate {
      appContext.reactContext?.let { AiState.init(it) }
    }

    // ---- setup and permissions ----

    Function("getModelsDir") {
      ModelManager.modelsDir(ctx()).absolutePath
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

    /**
     * Saves the settings (the background worker reads them after a restart), loads the embedder, and
     * starts loading the chat model in the background.
     */
    AsyncFunction("configure").Coroutine { scan: ScanConfigArg, models: ModelConfigArg ->
      AiState.applyConfig(scan.toCfg(), models.toCfg())
      AiState.ensureModels(ctx())
      AiState.statusMap()
    }

    // ---- indexing ----

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

    /** Forgets what was scanned, so the next scan indexes every file again (used by Delete index and re-embedding). */
    AsyncFunction("resetIndex").Coroutine { ->
      withContext(Dispatchers.IO) { AiState.inbox.reset() }
    }

    AsyncFunction("embedText").Coroutine { text: String ->
      val v = AiState.embedder.embedText(text)
        ?: throw CodedException("ERR_NO_EMBEDDER", "no embedding model loaded", null)
      v.map { it.toDouble() }
    }

    // ---- chat model ----

    AsyncFunction("generate") { requestId: String, req: GenerateRequestArg ->
      val job = AiState.scope.launch {
        val m = AiState.modelCfg
        // Joins a load that is already running, or starts one when the app has never loaded the model.
        AiState.llm.ensureLoaded(ctx(), m.llmPath, m.useGpu)
        AiState.llm.generate(requestId, req) { event, body -> sendEvent(event, body) }
      }
      AiState.llm.register(requestId, job)
    }

    AsyncFunction("stopGenerate") { requestId: String ->
      AiState.llm.stop(requestId)
    }

    // ---- model files ----

    AsyncFunction("listModels").Coroutine { ->
      withContext(Dispatchers.IO) { ModelManager.list(ctx()) }
    }

    AsyncFunction("downloadModel") { req: DownloadRequestArg ->
      ModelManager.start(ctx(), req) { body -> sendEvent("onModelDownload", body) }
    }

    AsyncFunction("pauseDownload") { id: String ->
      ModelManager.pause(id)
    }

    AsyncFunction("cancelDownload") { id: String, fileName: String? ->
      ModelManager.cancel(ctx(), id, fileName) { body -> sendEvent("onModelDownload", body) }
    }

    AsyncFunction("getDownloads") {
      ModelManager.activeDownloads()
    }

    AsyncFunction("importModel").Coroutine { uri: String, fileName: String ->
      ModelManager.importFrom(ctx(), uri, fileName) { body -> sendEvent("onModelDownload", body) }
    }

    AsyncFunction("deleteModel").Coroutine { fileName: String ->
      withContext(Dispatchers.IO) { ModelManager.delete(ctx(), fileName) }
    }

    AsyncFunction("getDeviceInfo").Coroutine { ->
      withContext(Dispatchers.IO) { ModelManager.deviceInfo(ctx()) }
    }

    // ---- files ----

    AsyncFunction("thumbnail").Coroutine { path: String, opts: ThumbnailOptsArg ->
      withContext(Dispatchers.IO) {
        val f = File(path)
        if (!f.exists()) return@withContext null
        val bmp = when (f.extension.lowercase()) {
          "pdf" -> Extract.pdfPageBitmap(path, opts.page ?: 0, opts.size)
          "mp4", "mkv", "mov", "3gp", "webm", "avi", "m4v" -> Extract.videoMeta(path).second
          else -> {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(path, bounds)
            if (bounds.outWidth > 0) Extract.decodeScaled(path, bounds, opts.size) else null
          }
        }
        bmp?.let { Extract.saveThumb(ctx(), it, path + ":" + opts.size + ":" + (opts.page ?: 0)) }
      }
    }

    AsyncFunction("readText").Coroutine { path: String, maxChars: Int ->
      withContext(Dispatchers.IO) {
        val f = File(path)
        if (!f.exists()) return@withContext ""
        val ext = f.extension.lowercase()
        val kind = if (ext == "pdf") "pdf" else "doc"
        val ex = Extract.extract(ctx(), path, ext, kind)
        ex.textChunks.joinToString("\n") { it["text"] as? String ?: "" }.take(maxChars)
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

    // ---- privacy counters ----

    /** Bytes sent since the app started, not counting model downloads. */
    AsyncFunction("bytesSent") {
      NetStats.bytesSentOutsideDownloads().toDouble()
    }

    AsyncFunction("downloadTraffic") {
      val (received, sent) = NetStats.downloadTraffic()
      mapOf("received" to received.toDouble(), "sent" to sent.toDouble())
    }

    // ---- background indexing ----

    AsyncFunction("scheduleBackground") { opts: BackgroundOptsArg ->
      Scheduler.schedule(ctx(), opts.everyHours, opts.requireCharging, opts.watchNewMedia)
    }

    AsyncFunction("cancelBackground") {
      Scheduler.cancel(ctx())
    }
  }

  private fun ctx() = appContext.reactContext
    ?.also { AiState.init(it) }
    ?: throw CodedException("ERR_CONTEXT", "react context unavailable", null)
}
