package com.nouture.unison

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SshArgsTest {
    @Test
    fun parsesWhatUnisonSends() {
        val args = SshArgs.parse(listOf("backup", "-e", "none", "unison", "-server"))
        assertEquals("backup", args.host)
        assertNull(args.user)
        assertNull(args.port)
        assertEquals("unison -server", args.command)
    }

    @Test
    fun parsesSshargsUserAndPort() {
        val args = SshArgs.parse(
            listOf("-p", "2222", "-l", "me", "-C", "example.com", "-e", "none", "unison", "-server")
        )
        assertEquals("example.com", args.host)
        assertEquals("me", args.user)
        assertEquals(2222, args.port)
        assertEquals("unison -server", args.command)
    }

    @Test
    fun parsesAttachedValuesClustersAndOptions() {
        val args = SshArgs.parse(
            listOf("-TCp2222", "-i", "~/.ssh/android", "-o", "User=me", "-oServerAliveInterval 30", "backup", "true")
        )
        assertEquals(2222, args.port)
        assertEquals("me", args.user)
        assertEquals(listOf("~/.ssh/android"), args.identities)
        assertEquals(mapOf("serveraliveinterval" to "30"), args.options)
        assertEquals("true", args.command)
    }

    /** Checked against `ssh -G`: OpenSSH keeps the first port and user it's given */
    @Test
    fun firstValueWinsLikeOpenSsh() {
        // unison: ssh -l <root user> -p <root port> host -e none <sshargs> unison -server
        val args = SshArgs.parse(
            listOf("-l", "rootuser", "-p", "1111", "backup", "-e", "none", "-l", "other", "-p", "2222", "unison", "-server")
        )
        assertEquals("rootuser", args.user)
        assertEquals(1111, args.port)
        assertEquals("unison -server", args.command)

        assertEquals("first", SshArgs.parse(listOf("-l", "first", "me@backup", "true")).user)
        assertEquals("me", SshArgs.parse(listOf("me@backup", "-l", "later", "true")).user)
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsMissingHost() {
        SshArgs.parse(listOf("-p", "22"))
    }
}
