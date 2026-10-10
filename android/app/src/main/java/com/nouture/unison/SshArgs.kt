package com.nouture.unison

/**
 * The ssh invocation unison hands to -sshcmd, e.g.
 *   [sshargs...] -p 2222 -l me backup -e none unison -server
 */
data class SshArgs(
    val host: String,
    val user: String? = null,
    val port: Int? = null,
    val identities: List<String> = emptyList(),
    val options: Map<String, String> = emptyMap(),
    val command: String,
) {
    companion object {
        // ssh(1) options that take a value; every other letter is a plain flag
        private const val WITH_VALUE = "BbcDEeFIiJLlmOoPpQRSWw"

        fun parse(argv: List<String>): SshArgs {
            var user: String? = null
            var port: Int? = null
            val identities = mutableListOf<String>()
            val options = linkedMapOf<String, String>()

            var i = 0
            /** Parses options from argv[i] on; returns false at "--" (no more options). */
            fun parseOptions(): Boolean {
                while (i < argv.size) {
                    val arg = argv[i]
                    if (arg == "--") {
                        i++
                        return false
                    }
                    if (!arg.startsWith("-") || arg.length < 2) return true

                    // Flags can be clustered (-TC) and a value can be attached (-p2222)
                    for (j in 1 until arg.length) {
                        val flag = arg[j]
                        if (flag !in WITH_VALUE) continue
                        val value = if (j + 1 < arg.length) arg.substring(j + 1)
                        else argv.getOrNull(++i) ?: throw IllegalArgumentException("ssh: option -$flag needs a value")
                        // Like OpenSSH, the first value given wins
                        when (flag) {
                            'p' -> port = port ?: value.toIntOrNull() ?: throw IllegalArgumentException("ssh: bad port '$value'")
                            'l' -> user = user ?: value
                            'i' -> identities += value
                            'o' -> parseOption(value)?.let { (key, v) -> options.putIfAbsent(key, v) }
                        }
                        break
                    }
                    i++
                }
                return true
            }

            // Like OpenSSH, options may also follow the host ("backup -e none unison -server")
            val moreOptions = parseOptions()
            val destination = argv.getOrNull(i++) ?: throw IllegalArgumentException("ssh: no host given")
            val at = destination.lastIndexOf('@')
            val host = if (at > 0) destination.substring(at + 1) else destination
            if (at > 0) user = user ?: destination.substring(0, at)
            if (moreOptions) parseOptions()

            options.remove("port")?.let { port = port ?: it.toIntOrNull() }
            options.remove("user")?.let { user = user ?: it }
            options.remove("identityfile")?.let { identities += it }

            return SshArgs(
                host = host,
                user = user,
                port = port,
                identities = identities,
                options = options,
                command = argv.drop(i).joinToString(" "),
            )
        }

        /** "-o Key=Value" or "-o Key Value"; keys are case-insensitive like in ssh. */
        private fun parseOption(option: String): Pair<String, String>? {
            val match = Regex("""^\s*(\w+)\s*(?:=|\s)\s*(.*?)\s*$""").find(option) ?: return null
            return match.groupValues[1].lowercase() to match.groupValues[2]
        }
    }
}
