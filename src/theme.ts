/* @author: CLAUDE-OPUS4.8 */
// Auto / Light / Dark theme switcher.
// The pre-paint resolution (anti-FOUC) lives inline in index.html; this
// module wires up the buttons and keeps "auto" in sync with the system.

type ThemePref = "auto" | "light" | "dark";


export function initTheme() {
  const STORE = "breather-theme";
  const root = document.documentElement;
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const buttons = document.querySelectorAll<HTMLButtonElement>("[data-theme-option]");

  const getPref = (): ThemePref =>
    (localStorage.getItem(STORE) as ThemePref | null) ?? "auto";

  const resolve = (pref: ThemePref): "light" | "dark" =>
    pref === "auto" ? (mq.matches ? "dark" : "light") : pref;

  function apply(pref: ThemePref): void {
    const resolved = resolve(pref);
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
    buttons.forEach((b) => {
      b.setAttribute("aria-pressed", b.dataset.themeOption === pref ? "true" : "false");
    });
  }

  buttons.forEach((b) => {
    b.addEventListener("click", () => {
      const pref = (b.dataset.themeOption as ThemePref) ?? "auto";
      try {
        localStorage.setItem(STORE, pref);
      } catch {
        /* storage can be unavailable (e.g. private mode) — ignore */
      }
      apply(pref);
    });
  });

  mq.addEventListener("change", () => {
    if (getPref() === "auto") apply("auto");
  });

  apply(getPref());
}

export function accent() {
  return getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()
}
