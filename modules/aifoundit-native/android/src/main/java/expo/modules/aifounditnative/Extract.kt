package expo.modules.aifounditnative

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.pdf.PdfRenderer
import android.media.MediaMetadataRetriever
import android.os.ParcelFileDescriptor
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.label.ImageLabeling
import com.google.mlkit.vision.label.defaults.ImageLabelerOptions
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.google.android.gms.tasks.Tasks
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.zip.ZipFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object Extract {
  private const val MAX_TEXT_CHARS = 24000
  private const val CHUNK_CHARS = 1600
  private const val MAX_PDF_PAGES = 40
  private const val THUMB_DIR = "aifoundit_thumbs"

  private val textExts = setOf("txt", "md", "json", "csv", "log", "xml", "yaml", "yml", "tsv")
  private val officeTextTags = mapOf(
    "docx" to Pair("word/document.xml", Regex("<w:t[^>]*>([^<]*)</w:t>")),
    "pptx" to Pair("ppt/slides", Regex("<a:t[^>]*>([^<]*)</a:t>")),
    "xlsx" to Pair("xl/sharedStrings.xml", Regex("<t[^>]*>([^<]*)</t>"))
  )

  data class Extracted(
    val textChunks: List<Map<String, Any?>>,
    val labels: List<Map<String, Any?>>,
    val bitmapForImage: Bitmap? = null
  )

  suspend fun extract(ctx: Context, path: String, ext: String, kind: String): Extracted =
    withContext(Dispatchers.IO) {
      try {
        when {
          kind == "image" -> extractImage(path)
          ext == "pdf" -> Extracted(extractPdf(path), emptyList())
          ext in officeTextTags -> Extracted(toChunks(extractOffice(path, ext)), emptyList())
          ext in textExts -> Extracted(toChunks(readTextFile(path, MAX_TEXT_CHARS)), emptyList())
          else -> Extracted(emptyList(), emptyList())
        }
      } catch (t: Throwable) {
        Extracted(emptyList(), emptyList())
      }
    }

  private fun extractImage(path: String): Extracted {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(path, bounds)
    if (bounds.outWidth <= 0) return Extracted(emptyList(), emptyList())

    val bitmap = decodeScaled(path, bounds, maxSide = 1280) ?: return Extracted(emptyList(), emptyList())
    var ocr = ""
    var labels = emptyList<Map<String, Any?>>()

    try {
      val image = InputImage.fromBitmap(bitmap, 0)
      val result = Tasks.await(
        TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS).process(image),
        15, java.util.concurrent.TimeUnit.SECONDS
      )
      ocr = result.text.trim()
    } catch (_: Throwable) {}

    try {
      val image = InputImage.fromBitmap(bitmap, 0)
      val labeler = ImageLabeling.getClient(
        ImageLabelerOptions.Builder().setConfidenceThreshold(0.5f).build()
      )
      val result = Tasks.await(labeler.process(image), 15, java.util.concurrent.TimeUnit.SECONDS)
      labels = result.take(8).map {
        mapOf("label" to it.text, "confidence" to it.confidence.toDouble())
      }
    } catch (_: Throwable) {}

    val chunks = if (ocr.isNotEmpty()) toChunks(ocr) else emptyList()
    return Extracted(chunks, labels, bitmap)
  }

  private fun extractPdf(path: String): List<Map<String, Any?>> {
    val chunks = mutableListOf<Map<String, Any?>>()
    PDDocument.load(File(path)).use { doc ->
      val stripper = PDFTextStripper()
      val pages = minOf(doc.numberOfPages, MAX_PDF_PAGES)
      for (p in 1..pages) {
        stripper.startPage = p
        stripper.endPage = p
        val text = stripper.getText(doc).trim()
        if (text.isNotEmpty()) {
          for (piece in splitText(text)) {
            chunks += mapOf<String, Any?>("kind" to "text", "page" to p, "text" to piece)
          }
        }
      }
    }
    return chunks
  }

  private fun extractOffice(path: String, ext: String): String {
    val (entry, tag) = officeTextTags[ext] ?: return ""
    val sb = StringBuilder()
    ZipFile(path).use { zip ->
      val entries = zip.entries().asSequence().filter { it.name.startsWith(entry) && it.name.endsWith(".xml") }
      for (e in entries) {
        val xml = zip.getInputStream(e).bufferedReader().readText()
        tag.findAll(xml).forEach { m -> sb.append(m.groupValues[1]).append(' ') }
      }
    }
    return decodeEntities(sb.toString().replace(Regex("\\s+"), " ").trim()).take(MAX_TEXT_CHARS)
  }

  fun readTextFile(path: String, maxChars: Int): String =
    File(path).inputStream().bufferedReader().use { r ->
      val buf = CharArray(maxChars)
      val n = r.read(buf)
      if (n <= 0) "" else String(buf, 0, n)
    }

  private fun decodeEntities(s: String): String = s
    .replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    .replace("&quot;", "\"").replace("&apos;", "'")

  private fun toChunks(text: String): List<Map<String, Any?>> =
    splitText(text).map { mapOf<String, Any?>("kind" to "text", "text" to it) }

  private fun splitText(text: String): List<String> {
    if (text.isBlank()) return emptyList()
    val paras = text.split(Regex("\\n{2,}|\\r?\\n"))
    val out = mutableListOf<String>()
    var cur = StringBuilder()
    for (p in paras) {
      if (cur.length + p.length > CHUNK_CHARS && cur.isNotEmpty()) {
        out += cur.toString().trim()
        cur = StringBuilder()
      }
      cur.append(p).append('\n')
    }
    if (cur.isNotBlank()) out += cur.toString().trim()
    return out.filter { it.isNotBlank() }
  }

  fun decodeScaled(path: String, bounds: BitmapFactory.Options, maxSide: Int): Bitmap? {
    val longSide = maxOf(bounds.outWidth, bounds.outHeight)
    var sample = 1
    while (longSide / (sample * 2) > maxSide) sample *= 2
    val opts = BitmapFactory.Options().apply { inSampleSize = sample }
    return BitmapFactory.decodeFile(path, opts)
  }

  fun imageDims(path: String): Pair<Int, Int> {
    val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(path, o)
    return o.outWidth to o.outHeight
  }

  fun videoMeta(path: String): Pair<Long?, Bitmap?> {
    val r = MediaMetadataRetriever()
    return try {
      r.setDataSource(path)
      val dur = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()
      val frame = r.getFrameAtTime((dur ?: 0L) * 1000L / 10) ?: r.getFrameAtTime(0)
      dur to frame
    } catch (_: Throwable) {
      null to null
    } finally {
      try { r.release() } catch (_: Throwable) {}
    }
  }

  fun audioDuration(path: String): Long? {
    val r = MediaMetadataRetriever()
    return try {
      r.setDataSource(path)
      r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()
    } catch (_: Throwable) {
      null
    } finally {
      try { r.release() } catch (_: Throwable) {}
    }
  }

  fun saveThumb(ctx: Context, bitmap: Bitmap, path: String): String? {
    return try {
      val dir = File(ctx.cacheDir, THUMB_DIR).apply { mkdirs() }
      val name = sha1(path) + ".jpg"
      val out = File(dir, name)
      val maxSide = maxOf(bitmap.width, bitmap.height)
      val scaled = if (maxSide > 512) {
        val s = 512f / maxSide
        Bitmap.createScaledBitmap(bitmap, (bitmap.width * s).toInt(), (bitmap.height * s).toInt(), true)
      } else bitmap
      FileOutputStream(out).use { scaled.compress(Bitmap.CompressFormat.JPEG, 82, it) }
      out.absolutePath
    } catch (_: Throwable) {
      null
    }
  }

  fun pdfPageBitmap(path: String, page: Int): Bitmap? {
    return try {
      val pfd = ParcelFileDescriptor.open(File(path), ParcelFileDescriptor.MODE_READ_ONLY)
      PdfRenderer(pfd).use { renderer ->
        val idx = page.coerceIn(0, renderer.pageCount - 1)
        renderer.openPage(idx).use { p ->
          val bmp = Bitmap.createBitmap(p.width * 2, p.height * 2, Bitmap.Config.ARGB_8888)
          p.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
          bmp
        }
      }
    } catch (_: Throwable) {
      null
    }
  }

  private fun sha1(s: String): String =
    MessageDigest.getInstance("SHA-1").digest(s.toByteArray())
      .joinToString("") { "%02x".format(it) }
}
