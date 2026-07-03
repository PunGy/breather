export type FrameListener = (dt: number) => void;

export interface Frame {
  // Launch the loop frame
  startLoop(): void;

  // Stop the loop frame
  stopLoop(): void;

  // Specifically not reactive to highlight the pull nature of the Frame
  started: boolean;

  // Cannot be unregistered
  registerUpdate(listener: FrameListener): void;
}

export function initFrame(): Frame {
  const registry: Array<FrameListener> = [];

  const MAX_DT = 100;

  return {
    started: false,
    startLoop() {
      if (this.started) return;

      this.started = true;

      let currentTime = performance.now();

      const loop = (newTime: number) => {
        if (!this.started) return;

        for (const listener of registry) {
          listener(Math.min(Math.max(newTime - currentTime, 0), MAX_DT));
        }
        currentTime = newTime;

        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop)
    },

    registerUpdate(listener) {
      registry.push(listener);
    },

    stopLoop() {
      this.started = false;
    }
  }

}
