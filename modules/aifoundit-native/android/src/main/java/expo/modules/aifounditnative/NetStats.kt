package expo.modules.aifounditnative

import android.net.TrafficStats
import android.os.Process

/**
 * Network accounting for the privacy counter.
 *
 * Model downloads are the only thing this app ever fetches, and a multi-gigabyte download makes the
 * phone send tens of megabytes of TCP acknowledgements. Those are counted separately so that
 * "bytes sent" stays an honest measure of what searching and indexing send (nothing).
 * Both numbers cover the time since this process started.
 */
object NetStats {
  private val uid = Process.myUid()
  private var baseTx = -1L
  private var activeDownloads = 0
  private var windowTx = 0L
  private var windowRx = 0L
  private var downloadTx = 0L
  private var downloadRx = 0L

  private fun tx(): Long = TrafficStats.getUidTxBytes(uid).coerceAtLeast(0L)
  private fun rx(): Long = TrafficStats.getUidRxBytes(uid).coerceAtLeast(0L)

  @Synchronized
  fun init() {
    if (baseTx < 0) baseTx = tx()
  }

  @Synchronized
  fun beginDownload() {
    init()
    if (activeDownloads++ == 0) {
      windowTx = tx()
      windowRx = rx()
    }
  }

  @Synchronized
  fun endDownload() {
    if (activeDownloads > 0 && --activeDownloads == 0) {
      downloadTx += (tx() - windowTx).coerceAtLeast(0L)
      downloadRx += (rx() - windowRx).coerceAtLeast(0L)
    }
  }

  /** Bytes sent since launch, not counting model-download traffic. */
  @Synchronized
  fun bytesSentOutsideDownloads(): Long {
    init()
    val now = tx()
    val inDownload = downloadTx + if (activeDownloads > 0) (now - windowTx).coerceAtLeast(0L) else 0L
    return ((now - baseTx) - inDownload).coerceAtLeast(0L)
  }

  /** Received and sent bytes spent on model downloads since launch. */
  @Synchronized
  fun downloadTraffic(): Pair<Long, Long> {
    val liveTx = if (activeDownloads > 0) (tx() - windowTx).coerceAtLeast(0L) else 0L
    val liveRx = if (activeDownloads > 0) (rx() - windowRx).coerceAtLeast(0L) else 0L
    return Pair(downloadRx + liveRx, downloadTx + liveTx)
  }
}
