import { ref } from 'vue'

/**
 * Apple-style layered sound effect system using Web Audio API synthesis.
 * Generates Glass-timbre notification sounds with different patterns per priority.
 *
 * Priority → Pattern:
 *   P0 (紧急): triple urgent — 3 fast high notes
 *   P1 (高):   triple ascending — 3 rising notes
 *   P2 (中):   double — 2 medium notes
 *   P3 (低):   single — 1 gentle note
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type Priority = 0 | 1 | 2 | 3  // P0=urgent, P1=high, P2=medium, P3=low

export type NotificationType =
  | 'task_due'
  | 'task_overdue'
  | 'milestone'
  | 'blocker'
  | 'group_message'
  | 'reminder_upgrade'

export type FeedbackAction =
  | 'task_complete'
  | 'task_delete'
  | 'confirm'
  | 'add_node'

// ─── Singleton Audio Context ────────────────────────────────────────────────

let _ctx: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!_ctx) {
    _ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
  }
  if (_ctx.state === 'suspended') {
    _ctx.resume()
  }
  return _ctx
}

// ─── Glass Timbre Synthesis ─────────────────────────────────────────────────

function playGlassTone(
  ctx: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  volume: number,
) {
  // Fundamental + harmonics for glass-like shimmer
  const harmonics = [
    { ratio: 1.0, gain: 1.0, type: 'sine' as OscillatorType },
    { ratio: 2.0, gain: 0.25, type: 'sine' as OscillatorType },
    { ratio: 3.02, gain: 0.08, type: 'sine' as OscillatorType },
  ]

  const masterGain = ctx.createGain()
  masterGain.connect(ctx.destination)
  masterGain.gain.value = volume

  for (const h of harmonics) {
    const osc = ctx.createOscillator()
    const hGain = ctx.createGain()

    osc.type = h.type
    osc.frequency.setValueAtTime(freq * h.ratio, startTime)
    hGain.gain.setValueAtTime(h.gain, startTime)

    // Quick attack, smooth decay (glass-like envelope)
    hGain.gain.setValueAtTime(h.gain, startTime + 0.008)
    hGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)

    osc.connect(hGain)
    hGain.connect(masterGain)

    osc.start(startTime)
    osc.stop(startTime + duration + 0.05)

    osc.onended = () => {
      osc.disconnect()
      hGain.disconnect()
    }
  }

  // Cleanup master gain after all harmonics finish
  setTimeout(() => masterGain.disconnect(), (duration + 0.1) * 1000)
}

// ─── Piano/Note Timbre Synthesis (for feedback) ─────────────────────────────

function playNoteTone(
  ctx: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  volume: number,
) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'triangle'
  osc.frequency.setValueAtTime(freq, startTime)

  // Piano-like envelope: quick attack, medium decay
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(startTime)
  osc.stop(startTime + duration + 0.05)

  osc.onended = () => {
    osc.disconnect()
    gain.disconnect()
  }
}

// ─── Sound Pattern Definitions ──────────────────────────────────────────────

/**
 * Glass sound patterns by priority:
 *   P0: 3 notes at 1200/1400/1600 Hz, gap 0.12s (urgent, fast, high-pitched)
 *   P1: 3 notes at 800/1000/1200 Hz, gap 0.18s (ascending, bright)
 *   P2: 2 notes at 700/850 Hz, gap 0.25s (medium, calm)
 *   P3: 1 note at 600 Hz, duration 0.5s (gentle, low)
 */
const GLASS_PATTERNS: Record<number, { freqs: number[]; gap: number; noteDur: number }> = {
  0: { freqs: [1200, 1400, 1600], gap: 0.12, noteDur: 0.25 },
  1: { freqs: [800, 1000, 1200], gap: 0.18, noteDur: 0.3 },
  2: { freqs: [700, 850], gap: 0.25, noteDur: 0.3 },
  3: { freqs: [600], gap: 0, noteDur: 0.5 },
}

// ─── User Settings ──────────────────────────────────────────────────────────

const soundEnabled = ref(true)
const soundVolume = ref(0.8)

// Load settings from memory (no localStorage)
let _loadedSettings = false
function ensureSettings() {
  if (_loadedSettings) return
  _loadedSettings = true
  // Default values are already set via ref()
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function useSoundEffects() {
  ensureSettings()

  /**
   * Play a notification sound based on priority level.
   * Uses Glass timbre (crystal/glass敲击) — the signature sound for task reminders.
   */
  function playNotificationSound(priority: Priority) {
    if (!soundEnabled.value) return

    const ctx = getAudioContext()
    const pattern = GLASS_PATTERNS[priority] ?? GLASS_PATTERNS[2]
    const now = ctx.currentTime

    pattern.freqs.forEach((freq, i) => {
      playGlassTone(ctx, freq, now + i * pattern.gap, pattern.noteDur, soundVolume.value)
    })
  }

  /**
   * Play a feedback sound for user actions.
   * Uses Note timbre (piano-like warm tone).
   */
  function playFeedbackSound(action: FeedbackAction) {
    if (!soundEnabled.value) return

    const ctx = getAudioContext()
    const now = ctx.currentTime

    switch (action) {
      case 'task_complete':
        // Ascending triple: Do→Re→Mi (achievement feel)
        playNoteTone(ctx, 523, now, 0.25, soundVolume.value * 0.7)        // C5
        playNoteTone(ctx, 587, now + 0.15, 0.25, soundVolume.value * 0.7) // D5
        playNoteTone(ctx, 659, now + 0.3, 0.35, soundVolume.value * 0.7)  // E5
        break
      case 'task_delete':
        // Descending single (gentle warning)
        playNoteTone(ctx, 400, now, 0.4, soundVolume.value * 0.5)
        break
      case 'confirm':
        // Quick single (acknowledgment)
        playNoteTone(ctx, 800, now, 0.15, soundVolume.value * 0.5)
        break
      case 'add_node':
        // Ascending double (confirmation)
        playNoteTone(ctx, 600, now, 0.2, soundVolume.value * 0.5)
        playNoteTone(ctx, 750, now + 0.12, 0.2, soundVolume.value * 0.5)
        break
    }
  }

  /**
   * Preview all 4 priority levels with a delay between each.
   * Returns a promise that resolves when all previews finish.
   */
  async function previewAllSounds(): Promise<void> {
    const priorities: Priority[] = [3, 2, 1, 0]
    for (const p of priorities) {
      playNotificationSound(p)
      const pattern = GLASS_PATTERNS[p]
      const totalDuration = (pattern.freqs.length - 1) * pattern.gap + pattern.noteDur
      await new Promise(resolve => setTimeout(resolve, (totalDuration + 0.4) * 1000))
    }
  }

  function setSoundEnabled(enabled: boolean) {
    soundEnabled.value = enabled
  }

  function setSoundVolume(vol: number) {
    soundVolume.value = Math.max(0, Math.min(1, vol))
  }

  return {
    soundEnabled,
    soundVolume,
    playNotificationSound,
    playFeedbackSound,
    previewAllSounds,
    setSoundEnabled,
    setSoundVolume,
  }
}
