package com.nouture.ssh

import android.system.Os
import android.util.Base64
import com.jcraft.jsch.JSch
import com.jcraft.jsch.KeyPair
import com.nouture.unison.NoutureHome
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.File
import java.security.MessageDigest
import java.security.SecureRandom

/** SSH key files in ~/.ssh, stored as OpenSSH writes them. */
object Keys {
    data class Info(val name: String, val publicKey: String, val fingerprint: String)

    private val NAME = Regex("^[A-Za-z0-9._-]+$")

    fun list(): List<Info> =
        NoutureHome.sshDir.listFiles { f -> f.name.endsWith(".pub") }.orEmpty()
            .filter { File(it.parentFile, it.name.removeSuffix(".pub")).exists() }
            .sortedBy { it.name }
            .map { info(it.name.removeSuffix(".pub"), it.readText().trim()) }

    /** Generates an unencrypted ed25519 key pair, like `ssh-keygen -t ed25519 -N ""`. */
    fun generate(name: String, comment: String): Info {
        val target = keyFile(name)
        require(!target.exists()) { "~/.ssh/$name already exists" }

        val random = SecureRandom()
        val private = Ed25519PrivateKeyParameters(random)
        val seed = private.encoded
        val public = private.generatePublicKey().encoded
        val publicBlob = sshBytes {
            writeSshString("ssh-ed25519".toByteArray())
            writeSshString(public)
        }

        // openssh-key-v1, see PROTOCOL.key in the OpenSSH sources
        val check = random.nextInt()
        val privateSection = sshBytes {
            writeInt(check)
            writeInt(check)
            writeSshString("ssh-ed25519".toByteArray())
            writeSshString(public)
            writeSshString(seed + public)
            writeSshString(comment.toByteArray())
            var pad = 1
            while (size() % 8 != 0) writeByte(pad++)
        }
        val body = sshBytes {
            write("openssh-key-v1\u0000".toByteArray())
            writeSshString("none".toByteArray())
            writeSshString("none".toByteArray())
            writeSshString(ByteArray(0))
            writeInt(1)
            writeSshString(publicBlob)
            writeSshString(privateSection)
        }

        val pem = Base64.encodeToString(body, Base64.NO_WRAP).chunked(70)
            .joinToString("\n", "-----BEGIN OPENSSH PRIVATE KEY-----\n", "\n-----END OPENSSH PRIVATE KEY-----\n")
        val publicLine = "ssh-ed25519 ${Base64.encodeToString(publicBlob, Base64.NO_WRAP)} $comment"
        save(name, pem, publicLine)
        return info(name, publicLine)
    }

    /** Stores a pasted private key (unencrypted only, for now). */
    fun import(name: String, privateKey: String): Info {
        val target = keyFile(name)
        require(!target.exists()) { "~/.ssh/$name already exists" }

        val text = privateKey.trim() + "\n"
        val pair = KeyPair.load(JSch(), text.toByteArray(), null)
        try {
            require(!pair.isEncrypted) { "Passphrase-protected keys aren't supported yet" }
            val blob = pair.publicKeyBlob ?: throw IllegalArgumentException("Could not read the public part of this key")
            val publicLine = "${sshStringAt(blob)} ${Base64.encodeToString(blob, Base64.NO_WRAP)} $name@nouture"
            save(name, text, publicLine)
            return info(name, publicLine)
        } finally {
            pair.dispose()
        }
    }

    fun delete(name: String) {
        keyFile(name).delete()
        File(NoutureHome.sshDir, "$name.pub").delete()
    }

    fun fingerprint(publicKeyBase64: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(Base64.decode(publicKeyBase64, Base64.DEFAULT))
        return "SHA256:" + Base64.encodeToString(digest, Base64.NO_WRAP or Base64.NO_PADDING)
    }

    private fun info(name: String, publicLine: String) =
        Info(name, publicLine, fingerprint(publicLine.split(" ").getOrElse(1) { "" }))

    private fun keyFile(name: String): File {
        require(NAME.matches(name)) { "Invalid key name: $name" }
        return File(NoutureHome.sshDir, name)
    }

    private fun save(name: String, privateText: String, publicLine: String) {
        val file = keyFile(name)
        file.writeText(privateText)
        Os.chmod(file.path, "600".toInt(8))
        File(NoutureHome.sshDir, "$name.pub").writeText(publicLine + "\n")
    }

    private fun sshBytes(block: DataOutputStream.() -> Unit): ByteArray {
        val bytes = ByteArrayOutputStream()
        DataOutputStream(bytes).apply(block).flush()
        return bytes.toByteArray()
    }

    private fun DataOutputStream.writeSshString(bytes: ByteArray) {
        writeInt(bytes.size)
        write(bytes)
    }

    private fun sshStringAt(blob: ByteArray): String {
        val input = DataInputStream(blob.inputStream())
        val bytes = ByteArray(input.readInt())
        input.readFully(bytes)
        return String(bytes)
    }
}
