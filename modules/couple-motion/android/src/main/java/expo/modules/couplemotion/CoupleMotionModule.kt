package expo.modules.couplemotion

import android.Manifest
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityRecognitionResult
import com.google.android.gms.location.DetectedActivity
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val STORE = "coupleapp.motion"
private fun permitted(context: Context) = Build.VERSION.SDK_INT < 29 ||
  context.checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED
private fun intent(context: Context): PendingIntent = PendingIntent.getBroadcast(context, 512,
  Intent(context, ActivityReceiver::class.java), PendingIntent.FLAG_UPDATE_CURRENT or
    if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)

class ActivityReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val prefs = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)
    if (!prefs.getBoolean("enabled", false) || !permitted(context)) return
    val result = ActivityRecognitionResult.extractResult(intent) ?: return
    val detected = result.mostProbableActivity
    val activity = when (detected.type) {
      DetectedActivity.STILL -> "stationary"
      DetectedActivity.WALKING, DetectedActivity.RUNNING, DetectedActivity.ON_FOOT -> "walking"
      DetectedActivity.ON_BICYCLE -> "cycling"
      DetectedActivity.IN_VEHICLE -> "driving"
      else -> "unknown"
    }
    prefs.edit().putString("activity", activity).putInt("confidence", detected.confidence)
      .putLong("timestamp", result.time).apply()
  }
}

class CoupleMotionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CoupleMotion")
    AsyncFunction("requestPermissionsAsync") { promise: Promise ->
      if (Build.VERSION.SDK_INT >= 29) Permissions.askForPermissionsWithPermissionsManager(
        appContext.permissions, promise, Manifest.permission.ACTIVITY_RECOGNITION)
      else Permissions.askForPermissionsWithPermissionsManager(appContext.permissions, promise)
    }
    AsyncFunction("startAsync") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null || !permitted(context)) { promise.resolve(false); return@AsyncFunction }
      ActivityRecognition.getClient(context).requestActivityUpdates(60000, intent(context))
        .addOnSuccessListener { context.getSharedPreferences(STORE, Context.MODE_PRIVATE).edit().putBoolean("enabled",true).apply(); promise.resolve(true) }
        .addOnFailureListener { promise.reject("ACTIVITY_UNAVAILABLE",it.message,it) }
    }
    AsyncFunction("stopAsync") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) { promise.resolve(null); return@AsyncFunction }
      context.getSharedPreferences(STORE, Context.MODE_PRIVATE).edit().clear().apply()
      if (!permitted(context)) { promise.resolve(null); return@AsyncFunction }
      ActivityRecognition.getClient(context).removeActivityUpdates(intent(context))
        .addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener { promise.reject("ACTIVITY_UNAVAILABLE",it.message,it) }
    }
    AsyncFunction("getActivityAsync") {
      val context = appContext.reactContext
      if (context == null || !permitted(context)) return@AsyncFunction null
      val prefs = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)
      val time = prefs.getLong("timestamp",0)
      if (!prefs.getBoolean("enabled",false) || System.currentTimeMillis()-time !in 0..180000) return@AsyncFunction null
      mapOf("activity" to prefs.getString("activity","unknown"), "timestamp" to time,
        "confidence" to when { prefs.getInt("confidence",0)>=80 -> "high"; prefs.getInt("confidence",0)>=60 -> "medium"; else -> "low" })
    }
  }
}
