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

    @PluginMethod
    fun stat(call: PluginCall) = background(call) {
        val file = File(call.require("path"))
        JSObject()
            .put("exists", file.exists())
            .put("mtime", file.lastModified())
            .put("size", file.length())
    }

    @PluginMethod
    fun readFile(call: PluginCall) = background(call) {
        val file = File(call.require("path"))
        JSObject()
            .put("text", file.readText())
            .put("mtime", file.lastModified())
            .put("size", file.length())
    }

    /**
     * Atomically replaces a file's contents. With expectedMtime, refuses to
     * overwrite a file that changed since it was read (e.g. by a sync).
     */
    @PluginMethod
    fun writeFile(call: PluginCall) = background(call) {
        val file = File(call.require("path"))
        val text = call.require("text")
        val expected = call.getDouble("expectedMtime")?.toLong()
        if (expected != null && file.exists() && file.lastModified() != expected) {
            return@background JSObject().put("conflict", true).put("mtime", file.lastModified())
        }
        write(file, text)
        JSObject().put("conflict", false).put("mtime", file.lastModified())
    }

    @PluginMethod
    fun createFile(call: PluginCall) = background(call) {
        val file = File(call.require("path"))
        require(!file.exists()) { "${file.name} already exists" }
        file.parentFile?.mkdirs()
        write(file, call.getString("text") ?: "")
        entryJson(file)
    }

    override fun handleOnDestroy() {
        scope.cancel()
        super.handleOnDestroy()
    }

    private fun write(file: File, text: String) {
        val tmp = File(file.parentFile, ".nouture-${file.name}.tmp")
        tmp.writeText(text)
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
