import CoreHaptics
import ExpoModulesCore
import Foundation

struct HapticTextureEvent: Record {
  @Field var durationMs: Double?
  @Field var intensity: Double = 0
  @Field var sharpness: Double = 0
  @Field var startMs: Double = 0
  @Field var type: String = "transient"
}

struct HapticTextureDefinition: Record {
  @Field var events: [HapticTextureEvent] = []
  @Field var id: String = ""
}

struct TelemetryHapticUpdate: Record {
  @Field var engineIntensity: Double = 0
  @Field var enginePlaybackRate: Double = 1
  @Field var engineSharpness: Double = 0
  @Field var impactIntensity: Double = 0
  @Field var impactIntervalMs: Double = 180
  @Field var turnDirection: String = "center"
}

private final class HapticController {
  private let engineLoopDuration: TimeInterval = 0.18
  private let queue = DispatchQueue(label: "com.f1replay.haptics")
  private var engine: CHHapticEngine?
  private var engineIsRunning = false
  private var enginePlayer: CHHapticAdvancedPatternPlayer?
  private var impactIsActive = false
  private var lastImpactIntensity: Float = 0
  private var lastImpactTime = -Double.infinity
  private var patternPlayer: CHHapticPatternPlayer?
  private var telemetryIsActive = false

  var isSupported: Bool {
    CHHapticEngine.capabilitiesForHardware().supportsHaptics
  }

  func playPattern(_ definition: HapticTextureDefinition) throws {
    try queue.sync {
      guard !definition.events.isEmpty else {
        throw invalidPattern("Pattern \(definition.id) has no events.")
      }
      try startEngineIfNeeded()
      let events = try definition.events.map(makeEvent)
      let pattern = try CHHapticPattern(events: events, parameters: [])
      let player = try requiredEngine().makePlayer(with: pattern)
      patternPlayer = player
      try player.start(atTime: CHHapticTimeImmediate)
    }
  }

  func startTelemetry() throws {
    try queue.sync {
      telemetryIsActive = true
      try startEngineIfNeeded()
      try startEnginePlayerIfNeeded()
    }
  }

  func updateTelemetry(_ update: TelemetryHapticUpdate) throws {
    try queue.sync {
      guard telemetryIsActive else { return }
      try startEngineIfNeeded()
      try startEnginePlayerIfNeeded()
      try updateEnginePlayer(update)
      try updateImpact(update)
    }
  }

  func stopTelemetry() throws {
    try queue.sync {
      telemetryIsActive = false
      impactIsActive = false
      lastImpactIntensity = 0
      lastImpactTime = -Double.infinity
      try enginePlayer?.stop(atTime: CHHapticTimeImmediate)
      enginePlayer = nil
    }
  }

  func stop() throws {
    try queue.sync {
      telemetryIsActive = false
      impactIsActive = false
      try enginePlayer?.stop(atTime: CHHapticTimeImmediate)
      try patternPlayer?.stop(atTime: CHHapticTimeImmediate)
      enginePlayer = nil
      patternPlayer = nil
    }
  }

  private func startEngineIfNeeded() throws {
    guard isSupported else { return }
    if engine == nil {
      let nextEngine = try CHHapticEngine()
      nextEngine.stoppedHandler = { [weak self] _ in
        self?.queue.async {
          self?.engineIsRunning = false
          self?.enginePlayer = nil
          self?.patternPlayer = nil
        }
      }
      nextEngine.resetHandler = { [weak self] in
        self?.queue.async {
          guard let self else { return }
          self.engineIsRunning = false
          self.enginePlayer = nil
          self.patternPlayer = nil
          guard self.telemetryIsActive else { return }
          try? self.startEngineIfNeeded()
          try? self.startEnginePlayerIfNeeded()
        }
      }
      engine = nextEngine
    }
    guard !engineIsRunning else { return }
    try requiredEngine().start()
    engineIsRunning = true
  }

  private func startEnginePlayerIfNeeded() throws {
    guard isSupported, enginePlayer == nil else { return }
    let body = CHHapticEvent(
      eventType: .hapticContinuous,
      parameters: eventParameters(intensity: 1, sharpness: 0),
      relativeTime: 0,
      duration: engineLoopDuration
    )
    let primaryBeat = CHHapticEvent(
      eventType: .hapticTransient,
      parameters: eventParameters(intensity: 0.18, sharpness: 0),
      relativeTime: 0
    )
    let secondaryBeat = CHHapticEvent(
      eventType: .hapticTransient,
      parameters: eventParameters(intensity: 0.08, sharpness: 0),
      relativeTime: 0.06
    )
    let pattern = try CHHapticPattern(
      events: [body, primaryBeat, secondaryBeat],
      parameters: []
    )
    let player = try requiredEngine().makeAdvancedPlayer(with: pattern)
    player.loopEnabled = true
    player.loopEnd = engineLoopDuration
    enginePlayer = player
    try player.start(atTime: CHHapticTimeImmediate)
  }

