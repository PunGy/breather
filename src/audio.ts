import { read } from "reroi";
import { BreathControl, BreathingPhase } from "./breathControl";
import { Frame } from "./frame";
import { Persistence } from "./persistence";

/**
 * Meditation soundscape — synthesised live in the browser (no audio files),
 * driven by the same breathing phases the animation reacts to.
 *
 * Three layers, all chosen to stay calm and *not* fatigue the ear:
 *
 *   1. Phase marimba — a short, woody note at the start of every phase. The
 *      notes spell an F‑major chord (C5 · A4 · F4 · C4) so they always sit
 *      inside the pad's harmony: inhale rises (C5), exhale resolves down (F4).
 *      A marimba is used rather than a pure bell because its energy is mostly
 *      low, with a fast decay — little sustained content in the harsh 2–5 kHz
 *      band the ear is most sensitive to.
 *
 *   2. Cosmic pad — a continuous drone on F3 · C4 · F4 (root · fifth · octave,
 *      a consonant open voicing with no beating), each note a detuned, stereo‑
 *      spread pair drifting on a slow chorus, over a faint sub and a faint high
 *      "air" partial. It "breathes with you" through *brightness*: the low‑pass
 *      filter opens on the inhale and closes on the exhale, so the pad blooms
 *      and settles with the body instead of changing loudness abruptly.
 *
 *   3. Entrainment shimmer — a very quiet binaural/isochronic layer sitting
 *      under everything, for a faint sense of depth. Its band is selectable
 *      (see {@link AmbientMode}): alpha for relaxed wakefulness, or the slower
 *      theta / delta bands for a warmer, sleepier "wind‑down" bed. The pad
 *      darkens in step, so the deeper bands feel cosier.
 *
 * Anti‑headache treatment (see the accompanying notes):
 *   · fundamentals kept low; a high‑pass removes sub‑bass pressure,
 *   · a master high‑shelf tames the fatiguing 2–5 kHz band,
 *   · all movement is slow (it tracks the ~6 breaths/min rhythm, nothing
 *     faster) and all level changes are ramped — no clicks,
 *   · a gentle convolution reverb adds space; the master sits low, "just
 *     under a whisper".
 *
 * Structured like {@link initAnimation}: it takes the {@link Frame} and the
 * {@link BreathControl}, watches `activePhase` inside the frame loop, and
 * returns a small controller. Where the animation only needs `reset()`, audio
 * also needs `start()` / `stop()` because a browser will not let an
 * AudioContext make sound until a user gesture — wire those to the same
 * Start/Stop action that drives the frame loop.
 */
/** Which continuous background bed plays under the breathing cues. `off`
 *  silences the pad + entrainment layers (the marimba cues still sound); the
 *  other modes run the full cosmic bed, differing in the brainwave band the
 *  faint shimmer nudges toward and how warm/dark the pad sits:
 *    · `alpha` (~10 Hz) — relaxed wakefulness, the brightest bed (default);
 *    · `theta` (~6 Hz)  — a drowsy, warmer wind‑down;
 *    · `delta` (~2.5 Hz)— the deep‑sleep band, darkest/warmest, for pre‑sleep. */
export type AmbientMode = "off" | "alpha" | "theta" | "delta";

export interface AudioController {
  /** Create/resume the audio graph and fade the bed in. Must be called from a
   *  user gesture (the browser autoplay policy blocks sound otherwise). No‑op
   *  while audio is disabled. */
  start(): Promise<boolean>;

  /** Retry playback after Safari or the operating system interrupted it.
   *  Returns whether the AudioContext reached its running state. */
  resume(): Promise<boolean>;

  /** Fade the bed out and suspend. The graph is kept alive so a later
   *  start() resumes instantly without a rebuild. */
  stop(): void;

  /** Return to the idle state so the next start() re‑cues from the inhale. */
  reset(): void;

  /** Master on/off. When turned off mid‑session the bed fades out; when turned
   *  back on it fades in again if a session is running. Persisted. */
  setEnabled(enabled: boolean): Promise<boolean>;

