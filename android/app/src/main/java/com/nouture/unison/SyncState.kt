package com.nouture.unison

import org.json.JSONObject
import java.io.File

/**
 * Per-profile settings and last results, kept natively so background syncs
 * (resume, folder watcher, WorkManager) work without the web view.
 */
object SyncState {
    private val file get() = File(NoutureHome.stateDir, "state.json")
    private var state: JSONObject? = null

    @Synchronized
    private fun state(): JSONObject {
        state?.let { return it }
        val loaded = runCatching { JSONObject(file.readText()) }.getOrElse { JSONObject() }
        state = loaded
        return loaded
    }

    @Synchronized
    private fun save() {
        val tmp = File(file.parentFile, "${file.name}.tmp")
        tmp.writeText(state().toString())
        tmp.renameTo(file)
    }

    private fun section(name: String): JSONObject =
        state().optJSONObject(name) ?: JSONObject().also { state().put(name, it) }

    /** Profiles sync automatically unless switched off, like the Emacs hooks. */
    @Synchronized
    fun isAutoSync(profile: String): Boolean = section("autoSync").optBoolean(profile, true)

    @Synchronized
    fun setAutoSync(profile: String, enabled: Boolean) {
        section("autoSync").put(profile, enabled)
        save()
    }

    @Synchronized
    fun lastResult(profile: String): JSONObject? = section("results").optJSONObject(profile)

    @Synchronized
    fun saveResult(result: SyncResult) {
        section("results").put(result.profile, result.toJson())
        if (result.completed) section("synced").put(result.profile, result.finishedAt)
        save()
    }

    /**
     * When the profile last synced all the way: a failed run doesn't count.
     * Results saved before this was kept count when they completed.
     */
    @Synchronized
    fun lastSyncedAt(profile: String): Long? {
        section("synced").optLong(profile, 0L).takeIf { it > 0 }?.let { return it }
        val last = lastResult(profile) ?: return null
        val completed = !last.isNull("summary") && last.optInt("exitCode", -1) in 0..2
        return if (completed) last.optLong("finishedAt") else null
    }

    @Synchronized
    fun forget(profile: String) {
        section("autoSync").remove(profile)
        section("results").remove(profile)
        section("synced").remove(profile)
        save()
    }
}
