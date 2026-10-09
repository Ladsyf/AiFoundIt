package expo.modules.aifounditnative

import android.content.Context
import android.content.Intent
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Environment
import android.provider.Settings
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

object Intents {

  fun hasAllFilesAccess(): Boolean =
    android.os.Build.VERSION.SDK_INT < 30 || Environment.isExternalStorageManager()

  fun openAllFilesAccessSettings(ctx: Context) {
    val intent = try {
      Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
        data = Uri.parse("package:${ctx.packageName}")
      }
    } catch (_: Throwable) {
      Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
    }
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    ctx.startActivity(intent)
  }

  fun openBatterySettings(ctx: Context) {
    ctx.startActivity(
      Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    )
  }

  fun openFile(ctx: Context, path: String, chooser: Boolean): Boolean {
    val file = File(path)
    if (!file.exists()) return false
    val ext = file.extension.lowercase()
    val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "*/*"
    val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.aifoundit.provider", file)
    val view = Intent(Intent.ACTION_VIEW).apply {
      setDataAndType(uri, mime)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    return try {
      if (chooser) {
        ctx.startActivity(
          Intent.createChooser(view, "Open with").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        true
      } else if (view.resolveActivity(ctx.packageManager) != null) {
        ctx.startActivity(view)
        true
      } else {
        false
      }
    } catch (_: Throwable) {
      false
    }
  }

  fun showInFolder(ctx: Context, path: String): Boolean {
    val dir = File(path).parentFile ?: return false
    if (!dir.exists()) return false
    val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.aifoundit.provider", dir)
    val intent = Intent(Intent.ACTION_VIEW).apply {
      setDataAndType(uri, "resource/folder")
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    return try {
      if (intent.resolveActivity(ctx.packageManager) != null) {
        ctx.startActivity(intent)
        true
      } else {
        false
      }
    } catch (_: Throwable) {
      false
    }
  }
}

object FileOps {

  fun run(
    ctx: Context,
    batchId: String,
    ops: List<FileOpArg>,
    emit: (Map<String, Any?>) -> Unit
  ): List<Map<String, Any?>> {
    val results = mutableListOf<Map<String, Any?>>()
    ops.forEachIndexed { i, op ->
      emit(mapOf("batchId" to batchId, "done" to i, "total" to ops.size, "current" to (op.from ?: op.to)))
      val res = try {
        when (op.op) {
          "mkdir" -> mkdir(op)
          "move", "rename" -> move(op)
          "copy" -> copy(op)
          else -> fail(op, "unknown op")
        }
      } catch (t: Throwable) {
        fail(op, t.message ?: "operation failed")
      }
      results += res
      scanPaths(ctx, listOfNotNull(op.from, res["finalPath"] as? String))
    }
    emit(mapOf("batchId" to batchId, "done" to ops.size, "total" to ops.size, "current" to ""))
    return results
  }

  private fun mkdir(op: FileOpArg): Map<String, Any?> {
    val dir = File(op.to)
    return if (dir.isDirectory || dir.mkdirs()) {
      mapOf("op" to opMap(op), "ok" to true, "finalPath" to op.to)
    } else {
      fail(op, "could not create directory")
    }
  }

  private fun move(op: FileOpArg): Map<String, Any?> {
    val src = File(op.from ?: return fail(op, "missing source"))
    if (!src.exists()) return fail(op, "source not found")
    val dest = uniqueDest(File(op.to))
    dest.parentFile?.mkdirs()
    return if (src.renameTo(dest)) {
      mapOf("op" to opMap(op), "ok" to true, "finalPath" to dest.absolutePath)
    } else {
      try {
        copyStream(src, dest)
        if (!src.delete()) return fail(op, "copied but could not delete source")
        mapOf("op" to opMap(op), "ok" to true, "finalPath" to dest.absolutePath)
      } catch (t: Throwable) {
        dest.delete()
        fail(op, t.message ?: "move failed")
      }
    }
  }

  private fun copy(op: FileOpArg): Map<String, Any?> {
    val src = File(op.from ?: return fail(op, "missing source"))
    if (!src.exists()) return fail(op, "source not found")
    val dest = uniqueDest(File(op.to))
    dest.parentFile?.mkdirs()
    return try {
      copyStream(src, dest)
      mapOf("op" to opMap(op), "ok" to true, "finalPath" to dest.absolutePath)
    } catch (t: Throwable) {
      dest.delete()
      fail(op, t.message ?: "copy failed")
    }
  }

  private fun uniqueDest(dest: File): File {
    if (!dest.exists()) return dest
    val base = dest.nameWithoutExtension
    val ext = if (dest.extension.isEmpty()) "" else ".${dest.extension}"
    var n = 1
    while (File(dest.parentFile, "$base ($n)$ext").exists()) n++
    return File(dest.parentFile, "$base ($n)$ext")
  }

  private fun copyStream(src: File, dest: File) {
    FileInputStream(src).channel.use { input ->
      FileOutputStream(dest).channel.use { output ->
        input.transferTo(0, input.size(), output)
      }
    }
    dest.setLastModified(src.lastModified())
  }

  private fun scanPaths(ctx: Context, paths: List<String>) {
    if (paths.isEmpty()) return
    try {
      MediaScannerConnection.scanFile(ctx, paths.toTypedArray(), null, null)
    } catch (_: Throwable) {}
  }

  private fun opMap(op: FileOpArg): Map<String, Any?> =
    mapOf("op" to op.op, "from" to op.from, "to" to op.to)

  private fun fail(op: FileOpArg, error: String): Map<String, Any?> =
    mapOf("op" to opMap(op), "ok" to false, "error" to error)
}
