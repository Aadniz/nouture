package com.nouture.plugins

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.nouture.notes.NotePreviews
import com.nouture.unison.FolderWatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.File

/** Plain file access to the synced note folders in shared storage. */
@CapacitorPlugin(name = "Notes")
class NotesPlugin : Plugin() {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    @PluginMethod
    fun hasAllFilesAccess(call: PluginCall) {
        call.resolve(JSObject().put("granted", hasAccess()))
    }

    @PluginMethod
    fun requestAllFilesAccess(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val intent = Intent(
                Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                Uri.parse("package:${context.packageName}"),
            )
            activity.startActivity(intent)
        } else {
            ActivityCompat.requestPermissions(
                activity,
                arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE),
                0,
            )
        }
        call.resolve()
    }

    @PluginMethod
    fun listDir(call: PluginCall) = background(call) {
        val root = File(call.require("path"))
        val entries = if (!root.isDirectory) emptyList() else root.walkTopDown()
            .onEnter { it == root || !it.name.startsWith(".") }
            .filter { it != root && !it.name.startsWith(".") }
            .map(::entryJson)
            .toList()
        JSObject().put("entries", JSArray(entries))
    }

    /** The most recently edited notes with the lines that changed last. */
    @PluginMethod
    fun recentNotes(call: PluginCall) = background(call) {
        val roots = call.getArray("roots")?.toList<String>().orEmpty().map(::File)
        val (notes, total) = NotePreviews.recent(roots, call.getInt("limit", 8) ?: 8)
        JSObject()
            .put("total", total)
            .put("notes", JSArray(notes.map { note ->
                JSObject()
                    .put("path", note.path)
                    .put("name", note.name)
                    .put("mtime", note.mtime)
                    .put("text", note.text)
                    .put("edited", note.edited?.let { JSObject().put("start", it.first).put("end", it.last) })
            }))
    }

    /**
     * Files are told apart by a hash of their contents, never by mtime:
     * Android's shared storage puts a replaced file's old mtime back.
     */
    @PluginMethod
    fun stat(call: PluginCall) = background(call) {
        val file = File(call.require("path"))
        JSObject()
            .put("exists", file.exists())
            .put("size", file.length())
            .put("hash", if (file.isFile) hash(file.readBytes()) else JSONObject.NULL)
    }

    @PluginMethod
    fun readFile(call: PluginCall) = background(call) {
        val bytes = File(call.require("path")).readBytes()
        JSObject()
            .put("text", bytes.toString(Charsets.UTF_8))
            .put("size", bytes.size)
            .put("hash", hash(bytes))
    }

    /**
     * Atomically replaces a file's contents. With expectedHash, refuses to
     * overwrite a file that changed since it was read (e.g. by a sync).
     */
    @PluginMethod
    fun writeFile(call: PluginCall) = background(call) {
        val file = File(call.require("path"))
        val bytes = call.require("text").toByteArray(Charsets.UTF_8)
        val expected = call.getString("expectedHash")
        if (expected != null && file.isFile) {
            val current = hash(file.readBytes())
            if (current != expected) return@background JSObject().put("conflict", true).put("hash", current)
        }
        write(file, bytes)
        JSObject().put("conflict", false).put("hash", hash(bytes))
    }

    @PluginMethod
    fun createFile(call: PluginCall) = background(call) {
        val file = File(call.require("path"))
        require(!file.exists()) { "${file.name} already exists" }
        file.parentFile?.mkdirs()
        write(file, (call.getString("text") ?: "").toByteArray(Charsets.UTF_8))
        entryJson(file)
    }

    override fun handleOnDestroy() {
        scope.cancel()
        super.handleOnDestroy()
    }

    private fun hash(bytes: ByteArray) =
        java.security.MessageDigest.getInstance("SHA-1").digest(bytes).joinToString("") { "%02x".format(it) }

    private fun write(file: File, bytes: ByteArray) {
        val tmp = File(file.parentFile, ".nouture-${file.name}.tmp")
        tmp.writeBytes(bytes)
        FolderWatcher.noteSelfWrite(file)
        if (!tmp.renameTo(file)) {
            tmp.delete()
            throw IllegalStateException("Could not save ${file.name}")
        }
    }

    private fun hasAccess(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) Environment.isExternalStorageManager()
        else ContextCompat.checkSelfPermission(context, Manifest.permission.WRITE_EXTERNAL_STORAGE) ==
            PackageManager.PERMISSION_GRANTED

    private fun entryJson(file: File) = JSObject()
        .put("path", file.path)
        .put("name", file.name)
        .put("isDirectory", file.isDirectory)
        .put("size", file.length())
        .put("mtime", file.lastModified())

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
}