  private func updateEnginePlayer(_ update: TelemetryHapticUpdate) throws {
    guard let player = enginePlayer else { return }
    player.playbackRate = bounded(update.enginePlaybackRate, minimum: 0.5, maximum: 2)
    let parameters = [
      CHHapticDynamicParameter(
        parameterID: .hapticIntensityControl,
        value: bounded(update.engineIntensity, maximum: 0.62),
        relativeTime: 0
      ),
      CHHapticDynamicParameter(
        parameterID: .hapticSharpnessControl,
        value: bounded(update.engineSharpness),
        relativeTime: 0
      ),
    ]
    try player.sendParameters(parameters, atTime: CHHapticTimeImmediate)
  }

  private func updateImpact(_ update: TelemetryHapticUpdate) throws {
    let intensity = bounded(update.impactIntensity, maximum: 0.78)
    let wasActive = impactIsActive
    if impactIsActive {
      if intensity <= 0.04 { impactIsActive = false }
    } else if intensity >= 0.12 {
      impactIsActive = true
    }

    let now = ProcessInfo.processInfo.systemUptime
    let interval = Double(
      bounded(update.impactIntervalMs, minimum: 55, maximum: 180)
    ) / 1_000
    let roseSuddenly = intensity - lastImpactIntensity >= 0.25
    if impactIsActive && (!wasActive || roseSuddenly || now - lastImpactTime >= interval) {
      try playImpact(intensity: intensity, direction: update.turnDirection)
      lastImpactTime = now
    }
    lastImpactIntensity = intensity
  }

  private func playImpact(intensity: Float, direction: String) throws {
    let events: [CHHapticEvent]
    switch direction {
    case "left":
      events = [
        transient(time: 0, intensity: intensity, sharpness: 0.85),
        transient(time: 0.035, intensity: intensity * 0.35, sharpness: 0.25),
      ]
    case "right":
      events = [
        transient(time: 0, intensity: intensity * 0.35, sharpness: 0.25),
        transient(time: 0.035, intensity: intensity, sharpness: 0.85),
      ]
    default:
      events = [transient(time: 0, intensity: intensity, sharpness: 0.65)]
    }
    let pattern = try CHHapticPattern(events: events, parameters: [])
    let player = try requiredEngine().makePlayer(with: pattern)
    try player.start(atTime: CHHapticTimeImmediate)
  }

  private func makeEvent(_ event: HapticTextureEvent) throws -> CHHapticEvent {
    let parameters = eventParameters(
      intensity: bounded(event.intensity),
      sharpness: bounded(event.sharpness)
    )
    let relativeTime = seconds(event.startMs)
    switch event.type {
    case "transient":
      return CHHapticEvent(
        eventType: .hapticTransient,
        parameters: parameters,
        relativeTime: relativeTime
      )
    case "continuous":
      guard let durationMs = event.durationMs, durationMs.isFinite, durationMs > 0 else {
        throw invalidPattern("Continuous events require a positive duration.")
      }
      return CHHapticEvent(
        eventType: .hapticContinuous,
        parameters: parameters,
        relativeTime: relativeTime,
        duration: seconds(durationMs)
      )
    default:
      throw invalidPattern("Unknown haptic event type: \(event.type).")
    }
  }

  private func transient(
    time: TimeInterval,
    intensity: Float,
    sharpness: Float
  ) -> CHHapticEvent {
    CHHapticEvent(
      eventType: .hapticTransient,
      parameters: eventParameters(intensity: intensity, sharpness: sharpness),
      relativeTime: time
    )
  }

  private func eventParameters(
    intensity: Float,
    sharpness: Float
  ) -> [CHHapticEventParameter] {
    [
      CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
      CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness),
    ]
  }

  private func requiredEngine() throws -> CHHapticEngine {
    guard let engine else {
      throw invalidPattern("Core Haptics is unavailable on this device.")
    }
    return engine
  }

  private func bounded(
    _ value: Double,
    minimum: Float = 0,
    maximum: Float = 1
  ) -> Float {
    guard value.isFinite else { return minimum }
    return min(max(Float(value), minimum), maximum)
  }

  private func seconds(_ milliseconds: Double) -> TimeInterval {
    max(milliseconds, 0) / 1_000
  }

  private func invalidPattern(_ message: String) -> NSError {
    NSError(
      domain: "F1Haptics",
      code: 1,
      userInfo: [NSLocalizedDescriptionKey: message]
    )
  }
}

public final class F1HapticsModule: Module {
  private let controller = HapticController()

  public func definition() -> ModuleDefinition {
    Name("F1Haptics")

    Function("isSupported") {
      controller.isSupported
    }

    AsyncFunction("playPattern") { (pattern: HapticTextureDefinition) in
      try controller.playPattern(pattern)
    }

    AsyncFunction("startTelemetry") {
      try controller.startTelemetry()
    }

    AsyncFunction("updateTelemetry") { (update: TelemetryHapticUpdate) in
      try controller.updateTelemetry(update)
    }

    AsyncFunction("stopTelemetry") {
      try controller.stopTelemetry()
    }

    AsyncFunction("stop") {
      try controller.stop()
    }
  }
}
