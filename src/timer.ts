import { Reactive, val, write } from "reroi";
import { Frame } from "./frame";

export interface Timer {
  // Controls
  reset(): void;

  // Values
  time: Reactive<{ elapsed: number, delta: number }>,
}

export function initTimer(frame: Frame): Timer {
  const time = val({ elapsed: 0, delta: 0 });

  frame.registerUpdate(dt => {
    write(time, t => {
      t.elapsed += dt
      t.delta = dt;

      return t;
    })
  })

  return {
    reset() {
      write(time, { elapsed: 0, delta: 0 });
    },

    time,
  }
} 
