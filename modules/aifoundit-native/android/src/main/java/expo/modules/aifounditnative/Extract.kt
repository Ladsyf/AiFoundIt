package expo.modules.aifounditnative

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.pdf.PdfRenderer
import android.media.ExifInterface
import android.media.MediaMetadataRetriever
import android.os.Build
import android.os.ParcelFileDescriptor
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.label.ImageLabeling
import com.google.mlkit.vision.label.defaults.ImageLabelerOptions
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import java.util.zip.ZipFile

object Extract {
  private const val MAX_TEXT_CHARS = 24000
  private const val MAX_PDF_PAGES = 40
  private const val OCR_PDF_PAGES = 3
  private const val MIN_PDF_TEXT_CHARS = 24
  private const val MAX_ENTRY_BYTES = 12L * 1024 * 1024
  private const val THUMB_DIR = "aifoundit_thumbs"

  private val textExts = setOf("txt", "md", "csv", "log", "yaml", "yml", "tsv", "json")

  // ML Kit clients are thread-safe and expensive to create, so they are shared by every file.
  private val recognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }
  private val labeler by lazy {
    ImageLabeling.getClient(ImageLabelerOptions.Builder().setConfidenceThreshold(0.5f).build())
  }

  @Volatile private var pdfBoxReady = false

  data class Extracted(
    val textChunks: List<Map<String, Any?>>,
    val labels: List<Map<String, Any?>>,
    val bitmapForImage: Bitmap? = null,
    val error: String? = null
  )

  data class VideoFrame(val atMs: Long, val bitmap: Bitmap)

  /** Blocking: call it from an IO thread. Failures come back in [Extracted.error] instead of being swallowed. */
  fun extract(ctx: Context, path: String, ext: String, kind: String): Extracted {
    return try {
      when {
        kind == "image" -> extractImage(path)
        ext == "pdf" -> extractPdf(ctx, path)
        ext == "docx" -> fromZip(path, "word/document.xml") { TextExtractors.docxText(it) }
        ext == "xlsx" -> fromZip(path, "xl/sharedStrings.xml") { TextExtractors.xlsxText(it) }
        ext == "odt" || ext == "ods" || ext == "odp" -> fromZip(path, "content.xml") { TextExtractors.odtText(it) }
        ext == "pptx" -> fromZipMany(path, { it.startsWith("ppt/slides/slide") && it.endsWith(".xml") }) {
          TextExtractors.pptxText(it)
        }
        ext == "epub" -> fromZipMany(path, { it.endsWith(".xhtml") || it.endsWith(".html") || it.endsWith(".htm") }) {
          TextExtractors.htmlText(it)
        }
        ext == "html" || ext == "htm" -> textOnly(TextExtractors.htmlText(readTextFile(path, MAX_TEXT_CHARS * 3)))
        ext == "rtf" -> textOnly(TextExtractors.rtfText(readTextFile(path, MAX_TEXT_CHARS * 3)))
        ext == "xml" -> textOnly(TextExtractors.xmlPlain(readTextFile(path, MAX_TEXT_CHARS * 3)))
        ext in textExts -> textOnly(readTextFile(path, MAX_TEXT_CHARS))
        else -> Extracted(emptyList(), emptyList())
      }
    } catch (t: Throwable) {
      Extracted(emptyList(), emptyList(), null, t.javaClass.simpleName + ": " + (t.message ?: ""))
    }
  }

  private fun textOnly(text: String): Extracted = Extracted(toChunks(text.take(MAX_TEXT_CHARS)), emptyList())

  private fun toChunks(text: String): List<Map<String, Any?>> =
    Chunker.split(text).map { mapOf<String, Any?>("kind" to "text", "text" to it) }

  private fun fromZip(path: String, entry: String, transform: (String) -> String): Extracted {
    ZipFile(path).use { zip ->
      val e = zip.getEntry(entry) ?: return Extracted(emptyList(), emptyList(), null, "missing " + entry)
      val xml = zip.getInputStream(e).use { readCapped(it, MAX_ENTRY_BYTES) }
      return textOnly(transform(xml))
    }
  }

  private fun fromZipMany(path: String, accept: (String) -> Boolean, transform: (String) -> String): Extracted {
    ZipFile(path).use { zip ->
      val names = zip.entries().asSequence()
        .map { it.name }
        .filter(accept)
        .sortedWith(compareBy<String>({ it.length }, { it }))
        .toList()
      val sb = StringBuilder()
      for (n in names) {
        if (sb.length >= MAX_TEXT_CHARS) break
        val e = zip.getEntry(n) ?: continue
        val text = transform(zip.getInputStream(e).use { readCapped(it, MAX_ENTRY_BYTES) })
        if (text.isNotBlank()) sb.append(text).append('\n')
      }
      return textOnly(sb.toString())
    }
  }

  private fun readCapped(input: InputStream, maxBytes: Long): String {
    val out = ByteArrayOutputStream()
    val buf = ByteArray(64 * 1024)
    var total = 0L
    while (total < maxBytes) {
      val want = minOf(buf.size.toLong(), maxBytes - total).toInt()
      val n = input.read(buf, 0, want)
      if (n < 0) break
      out.write(buf, 0, n)
      total += n
    }
    return out.toString("UTF-8")
  }

  fun readTextFile(path: String, maxChars: Int): String =
    File(path).inputStream().bufferedReader().use { r ->
      val buf = CharArray(maxChars)
      var n = 0
      while (n < maxChars) {
        val k = r.read(buf, n, maxChars - n)
        if (k < 0) break
        n += k
      }
      String(buf, 0, n)
    }

  // ---- images ----

  private fun extractImage(path: String): Extracted {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(path, bounds)
    if (bounds.outWidth <= 0) return Extracted(emptyList(), emptyList(), null, "could not decode image")
    val bitmap = decodeScaled(path, bounds, 1280)
      ?: return Extracted(emptyList(), emptyList(), null, "could not decode image")

    var ocr = ""
    var labels: List<Map<String, Any?>> = emptyList()
    try {
      ocr = ocrText(bitmap)
    } catch (_: Throwable) {
    }
    try {
      labels = imageLabels(bitmap)
    } catch (_: Throwable) {
    }
    return Extracted(if (ocr.isNotEmpty()) toChunks(ocr) else emptyList(), labels, bitmap)
  }

  private fun ocrText(bitmap: Bitmap): String =
    Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap, 0)), 20, TimeUnit.SECONDS).text.trim()

  private fun imageLabels(bitmap: Bitmap): List<Map<String, Any?>> =
    Tasks.await(labeler.process(InputImage.fromBitmap(bitmap, 0)), 20, TimeUnit.SECONDS)
      .take(8)
      .map { mapOf<String, Any?>("label" to it.text, "confidence" to it.confidence.toDouble()) }

  private fun exifRotation(path: String): Int {
    return try {
      when (ExifInterface(path).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
        ExifInterface.ORIENTATION_ROTATE_90 -> 90
        ExifInterface.ORIENTATION_ROTATE_180 -> 180
        ExifInterface.ORIENTATION_ROTATE_270 -> 270
        else -> 0
      }
    } catch (_: Throwable) {
      0
    }
  }

  /** Decodes at most [maxSide] pixels on the long edge and turns the picture upright using its EXIF tag. */
  fun decodeScaled(path: String, bounds: BitmapFactory.Options, maxSide: Int): Bitmap? {
    val longSide = maxOf(bounds.outWidth, bounds.outHeight)
    var sample = 1
    while (longSide / (sample * 2) > maxSide) sample *= 2
    val opts = BitmapFactory.Options().apply { inSampleSize = sample }
    val bmp = BitmapFactory.decodeFile(path, opts) ?: return null
    val degrees = exifRotation(path)
    if (degrees == 0) return bmp
    val m = Matrix().apply { postRotate(degrees.toFloat()) }
    return try {
      Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
    } catch (_: Throwable) {
      bmp
    }
  }

  fun imageDims(path: String): Pair<Int, Int> {
    val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(path, o)
    return o.outWidth to o.outHeight
  }

  // ---- PDF ----

  @Synchronized
  private fun ensurePdfBox(ctx: Context) {
    if (!pdfBoxReady) {
      PDFBoxResourceLoader.init(ctx.applicationContext)
      pdfBoxReady = true
    }
  }

  private fun extractPdf(ctx: Context, path: String): Extracted {
    ensurePdfBox(ctx)
    val chunks = ArrayList<Map<String, Any?>>()
    var error: String? = null
    try {
      PDDocument.load(File(path)).use { doc ->
        val stripper = PDFTextStripper()
        val pages = minOf(doc.numberOfPages, MAX_PDF_PAGES)
        for (p in 1..pages) {
          stripper.startPage = p
          stripper.endPage = p
          val text = stripper.getText(doc).trim()
          for (piece in Chunker.split(text)) {
            chunks.add(mapOf<String, Any?>("kind" to "text", "page" to p, "text" to piece))
          }
        }
      }
    } catch (t: Throwable) {
      error = "pdf: " + (t.message ?: t.javaClass.simpleName)
    }

    // A scanned PDF has no text layer: read the first pages with OCR instead.
    val chars = chunks.sumOf { (it["text"] as? String)?.length ?: 0 }
    if (chars < MIN_PDF_TEXT_CHARS) {
      for (p in 0 until OCR_PDF_PAGES) {
        val bmp = pdfPageBitmap(path, p, 1600) ?: break
        val text = try {
          ocrText(bmp)
        } catch (_: Throwable) {
          ""
        }
        bmp.recycle()
        for (piece in Chunker.split(text)) {
          chunks.add(mapOf<String, Any?>("kind" to "text", "page" to p + 1, "text" to piece))
        }
      }
      if (chunks.isNotEmpty()) error = null
    }
    return Extracted(chunks, emptyList(), null, error)
  }

  /** Renders one PDF page on a white background, at most [maxSide] pixels on the long edge. */
  fun pdfPageBitmap(path: String, page: Int, maxSide: Int = 1024): Bitmap? {
    return try {
      ParcelFileDescriptor.open(File(path), ParcelFileDescriptor.MODE_READ_ONLY).use { pfd ->
        PdfRenderer(pfd).use { renderer ->
          if (page < 0 || page >= renderer.pageCount) return null
          renderer.openPage(page).use { p ->
            val scale = minOf(2f, maxSide.toFloat() / maxOf(p.width, p.height))
            val w = maxOf(1, (p.width * scale).toInt())
            val h = maxOf(1, (p.height * scale).toInt())
            val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            bmp.eraseColor(Color.WHITE)
            p.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            bmp
          }
        }
      }
    } catch (_: Throwable) {
      null
    }
  }

  // ---- video and audio ----

  fun videoMeta(path: String): Pair<Long?, Bitmap?> {
    val r = MediaMetadataRetriever()
    return try {
      r.setDataSource(path)
      val dur = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()
      val frame = r.getFrameAtTime((dur ?: 0L) * 1000L / 10) ?: r.getFrameAtTime(0)
      Pair(dur, frame)
    } catch (_: Throwable) {
      Pair(null, null)
    } finally {
      try {
        r.release()
      } catch (_: Throwable) {
      }
    }
  }

  /** Up to [maxFrames] small frames spread over the video, each with its position, for moment search. */
  fun videoFrames(path: String, durationMs: Long?, maxFrames: Int = 12, side: Int = 384): List<VideoFrame> {
    val dur = durationMs ?: return emptyList()
    if (dur <= 0L) return emptyList()
    val out = ArrayList<VideoFrame>()
    val r = MediaMetadataRetriever()
    try {
      r.setDataSource(path)
      val step = maxOf(5000L, dur / maxFrames)
      var t = step / 2
      while (t < dur && out.size < maxFrames) {
        val bmp = if (Build.VERSION.SDK_INT >= 27) {
          r.getScaledFrameAtTime(t * 1000L, MediaMetadataRetriever.OPTION_CLOSEST_SYNC, side, side)
        } else {
          r.getFrameAtTime(t * 1000L, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
        }
        if (bmp != null) out.add(VideoFrame(t, bmp))
        t += step
      }
    } catch (_: Throwable) {
    } finally {
      try {
        r.release()
      } catch (_: Throwable) {
      }
    }
    return out
  }

  fun audioDuration(path: String): Long? {
    val r = MediaMetadataRetriever()
    return try {
      r.setDataSource(path)
      r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()
    } catch (_: Throwable) {
      null
    } finally {
      try {
        r.release()
      } catch (_: Throwable) {
      }
    }
  }

  // ---- thumbnails ----

  fun saveThumb(ctx: Context, bitmap: Bitmap, path: String): String? {
    return try {
      val dir = File(ctx.cacheDir, THUMB_DIR).apply { mkdirs() }
      val out = File(dir, sha1(path) + ".jpg")
      val maxSide = maxOf(bitmap.width, bitmap.height)
      val scaled = if (maxSide > 512) {
        val s = 512f / maxSide
        Bitmap.createScaledBitmap(bitmap, maxOf(1, (bitmap.width * s).toInt()), maxOf(1, (bitmap.height * s).toInt()), true)
      } else {
        bitmap
      }
      FileOutputStream(out).use { scaled.compress(Bitmap.CompressFormat.JPEG, 82, it) }
      out.absolutePath
    } catch (_: Throwable) {
      null
    }
  }

  private fun sha1(s: String): String =
    MessageDigest.getInstance("SHA-1").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }
}
