import { ReactiveValue, val } from "reroi";
import { BreathControl, initBreathControl } from "./breathControl";
import { Frame, initFrame } from "./frame";
import { initTimer, Timer } from "./timer";
import { initUI, UI } from "./ui";
import { DrawingContext, initAnimation } from "./animation";
import { AudioController, initAudio } from "./audio";
import { initKeyboard, KeyboardControl } from "./keyboard";
import { initPersistence, Persistence } from "./persistence";

export interface App {
  // Animation
  animation: DrawingContext,

  // Soundscape
  audio: AudioController,

  // Pattern
  breathControl: BreathControl,

  // Session length
  sessionLength: ReactiveValue<number>, // -1 means Unlimited

  // Frame Loop
  frame: Frame,

  // Persist state between sessions
  persistence: Persistence,

  // Timer
  timer: Timer,

  // Application user interface
  ui: UI,
  // Keyboard interface
  keyboard: KeyboardControl,
}

export function initApp(): App {

  const frame = initFrame();
  const persistence = initPersistence();

  const sessionLength = val(-1);
  const breathControl = initBreathControl(persistence);
  const ui = initUI();
  const keyboard = initKeyboard();

  const timer = initTimer(frame);
  const drawing = initAnimation(frame, breathControl);
  const audio = initAudio(frame, breathControl, persistence);

  return {
    sessionLength,

    breathControl,
    frame,
    persistence,
    timer,
    ui,
    keyboard,

    animation: drawing,
    audio,
  }
}
