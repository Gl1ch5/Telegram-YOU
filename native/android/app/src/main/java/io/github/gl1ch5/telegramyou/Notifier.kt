package io.github.gl1ch5.telegramyou

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.os.Build
import android.util.Base64
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.content.ContextCompat
import org.json.JSONObject

/** Native notifications for new Telegram messages (the web app sends {t:"notify"} over the bridge). */
class Notifier(private val context: Context) {

    init {
        if (Build.VERSION.SDK_INT >= 26) {
            val nm = context.getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Сообщения", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Новые сообщения из Telegram"
                enableVibration(true)
            })
            nm.createNotificationChannel(NotificationChannel(CHANNEL_SILENT, "Сообщения (без звука)", NotificationManager.IMPORTANCE_LOW))
        }
    }

    fun canPost(): Boolean =
        Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    fun show(msg: JSONObject) {
        if (!canPost()) return
        val chat = msg.optString("id")
        if (chat.isBlank()) return
        val open = Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra(EXTRA_CHAT, chat)
        val pi = PendingIntent.getActivity(
            context, chat.hashCode(), open,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val title = msg.optString("title")
        val text = msg.optString("text")
        val sound = msg.optBoolean("sound", true)
        val b = NotificationCompat.Builder(context, if (sound) CHANNEL else CHANNEL_SILENT)
            .setSmallIcon(R.drawable.ic_stat_message)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(if (sound) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_LOW)
            .setGroup(GROUP)
            .setColor(0xFF5A83F3.toInt())
            .setOnlyAlertOnce(false)
        val avatar = msg.optString("avatar")
        if (avatar.isNotBlank() && avatar != "null") {
            runCatching {
                val bytes = Base64.decode(avatar, Base64.DEFAULT)
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.let { b.setLargeIcon(it) }
            }
        }
        runCatching { NotificationManagerCompat.from(context).notify(chat.hashCode(), b.build()) }
    }

    companion object {
        const val CHANNEL = "messages"
        const val CHANNEL_SILENT = "messages_silent"
        const val GROUP = "telegramyou.messages"
        const val EXTRA_CHAT = "chat"
    }
}
