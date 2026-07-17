export interface NoticeAction {
  label: string;
  run(): void;
}

export interface SessionNotice {
  set(key: string, message: string, action?: NoticeAction): void;
  clear(key: string): void;
}

interface NoticeEntry {
  message: string;
  action?: NoticeAction;
}

export function initSessionNotice(): SessionNotice {
  const container = document.getElementById("session-notice");
  const text = document.getElementById("session-notice-text");
  const action = document.getElementById("session-notice-action");

  if (!container || !text || !(action instanceof HTMLButtonElement)) {
    throw new Error("Cannot initialize the session status notice");
  }

  const entries = new Map<string, NoticeEntry>();
  const priority = ["audio", "wake-lock"];

  const render = () => {
    const key = priority.find((candidate) => entries.has(candidate))
      ?? entries.keys().next().value as string | undefined;
    const entry = key ? entries.get(key) : undefined;

    container.hidden = !entry;
    text.textContent = entry?.message ?? "";
    action.hidden = !entry?.action;
    action.textContent = entry?.action?.label ?? "";
    action.onclick = entry?.action ? () => entry.action?.run() : null;
  };

  return {
    set(key, message, noticeAction) {
      entries.set(key, { message, action: noticeAction });
      render();
    },
    clear(key) {
      entries.delete(key);
      render();
    },
  };
}
