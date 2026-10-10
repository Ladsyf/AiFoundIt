package expo.modules.aifounditnative

import android.Manifest
import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.PowerManager
import android.provider.MediaStore
import android.util.Log
import java.io.File
import java.util.concurrent.Executors
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext

private const val TAG = "AiFoundIt"
private const val MAX_WALK_DIRS = 60000
private const val MAX_WALK_DEPTH = 14
private const val IN_FLIGHT = 4
private const val VIDEO_DUPLICATE = 0.95f

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

  /** [incompleteKinds] lists the kinds (image, video, audio, doc) that could not be listed completely this time. */
  private class Enumeration(val candidates: List<Candidate>, val incompleteKinds: Set<String>)

  private class Prepared(
    val c: Candidate,
    val width: Int?,
    val height: Int?,
    val durationMs: Long?,
    val thumbnailPath: String?,
    val labels: List<Map<String, Any?>>,
    val textChunks: List<Map<String, Any?>>,
    val image: Bitmap?,
    val frames: List<Extract.VideoFrame>,
    val error: String?
  )

  private val docKinds = mapOf(
    "pdf" to "pdf",
    "doc" to "doc", "docx" to "doc", "ppt" to "doc", "pptx" to "doc", "xls" to "doc", "xlsx" to "doc",
    "rtf" to "doc", "odt" to "doc", "ods" to "doc", "odp" to "doc", "epub" to "doc",
    "txt" to "text", "md" to "text", "csv" to "text", "html" to "text", "htm" to "text",
    "json" to "text", "xml" to "text", "yaml" to "text", "yml" to "text", "tsv" to "text", "log" to "text"
  )

  // Config-like files are everywhere on a phone. They are indexed only inside the priority folders.
  private val noisyExts = setOf("json", "xml", "yaml", "yml", "tsv", "log")

  private val imageExts = setOf("jpg", "jpeg", "png", "webp", "gif", "bmp", "heic", "heif", "avif", "dng")
  private val videoExts = setOf("mp4", "mkv", "mov", "3gp", "webm", "avi", "m4v")
  private val audioExts = setOf("mp3", "m4a", "aac", "wav", "ogg", "oga", "opus", "flac", "amr", "awb", "wma", "mid")

  // Decoding and OCR run on a few threads while one consumer embeds on the GPU thread.
  private val workers: CoroutineDispatcher = Executors.newFixedThreadPool(3) { r ->
    Thread(r, "aifoundit-extract").apply { isDaemon = true }
  }.asCoroutineDispatcher()

  private fun fingerprint(c: Candidate) = "${c.size}:${c.modifiedAt}"

  private fun kindOf(path: String): String {
    val ext = path.substringAfterLast('.', "").lowercase()
    return when {
      ext in imageExts -> "image"
      ext in videoExts -> "video"
      ext in audioExts -> "audio"
      else -> "doc"
    }
  }

  private fun hasAllFilesAccess(): Boolean =
    Build.VERSION.SDK_INT < 30 || Environment.isExternalStorageManager()

  private fun granted(ctx: Context, permission: String) =
    ctx.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

  /** Full access to this kind of media. A partial photo grant (Android 14) lists some files but not all. */
  private fun canReadMedia(ctx: Context, kind: String): Boolean {
    if (Build.VERSION.SDK_INT >= 33) {
      val permission = when (kind) {
        "image" -> Manifest.permission.READ_MEDIA_IMAGES
        "video" -> Manifest.permission.READ_MEDIA_VIDEO
        else -> Manifest.permission.READ_MEDIA_AUDIO
      }
      return granted(ctx, permission)
    }
    return granted(ctx, Manifest.permission.READ_EXTERNAL_STORAGE)
  }

  private fun hasPartialPhotoAccess(ctx: Context): Boolean =
    Build.VERSION.SDK_INT >= 34 && granted(ctx, Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)

  private fun relTo(root: File, dir: File?): String =
    dir?.relativeToOrSelf(root)?.path?.replace(Char(92), '/')?.trim('/') ?: ""

  /** Hidden folders (".thumbnails", ".Statuses") hold app caches, not things people look for. */
  private fun isHidden(rel: String): Boolean = rel.split('/').any { it.startsWith(".") && it.length > 1 }

  /** The folder of a file path, relative to the storage root ("DCIM/Camera"). */
  internal fun folderOfPath(root: File, path: String): String = relTo(root, File(path).parentFile)

  internal fun skipFolder(rel: String, cfg: ScanCfg): Boolean {
    if (isHidden(rel)) return true
    if (ScanRules.isExcluded(rel, cfg.excludes)) return true
    if (cfg.mode == "selected" && cfg.includeRoots.isNotEmpty() && !ScanRules.isUnder(rel, cfg.includeRoots)) return true
    return false
  }

  private fun mimeFor(ext: String): String = when (ext) {
    "pdf" -> "application/pdf"
    "doc", "docx" -> "application/msword"
    "xls", "xlsx" -> "application/vnd.ms-excel"
    "ppt", "pptx" -> "application/vnd.ms-powerpoint"
    "txt", "md", "log" -> "text/plain"
    "json" -> "application/json"
    "csv", "tsv" -> "text/csv"
    "html", "htm" -> "text/html"
    "epub" -> "application/epub+zip"
    else -> "application/octet-stream"
  }

  // ---- listing files ----

  private fun enumerate(ctx: Context, cfg: ScanCfg): Enumeration {
    val found = LinkedHashMap<String, Candidate>()
    val incomplete = HashSet<String>()

    fun media(enabled: Boolean, uri: Uri, kind: String) {
      if (!enabled) return
      if (!canReadMedia(ctx, kind) && !(kind != "audio" && hasPartialPhotoAccess(ctx))) {
        incomplete.add(kind)
        return
      }
      if (kind != "audio" && !canReadMedia(ctx, kind)) incomplete.add(kind)
      if (!queryMedia(ctx, cfg, uri, kind, found)) incomplete.add(kind)
    }
    media(cfg.images, MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image")
    media(cfg.video, MediaStore.Video.Media.EXTERNAL_CONTENT_URI, "video")
    media(cfg.audio, MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, "audio")

    if (cfg.documents) {
      val ok = if (hasAllFilesAccess()) {
        if (Build.VERSION.SDK_INT < 30 && !granted(ctx, Manifest.permission.READ_EXTERNAL_STORAGE)) false
        else walkDocuments(cfg, found)
      } else {
        queryDocuments(ctx, cfg, found)
        false
      }
      if (!ok) incomplete.add("doc")
    }
    return Enumeration(found.values.toList(), incomplete)
  }

  private fun queryMedia(
    ctx: Context,
    cfg: ScanCfg,
    uri: Uri,
    kind: String,
    out: MutableMap<String, Candidate>
  ): Boolean {
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
    return try {
      val cursor = ctx.contentResolver.query(uri, proj, null, null, null) ?: return false
      cursor.use { c ->
        while (c.moveToNext()) {
          val path = c.getString(1) ?: continue
          val rel = (c.getString(3) ?: "").trimEnd('/')
          if (skipFolder(rel, cfg)) continue
          val size = c.getLong(4)
          if (kind == "image" && cfg.minImageBytes > 0 && size < cfg.minImageBytes) continue
          if (!File(path).exists()) continue
          val id = c.getLong(0)
          out[path] = Candidate(
            path = path,
            uri = ContentUris.withAppendedId(uri, id).toString(),
            name = c.getString(2) ?: File(path).name,
            folder = if (rel.isEmpty()) "/" else "/" + rel,
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
      true
    } catch (t: Throwable) {
      Log.w(TAG, "media query failed for " + kind + ": " + t.message)
      false
    }
  }

  /** Without All files access MediaStore only reveals a few documents; the scan is then marked incomplete. */
  private fun queryDocuments(ctx: Context, cfg: ScanCfg, out: MutableMap<String, Candidate>) {
    try {
      val filesUri = MediaStore.Files.getContentUri("external")
      val proj = arrayOf(
        MediaStore.MediaColumns._ID,
        MediaStore.MediaColumns.DATA,
        MediaStore.MediaColumns.DISPLAY_NAME,
        MediaStore.MediaColumns.RELATIVE_PATH,
        MediaStore.MediaColumns.SIZE,
        MediaStore.MediaColumns.DATE_MODIFIED,
        MediaStore.MediaColumns.MIME_TYPE
      )
      ctx.contentResolver.query(filesUri, proj, null, null, null)?.use { c ->
        while (c.moveToNext()) {
          val path = c.getString(1) ?: continue
          val ext = File(path).extension.lowercase()
          val kind = docKinds[ext] ?: continue
          val rel = (c.getString(3) ?: "").trimEnd('/')
          if (skipFolder(rel, cfg)) continue
          if (ext in noisyExts && ScanRules.rootIndex(rel, cfg.includeRoots) < 0) continue
          val size = c.getLong(4)
          if (cfg.maxDocBytes > 0 && size > cfg.maxDocBytes) continue
          if (!File(path).exists()) continue
          out[path] = Candidate(
            path = path,
            uri = ContentUris.withAppendedId(filesUri, c.getLong(0)).toString(),
            name = c.getString(2) ?: File(path).name,
            folder = if (rel.isEmpty()) "/" else "/" + rel,
            ext = ext,
            mime = c.getString(6) ?: "",
            kind = kind,
            size = size,
            modifiedAt = c.getLong(5) * 1000L
          )
        }
      }
    } catch (t: Throwable) {
      Log.w(TAG, "documents query failed: " + t.message)
    }
  }

  /** Walks the whole storage (or only the chosen folders). Returns false when it had to stop early. */
  private fun walkDocuments(cfg: ScanCfg, out: MutableMap<String, Candidate>): Boolean {
    val root = Environment.getExternalStorageDirectory() ?: return false
    val starts = if (cfg.mode == "selected" && cfg.includeRoots.isNotEmpty()) {
      cfg.includeRoots.map { File(root, it) }
    } else {
      listOf(root)
    }
    var dirs = 0
    var complete = true
    for (start in starts) {
      if (!start.exists()) continue
      start.walkTopDown()
        .maxDepth(MAX_WALK_DEPTH)
        .onFail { _, _ -> complete = false }
        .onEnter { dir ->
          if (dir == root || dir == start) return@onEnter true
          if (cfg.respectNomedia && File(dir, ".nomedia").exists()) return@onEnter false
          val rel = relTo(root, dir)
          if (skipFolder(rel, cfg)) return@onEnter false
          if (dir.parentFile == root && dir.name.equals("lost+found", ignoreCase = true)) return@onEnter false
          if (++dirs > MAX_WALK_DIRS) {
            complete = false
            return@onEnter false
          }
          true
        }
        .filter { it.isFile }
        .forEach { f ->
          if (AiState.cancelled.get()) return@forEach
          val ext = f.extension.lowercase()
          val kind = docKinds[ext] ?: return@forEach
          val rel = relTo(root, f.parentFile)
          if (ext in noisyExts && ScanRules.rootIndex(rel, cfg.includeRoots) < 0) return@forEach
          val size = f.length()
          if (size <= 0L || (cfg.maxDocBytes > 0 && size > cfg.maxDocBytes)) return@forEach
          val path = f.absolutePath
          if (out.containsKey(path)) return@forEach
          out[path] = Candidate(
            path = path,
            uri = "file://" + path,
            name = f.name,
            folder = "/" + rel,
            ext = ext,
            mime = mimeFor(ext),
            kind = kind,
            size = size,
            modifiedAt = f.lastModified()
          )
        }
    }
    return complete
  }

  // ---- running a scan ----

  suspend fun runScan(emit: (Map<String, Any?>) -> Unit) = withContext(Dispatchers.IO) {
    if (!AiState.running.compareAndSet(false, true)) return@withContext
    AiState.cancelled.set(false)
    AiState.failed = 0
    AiState.done = 0
    AiState.total = 0
    try {
      val ctx = AiState.ctx
      val cfg = AiState.scanCfg
      val listing = enumerate(ctx, cfg)
      val seen = AiState.inbox.seenFingerprints()
      val byPath = listing.candidates.associateBy { it.path }

      // Priority folders first, then everything but videos (they cost the most to embed), newest first.
      val changed = listing.candidates
        .filter { seen[it.path] != fingerprint(it) }
        .sortedWith(
          compareBy<Candidate> { ScanRules.priority(it.folder, cfg.includeRoots) }
            .thenBy { it.kind == "video" }
            .thenByDescending { it.modifiedAt }
        )

      AiState.total = changed.size
      emit(mapOf("done" to 0, "total" to changed.size, "current" to ""))
      processAll(ctx, changed, emit)

      if (!AiState.cancelled.get()) {
        // Files in a folder that is skipped now are forgotten for sure: a rule hid them, the listing did not fail.
        // That also lets them be indexed again if the rule is removed later.
        val root = Environment.getExternalStorageDirectory()
        val hidden = if (root == null) emptyList() else seen.keys.filter {
          it !in byPath && skipFolder(folderOfPath(root, it), cfg)
        }
        for (p in hidden) AiState.inbox.stageDelete(p)

        // Any other file counts as deleted only when its kind was listed completely and the list looks sane.
        val hiddenSet = hidden.toHashSet()
        val gone = seen.keys.filter { it !in byPath && it !in hiddenSet && kindOf(it) !in listing.incompleteKinds }
        val suspicious = gone.size > 100 && gone.size * 10 > seen.size * 6
        if (suspicious) {
          Log.w(TAG, "skipping " + gone.size + " deletions: the listing shrank too much to trust")
        } else {
          for (p in gone) AiState.inbox.stageDelete(p)
        }
      }
    } finally {
      AiState.running.set(false)
    }
  }

  private suspend fun processAll(
    ctx: Context,
    items: List<Candidate>,
    emit: (Map<String, Any?>) -> Unit
  ) = coroutineScope {
    val window = ArrayDeque<Deferred<Prepared>>()
    var lastEmit = 0L
    // Timing of the stages, logged every 25 files so a slow scan can be explained.
    val prepareNanos = java.util.concurrent.atomic.AtomicLong(0L)
    var finishNanos = 0L
    var batchStart = System.currentTimeMillis()

    suspend fun consumeOne() {
      val p = window.removeFirst().await()
      val finishStarted = System.nanoTime()
      val item = try {
        finish(p)
      } catch (t: Throwable) {
        Log.w(TAG, "indexing failed for " + p.c.path + ": " + t.message)
        baseItem(p.c) + mapOf("error" to (t.message ?: "indexing failed"), "chunks" to emptyList<Map<String, Any?>>())
      }
      finishNanos += System.nanoTime() - finishStarted
      if (item["error"] != null) AiState.failed++
      AiState.inbox.stage(item, fingerprint(p.c))
      AiState.done++
      val now = System.currentTimeMillis()
      if (AiState.done % 25 == 0) {
        val seconds = (now - batchStart) / 1000.0
        Log.i(
          TAG,
          "scan " + AiState.done + "/" + AiState.total + ": " + String.format("%.2f", 25 / seconds) +
            " files/s, decode+OCR avg " + (prepareNanos.getAndSet(0L) / 25_000_000L) + " ms, embed avg " +
            (finishNanos / 25_000_000L) + " ms"
        )
        finishNanos = 0L
        batchStart = now
      }
      if (now - lastEmit > 150L || AiState.done == AiState.total) {
        lastEmit = now
        emit(mapOf("done" to AiState.done, "total" to AiState.total, "current" to p.c.name))
      }
    }

    for (c in items) {
      ensureActive()
      if (AiState.cancelled.get()) break
      coolDown(ctx)
      window.addLast(
        async(workers) {
          val prepareStarted = System.nanoTime()
          prepare(ctx, c).also { prepareNanos.addAndGet(System.nanoTime() - prepareStarted) }
        }
      )
      if (window.size >= IN_FLIGHT) consumeOne()
    }
    while (window.isNotEmpty()) {
      if (AiState.cancelled.get()) {
        window.forEach { it.cancel() }
        break
      }
      consumeOne()
    }
  }

  private var lastCoolLog = 0L

  /**
   * Lets a hot phone cool down. Sustained picture embedding heats the chip, and past a point Android throttles
   * everything (a Galaxy S22+ fell from 1 file per second to 0.3 once it reported "severe"). So the scan eases
   * off when Android reports thermal stress, and waits a few seconds at a time while it is severe.
   */
  private suspend fun coolDown(ctx: Context) {
    if (Build.VERSION.SDK_INT < 29) return
    val pm = ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
    var rounds = 0
    while (pm.currentThermalStatus >= PowerManager.THERMAL_STATUS_SEVERE && rounds < 12 && !AiState.cancelled.get()) {
      val now = System.currentTimeMillis()
      if (now - lastCoolLog > 30_000L) {
        lastCoolLog = now
        Log.i(TAG, "phone is hot (thermal status " + pm.currentThermalStatus + "): pausing the scan to let it cool")
      }
      delay(5_000L)
      rounds++
    }
    if (pm.currentThermalStatus >= PowerManager.THERMAL_STATUS_MODERATE) delay(400L)
  }

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

  /** Decoding, OCR, labels and text extraction. Runs on the worker threads. */
  private fun prepare(ctx: Context, c: Candidate): Prepared {
    var width = c.width
    var height = c.height
    var duration = c.durationMs
    var thumb: Bitmap? = null
    var frames: List<Extract.VideoFrame> = emptyList()

    when (c.kind) {
      "image" -> if (width == null || height == null) {
        val (w, h) = Extract.imageDims(c.path)
        width = w.takeIf { it > 0 }
        height = h.takeIf { it > 0 }
      }
      "video" -> {
        val (dur, frame) = Extract.videoMeta(c.path)
        duration = duration ?: dur
        thumb = frame
        frames = Extract.videoFrames(c.path, duration)
      }
      "audio" -> duration = duration ?: Extract.audioDuration(c.path)
    }

    val ex = Extract.extract(ctx, c.path, c.ext, c.kind)
    val image = ex.bitmapForImage
    if (thumb == null && image != null) thumb = image
    if (thumb == null && c.ext == "pdf") thumb = Extract.pdfPageBitmap(c.path, 0, 512)
    val thumbPath = thumb?.let { Extract.saveThumb(ctx, it, c.path) }

    return Prepared(c, width, height, duration, thumbPath, ex.labels, ex.textChunks, image, frames, ex.error)
  }

  private fun cosine(a: FloatArray, b: FloatArray): Float {
    var dot = 0f
    val n = minOf(a.size, b.size)
    for (i in 0 until n) dot += a[i] * b[i]
    return dot
  }

  /** Embeds on the GPU thread and builds the inbox row. */
  private suspend fun finish(p: Prepared): Map<String, Any?> {
    val chunks = ArrayList<Map<String, Any?>>()

    for (t in p.textChunks) {
      val text = t["text"] as? String
      val v = if (!text.isNullOrBlank()) AiState.embedder.embedText(text) else null
      chunks.add(if (v != null) t + ("vector" to v.map { it.toDouble() }) else t)
    }

    // The image chunk carries the picture's own vector, so "beach photo" works when OCR finds no text.
    val image = p.image
    if (image != null) {
      val v = AiState.embedder.embedImage(image)
      if (v != null) chunks.add(mapOf("kind" to "image", "vector" to v.map { it.toDouble() }))
    }

    // Video moments: one vector per distinct frame, with its position in the video.
    var previous: FloatArray? = null
    var previousSignature: IntArray? = null
    for (f in p.frames) {
      val signature = FrameSignature.of(f.bitmap)
      val last = previousSignature
      if (last != null && FrameSignature.meanAbsDiff(last, signature) < FrameSignature.SAME_FRAME) continue
      val v = AiState.embedder.embedImage(f.bitmap) ?: continue
      val prev = previous
      if (prev != null && cosine(prev, v) > VIDEO_DUPLICATE) continue
      previous = v
      previousSignature = signature
      chunks.add(mapOf("kind" to "frame", "startMs" to f.atMs, "vector" to v.map { it.toDouble() }))
    }

    val item = baseItem(p.c) + mapOf(
      "width" to p.width,
      "height" to p.height,
      "durationMs" to p.durationMs,
      "thumbnailPath" to p.thumbnailPath,
      "labels" to p.labels,
      "chunks" to chunks
    )
    return if (p.error != null) item + ("error" to p.error) else item
  }
}
