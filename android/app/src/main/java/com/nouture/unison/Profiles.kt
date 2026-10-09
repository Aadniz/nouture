package com.nouture.unison

import java.io.File

/** Unison profiles in ~/.unison/<name>.prf, read just enough to know their roots. */
object Profiles {
    data class Remote(val user: String?, val host: String, val port: Int?, val path: String)

    private val NAME = Regex("^[A-Za-z0-9._-]+$")
    private val PREF = Regex("""^\s*([A-Za-z]+)\s*=\s*(.*?)\s*$""")
    private val DIRECTIVE = Regex("""^\s*(include\??|source)\s+(.+?)\s*$""")
    private val SSH_ROOT = Regex("""^ssh://(?:([^@/]+)@)?([^:/]+|\[[^\]]+\])(?::(\d+))?/(.*)$""")

    fun file(name: String): File {
        require(NAME.matches(name)) { "Invalid profile name: $name" }
        return File(NoutureHome.unisonDir, "$name.prf")
    }

    fun list(): List<String> =
        NoutureHome.unisonDir.listFiles { f -> f.isFile && f.name.endsWith(".prf") }.orEmpty()
            .map { it.name.removeSuffix(".prf") }
            .filter { NAME.matches(it) }
            .sorted()

    fun read(name: String): String = file(name).readText()

    fun write(name: String, text: String) = file(name).writeText(text)

    fun delete(name: String) = file(name).delete()

    /** All values of a preference, following include/source like unison does. */
    fun values(name: String, key: String): List<String> = values(file(name), key, mutableSetOf())

    fun roots(name: String) = values(name, "root")

    fun localRoot(name: String): File? = roots(name).firstOrNull { "://" !in it }?.let(NoutureHome::expand)

    fun remoteRoot(name: String): Remote? = roots(name).firstNotNullOfOrNull { root ->
        SSH_ROOT.find(root)?.let { m ->
            Remote(
                user = m.groupValues[1].ifEmpty { null },
                host = m.groupValues[2].removePrefix("[").removeSuffix("]"),
                port = m.groupValues[3].toIntOrNull(),
                path = m.groupValues[4],
            )
        }
    }

    private fun values(file: File, key: String, seen: MutableSet<String>): List<String> {
        if (!file.isFile || !seen.add(file.canonicalPath)) return emptyList()
        return file.readLines().flatMap { line ->
            if (line.trimStart().startsWith("#")) return@flatMap emptyList()
            DIRECTIVE.find(line)?.let { m ->
                val target = m.groupValues[2]
                val base = if (m.groupValues[1] == "source") file.parentFile else NoutureHome.unisonDir
                val included = File(base, target).takeIf { it.isFile } ?: File(base, "$target.prf")
                return@flatMap values(included, key, seen)
            }
            PREF.find(line)?.takeIf { it.groupValues[1] == key }?.let { listOf(it.groupValues[2]) }.orEmpty()
        }
    }
}
