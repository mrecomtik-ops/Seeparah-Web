const KEY = "seeparah:prefs";

export interface ReaderPrefs {
  language: string;
  weeklyGoalPages: number;
}

const DEFAULTS: ReaderPrefs = { language: "English", weeklyGoalPages: 40 };

export function getPrefs(): ReaderPrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<ReaderPrefs>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function setPrefs(next: Partial<ReaderPrefs>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...getPrefs(), ...next }));
  } catch {
    // storage unavailable
  }
}
