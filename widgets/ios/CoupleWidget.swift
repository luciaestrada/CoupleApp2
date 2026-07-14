// CoupleWidget.swift
// Requiere: target de Widget Extension añadido en Xcode (target aparte del app RN)
// y App Group compartido para leer datos escritos por la app principal
// (usando react-native-shared-group-preferences o similar).

import WidgetKit
import SwiftUI

struct CoupleEntry: TimelineEntry {
    let date: Date
    let streakCount: Int
    let distanceText: String
    let daysTogether: Int
}

struct CoupleProvider: TimelineProvider {
    let appGroupId = "group.com.tuempresa.coupleapp"

    func placeholder(in context: Context) -> CoupleEntry {
        CoupleEntry(date: Date(), streakCount: 0, distanceText: "—", daysTogether: 0)
    }

    func getSnapshot(in context: Context, completion: @escaping (CoupleEntry) -> Void) {
        completion(readEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CoupleEntry>) -> Void) {
        let entry = readEntry()
        // Refresca cada 15 minutos; los datos reales se actualizan vía App Group
        // desde la app principal cuando cambia Firestore.
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }

    func readEntry() -> CoupleEntry {
        let defaults = UserDefaults(suiteName: appGroupId)
        return CoupleEntry(
            date: Date(),
            streakCount: defaults?.integer(forKey: "streakCount") ?? 0,
            distanceText: defaults?.string(forKey: "distanceText") ?? "—",
            daysTogether: defaults?.integer(forKey: "daysTogether") ?? 0
        )
    }
}

struct CoupleWidgetView: View {
    var entry: CoupleEntry

    var body: some View {
        VStack(spacing: 4) {
            Text("🔥 \(entry.streakCount)")
                .font(.headline)
            Text(entry.distanceText)
                .font(.subheadline)
            Text("\(entry.daysTogether) días juntos")
                .font(.caption)
        }
        .padding()
    }
}

@main
struct CoupleWidget: Widget {
    let kind: String = "CoupleWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CoupleProvider()) { entry in
            CoupleWidgetView(entry: entry)
        }
        .configurationDisplayName("Couple App")
        .description("Racha, distancia y días juntos.")
        .supportedFamilies([.systemSmall, .accessoryRectangular]) // accessoryRectangular = pantalla de bloqueo
    }
}
