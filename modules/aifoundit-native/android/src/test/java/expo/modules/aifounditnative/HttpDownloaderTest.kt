package expo.modules.aifounditnative

import java.io.File
import java.io.IOException
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.nio.file.Files
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

/** A very small HTTP/1.1 server on plain sockets, so the tests need nothing beyond the Java SE API. */
class TinyServer(private val handler: (Request) -> Response) : AutoCloseable {
  class Request(val path: String, val headers: Map<String, String>)

  class Response(
    val status: Int,
    val headers: Map<String, String> = emptyMap(),
    val body: ByteArray = ByteArray(0),
    val declaredLength: Long = body.size.toLong()
  )

  private val socket = ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))
  val port: Int get() = socket.localPort

  init {
    Thread {
      while (!socket.isClosed) {
        try {
          serve(socket.accept())
        } catch (_: IOException) {
        }
      }
    }.apply {
      isDaemon = true
      start()
    }
  }

  private fun serve(client: Socket) {
    client.use { s ->
      val reader = s.getInputStream().bufferedReader(Charsets.ISO_8859_1)
      val requestLine = reader.readLine() ?: return
      val path = requestLine.split(" ")[1]
      val headers = HashMap<String, String>()
      while (true) {
        val line = reader.readLine() ?: break
        if (line.isEmpty()) break
        val colon = line.indexOf(':')
        if (colon > 0) headers[line.substring(0, colon).trim().lowercase()] = line.substring(colon + 1).trim()
      }
      val r = handler(Request(path, headers))
      val head = StringBuilder("HTTP/1.1 " + r.status + " Status\r\n")
      for ((k, v) in r.headers) head.append(k).append(": ").append(v).append("\r\n")
      head.append("Content-Length: ").append(r.declaredLength).append("\r\n")
      head.append("Connection: close\r\n\r\n")
      val out = s.getOutputStream()
      out.write(head.toString().toByteArray(Charsets.ISO_8859_1))
      out.write(r.body)
      out.flush()
    }
  }

  override fun close() {
    socket.close()
  }
}

/**
 * Runs the downloader against two local servers: an "origin" that redirects to a "cdn" on another
 * host name, the same shape as Hugging Face. No phone needed.
 */
class HttpDownloaderTest {
  private val data = ByteArray(3_000_000) { (it * 31 + 7).toByte() }
  private lateinit var cdn: TinyServer
  private lateinit var origin: TinyServer
  private lateinit var dir: File
  private val cdnAuth = ArrayList<String?>()
  private val cdnRanges = ArrayList<String?>()
  private val originAuth = ArrayList<String?>()

  private fun blob(req: TinyServer.Request, honorRange: Boolean, truncateAt: Int = -1): TinyServer.Response {
    cdnAuth.add(req.headers["authorization"])
    val range = req.headers["range"]
    cdnRanges.add(range)
    if (range != null && honorRange) {
      val start = range.removePrefix("bytes=").removeSuffix("-").toInt()
      val contentRange = "bytes " + start + "-" + (data.size - 1) + "/" + data.size
      return TinyServer.Response(206, mapOf("Content-Range" to contentRange), data.copyOfRange(start, data.size))
    }
    val body = if (truncateAt >= 0) data.copyOfRange(0, truncateAt) else data
    return TinyServer.Response(200, emptyMap(), body, data.size.toLong())
  }

  private fun redirectTo(path: String): TinyServer.Response =
    TinyServer.Response(302, mapOf("Location" to "http://localhost:" + cdn.port + path))

  @Before
  fun setUp() {
    dir = Files.createTempDirectory("aifoundit-dl").toFile()
    cdn = TinyServer { req ->
      when (req.path) {
        "/blob" -> blob(req, honorRange = true)
        "/blob-norange" -> blob(req, honorRange = false)
        "/blob-truncated" -> blob(req, honorRange = false, truncateAt = data.size / 2)
        else -> TinyServer.Response(404)
      }
    }
    origin = TinyServer { req ->
      originAuth.add(req.headers["authorization"])
      when (req.path) {
        "/model" -> redirectTo("/blob")
        "/model-norange" -> redirectTo("/blob-norange")
        "/model-truncated" -> redirectTo("/blob-truncated")
        "/private" -> TinyServer.Response(401)
        else -> TinyServer.Response(404)
      }
    }
  }

