const KEY = "seeparah:prefs";

export type ReaderTheme = "light" | "sepia" | "dark";

export interface ReaderPrefs {
  language: string;
  weeklyGoalPages: number;
  fontSize: number; // px
  lineHeight: number; // unitless multiplier
  theme: ReaderTheme;
}

const DEFAULTS: ReaderPrefs = {
  language: "English",
  weeklyGoalPages: 40,
  fontSize: 18,
  lineHeight: 1.8,
  theme: "light",
};

export const FONT_SIZE_RANGE = { min: 14, max: 28, step: 1 } as const;
export const LINE_HEIGHT_RANGE = { min: 1.4, max: 2.4, step: 0.1 } as const;

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
