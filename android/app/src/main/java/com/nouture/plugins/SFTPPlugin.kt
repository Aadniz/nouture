package com.nouture.plugins

import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.jcraft.jsch.*
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.Vector

@CapacitorPlugin(name = "SFTP")
class SFTPPlugin : Plugin() {
    private var session: Session? = null
    private var channel: ChannelSftp? = null
    private var jsch: JSch? = null

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private data class SFTPConfig(
        val host: String,
        val port: Int = 22,
        val username: String,
        val password: String? = null,
        val privateKey: String? = null,
        val passphrase: String? = null
    )

    @PluginMethod
    fun connect(call: PluginCall) {
        scope.launch {
            try {
                val config = SFTPConfig(
                    host = call.getString("host") ?: throw Exception("Host is required"),
                    port = call.getInt("port", 22) ?: 22,
                    username = call.getString("username") ?: throw Exception("Username is required"),
                    password = call.getString("password"),
                    privateKey = call.getString("privateKey"),
                    passphrase = call.getString("passphrase")
                )

                establishConnection(config)

                val result = JSObject().apply {
                    put("success", true)
                    put("message", "Connected successfully")
                }
                call.resolve(result)
            } catch (e: Exception) {
                handleError(call, "Connection failed", e)
            }
        }
    }

    @PluginMethod
    fun disconnect(call: PluginCall) {
        try {
            channel?.let {
                if (it.isConnected) it.disconnect()
            }
            session?.let {
                if (it.isConnected) it.disconnect()
            }
            channel = null
            session = null
            jsch = null

            val result = JSObject().apply {
                put("success", true)
                put("message", "Disconnected successfully")
            }
            call.resolve(result)
        } catch (e: Exception) {
            handleError(call, "Disconnect failed", e)
        }
    }

    @PluginMethod
    fun listFiles(call: PluginCall) {
        scope.launch {
            try {
                val path = call.getString("path", ".")
                ensureConnected()

                val files = channel!!.ls(path)
                val filesArray = JSONArray()

                @Suppress("UNCHECKED_CAST")
                (files as Vector<ChannelSftp.LsEntry>).forEach { entry ->
                    if (entry.filename != "." && entry.filename != "..") {
                        filesArray.put(JSONObject().apply {
                            put("name", entry.filename)
                            put("path", "$path/${entry.filename}")
                            put("size", entry.attrs.size)
                            put("isDirectory", entry.attrs.isDir)
                            put("lastModified", entry.attrs.mTime)
                        })
                    }
                }

                call.resolve(JSObject().apply {
                    put("files", filesArray)
                })
            } catch (e: Exception) {
                call.resolve(JSObject().apply {
                    put("files", JSONArray())
                })
                Log.e("SFTPPlugin", "Error listing files", e)
            }
        }
    }

    @PluginMethod
    fun downloadFile(call: PluginCall) {
        scope.launch {
            try {
                val remotePath = call.getString("remotePath")
                    ?: throw Exception("Remote path is required")
                val localPath = call.getString("localPath")
                    ?: throw Exception("Local path is required")

                ensureConnected()

                val localFile = File(localPath)
                localFile.parentFile?.mkdirs()

                FileOutputStream(localFile).use { fos ->
                    channel!!.get(remotePath, fos)
                }

                call.resolve(JSObject().apply {
                    put("success", true)
                    put("message", "File downloaded successfully")
                })
            } catch (e: Exception) {
                handleError(call, "Download failed", e)
            }
        }
    }

    @PluginMethod
    fun uploadFile(call: PluginCall) {
        scope.launch {
            try {
                val localPath = call.getString("localPath")
                    ?: throw Exception("Local path is required")
                val remotePath = call.getString("remotePath")
                    ?: throw Exception("Remote path is required")

                ensureConnected()

                val localFile = File(localPath)
                if (!localFile.exists()) {
                    throw Exception("Local file does not exist: $localPath")
                }

                FileInputStream(localFile).use { fis ->
                    channel!!.put(fis, remotePath)
                }

                call.resolve(JSObject().apply {
                    put("success", true)
                    put("message", "File uploaded successfully")
                })
            } catch (e: Exception) {
                handleError(call, "Upload failed", e)
            }
        }
    }

