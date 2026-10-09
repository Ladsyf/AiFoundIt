package expo.modules.aifounditnative

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.Settings
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException

object Intents {

  fun hasAllFilesAccess(): Boolean =
    Build.VERSION.SDK_INT < 30 || Environment.isExternalStorageManager()

  fun openAllFilesAccessSettings(ctx: Context) {
    val perApp = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + ctx.packageName))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
      ctx.startActivity(perApp)
    } catch (_: Throwable) {
      ctx.startActivity(
        Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
    }
  }

  fun openBatterySettings(ctx: Context) {
    ctx.startActivity(
      Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    )
  }

  private fun authority(ctx: Context) = ctx.packageName + ".aifoundit.provider"

  private fun mimeOf(file: File): String =
    MimeTypeMap.getSingleton().getMimeTypeFromExtension(file.extension.lowercase()) ?: "*/*"

  /**
   * Opens a file in another app through a FileProvider URI. It does not ask the package manager first:
   * since Android 11 that query returns nothing for apps the manifest did not declare, even when one exists.
   */
  fun openFile(ctx: Context, path: String, chooser: Boolean): Boolean {
    val file = File(path)
    if (!file.exists()) return false
    return try {
      val uri = FileProvider.getUriForFile(ctx, authority(ctx), file)
      val view = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, mimeOf(file))
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      val intent = if (chooser) {
        Intent.createChooser(view, "Open with").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      } else {
        view
      }
      ctx.startActivity(intent)
      true
    } catch (_: ActivityNotFoundException) {
      false
    } catch (_: Throwable) {
      false
    }
  }

  /** Opens the folder in the system Files app, the way the file picker names a folder (primary:Download/Receipts). */
  fun showInFolder(ctx: Context, path: String): Boolean {
    val dir = File(path).parentFile ?: return false
    if (!dir.exists()) return false
    val root = try {
      Environment.getExternalStorageDirectory().canonicalPath
    } catch (_: Throwable) {
      return false
    }
    val canonical = try {
      dir.canonicalPath
    } catch (_: Throwable) {
      return false
    }

    if (canonical == root || canonical.startsWith(root + File.separator)) {
      val relative = canonical.removePrefix(root).trim(File.separatorChar)
      val docUri = DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", "primary:" + relative)
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(docUri, DocumentsContract.Document.MIME_TYPE_DIR)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      try {
        ctx.startActivity(intent)
        return true
      } catch (_: Throwable) {
      }
    }

    // Other file managers understand a plain folder URI from the FileProvider.
    return try {
      val uri = FileProvider.getUriForFile(ctx, authority(ctx), dir)
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, "resource/folder")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      ctx.startActivity(intent)
      true
    } catch (_: Throwable) {
      false
    }
  }
}

object FileOps {

  private fun storageRoot(): File = Environment.getExternalStorageDirectory()

  /**
   * Turns a path from JS into a real file. A relative path ("Documents/Receipts") starts at the storage
   * root. The result must be shared storage and never another app's private folder; otherwise null.
   */
  fun resolve(path: String): File? {
    if (path.isBlank()) return null
    val given = File(path)
    val abs = if (given.isAbsolute) given else File(storageRoot(), path)
    val canonical = try {
      abs.canonicalFile
    } catch (_: IOException) {
      return null
    }
    val p = canonical.path
    val inStorage = p.startsWith("/storage/") || p.startsWith("/sdcard/") || p.startsWith(storageRoot().path)
    if (!inStorage) return null
    val lower = p.lowercase()
    if (lower.contains("/android/data") || lower.contains("/android/obb")) return null
    return canonical
  }

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
          else -> fail(op, "unknown operation")
        }
      } catch (t: Throwable) {
        fail(op, t.message ?: "operation failed")
      }
      results.add(res)
      scanPaths(ctx, listOfNotNull(op.from, res["finalPath"] as? String))
    }
    emit(mapOf("batchId" to batchId, "done" to ops.size, "total" to ops.size, "current" to ""))
    return results
  }

  private fun mkdir(op: FileOpArg): Map<String, Any?> {
    val dir = resolve(op.to) ?: return fail(op, "that folder is not allowed")
    return if (dir.isDirectory || dir.mkdirs()) {
      mapOf("op" to opMap(op), "ok" to true, "finalPath" to dir.absolutePath)
    } else {
      fail(op, "could not create the folder")
    }
  }

  private fun move(op: FileOpArg): Map<String, Any?> {
    val src = resolve(op.from ?: return fail(op, "missing source")) ?: return fail(op, "source is not allowed")
    if (!src.isFile) return fail(op, "source not found")
    val target = resolve(op.to) ?: return fail(op, "destination is not allowed")
    val dest = uniqueDest(target)
    dest.parentFile?.mkdirs()
    if (src.renameTo(dest)) {
      return mapOf("op" to opMap(op), "ok" to true, "finalPath" to dest.absolutePath)
    }
    // Different volumes cannot be renamed: copy, check the size, then remove the original.
    return try {
      copyStream(src, dest)
      if (dest.length() != src.length()) {
        dest.delete()
        return fail(op, "the copy did not match the original, so nothing was moved")
      }
      if (!src.delete()) {
        dest.delete()
        return fail(op, "could not remove the original, so nothing was moved")
      }
      mapOf("op" to opMap(op), "ok" to true, "finalPath" to dest.absolutePath)
    } catch (t: Throwable) {
      dest.delete()
      fail(op, t.message ?: "move failed")
    }
  }

  private fun copy(op: FileOpArg): Map<String, Any?> {
    val src = resolve(op.from ?: return fail(op, "missing source")) ?: return fail(op, "source is not allowed")
    if (!src.isFile) return fail(op, "source not found")
    val target = resolve(op.to) ?: return fail(op, "destination is not allowed")
    val dest = uniqueDest(target)
    dest.parentFile?.mkdirs()
    return try {
      copyStream(src, dest)
      if (dest.length() != src.length()) {
        dest.delete()
        return fail(op, "the copy did not match the original")
      }
      mapOf("op" to opMap(op), "ok" to true, "finalPath" to dest.absolutePath)
    } catch (t: Throwable) {
      dest.delete()
      fail(op, t.message ?: "copy failed")
    }
  }

  /** Never overwrite: "receipt.jpg" becomes "receipt (1).jpg" when the name is taken. */
  private fun uniqueDest(dest: File): File {
    if (!dest.exists()) return dest
    val base = dest.nameWithoutExtension
    val ext = if (dest.extension.isEmpty()) "" else "." + dest.extension
    var n = 1
    while (File(dest.parentFile, "$base ($n)$ext").exists()) n++
    return File(dest.parentFile, "$base ($n)$ext")
  }

  private fun copyStream(src: File, dest: File) {
    FileInputStream(src).channel.use { input ->
      FileOutputStream(dest).channel.use { output ->
        var position = 0L
        val size = input.size()
        while (position < size) {
          position += input.transferTo(position, size - position, output)
        }
      }
    }
    dest.setLastModified(src.lastModified())
  }

  private fun scanPaths(ctx: Context, paths: List<String>) {
    if (paths.isEmpty()) return
    try {
      MediaScannerConnection.scanFile(ctx, paths.toTypedArray(), null, null)
    } catch (_: Throwable) {
    }
  }

  private fun opMap(op: FileOpArg): Map<String, Any?> =
    mapOf("op" to op.op, "from" to op.from, "to" to op.to)

  private fun fail(op: FileOpArg, error: String): Map<String, Any?> =
    mapOf("op" to opMap(op), "ok" to false, "error" to error)
}
