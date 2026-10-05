package io.github.gl1ch5.telegramyou

import android.net.Uri

/**
 * The one place that says what the app shows. All web files live inside the APK
 * (assets/) and are served over https://appassets.androidplatform.net/app/ by
 * WebViewAssetLoader: no network is needed to open the interface, and it is fast.
 */
object AppConfig {
    const val HOST = "appassets.androidplatform.net"

    const val START_URL = "https://$HOST/app/index.html"

    /** Everything under this prefix is the app itself; other links open outside. */
    const val SCOPE_PREFIX = "https://$HOST/app/"

    /** Origin allowed to talk to the native bridge (downloads, theme, updates). */
    const val ORIGIN = "https://$HOST"

    /** Name of the JS object the page sees (window.TeleXNative.postMessage). */
    const val BRIDGE_NAME = "TeleXNative"

    fun isInScope(uri: Uri): Boolean = uri.toString().startsWith(SCOPE_PREFIX)

    fun isSameOrigin(uri: Uri): Boolean =
        uri.scheme == "https" && uri.host.equals(HOST, ignoreCase = true) &&
            (uri.port == -1 || uri.port == 443)
}
