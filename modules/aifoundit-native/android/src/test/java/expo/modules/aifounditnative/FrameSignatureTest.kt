package expo.modules.aifounditnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FrameSignatureTest {
  @Test
  fun lumaWeighsGreenMostAndBlueLeast() {
    assertEquals(0, FrameSignature.luma(0xFF000000.toInt()))
    assertEquals(255, FrameSignature.luma(0xFFFFFFFF.toInt()))
    assertTrue(FrameSignature.luma(0xFF00FF00.toInt()) > FrameSignature.luma(0xFFFF0000.toInt()))
    assertTrue(FrameSignature.luma(0xFFFF0000.toInt()) > FrameSignature.luma(0xFF0000FF.toInt()))
  }

  @Test
  fun identicalSignaturesDifferByZero() {
    val a = IntArray(256) { it % 256 }
    assertEquals(0.0, FrameSignature.meanAbsDiff(a, a.copyOf()), 0.0)
  }

  @Test
  fun meanAbsDiffAveragesPerPixelDifference() {
    val a = IntArray(4) { 10 }
    val b = intArrayOf(10, 14, 10, 18)
    assertEquals(3.0, FrameSignature.meanAbsDiff(a, b), 0.0)
  }

  @Test
  fun emptySignaturesNeverCountAsTheSameFrame() {
    assertTrue(FrameSignature.meanAbsDiff(IntArray(0), IntArray(0)) > FrameSignature.SAME_FRAME)
  }

  @Test
  fun aSlightBrightnessFlickerIsTheSameFrameButASceneChangeIsNot() {
    val base = IntArray(256) { 100 }
    val flicker = IntArray(256) { 101 }
    val cut = IntArray(256) { if (it < 128) 20 else 220 }
    assertTrue(FrameSignature.meanAbsDiff(base, flicker) < FrameSignature.SAME_FRAME)
    assertTrue(FrameSignature.meanAbsDiff(base, cut) > FrameSignature.SAME_FRAME)
  }
}
