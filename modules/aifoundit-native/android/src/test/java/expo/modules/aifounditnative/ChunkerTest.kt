package expo.modules.aifounditnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ChunkerTest {
  @Test
  fun shortTextStaysOneChunk() {
    assertEquals(listOf("Total 1,250.00"), Chunker.split("  Total 1,250.00 \n"))
  }

  @Test
  fun blankTextGivesNothing() {
    assertTrue(Chunker.split("   \n\t ").isEmpty())
  }

  @Test
  fun longTextIsSplitAtSentencesWithOverlap() {
    val text = "The quick brown fox jumps over the lazy dog. ".repeat(60)
    val chunks = Chunker.split(text)
    assertTrue(chunks.size >= 3)
    assertTrue(chunks.all { it.length <= Chunker.CHUNK_CHARS })
    assertTrue(chunks.last().endsWith("dog."))
    for (i in 0 until chunks.size - 1) {
      assertTrue("chunk ${i + 1} should start inside chunk $i", chunks[i].contains(chunks[i + 1].take(30)))
    }
  }

  @Test
  fun oneVeryLongWordStillTerminates() {
    val chunks = Chunker.split("x".repeat(5000))
    assertTrue(chunks.size in 6..12)
    assertTrue(chunks.all { it.length <= Chunker.CHUNK_CHARS })
  }

  @Test
  fun everyWordOfALongTextSurvivesChunking() {
    val words = (1..400).map { "word$it" }
    val chunks = Chunker.split(words.joinToString(" "))
    val joined = chunks.joinToString(" ")
    assertTrue(words.all { joined.contains(it) })
  }
}
