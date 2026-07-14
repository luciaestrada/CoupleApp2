// CoupleWidget.kt
// Requiere un módulo Android nativo aparte (android/app) con Jetpack Glance
// añadido al proyecto Expo mediante un "config plugin" o "expo prebuild" + edición nativa.
// Los datos se leen de SharedPreferences, escritos por la app RN vía
// un módulo nativo puente (o react-native-shared-preferences).

package com.tuempresa.coupleapp.widget

import android.content.Context
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.provideContent
import androidx.glance.text.Text
import androidx.glance.layout.Column
import androidx.glance.layout.padding
import androidx.compose.ui.unit.dp

class CoupleWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val prefs = context.getSharedPreferences("couple_widget_prefs", Context.MODE_PRIVATE)
        val streakCount = prefs.getInt("streakCount", 0)
        val distanceText = prefs.getString("distanceText", "—") ?: "—"
        val daysTogether = prefs.getInt("daysTogether", 0)

        provideContent {
            Column(modifier = androidx.glance.GlanceModifier.padding(12.dp)) {
                Text("🔥 $streakCount")
                Text(distanceText)
                Text("$daysTogether días juntos")
            }
        }
    }
}

class CoupleWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = CoupleWidget()
}

// Además hay que declarar el widget en AndroidManifest.xml y en un
// widget_info.xml (res/xml) con minWidth/minHeight y updatePeriodMillis,
// siguiendo la documentación estándar de App Widgets de Android.
