package com.nouture.unison

import java.io.File

/**
 * The last version of each file that both replicas agreed on, kept in
 * ~/.nouture/base/<profile>/<path> after every sync. When both sides change
 * a file, this is the common ancestor a three-way merge starts from.
 * (Unison's archive only keeps fingerprints, not contents.)
 */
object SyncBase {
    /** Merging only makes sense for text files of reasonable size */
    private const val MAX_SIZE = 2L * 1024 * 1024

    private fun dir(profile: String) = File(NoutureHome.stateDir, "base/$profile")

    fun read(profile: String, path: String): ByteArray? =
        File(dir(profile), path).takeIf { it.isFile }?.readBytes()

    /**
     * Records the synced versions after a run. Skipped (conflicting) and
     * failed paths keep their previous base; [only] limits a -path run.
     */
    @Synchronized
    fun record(profile: String, result: SyncResult, only: List<String>?) {
        val root = Profiles.localRoot(profile)?.takeIf { it.isDirectory } ?: return
        val base = dir(profile)
        val keep = (result.conflicts + result.failedPaths).toSet()

        val paths = only ?: root.walkTopDown()
            .onEnter { it == root || !it.name.startsWith(".") }
            .filter { it.isFile && !it.name.startsWith(".") }
            .map { it.relativeTo(root).path }
            .toList()

        for (path in paths) {
            if (path in keep || keep.any { path.startsWith("$it/") }) continue
            val local = File(root, path)
            val copy = File(base, path)
            if (!local.isFile || local.length() > MAX_SIZE) {
                copy.delete()
                continue
            }
            val bytes = local.readBytes()
            if (copy.isFile && copy.readBytes().contentEquals(bytes)) continue
            copy.parentFile?.mkdirs()
            copy.writeBytes(bytes)
        }

        // After a full run, forget files that no longer exist on Android
        if (only == null && base.isDirectory) {
            base.walkBottomUp().forEach { copy ->
                val path = copy.relativeTo(base).path
                if (copy.isFile && !File(root, path).isFile && path !in keep) copy.delete()
                if (copy.isDirectory && copy != base && copy.list().isNullOrEmpty()) copy.delete()
            }
        }
    }

    fun forget(profile: String) {
        dir(profile).deleteRecursively()
    }
}
