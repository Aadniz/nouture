package com.nouture.plugins

import android.os.Build
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.nouture.ssh.HostNotTrustedException
import com.nouture.ssh.Keys
import com.nouture.ssh.SshSessions
import com.nouture.unison.FolderWatcher
import com.nouture.unison.NoutureHome
import com.nouture.unison.Profiles
import com.nouture.unison.SyncResult
import com.nouture.unison.SyncState
import com.nouture.unison.UnisonRunner
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

@CapacitorPlugin(
    name = "Unison",
    permissions = [
        Permission(alias = UnisonPlugin.LOCAL_NETWORK, strings = ["android.permission.ACCESS_LOCAL_NETWORK"]),
    ],
)
class UnisonPlugin : Plugin() {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val listener = object : UnisonRunner.Listener {
        override fun onStarted(profile: String, reason: String) =
            notifyListeners("syncStarted", JSObject().put("profile", profile).put("reason", reason))

        override fun onOutput(profile: String, line: String) =
            notifyListeners("syncOutput", JSObject().put("profile", profile).put("line", line))

        override fun onFinished(result: SyncResult) {
            // The first sync may have created the local root (or new folders) to watch
            FolderWatcher.refresh(context)
            notifyListeners("syncFinished", JSObject.fromJSONObject(result.toJson()))
        }
    }

    override fun load() {
        NoutureHome.init(context)
        UnisonRunner.addListener(listener)
        FolderWatcher.refresh(context)
    }

    /** Opening the app is the phone's find-file-hook: pull in what changed elsewhere. */
    override fun handleOnResume() {
        super.handleOnResume()
        scope.launch {
            // Storage access may have just been granted in Settings
            FolderWatcher.refresh(context)
            Profiles.list().filter(SyncState::isAutoSync).forEach {
                UnisonRunner.request(context, it, "resume")
            }
        }
    }

    override fun handleOnDestroy() {
        UnisonRunner.removeListener(listener)
        scope.cancel()
        super.handleOnDestroy()
    }

    /** Android 17+ asks before apps may connect to devices on the local network. */
    @PluginMethod
    fun requestLocalNetwork(call: PluginCall) {
        if (Build.VERSION.SDK_INT < 37 || getPermissionState(LOCAL_NETWORK) == PermissionState.GRANTED) {
            call.resolve(JSObject().put("granted", true))
            return
        }
        requestPermissionForAlias(LOCAL_NETWORK, call, "localNetworkResult")
    }

    @PermissionCallback
    private fun localNetworkResult(call: PluginCall) {
        call.resolve(JSObject().put("granted", getPermissionState(LOCAL_NETWORK) == PermissionState.GRANTED))
    }

    @PluginMethod
    fun getInfo(call: PluginCall) = background(call) {
        val version = runCatching {
            val process = ProcessBuilder(NoutureHome.unisonBinary.path, "-version")
                .redirectErrorStream(true).start()
            process.waitFor(10, TimeUnit.SECONDS)
            process.inputStream.bufferedReader().readText().trim()
        }.getOrElse { "unavailable: ${it.message}" }
        JSObject()
            .put("unisonVersion", version)
            .put("hostname", NoutureHome.hostname)
            .put("home", NoutureHome.home.path)
    }

    @PluginMethod
    fun listProfiles(call: PluginCall) = background(call) {
        JSObject().put("profiles", JSArray(Profiles.list().map(::profileJson)))
    }

    @PluginMethod
    fun readProfile(call: PluginCall) = background(call) {
        JSObject().put("text", Profiles.read(call.require("name")))
    }

    @PluginMethod
    fun writeProfile(call: PluginCall) = background(call) {
        val name = call.require("name")
        Profiles.write(name, call.require("text"))
        FolderWatcher.refresh(context)
        profileJson(name)
    }

    @PluginMethod
    fun deleteProfile(call: PluginCall) = background(call) {
        val name = call.require("name")
        Profiles.delete(name)
        SyncState.forget(name)
        FolderWatcher.refresh(context)
        JSObject()
    }

    @PluginMethod
    fun setAutoSync(call: PluginCall) = background(call) {
        val name = call.require("name")
        SyncState.setAutoSync(name, call.getBoolean("enabled", true) ?: true)
        FolderWatcher.refresh(context)
        profileJson(name)
    }

