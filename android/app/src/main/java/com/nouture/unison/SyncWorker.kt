package com.nouture.unison

import android.content.Context
import android.os.Build
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import androidx.work.workDataOf

/**
 * Runs syncs as WorkManager jobs, so a sync started on save keeps running if
 * the app is backgrounded right after (instead of being frozen mid-transfer).
 */
class SyncWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        NoutureHome.init(applicationContext)
        val profile = inputData.getString(KEY_PROFILE) ?: return Result.failure()
        UnisonRunner.runQueued(profile, inputData.getString(KEY_REASON) ?: "manual")
        return Result.success()
    }

    companion object {
        private const val KEY_PROFILE = "profile"
        private const val KEY_REASON = "reason"

        fun enqueue(context: Context, profile: String, reason: String) {
            val request = OneTimeWorkRequestBuilder<SyncWorker>()
                .setInputData(workDataOf(KEY_PROFILE to profile, KEY_REASON to reason))
                .apply {
                    // Below Android 12 expedited work needs a foreground notification
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                    }
                }
                .build()
            WorkManager.getInstance(context)
                .enqueueUniqueWork("sync-$profile", ExistingWorkPolicy.APPEND_OR_REPLACE, request)
        }
    }
}
