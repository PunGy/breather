export interface KeyboardControl {
  /**
    * Key code referenced to KeyboardEvent.code
    */
  mapAction(keyCode: string, listener: () => void): void;
}

export function initKeyboard(): KeyboardControl {
  const registry: Record<string, () => void> = {};

  window.addEventListener('keydown', (event) => {
    if ((event.target as HTMLElement).matches('input, textarea, [contenteditable]'))
      return;
    if (event.repeat)
      return;


    const listener = registry[event.code];
    if (listener) {
      event.preventDefault();
      listener();
    }
  })

  return {
    mapAction: (code, listener) => {
      registry[code] = listener;
    },
  }
}