    @PluginMethod
    fun syncDirectory(call: PluginCall) {
        scope.launch {
            try {
                val remotePath = call.getString("remotePath")
                    ?: throw Exception("Remote path is required")
                val localPath = call.getString("localPath")
                    ?: throw Exception("Local path is required")

                ensureConnected()

                val localDir = File(localPath)
                localDir.mkdirs()

                val syncedFiles = mutableListOf<String>()
                syncRecursive(remotePath, localPath, syncedFiles)

                call.resolve(JSObject().apply {
                    put("success", true)
                    put("message", "Directory synced successfully")
                    put("syncedFiles", JSONArray(syncedFiles))
                })
            } catch (e: Exception) {
                call.resolve(JSObject().apply {
                    put("success", false)
                    put("message", "Sync failed: ${e.message}")
                    put("syncedFiles", JSONArray())
                })
            }
        }
    }

    @PluginMethod
    fun createDirectory(call: PluginCall) {
        scope.launch {
            try {
                val remotePath = call.getString("remotePath")
                    ?: throw Exception("Remote path is required")

                ensureConnected()
                channel!!.mkdir(remotePath)

                call.resolve(JSObject().apply {
                    put("success", true)
                    put("message", "Directory created successfully")
                })
            } catch (e: Exception) {
                handleError(call, "Failed to create directory", e)
            }
        }
    }

    @PluginMethod
    fun deleteFile(call: PluginCall) {
        scope.launch {
            try {
                val remotePath = call.getString("remotePath")
                    ?: throw Exception("Remote path is required")

                ensureConnected()
                channel!!.rm(remotePath)

                call.resolve(JSObject().apply {
                    put("success", true)
                    put("message", "File deleted successfully")
                })
            } catch (e: Exception) {
                handleError(call, "Failed to delete file", e)
            }
        }
    }

    @PluginMethod
    fun checkConnection(call: PluginCall) {
        val connected = session?.isConnected == true && channel?.isConnected == true
        call.resolve(JSObject().apply {
            put("connected", connected)
        })
    }

    private suspend fun establishConnection(config: SFTPConfig) {
        withContext(Dispatchers.IO) {
            try {
                jsch = JSch()

                config.privateKey?.let { key ->
                    if (key.isNotEmpty()) {
                        if (config.passphrase?.isNotEmpty() == true) {
                            jsch?.addIdentity("key", key.toByteArray(), null, config.passphrase.toByteArray())
                        } else {
                            jsch?.addIdentity("key", key.toByteArray(), null, null)
                        }
                    }
                }

                session = jsch?.getSession(config.username, config.host, config.port)
                session?.apply {
                    setConfig("StrictHostKeyChecking", "no")
                    setConfig("PreferredAuthentications", "publickey,password")

                    if (config.password?.isNotEmpty() == true) {
                        setPassword(config.password)
                    }

                    connect(30000) // 30 second timeout
                }

                channel = session?.openChannel("sftp") as? ChannelSftp
                channel?.connect(30000)

            } catch (e: Exception) {
                // Clean up on failure
                channel?.disconnect()
                session?.disconnect()
                channel = null
                session = null
                throw e
            }
        }
    }

    private suspend fun syncRecursive(
        remotePath: String,
        localPath: String,
        syncedFiles: MutableList<String>
    ) {
        withContext(Dispatchers.IO) {
            @Suppress("UNCHECKED_CAST")
            val entries = channel!!.ls(remotePath) as Vector<ChannelSftp.LsEntry>

            entries.filter { it.filename != "." && it.filename != ".." }.forEach { entry ->
                val remoteFilePath = "$remotePath/${entry.filename}"
                val localFilePath = "$localPath/${entry.filename}"

                if (entry.attrs.isDir) {
                    File(localFilePath).mkdirs()
                    syncRecursive(remoteFilePath, localFilePath, syncedFiles)
                } else {
                    val localFile = File(localFilePath)
                    val shouldSync = !localFile.exists() ||
                            localFile.lastModified() < entry.attrs.mTime * 1000L

                    if (shouldSync) {
                        FileOutputStream(localFile).use { fos ->
                            channel!!.get(remoteFilePath, fos)
                        }
                        localFile.setLastModified(entry.attrs.mTime * 1000L)
                        syncedFiles.add(remoteFilePath)
                    }
                }
            }
        }
    }

    private fun ensureConnected() {
        if (session == null || session?.isConnected != true) {
            throw Exception("Not connected to SFTP server")
        }
        if (channel == null || channel?.isConnected != true) {
            throw Exception("SFTP channel not connected")
        }
    }

    private fun handleError(call: PluginCall, prefix: String, e: Exception) {
        val message = "$prefix: ${e.message}"
        Log.e("SFTPPlugin", message, e)

        call.resolve(JSObject().apply {
            put("success", false)
            put("message", message)
        })
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        scope.cancel()
        try {
            channel?.disconnect()
            session?.disconnect()
        } catch (e: Exception) {
            Log.e("SFTPPlugin", "Error during cleanup", e)
        }
    }
}