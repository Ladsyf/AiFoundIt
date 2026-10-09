package expo.modules.aifounditnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TextExtractorsTest {
  // "~" stands for a backslash, so RTF examples stay readable.
  private fun bs(s: String) = s.replace("~", Char(92).toString())

  @Test
  fun docxKeepsParagraphsAndDecodesEntities() {
    val xml = "<w:p><w:r><w:t>Hello</w:t></w:r><w:r><w:t xml:space=\"preserve\"> world</w:t></w:r></w:p>" +
      "<w:p><w:r><w:t>Second &amp; last</w:t></w:r></w:p>"
    assertEquals("Hello world\nSecond & last", TextExtractors.docxText(xml).trim())
  }

  @Test
  fun docxTabsDoNotSwallowTheNextRun() {
    val xml = "<w:p><w:r><w:t>A</w:t><w:tab/><w:t>B</w:t></w:r></w:p>"
    assertEquals("A B", TextExtractors.docxText(xml).trim())
  }

  @Test
  fun pptxReadsEachParagraphOnItsOwnLine() {
    val xml = "<a:p><a:r><a:t>Title</a:t></a:r></a:p><a:p><a:r><a:t>Body text</a:t></a:r></a:p>"
    assertEquals("Title\nBody text", TextExtractors.pptxText(xml).trim())
  }

  @Test
  fun xlsxReadsSharedStrings() {
    val xml = "<sst><si><t>Item</t></si><si><t xml:space=\"preserve\">Price list</t></si></sst>"
    assertEquals("Item\nPrice list", TextExtractors.xlsxText(xml).trim())
  }

  @Test
  fun odtTurnsParagraphsIntoLinesAndSpaceTagsIntoSpaces() {
    val xml = "<office:text><text:p>First<text:s/>line</text:p><text:p>Second</text:p></office:text>"
    assertEquals("First line\nSecond", TextExtractors.odtText(xml))
  }

  @Test
  fun htmlDropsScriptsStylesAndTags() {
    val html = "<html><head><title>hidden</title><style>p{color:red}</style></head>" +
      "<body><p>Hello&nbsp;<b>world</b></p><script>var a = 1;</script><p>Bye</p></body></html>"
    val text = TextExtractors.htmlText(html)
    assertEquals("Hello world\nBye", text)
    assertFalse(text.contains("color"))
    assertFalse(text.contains("var a"))
  }

  @Test
  fun rtfKeepsTextAndSkipsFontTables() {
    val rtf = bs("{~rtf1~ansi{~fonttbl{~f0 Arial;}}~f0 Hello ~b world~b0~par Second line~par}")
    val text = TextExtractors.rtfText(rtf)
    assertTrue(text, text.contains("Hello world"))
    assertTrue(text, text.contains("Second line"))
    assertFalse(text, text.contains("Arial"))
  }

  @Test
  fun rtfHexAndUnicodeEscapesAreDecoded() {
    val text = TextExtractors.rtfText(bs("{~rtf1 Caf~'e9 ~u8364?}"))
    assertTrue(text, text.startsWith("Café"))
    assertTrue(text, text.contains("€"))
  }

  @Test
  fun numericEntitiesAreDecoded() {
    assertEquals("AB<", TextExtractors.decodeEntities("&#65;&#x42;&lt;"))
  }

  @Test
  fun plainXmlKeepsOnlyTheText() {
    assertEquals("hello world", TextExtractors.xmlPlain("<a><b>hello</b> <c>world</c></a>"))
  }
}
