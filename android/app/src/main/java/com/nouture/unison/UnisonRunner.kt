package com.nouture.unison

import android.content.Context
import android.util.Log
import java.io.Reader
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.TimeUnit

/**
 * Runs the bundled unison binary, the way Emacs' sync-to-unison does:
 * `unison <profile> -ui text` in batch mode, one run per profile at a time.
 * Unlike Emacs, a request arriving mid-run isn't dropped: it causes one rerun.
 */
object UnisonRunner {
    interface Listener {
        fun onStarted(profile: String, reason: String) {}
        fun onOutput(profile: String, line: String) {}
        fun onFinished(result: SyncResult) {}
    }

    private const val TAG = "UnisonRunner"
    private const val TIMEOUT_MINUTES = 9L // WorkManager stops workers after 10

    /** The text UI's progress bar, e.g. " 99%  3/6  (33.6 KiB of 33.6 KiB) ..." */
    private val PROGRESS = Regex("""^\s*\d+%\s+\d+/\d+""")

    private val listeners = CopyOnWriteArraySet<Listener>()
    private val lock = Any()
    private val queued = mutableSetOf<String>()
    private val running = mutableSetOf<String>()
    private val rerun = mutableSetOf<String>()
    private val finishedAt = ConcurrentHashMap<String, Long>()

    fun addListener(listener: Listener) = listeners.add(listener)

    fun removeListener(listener: Listener) = listeners.remove(listener)

    fun isRunning(profile: String) = synchronized(lock) { profile in running }

    /** True while syncing and for [graceMs] after, so unison's own writes don't retrigger it. */
    fun isBusy(profile: String, graceMs: Long) =
        isRunning(profile) || System.currentTimeMillis() - (finishedAt[profile] ?: 0) < graceMs

    fun request(context: Context, profile: String, reason: String) {
        synchronized(lock) {
            if (profile in running || profile in queued) {
                rerun += profile
                return
            }
            queued += profile
        }
        SyncWorker.enqueue(context, profile, reason)
    }

    /** Called by [SyncWorker]: syncs until no rerun was requested meanwhile. */
    fun runQueued(profile: String, reason: String) {
        synchronized(lock) {
            queued -= profile
            running += profile
        }
        try {
            var why = reason
            do {
                run(profile, why)
                why = "rerun"
            } while (synchronized(lock) { rerun.remove(profile) })
        } finally {
            synchronized(lock) { running -= profile }
        }
    }

    private fun run(profile: String, reason: String): SyncResult {
        listeners.forEach { it.onStarted(profile, reason) }
        val startedAt = System.currentTimeMillis()
        val output = mutableListOf<String>()
        val log = { line: String ->
            synchronized(output) { output += line }
            listeners.forEach { it.onOutput(profile, line) }
        }

        var exitCode = -1
        var bridgeFailure: Exception? = null
        var error: String? = null
        try {
            Profiles.localRoot(profile)?.mkdirs()
            SshBridge(log).use { bridge ->
                // Android kills apps (and their unison) at will, leaving archive locks
                // behind. Runs are single-flight per profile, so any lock is stale.
                val process = ProcessBuilder(
                    NoutureHome.unisonBinary.path, profile,
                    "-batch", "-ui", "text", "-ignorelocks", "-sshcmd", NoutureHome.sshHelper.path,
                )
                    .directory(NoutureHome.home)
                    .redirectErrorStream(true)
                    .apply {
                        environment().putAll(
                            mapOf(
                                "HOME" to NoutureHome.home.path,
                                "UNISON" to NoutureHome.unisonDir.path,
                                "UNISONLOCALHOSTNAME" to NoutureHome.hostname,
                                "TMPDIR" to NoutureHome.tmpDir.path,
                                "NOUTURE_SSH_SOCKET" to bridge.socketName,
                                "NOUTURE_SSH_TOKEN" to bridge.token,
                            )
                        )
                    }
                    .start()
                process.outputStream.close()

                val reader = Thread {
                    process.inputStream.reader().forEachLine { line ->
                        if (!PROGRESS.containsMatchIn(line)) log(line)
                    }
                }.apply { start() }
                if (process.waitFor(TIMEOUT_MINUTES, TimeUnit.MINUTES)) {
                    exitCode = process.exitValue()
                } else {
                    process.destroyForcibly()
                    error = "unison timed out after $TIMEOUT_MINUTES minutes"
                }
                reader.join(2_000)
                bridgeFailure = bridge.failure
            }
        } catch (e: Exception) {
            Log.e(TAG, "sync of $profile failed", e)
            error = e.message ?: e.toString()
        }

        val result = SyncResult.parse(
            profile, reason, startedAt, System.currentTimeMillis(), exitCode,
            synchronized(output) { output.toList() }, bridgeFailure, error,
        )
        finishedAt[profile] = result.finishedAt
        SyncState.saveResult(result)
        listeners.forEach { it.onFinished(result) }
        return result
    }

    /** Text UI progress uses '\r'; treat it as a line break. */
    private fun Reader.forEachLine(onLine: (String) -> Unit) {
        val line = StringBuilder()
        val buffer = CharArray(4096)
        while (true) {
            val n = read(buffer)
            if (n < 0) break
            for (i in 0 until n) {
                val c = buffer[i]
                if (c == '\n' || c == '\r') {
                    if (line.isNotBlank()) onLine(line.toString().trimEnd())
                    line.clear()
                } else {
                    line.append(c)
                }
            }
        }
        if (line.isNotBlank()) onLine(line.toString().trimEnd())
    }
}
