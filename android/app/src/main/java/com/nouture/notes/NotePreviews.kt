package com.nouture.notes

import com.nouture.unison.NoutureHome
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

/**
 * The most recently edited org files, with the lines that changed last.
 * Each file's previous version is kept in ~/.nouture/snapshots, so edits from
 * anywhere (a sync from the desktop, Nouture, other apps) can be located by
 * comparing the two.
 */
object NotePreviews {
    data class Note(val path: String, val name: String, val mtime: Long, val text: String, val edited: IntRange?)

    private val dir get() = File(NoutureHome.stateDir, "snapshots")
    private val indexFile get() = File(dir, "index.json")

    /** The `limit` most recently modified notes under `roots`, and how many there are. */
    @Synchronized
    fun recent(roots: List<File>, limit: Int): Pair<List<Note>, Int> {
        dir.mkdirs()
        val index = runCatching { JSONObject(indexFile.readText()) }.getOrElse { JSONObject() }

        val files = roots.filter { it.isDirectory }
            .flatMap { root ->
                root.walkTopDown()
                    .onEnter { it == root || !it.name.startsWith(".") }
                    .filter { it.isFile && it.name.endsWith(".org") && !it.name.startsWith(".") }
                    .toList()
            }
            .distinct()
            .sortedWith(compareByDescending<File> { it.lastModified() }.thenBy { it.name })

        var dirty = false
        for (file in files) {
            val entry = index.optJSONObject(file.path)
            // Unchanged since last time? (size too: some tools keep the mtime)
            if (entry?.optLong("mtime") == file.lastModified() && entry.optLong("size") == file.length()) continue

            val text = file.readText()
            val snapshot = File(dir, sha1(file.path))
            val existed = snapshot.exists()
            val region = if (existed) changedRegion(lines(snapshot.readText()), lines(text)) else null
            snapshot.writeText(text)

            // Only touched (same text)? Keep pointing at the last real edit
            val keep = entry?.takeIf { existed && region == null && it.has("start") }
            index.put(file.path, JSONObject().apply {
                put("mtime", file.lastModified())
                put("size", file.length())
                when {
                    region != null -> put("start", region.first).put("end", region.last)
                    keep != null -> put("start", keep.getInt("start")).put("end", keep.getInt("end"))
                }
            })
            dirty = true
        }
        if (dirty) indexFile.writeText(index.toString())

        val notes = files.take(limit).map { file ->
            val entry = index.optJSONObject(file.path)
            Note(
                path = file.path,
                name = file.name,
                mtime = file.lastModified(),
                text = file.readText(),
                edited = entry?.takeIf { it.has("start") }?.let { it.getInt("start")..it.getInt("end") },
            )
        }
        return notes to files.size
    }

    /** Lines as the org parser numbers them */
    private fun lines(text: String) = text.split(Regex("\r\n|\n|\r"))

    /**
     * The lines of `new` that differ from `old`: everything between their
     * common beginning and common end. A pure deletion points at the line
     * after the removed ones.
     */
    fun changedRegion(old: List<String>, new: List<String>): IntRange? {
        if (old == new) return null
        var prefix = 0
        while (prefix < old.size && prefix < new.size && old[prefix] == new[prefix]) prefix++
        var suffix = 0
        while (
            suffix < old.size - prefix && suffix < new.size - prefix &&
            old[old.size - 1 - suffix] == new[new.size - 1 - suffix]
        ) suffix++
        val start = prefix.coerceAtMost(new.size - 1).coerceAtLeast(0)
        return start..(new.size - 1 - suffix).coerceAtLeast(start)
    }

    private fun sha1(text: String) =
        MessageDigest.getInstance("SHA-1").digest(text.toByteArray()).joinToString("") { "%02x".format(it) }
}
