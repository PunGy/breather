import { transaction, deriveAll, listen, ReactiveDerivation, ReactiveValue, val, read, listenAll, priorities } from "reroi";
import { Persistence } from "./persistence";

export const enum PresetCode {
  COHERENT = "COHERENT",
  BOX = "BOX",
  RELAXING = "RELAXING",
  CALM = "CALM",
  CUSTOM = "CUSTOM",
}

export function strToPresetCode(str: string): PresetCode {
  switch (str) {
    case "COHERENT":
      return PresetCode.COHERENT;
    case "BOX":
      return PresetCode.BOX;
    case "RELAXING":
      return PresetCode.RELAXING;
    case "CALM":
      return PresetCode.CALM;
    case "CUSTOM":
      return PresetCode.CUSTOM;
  }
  throw new Error(`Unable to convert string "${str}" into preset code`);
}

export const enum BreathingPhase {
  INHALE = 'inhale',
  EXHALE = 'exhale',
  HOLD_IN = 'hold-in',
  HOLD_OUT = 'hold-out',

  STOP = 'stop',
}

export interface BreathControl {
  inhale: ReactiveValue<number>,
  exhale: ReactiveValue<number>,
  holdInhale: ReactiveValue<number>,
  holdExhale: ReactiveValue<number>,
  phaseLength: ReactiveDerivation<number>,

  breathRate: ReactiveDerivation<number>,
  activePreset: ReactiveValue<PresetCode>,
  activePhase: ReactiveValue<BreathingPhase>,
}

export interface Preset {
  inhale: number,
  exhale: number,
  holdInhale: number,
  holdExhale: number,
}

/// Presets

export function coherent() {
  return {
    inhale: 5,
    holdInhale: 0,
    exhale: 5,
    holdExhale: 0,
  }
}
export function box() {
  return {
    inhale: 4,
    holdInhale: 4,
    exhale: 4,
    holdExhale: 4,
  }
}
export function relaxing() {
  return {
    inhale: 4,
    holdInhale: 7,
    exhale: 8,
    holdExhale: 0,
  }
}
export function calm() {
  return {
    inhale: 4,
    holdInhale: 0,
    exhale: 6,
    holdExhale: 0,
  }
}
export function CUSTOM() {
  return {
    inhale: 6,
    holdInhale: 0,
    exhale: 6,
    holdExhale: 0,
  }
}

export function getLastPreset(): PresetCode {
  return PresetCode.COHERENT;
}
export function getPreset(presetCode: PresetCode): Preset {
  switch (presetCode) {
    case PresetCode.CALM:
      return calm();
    case PresetCode.COHERENT:
      return coherent();
    case PresetCode.BOX:
      return box();
    case PresetCode.CUSTOM:
      return CUSTOM();
    case PresetCode.RELAXING:
      return relaxing();
  }
}

function getPresetCache(persistence: Persistence, phase: PresetCode): { inhale: number, holdInhale: number, exhale: number, holdExhale: number } | null {
  const key = `${phase}-state`;
  const cache = persistence.get(key);

  if (cache) {
    const values = cache.split(',').map(x => parseFloat(x))
    if (values.length !== 4) {
      console.error(`Cache for "${key}" is broken! Values is: "${values}"`);
      return null;
    }

    return {
      inhale: values[0]!,
      holdInhale: values[1]!,
      exhale: values[2]!,
      holdExhale: values[3]!,
    }
  }
  return null;
}


/**
  * Constructor
  */
export function initBreathControl(persistence: Persistence): BreathControl {
  const activePreset = persistence.rise('last-preset', strToPresetCode, PresetCode.COHERENT);
  persistence.persist('last-preset', activePreset);

  const preset = getPreset(read(activePreset));

  function applyPreset(preset: Preset) {
    transaction.compose(
      transaction.write(inhale, preset.inhale),
      transaction.write(exhale, preset.exhale),
      transaction.write(holdInhale, preset.holdInhale),
      transaction.write(holdExhale, preset.holdExhale),
    ).run();
  }

  const cachedPreset = getPresetCache(persistence, read(activePreset));

  const inhale = val(cachedPreset?.inhale ?? preset.inhale);
  const exhale = val(cachedPreset?.exhale ?? preset.exhale);
  const holdInhale = val(cachedPreset?.holdInhale ?? preset.holdInhale);
  const holdExhale = val(cachedPreset?.holdExhale ?? preset.holdExhale);


  listenAll(
    [activePreset, inhale, holdInhale, exhale, holdExhale],
    ([preset, inhale, holdInhale, exhale, holdExhale]) => {
      const key = `${preset}-state`;
      persistence.set(key, `${inhale},${holdInhale},${exhale},${holdExhale}`);
    },
    { priority: priorities.lowest }
  )


  const breathRate = deriveAll(
    [inhale, exhale, holdInhale, holdExhale],
    ([inh, exh, hInh, hExh]) => {
      return 60 / (inh + exh + hInh + hExh)
    }
  );

  const activePhase = val(BreathingPhase.STOP);

  const phaseLength = deriveAll(
    [
      activePhase,
      inhale,
      exhale,
      holdExhale,
      holdInhale,
    ],
    ([phase, inhale, exhale, holdExhale, holdInhale]) => {
      switch (phase) {
        case BreathingPhase.INHALE:
          return inhale * 1000
        case BreathingPhase.EXHALE:
          return exhale * 1000
        case BreathingPhase.HOLD_IN:
          return holdInhale * 1000
        case BreathingPhase.HOLD_OUT:
          return holdExhale * 1000
      }

      return -1; // stoped
    }
  )

  listen(activePreset, presetCode => {
    applyPreset(getPreset(presetCode));
  })

  return {
    inhale,
    exhale,
    holdInhale,
    holdExhale,

    breathRate,

    activePreset,
    activePhase,
    phaseLength,
  }
}
