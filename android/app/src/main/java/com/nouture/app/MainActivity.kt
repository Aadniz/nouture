package com.nouture.app

import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.view.animation.PathInterpolator
import android.webkit.WebView
import android.widget.ImageView
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.splashscreen.SplashScreenViewProvider
import com.getcapacitor.BridgeActivity
import com.getcapacitor.WebViewListener
import com.nouture.plugins.NotesPlugin
import com.nouture.plugins.UnisonPlugin

class MainActivity : BridgeActivity() {
    private val handler = Handler(Looper.getMainLooper())
    private var intro: Intro? = null
    /** The painting has had its moment */
    private var introShownAt = 0L
    private var pageLoadedAt: Long? = null

    private data class Intro(
        val splash: SplashScreenViewProvider,
        /** The splash's own space-indigo, as a layer that can fade */
        val backdrop: View,
        val painting: ImageView,
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        val launching = savedInstanceState == null
        installSplashScreen().setOnExitAnimationListener { provider ->
            if (launching) playIntro(provider) else provider.remove()
        }
        registerPlugin(UnisonPlugin::class.java)
        registerPlugin(NotesPlugin::class.java)
        super.onCreate(savedInstanceState)
        bridge.addWebViewListener(object : WebViewListener() {
            override fun onPageLoaded(webView: WebView?) {
                if (pageLoadedAt == null) pageLoadedAt = SystemClock.uptimeMillis()
                scheduleOutro()
            }
        })
        // With 3-button navigation Android greys the bar with a scrim; let the
        // app's color show through, like the status bar
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.isNavigationBarContrastEnforced = false
        }
    }

    /**
     * The launch splash only takes a color and an icon. Behind the icon the
     * painting fades in, faintly.
     */
    private fun playIntro(splash: SplashScreenViewProvider) {
        val backdrop = View(this).apply { setBackgroundColor(getColor(R.color.space_indigo)) }
        val painting = ImageView(this).apply {
            setImageResource(R.drawable.splash_background)
            scaleType = ImageView.ScaleType.CENTER_CROP
            alpha = 0f
        }
        (splash.view as? ViewGroup)?.let { view ->
            view.addView(backdrop, 0, fill())
            view.addView(painting, 1, fill())
            // The backdrop looks the same, and it can fade onto the app later
            view.background = null
        }
        intro = Intro(splash, backdrop, painting)
        painting.animate().alpha(PAINTING_OPACITY).setDuration(FADE_IN_MS).setInterpolator(EASE)

        introShownAt = SystemClock.uptimeMillis() + PAINTING_OUT_AT_MS
        handler.postDelayed(::playOutro, MAX_SPLASH_MS)
        scheduleOutro()
    }

    private fun fill() = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)

    /** Once the page loaded and the intro played */
    private fun scheduleOutro() {
        val loaded = pageLoadedAt ?: return
        if (intro == null) return
        val at = maxOf(introShownAt, loaded + RENDER_MS)
        handler.postDelayed(::playOutro, (at - SystemClock.uptimeMillis()).coerceAtLeast(0))
    }

    /** The backdrop and the painting, with the icon, fade away onto the app */
    private fun playOutro() {
        val (splash, backdrop, painting) = intro ?: return
        intro = null
        handler.removeCallbacksAndMessages(null)
        for (layer in listOf(backdrop, painting, splash.iconView)) {
            layer.animate().alpha(0f).setDuration(FADE_OUT_MS).setInterpolator(EASE)
        }
        handler.postDelayed(splash::remove, FADE_OUT_MS)
    }

    private companion object {
        const val FADE_IN_MS = 600L
        /** The painting only tints the backdrop */
        const val PAINTING_OPACITY = 0.3f
        /** The earliest the painting fades out again */
        const val PAINTING_OUT_AT_MS = 1000L
        const val FADE_OUT_MS = 500L
        /** Fades start gently and settle softly */
        val EASE = PathInterpolator(0.4f, 0f, 0.2f, 1f)
        /** React renders after the page itself loaded */
        const val RENDER_MS = 250L
        /** In case the page never reports it loaded */
        const val MAX_SPLASH_MS = 8000L
    }
}
