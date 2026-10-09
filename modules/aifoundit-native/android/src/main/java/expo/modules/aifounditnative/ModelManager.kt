package expo.modules.aifounditnative

import android.app.ActivityManager
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.StatFs
import android.provider.OpenableColumns
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Model files on this phone: listing, import from a picked file, and resumable downloads. */
object ModelManager {
  private val EXTENSIONS = listOf(".litertlm", ".gguf", ".task", ".tflite", ".bin")
  private val NAME_OK = Regex("^[A-Za-z0-9][A-Za-z0-9._() -]{0,150}")
  private const val SPACE_MARGIN = 64L * 1024 * 1024
  private const val MAX_RETRIES = 4

  private class Active(val stop: AtomicReference<String?>) {
    @Volatile var last: Map<String, Any?> = emptyMap()
    @Volatile var job: Job? = null
  }

  private val active = ConcurrentHashMap<String, Active>()

  fun modelsDir(ctx: Context): File {
    val base = ctx.getExternalFilesDir(null) ?: ctx.filesDir
    val dir = File(base, "models")
    if (!dir.exists()) dir.mkdirs()
    return dir
  }

  fun isValidName(name: String): Boolean =
    NAME_OK.matches(name) && !name.contains("..") && EXTENSIONS.any { name.lowercase().endsWith(it) }

  /** Finished models and partial downloads. A partial entry carries the bytes saved so far. */
  fun list(ctx: Context): List<Map<String, Any?>> {
    val out = ArrayList<Map<String, Any?>>()
    val files = modelsDir(ctx).listFiles() ?: return out
    for (f in files) {
      if (!f.isFile) continue
      val partial = f.name.endsWith(".part")
      val name = if (partial) f.name.removeSuffix(".part") else f.name
      if (!isValidName(name)) continue
      val finalPath = File(f.parentFile, name).absolutePath
      out.add(mapOf("name" to name, "path" to finalPath, "size" to f.length(), "partial" to partial))
    }
    return out
  }

  fun delete(ctx: Context, fileName: String): Boolean {
    if (!isValidName(fileName)) return false
    val dir = modelsDir(ctx)
    val a = File(dir, fileName).delete()
    val b = File(dir, "$fileName.part").delete()
    return a || b
  }

  fun deviceInfo(ctx: Context): Map<String, Any?> {
    val am = ctx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    val mem = ActivityManager.MemoryInfo()
    am.getMemoryInfo(mem)
    val free = try {
      StatFs(modelsDir(ctx).path).availableBytes
    } catch (_: Throwable) {
      0L
    }
    return mapOf(
      "totalRamBytes" to mem.totalMem,
      "freeStorageBytes" to free,
      "sdk" to Build.VERSION.SDK_INT,
      "model" to Build.MODEL
    )
  }

  /** True on Wi-Fi or any other connection that is not metered. */
  fun isUnmetered(ctx: Context): Boolean {
    return try {
      val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      val net = cm.activeNetwork ?: return false
      val caps = cm.getNetworkCapabilities(net) ?: return false
      caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
    } catch (_: Throwable) {
      true
    }
  }

  private fun hasNetwork(ctx: Context): Boolean {
    return try {
      val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      cm.activeNetwork != null
    } catch (_: Throwable) {
      true
    }
  }

  private fun event(
    id: String,
    state: String,
    bytes: Long = 0L,
    total: Long = 0L,
    code: String? = null,
    message: String? = null,
    retrying: Boolean = false
  ): Map<String, Any?> = mapOf(
    "id" to id,
    "state" to state,
    "bytes" to bytes,
    "total" to total,
    "code" to code,
    "message" to message,
    "retrying" to retrying
  )

  /** Downloads that are running now, so the UI can pick them up again after a reload. */
  fun activeDownloads(): List<Map<String, Any?>> = active.values.map { it.last }.filter { it.isNotEmpty() }

