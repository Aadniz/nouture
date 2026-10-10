package com.nouture.app

import android.os.Build
import android.os.Bundle
import com.getcapacitor.BridgeActivity
import com.nouture.plugins.NotesPlugin
import com.nouture.plugins.UnisonPlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(UnisonPlugin::class.java)
        registerPlugin(NotesPlugin::class.java)
        super.onCreate(savedInstanceState)
        // With 3-button navigation Android greys the bar with a scrim; let the
        // app's color show through, like the status bar
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.isNavigationBarContrastEnforced = false
        }
    }
}
