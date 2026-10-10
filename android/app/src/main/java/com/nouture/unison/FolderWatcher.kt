package com.nouture.unison

import android.content.Context
import android.os.FileObserver
import android.os.Handler
import android.os.Looper
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * Watches the local roots of auto-sync profiles and syncs after changes made
 * by other apps (Orgzly, Markor, ...): Android's "after-save-hook" for files
 * Nouture didn't save itself.
 */
object FolderWatcher {
    private const val EVENTS = FileObserver.CLOSE_WRITE or FileObserver.MOVED_TO or
        FileObserver.MOVED_FROM or FileObserver.DELETE or FileObserver.CREATE
    private const val DEBOUNCE_MS = 3_000L
    private const val SYNC_GRACE_MS = 1_500L
    private const val SELF_WRITE_MS = 3_000L

    private val handler = Handler(Looper.getMainLooper())
    private val observers = mutableListOf<FileObserver>()
    private val scheduled = mutableMapOf<String, Runnable>()
    private val selfWrites = ConcurrentHashMap<String, Long>()

    /** Nouture syncs its own saves explicitly; don't sync them a second time. */
    fun noteSelfWrite(file: File) {
        selfWrites[file.path] = System.currentTimeMillis()
    }

    @Synchronized
    fun refresh(context: Context) {
        val app = context.applicationContext
        observers.forEach { it.stopWatching() }
        observers.clear()

        for (profile in Profiles.list().filter(SyncState::isAutoSync)) {
            val root = Profiles.localRoot(profile)?.takeIf { it.isDirectory } ?: continue
            root.walkTopDown()
                .onEnter { it == root || !it.name.startsWith(".") }
                .filter { it.isDirectory }
                .forEach { dir -> observers += watch(app, profile, dir) }
        }
    }

    @Suppress("DEPRECATION") // the File constructor needs API 29
    private fun watch(context: Context, profile: String, dir: File) =
        object : FileObserver(dir.path, EVENTS) {
            override fun onEvent(event: Int, path: String?) {
                // Skips unison's .unison.*.tmp files and our own temp files
                if (path == null || path.startsWith(".")) return
                val file = File(dir, path)

                if (event and FileObserver.CREATE != 0) {
                    if (file.isDirectory) handler.post { refresh(context) }
                    return // files also get CLOSE_WRITE
                }
                val selfWrite = selfWrites[file.path]
                if (selfWrite != null && System.currentTimeMillis() - selfWrite < SELF_WRITE_MS) return
                if (UnisonRunner.isBusy(profile, SYNC_GRACE_MS)) return

                handler.post { schedule(context, profile) }
            }
        }.also { it.startWatching() }

    private fun schedule(context: Context, profile: String) {
        scheduled.remove(profile)?.let(handler::removeCallbacks)
        val run = Runnable {
            scheduled.remove(profile)
            UnisonRunner.request(context, profile, "watch")
        }
        scheduled[profile] = run
        handler.postDelayed(run, DEBOUNCE_MS)
    }
}