  /** Starts, or resumes from the saved part file, one download. Progress and the end result arrive as events. */
  fun start(ctx: Context, req: DownloadRequestArg, emit: (Map<String, Any?>) -> Unit) {
    val id = req.id
    if (id.isBlank() || !isValidName(req.fileName)) {
      emit(event(id, "error", code = "BAD_REQUEST", message = "That model file name is not allowed"))
      return
    }
    if (active.containsKey(id)) return

    val dir = modelsDir(ctx)
    val dest = File(dir, req.fileName)
    val part = File(dir, req.fileName + ".part")
    val expected = req.expectedBytes.toLong()

    if (dest.exists() && (expected <= 0L || dest.length() == expected)) {
      emit(event(id, "done", dest.length(), dest.length()))
      return
    }
    if (!hasNetwork(ctx)) {
      emit(event(id, "error", code = "OFFLINE", message = "No internet connection"))
      return
    }
    if (req.wifiOnly && !isUnmetered(ctx)) {
      emit(event(id, "error", if (part.exists()) part.length() else 0L, expected, code = "WIFI", message = "Connect to Wi-Fi to download"))
      return
    }
    if (expected > 0L) {
      val saved = if (part.exists()) part.length() else 0L
      val free = try {
        StatFs(dir.path).availableBytes
      } catch (_: Throwable) {
        Long.MAX_VALUE
      }
      if (free < expected - saved + SPACE_MARGIN) {
        emit(event(id, "error", saved, expected, code = "SPACE", message = "Not enough free storage"))
        return
      }
    }

    val entry = Active(AtomicReference<String?>(null))
    val appCtx = ctx.applicationContext
    val job = AiState.scope.launch(Dispatchers.IO, start = CoroutineStart.LAZY) {
      runDownload(appCtx, req, dest, part, expected, entry.stop) { ev ->
        entry.last = ev
        emit(ev)
      }
    }
    entry.job = job
    active[id] = entry
    job.invokeOnCompletion { active.remove(id) }
    job.start()
  }

  fun pause(id: String) {
    active[id]?.stop?.set("pause")
  }

  /** Cancels a running download, or throws away the saved part of one that is not running. */
  fun cancel(ctx: Context, id: String, fileName: String?, emit: (Map<String, Any?>) -> Unit) {
    val running = active[id]
    if (running != null) {
      running.stop.set("cancel")
      return
    }
    if (fileName != null && isValidName(fileName)) {
      File(modelsDir(ctx), "$fileName.part").delete()
    }
    emit(event(id, "cancelled"))
  }

