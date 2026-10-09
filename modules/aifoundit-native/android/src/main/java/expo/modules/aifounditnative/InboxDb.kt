package expo.modules.aifounditnative

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject

class InboxDb(ctx: Context) : SQLiteOpenHelper(ctx, "aifoundit_inbox.db", null, 1) {

  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL(
      """CREATE TABLE IF NOT EXISTS inbox(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        op TEXT NOT NULL,
        path TEXT NOT NULL,
        uri TEXT,
        name TEXT,
        folder TEXT,
        ext TEXT,
        mime TEXT,
        kind TEXT,
        size INTEGER,
        modifiedAt INTEGER,
        takenAt INTEGER,
        width INTEGER,
        height INTEGER,
        durationMs INTEGER,
        isScreenshot INTEGER,
        labels TEXT,
        thumbnailPath TEXT,
        chunks TEXT,
        error TEXT
      )"""
    )
    db.execSQL("CREATE TABLE IF NOT EXISTS scan_state(path TEXT PRIMARY KEY, fingerprint TEXT NOT NULL)")
    db.execSQL("CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT)")
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {}

  fun stage(item: Map<String, Any?>) {
    val v = ContentValues().apply {
      put("op", item["op"] as? String ?: "upsert")
      put("path", item["path"] as? String)
      put("uri", item["uri"] as? String)
      put("name", item["name"] as? String)
      put("folder", item["folder"] as? String)
      put("ext", item["ext"] as? String)
      put("mime", item["mime"] as? String)
      put("kind", item["kind"] as? String)
      put("size", item["size"] as? Long ?: 0L)
      put("modifiedAt", item["modifiedAt"] as? Long ?: 0L)
      item["takenAt"]?.let { put("takenAt", it as Long) }
      item["width"]?.let { put("width", it as Int) }
      item["height"]?.let { put("height", it as Int) }
      item["durationMs"]?.let { put("durationMs", it as Long) }
      put("isScreenshot", if (item["isScreenshot"] == true) 1 else 0)
      put("labels", JSONArray(item["labels"] as? List<*> ?: emptyList<Any>()).toString())
      item["thumbnailPath"]?.let { put("thumbnailPath", it as String) }
      put("chunks", JSONArray(item["chunks"] as? List<*> ?: emptyList<Any>()).toString())
      item["error"]?.let { put("error", it as String) }
    }
    writableDatabase.insert("inbox", null, v)
  }

  fun stageDelete(path: String) {
    val v = ContentValues().apply {
      put("op", "delete")
      put("path", path)
      put("uri", "")
      put("name", path.substringAfterLast('/'))
      put("folder", path.substringBeforeLast('/', ""))
      put("ext", "")
      put("mime", "")
      put("kind", "text")
      put("size", 0L)
      put("modifiedAt", 0L)
      put("isScreenshot", 0)
      put("labels", "[]")
      put("chunks", "[]")
    }
    writableDatabase.insert("inbox", null, v)
  }

  fun drain(limit: Int): List<Map<String, Any?>> {
    val out = mutableListOf<Map<String, Any?>>()
    readableDatabase.rawQuery(
      "SELECT * FROM inbox ORDER BY id LIMIT ?",
      arrayOf(limit.toString())
    ).use { c ->
      val cols = c.columnNames
      while (c.moveToNext()) {
        val row = mutableMapOf<String, Any?>()
        for ((i, name) in cols.withIndex()) {
          row[name] = when (c.getType(i)) {
            android.database.Cursor.FIELD_TYPE_NULL -> null
            android.database.Cursor.FIELD_TYPE_INTEGER -> c.getLong(i).let {
              when (name) {
                "width", "height" -> it.toInt()
                "isScreenshot" -> it != 0L
                else -> it
              }
            }
            android.database.Cursor.FIELD_TYPE_FLOAT -> c.getDouble(i)
            android.database.Cursor.FIELD_TYPE_BLOB -> c.getBlob(i)
            else -> c.getString(i)
          }
        }
        row["id"] = (row["id"] as Long).let { if (it > Int.MAX_VALUE) Int.MAX_VALUE else it.toInt() }
        row["labels"] = jsonArrayToList(row["labels"] as? String)
        row["chunks"] = jsonArrayToList(row["chunks"] as? String)
        out += row
      }
    }
    return out
  }

  fun ack(ids: List<Int>) {
    if (ids.isEmpty()) return
    val marks = ids.joinToString(",") { "?" }
    writableDatabase.execSQL(
      "DELETE FROM inbox WHERE id IN ($marks)",
      ids.map { it.toString() }.toTypedArray()
    )
  }

  fun seenFingerprints(): Map<String, String> {
    val out = mutableMapOf<String, String>()
    readableDatabase.rawQuery("SELECT path, fingerprint FROM scan_state", null).use { c ->
      while (c.moveToNext()) out[c.getString(0)] = c.getString(1)
    }
    return out
  }

  fun saveScanState(state: Map<String, String>) {
    writableDatabase.run {
      beginTransaction()
      try {
        delete("scan_state", null, null)
        state.forEach { (path, fp) ->
          insert("scan_state", null, ContentValues().apply {
            put("path", path)
            put("fingerprint", fp)
          })
        }
        setTransactionSuccessful()
      } finally {
        endTransaction()
      }
    }
  }

  private fun jsonArrayToList(raw: String?): List<Map<String, Any?>> {
    if (raw.isNullOrBlank()) return emptyList()
    return try {
      val arr = JSONArray(raw)
      (0 until arr.length()).map { jsonToMap(arr.getJSONObject(it)) }
    } catch (_: Throwable) {
      emptyList()
    }
  }

  private fun jsonToMap(obj: JSONObject): Map<String, Any?> {
    val m = mutableMapOf<String, Any?>()
    obj.keys().forEach { k ->
      m[k] = when (val v = obj.get(k)) {
        JSONObject.NULL -> null
        is JSONArray -> (0 until v.length()).map { v.get(it) }
        else -> v
      }
    }
    return m
  }
}
