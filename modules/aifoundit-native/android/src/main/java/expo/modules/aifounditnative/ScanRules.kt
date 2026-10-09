package expo.modules.aifounditnative

/**
 * Folder rules used by the scanner. Every path is relative to the storage root
 * ("DCIM/Camera"), compared case-insensitively with "/" separators.
 *
 *  - An exclude with no "/" ("Android", ".Statuses") skips every folder with that
 *    name, at any depth.
 *  - An exclude with a "/" ("Documents/Private") skips that folder and everything under it.
 *  - Empty entries are ignored, so a blank rule can never exclude the whole phone.
 */
object ScanRules {
  fun norm(path: String): String = path.replace(Char(92), '/').trim().trim('/').lowercase()

  fun isExcluded(relFolder: String, excludes: List<String>): Boolean {
    val rel = norm(relFolder)
    if (rel.isEmpty()) return false
    val segments = rel.split('/')
    for (raw in excludes) {
      val ex = norm(raw)
      if (ex.isEmpty()) continue
      if ('/' in ex) {
        if (rel == ex || rel.startsWith("$ex/")) return true
      } else if (ex in segments) {
        return true
      }
    }
    return false
  }

  /** True when [relFolder] is one of [roots] or lives under one of them. */
  fun isUnder(relFolder: String, roots: List<String>): Boolean = rootIndex(relFolder, roots) >= 0

  /** Position of the first root that contains [relFolder], or -1. */
  fun rootIndex(relFolder: String, roots: List<String>): Int {
    val rel = norm(relFolder)
    for ((i, raw) in roots.withIndex()) {
      val root = norm(raw)
      if (root.isEmpty()) continue
      if (rel == root || rel.startsWith("$root/")) return i
    }
    return -1
  }

  /** Lower scans first: folders under an include root rank by that root's position, the rest last. */
  fun priority(relFolder: String, roots: List<String>): Int {
    val i = rootIndex(relFolder, roots)
    return if (i >= 0) i else Int.MAX_VALUE
  }
}
