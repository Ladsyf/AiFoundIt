package expo.modules.aifounditnative

/** Pure text extraction from document markup. No Android classes, so it is unit-tested on the JVM. */
object TextExtractors {
  private val BACKSLASH: Char = Char(92)
  private val ENTITY = Regex("&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);")
  private val DOCX = Regex("""<w:t(?:\s[^>]*)?>([^<]*)</w:t>|</w:p>|<w:tab/>|<w:br/>""")
  private val PPTX = Regex("""<a:t(?:\s[^>]*)?>([^<]*)</a:t>|</a:p>""")
  private val XLSX = Regex("""<t(?:\s[^>]*)?>([^<]*)</t>|</si>""")
  private val TAGS = Regex("<[^>]+>")
  private val HTML_HIDDEN = Regex("""(?is)<(script|style|head)[^>]*>.*?</\1>""")
  private val HTML_BREAKS = Regex("""(?i)<br\s*/?>|</(p|div|li|h[1-6]|tr|section|article)>""")
  private val ODT_BREAKS = Regex("</text:(p|h)>|<text:line-break/>")
  private val ODT_SPACES = Regex("""<text:tab/>|<text:s(?:\s[^>]*)?/>""")

  private val RTF_SKIP = setOf(
    "fonttbl", "colortbl", "stylesheet", "info", "pict", "header", "footer", "footnote", "themedata",
    "colorschememapping", "latentstyles", "datastore", "fldinst", "listtable", "listoverridetable",
    "rsidtbl", "generator", "object", "objdata", "bkmkstart", "bkmkend"
  )

  fun decodeEntities(s: String): String {
    if ('&' !in s) return s
    return ENTITY.replace(s) { m ->
      when (val e = m.groupValues[1]) {
        "amp" -> "&"
        "lt" -> "<"
        "gt" -> ">"
        "quot" -> "\""
        "apos" -> "'"
        "nbsp" -> " "
        else -> {
          val code = if (e.startsWith("#x")) e.substring(2).toIntOrNull(16) else e.substring(1).toIntOrNull()
          if (code != null && code in 1..0x10FFFF) String(Character.toChars(code)) else m.value
        }
      }
    }
  }

  private fun collect(re: Regex, xml: String): String {
    val sb = StringBuilder()
    for (m in re.findAll(xml)) {
      val text = m.groups[1]
      when {
        text != null -> sb.append(text.value)
        m.value.startsWith("</") -> sb.append('\n')
        else -> sb.append(' ')
      }
    }
    return decodeEntities(sb.toString())
  }

  fun docxText(xml: String): String = collect(DOCX, xml)

  fun pptxText(xml: String): String = collect(PPTX, xml)

  fun xlsxText(xml: String): String = collect(XLSX, xml)

  fun odtText(xml: String): String {
    val s = xml.replace(ODT_BREAKS, "\n").replace(ODT_SPACES, " ")
    return tidy(decodeEntities(s.replace(TAGS, "")))
  }

  fun htmlText(html: String): String {
    val s = html.replace(HTML_HIDDEN, " ").replace(HTML_BREAKS, "\n").replace(TAGS, " ")
    return tidy(decodeEntities(s))
  }

  /** Generic XML-like markup: drop the tags, keep the text. */
  fun xmlPlain(xml: String): String = tidy(decodeEntities(xml.replace(TAGS, " ")))

  fun rtfText(rtf: String): String {
    val sb = StringBuilder()
    val n = rtf.length
    var i = 0
    var depth = 0
    var skipAt = -1
    while (i < n) {
      val c = rtf[i]
      if (c == '{') {
        depth++
        i++
        if (skipAt < 0 && i < n && rtf[i] == BACKSLASH) {
          if (i + 1 < n && rtf[i + 1] == '*') {
            skipAt = depth
          } else {
            var j = i + 1
            while (j < n && rtf[j].isLetter()) j++
            if (rtf.substring(i + 1, j) in RTF_SKIP) skipAt = depth
          }
        }
      } else if (c == '}') {
        if (depth == skipAt) skipAt = -1
        depth--
        i++
      } else if (c == BACKSLASH) {
        if (i + 1 >= n) {
          i++
        } else {
          val d = rtf[i + 1]
          if (d == BACKSLASH || d == '{' || d == '}') {
            if (skipAt < 0) sb.append(d)
            i += 2
          } else if (d == Char(39)) {
            val hex = if (i + 4 <= n) rtf.substring(i + 2, i + 4).toIntOrNull(16) else null
            if (hex != null && skipAt < 0) sb.append(hex.toChar())
            i += if (hex != null) 4 else 2
          } else if (d.isLetter()) {
            var j = i + 1
            while (j < n && rtf[j].isLetter()) j++
            val word = rtf.substring(i + 1, j)
            var k = j
            if (k < n && (rtf[k] == '-' || rtf[k].isDigit())) {
              k++
              while (k < n && rtf[k].isDigit()) k++
            }
            val param = rtf.substring(j, k).toIntOrNull()
            if (k < n && rtf[k] == ' ') k++
            if (skipAt < 0) {
              when (word) {
                "par", "line", "sect", "page" -> sb.append('\n')
                "tab" -> sb.append(' ')
                "u" -> if (param != null) {
                  sb.append((if (param < 0) param + 65536 else param).toChar())
                  if (k < n && rtf[k] != BACKSLASH && rtf[k] != '{' && rtf[k] != '}') k++
                }
              }
            }
            i = k
          } else {
            i += 2
          }
        }
      } else {
        if (c != '\r' && c != '\n' && skipAt < 0) sb.append(c)
        i++
      }
    }
    return tidy(sb.toString())
  }

  /** Collapses runs of blanks and blank lines. */
  fun tidy(s: String): String =
    s.replace(Regex("[ \t\u00A0]+"), " ").replace(Regex(" ?\n[ \n]*"), "\n").trim()
}
