import { ref, onMounted } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'system'
export type AccentColor = 'blue' | 'green' | 'amber' | 'red'

const theme = ref<ThemeMode>('light')
const accent = ref<AccentColor>('blue')

let initialized = false

function applyTheme(mode: ThemeMode) {
  const html = document.documentElement
  if (mode === 'dark') {
    html.classList.add('dark')
  } else if (mode === 'light') {
    html.classList.remove('dark')
  } else {
    // system
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    html.classList.toggle('dark', prefersDark)
  }
}

function applyAccent(color: AccentColor) {
  const html = document.documentElement
  html.setAttribute('data-accent', color)
}

export function initTheme() {
  if (initialized) return
  initialized = true

  const savedTheme = localStorage.getItem('theme') as ThemeMode | null
  const savedAccent = localStorage.getItem('accent') as AccentColor | null

  if (savedTheme) theme.value = savedTheme
  if (savedAccent) accent.value = savedAccent

  applyTheme(theme.value)
  applyAccent(accent.value)

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (theme.value === 'system') {
      applyTheme('system')
    }
  })
}

export function useTheme() {
  onMounted(() => {
    initTheme()
  })

  function setTheme(mode: ThemeMode) {
    theme.value = mode
    localStorage.setItem('theme', mode)
    applyTheme(mode)
  }

  function setAccent(color: AccentColor) {
    accent.value = color
    localStorage.setItem('accent', color)
    applyAccent(color)
  }

  return { theme, accent, setTheme, setAccent }
}
