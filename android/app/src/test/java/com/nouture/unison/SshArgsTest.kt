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
            listOf("-p", "6665", "-l", "bk", "-C", "knaben.ddns.net", "-e", "none", "unison", "-server")
        )
        assertEquals("knaben.ddns.net", args.host)
        assertEquals("bk", args.user)
        assertEquals(6665, args.port)
        assertEquals("unison -server", args.command)
    }

    @Test
    fun parsesAttachedValuesClustersAndOptions() {
        val args = SshArgs.parse(
            listOf("-TCp6665", "-i", "~/.ssh/phone", "-o", "User=bk", "-oServerAliveInterval 30", "backup", "true")
        )
        assertEquals(6665, args.port)
        assertEquals("bk", args.user)
        assertEquals(listOf("~/.ssh/phone"), args.identities)
        assertEquals(mapOf("serveraliveinterval" to "30"), args.options)
        assertEquals("true", args.command)
    }

    @Test
    fun userAtHostWins() {
        val args = SshArgs.parse(listOf("-l", "nobody", "bk@backup", "unison", "-server"))
        assertEquals("backup", args.host)
        assertEquals("bk", args.user)
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsMissingHost() {
        SshArgs.parse(listOf("-p", "22"))
    }
}