  /** Choose the continuous ambient bed ({@link AmbientMode}). Persisted. */
  setAmbient(mode: AmbientMode): void;

  /** Current master on/off (restored from persistence on init). */
  readonly enabled: boolean;

  /** Current ambient bed (restored from persistence on init). */
  readonly ambient: AmbientMode;
}

interface PhaseVoice {
  /** Marimba cue pitch — all tones of F major, never clash with the F pad. */
  freq: number;
  /** Cue loudness (0..1). */
  vel: number;
  /** Pad low‑pass cutoff as a multiple of its base — the "breathes with you". */
  bright: number;
}

// C5 up on the inhale, resolving down to F4 on the exhale; the holds are softer
// inner voices (A4, C4). Brightness opens on the way in, closes on the way out.
const VOICES: Partial<Record<BreathingPhase, PhaseVoice>> = {
  [BreathingPhase.INHALE]: { freq: 523.25, vel: 1.0, bright: 2.7 },
  [BreathingPhase.HOLD_IN]: { freq: 440.0, vel: 0.55, bright: 2.2 },
  [BreathingPhase.EXHALE]: { freq: 349.23, vel: 0.85, bright: 0.9 },
  [BreathingPhase.HOLD_OUT]: { freq: 261.63, vel: 0.5, bright: 0.6 },
};

// F3 · C4 · F4 — an open root/fifth/octave voicing, lifted an octave from a
// plain warm drone so it floats rather than sits low. A quiet sub (F2) grounds
// it; a quiet high partial (C5) adds cosmic air.
const PAD_NOTES = [174.61, 261.63, 349.23];
const PAD_SUB = 87.31; // F2 — faint grounding
const PAD_AIR = 523.25; // C5 — faint sparkle (rolled off by the master shelf)

const MASTER_LEVEL = 0.6; // keep it below a whisper
const CUE_LEVEL = 0.45; // marimba bus — the clearest voice
const PAD_LEVEL = 0.016; // pad bus — a faint wash under the notes (~1/5 of before)
const REVERB_SEND = 0.34; // space, for the ambient feel
// Each ambient bed picks a brainwave band for the faint entrainment shimmer and
// a matching pad "warmth" (the pad's closed/rest low‑pass cutoff), so the whole
// soundscape gets progressively darker and sleepier as you step down the ladder.
// On headphones the two carriers form a binaural beat; on speakers they sum to a
// faint, slow shimmer — kept subliminal, depth rather than an obvious pulse. The
// carrier drops with the band too, so deeper beds sit a touch lower and warmer.
interface AmbientBed {
  /** Binaural beat frequency (Hz) — the band this bed nudges toward. */
  beat: number;
  /** Carrier the beat rides on (Hz); lower carriers read as warmer/deeper. */
  carrier: number;
  /** Pad closed/rest low‑pass cutoff (Hz) — how bright/dark the pad sits. */
  padCut: number;
}
type ActiveBed = Exclude<AmbientMode, "off">;
const BEDS: Record<ActiveBed, AmbientBed> = {
  alpha: { beat: 10, carrier: 220, padCut: 800 }, // A3 · relaxed wakefulness (8–12 Hz)
  theta: { beat: 6, carrier: 174.61, padCut: 560 }, // F3 · drowsy wind‑down (4–7 Hz)
  delta: { beat: 2.5, carrier: 130.81, padCut: 400 }, // C3 · deep sleep (0.5–4 Hz)
};
const ENTRAIN_LEVEL = 0.02; // barely there — depth, not a pulse

