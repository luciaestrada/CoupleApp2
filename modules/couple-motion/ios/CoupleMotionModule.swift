import CoreMotion
import ExpoModulesCore
import UIKit

public final class CoupleMotionModule: Module {
  private let manager = CMMotionActivityManager()
  private var latest: [String: Any]?
  private var enabled = false

  private func record(_ activity: CMMotionActivity) {
    let kind = activity.automotive ? "driving" : activity.cycling ? "cycling" :
      (activity.walking || activity.running) ? "walking" : activity.stationary ? "stationary" : "unknown"
    latest = ["activity": kind, "timestamp": Date().timeIntervalSince1970 * 1000,
      "confidence": activity.confidence == .high ? "high" : activity.confidence == .medium ? "medium" : "low"]
  }
  public func definition() -> ModuleDefinition {
    Name("CoupleMotion")
    AsyncFunction("getBackgroundExecutionStateAsync") { () -> [String: Any] in
      let refresh: String
      switch UIApplication.shared.backgroundRefreshStatus {
      case .available: refresh = "available"
      case .denied: refresh = "denied"
      case .restricted: refresh = "restricted"
      @unknown default: refresh = "unknown"
      }
      #if targetEnvironment(simulator)
      let simulator = true
      #else
      let simulator = false
      #endif
      return [
        "backgroundRefreshStatus": refresh,
        "lowPowerMode": ProcessInfo.processInfo.isLowPowerModeEnabled,
        "backgroundModes": Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String] ?? [],
        "schedulerIdentifiers": Bundle.main.object(forInfoDictionaryKey: "BGTaskSchedulerPermittedIdentifiers") as? [String] ?? [],
        "simulator": simulator
      ]
    }.runOnQueue(.main)
    AsyncFunction("requestPermissionsAsync") { (promise: Promise) in
      guard CMMotionActivityManager.isActivityAvailable() else { promise.resolve(["granted": false]); return }
      manager.queryActivityStarting(from: Date().addingTimeInterval(-60), to: Date(), to: .main) { _, _ in
        promise.resolve(["granted": CMMotionActivityManager.authorizationStatus() == .authorized])
      }
    }
    AsyncFunction("startAsync") { () -> Bool in
      guard CMMotionActivityManager.isActivityAvailable(), CMMotionActivityManager.authorizationStatus() == .authorized else { return false }
      enabled = true
      manager.startActivityUpdates(to: .main) { [weak self] activity in
        guard let self, self.enabled, let activity else { return }
        self.record(activity)
      }
      return true
    }.runOnQueue(.main)
    AsyncFunction("getActivityAsync") { (promise: Promise) in
      guard enabled, CMMotionActivityManager.authorizationStatus() == .authorized else { promise.resolve(nil); return }
      if let latest, let time = latest["timestamp"] as? Double,
        Date().timeIntervalSince1970 * 1000 - time < 120000 {
        promise.resolve(latest)
        return
      }
      manager.queryActivityStarting(from: Date().addingTimeInterval(-600), to: Date(), to: .main) { [weak self] activities, error in
        guard let self, self.enabled, error == nil, let activity = activities?.last else { promise.resolve(nil); return }
        self.record(activity)
        promise.resolve(self.latest)
      }
    }.runOnQueue(.main)
    AsyncFunction("stopAsync") {
      enabled = false
      manager.stopActivityUpdates()
      latest = nil
    }.runOnQueue(.main)
    OnDestroy {
      manager.stopActivityUpdates()
    }
  }
}
