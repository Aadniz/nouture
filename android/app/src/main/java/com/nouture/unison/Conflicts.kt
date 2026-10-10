package com.nouture.unison

import com.jcraft.jsch.ChannelSftp
import com.jcraft.jsch.JSchException
import com.jcraft.jsch.SftpException
import com.nouture.ssh.SshSessions
import java.io.ByteArrayOutputStream
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Reading both sides of a conflicting file, and the file operations of resolving it. */
object Conflicts {
    private const val MAX_SIZE = 2L * 1024 * 1024

    /** One replica's version: [bytes] is null if missing or too large to show */
    data class Side(val exists: Boolean, val size: Long, val bytes: ByteArray?, val mtime: Long?)

    /** The Android side's mtime isn't shown: Android's shared storage doesn't keep it reliably */
    fun local(profile: String, path: String): Side {
        val file = File(localRoot(profile), path)
        if (!file.isFile) return Side(false, 0, null, null)
        return Side(true, file.length(), file.takeIf { it.length() <= MAX_SIZE }?.readBytes(), null)
    }

    /** The server's version, read over SFTP (or `cat` if the server has no SFTP) */
    fun remote(profile: String, path: String): Side {
        val remote = Profiles.remoteRoot(profile)
            ?: throw IllegalArgumentException("Profile $profile has no ssh:// root")
        // unison: ssh://host//abs is an absolute path, ssh://host/rel is relative to the home dir
        val file = if (remote.path.isEmpty()) path else "${remote.path.trimEnd('/')}/$path"
        val session = SshSessions.open(SshSessions.Target(remote.host, remote.user, remote.port))
        try {
            val sftp = try {
                (session.openChannel("sftp") as ChannelSftp).apply { connect(15_000) }
            } catch (e: JSchException) {
                return remoteByCat(session, file)
            }
            try {
                val attrs = try {
                    sftp.stat(file)
                } catch (e: SftpException) {
                    if (e.id == ChannelSftp.SSH_FX_NO_SUCH_FILE) return Side(false, 0, null, null)
                    throw e
                }
                val bytes = if (attrs.size > MAX_SIZE) null else ByteArrayOutputStream().also { sftp.get(file, it) }.toByteArray()
                return Side(true, attrs.size, bytes, attrs.mTime * 1000L)
            } finally {
                sftp.disconnect()
            }
        } finally {
            session.disconnect()
        }
    }

    private fun remoteByCat(session: com.jcraft.jsch.Session, file: String): Side {
        val (bytes, status) = SshSessions.execBytes(session, "cat -- ${shellQuote(file)}")
        return if (status == 0) Side(true, bytes.size.toLong(), bytes, null) else Side(false, 0, null, null)
    }

    /**
     * Copies Android's version next to the file, e.g. "notes (android 2026-10-10).org",
     * so "keep both" can sync it as a new file. Returns its path in the replica.
     */
    fun copyLocal(profile: String, path: String): String {
        val root = localRoot(profile)
        val file = File(root, path)
        val date = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(Date())
        val stem = file.name.substringBeforeLast('.', file.name)
        val ext = file.name.substring(stem.length)
        var n = 1
        var copy: File
        do {
            val suffix = if (n == 1) "" else " $n"
            copy = File(file.parentFile, "$stem (android $date$suffix)$ext")
            n++
        } while (copy.exists())
        writeAtomically(copy, file.readBytes())
        return copy.relativeTo(root).path
    }

    /** Replaces Android's version, e.g. with a merge result */
    fun writeLocal(profile: String, path: String, bytes: ByteArray) =
        writeAtomically(File(localRoot(profile), path), bytes)

    private fun writeAtomically(file: File, bytes: ByteArray) {
        val tmp = File(file.parentFile, ".nouture-${file.name}.tmp")
        tmp.writeBytes(bytes)
        FolderWatcher.noteSelfWrite(file)
        if (!tmp.renameTo(file)) {
            tmp.delete()
            throw IllegalStateException("Could not write ${file.name}")
        }
    }

    private fun localRoot(profile: String) =
        Profiles.localRoot(profile) ?: throw IllegalArgumentException("Profile $profile has no local root")

    /** Single quotes work in sh, bash, zsh and fish alike */
    private fun shellQuote(s: String) = "'" + s.replace("'", "'\\''") + "'"
}
