package expo.modules.aifounditnative

import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL

/** A download failure that retrying will not fix. [code] is AUTH, NOT_FOUND, HTTP or CANCELLED. */
class DownloadError(val code: String, message: String) : IOException(message)

/**
 * Resumable HTTP download with no Android dependencies, so it is unit-tested on the JVM.
 *
 * Redirects are followed by hand: the Authorization header goes to the original host only
 * (Hugging Face redirects to a signed CDN URL that rejects a second auth mechanism).
 * A plain [IOException] means the network failed and the caller may resume from the part file;
 * a [DownloadError] means retrying is pointless.
 */
object HttpDownloader {
  private const val BUFFER = 256 * 1024
  private const val MAX_HOPS = 8
  private val CONTENT_RANGE = Regex("""bytes\s+(\d+)-(\d+)/(\d+|\*)""")
  private val CONTENT_RANGE_UNSATISFIED = Regex("""bytes\s+\*/(\d+)""")

  fun download(
    urls: List<String>,
    part: File,
    token: String?,
    isCancelled: () -> Boolean,
    onProgress: (bytes: Long, total: Long) -> Unit,
    open: (URL) -> HttpURLConnection = { it.openConnection() as HttpURLConnection },
  ): Long {
    var notFound: DownloadError? = null
    for (url in urls) {
      try {
        return downloadFrom(url, part, token, isCancelled, onProgress, open)
      } catch (e: DownloadError) {
        if (e.code == "NOT_FOUND") notFound = e else throw e
      }
    }
    throw notFound ?: DownloadError("HTTP", "no download url")
  }

  private fun downloadFrom(
    url: String,
    part: File,
    token: String?,
    isCancelled: () -> Boolean,
    onProgress: (Long, Long) -> Unit,
    open: (URL) -> HttpURLConnection,
  ): Long {
    val originHost = URL(url).host
    var current = URL(url)
    var offset = if (part.exists()) part.length() else 0L
    var hops = 0

    while (true) {
      if (isCancelled()) throw DownloadError("CANCELLED", "stopped")
      val conn = open(current)
      try {
        conn.instanceFollowRedirects = false
        conn.connectTimeout = 20_000
        conn.readTimeout = 30_000
        conn.setRequestProperty("User-Agent", "AiFoundIt/1.0")
        conn.setRequestProperty("Accept-Encoding", "identity")
        if (!token.isNullOrBlank() && current.host.equals(originHost, ignoreCase = true)) {
          conn.setRequestProperty("Authorization", "Bearer $token")
        }
        if (offset > 0) conn.setRequestProperty("Range", "bytes=$offset-")

        val code = conn.responseCode
        when (code) {
          301, 302, 303, 307, 308 -> {
            val location = conn.getHeaderField("Location") ?: throw DownloadError("HTTP", "redirect without a location")
            if (++hops > MAX_HOPS) throw DownloadError("HTTP", "too many redirects")
            current = URL(current, location)
            continue
          }
          401, 403 -> throw DownloadError("AUTH", "HTTP $code")
          404 -> throw DownloadError("NOT_FOUND", "HTTP 404")
          416 -> {
            // The saved part is at or beyond the end: complete, or stale. Keep it only if it is the full size.
            val size = conn.getHeaderField("Content-Range")
              ?.let { CONTENT_RANGE_UNSATISFIED.find(it)?.groupValues?.get(1)?.toLongOrNull() }
            if (size != null && size == offset) return offset
            part.delete()
            offset = 0
            continue
          }
          200, 206 -> {
            val total: Long
            if (code == 206) {
              val m = conn.getHeaderField("Content-Range")?.let { CONTENT_RANGE.find(it) }
              val start = m?.groupValues?.get(1)?.toLongOrNull()
              total = m?.groupValues?.get(3)?.toLongOrNull() ?: -1L
              if (start != offset) {
                part.delete()
                offset = 0
                continue
              }
            } else {
              if (offset > 0) {
                part.delete()
                offset = 0
              }
              total = conn.contentLengthLong
            }
            return copyBody(conn, part, offset, total, isCancelled, onProgress)
          }
          else -> throw DownloadError("HTTP", "HTTP $code")
        }
      } finally {
        conn.disconnect()
      }
    }
  }

  private fun copyBody(
    conn: HttpURLConnection,
    part: File,
    offset: Long,
    total: Long,
    isCancelled: () -> Boolean,
    onProgress: (Long, Long) -> Unit,
  ): Long {
    part.parentFile?.mkdirs()
    val buffer = ByteArray(BUFFER)
    var done = offset
    var lastReport = 0L
    conn.inputStream.use { input ->
      RandomAccessFile(part, "rw").use { out ->
        out.seek(offset)
        onProgress(done, total)
        while (true) {
          if (isCancelled()) throw DownloadError("CANCELLED", "stopped")
          val n = input.read(buffer)
          if (n < 0) break
          out.write(buffer, 0, n)
          done += n
          val now = System.nanoTime()
          if (now - lastReport > 200_000_000L) {
            onProgress(done, total)
            lastReport = now
          }
        }
        out.setLength(done)
      }
    }
    onProgress(done, total)
    if (total > 0 && done != total) throw IOException("connection closed early: $done of $total bytes")
    return done
  }
}
