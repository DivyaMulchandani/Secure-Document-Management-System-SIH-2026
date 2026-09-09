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
  danger: '#B91C1C', 'danger-hover': '#991B1B', 'danger-light': 'rgba(185,28,28,0.08)',
  success: '#059669', 'success-light': 'rgba(5,150,105,0.08)',
  warning: '#D97706', 'warning-light': 'rgba(217,119,6,0.08)',
};

const DARK_SEM = {
  danger: '#EF4444', 'danger-hover': '#DC2626', 'danger-light': 'rgba(239,68,68,0.15)',
  success: '#10B981', 'success-light': 'rgba(16,185,129,0.15)',
  warning: '#F59E0B', 'warning-light': 'rgba(245,158,11,0.15)',
};

const mk = (w: string, bg: string, surface: string, border: string, bl: string, pt: string, mt: string, md: string, acc: string, accH: string, accL: string, sem = LIGHT_SEM): ThemeVars => ({
  white: w, bg, surface, border, 'border-light': bl, 'primary-text': pt, 'muted-text': mt, 'muted-darker': md,
  accent: acc, 'accent-hover': accH, 'accent-light': accL, ...sem,
});

export const THEME_PRESETS: ThemePreset[] = [
  {
    name: 'Claude Dark',
    group: 'Dark',
    vars: mk(
      '#252220', '#1A1816', '#242120', '#3D3936', '#302C2A',
      '#F5F0EB', '#A8A29E', '#78716C', '#D97706', '#B45309',
      'rgba(217,119,6,0.14)', DARK_SEM,
    ),
  },
  {
    name: 'Claude Light',
    group: 'Light',
    vars: mk(
      '#FFFFFF', '#F8F5F1', '#FFFFFF', '#E4DFDA', '#EDE9E4',
      '#1C1917', '#78716C', '#57534E', '#D97706', '#B45309',
      'rgba(217,119,6,0.10)', {
        danger: '#B91C1C', 'danger-hover': '#991B1B', 'danger-light': 'rgba(185,28,28,0.08)',
        success: '#047857', 'success-light': 'rgba(4,120,87,0.08)',
        warning: '#D97706', 'warning-light': 'rgba(217,119,6,0.08)',
      },
    ),
  },
  {
    name: 'Midnight Navy',
    group: 'Dark',
    vars: mk('#17202F','#080E1A','#0F172A','#1E293B','#162032','#F8FAFC','#94A3B8','#64748B','#38BDF8','#0284C7','rgba(56,189,248,0.14)', DARK_SEM)
  },
  {
    name: 'Institutional Slate',
    group: 'Institutional',
    vars: mk('#1E293B','#0F172A','#1E293B','#334155','#1E293B','#F1F5F9','#94A3B8','#64748B','#3B82F6','#2563EB','rgba(59,130,246,0.15)', DARK_SEM)
  },
];

export const STORAGE_KEY = 'justice_platform_theme';
export const DEFAULT_THEME = 'Claude Dark';
export const LIGHT_THEME = 'Claude Light';
export const DARK_THEME = 'Claude Dark';

export function getStoredThemeName(): string {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (!val) return DEFAULT_THEME;
    if (!THEME_PRESETS.find(t => t.name === val)) return DEFAULT_THEME;
    return val;
  } catch {
    return DEFAULT_THEME;
  }
}

export function isDarkTheme(name: string): boolean {
  return name.includes('Dark') || name.includes('Midnight') || name.includes('Slate');
}

export function toggleTheme(): string {
  const current = getStoredThemeName();
  const next = isDarkTheme(current) ? LIGHT_THEME : DARK_THEME;
  applyTheme(next);
  return next;
}

export function applyTheme(name: string): void {
  const preset = THEME_PRESETS.find(t => t.name === name);
  if (!preset) return;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(preset.vars)) {
    root.style.setProperty(`--color-${key}`, value);
  }
  root.dataset.theme = isDarkTheme(name) ? 'dark' : 'light';
  try { localStorage.setItem(STORAGE_KEY, name); } catch {}
}

export function applyStoredTheme(): void {
  try {
    const name = getStoredThemeName();
    if (name) applyTheme(name);
  } catch {}
}
