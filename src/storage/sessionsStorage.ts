import type { WorkoutSession } from '../types'

const ACTIVE_SESSION_KEY = 'strong-simon-active-session-v1'
const SESSION_HISTORY_KEY = 'strong-simon-session-history-v1'

function normalizeSession(session: WorkoutSession): WorkoutSession {
  return {
    ...session,
    exercises: session.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => {
        const legacySet = set as typeof set & { tag?: 'fail' | 'drop' }
        return {
          ...set,
          phaseTag: set.phaseTag ?? exercise.tag ?? 'working',
          effortTag: set.effortTag ?? legacySet.tag,
        }
      }),
    })),
  }
}

export function loadActiveSession(): WorkoutSession | null {
  const raw = localStorage.getItem(ACTIVE_SESSION_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as WorkoutSession
    const normalized = normalizeSession(parsed)
    saveActiveSession(normalized)
    return normalized
  } catch {
    return null
  }
}

export function saveActiveSession(session: WorkoutSession): void {
  localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session))
}

export function clearActiveSession(): void {
  localStorage.removeItem(ACTIVE_SESSION_KEY)
}

export function loadSessionHistory(): WorkoutSession[] {
  const raw = localStorage.getItem(SESSION_HISTORY_KEY)
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw) as WorkoutSession[]
    if (!Array.isArray(parsed)) {
      return []
    }

    const normalized = parsed.map(normalizeSession)
    saveSessionHistory(normalized)
    return normalized
  } catch {
    return []
  }
}

export function saveSessionHistory(sessions: WorkoutSession[]): void {
  localStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(sessions))
}
