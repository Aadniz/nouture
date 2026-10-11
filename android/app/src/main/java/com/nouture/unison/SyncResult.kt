package com.nouture.unison

import com.nouture.ssh.HostNotTrustedException
import org.json.JSONArray
import org.json.JSONObject

/** The outcome of one unison run, parsed from its text UI output. */
data class SyncResult(
    val profile: String,
    val reason: String,
    val startedAt: Long,
    val finishedAt: Long,
    /** unison: 0 ok, 1 some files skipped, 2 non-fatal failures, 3 fatal error */
    val exitCode: Int,
    val summary: String?,
    val transferred: Int,
    val skipped: Int,
    val failed: Int,
    val conflicts: List<String>,
    /** Why each conflict was skipped, e.g. "contents changed on both sides" */
    val conflictReasons: Map<String, String>,
    val failedPaths: List<String>,
    val changed: List<String>,
    val error: String?,
    val untrustedHost: HostNotTrustedException?,
    val output: List<String>,
) {
    /** Unison got through the run: everything not skipped or failed is in sync */
    val completed get() = summary != null && exitCode in 0..2

    fun toJson(): JSONObject = JSONObject().apply {
        put("profile", profile)
        put("reason", reason)
        put("startedAt", startedAt)
        put("finishedAt", finishedAt)
        put("exitCode", exitCode)
        put("summary", summary)
        put("transferred", transferred)
        put("skipped", skipped)
        put("failed", failed)
        put("conflicts", JSONArray(conflicts))
        put("conflictReasons", JSONObject(conflictReasons))
        put("failedPaths", JSONArray(failedPaths))
        put("changed", JSONArray(changed))
        put("error", error)
        put("untrustedHost", untrustedHost != null)
        // So the app can ask about the key right away, without connecting again
        put("unknownHostKey", untrustedHost?.let {
            JSONObject()
                .put("host", it.hostKey.host)
                .put("type", it.hostKey.type)
                .put("key", it.hostKey.key)
                .put("fingerprint", it.fingerprint)
        })
        put("output", JSONArray(output.takeLast(MAX_STORED_LINES)))
    }

    companion object {
        private const val MAX_STORED_LINES = 300

        private val SUMMARY = Regex("""^\s*(Synchronization (?:complete|incomplete) at .*|Nothing to do: .*)$""")
        private val COUNTS = Regex("""\((\d+) items? transferred, (\d+) skipped, (\d+) failed\)""")
        private val SKIPPED = Regex("""^\s*skipped: (.+?) \((.*)\)\s*$""")
        private val FAILED = Regex("""^\s*failed: (.+?)\s*$""")
        private val CHANGED = Regex("""^\[END] (?:Updating file|Copying|Deleting) (.+?)\s*$""")
        private val FATAL = Regex("""^\s*Fatal error.*""")

        fun parse(
            profile: String,
            reason: String,
            startedAt: Long,
            finishedAt: Long,
            exitCode: Int,
            output: List<String>,
            bridgeFailure: Exception?,
            error: String?,
        ): SyncResult {
            val summary = output.lastOrNull { SUMMARY.matches(it) }?.trim()
            val counts = summary?.let { COUNTS.find(it)?.groupValues }
            return SyncResult(
                profile = profile,
                reason = reason,
                startedAt = startedAt,
                finishedAt = finishedAt,
                exitCode = exitCode,
                summary = summary,
                transferred = counts?.get(1)?.toInt() ?: 0,
                skipped = counts?.get(2)?.toInt() ?: 0,
                failed = counts?.get(3)?.toInt() ?: 0,
                conflicts = output.mapNotNull { SKIPPED.find(it)?.groupValues?.get(1) }.distinct(),
                conflictReasons = output.mapNotNull { SKIPPED.find(it)?.groupValues }
                    .associate { it[1] to it[2] },
                failedPaths = output.mapNotNull { FAILED.find(it)?.groupValues?.get(1) }.distinct(),
                changed = output.mapNotNull { CHANGED.find(it)?.groupValues?.get(1) }.distinct(),
                error = error ?: bridgeFailure?.message
                    ?: output.lastOrNull { FATAL.matches(it) }?.trim()
                    ?: if (exitCode >= 2 || exitCode < 0) "unison exited with code $exitCode" else null,
                untrustedHost = bridgeFailure as? HostNotTrustedException,
                output = output,
            )
        }
    }
}
