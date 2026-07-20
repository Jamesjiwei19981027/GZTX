import { useSyncExternalStore } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'
export type AccentColor = 'blue' | 'green' | 'amber' | 'red'

const THEME_KEY = 'theme'
const ACCENT_KEY = 'accent'

type ThemeState = {
  theme: ThemeMode
  accent: AccentColor
  /** Resolved effective dark (after system preference when mode is system) */
  isDark: boolean
}

const listeners = new Set<() => void>()

function prefersDark(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return prefersDark()
}

function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', resolveIsDark(mode))
}

function applyAccent(color: AccentColor) {
  if (typeof document === 'undefined') return
  if (color === 'blue') {
    document.documentElement.removeAttribute('data-accent')
  } else {
    document.documentElement.setAttribute('data-accent', color)
  }
}

function readStoredTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_KEY) as ThemeMode | null
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* ignore */
  }
  return 'light'
}

function readStoredAccent(): AccentColor {
  try {
    const v = localStorage.getItem(ACCENT_KEY) as AccentColor | null
    if (v === 'blue' || v === 'green' || v === 'amber' || v === 'red') return v
  } catch {
    /* ignore */
  }
  return 'blue'
}

let state: ThemeState = {
  theme: 'light',
  accent: 'blue',
  isDark: false,
}

let initialized = false
let mediaQuery: MediaQueryList | null = null

function emit() {
  listeners.forEach((l) => l())
}

function setState(partial: Partial<ThemeState>) {
  state = { ...state, ...partial }
  emit()
}

function onSystemSchemeChange() {
  if (state.theme !== 'system') return
  const isDark = resolveIsDark('system')
  applyTheme('system')
  setState({ isDark })
}

/** Call once at app bootstrap (idempotent). */
export function initTheme() {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  const theme = readStoredTheme()
  const accent = readStoredAccent()
  const isDark = resolveIsDark(theme)

  state = { theme, accent, isDark }
  applyTheme(theme)
  applyAccent(accent)

  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', onSystemSchemeChange)
}

export function setTheme(mode: ThemeMode) {
  initTheme()
  try {
    localStorage.setItem(THEME_KEY, mode)
  } catch {
    /* ignore */
  }
  const isDark = resolveIsDark(mode)
  applyTheme(mode)
  setState({ theme: mode, isDark })
}

export function setAccent(color: AccentColor) {
  initTheme()
  try {
    localStorage.setItem(ACCENT_KEY, color)
  } catch {
    /* ignore */
  }
  applyAccent(color)
  setState({ accent: color })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): ThemeState {
  return state
}

/**
 * Theme + accent parity with Vue archive `useTheme`.
 * Persists to localStorage; toggles `html.dark` and `data-accent`.
 */
export function useTheme() {
  initTheme()
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return {
    theme: snap.theme,
    accent: snap.accent,
    isDark: snap.isDark,
    setTheme,
    setAccent,
  }
}
