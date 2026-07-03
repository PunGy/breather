import { BreathingPhase, PresetCode } from "./breathControl";
import type { AmbientMode } from "./audio";

const minToMs = (minutes: number) => minutes * 60000

export type Button = {
  onPress(listener: () => void): void;
  press(): void;
};
export type CycleButton<T> = {
  onPress(listener: (x: T) => void): void;
  press(): void;
};
export type InputNumber = {
  onChange(listener: (x: number) => void): void;
  change(x: number): void;
};
export type Select<T> = {
  onSelect(listener: (x: T) => void): void;
  select(x: T): void;
}
export type Toggle = {
  onChange(listener: (on: boolean) => void): void;
  set(on: boolean): void;
}

export const enum ToggleState {
  START = 'start',
  STOP = 'stop',
}

export interface Controls {
  patternPreset: Select<PresetCode>

  pattern: {
    inhale: InputNumber,
    exhale: InputNumber,
    holdIn: InputNumber,
    holdOut: InputNumber,
  }

  sessionLength: Select<number>,

  audio: {
    enabled: Toggle,
    ambient: Select<AmbientMode>,
  },

  toggle: CycleButton<ToggleState>,
  reset: Button,
}

export interface Panels {
  timer: {
    set(ms: number): void;
  };
  breathRate: {
    set(rate: number): void;
  }
  phaseLabel: {
    set(phase: BreathingPhase): void;
  }
  cycleCount: {
    set(cycle: number): void;
  }
}

export interface UI {
  // Inputs (write)
  controls: Controls,
  // UI (read)
  panels: Panels,
}

function isButton(elem: HTMLElement): elem is HTMLButtonElement {
  return elem.tagName === 'BUTTON';
}
function isInput(elem: HTMLElement): elem is HTMLInputElement {
  return elem.tagName === 'INPUT';
}

function initPanels(): Panels {
  const timerEl = document.getElementById('timer');
  if (!timerEl) {
    throw new Error('Cannot get timer');
  }
  const timer = {
    set(ms: number) {
      const s = Math.floor(ms / 1000);

      const minutes = Math.floor(s / 60);
      const seconds = s % 60;

      const time = minutes.toString().padStart(2, '0') + ':' + seconds.toString().padStart(2, '0');
      timerEl.innerText = time;
    }
  }


  const breathRateEl = document.getElementById('bpm');
  if (!breathRateEl) {
    throw new Error('Cannot get breath rate');
  }
  const breathRate = {
    set(rate: number) {
      breathRateEl.innerText = rate.toFixed(1);
    }
  }

  const phaseEl = document.getElementById('phase-label');
  if (!phaseEl) {
    throw new Error('Cannot get phase label');
  }
  const phase = {
    set(bp: BreathingPhase) {
      switch (bp) {
        case BreathingPhase.INHALE:
          phaseEl.innerText = 'Inhale';
          break;
        case BreathingPhase.EXHALE:
          phaseEl.innerText = 'Exhale';
          break;
        case BreathingPhase.HOLD_IN:
        case BreathingPhase.HOLD_OUT:
          phaseEl.innerText = 'Hold';
          break;
        case BreathingPhase.STOP:
          phaseEl.innerText = 'Ready';
          break;
      }
    }
  }

  const cycleCountEl = document.getElementById('cycle-count');
  if (!cycleCountEl) {
    throw new Error('Cannot get breath rate');
  }
  const cycleCount = {
    set(cycle: number) {
      cycleCountEl.innerHTML = cycle === 0 ? '&mdash;' : cycle.toString();
    }
  }

  return {
    timer,
    breathRate,
    phaseLabel: phase,
    cycleCount,
  }
}

