package com.nouture.app

import android.os.Bundle
import com.getcapacitor.BridgeActivity
import com.nouture.plugins.SFTPPlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(SFTPPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}