package expo.modules.aifounditnative

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

class ScanWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
  override suspend fun doWork(): Result {
    return try {
      AiState.init(applicationContext)
      Scanner.runScan {}
      Result.success()
    } catch (t: Throwable) {
      if (runAttemptCount < 2) Result.retry() else Result.failure()
    }
  }
}
