package com.nouture.unison

import android.net.LocalServerSocket
import android.net.LocalSocket
import android.os.Process
import android.util.Log
import com.jcraft.jsch.ChannelExec
import com.nouture.ssh.SshSessions
import java.io.Closeable
import java.io.DataInputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.util.UUID
import kotlin.concurrent.thread

/**
 * Serves the noussh helper (unison's -sshcmd) over an abstract unix socket and
 * performs the SSH connection it asks for. One bridge per unison run.
 */
class SshBridge(private val log: (String) -> Unit) : Closeable {
    val socketName = "nouture-ssh-" + UUID.randomUUID()
    val token = UUID.randomUUID().toString()

    /** The last connection error, so the sync result can explain what happened. */
    @Volatile
    var failure: Exception? = null
        private set

    @Volatile
    private var closed = false
    private val server = LocalServerSocket(socketName)

    init {
        thread(name = "ssh-bridge", isDaemon = true) {
            while (!closed) {
                val client = try {
                    server.accept()
                } catch (e: IOException) {
                    break
                }
                thread(name = "ssh-bridge-conn", isDaemon = true) { client.use(::serve) }
            }
        }
    }

    private fun serve(client: LocalSocket) {
        // Abstract sockets are reachable by any app; only talk to our own processes
        if (client.peerCredentials.uid != Process.myUid()) return

        val input = DataInputStream(client.inputStream)
        val output = client.outputStream
        if (readString(input) != token) return
        val argv = List(readString(input).toInt()) { readString(input) }

        val args: SshArgs
        val session: com.jcraft.jsch.Session
        val channel: ChannelExec
        try {
            args = SshArgs.parse(argv)
            log("ssh ${args.user?.let { "$it@" } ?: ""}${args.host}${args.port?.let { ":$it" } ?: ""}: ${args.command}")
            session = SshSessions.open(
                SshSessions.Target(args.host, args.user, args.port, args.identities, args.options)
            )
            channel = session.openChannel("exec") as ChannelExec
            channel.setCommand(args.command)
            channel.setErrStream(LineLog { log("remote: $it") }, true)
        } catch (e: Exception) {
            failure = e
            Log.w(TAG, "ssh failed", e)
            output.write("ERR ${e.message.orEmpty().replace('\n', ' ')}\n".toByteArray())
            return
        }

        try {
            val remoteStdout = channel.inputStream
            val remoteStdin = channel.outputStream
            channel.connect(30_000)
            output.write("OK\n".toByteArray())
            output.flush()

            val upstream = thread(name = "ssh-bridge-up", isDaemon = true) {
                runCatching { copy(input, remoteStdin) }
                runCatching { remoteStdin.close() } // sends EOF to the remote command
            }
            runCatching { copy(remoteStdout, output) }
            runCatching { client.shutdownOutput() }
            upstream.join(1_000)
        } catch (e: Exception) {
            failure = e
            Log.w(TAG, "ssh channel failed", e)
        } finally {
            channel.disconnect()
            session.disconnect()
        }
    }

    override fun close() {
        closed = true
        runCatching { server.close() }
    }

    private fun readString(input: DataInputStream): String {
        val bytes = ByteArray(input.readInt())
        input.readFully(bytes)
        return String(bytes)
    }

    private fun copy(from: InputStream, to: OutputStream) {
        val buffer = ByteArray(64 * 1024)
        while (true) {
            val n = from.read(buffer)
            if (n < 0) break
            to.write(buffer, 0, n)
            to.flush()
        }
    }

    /** Collects bytes into lines, for the remote command's stderr. */
    private class LineLog(private val onLine: (String) -> Unit) : OutputStream() {
        private val line = java.io.ByteArrayOutputStream()

        override fun write(b: Int) {
            if (b == '\n'.code) flush() else line.write(b)
        }

        override fun flush() {
            if (line.size() > 0) onLine(line.toString(Charsets.UTF_8.name()).trimEnd('\r'))
            line.reset()
        }

        override fun close() = flush()
    }

    companion object {
        private const val TAG = "SshBridge"
    }
}
