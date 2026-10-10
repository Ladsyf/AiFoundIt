package expo.modules.aifounditnative

import android.graphics.Bitmap
import kotlin.math.abs

object FrameSignature {
  private const val SIDE = 16
  const val SAME_FRAME = 2.5

  fun of(bitmap: Bitmap): IntArray {
    val small = Bitmap.createScaledBitmap(bitmap, SIDE, SIDE, true)
    val pixels = IntArray(SIDE * SIDE)
    small.getPixels(pixels, 0, SIDE, 0, 0, SIDE, SIDE)
    if (small !== bitmap) small.recycle()
    return IntArray(pixels.size) { luma(pixels[it]) }
  }

  fun luma(argb: Int): Int =
    (((argb shr 16) and 0xFF) * 299 + ((argb shr 8) and 0xFF) * 587 + (argb and 0xFF) * 114) / 1000

  fun meanAbsDiff(a: IntArray, b: IntArray): Double {
    val n = minOf(a.size, b.size)
    if (n == 0) return Double.MAX_VALUE
    var sum = 0L
    for (i in 0 until n) sum += abs(a[i] - b[i])
    return sum.toDouble() / n
  }
}