  @After
  fun tearDown() {
    origin.close()
    cdn.close()
    dir.deleteRecursively()
  }

  private fun url(path: String) = "http://127.0.0.1:" + origin.port + path

  @Test
  fun downloadsThroughARedirectToAnotherHost() {
    val part = File(dir, "model.litertlm.part")
    var last = 0L
    val size = HttpDownloader.download(listOf(url("/model")), part, null, { false }, { bytes, _ -> last = bytes })
    assertEquals(data.size.toLong(), size)
    assertArrayEquals(data, part.readBytes())
    assertEquals(data.size.toLong(), last)
  }

  @Test
  fun resumesFromTheSavedPartWithARangeRequest() {
    val part = File(dir, "model.litertlm.part")
    part.writeBytes(data.copyOfRange(0, 1000))
    HttpDownloader.download(listOf(url("/model")), part, null, { false }, { _, _ -> })
    assertArrayEquals(data, part.readBytes())
    assertEquals("bytes=1000-", cdnRanges.last())
  }

  @Test
  fun startsOverWhenTheServerIgnoresTheRangeHeader() {
    val part = File(dir, "model.litertlm.part")
    part.writeBytes(data.copyOfRange(0, 1000))
    HttpDownloader.download(listOf(url("/model-norange")), part, null, { false }, { _, _ -> })
    assertArrayEquals(data, part.readBytes())
  }

  @Test
  fun sendsTheTokenToTheOriginOnlyNeverToTheRedirectTarget() {
    val part = File(dir, "model.litertlm.part")
    HttpDownloader.download(listOf(url("/model")), part, "secret", { false }, { _, _ -> })
    assertEquals("Bearer secret", originAuth.first())
    assertTrue(cdnAuth.isNotEmpty())
    assertTrue(cdnAuth.all { it == null })
  }

  @Test
  fun triesTheNextUrlAfterANotFound() {
    val part = File(dir, "model.litertlm.part")
    HttpDownloader.download(listOf(url("/missing"), url("/model")), part, null, { false }, { _, _ -> })
    assertArrayEquals(data, part.readBytes())
  }

  @Test
  fun reportsAuthErrorsWithoutRetrying() {
    val part = File(dir, "model.litertlm.part")
    try {
      HttpDownloader.download(listOf(url("/private")), part, null, { false }, { _, _ -> })
      fail("expected a DownloadError")
    } catch (e: DownloadError) {
      assertEquals("AUTH", e.code)
    }
  }

  @Test
  fun stopsWhenCancelledAndKeepsWhatWasSaved() {
    val part = File(dir, "model.litertlm.part")
    var calls = 0
    try {
      HttpDownloader.download(listOf(url("/model")), part, null, { ++calls > 5 }, { _, _ -> })
      fail("expected a DownloadError")
    } catch (e: DownloadError) {
      assertEquals("CANCELLED", e.code)
    }
    assertTrue(part.length() > 0L)
    assertTrue(part.length() < data.size.toLong())
  }

  @Test
  fun aDroppedConnectionIsANetworkErrorAndTheNextTryResumes() {
    val part = File(dir, "model.litertlm.part")
    try {
      HttpDownloader.download(listOf(url("/model-truncated")), part, null, { false }, { _, _ -> })
      fail("expected an IOException")
    } catch (e: DownloadError) {
      fail("a dropped connection must not be a DownloadError: " + e.code)
    } catch (e: IOException) {
      // expected: the caller retries
    }
    assertEquals((data.size / 2).toLong(), part.length())
    HttpDownloader.download(listOf(url("/model")), part, null, { false }, { _, _ -> })
    assertArrayEquals(data, part.readBytes())
    assertEquals("bytes=" + (data.size / 2) + "-", cdnRanges.last())
  }
}
