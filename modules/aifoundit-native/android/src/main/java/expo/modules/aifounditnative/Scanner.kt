package expo.modules.aifounditnative

import android.content.ContentUris
import android.content.Context
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext

private const val TAG = "AiFoundIt"
private const val MAX_WALK_FILES = 60000
private const val MAX_WALK_DEPTH = 14

object Scanner {

  data class Candidate(
    val path: String,
    val uri: String,
    val name: String,
    val folder: String,
    val ext: String,
    val mime: String,
    val kind: String,
    val size: Long,
    val modifiedAt: Long,
    val takenAt: Long? = null,
    val width: Int? = null,
    val height: Int? = null,
    val durationMs: Long? = null,
    val isScreenshot: Boolean = false
  )

  private val docExts = mapOf(
    "pdf" to "pdf",
    "doc" to "doc", "docx" to "doc", "ppt" to "doc", "pptx" to "doc",
    "xls" to "doc", "xlsx" to "doc", "rtf" to "doc", "odt" to "doc", "ods" to "doc",
    "txt" to "text", "md" to "text", "json" to "text", "csv" to "text",
    "log" to "text", "xml" to "text", "yaml" to "text", "yml" to "text", "tsv" to "text"
  )

  private val skipDirs = setOf("android", "lost+found")

  suspend fun runScan(emit: (Map<String, Any?>) -> Unit) = withContext(Dispatchers.IO) {
    if (AiState.running) return@withContext
    AiState.running = true
    AiState.cancelled.set(false)
    AiState.failed = 0
    try {
      val cfg = AiState.scanConfig
      val candidates = enumerate(AiState.ctx, cfg)
      val seen = AiState.inbox.seenFingerprints()
      val byPath = candidates.associateBy { it.path }
      val changed = candidates.filter { seen[it.path] != fingerprint(it) }
      val gone = seen.keys.filter { it !in byPath }

      AiState.total = changed.size
      AiState.done = 0
      emit(mapOf("done" to 0, "total" to AiState.total, "current" to ""))

      for ((i, c) in changed.withIndex()) {
        ensureActive()
        if (AiState.cancelled.get()) break
        try {
          AiState.inbox.stage(process(AiState.ctx, c))
        } catch (t: Throwable) {
          AiState.failed++
          Log.w(TAG, "indexing failed for ${c.path}: ${t.message}")
          AiState.inbox.stage(errorItem(c, t))
        }
        AiState.done = i + 1
        emit(mapOf("done" to AiState.done, "total" to AiState.total, "current" to c.name))
      }
      for (p in gone) AiState.inbox.stageDelete(p)
      if (!AiState.cancelled.get()) {
        AiState.inbox.saveScanState(byPath.mapValues { fingerprint(it.value) })
      }
    } finally {
      AiState.running = false
    }
  }

  private fun fingerprint(c: Candidate) = "${c.size}:${c.modifiedAt}"

  private fun errorItem(c: Candidate, t: Throwable): Map<String, Any?> = baseItem(c) +
    mapOf("error" to (t.message ?: "indexing failed"), "chunks" to emptyList<Map<String, Any?>>())

