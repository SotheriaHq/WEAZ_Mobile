import { useCallback } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "expo-router";
import { trackMarketSignal } from "@/src/services/marketSignals";

export function useRunwayExposure(
  designId: string | undefined,
  enabled: boolean,
) {
  useFocusEffect(
    useCallback(() => {
      if (!designId || !enabled) return;
      let started: number | null = null;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const track = (
        signalType:
          | "IMPRESSION"
          | "DWELL_SHORT"
          | "DWELL_MEDIUM"
          | "DWELL_LONG",
        value?: number,
      ) =>
        trackMarketSignal({
          targetType: "DESIGN",
          targetId: designId,
          surface: "DESIGN_FEED",
          signalType,
          value,
          screenContext: "Runway",
        });
      const finish = () => {
        clearTimeout(timer);
        if (started === null) return;
        const elapsed = Math.max(0, performance.now() - started);
        started = null;
        if (elapsed >= 1000)
          track(
            elapsed >= 8000
              ? "DWELL_LONG"
              : elapsed >= 3000
                ? "DWELL_MEDIUM"
                : "DWELL_SHORT",
            Math.min(elapsed, 60000),
          );
      };
      const resume = () => {
        if (started === null) {
          started = performance.now();
          timer = setTimeout(() => track("IMPRESSION"), 1000);
        }
      };
      if (AppState.currentState === "active") resume();
      const listener = AppState.addEventListener("change", (state) =>
        state === "active" ? resume() : finish(),
      );
      return () => {
        finish();
        listener.remove();
      };
    }, [designId, enabled]),
  );
}