  private suspend fun runDownload(
    ctx: Context,
    req: DownloadRequestArg,
    dest: File,
    part: File,
    expected: Long,
    stop: AtomicReference<String?>,
    emit: (Map<String, Any?>) -> Unit
  ) {
    val id = req.id
    val urls = listOfNotNull(req.url.takeIf { it.isNotBlank() }, req.fallbackUrl?.takeIf { it.isNotBlank() })
    var attempt = 0
    var lastNetCheck = 0L

    val shouldStop: () -> Boolean = {
      if (stop.get() == null && req.wifiOnly) {
        val now = System.currentTimeMillis()
        if (now - lastNetCheck > 2000L) {
          lastNetCheck = now
          if (!isUnmetered(ctx)) stop.compareAndSet(null, "wifi")
        }
      }
      stop.get() != null
    }

    fun saved(): Long = if (part.exists()) part.length() else 0L

    fun finishStopped() {
      when (stop.get()) {
        "cancel" -> {
          part.delete()
          emit(event(id, "cancelled"))
        }
        "wifi" -> emit(event(id, "paused", saved(), expected, code = "WIFI", message = "Paused until Wi-Fi is back"))
        else -> emit(event(id, "paused", saved(), expected))
      }
    }

    NetStats.beginDownload()
    try {
      while (true) {
        try {
          emit(event(id, "downloading", saved(), expected, retrying = attempt > 0))
          val size = HttpDownloader.download(
            urls = urls,
            part = part,
            token = req.token,
            isCancelled = shouldStop,
            onProgress = { b, t -> emit(event(id, "downloading", b, if (t > 0L) t else expected)) }
          )
          if (expected > 0L && Math.abs(size - expected) > expected / 20) {
            part.delete()
            emit(event(id, "error", 0L, expected, code = "SIZE", message = "The downloaded file has the wrong size"))
            return
          }
          if (dest.exists()) dest.delete()
          if (!part.renameTo(dest)) throw IOException("Could not save the model file")
          emit(event(id, "done", size, size))
          return
        } catch (e: DownloadError) {
          when (e.code) {
            "CANCELLED" -> finishStopped()
            "AUTH" -> emit(event(id, "error", saved(), expected, code = "AUTH", message = "This model needs a Hugging Face login"))
            "NOT_FOUND" -> emit(event(id, "error", saved(), expected, code = "NOT_FOUND", message = "The model file was not found"))
            else -> emit(event(id, "error", saved(), expected, code = "HTTP", message = e.message))
          }
          return
        } catch (e: CancellationException) {
          throw e
        } catch (e: IOException) {
          if (stop.get() != null) {
            finishStopped()
            return
          }
          attempt++
          if (attempt > MAX_RETRIES) {
            emit(event(id, "error", saved(), expected, code = "NETWORK", message = e.message ?: "Network error"))
            return
          }
          emit(event(id, "downloading", saved(), expected, retrying = true))
          var waited = 0L
          val wait = 2000L * attempt
          while (waited < wait && stop.get() == null) {
            delay(250)
            waited += 250
          }
          if (stop.get() != null) {
            finishStopped()
            return
          }
        }
      }
    } finally {
      NetStats.endDownload()
    }
  }

  /** Copies a model the user picked (a content:// URI) into the models folder, with progress events. */
  suspend fun importFrom(
    ctx: Context,
    uriString: String,
    fileName: String,
    emit: (Map<String, Any?>) -> Unit
  ): Map<String, Any?> = withContext(Dispatchers.IO) {
    val id = "import:" + fileName
    if (!isValidName(fileName)) throw IOException("Unsupported model file name")
    val dir = modelsDir(ctx)
    val part = File(dir, "$fileName.part")
    val dest = File(dir, fileName)
    val uri = Uri.parse(uriString)

    var total = -1L
    ctx.contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { c ->
      if (c.moveToFirst() && !c.isNull(0)) total = c.getLong(0)
    }
    if (total > 0L) {
      val free = try {
        StatFs(dir.path).availableBytes
      } catch (_: Throwable) {
        Long.MAX_VALUE
      }
      if (free < total + SPACE_MARGIN) throw IOException("Not enough free storage")
    }

    var copied = 0L
    try {
      val input = ctx.contentResolver.openInputStream(uri) ?: throw IOException("Could not open the selected file")
      input.use { ins ->
        FileOutputStream(part).use { out ->
          val buffer = ByteArray(1 shl 20)
          var lastReport = 0L
          emit(event(id, "downloading", 0L, total))
          while (true) {
            val n = ins.read(buffer)
            if (n < 0) break
            out.write(buffer, 0, n)
            copied += n
            val now = System.nanoTime()
            if (now - lastReport > 200_000_000L) {
              lastReport = now
              emit(event(id, "downloading", copied, total))
            }
          }
        }
      }
      if (dest.exists()) dest.delete()
      if (!part.renameTo(dest)) throw IOException("Could not save the model file")
    } catch (e: Throwable) {
      part.delete()
      emit(event(id, "error", copied, total, code = "IO", message = e.message))
      throw e
    }
    emit(event(id, "done", copied, copied))
    mapOf("name" to fileName, "path" to dest.absolutePath, "size" to dest.length(), "partial" to false)
  }
}
