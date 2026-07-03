import { read } from "reroi";
import { BreathControl, BreathingPhase } from "./breathControl";
import { Frame } from "./frame";
import { accent } from "./theme";

const cssVar = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export interface DrawingContext {
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,

  reset(): void;
}

export function initAnimation(frame: Frame, breathControl: BreathControl): DrawingContext {
  const canvas = document.getElementById("animation") as HTMLCanvasElement;
  if (!canvas) {
    throw new Error('Canvas was not found!');
  }
  const ctx = canvas.getContext("2d")!;



  let width: number = 0, height: number = 0;

  const normX = (x: number) => {
    return x * width;
  }
  const normY = (y: number) => {
    return y * height;
  }

  const normRadius = (r: number) => {
    // it is a square so okay
    return r * (width / 2);
  }

  const clear = () => {
    ctx.clearRect(0, 0, width, height);
  }

  const circle = (x: number, y: number, radius: number) => {
    const cx = normX(x), cy = normY(y), r = normRadius(radius);

    // Radial fill (bright centre → deeper rim) gives the orb some depth and
    // keeps the very centre — where the readout lives — the highest-contrast
    // spot against the text.
    const center = cssVar("--breath-fill") || accent();
    const edge = cssVar("--breath-fill-edge") || center;
    const grad = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
    grad.addColorStop(0, center);
    grad.addColorStop(1, edge);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Keep the backing store matched to the CSS size × devicePixelRatio so the
   *  drawing stays crisp on retina / when resized. Draw in CSS pixels after this. */
  function resizeCanvas(): void {
    const rect = canvas.getBoundingClientRect();
    width = rect.width; height = rect.height;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  }

  resizeCanvas();
  new ResizeObserver(resizeCanvas).observe(canvas);

  if (width !== height) {
    throw new Error('Canvas should be a rect!');
  }

  let progress = 0;
  let prevPhase = BreathingPhase.STOP;
  frame.registerUpdate(ms => {
    const phase = read(breathControl.activePhase);

    switch (phase) {
      case BreathingPhase.HOLD_IN:
      case BreathingPhase.HOLD_OUT:
      case BreathingPhase.STOP:
        return; // no animation for these phases
    }

    clear();

    const len = read(breathControl.phaseLength);

    switch (phase) {
      case BreathingPhase.INHALE: {
        progress += ms;
        progress = Math.min(progress, len);
        break;
      }
      case BreathingPhase.EXHALE: {
        if (prevPhase !== BreathingPhase.EXHALE) {
          // next cycle start, need to make sure the progress is maxed
          progress = len;
        }
        progress -= ms;
        progress = Math.max(progress, 0);
        break;
      }
    }

    circle(0.5, 0.5, progress / len);
    prevPhase = phase;
  })


  return {
    canvas,
    ctx,

    reset() {
      clear();
      progress = 0;
    },
  }
}
