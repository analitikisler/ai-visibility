// Light / dark / system theme. The preference persists in localStorage under `ai-visibility-theme`
// (index.html applies it before first paint). Dark mode = `.dark` on <html> (brand/retired/overt/BRAND.md §11).
import { useCallback, useSyncExternalStore } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
const KEY = 'ai-visibility-theme';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

const media = () => window.matchMedia('(prefers-color-scheme: dark)');

function apply(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && media().matches);
  document.documentElement.classList.toggle('dark', dark);
}

let mediaBound = false;
function subscribe(cb: () => void) {
  if (!mediaBound) {
    mediaBound = true;
    // Follow the OS while the preference is "system".
    media().addEventListener('change', () => {
      if (readPref() === 'system') {
        apply('system');
        emit();
      }
    });
  }
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* storage blocked: still apply for this session */
  }
  apply(pref);
  emit();
}

const readResolved = (): ResolvedTheme => (document.documentElement.classList.contains('dark') ? 'dark' : 'light');

/** `{ pref, resolved, setPref }` — `resolved` is the theme actually showing. */
export function useTheme() {
  const pref = useSyncExternalStore(subscribe, readPref, () => 'system' as ThemePref);
  const resolved = useSyncExternalStore(subscribe, readResolved, () => 'light' as ResolvedTheme);
  const setPref = useCallback((p: ThemePref) => setThemePref(p), []);
  return { pref, resolved, setPref };
}
