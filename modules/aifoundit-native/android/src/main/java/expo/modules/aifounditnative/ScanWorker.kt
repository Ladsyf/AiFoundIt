package expo.modules.aifounditnative

import android.content.Context
import android.provider.MediaStore
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException

/**
 * Indexes in the background with the settings the app saved, so it works after a reboot without
 * opening the app. Results wait in the inbox and are merged into the search database the next time the app opens.
 */
class ScanWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
  override suspend fun doWork(): Result {
    val fromTrigger = inputData.getBoolean(Scheduler.KEY_TRIGGER, false)
    return try {
      AiState.init(applicationContext)
      if (!AiState.restoreConfig()) {
        Result.success()
      } else {
        AiState.ensureModels(applicationContext, loadChat = false)
        Scanner.runScan { }
        Result.success()
      }
    } catch (e: CancellationException) {
      throw e
    } catch (t: Throwable) {
      if (runAttemptCount < 2) Result.retry() else Result.failure()
    } finally {
      if (fromTrigger) Scheduler.watchMedia(applicationContext, ExistingWorkPolicy.APPEND_OR_REPLACE)
    }
  }
}

object Scheduler {
  const val KEY_TRIGGER = "trigger"
  private const val PERIODIC = "aifoundit-scan"
  private const val TRIGGER = "aifoundit-media-trigger"

  fun schedule(ctx: Context, everyHours: Int, requireCharging: Boolean, watchNewMedia: Boolean) {
    val wm = WorkManager.getInstance(ctx)
    val constraints = Constraints.Builder()
      .setRequiresCharging(requireCharging)
      .setRequiresBatteryNotLow(true)
      .build()
    val periodic = PeriodicWorkRequestBuilder<ScanWorker>(everyHours.coerceAtLeast(1).toLong(), TimeUnit.HOURS)
      .setConstraints(constraints)
      .build()
    wm.enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.UPDATE, periodic)
    if (watchNewMedia) {
      watchMedia(ctx, ExistingWorkPolicy.REPLACE)
    } else {
      wm.cancelUniqueWork(TRIGGER)
    }
  }

  /** Runs once when photos, videos or audio change, then the worker queues the next one itself. */
  fun watchMedia(ctx: Context, policy: ExistingWorkPolicy) {
    val constraints = Constraints.Builder()
      .addContentUriTrigger(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, true)
      .addContentUriTrigger(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, true)
      .addContentUriTrigger(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, true)
      .setTriggerContentUpdateDelay(30, TimeUnit.SECONDS)
      .setTriggerContentMaxDelay(5, TimeUnit.MINUTES)
      .setRequiresBatteryNotLow(true)
      .build()
    val request = OneTimeWorkRequestBuilder<ScanWorker>()
      .setConstraints(constraints)
      .setInputData(workDataOf(KEY_TRIGGER to true))
      .build()
    WorkManager.getInstance(ctx).enqueueUniqueWork(TRIGGER, policy, request)
  }

  fun cancel(ctx: Context) {
    val wm = WorkManager.getInstance(ctx)
    wm.cancelUniqueWork(PERIODIC)
    wm.cancelUniqueWork(TRIGGER)
  }
}
