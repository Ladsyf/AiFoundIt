package expo.modules.aifounditnative

/** Splits extracted text into ~800 character pieces with a small overlap, breaking at sentence or word edges. */
object Chunker {
  const val CHUNK_CHARS = 800
  const val OVERLAP = 100

  fun split(text: String): List<String> {
    val clean = text.replace(Regex("[ \t\u00A0]+"), " ").replace(Regex(" ?\n ?"), "\n").trim()
    if (clean.isEmpty()) return emptyList()
    if (clean.length <= CHUNK_CHARS) return listOf(clean)

    val out = ArrayList<String>()
    var start = 0
    while (start < clean.length) {
      var end = minOf(start + CHUNK_CHARS, clean.length)
      if (end < clean.length) {
        val minCut = start + CHUNK_CHARS * 3 / 4
        val sentence = clean.lastIndexOfAny(charArrayOf('\n', '.', '!', '?', ';'), end - 1)
        val space = clean.lastIndexOf(' ', end - 1)
        end = when {
          sentence >= minCut -> sentence + 1
          space >= minCut -> space + 1
          else -> end
        }
      }
      val piece = clean.substring(start, end).trim()
      if (piece.isNotEmpty()) out += piece
      if (end >= clean.length) break
      start = maxOf(end - OVERLAP, start + 1)
    }
    return out
  }
}
