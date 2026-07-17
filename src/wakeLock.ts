import { Reactive, val, write } from "reroi";

export type WakeLockStatus = "inactive" | "active" | "unsupported" | "unavailable";

export interface WakeLockController {
  start(): Promise<void>;
  stop(): Promise<void>;
  status: Reactive<WakeLockStatus | null>;
}

export function initWakeLock(): WakeLockController {
  let requested = false;
  let status: Reactive<WakeLockStatus> = val('inactive');
  let sentinel: WakeLockSentinel | null = null;

  const notify = (next: WakeLockStatus) => {
    write(status, next);
  };

  const acquire = async () => {
    if (!requested || document.visibilityState !== "visible") return;
    if (!("wakeLock" in navigator)) {
      notify("unsupported");
      return;
    }
    if (sentinel && !sentinel.released) return;

    try {
      const lock = await navigator.wakeLock.request("screen");
      if (!requested) {
        await lock.release();
        return;
      }

      sentinel = lock;
      lock.addEventListener("release", () => {
        if (sentinel === lock) sentinel = null;
        if (requested && document.visibilityState === "visible") {
          notify("unavailable");
        }
      });
      notify("active");
    } catch (error) {
      console.warn("Could not keep the screen awake", error);
      notify("unavailable");
    }
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && requested) void acquire();
  });

  return {
    async start() {
      requested = true;
      await acquire();
    },
    async stop() {
      requested = false;
      const lock = sentinel;
      sentinel = null;
      if (lock && !lock.released) await lock.release();
      notify("inactive");
    },
    status,
  };
}
