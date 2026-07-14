package expo.modules.f1haptics

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class F1HapticsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("F1Haptics")

    Function("isSupported") {
      // TODO: Report Android waveform/composition support when that adapter is designed.
      false
    }

    AsyncFunction("playPattern") { _: Map<String, Any?> ->
      // TODO: Translate the shared texture definition to VibrationEffect primitives.
    }

    AsyncFunction("startTelemetry") {
      // Android intentionally remains a no-op until its waveform mapping is designed.
    }

    AsyncFunction("updateTelemetry") { _: Map<String, Any?> ->
      // Android intentionally remains a no-op until its waveform mapping is designed.
    }

    AsyncFunction("stopTelemetry") {
      // Android intentionally remains a no-op until its waveform mapping is designed.
    }

    AsyncFunction("stop") {
      // TODO: Cancel the active vibrator effect.
    }
  }
}
