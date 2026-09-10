export interface ThemeVars {
  white: string;
  bg: string;
  surface: string;
  border: string;
  'border-light': string;
  'primary-text': string;
  'muted-text': string;
  'muted-darker': string;
  accent: string;
  'accent-hover': string;
  'accent-light': string;
  danger: string;
  'danger-hover': string;
  'danger-light': string;
  success: string;
  'success-light': string;
  warning: string;
  'warning-light': string;
}

export interface ThemePreset {
  name: string;
  group: 'Light' | 'Dark' | 'Institutional';
  vars: ThemeVars;
}

const LIGHT_SEM = {
  danger: '#b91c1c', 'danger-hover': '#991b1b', 'danger-light': 'rgba(185,28,28,0.08)',
  success: '#047857', 'success-light': 'rgba(4,120,87,0.08)',
  warning: '#b45309', 'warning-light': 'rgba(180,83,9,0.08)',
};

const DARK_SEM = {
  danger: '#dc2626', 'danger-hover': '#b91c1c', 'danger-light': 'rgba(220,38,38,0.12)',
  success: '#059669', 'success-light': 'rgba(5,150,105,0.12)',
  warning: '#d97706', 'warning-light': 'rgba(217,119,6,0.12)',
};

const mk = (w: string, bg: string, surface: string, border: string, bl: string, pt: string, mt: string, md: string, acc: string, accH: string, accL: string, sem = DARK_SEM): ThemeVars => ({
  white: w, bg, surface, border, 'border-light': bl, 'primary-text': pt, 'muted-text': mt, 'muted-darker': md,
  accent: acc, 'accent-hover': accH, 'accent-light': accL, ...sem,
});

export const THEME_PRESETS: ThemePreset[] = [
  {
    name: 'Turtleneck Executive (Light)',
    group: 'Light',
    vars: mk(
      '#FFFFFF', '#F8FAFC', '#FFFFFF', '#E2E8F0', '#F1F5F9',
      '#0F172A', '#475569', '#334155', '#1D4ED8', '#1E40AF',
      '#EFF6FF', LIGHT_SEM,
    ),
  },
  {
    name: 'State Justice (Official Light)',
    group: 'Light',
    vars: mk(
      '#FFFFFF', '#F8FAFC', '#FFFFFF', '#E2E8F0', '#F1F5F9',
      '#0F172A', '#475569', '#334155', '#1D4ED8', '#1E40AF',
      '#EFF6FF', LIGHT_SEM,
    ),
  },
];

export const STORAGE_KEY = 'justice_platform_theme';
export const DEFAULT_THEME = 'Turtleneck Executive (Light)';
export const LIGHT_THEME = 'Turtleneck Executive (Light)';
export const DARK_THEME = 'Turtleneck Executive (Light)';

export function getStoredThemeName(): string {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (!val || val.includes('Dark') || val.includes('Navy') || val.includes('Slate')) {
      return DEFAULT_THEME;
    }
    if (!THEME_PRESETS.find(t => t.name === val)) return DEFAULT_THEME;
    return val;
  } catch {
    return DEFAULT_THEME;
  }
}

export function isDarkTheme(_name?: string): boolean {
  return false;
}

export function toggleTheme(): string {
  applyTheme(DEFAULT_THEME);
  return DEFAULT_THEME;
}

export function applyTheme(name: string): void {
  const preset = THEME_PRESETS.find(t => t.name === name) || THEME_PRESETS[0];
  const root = document.documentElement;
  for (const [key, value] of Object.entries(preset.vars)) {
    root.style.setProperty(`--color-${key}`, value);
  }
  root.dataset.theme = 'light';
  try { localStorage.setItem(STORAGE_KEY, preset.name); } catch {}
}

export function applyStoredTheme(): void {
  try {
    const name = getStoredThemeName();
    applyTheme(name || DEFAULT_THEME);
  } catch {
    applyTheme(DEFAULT_THEME);
  }
}