  fun enumerate(ctx: Context, cfg: ScanConfigArg): List<Candidate> {
    val found = linkedMapOf<String, Candidate>()
    if (cfg.types.images) queryMedia(ctx, cfg, MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image", found)
    if (cfg.types.video) queryMedia(ctx, cfg, MediaStore.Video.Media.EXTERNAL_CONTENT_URI, "video", found)
    if (cfg.types.audio) queryMedia(ctx, cfg, MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, "audio", found)
    if (cfg.types.documents) {
      if (hasAllFilesAccess()) walkDocuments(cfg, found)
      else queryDocuments(ctx, cfg, found)
    }
    return found.values.toList()
  }

  private fun queryMedia(
    ctx: Context,
    cfg: ScanConfigArg,
    uri: android.net.Uri,
    kind: String,
    out: MutableMap<String, Candidate>
  ) {
    val proj = arrayOf(
      MediaStore.MediaColumns._ID,
      MediaStore.MediaColumns.DATA,
      MediaStore.MediaColumns.DISPLAY_NAME,
      MediaStore.MediaColumns.RELATIVE_PATH,
      MediaStore.MediaColumns.SIZE,
      MediaStore.MediaColumns.DATE_MODIFIED,
      MediaStore.MediaColumns.DATE_TAKEN,
      MediaStore.MediaColumns.MIME_TYPE,
      MediaStore.MediaColumns.WIDTH,
      MediaStore.MediaColumns.HEIGHT,
      MediaStore.MediaColumns.DURATION
    )
    try {
      ctx.contentResolver.query(uri, proj, null, null, null)?.use { c ->
        while (c.moveToNext()) {
          val path = c.getString(1) ?: continue
          if (!File(path).exists()) continue
          val rel = (c.getString(3) ?: "").trimEnd('/')
          if (excluded(rel, cfg)) continue
          val size = c.getLong(4)
          if (kind == "image" && cfg.minImageBytes > 0 && size < cfg.minImageBytes) continue
          val id = c.getLong(0)
          out[path] = Candidate(
            path = path,
            uri = ContentUris.withAppendedId(uri, id).toString(),
            name = c.getString(2) ?: File(path).name,
            folder = if (rel.isEmpty()) "/" else "/$rel",
            ext = File(path).extension.lowercase(),
            mime = c.getString(7) ?: "",
            kind = kind,
            size = size,
            modifiedAt = c.getLong(5) * 1000L,
            takenAt = c.getLong(6).takeIf { it > 0 },
            width = c.getInt(8).takeIf { it > 0 },
            height = c.getInt(9).takeIf { it > 0 },
            durationMs = c.getLong(10).takeIf { it > 0 },
            isScreenshot = rel.contains("screenshot", ignoreCase = true)
          )
        }
      }
    } catch (t: Throwable) {
      Log.w(TAG, "media query failed for $kind: ${t.message}")
    }
  }

  private fun queryDocuments(ctx: Context, cfg: ScanConfigArg, out: MutableMap<String, Candidate>) {
    try {
      ctx.contentResolver.query(
        MediaStore.Files.getContentUri("external"),
        arrayOf(
          MediaStore.MediaColumns._ID,
          MediaStore.MediaColumns.DATA,
          MediaStore.MediaColumns.DISPLAY_NAME,
          MediaStore.MediaColumns.RELATIVE_PATH,
          MediaStore.MediaColumns.SIZE,
          MediaStore.MediaColumns.DATE_MODIFIED,
          MediaStore.MediaColumns.MIME_TYPE
        ),
        null, null, null
      )?.use { c ->
        while (c.moveToNext()) {
          val path = c.getString(1) ?: continue
          val ext = File(path).extension.lowercase()
          val kind = docExts[ext] ?: continue
          if (!File(path).exists()) continue
          val rel = (c.getString(3) ?: "").trimEnd('/')
          if (excluded(rel, cfg)) continue
          val size = c.getLong(4)
          if (cfg.maxDocBytes > 0 && size > cfg.maxDocBytes) continue
          out[path] = Candidate(
            path = path,
            uri = ContentUris.withAppendedId(MediaStore.Files.getContentUri("external"), c.getLong(0)).toString(),
            name = c.getString(2) ?: File(path).name,
            folder = if (rel.isEmpty()) "/" else "/$rel",
            ext = ext,
            mime = c.getString(6) ?: "",
            kind = kind,
            size = size,
            modifiedAt = c.getLong(5) * 1000L
          )
        }
      }
    } catch (t: Throwable) {
      Log.w(TAG, "documents query failed: ${t.message}")
    }
  }

  private fun walkDocuments(cfg: ScanConfigArg, out: MutableMap<String, Candidate>) {
    val root = Environment.getExternalStorageDirectory() ?: return
    val roots = if (cfg.includeRoots.isEmpty()) listOf(root) else cfg.includeRoots.map { File(root, it) }
    var count = 0
    for (start in roots) {
      if (!start.exists()) continue
      start.walkTopDown()
        .maxDepth(MAX_WALK_DEPTH)
        .onFail { _, _ -> }
        .onEnter { dir ->
          if (dir == start && start == root) return@onEnter true
          if (dir.name.startsWith(".")) return@onEnter false
          if (dir.name.lowercase() in skipDirs && dir.parentFile == root) return@onEnter false
          if (cfg.respectNomedia && File(dir, ".nomedia").exists()) return@onEnter false
          if (excluded(relTo(root, dir), cfg)) return@onEnter false
          count++ < MAX_WALK_FILES
        }
        .filter { it.isFile }
        .forEach { f ->
          if (AiState.cancelled.get()) return@forEach
          val ext = f.extension.lowercase()
          val kind = docExts[ext] ?: return@forEach
          if (cfg.maxDocBytes > 0 && f.length() > cfg.maxDocBytes) return@forEach
          val rel = relTo(root, f.parentFile)
          val path = f.absolutePath
          if (out.containsKey(path)) return@forEach
          out[path] = Candidate(
            path = path,
            uri = "file://$path",
            name = f.name,
            folder = "/$rel",
            ext = ext,
            mime = mimeFor(ext),
            kind = kind,
            size = f.length(),
            modifiedAt = f.lastModified()
          )
        }
    }
  }

  private fun relTo(root: File, dir: File?): String =
    dir?.relativeToOrSelf(root)?.path?.replace('\\', '/')?.trim('/') ?: ""

  private fun excluded(rel: String, cfg: ScanConfigArg): Boolean {
    if (rel.isEmpty()) return false
    val norm = rel.lowercase().trim('/')
    if (cfg.mode == "selected" && cfg.includeRoots.isNotEmpty()) {
      val included = cfg.includeRoots.any {
        norm == it.lowercase().trim('/') || norm.startsWith(it.lowercase().trim('/') + "/")
      }
      if (!included) return true
    }
    return cfg.excludes.any { norm.contains(it.lowercase().trim('/')) }
  }

  private fun mimeFor(ext: String): String = when (ext) {
    "pdf" -> "application/pdf"
    "doc", "docx" -> "application/msword"
    "xls", "xlsx" -> "application/vnd.ms-excel"
    "ppt", "pptx" -> "application/vnd.ms-powerpoint"
    "txt", "md", "log" -> "text/plain"
    "json" -> "application/json"
    "csv", "tsv" -> "text/csv"
    else -> "application/octet-stream"
  }

  private fun hasAllFilesAccess(): Boolean =
    android.os.Build.VERSION.SDK_INT < 30 || Environment.isExternalStorageManager()

  private fun baseItem(c: Candidate): Map<String, Any?> = mapOf(
    "op" to "upsert",
    "path" to c.path,
    "uri" to c.uri,
    "name" to c.name,
    "folder" to c.folder,
    "ext" to c.ext,
    "mime" to c.mime,
    "kind" to c.kind,
    "size" to c.size,
    "modifiedAt" to c.modifiedAt,
    "takenAt" to c.takenAt,
    "width" to c.width,
    "height" to c.height,
    "durationMs" to c.durationMs,
    "isScreenshot" to c.isScreenshot
  )

  suspend fun process(ctx: Context, c: Candidate): Map<String, Any?> = withContext(Dispatchers.IO) {
    var width = c.width
    var height = c.height
    var durationMs = c.durationMs
    var thumbBitmap: android.graphics.Bitmap? = null
    var imageBitmap: android.graphics.Bitmap? = null

    when (c.kind) {
      "image" -> {
        if (width == null || height == null) {
          val (w, h) = Extract.imageDims(c.path)
          width = w.takeIf { it > 0 }
          height = h.takeIf { it > 0 }
        }
      }
      "video" -> {
        val (dur, frame) = Extract.videoMeta(c.path)
        durationMs = durationMs ?: dur
        thumbBitmap = frame
      }
      "audio" -> {
        durationMs = durationMs ?: Extract.audioDuration(c.path)
      }
    }

    val extracted = Extract.extract(ctx, c.path, c.ext, c.kind)
    imageBitmap = extracted.bitmapForImage
    if (thumbBitmap == null && imageBitmap != null) thumbBitmap = imageBitmap
    if (thumbBitmap == null && c.ext == "pdf") thumbBitmap = Extract.pdfPageBitmap(c.path, 0)

    val thumbnailPath = thumbBitmap?.let { Extract.saveThumb(ctx, it, c.path) }

    val chunks = extracted.textChunks.toMutableList()

    // An image chunk carries the visual embedding so photos are findable by
    // concept ("beach photo") even when OCR finds no text.
    if (c.kind == "image" && imageBitmap != null) {
      chunks += mapOf<String, Any?>("kind" to "image")
    }
    if (c.kind == "video") {
      chunks += mapOf<String, Any?>("kind" to "frame", "startMs" to (durationMs ?: 0L) / 10)
    }

    val embedded = chunks.map { chunk ->
      val vector = when (chunk["kind"]) {
        "text" -> (chunk["text"] as? String)?.takeIf { it.isNotBlank() }
          ?.let { AiState.embedder.embedText(it) }
        "image" -> imageBitmap?.let { AiState.embedder.embedImage(it) }
        "frame" -> thumbBitmap?.let { AiState.embedder.embedImage(it) }
        else -> null
      }
      if (vector != null) chunk + ("vector" to vector.map { it.toDouble() }) else chunk
    }

    baseItem(c) + mapOf(
      "width" to width,
      "height" to height,
      "durationMs" to durationMs,
      "thumbnailPath" to thumbnailPath,
      "labels" to extracted.labels,
      "chunks" to embedded
    )
  }
}