    @PluginMethod
    fun sync(call: PluginCall) = background(call) {
        UnisonRunner.request(context, call.require("name"), call.getString("reason") ?: "manual")
        JSObject()
    }

    @PluginMethod
    fun testConnection(call: PluginCall) = background(call) {
        val name = call.require("name")
        val remote = Profiles.remoteRoot(name)
            ?: throw IllegalArgumentException("Profile $name has no ssh:// root")
        try {
            val session = SshSessions.open(SshSessions.Target(remote.host, remote.user, remote.port))
            try {
                val servercmd = Profiles.values(name, "servercmd").lastOrNull() ?: "unison"
                val (version, status) = SshSessions.exec(session, "$servercmd -version")
                val target = "${session.userName}@${session.host}:${session.port}"
                JSObject()
                    .put("ok", status == 0)
                    .put("message", if (status == 0) "$target: $version" else "$target: '$servercmd' failed ($status) $version")
            } finally {
                session.disconnect()
            }
        } catch (e: HostNotTrustedException) {
            JSObject()
                .put("ok", false)
                .put("message", e.message)
                .put(
                    "unknownHostKey", JSObject()
                        .put("host", e.hostKey.host)
                        .put("type", e.hostKey.type)
                        .put("key", e.hostKey.key)
                        .put("fingerprint", e.fingerprint)
                )
        } catch (e: Exception) {
            JSObject().put("ok", false).put("message", e.message ?: e.toString())
        }
    }

    @PluginMethod
    fun trustHost(call: PluginCall) = background(call) {
        SshSessions.trust(call.require("host"), call.require("type"), call.require("key"))
        JSObject()
    }

    @PluginMethod
    fun readSshFile(call: PluginCall) = background(call) {
        val file = sshFile(call.require("name"))
        JSObject().put("text", if (file.exists()) file.readText() else "")
    }

    @PluginMethod
    fun writeSshFile(call: PluginCall) = background(call) {
        sshFile(call.require("name")).writeText(call.require("text"))
        JSObject()
    }

    @PluginMethod
    fun listKeys(call: PluginCall) = background(call) {
        JSObject().put("keys", JSArray(Keys.list().map(::keyJson)))
    }

    @PluginMethod
    fun generateKey(call: PluginCall) = background(call) {
        keyJson(Keys.generate(call.require("name"), call.getString("comment") ?: "nouture@${NoutureHome.hostname}"))
    }

    @PluginMethod
    fun importKey(call: PluginCall) = background(call) {
        keyJson(Keys.import(call.require("name"), call.require("privateKey")))
    }

    @PluginMethod
    fun deleteKey(call: PluginCall) = background(call) {
        Keys.delete(call.require("name"))
        JSObject()
    }

    @PluginMethod
    fun readLog(call: PluginCall) = background(call) {
        val log = File(NoutureHome.unisonDir, "unison.log")
        val lines = if (log.exists()) log.readLines().takeLast(call.getInt("lines", 200) ?: 200) else emptyList()
        JSObject().put("text", lines.joinToString("\n"))
    }

    private fun profileJson(name: String): JSObject = JSObject()
        .put("name", name)
        .put("roots", JSArray(Profiles.roots(name)))
        .put("localRoot", Profiles.localRoot(name)?.path)
        .put("autoSync", SyncState.isAutoSync(name))
        .put("running", UnisonRunner.isRunning(name))
        .put("lastResult", SyncState.lastResult(name)?.let { JSObject.fromJSONObject(it) } ?: JSONObject.NULL)

    private fun keyJson(key: Keys.Info): JSObject = JSObject()
        .put("name", key.name)
        .put("publicKey", key.publicKey)
        .put("fingerprint", key.fingerprint)

    private fun sshFile(name: String): File = when (name) {
        "config" -> SshSessions.configFile
        "known_hosts" -> SshSessions.knownHostsFile
        else -> throw IllegalArgumentException("Unknown ssh file: $name")
    }

    private fun PluginCall.require(key: String): String =
        getString(key) ?: throw IllegalArgumentException("$key is required")

    private fun background(call: PluginCall, block: () -> JSObject) {
        scope.launch {
            try {
                call.resolve(block())
            } catch (e: Exception) {
                call.reject(e.message ?: e.toString(), e)
            }
        }
    }

    companion object {
        const val LOCAL_NETWORK = "localNetwork"
    }
}
