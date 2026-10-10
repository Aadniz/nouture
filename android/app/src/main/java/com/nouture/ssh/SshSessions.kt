package com.nouture.ssh

import com.jcraft.jsch.ConfigRepository
import com.jcraft.jsch.HostKey
import com.jcraft.jsch.JSch
import com.jcraft.jsch.JSchChangedHostKeyException
import com.jcraft.jsch.JSchException
import com.jcraft.jsch.JSchUnknownHostKeyException
import com.jcraft.jsch.OpenSSHConfig
import com.jcraft.jsch.Session
import com.nouture.unison.NoutureHome
import java.io.File

class HostNotTrustedException(val hostKey: HostKey, val fingerprint: String) :
    Exception("Host ${hostKey.host} is not trusted yet. Press \"Test connection\" in Nouture to review its key.")

class HostKeyChangedException(host: String) :
    Exception("The host key of $host has CHANGED. Refusing to connect; remove the old key from known_hosts if this is expected.")

class AuthFailedException(target: String) :
    Exception("Authentication failed for $target. Is this Android device's public key in the server's authorized_keys?")

/** Opens JSch sessions the way OpenSSH would, using ~/.ssh/config, keys and known_hosts. */
object SshSessions {
    private val DEFAULT_IDENTITIES = listOf("id_ed25519", "id_ecdsa", "id_rsa")

    data class Target(
        val host: String,
        val user: String? = null,
        val port: Int? = null,
        val identities: List<String> = emptyList(),
        val options: Map<String, String> = emptyMap(),
    )

    val configFile get() = File(NoutureHome.sshDir, "config")
    val knownHostsFile get() = File(NoutureHome.sshDir, "known_hosts")

    fun open(target: Target, timeoutMs: Int = 30_000): Session {
        val jsch = JSch()
        val config = if (configFile.exists()) OpenSSHConfig.parseFile(configFile.path) else null
        val hostConfig = config?.getConfig(target.host) ?: ConfigRepository.defaultConfig

        // Command-line values win over ~/.ssh/config, like in OpenSSH
        jsch.configRepository = ConfigRepository { host ->
            val base = config?.getConfig(host) ?: ConfigRepository.defaultConfig
            if (host != target.host) base
            else object : ConfigRepository.Config by base {
                override fun getPort() = target.port ?: base.port
                override fun getHostname() = target.options["hostname"] ?: base.hostname
            }
        }

        knownHostsFile.createNewFile()
        jsch.setKnownHosts(knownHostsFile.path)

        target.identities.forEach { jsch.addIdentity(NoutureHome.expand(it).path) }
        // Like OpenSSH: without IdentityFile, try the default key names
        if (target.identities.isEmpty() && hostConfig.getValues("IdentityFile").isNullOrEmpty()) {
            DEFAULT_IDENTITIES.map { File(NoutureHome.sshDir, it) }
                .filter { it.exists() }
                .forEach { jsch.addIdentity(it.path) }
        }

        val user = target.user ?: hostConfig.user
            ?: throw IllegalArgumentException("No user for ${target.host}: add \"User\" to ~/.ssh/config or use user@host")

        val session = jsch.getSession(user, target.host, target.port ?: 22)
        session.setConfig("StrictHostKeyChecking", "yes")
        session.setConfig("PreferredAuthentications", "publickey")
        session.serverAliveInterval = 15_000

        try {
            session.connect(timeoutMs)
        } catch (e: JSchUnknownHostKeyException) {
            val key = session.hostKey ?: throw e
            throw HostNotTrustedException(key, key.getFingerPrint(jsch))
        } catch (e: JSchChangedHostKeyException) {
            throw HostKeyChangedException(session.host)
        } catch (e: JSchException) {
            val message = e.message.orEmpty()
            if (message.contains("Auth fail")) {
                throw AuthFailedException("$user@${session.host}:${session.port}")
            }
            if (message.contains("socket is not established")) {
                throw JSchException(
                    "Could not connect to ${session.host}:${session.port}. If the server is on your " +
                        "local network, allow Nouture to access local network devices.", e
                )
            }
            throw e
        }
        return session
    }

    /** Runs a command and returns its stdout (trimmed) and exit status. */
    fun exec(session: Session, command: String): Pair<String, Int> {
        val (bytes, status) = execBytes(session, command)
        return bytes.toString(Charsets.UTF_8).trim() to status
    }

    /** Runs a command and returns its exact stdout and exit status. */
    fun execBytes(session: Session, command: String): Pair<ByteArray, Int> {
        val channel = session.openChannel("exec") as com.jcraft.jsch.ChannelExec
        channel.setCommand(command)
        val output = channel.inputStream
        channel.connect(15_000)
        val bytes = output.readBytes()
        while (!channel.isClosed) Thread.sleep(20)
        channel.disconnect()
        return bytes to channel.exitStatus
    }

    /** Appends a host key to ~/.ssh/known_hosts, in OpenSSH's format. */
    fun trust(host: String, type: String, key: String) {
        val line = "$host $type $key\n"
        knownHostsFile.appendText(line)
    }
}
