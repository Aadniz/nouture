package com.nouture.app

import android.os.Bundle
import com.getcapacitor.BridgeActivity
import com.nouture.plugins.NotesPlugin
import com.nouture.plugins.UnisonPlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(UnisonPlugin::class.java)
        registerPlugin(NotesPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