const AudioCtx: typeof AudioContext =
  window.AudioContext ??
  (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

const ENABLED_KEY = "audio-enabled";
const AMBIENT_KEY = "audio-ambient";

export function initAudio(frame: Frame, breathControl: BreathControl, persistence: Persistence): AudioController {
  let ctx: AudioContext | null = null;

  // Buses / persistent nodes (created lazily on the first start()).
  let master: GainNode;
  let cueBus: GainNode;
  let padBus: GainNode;
  let ambientBus: GainNode; // pad + entrainment bed, gated by the ambient setting
  let reverb: ConvolverNode;
  let padFilter: BiquadFilterNode;
  // The two binaural carriers; retuned when the ambient band changes.
  let entrainLow: OscillatorNode;
  let entrainHigh: OscillatorNode;

  let running = false; // a session is active (Start pressed)
  // Restored from persistence (defaults: audio on, alpha bed).
  let enabled = persistence.get(ENABLED_KEY) !== "false"; // master audio switch
  const parseAmbient = (v: string | null): AmbientMode =>
    v === "off" || v === "theta" || v === "delta" || v === "alpha" ? v : "alpha";
  let ambient: AmbientMode = parseAmbient(persistence.get(AMBIENT_KEY));
  // The pad's rest low‑pass cutoff, taken from the active bed's warmth; read live
  // in applyBrightness so phase transitions track whichever bed is playing.
  let padBaseCut = (ambient === "off" ? BEDS.alpha : BEDS[ambient]).padCut;
  let prevPhase = BreathingPhase.STOP;

  const setAudioSessionType = (type: WebAudioSessionType) => {
    if (navigator.audioSession) navigator.audioSession.type = type;
  };

  /** Random‑noise impulse response — a cheap, smooth reverb tail. */
  const makeIR = (seconds: number, decay: number): AudioBuffer => {
    const rate = ctx!.sampleRate;
    const len = Math.floor(rate * seconds);
    const ir = ctx!.createBuffer(2, len, rate);
    for (let channel = 0; channel < 2; channel++) {
      const data = ir.getChannelData(channel);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return ir;
  };

  /** Ramp a gain param, keeping it above zero so exponential curves stay legal. */
  const rampGain = (param: AudioParam, value: number, secs: number) => {
    const t = ctx!.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(Math.max(param.value, 0.0001), t);
    param.linearRampToValueAtTime(Math.max(value, 0.0001), t + secs);
  };

  /** Ramp any param linearly from wherever it is now. */
  const rampParam = (param: AudioParam, value: number, secs: number) => {
    const t = ctx!.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(value, t + secs);
  };

  const buildGraph = () => {
    ctx = new AudioCtx();

    // master → soften (tame 2–5 kHz) → gentle compressor → out
    const soften = ctx.createBiquadFilter();
    soften.type = "highshelf";
    soften.frequency.value = 2600;
    soften.gain.value = -10;
    const comp = ctx.createDynamicsCompressor();
    soften.connect(comp).connect(ctx.destination);

    master = ctx.createGain();
    master.gain.value = 0.0001; // silent until start() fades it in
    master.connect(soften);

    reverb = ctx.createConvolver();
    reverb.buffer = makeIR(3.4, 2.2);
    const reverbGain = ctx.createGain();
    reverbGain.gain.value = REVERB_SEND;
    reverb.connect(reverbGain).connect(master);

    cueBus = ctx.createGain();
    cueBus.gain.value = CUE_LEVEL;
    cueBus.connect(master);
    cueBus.connect(reverb);

    // Ambient bed bus — the continuous pad + alpha layers feed this, so the
    // "Off" ambient setting can silence them while the marimba cues (cueBus)
    // keep sounding.
    ambientBus = ctx.createGain();
    ambientBus.gain.value = ambient === "off" ? 0.0001 : 1;
    ambientBus.connect(master);
    ambientBus.connect(reverb);

    padBus = ctx.createGain();
    padBus.gain.value = PAD_LEVEL;
    padBus.connect(ambientBus);
  };

  /** The continuous cosmic drone. Built once; it plays for the app's lifetime
   *  and is silenced by suspending the context, not by tearing oscillators down. */
  const buildPad = () => {
    padFilter = ctx!.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.Q.value = 0.4;
    padFilter.frequency.value = padBaseCut;

    const highpass = ctx!.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 50; // strip sub pressure, keep the F2 grounding

    // Slow chorus — one shared LFO gently drifts the detune of every core
    // voice, so the pad shimmers and evolves on its own between breaths.
    const shimmer = ctx!.createOscillator();
    shimmer.frequency.value = 0.08; // ~one sweep every 12s
    const shimmerDepth = ctx!.createGain();
    shimmerDepth.gain.value = 6; // ±6 cents
    shimmer.connect(shimmerDepth);
    shimmer.start();

    // Core voices — each note as a detuned, stereo‑spread pair for width.
    for (const freq of PAD_NOTES) {
      const spread: Array<[OscillatorType, number, number]> = [
        ["sine", -6, -0.4],
        ["triangle", 6, 0.4],
      ];
      for (const [type, detune, pan] of spread) {
        const osc = ctx!.createOscillator();
        osc.type = type;
        osc.frequency.value = freq;
        osc.detune.value = detune;
        shimmerDepth.connect(osc.detune);
        const panner = ctx!.createStereoPanner();
        panner.pan.value = pan;
        osc.connect(panner).connect(padFilter);
        osc.start();
      }
    }

    // Faint sub for grounding, faint high sine for cosmic air.
    const extras: Array<[number, number]> = [
      [PAD_SUB, 0.5],
      [PAD_AIR, 0.2],
    ];
    for (const [freq, level] of extras) {
      const osc = ctx!.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const gain = ctx!.createGain();
      gain.gain.value = level;
      osc.connect(gain).connect(padFilter);
      osc.start();
    }

    padFilter.connect(highpass).connect(padBus);
  };

  /** The faint entrainment layer: two carriers a beat‑frequency apart, panned
   *  hard L/R, sitting quietly under the master. Built once at the active bed's
   *  band; {@link setAmbient} ramps the carriers to switch bands live. */
  const buildEntrainment = () => {
    const bed = ambient === "off" ? BEDS.alpha : BEDS[ambient];

    const lowpass = ctx!.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 900; // pure sines — only shaves any stray harmonics
    const level = ctx!.createGain();
    level.gain.value = ENTRAIN_LEVEL;
    lowpass.connect(level).connect(ambientBus);

    entrainLow = ctx!.createOscillator();
    entrainLow.type = "sine";
    entrainLow.frequency.value = bed.carrier;
    entrainHigh = ctx!.createOscillator();
    entrainHigh.type = "sine";
    entrainHigh.frequency.value = bed.carrier + bed.beat;

    const pair: Array<[OscillatorNode, number]> = [
      [entrainLow, -1],
      [entrainHigh, 1],
    ];
    for (const [osc, pan] of pair) {
      const panner = ctx!.createStereoPanner();
      panner.pan.value = pan;
      osc.connect(panner).connect(lowpass);
      osc.start();
    }
  };

  /** A short, woody note — fundamental + a strong 4th partial (the "wood"). */
  const marimba = (freq: number, vel: number) => {
    const t = ctx!.currentTime;
    const partials: Array<[number, number, number]> = [
      [1, 1.0, 1.0],
      [3.9, 0.32, 0.35],
      [9.2, 0.07, 0.18],
    ];
    for (const [mult, amp, decay] of partials) {
      const osc = ctx!.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq * mult;
      const gain = ctx!.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vel * amp * 0.8, t + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      osc.connect(gain).connect(cueBus);
      osc.start(t);
      osc.stop(t + decay + 0.05);
    }
  };

  /** Open or close the pad's low‑pass over the phase, so it breathes with you. */
  const applyBrightness = (voice: PhaseVoice, durSecs: number) => {
    rampParam(padFilter.frequency, padBaseCut * voice.bright, Math.max(durSecs * 0.9, 0.4));
  };

  /** Re‑settle the pad's low‑pass toward the active bed's warmth for the current
   *  phase, so switching beds warms/brightens the pad without waiting a phase. */
  const retunePad = (secs: number) => {
    const voice = VOICES[read(breathControl.activePhase)];
    rampParam(padFilter.frequency, padBaseCut * (voice ? voice.bright : 1), secs);
  };

  // Same shape as the animation loop: watch the phase inside the frame and act
  // on transitions. Web Audio schedules the actual ramps, so we don't need the
  // per‑frame delta the animation uses.
  frame.registerUpdate(() => {
    if (!running || !enabled || !ctx) return;

    const phase = read(breathControl.activePhase);
    if (phase === prevPhase) return;
    prevPhase = phase;

    const voice = VOICES[phase];
    if (!voice) return; // STOP — nothing to play

    const durSecs = Math.max(read(breathControl.phaseLength), 0) / 1000;
    marimba(voice.freq, voice.vel);
    applyBrightness(voice, durSecs);
  });

  /** Build (if needed), resume and fade the bed in, matching the pad brightness
   *  to the current phase so resuming mid‑breath doesn't jump. Only makes sound
   *  when a session is running *and* audio is enabled. */
  const engage = async (forceRestart = false): Promise<boolean> => {
    if (!running || !enabled) return true;

    try {
      // iOS otherwise treats Web Audio as ambient sound and can mute it when
      // the phone's silent switch is on.
      setAudioSessionType("playback");

      if (!ctx) {
        buildGraph();
        buildPad();
        buildEntrainment();
      }

      const audio = ctx!;
      if (forceRestart && String(audio.state) === "running") {
        await audio.suspend();
      }

      if (String(audio.state) !== "running") {
        let timer = 0;
        const resumed = await Promise.race([
          audio.resume().then(() => true, () => false),
          new Promise<boolean>((resolve) => {
            timer = window.setTimeout(() => resolve(false), 1500);
          }),
        ]);
        window.clearTimeout(timer);

        if (!resumed || String(audio.state) !== "running") return false;
      }

      rampGain(master.gain, MASTER_LEVEL, 0.9); // fade in, no click

      const phase = read(breathControl.activePhase);
      const voice = VOICES[phase];
      if (voice) {
        applyBrightness(voice, Math.max(read(breathControl.phaseLength), 0) / 1000);
      }
      return true;
    } catch (error) {
      console.warn("Could not start audio playback", error);
      return false;
    }
  };

  /** Fade the bed out and suspend once the tail has passed (guarded against a
   *  quick re‑engage within the fade window). */
  const disengage = () => {
    if (!ctx) return;
    const audio = ctx;
    rampGain(master.gain, 0.0001, 0.4);
    window.setTimeout(() => {
      if (!(running && enabled)) {
        void audio.suspend().finally(() => {
          if (!(running && enabled)) setAudioSessionType("auto");
        });
      }
    }, 450);
  };

  const start = async () => {
    running = true;
    return engage();
  };

  const stop = () => {
    running = false;
    disengage();
  };

  return {
    start,
    resume() {
      // A suspend/resume cycle recovers Web Audio that iOS reports as running
      // after an interruption even though it has become inaudible.
      return engage(true);
    },
    stop,
    reset() {
      stop();
      prevPhase = BreathingPhase.STOP;
    },
    async setEnabled(value: boolean) {
      if (enabled === value) return true;
      enabled = value;
      persistence.set(ENABLED_KEY, String(value));
      if (!running) return true; // nothing playing to fade
      if (enabled) return engage();
      disengage();
      return true;
    },
    setAmbient(mode: AmbientMode) {
      ambient = mode;
      persistence.set(AMBIENT_KEY, mode);
      if (mode !== "off") padBaseCut = BEDS[mode].padCut;
      if (!ctx) return; // otherwise applied at build time via the initial values
      rampGain(ambientBus.gain, mode === "off" ? 0.0001 : 1, 0.6);
      if (mode !== "off") {
        // Slide the carriers to the new band and re‑warm the pad to match.
        const bed = BEDS[mode];
        rampParam(entrainLow.frequency, bed.carrier, 0.8);
        rampParam(entrainHigh.frequency, bed.carrier + bed.beat, 0.8);
        retunePad(1.5);
      }
    },
    get enabled() {
      return enabled;
    },
    get ambient() {
      return ambient;
    },
  };
}
