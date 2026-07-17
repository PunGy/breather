import "./style.css";
import { App, initApp } from "./app";
import { initTheme } from "./theme";
import { write, listen, priorities, read, val, transaction } from "reroi";
import { ToggleState } from "./ui";
import { BreathingPhase } from "./breathControl";
import { registerSW } from "virtual:pwa-register";
import { initSessionNotice } from "./sessionNotice";

registerSW({
  immediate: true,
  onRegisterError(error) {
    console.error("Could not register the offline service worker", error);
  },
});

initTheme();

const app = initApp();
const notice = initSessionNotice();

listen(app.wakeLock.status, status => {
  switch (status) {
    case "inactive":
    case "active":
      notice.clear("wake-lock");
      break;
    case "unsupported":
      notice.set("wake-lock", "This browser cannot keep the screen awake during a session.");
      break;
    case "unavailable":
      notice.set("wake-lock", "The screen wake lock is unavailable, possibly because of a device power setting.");
      break;
  }
});

const syncAudioPlayback = async (activation: Promise<boolean>) => {
  const available = await activation;
  if (available || !app.audio.enabled || !app.frame.started) {
    notice.clear("audio");
    return;
  }

  notice.set("audio", "Audio is paused by the browser.", {
    label: "Enable sound",
    run() {
      void syncAudioPlayback(app.audio.resume());
    },
  });
};

const _cycle_ = val(0);
// ms
const _phaseTime_ = val(0);

const _sessionLength_ = val<number | null>(null);

/**
 * Return such session length so it would end on the end of the cycle
 */
const amortiseSessionLength = (sessionLength: number, breathMin: number, elapsedTime: number) => {
  const finalLen = sessionLength - elapsedTime;
  const cycleLen = (60 / breathMin) * 1000;

  if (finalLen < cycleLen) {
    return cycleLen;
  }

  const remainder = cycleLen - (finalLen % cycleLen);

  return finalLen + remainder;
}

/// UI Bindings

listen(app.breathControl.activePhase, phase => {
  app.ui.panels.phaseLabel.set(phase);
}, { immidiate: true })

listen(_cycle_, cycle => {
  app.ui.panels.cycleCount.set(cycle)
})

listen(app.timer.time, time => {
  app.ui.panels.timer.set(time.elapsed)
})

listen(app.breathControl.breathRate, rate => {
  app.ui.panels.breathRate.set(rate);
}, { immidiate: true })

/// Controls

app.ui.controls.toggle.onPress(state => {
  if (state === ToggleState.START) {
    start(app);
  } else {
    stop(app)
  }
});

app.keyboard.mapAction('Space', () => {
  app.ui.controls.toggle.press();
})
app.keyboard.mapAction('KeyR', () => {
  app.ui.controls.reset.press();
})

app.ui.controls.reset.onPress(() => {
  if (app.frame.started) {
    app.ui.controls.toggle.press();
  }
  transaction.compose(
    transaction.write(app.breathControl.activePhase, BreathingPhase.STOP),
    transaction.write(_cycle_, 0),
  ).run();
  app.timer.reset();
  app.animation.reset();
  app.audio.reset();
});

app.ui.controls.patternPreset.onSelect(preset => {
  write(app.breathControl.activePreset, preset);
})

app.ui.controls.sessionLength.onSelect(length => {
  write(_sessionLength_, () => {
    if (length === -1) {
      return null;
    }

    return amortiseSessionLength(length, read(app.breathControl.breathRate), read(app.timer.time).elapsed);
  });
})
listen(app.breathControl.breathRate, (rate) => {
  const len = read(_sessionLength_);
  if (len === null)
    return;

  write(_sessionLength_, amortiseSessionLength(len, rate, read(app.timer.time).elapsed));
})

/// Audio settings — audio owns its persistence; here we just sync the controls
/// to the restored state and forward user changes.

app.ui.controls.audio.enabled.set(app.audio.enabled);
app.ui.controls.audio.ambient.select(app.audio.ambient);

app.ui.controls.audio.enabled.onChange(enabled => {
  if (!enabled) notice.clear("audio");
  void syncAudioPlayback(app.audio.setEnabled(enabled));
});
app.ui.controls.audio.ambient.onSelect(mode => app.audio.setAmbient(mode));

const recoverAudio = () => {
  if (document.visibilityState === "visible" && app.frame.started && app.audio.enabled) {
    void syncAudioPlayback(app.audio.resume());
  }
};
document.addEventListener("visibilitychange", recoverAudio);
window.addEventListener("pageshow", recoverAudio);


// sync on preset change and on init
listen(app.breathControl.activePreset, () => {
  app.ui.controls.pattern.inhale.change(read(app.breathControl.inhale))
  app.ui.controls.pattern.holdIn.change(read(app.breathControl.holdInhale))
  app.ui.controls.pattern.exhale.change(read(app.breathControl.exhale))
  app.ui.controls.pattern.holdOut.change(read(app.breathControl.holdExhale))
}, { immidiate: true })
app.ui.controls.patternPreset.select(read(app.breathControl.activePreset));
// bind
app.ui.controls.pattern.inhale.onChange(len => write(app.breathControl.inhale, len))
app.ui.controls.pattern.holdIn.onChange(len => write(app.breathControl.holdInhale, len))
app.ui.controls.pattern.exhale.onChange(len => write(app.breathControl.exhale, len))
app.ui.controls.pattern.holdOut.onChange(len => write(app.breathControl.holdExhale, len))

/// The loop

const phaseTimePriority = priorities.after(app.breathControl.phaseLength);
listen(app.timer.time, (time) => {
  write(_phaseTime_, t => t + time.delta)
}, { priority: phaseTimePriority })



// Move to next phase
const nextPhase = () => {
  const phase = read(app.breathControl.activePhase);

  let next: BreathingPhase;
  switch (phase) {
    case BreathingPhase.INHALE:
      next = BreathingPhase.HOLD_IN;
      break;
    case BreathingPhase.HOLD_IN:
      next = BreathingPhase.EXHALE;
      break;
    case BreathingPhase.EXHALE:
      next = BreathingPhase.HOLD_OUT;
      break;
    case BreathingPhase.HOLD_OUT:
      next = BreathingPhase.INHALE;
      break;
    default:
      return; // noop on stoped
  }

  write(app.breathControl.activePhase, next);
}

// Loop control
listen(app.timer.time, (time) => {
  const { breathControl } = app;

  // Reach the phase length boundary
  if (read(_phaseTime_) > read(breathControl.phaseLength)) {
    write(_phaseTime_, 0);

    do {
      nextPhase();
    } while(read(breathControl.phaseLength) === 0) // skip zero length phases

    // If the next phase we cycled to is INHALE - we've made a loop
    if (read(breathControl.activePhase) === BreathingPhase.INHALE) {
      write(_cycle_, cycle => cycle + 1);
    }
  }

  const slen = read(_sessionLength_);
  if (slen !== null && slen - time.elapsed <= 0) {
    stop(app);
  }
}, { priority: priorities.after(phaseTimePriority) });


function start(app: App) {
  if (read(app.breathControl.activePhase) === BreathingPhase.STOP) {
    write(app.breathControl.activePhase, BreathingPhase.INHALE);
  }

  // Resume audio while we're still inside the click/keydown gesture, and with
  // the phase already set, so the first frame can cue the inhale.
  void syncAudioPlayback(app.audio.start());
  app.frame.startLoop();
  void app.wakeLock.start();
}

function stop(app: App) {
  app.frame.stopLoop();
  app.audio.stop();
  notice.clear("audio");
  void app.wakeLock.stop();
}