function initControls(): Controls {
  // `onApply` runs on every selection — a click *or* a silent select() — so the
  // UI can keep dependent presentation (e.g. the pattern blurb) in sync without
  // listening to app-level changes. Mirrors registerToggle's `onApply`.
  function registerSelect<T, L extends string>(buttons: Array<L>, map: Record<L, T>, initial: L, onApply?: (value: T) => void): Select<T> {
    let active: L = initial;

    const registry = {} as Record<L, HTMLButtonElement>;
    const listenerRegistry: Array<(x: T) => void> = [];

    function notifyChange(selected: T) {
      listenerRegistry.forEach(listener => listener(selected))
    }
    function select(id: L) {
        const elem = registry[id];
        const activeElem = registry[active];

        activeElem.ariaPressed = 'false';
        elem.ariaPressed = 'true';

        active = id;

        onApply?.(map[id]);

        return map[id];
    }

    buttons.forEach(id => {
      const elem = document.getElementById(id);

      if (!elem || !isButton(elem)) {
        throw new Error(`Cannot find selector item button with id: ${id}`);
      }

      registry[id] = elem;

      elem.addEventListener('click', () => {
        notifyChange(select(id));
      })
    })

    return {
      onSelect(listener) {
        listenerRegistry.push(listener);
      },
      select(x) {
        const id = Object.keys(map).find((id) => map[id as L] === x) as L | undefined;
        if (!id) { throw new Error(`Cannot match select "${buttons.toString()}" against "${x}"`) }

        select(id);
      }
    }
  }

  function registerInput(id: string): InputNumber {
    const input = document.getElementById(id);
    if (!input || !isInput(input)) {
      throw new Error(`Cannot find input with id: ${id}`);
    }
    const label = document.getElementById(id + '-val');
    if (!label) {
      throw new Error(`Cannot find label with the id: "${id}-val"`);
    }
    label;


    const listenerRegistry: Array<(x: number) => void> = [];
    function notify(value: number) {
      listenerRegistry.forEach(listener => listener(value))
    }

    input.addEventListener('input', () => {
      const value = parseFloat(input.value);
      label.innerText = value.toFixed(1);

      notify(value);
    })

    return {
      onChange(listener) {
        listenerRegistry.push(listener)
      },
      change(value: number) {
        const serialized = value.toFixed(1);
        label.innerText = serialized;
        input.value = serialized;
      }
    }
  }

  function registerCycleButton<T extends string>(id: string, stages: Array<T>, stageLabel: Record<T, string>, initial: T): CycleButton<T> {
    const elem = document.getElementById(id);
    if (!elem || !isButton(elem)) {
      throw new Error(`Cannot find button with id: ${id}`);
    }

    let active = stages.findIndex(x => x === initial)

    if (active === -1) {
      throw new Error(`Cannot find in stages "${stages.toString()}" the initial "${initial}"`);
    }
    const len = stages.length;

    const peek = () => {
      if (active === len - 1) {
        return 0;
      }
      return active + 1;
    }
    const cycle = () => {
      active = peek();
    }

    const listenerRegistry: Array<(x: T) => void> = [];
    function notify(stage: T) {
      listenerRegistry.forEach(listener => listener(stage))
    }

    // The text of the label is NEXT stage text
    const applyText = () => elem.innerText = stageLabel[stages[peek()]]
    const press = () => {
      cycle();
      const activeStage = stages[active];
      applyText();
      notify(activeStage);
    }

    elem.addEventListener('click', press)


    return {
      onPress(listener) {
        listenerRegistry.push(listener);
      },
      press,
    }
  }
  function registerButton(id: string): Button {
    const elem = document.getElementById(id);
    if (!elem || !isButton(elem)) {
      throw new Error(`Cannot find button with id: ${id}`);
    }

    const listenerRegistry: Array<() => void> = [];
    function notify() {
      listenerRegistry.forEach(listener => listener())
    }

    elem.addEventListener('click', notify);

    return {
      onPress(listener) {
        listenerRegistry.push(listener);
      },
      press: notify,
    }
  }

  // `onApply` runs on every state change — a click *or* a silent set() — so the
  // UI can keep dependent presentation (e.g. dimming) in sync without listening
  // to app-level changes.
  function registerToggle(id: string, onApply?: (on: boolean) => void): Toggle {
    const elem = document.getElementById(id);
    if (!elem || !isButton(elem)) {
      throw new Error(`Cannot find toggle button with id: ${id}`);
    }

    let on = elem.getAttribute('aria-checked') === 'true';

    const listenerRegistry: Array<(on: boolean) => void> = [];
    function notify(value: boolean) {
      listenerRegistry.forEach(listener => listener(value))
    }

    const apply = (value: boolean) => {
      on = value;
      elem.setAttribute('aria-checked', value ? 'true' : 'false');
      onApply?.(value);
    }

    elem.addEventListener('click', () => {
      apply(!on);
      notify(on);
    })

    return {
      onChange(listener) {
        listenerRegistry.push(listener);
      },
      set(value) {
        apply(value);
      },
    }
  }

  // A one‑line "what it's for & how" for each pattern, shown under the chips.
  // It intentionally does *not* restate the cadence/holds already visible in the
  // controls — it adds the purpose and the technique (nose vs mouth, how deep).
  const patternDescEl = document.getElementById('pattern-desc');
  if (!patternDescEl) {
    throw new Error('Cannot get pattern description');
  }
  const PATTERN_DESC: Record<PresetCode, string> = {
    [PresetCode.COHERENT]: 'For calm, balanced focus. Breathe softly through the nose, down into the belly — smooth and effortless, never straining.',
    [PresetCode.BOX]: 'For focus and composure when stress builds. Keep it nasal and low in the belly, staying relaxed through each hold.',
    [PresetCode.RELAXING]: 'For deep calm and easing into sleep. Inhale quietly through the nose, then let it all out through the mouth with a gentle whoosh.',
    [PresetCode.CALM]: 'For gently unwinding. Breathe in through the nose and sigh out slowly, letting each long exhale melt tension away.',
    [PresetCode.CUSTOM]: 'Find your own tempo — shape each phase with the sliders below, breathing however feels natural.',
  };
  const setPatternDesc = (code: PresetCode) => {
    patternDescEl.textContent = PATTERN_DESC[code];
  };

  const patternPreset = registerSelect(
    ['coherent', 'box', 'relaxing', 'calm', 'custom'],
    { coherent: PresetCode.COHERENT, box: PresetCode.BOX, relaxing: PresetCode.RELAXING, calm: PresetCode.CALM, custom: PresetCode.CUSTOM },
    'coherent',
    setPatternDesc,
  );
  setPatternDesc(PresetCode.COHERENT); // initial; main.ts's restore select() corrects it
  const sessionLength = registerSelect(
    ['unlimited', 'three', 'five', 'ten', 'twenty'],
    { unlimited: -1, three: minToMs(3), five: minToMs(5), ten: minToMs(10), twenty: minToMs(20) },
    'unlimited',
  );

  // Ambient options read as unavailable while audio is switched off — a pure
  // presentation concern, so it lives here in the UI layer.
  const ambientRow = document.getElementById('ambient-row');
  const syncAmbientAvailability = (enabled: boolean) => {
    ambientRow?.classList.toggle('is-disabled', !enabled);
  };

  const audioEnabled = registerToggle('audio-toggle', syncAmbientAvailability);
  const ambientSound = registerSelect(
    ['ambient-off', 'ambient-alpha', 'ambient-theta', 'ambient-delta'],
    {
      'ambient-off': 'off',
      'ambient-alpha': 'alpha',
      'ambient-theta': 'theta',
      'ambient-delta': 'delta',
    } as Record<'ambient-off' | 'ambient-alpha' | 'ambient-theta' | 'ambient-delta', AmbientMode>,
    'ambient-alpha',
  );

  const inhale = registerInput('inhale');
  const holdIn = registerInput('hold-in');
  const exhale = registerInput('exhale');
  const holdOut = registerInput('hold-out');

  const toggle = registerCycleButton(
    'toggle',
    [ToggleState.START, ToggleState.STOP],
    { [ToggleState.START]: 'Start', [ToggleState.STOP]: 'Stop' },
    ToggleState.STOP,
  );
  const reset = registerButton('reset');

  return {
    patternPreset,
    pattern: {
      inhale,
      holdIn,
      exhale,
      holdOut,
    },
    sessionLength,
    audio: {
      enabled: audioEnabled,
      ambient: ambientSound,
    },
    toggle,
    reset,
  }
}

export function initUI(): UI {
  const panels = initPanels();
  const controls = initControls();

  return {
    panels,
    controls,
  }
}
