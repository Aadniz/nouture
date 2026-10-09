package com.nouture.unison

import android.content.Context
import android.os.Build
import android.system.Os
import java.io.File

/**
 * The app's private "home directory". Laid out like a Linux home so unison and
 * the SSH layer find their files where they would on a desktop:
 *   ~/.unison/  profiles (*.prf), archives, unison.log
 *   ~/.ssh/     config, known_hosts, keys
 *   ~/.nouture/ app state (auto-sync flags, last sync results)
 */
object NoutureHome {
    lateinit var home: File
        private set
    lateinit var unisonBinary: File
        private set
    lateinit var sshHelper: File
        private set
    lateinit var tmpDir: File
        private set

    val unisonDir get() = File(home, ".unison")
    val sshDir get() = File(home, ".ssh")
    val stateDir get() = File(home, ".nouture")

    /** Unison keys its archives on this; keep it stable per device. */
    val hostname: String = "android-" + Build.MODEL.lowercase().replace(Regex("[^a-z0-9]+"), "-")

    @Synchronized
    fun init(context: Context) {
        if (::home.isInitialized) return
        val app = context.applicationContext
        home = File(app.filesDir, "home")
        tmpDir = File(app.cacheDir, "tmp")
        listOf(home, unisonDir, sshDir, stateDir, tmpDir).forEach { it.mkdirs() }
        Os.chmod(sshDir.path, "700".toInt(8))

        val libDir = app.applicationInfo.nativeLibraryDir
        unisonBinary = File(libDir, "libunison.so")
        sshHelper = File(libDir, "libnoussh.so")

        // JSch expands "~" in IdentityFile & co. with user.home
        System.setProperty("user.home", home.path)
    }

    /** Expands a leading "~" like a shell would. */
    fun expand(path: String): File = when {
        path == "~" -> home
        path.startsWith("~/") -> File(home, path.substring(2))
        else -> File(path)
    }
}
