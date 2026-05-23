import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { EXERCISES } from './data/exercises'
import {
  clearActiveSession,
  loadActiveSession,
  loadSessionHistory,
  saveActiveSession,
  saveSessionHistory,
} from './storage/sessionsStorage'
import { loadTemplates, saveTemplates } from './storage/templatesStorage'
import type {
  RoutineTemplate,
  TemplateExercise,
  TemplateExerciseTag,
  WorkoutSession,
  SessionSet,
} from './types'

type ActiveView = 'templates' | 'session' | 'history'
type TemplateSetField = 'targetReps' | 'targetWeight' | 'restSeconds'
type SessionSetField = 'actualReps' | 'actualWeight'
type HistoryRange = '7d' | '1m' | '1y' | 'all'
const TEMPLATE_COLLAPSE_STORAGE_KEY = 'strong-simon-template-collapse-state'

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createTemplateExercise(exerciseId: string, orderIndex: number): TemplateExercise {
  return {
    id: createId(),
    exerciseId,
    orderIndex,
    sets: [
      { setNumber: 1, targetReps: 12, targetWeight: 0, restSeconds: 90, phaseTag: 'warmup' },
      { setNumber: 2, targetReps: 10, targetWeight: 0, restSeconds: 90, phaseTag: 'working' },
      { setNumber: 3, targetReps: 8, targetWeight: 0, restSeconds: 90, phaseTag: 'working' },
    ],
  }
}

function createSessionFromTemplate(template: RoutineTemplate): WorkoutSession {
  return {
    id: createId(),
    templateId: template.id,
    templateName: template.name,
    startedAt: new Date().toISOString(),
    exercises: template.exercises.map((exercise) => ({
      id: createId(),
      exerciseId: exercise.exerciseId,
      orderIndex: exercise.orderIndex,
      sets: exercise.sets.map((set) => ({
        id: createId(),
        setNumber: set.setNumber,
        targetReps: set.targetReps,
        targetWeight: set.targetWeight,
        actualReps: set.targetReps,
        actualWeight: set.targetWeight,
        restSeconds: set.restSeconds,
        phaseTag: set.phaseTag ?? exercise.tag ?? 'working',
      })),
    })),
  }
}

function createCollapsedTemplateState(exercises: TemplateExercise[]) {
  return Object.fromEntries(exercises.map((exercise, index) => [exercise.exerciseId, index > 0]))
}

function loadCollapsedTemplateState() {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const rawValue = window.localStorage.getItem(TEMPLATE_COLLAPSE_STORAGE_KEY)

    if (!rawValue) {
      return {}
    }

    const parsedValue = JSON.parse(rawValue)
    return parsedValue && typeof parsedValue === 'object' ? parsedValue : {}
  } catch {
    return {}
  }
}

function formatSessionDuration(startedAt: string, endedAt?: string) {
  if (!endedAt) {
    return 'en cours'
  }

  const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime()

  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return '0 min'
  }

  const totalMinutes = Math.max(1, Math.round(durationMs / 60000))
  return `${totalMinutes} min`
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function addMonths(date: Date, months: number) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

function addYears(date: Date, years: number) {
  const next = new Date(date)
  next.setFullYear(next.getFullYear() + years)
  return next
}

function startOfWeekMonday(date: Date) {
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  return startOfDay(addDays(date, diff))
}

function getHistoryRangeStart(range: HistoryRange, now: Date) {
  if (range === '7d') {
    return startOfDay(addDays(now, -6))
  }

  if (range === '1m') {
    return startOfDay(addDays(now, -29))
  }

  if (range === '1y') {
    return startOfDay(addMonths(now, -11))
  }

  return null
}

function formatHistoryBucketLabel(range: HistoryRange, start: Date) {
  if (range === '7d') {
    return start.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
  }

  if (range === '1m') {
    return `S ${start.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}`
  }

  if (range === '1y') {
    return start.toLocaleDateString('fr-FR', { month: 'short' })
  }

  return String(start.getFullYear())
}

function formatHistoryBucketTitle(range: HistoryRange, start: Date, end: Date) {
  if (range === '7d') {
    return start.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    })
  }

  if (range === '1m') {
    const endInclusive = addDays(end, -1)
    return `${start.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} - ${endInclusive.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}`
  }

  if (range === '1y') {
    return start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  }

  return String(start.getFullYear())
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
}

function parseCsvLine(line: string) {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      values.push(current)
      current = ''
      continue
    }

    current += char
  }

  values.push(current)
  return values
}

function parseStrongDate(value: string) {
  const normalizedValue = value.trim().replace(' ', 'T')
  const parsedDate = new Date(normalizedValue)
  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toISOString()
  }

  return new Date().toISOString()
}

function parseDurationMinutes(value: string) {
  const match = value.match(/(\d+)/)
  if (!match) {
    return 0
  }

  const minutes = Number(match[1])
  return Number.isFinite(minutes) ? minutes : 0
}

function parseNumericValue(value: string, fallback: number) {
  const normalized = value.replace(',', '.').trim()
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : fallback
}

function createExerciseLookup() {
  const lookup = new Map<string, string>()

  EXERCISES.forEach((exercise) => {
    const candidates = [exercise.name, ...exercise.aliases]
    candidates.forEach((candidate) => {
      const key = normalizeText(candidate)
      if (key && !lookup.has(key)) {
        lookup.set(key, exercise.id)
      }
    })
  })

  return lookup
}

function parseStrongWorkoutsCsv(csvText: string): WorkoutSession[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length < 2) {
    return []
  }

  const headers = parseCsvLine(lines[0]).map((header) => normalizeText(header))
  const findColumn = (...names: string[]) => {
    const normalizedNames = names.map((name) => normalizeText(name))
    return headers.findIndex((header) => normalizedNames.includes(header))
  }

  const dateColumn = findColumn('Date')
  const workoutColumn = findColumn('Nom de l entrainement', 'Workout Name')
  const durationColumn = findColumn('Duree', 'Duration')
  const exerciseColumn = findColumn('Nom de l exercice', 'Exercise Name')
  const setOrderColumn = findColumn('Ordre de la serie', 'Set Order')
  const weightColumn = findColumn('Poids', 'Weight')
  const repsColumn = findColumn('Reps', 'Reps')
  const secondsColumn = findColumn('Secondes', 'Seconds')

  if (dateColumn < 0 || workoutColumn < 0 || exerciseColumn < 0) {
    return []
  }

  const exerciseLookup = createExerciseLookup()
  const groupedSessions = new Map<
    string,
    {
      templateName: string
      startedAt: string
      durationMinutes: number
      exercises: Map<string, WorkoutSession['exercises'][number]>
      exerciseOrder: string[]
    }
  >()

  lines.slice(1).forEach((line) => {
    const columns = parseCsvLine(line)
    const rawDate = columns[dateColumn] ?? ''
    const rawWorkout = columns[workoutColumn] ?? ''
    const rawExercise = columns[exerciseColumn] ?? ''

    if (!rawDate || !rawWorkout || !rawExercise) {
      return
    }

    const startedAt = parseStrongDate(rawDate)
    const templateName = rawWorkout.trim()
    const sessionKey = `${startedAt}__${templateName}`

    if (!groupedSessions.has(sessionKey)) {
      groupedSessions.set(sessionKey, {
        templateName,
        startedAt,
        durationMinutes: durationColumn >= 0 ? parseDurationMinutes(columns[durationColumn] ?? '') : 0,
        exercises: new Map(),
        exerciseOrder: [],
      })
    }

    const sessionGroup = groupedSessions.get(sessionKey)
    if (!sessionGroup) {
      return
    }

    const normalizedExerciseName = normalizeText(rawExercise)
    const resolvedExerciseId =
      exerciseLookup.get(normalizedExerciseName) ?? rawExercise.trim().toLowerCase().replace(/\s+/g, '-')

    if (!sessionGroup.exercises.has(resolvedExerciseId)) {
      sessionGroup.exercises.set(resolvedExerciseId, {
        id: createId(),
        exerciseId: resolvedExerciseId,
        orderIndex: sessionGroup.exerciseOrder.length,
        sets: [],
      })
      sessionGroup.exerciseOrder.push(resolvedExerciseId)
    }

    const exercise = sessionGroup.exercises.get(resolvedExerciseId)
    if (!exercise) {
      return
    }

    const setNumber = Math.max(
      1,
      Math.round(
        setOrderColumn >= 0
          ? parseNumericValue(columns[setOrderColumn] ?? '', exercise.sets.length + 1)
          : exercise.sets.length + 1,
      ),
    )
    const weight = weightColumn >= 0 ? parseNumericValue(columns[weightColumn] ?? '', 0) : 0
    const reps = repsColumn >= 0 ? parseNumericValue(columns[repsColumn] ?? '', 0) : 0
    const restSeconds = Math.max(
      0,
      Math.round(secondsColumn >= 0 ? parseNumericValue(columns[secondsColumn] ?? '', 0) : 0),
    )

    exercise.sets.push({
      id: createId(),
      setNumber,
      targetReps: reps,
      targetWeight: weight,
      actualReps: reps,
      actualWeight: weight,
      restSeconds,
      phaseTag: setNumber === 1 ? 'warmup' : 'working',
      completedAt: startedAt,
    })
  })

  return Array.from(groupedSessions.values())
    .map((sessionGroup) => {
      const endedAt =
        sessionGroup.durationMinutes > 0
          ? new Date(
              new Date(sessionGroup.startedAt).getTime() + sessionGroup.durationMinutes * 60 * 1000,
            ).toISOString()
          : sessionGroup.startedAt

      return {
        id: createId(),
        templateId: `import-${createId()}`,
        templateName: sessionGroup.templateName,
        startedAt: sessionGroup.startedAt,
        endedAt,
        exercises: sessionGroup.exerciseOrder
          .map((exerciseId) => sessionGroup.exercises.get(exerciseId))
          .filter((exercise): exercise is WorkoutSession['exercises'][number] => Boolean(exercise))
          .map((exercise) => ({
            ...exercise,
            sets: [...exercise.sets].sort((left, right) => left.setNumber - right.setNumber),
          })),
      } satisfies WorkoutSession
    })
    .sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime())
}

function csvEscape(value: string | number | undefined) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function MenuIcon({ view }: { view: ActiveView }) {
  const commonProps = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  if (view === 'templates') {
    return (
      <svg {...commonProps}>
        <rect x="3" y="4" width="7" height="7" rx="1.5" />
        <rect x="14" y="4" width="7" height="7" rx="1.5" />
        <rect x="3" y="13" width="7" height="7" rx="1.5" />
        <rect x="14" y="13" width="7" height="7" rx="1.5" />
      </svg>
    )
  }

  if (view === 'session') {
    return (
      <svg {...commonProps}>
        <path d="M7 7h10" />
        <path d="M7 12h10" />
        <path d="M7 17h6" />
        <path d="M14 7l3 3-3 3" />
      </svg>
    )
  }

  return (
    <svg {...commonProps}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </svg>
  )
}

function SetActionIcon({ kind }: { kind: 'fail' | 'drop' | 'validate' }) {
  const commonProps = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  if (kind === 'fail') {
    return (
      <svg {...commonProps}>
        <path d="M6 6l12 12" />
        <path d="M18 6L6 18" />
      </svg>
    )
  }

  if (kind === 'drop') {
    return (
      <svg {...commonProps}>
        <path d="M12 4v10" />
        <path d="M8 10l4 4 4-4" />
        <path d="M5 19h14" />
      </svg>
    )
  }

  return (
    <svg {...commonProps}>
      <path d="M5 13l4 4L19 7" />
    </svg>
  )
}

function NotificationStatusIcon({ permission }: { permission: string }) {
  const commonProps = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  if (permission === 'granted') {
    return (
      <svg {...commonProps}>
        <path d="M6 9a6 6 0 0112 0v5l2 2H4l2-2z" />
        <path d="M10 18a2 2 0 004 0" />
      </svg>
    )
  }

  return (
    <svg {...commonProps}>
      <path d="M8 10.5a4 4 0 018 0V15l2 2H6l2-2z" />
      <path d="M10.5 19a1.5 1.5 0 003 0" />
      <path d="M3 3l18 18" />
    </svg>
  )
}

function SessionActivityIcon({ active }: { active: boolean }) {
  const commonProps = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  return (
    <svg {...commonProps}>
      <circle cx="12" cy="12" r="8" />
      {active ? <path d="M8 12l2.5 2.5L16 9" /> : <path d="M9 12h6" />}
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.05.05a2 2 0 1 1-2.83 2.83l-.05-.05a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.08a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.87.34l-.05.05a2 2 0 1 1-2.83-2.83l.05-.05a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.08a1.7 1.7 0 0 0 1.56-1.04 1.7 1.7 0 0 0-.34-1.87l-.05-.05a2 2 0 1 1 2.83-2.83l.05.05a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 1 1 4 0v.08A1.7 1.7 0 0 0 15.04 4h.01a1.7 1.7 0 0 0 1.87-.34l.05-.05a2 2 0 1 1 2.83 2.83l-.05.05a1.7 1.7 0 0 0-.34 1.87V8.4A1.7 1.7 0 0 0 21 9.44H21a2 2 0 1 1 0 4h-.08a1.7 1.7 0 0 0-1.56 1.04V15z" />
    </svg>
  )
}

function WatchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="7" y="6" width="10" height="12" rx="2" />
      <path d="M9 3h6" />
      <path d="M9 21h6" />
      <path d="M12 9v3l2 2" />
    </svg>
  )
}

function App() {
  const initialActiveSession = loadActiveSession()
  const initialHistory = loadSessionHistory()
  const initialTemplates = loadTemplates()

  const [templates, setTemplates] = useState<RoutineTemplate[]>(() => initialTemplates)
  const [sessionHistory, setSessionHistory] = useState<WorkoutSession[]>(initialHistory)
  const [activeSession, setActiveSession] = useState<WorkoutSession | null>(
    () => initialActiveSession,
  )
  const [activeView, setActiveView] = useState<ActiveView>(
    initialActiveSession || initialTemplates.length > 0 ? 'session' : 'templates',
  )
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<TemplateExercise[]>([])
  const [collapsedTemplateExercises, setCollapsedTemplateExercises] = useState<Record<string, boolean>>(
    () => loadCollapsedTemplateState(),
  )
  const [isExercisePickerOpen, setIsExercisePickerOpen] = useState(false)
  const [isTemplateEditorOpen, setIsTemplateEditorOpen] = useState(false)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0)
  const [historyRange, setHistoryRange] = useState<HistoryRange>('7d')
  const [isHistoryDetailOpen, setIsHistoryDetailOpen] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    initialHistory[0]?.id ?? null,
  )
  const [isExerciseImageBroken, setIsExerciseImageBroken] = useState(false)
  const [isResting, setIsResting] = useState(false)
  const [restRemaining, setRestRemaining] = useState(0)
  const [restSetId, setRestSetId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [isWatchStartPopupOpen, setIsWatchStartPopupOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isFinishRecapOpen, setIsFinishRecapOpen] = useState(false)
  const [pendingScrollSetId, setPendingScrollSetId] = useState<string | null>(null)
  const [activeSetByExerciseId, setActiveSetByExerciseId] = useState<Record<string, string>>({})
  const [pendingNextValidationTarget, setPendingNextValidationTarget] = useState<{
    exerciseIndex: number
    exerciseId: string
    setId?: string
  } | null>(null)
  const [focusedSetId, setFocusedSetId] = useState<string | null>(null)
  const [notificationPermission, setNotificationPermission] = useState(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  )

  const selectedIds = useMemo(() => new Set(selected.map((item) => item.exerciseId)), [selected])

  const filteredExercises = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) {
      return EXERCISES
    }

    return EXERCISES.filter((exercise) => {
      return (
        exercise.name.toLowerCase().includes(normalizedQuery) ||
        exercise.aliases.some((alias) => alias.toLowerCase().includes(normalizedQuery))
      )
    })
  }, [query])

  const historyOverview = useMemo(() => {
    const now = new Date()
    const rangeStart = getHistoryRangeStart(historyRange, now)
    const historyInRange = sessionHistory
      .filter((session) => {
        if (!rangeStart) {
          return true
        }

        return new Date(session.startedAt).getTime() >= rangeStart.getTime()
      })
      .sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime())

    const buckets: Array<{
      key: string
      label: string
      title: string
      start: Date
      end: Date
      sessions: WorkoutSession[]
    }> = []

    if (historyRange === '7d') {
      for (let offset = 6; offset >= 0; offset -= 1) {
        const start = startOfDay(addDays(now, -offset))
        const end = addDays(start, 1)
        buckets.push({
          key: start.toISOString(),
          label: formatHistoryBucketLabel(historyRange, start),
          title: formatHistoryBucketTitle(historyRange, start, end),
          start,
          end,
          sessions: [],
        })
      }
    } else if (historyRange === '1m') {
      const from = rangeStart ?? startOfDay(addDays(now, -29))
      const until = addDays(startOfDay(now), 1)
      let cursor = startOfWeekMonday(from)

      while (cursor.getTime() < until.getTime()) {
        const start = cursor.getTime() < from.getTime() ? from : cursor
        const end = addDays(cursor, 7)
        const boundedEnd = end.getTime() > until.getTime() ? until : end

        buckets.push({
          key: start.toISOString(),
          label: formatHistoryBucketLabel(historyRange, start),
          title: formatHistoryBucketTitle(historyRange, start, boundedEnd),
          start,
          end: boundedEnd,
          sessions: [],
        })

        cursor = addDays(cursor, 7)
      }
    } else if (historyRange === '1y') {
      for (let offset = 11; offset >= 0; offset -= 1) {
        const monthCursor = addMonths(startOfDay(now), -offset)
        const start = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1)
        const end = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1)

        buckets.push({
          key: start.toISOString(),
          label: formatHistoryBucketLabel(historyRange, start),
          title: formatHistoryBucketTitle(historyRange, start, end),
          start,
          end,
          sessions: [],
        })
      }
    } else {
      const oldest = sessionHistory[sessionHistory.length - 1]
      const fromYear = oldest ? new Date(oldest.startedAt).getFullYear() : now.getFullYear()
      const toYear = now.getFullYear()

      for (let year = fromYear; year <= toYear; year += 1) {
        const start = new Date(year, 0, 1)
        const end = addYears(start, 1)
        buckets.push({
          key: String(year),
          label: formatHistoryBucketLabel(historyRange, start),
          title: formatHistoryBucketTitle(historyRange, start, end),
          start,
          end,
          sessions: [],
        })
      }
    }

    historyInRange.forEach((session) => {
      const time = new Date(session.startedAt).getTime()
      const bucket = buckets.find(
        (entry) => time >= entry.start.getTime() && time < entry.end.getTime(),
      )
      bucket?.sessions.push(session)
    })

    return {
      sessions: historyInRange,
      buckets,
      totalCount: historyInRange.length,
      maxBucketCount: Math.max(1, ...buckets.map((bucket) => bucket.sessions.length)),
    }
  }, [sessionHistory, historyRange])

  const selectedSession = useMemo(() => {
    if (historyOverview.sessions.length === 0) {
      return null
    }

    return (
      historyOverview.sessions.find((session) => session.id === selectedSessionId) ??
      historyOverview.sessions[0]
    )
  }, [historyOverview.sessions, selectedSessionId])

  const currentExercise = activeSession?.exercises[currentExerciseIndex] ?? null
  const currentExerciseInfo = currentExercise
    ? EXERCISES.find((exercise) => exercise.id === currentExercise.exerciseId) ?? null
    : null
  const currentSetIndex = useMemo(() => {
    if (!currentExercise) {
      return -1
    }

    const manualSetId = activeSetByExerciseId[currentExercise.id]
    if (manualSetId) {
      const manualSetIndex = currentExercise.sets.findIndex((set) => set.id === manualSetId)
      if (manualSetIndex >= 0) {
        return manualSetIndex
      }
    }

    const nextPendingIndex = currentExercise.sets.findIndex((set) => !set.completedAt)
    return nextPendingIndex >= 0 ? nextPendingIndex : currentExercise.sets.length - 1
  }, [currentExercise, activeSetByExerciseId])
  const currentSet =
    currentExercise && currentSetIndex >= 0 ? currentExercise.sets[currentSetIndex] : null

  const sessionExerciseTabs = useMemo(() => {
    if (!activeSession) {
      return [] as Array<{
        exercise: WorkoutSession['exercises'][number]
        index: number
        isCompleted: boolean
      }>
    }

    return activeSession.exercises
      .map((exercise, index) => ({
        exercise,
        index,
        isCompleted:
          exercise.sets.length > 0 && exercise.sets.every((set) => Boolean(set.completedAt)),
      }))
      .sort((left, right) => {
        if (left.isCompleted !== right.isCompleted) {
          return left.isCompleted ? 1 : -1
        }

        return left.index - right.index
      })
  }, [activeSession])

  useEffect(() => {
    if (activeSession) {
      saveActiveSession(activeSession)
    } else {
      clearActiveSession()
    }
  }, [activeSession])

  useEffect(() => {
    saveSessionHistory(sessionHistory)
  }, [sessionHistory])

  useEffect(() => {
    saveTemplates(templates)
  }, [templates])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(
      TEMPLATE_COLLAPSE_STORAGE_KEY,
      JSON.stringify(collapsedTemplateExercises),
    )
  }, [collapsedTemplateExercises])

  useEffect(() => {
    if (!isResting || restRemaining <= 0) {
      return undefined
    }

    const timer = window.setInterval(() => {
      setRestRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(timer)
          setIsResting(false)
          setRestSetId(null)
          setNotice('Repos terminé.')
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('Strong Simon', { body: 'Le temps de repos est terminé.' })
          }
          return 0
        }

        return current - 1
      })
    }, 1000)

    return () => window.clearInterval(timer)
  }, [isResting, restRemaining])

  useEffect(() => {
    if (!selectedSessionId && historyOverview.sessions.length > 0) {
      setSelectedSessionId(historyOverview.sessions[0].id)
      return
    }

    if (
      selectedSessionId &&
      historyOverview.sessions.length > 0 &&
      !historyOverview.sessions.some((session) => session.id === selectedSessionId)
    ) {
      setSelectedSessionId(historyOverview.sessions[0].id)
    }
  }, [selectedSessionId, historyOverview.sessions])

  useEffect(() => {
    setIsExerciseImageBroken(false)
  }, [currentExercise?.id])

  useEffect(() => {
    if (!pendingScrollSetId) {
      return undefined
    }

    const animationFrame = window.requestAnimationFrame(() => {
      const element = document.querySelector<HTMLElement>(`[data-set-id="${pendingScrollSetId}"]`)
      element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })

    setPendingScrollSetId(null)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [pendingScrollSetId, activeSession])

  useEffect(() => {
    if (!focusedSetId) {
      return undefined
    }

    const timeout = window.setTimeout(() => setFocusedSetId(null), 1200)
    return () => window.clearTimeout(timeout)
  }, [focusedSetId])

  useEffect(() => {
    if (!pendingNextValidationTarget || !activeSession) {
      return
    }

    if (currentExerciseIndex !== pendingNextValidationTarget.exerciseIndex) {
      setCurrentExerciseIndex(pendingNextValidationTarget.exerciseIndex)
      return
    }

    const nextSetId =
      pendingNextValidationTarget.setId ??
      activeSession.exercises[pendingNextValidationTarget.exerciseIndex]?.sets[0]?.id

    if (!nextSetId) {
      setPendingNextValidationTarget(null)
      return
    }

    setActiveSetByExerciseId((previous) => ({
      ...previous,
      [pendingNextValidationTarget.exerciseId]: nextSetId,
    }))

    setFocusedSetId(nextSetId)

    const animationFrame = window.requestAnimationFrame(() => {
      const element = document.querySelector<HTMLElement>(`[data-set-id="${nextSetId}"]`)
      element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })

    setPendingNextValidationTarget(null)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [pendingNextValidationTarget, activeSession, currentExerciseIndex])

  function addExercise(exerciseId: string) {
    if (selectedIds.has(exerciseId)) {
      return
    }

    setSelected((previous) => [...previous, createTemplateExercise(exerciseId, previous.length)])
    setCollapsedTemplateExercises((previous) => ({
      ...previous,
      [exerciseId]: false,
    }))
  }

  function showNotice(message: string) {
    setNotice(message)
  }

  function removeExercise(exerciseId: string) {
    setSelected((previous) => previous.filter((exercise) => exercise.exerciseId !== exerciseId))
  }

  function toggleTemplateExerciseCollapsed(exerciseId: string) {
    setCollapsedTemplateExercises((previous) => ({
      ...previous,
      [exerciseId]: !(previous[exerciseId] ?? false),
    }))
  }

  function updateTemplateSet(
    exerciseId: string,
    setIndex: number,
    field: TemplateSetField,
    value: number,
  ) {
    setSelected((previous) =>
      previous.map((exercise) => {
        if (exercise.exerciseId !== exerciseId) {
          return exercise
        }

        return {
          ...exercise,
          sets: exercise.sets.map((set, currentIndex) => {
            if (currentIndex !== setIndex) {
              return set
            }

            return {
              ...set,
              [field]: Number.isNaN(value) ? 0 : value,
            }
          }),
        }
      }),
    )
  }

  function updateTemplateSetPhaseTag(
    exerciseId: string,
    setIndex: number,
    phaseTag: TemplateExerciseTag,
  ) {
    setSelected((previous) =>
      previous.map((exercise) => {
        if (exercise.exerciseId !== exerciseId) {
          return exercise
        }

        return {
          ...exercise,
          sets: exercise.sets.map((set, currentIndex) =>
            currentIndex === setIndex ? { ...set, phaseTag } : set,
          ),
        }
      }),
    )
  }

  function resetTemplateEditor() {
    setName('')
    setQuery('')
    setSelected([])
    setIsExercisePickerOpen(false)
    setEditingTemplateId(null)
    setIsTemplateEditorOpen(false)
  }

  function openCreateTemplateEditor() {
    setName('')
    setQuery('')
    setSelected([])
    setIsExercisePickerOpen(false)
    setEditingTemplateId(null)
    setIsTemplateEditorOpen(true)
  }

  function openEditTemplateEditor(template: RoutineTemplate) {
    const nextSelected = template.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => ({ ...set })),
    }))

    setName(template.name)
    setQuery('')
    setSelected(nextSelected)
    setCollapsedTemplateExercises((previous) => ({
      ...createCollapsedTemplateState(nextSelected),
      ...previous,
    }))
    setIsExercisePickerOpen(false)
    setEditingTemplateId(template.id)
    setIsTemplateEditorOpen(true)
  }

  function saveTemplate() {
    if (!name.trim() || selected.length === 0) {
      showNotice('Ajoute un nom et au moins un exercice.')
      return
    }

    const now = new Date().toISOString()

    if (editingTemplateId) {
      setTemplates((previous) =>
        previous.map((template) => {
          if (template.id !== editingTemplateId) {
            return template
          }

          return {
            ...template,
            name: name.trim(),
            updatedAt: now,
            exercises: selected.map((exercise, index) => ({
              ...exercise,
              orderIndex: index,
            })),
          }
        }),
      )

      showNotice('Template mis a jour.')
      resetTemplateEditor()
      return
    }

    const nextTemplate: RoutineTemplate = {
      id: createId(),
      name: name.trim(),
      createdAt: now,
      updatedAt: now,
      exercises: selected.map((exercise, index) => ({
        ...exercise,
        orderIndex: index,
      })),
    }

    setTemplates((previous) => [nextTemplate, ...previous])
    showNotice('Template enregistre.')
    resetTemplateEditor()
  }

  function deleteTemplate(templateId: string) {
    setTemplates((previous) => previous.filter((template) => template.id !== templateId))
    showNotice('Template supprime.')
  }

  function startSession(template: RoutineTemplate) {
    const session = createSessionFromTemplate(template)
    setActiveSession(session)
    setCurrentExerciseIndex(0)
    setActiveView('session')
    setIsResting(false)
    setRestRemaining(0)
    setRestSetId(null)
    setIsFinishRecapOpen(false)
    setIsWatchStartPopupOpen(true)
  }

  function updateSessionSet(
    exerciseId: string,
    setId: string,
    field: SessionSetField,
    value: number,
  ) {
    setActiveSession((previous) => {
      if (!previous) {
        return previous
      }

      return {
        ...previous,
        exercises: previous.exercises.map((exercise) => {
          if (exercise.id !== exerciseId) {
            return exercise
          }

          return {
            ...exercise,
            sets: exercise.sets.map((set) => {
              if (set.id !== setId) {
                return set
              }

              return {
                ...set,
                [field]:
                  field === 'actualReps'
                    ? Math.max(0, Math.round(Number.isNaN(value) ? 0 : value))
                    : Math.max(0, Number.isNaN(value) ? 0 : value),
              }
            }),
          }
        }),
      }
    })
  }

  function updateSessionSetEffortTag(
    exerciseId: string,
    setId: string,
    effortTag: 'fail' | 'drop' | '',
  ) {
    setActiveSession((previous) => {
      if (!previous) {
        return previous
      }

      return {
        ...previous,
        exercises: previous.exercises.map((exercise) => {
          if (exercise.id !== exerciseId) {
            return exercise
          }

          return {
            ...exercise,
            sets: exercise.sets.map((set) => {
              if (set.id !== setId) {
                return set
              }

              return {
                ...set,
                effortTag: effortTag || undefined,
              }
            }),
          }
        }),
      }
    })
  }

  function nudgeSessionSet(
    exerciseId: string,
    setId: string,
    field: SessionSetField,
    delta: number,
  ) {
    setActiveSession((previous) => {
      if (!previous) {
        return previous
      }

      return {
        ...previous,
        exercises: previous.exercises.map((exercise) => {
          if (exercise.id !== exerciseId) {
            return exercise
          }

          return {
            ...exercise,
            sets: exercise.sets.map((set) => {
              if (set.id !== setId) {
                return set
              }

              const nextValue = Math.max(0, (set[field] ?? 0) + delta)
              return {
                ...set,
                [field]: field === 'actualReps' ? Math.round(nextValue) : nextValue,
              }
            }),
          }
        }),
      }
    })
  }

  function createFollowupSessionSet(source?: SessionSet): SessionSet {
    return {
      id: createId(),
      setNumber: source ? source.setNumber + 1 : 1,
      targetReps: source?.targetReps ?? 10,
      targetWeight: source?.targetWeight ?? 0,
      actualReps: source?.actualReps ?? source?.targetReps ?? 10,
      actualWeight: source?.actualWeight ?? source?.targetWeight ?? 0,
      restSeconds: source?.restSeconds ?? 90,
      phaseTag: source?.phaseTag ?? 'working',
    }
  }

  function addSessionSet(exerciseId: string) {
    setActiveSession((previous) => {
      if (!previous) {
        return previous
      }

      return {
        ...previous,
        exercises: previous.exercises.map((exercise) => {
          if (exercise.id !== exerciseId) {
            return exercise
          }

          const lastSet = exercise.sets[exercise.sets.length - 1]
          const nextSet = createFollowupSessionSet(lastSet)
          setPendingScrollSetId(nextSet.id)
          return {
            ...exercise,
            sets: [...exercise.sets, nextSet],
          }
        }),
      }
    })
  }

  function completeSet(exerciseId: string, setId: string) {
    if (!activeSession) {
      return
    }

    const exerciseIndex = activeSession.exercises.findIndex((exercise) => exercise.id === exerciseId)
    if (exerciseIndex < 0) {
      return
    }

    const exercise = activeSession.exercises[exerciseIndex]
    const setIndex = exercise.sets.findIndex((set) => set.id === setId)
    if (setIndex < 0) {
      return
    }
    const targetSet = exercise.sets[setIndex]
    const shouldInvalidate = Boolean(targetSet.completedAt)

    let restDuration = 0

    if (isResting && !shouldInvalidate) {
      setIsResting(false)
      setRestRemaining(0)
      setRestSetId(null)
    }

    if (shouldInvalidate && restSetId === setId) {
      setIsResting(false)
      setRestRemaining(0)
      setRestSetId(null)
    }

    setActiveSession((previous) => {
      if (!previous) {
        return previous
      }

      return {
        ...previous,
        exercises: previous.exercises.map((exercise) => {
          if (exercise.id !== exerciseId) {
            return exercise
          }

          return {
            ...exercise,
            sets: exercise.sets.map((set) => {
              if (set.id !== setId) {
                return set
              }

              restDuration = set.restSeconds
              return {
                ...set,
                completedAt: shouldInvalidate ? undefined : new Date().toISOString(),
              }
            }),
          }
        }),
      }
    })

    if (shouldInvalidate) {
      return
    }

    if (restDuration > 0) {
      setRestRemaining(restDuration)
      setIsResting(true)
      setRestSetId(setId)
    }

    if (setIndex < exercise.sets.length - 1) {
      setPendingNextValidationTarget({
        exerciseIndex,
        exerciseId: exercise.id,
        setId: exercise.sets[setIndex + 1].id,
      })
      return
    }

    if (exerciseIndex < activeSession.exercises.length - 1) {
      const nextExercise = activeSession.exercises[exerciseIndex + 1]
      setPendingNextValidationTarget({
        exerciseIndex: exerciseIndex + 1,
        exerciseId: nextExercise.id,
      })
    }
  }

  function finishSession() {
    if (!activeSession) {
      return
    }

    const recordedExercises = activeSession.exercises
      .map((exercise) => ({
        ...exercise,
        sets: exercise.sets.filter((set) => Boolean(set.completedAt)),
      }))
      .filter((exercise) => exercise.sets.length > 0)

    const totalRecordedSets = recordedExercises.reduce(
      (count, exercise) => count + exercise.sets.length,
      0,
    )

    if (totalRecordedSets === 0) {
      setIsFinishRecapOpen(false)
      showNotice('Aucun set valide. La seance n\'a pas ete enregistree.')
      return
    }

    const completed: WorkoutSession = {
      ...activeSession,
      endedAt: new Date().toISOString(),
      exercises: recordedExercises,
    }

    setSessionHistory((previous) => [completed, ...previous])
    setSelectedSessionId(completed.id)
    setActiveView('history')
    setActiveSession(null)
    setIsFinishRecapOpen(false)
    setActiveSetByExerciseId({})
    setCurrentExerciseIndex(0)
    setIsResting(false)
    setRestRemaining(0)
    setRestSetId(null)
    showNotice('Seance terminee et enregistree.')
  }

  function selectSession(sessionId: string) {
    setSelectedSessionId(sessionId)
    setActiveView('history')
    setIsHistoryDetailOpen(true)
  }

  async function requestNotifications() {
    if (typeof Notification === 'undefined') {
      setNotificationPermission('unsupported')
      showNotice('Notifications indisponibles sur ce navigateur.')
      return
    }

    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
    showNotice(permission === 'granted' ? 'Notifications activees.' : 'Notifications refusees.')
  }

  async function importStrongSessionsCsv(file: File | null) {
    if (!file) {
      return
    }

    try {
      const csvText = await file.text()
      const importedSessions = parseStrongWorkoutsCsv(csvText)

      if (importedSessions.length === 0) {
        showNotice('Import impossible: format CSV non reconnu.')
        return
      }

      let importedCount = 0
      let skippedCount = 0

      setSessionHistory((previous) => {
        const existingKeys = new Set(previous.map((session) => `${session.startedAt}__${session.templateName}`))
        const nextSessions = importedSessions.filter((session) => {
          const key = `${session.startedAt}__${session.templateName}`
          if (existingKeys.has(key)) {
            skippedCount += 1
            return false
          }

          existingKeys.add(key)
          importedCount += 1
          return true
        })

        if (nextSessions.length > 0) {
          setSelectedSessionId(nextSessions[0].id)
          setActiveView('history')
          setIsSettingsOpen(false)
        }

        return [...nextSessions, ...previous]
      })

      if (importedCount === 0) {
        showNotice('Aucune nouvelle seance importee (doublons detectes).')
        return
      }

      const duplicateLabel = skippedCount > 0 ? ` (${skippedCount} doublons ignores)` : ''
      showNotice(`${importedCount} seances importees${duplicateLabel}.`)
    } catch {
      showNotice('Import impossible: fichier CSV invalide.')
    }
  }

  function exportSessionHistoryCsv() {
    const rows = [
      [
        'session_name',
        'started_at',
        'ended_at',
        'exercise',
        'set_number',
        'set_phase_tag',
        'target_reps',
        'target_weight',
        'actual_reps',
        'actual_weight',
        'rest_seconds',
        'set_effort_tag',
      ],
      ...sessionHistory.flatMap((session) =>
        session.exercises.flatMap((exercise) => {
          const exerciseInfo = EXERCISES.find((entry) => entry.id === exercise.exerciseId)
          return exercise.sets.map((set) => [
            session.templateName,
            session.startedAt,
            session.endedAt ?? '',
            exerciseInfo?.name ?? exercise.exerciseId,
            set.setNumber,
            set.phaseTag ?? 'working',
            set.targetReps,
            set.targetWeight,
            set.actualReps,
            set.actualWeight,
            set.restSeconds,
            set.effortTag ?? '',
          ])
        }),
      ),
    ]

    const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'strong-simon-history.csv'
    link.click()
    URL.revokeObjectURL(url)
    showNotice('Export CSV genere.')
  }

  return (
    <main className="app-shell">
      <header className="header">
        <img className="header-logo" src="/logo_simon_strong.png" alt="Strong Simon" />
        <div className="status-bar">
          <button
            type="button"
            className={
              isSettingsOpen
                ? 'status-icon-button status-icon-button--settings is-on'
                : 'status-icon-button status-icon-button--settings'
            }
            onClick={() => setIsSettingsOpen((previous) => !previous)}
            aria-label="Ouvrir le menu settings"
            title="Settings"
          >
            <SettingsIcon />
          </button>
          <button
            type="button"
            onClick={requestNotifications}
            className={
              notificationPermission === 'granted'
                ? 'status-icon-button status-icon-button--notifications is-on'
                : 'status-icon-button status-icon-button--notifications is-off'
            }
            aria-label={`Notifications ${notificationPermission}. Cliquer pour modifier.`}
            title={`Notifications: ${notificationPermission}`}
          >
            <NotificationStatusIcon permission={notificationPermission} />
          </button>
          <span
            className={activeSession ? 'status-session-indicator is-active' : 'status-session-indicator'}
            aria-label={activeSession ? 'Seance active' : 'Aucune seance active'}
            title={activeSession ? 'Seance active' : 'Aucune seance active'}
          >
            <SessionActivityIcon active={Boolean(activeSession)} />
          </span>
          {isResting && <span className="status-timer-chip">Repos {restRemaining}s</span>}
        </div>
      </header>

      {notice && (
        <p className="notice">
          <span>{notice}</span>
        </p>
      )}

      {isWatchStartPopupOpen && (
        <div
          className="watch-start-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setIsWatchStartPopupOpen(false)}
        >
          <section className="watch-start-panel" onClick={(event) => event.stopPropagation()}>
            <div className="card-head section-head section-head--tight">
              <div className="watch-start-title">
                <WatchIcon />
                <h3>Seance demarree</h3>
              </div>
              <button
                className="button-compact"
                type="button"
                onClick={() => setIsWatchStartPopupOpen(false)}
              >
                Fermer
              </button>
            </div>
            <p>Pensez a lancer votre Apple Watch.</p>
          </section>
        </div>
      )}

      {isSettingsOpen && (
        <div className="settings-overlay" role="dialog" aria-modal="true" onClick={() => setIsSettingsOpen(false)}>
          <section className="settings-panel" onClick={(event) => event.stopPropagation()}>
            <div className="card-head section-head section-head--tight">
              <h3>Settings</h3>
              <button className="button-compact" type="button" onClick={() => setIsSettingsOpen(false)}>
                Fermer
              </button>
            </div>

            <div className="settings-block">
              <strong>Importer des seances precedentes</strong>
              <p className="panel-intro">
                Importe un export Strong CSV, par exemple le fichier strong_workouts.csv.
              </p>
              <label>
                Fichier CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => {
                    void importStrongSessionsCsv(event.target.files?.[0] ?? null)
                    event.currentTarget.value = ''
                  }}
                />
              </label>
            </div>
          </section>
        </div>
      )}

      <nav className="top-menu" aria-label="Navigation principale">
        <button
          type="button"
          className={activeView === 'session' ? 'top-menu__button is-active' : 'top-menu__button'}
          onClick={() => setActiveView('session')}
        >
          <MenuIcon view="session" />
          <span>Seance</span>
        </button>
        <button
          type="button"
          className={activeView === 'templates' ? 'top-menu__button is-active' : 'top-menu__button'}
          onClick={() => setActiveView('templates')}
        >
          <MenuIcon view="templates" />
          <span>Templates</span>
        </button>
        <button
          type="button"
          className={activeView === 'history' ? 'top-menu__button is-active' : 'top-menu__button'}
          onClick={() => setActiveView('history')}
        >
          <MenuIcon view="history" />
          <span>Historique</span>
        </button>
      </nav>

      {activeView === 'session' && (
        <section className="panel workout-panel">
          {activeSession && currentExercise ? (
            <>
              <h2 className="session-title">Seance en cours: {activeSession.templateName}</h2>
              <p>
                Exercice {currentExerciseIndex + 1} / {activeSession.exercises.length}
              </p>

              <div className="session-exercise-tabs" role="tablist" aria-label="Exercices de la seance">
                {sessionExerciseTabs.map(({ exercise, index, isCompleted }) => {
                  const exerciseInfo = EXERCISES.find((entry) => entry.id === exercise.exerciseId)
                  const completedSets = exercise.sets.filter((set) => set.completedAt).length
                  const isActive = index === currentExerciseIndex

                  return (
                    <button
                      key={exercise.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className={
                        isActive
                          ? `session-exercise-tab is-active${isCompleted ? ' is-completed' : ''}`
                          : `session-exercise-tab${isCompleted ? ' is-completed' : ''}`
                      }
                      onClick={() => setCurrentExerciseIndex(index)}
                    >
                      <span className="session-exercise-tab__title">
                        {exerciseInfo?.name ?? exercise.exerciseId}
                      </span>
                      <span className="session-exercise-tab__meta">
                        {completedSets}/{exercise.sets.length} sets
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="exercise-header">
                <div className="exercise-overview">
                  <div className="exercise-media exercise-media--compact">
                    {currentExerciseInfo?.imageUrl && !isExerciseImageBroken ? (
                      <img
                        className="exercise-media__image"
                        src={currentExerciseInfo.imageUrl}
                        alt={currentExerciseInfo.name}
                        loading="lazy"
                        onError={() => setIsExerciseImageBroken(true)}
                      />
                    ) : (
                      <div className="exercise-media__fallback">Image indisponible</div>
                    )}
                  </div>
                  <div className="exercise-meta">
                    <strong>{currentExerciseInfo?.name ?? currentExercise.exerciseId}</strong>
                    {currentExercise.sets.length > 0 && (
                      <div className={`tag-chip tag-chip--${currentExercise.sets[0].phaseTag ?? 'working'}`}>
                        {currentExercise.sets[0].phaseTag ?? 'working'}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="set-progress-head" aria-label="Progression des sets">
                <div className="set-progress-track">
                  {currentExercise.sets.map((set, index) => {
                    const isCompleted = Boolean(set.completedAt)
                    const isDrop = set.effortTag === 'drop'
                    const isHard = isCompleted && set.effortTag === 'fail'

                    return (
                      <button
                        key={set.id}
                        type="button"
                        className={`set-progress-dot${isCompleted ? ' is-done' : ''}${isHard ? ' is-hard' : ''}${isDrop ? ' is-drop' : ''}${index === currentSetIndex ? ' is-current' : ''}`}
                        title={`Set ${set.setNumber}`}
                        aria-label={`Afficher le set ${set.setNumber}`}
                        onClick={() =>
                          setActiveSetByExerciseId((previous) => ({
                            ...previous,
                            [currentExercise.id]: set.id,
                          }))
                        }
                      />
                    )
                  })}
                </div>
                <span className="set-progress-label">
                  Set {Math.max(currentSetIndex + 1, 1)}/{currentExercise.sets.length}
                </span>
              </div>

              <div className="session-sets">
                {currentSet ? (
                  <article
                    className={`set-row${focusedSetId === currentSet.id ? ' is-focus-target' : ''}`}
                    key={currentSet.id}
                    data-set-id={currentSet.id}
                  >
                    <div className="set-row__head">
                      <strong>Set {currentSet.setNumber}</strong>
                      <span className={`tag-chip tag-chip--${currentSet.phaseTag ?? 'working'}`}>
                        {currentSet.phaseTag ?? 'working'}
                      </span>
                      {currentSet.completedAt && <span className="set-status">Valide</span>}
                    </div>
                    <div className="set-stepper-grid">
                      <label className="stepper-field">
                        <div className="stepper-control">
                          <button
                            type="button"
                            aria-label={`Diminuer le poids du set ${currentSet.setNumber}`}
                            onClick={() =>
                              nudgeSessionSet(currentExercise.id, currentSet.id, 'actualWeight', -0.5)
                            }
                          >
                            -
                          </button>
                          <span className="stepper-inline-label">Poids</span>
                          <input
                            type="number"
                            step="0.5"
                            aria-label={`Poids du set ${currentSet.setNumber} en kilogrammes`}
                            value={currentSet.actualWeight}
                            onChange={(event) =>
                              updateSessionSet(
                                currentExercise.id,
                                currentSet.id,
                                'actualWeight',
                                Number(event.target.value),
                              )
                            }
                          />
                          <span className="stepper-unit">kg</span>
                          <button
                            type="button"
                            aria-label={`Augmenter le poids du set ${currentSet.setNumber}`}
                            onClick={() =>
                              nudgeSessionSet(currentExercise.id, currentSet.id, 'actualWeight', 0.5)
                            }
                          >
                            +
                          </button>
                        </div>
                      </label>

                      <label className="stepper-field">
                        <div className="stepper-control">
                          <button
                            type="button"
                            aria-label={`Diminuer les repetitions du set ${currentSet.setNumber}`}
                            onClick={() =>
                              nudgeSessionSet(currentExercise.id, currentSet.id, 'actualReps', -1)
                            }
                          >
                            -
                          </button>
                          <span className="stepper-inline-label">Reps</span>
                          <input
                            type="number"
                            aria-label={`Nombre de repetitions du set ${currentSet.setNumber}`}
                            value={currentSet.actualReps}
                            onChange={(event) =>
                              updateSessionSet(
                                currentExercise.id,
                                currentSet.id,
                                'actualReps',
                                Number(event.target.value),
                              )
                            }
                          />
                          <span className="stepper-unit">rep</span>
                          <button
                            type="button"
                            aria-label={`Augmenter les repetitions du set ${currentSet.setNumber}`}
                            onClick={() =>
                              nudgeSessionSet(currentExercise.id, currentSet.id, 'actualReps', 1)
                            }
                          >
                            +
                          </button>
                        </div>
                      </label>
                    </div>

                    <div className="set-actions-row">
                      <button
                        type="button"
                        className={currentSet.effortTag === 'fail' ? 'set-action-button is-active is-fail' : 'set-action-button is-fail'}
                        onClick={() =>
                          updateSessionSetEffortTag(
                            currentExercise.id,
                            currentSet.id,
                            currentSet.effortTag === 'fail' ? '' : 'fail',
                          )
                        }
                      >
                        <SetActionIcon kind="fail" />
                        <span>Fail</span>
                      </button>
                      <button
                        type="button"
                        className={currentSet.effortTag === 'drop' ? 'set-action-button is-active is-drop' : 'set-action-button is-drop'}
                        onClick={() =>
                          updateSessionSetEffortTag(
                            currentExercise.id,
                            currentSet.id,
                            currentSet.effortTag === 'drop' ? '' : 'drop',
                          )
                        }
                      >
                        <SetActionIcon kind="drop" />
                        <span>Drop</span>
                      </button>
                      <button
                        type="button"
                        className={currentSet.completedAt ? 'set-action-button is-active is-validate' : 'set-action-button is-validate'}
                        onClick={() => completeSet(currentExercise.id, currentSet.id)}
                      >
                        <SetActionIcon kind="validate" />
                        <span>Valider</span>
                      </button>
                    </div>
                  </article>
                ) : (
                  <p>Aucun set disponible pour cet exercice.</p>
                )}
              </div>

              <button
                type="button"
                className="secondary add-set-button"
                onClick={() => addSessionSet(currentExercise.id)}
              >
                + Ajouter un set
              </button>

              <button className="primary" type="button" onClick={() => setIsFinishRecapOpen(true)}>
                Terminer la seance
              </button>

              {isFinishRecapOpen && (
                <div className="finish-recap-overlay" role="dialog" aria-modal="true">
                  <section className="finish-recap-panel">
                    <h3>Recap de la seance</h3>
                    <p>Verifie avant d'enregistrer la fin de seance.</p>
                    <div className="finish-recap-list">
                      {activeSession.exercises.map((exercise) => {
                        const exerciseInfo = EXERCISES.find((entry) => entry.id === exercise.exerciseId)

                        return (
                          <article className="finish-recap-item" key={exercise.id}>
                            <strong>{exerciseInfo?.name ?? exercise.exerciseId}</strong>
                            <div className="finish-recap-dots" aria-label="Etat des sets">
                              {exercise.sets.map((set) => {
                                const isDone = Boolean(set.completedAt)
                                const isHard = isDone && set.effortTag === 'fail'
                                const isDrop = set.effortTag === 'drop'

                                return (
                                  <span
                                    key={set.id}
                                    className={`finish-dot${isDone ? ' is-done' : ''}${isHard ? ' is-hard' : ''}${isDrop ? ' is-drop' : ''}`}
                                    title={`Set ${set.setNumber}`}
                                  />
                                )
                              })}
                            </div>
                          </article>
                        )
                      })}
                    </div>
                    <div className="actions-row">
                      <button className="primary" type="button" onClick={finishSession}>
                        Confirmer et enregistrer
                      </button>
                      <button type="button" onClick={() => setIsFinishRecapOpen(false)}>
                        Retour a la seance
                      </button>
                    </div>
                  </section>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="card-head section-head">
                <div>
                  <h2>Demarrer une seance</h2>
                  <p className="panel-intro">
                    Choisis un template existant pour lancer ta prochaine seance.
                  </p>
                </div>
                <button className="button-compact" type="button" onClick={() => setActiveView('templates')}>
                  Gerer les templates
                </button>
              </div>

              {templates.length === 0 ? (
                <>
                  <p>Aucun template disponible pour le moment.</p>
                  <button type="button" onClick={() => setActiveView('templates')}>
                    Aller dans Templates
                  </button>
                </>
              ) : (
                <div className="saved-list session-launch-list">
                  {templates.map((template) => {
                    const totalSets = template.exercises.reduce(
                      (count, exercise) => count + exercise.sets.length,
                      0,
                    )

                    return (
                    <article className="saved-card session-start-card" key={template.id}>
                      <div className="session-start-card__body">
                        <strong>{template.name}</strong>
                        <p className="session-start-summary">
                          {template.exercises.length} ex • {totalSets} sets
                        </p>
                      </div>
                      <div className="actions-row actions-row--template-launch">
                        <button className="button-compact" type="button" onClick={() => startSession(template)}>
                          Demarrer
                        </button>
                        <button className="button-compact" type="button" onClick={() => setActiveView('templates')}>
                          Voir / Editer
                        </button>
                      </div>
                    </article>
                  )})}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {activeView === 'templates' && (
        <>
          <section className="panel">
            <div className="card-head section-head">
              <h2>Templates sauvegardes localement</h2>
              <button className="button-compact" type="button" onClick={openCreateTemplateEditor}>
                + Nouveau template
              </button>
            </div>
            <div className="saved-list">
              {templates.length === 0 && (
                <p>Pas encore de template. Cree le premier avec le formulaire au-dessus.</p>
              )}
              {templates.map((template) => (
                <article className="saved-card" key={template.id}>
                  <div>
                    <strong>{template.name}</strong>
                    <p>{template.exercises.length} exercices</p>
                  </div>
                  <div className="actions-row actions-row--template-card">
                    <button type="button" onClick={() => openEditTemplateEditor(template)}>
                      Editer
                    </button>
                    <button type="button" onClick={() => startSession(template)}>
                      Demarrer
                    </button>
                    <button type="button" onClick={() => deleteTemplate(template.id)}>
                      Supprimer
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {isTemplateEditorOpen && (
            <section className="panel template-editor-panel">
              <h2>{editingTemplateId ? 'Modifier template' : 'Nouveau template'}</h2>
              <div className="form-grid">
                <label>
                  Nom du template
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Push A"
                  />
                </label>
              </div>

              <div className="card-head section-head section-head--tight">
                <h3>Exercices selectionnes</h3>
                <button
                  className="button-compact"
                  type="button"
                  onClick={() => setIsExercisePickerOpen(true)}
                >
                  + Ajouter un exercice
                </button>
              </div>

              <div className="selected-list">
                {selected.length === 0 && <p>Aucun exercice ajoute.</p>}
                {selected.map((item) => {
                  const exercise = EXERCISES.find((entry) => entry.id === item.exerciseId)
                  const isCollapsed = collapsedTemplateExercises[item.exerciseId] ?? false
                  const phaseCounts = item.sets.reduce(
                    (counts, set) => {
                      const phaseTag = set.phaseTag ?? item.tag ?? 'working'
                      counts[phaseTag] += 1
                      return counts
                    },
                    { warmup: 0, working: 0, finisher: 0 } as Record<TemplateExerciseTag, number>,
                  )

                  if (!exercise) {
                    return null
                  }

                  return (
                    <article className="selected-card" key={item.id}>
                      <div className="card-head section-head section-head--tight">
                        <div>
                          <strong>{exercise.name}</strong>
                          <p>
                            {exercise.category ?? 'General'} • {item.sets.length} sets
                          </p>
                          <div className="template-phase-summary">
                            <span className="template-phase-pill template-phase-pill--warmup">
                              WU {phaseCounts.warmup}
                            </span>
                            <span className="template-phase-pill template-phase-pill--working">
                              Work {phaseCounts.working}
                            </span>
                            <span className="template-phase-pill template-phase-pill--finisher">
                              Fin {phaseCounts.finisher}
                            </span>
                          </div>
                        </div>
                        <div className="template-card-actions">
                          <button
                            className="button-compact"
                            type="button"
                            onClick={() => toggleTemplateExerciseCollapsed(item.exerciseId)}
                          >
                            {isCollapsed ? 'Ouvrir' : 'Replier'}
                          </button>
                          <button
                            className="button-compact button-compact--danger"
                            type="button"
                            onClick={() => removeExercise(item.exerciseId)}
                          >
                            Retirer
                          </button>
                        </div>
                      </div>
                      {!isCollapsed &&
                        item.sets.map((set, setIndex) => (
                          <div className="template-set-card" key={`${item.id}-${set.setNumber}`}>
                            <div className="template-set-head">
                              <span className="set-label">Set {set.setNumber}</span>
                              <label className="template-set-phase">
                                Phase
                                <select
                                  value={set.phaseTag ?? item.tag ?? 'working'}
                                  onChange={(event) =>
                                    updateTemplateSetPhaseTag(
                                      item.exerciseId,
                                      setIndex,
                                      event.target.value as TemplateExerciseTag,
                                    )
                                  }
                                >
                                  <option value="warmup">Warmup</option>
                                  <option value="working">Working</option>
                                  <option value="finisher">Finisher</option>
                                </select>
                              </label>
                            </div>
                            <div className="quick-fields quick-fields--template-set">
                              <label>
                                Reps
                                <input
                                  type="number"
                                  value={set.targetReps}
                                  onChange={(event) =>
                                    updateTemplateSet(
                                      item.exerciseId,
                                      setIndex,
                                      'targetReps',
                                      Number(event.target.value),
                                    )
                                  }
                                />
                              </label>
                              <label>
                                Poids (kg)
                                <input
                                  type="number"
                                  step="0.5"
                                  value={set.targetWeight}
                                  onChange={(event) =>
                                    updateTemplateSet(
                                      item.exerciseId,
                                      setIndex,
                                      'targetWeight',
                                      Number(event.target.value),
                                    )
                                  }
                                />
                              </label>
                              <label>
                                Repos (s)
                                <input
                                  type="number"
                                  value={set.restSeconds}
                                  onChange={(event) =>
                                    updateTemplateSet(
                                      item.exerciseId,
                                      setIndex,
                                      'restSeconds',
                                      Number(event.target.value),
                                    )
                                  }
                                />
                              </label>
                            </div>
                          </div>
                        ))}
                    </article>
                  )
                })}
              </div>

              <div className="actions-row editor-actions-row">
                <button className="primary" type="button" onClick={saveTemplate}>
                  {editingTemplateId ? 'Mettre a jour le template' : 'Enregistrer le template'}
                </button>
                <button className="button-compact" type="button" onClick={resetTemplateEditor}>
                  Annuler
                </button>
              </div>

              {isExercisePickerOpen && (
                <div
                  className="exercise-picker-overlay"
                  role="dialog"
                  aria-modal="true"
                  onClick={() => setIsExercisePickerOpen(false)}
                >
                  <section
                    className="exercise-picker-panel"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="card-head section-head section-head--tight">
                      <div>
                        <h3>Ajouter un exercice</h3>
                        <p className="panel-intro">Recherche par nom ou machine.</p>
                      </div>
                      <button
                        className="button-compact"
                        type="button"
                        onClick={() => setIsExercisePickerOpen(false)}
                      >
                        Fermer
                      </button>
                    </div>

                    <label>
                      Recherche exercice / machine
                      <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="ex: presse a cuisses"
                      />
                    </label>

                    <div className="catalog-grid exercise-picker-grid">
                      {filteredExercises.map((exercise) => {
                        const alreadySelected = selectedIds.has(exercise.id)

                        return (
                          <article className="exercise-card" key={exercise.id}>
                            <img src={exercise.imageUrl} alt={exercise.name} loading="lazy" />
                            <div>
                              <strong>{exercise.name}</strong>
                              <p>{exercise.aliases.join(' | ')}</p>
                            </div>
                            <button
                              className="button-compact"
                              type="button"
                              disabled={alreadySelected}
                              onClick={() => addExercise(exercise.id)}
                            >
                              {alreadySelected ? 'Ajoute' : 'Ajouter'}
                            </button>
                          </article>
                        )
                      })}
                    </div>
                  </section>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {activeView === 'history' && (
        <section className="panel">
          <div className="card-head section-head section-head--tight">
            <h2>Historique des seances</h2>
            <button className="button-compact" type="button" onClick={exportSessionHistoryCsv}>
              Export CSV
            </button>
          </div>
          <div className="history-range-controls" role="group" aria-label="Periode historique">
            <button
              type="button"
              className={historyRange === '7d' ? 'button-compact is-active' : 'button-compact'}
              onClick={() => setHistoryRange('7d')}
            >
              last 7 day
            </button>
            <button
              type="button"
              className={historyRange === '1m' ? 'button-compact is-active' : 'button-compact'}
              onClick={() => setHistoryRange('1m')}
            >
              last month
            </button>
            <button
              type="button"
              className={historyRange === '1y' ? 'button-compact is-active' : 'button-compact'}
              onClick={() => setHistoryRange('1y')}
            >
              last year
            </button>
            <button
              type="button"
              className={historyRange === 'all' ? 'button-compact is-active' : 'button-compact'}
              onClick={() => setHistoryRange('all')}
            >
              all time
            </button>
          </div>

          <article className="history-chart-card">
            <div className="card-head section-head section-head--tight">
              <h3>Entrainements sur la periode</h3>
              <span className="history-total-chip">{historyOverview.totalCount} seances</span>
            </div>

            <div className="history-bars" aria-label="Graphique du volume d'entrainement">
              {historyOverview.buckets.map((bucket) => {
                const barHeight =
                  historyOverview.maxBucketCount > 0
                    ? Math.max(8, Math.round((bucket.sessions.length / historyOverview.maxBucketCount) * 100))
                    : 8

                return (
                  <div className="history-bar-column" key={bucket.key} title={bucket.title}>
                    <span className="history-bar-count">{bucket.sessions.length}</span>
                    <div className="history-bar-track">
                      <div className="history-bar-fill" style={{ height: `${barHeight}%` }} />
                    </div>
                    <span className="history-bar-label">{bucket.label}</span>
                  </div>
                )
              })}
            </div>
          </article>

          <section className="history-list-wrapper">
            {historyOverview.totalCount === 0 && <p>Aucun entrainement sur la periode selectionnee.</p>}

            {historyOverview.buckets.map((bucket) => {
              if (bucket.sessions.length === 0) {
                return null
              }

              return (
                <div className="history-bucket-group" key={`group-${bucket.key}`}>
                  <h3>{bucket.title}</h3>
                  <div className="saved-list history-list">
                    {bucket.sessions.map((session) => {
                      const totalSets = session.exercises.reduce(
                        (count, exercise) => count + exercise.sets.length,
                        0,
                      )
                      const summary = [
                        formatSessionDuration(session.startedAt, session.endedAt),
                        `${session.exercises.length} ex`,
                        `${totalSets} sets`,
                      ].join(' • ')

                      return (
                        <article
                          className={`saved-card history-card ${
                            selectedSession?.id === session.id ? 'history-card--selected' : ''
                          }`}
                          key={session.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => selectSession(session.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              selectSession(session.id)
                            }
                          }}
                        >
                          <div className="history-card-topline">
                            <strong>{session.templateName}</strong>
                            <span>
                              {new Date(session.startedAt).toLocaleTimeString('fr-FR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <p className="history-card-summary">{summary}</p>
                        </article>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </section>

          {selectedSession && isHistoryDetailOpen && (
            <div
              className="history-detail-overlay"
              role="dialog"
              aria-modal="true"
              onClick={() => setIsHistoryDetailOpen(false)}
            >
              <section className="history-detail-popup" onClick={(event) => event.stopPropagation()}>
                <div className="card-head section-head section-head--tight">
                  <div>
                    <h3>{selectedSession.templateName}</h3>
                    <p>
                      {new Date(selectedSession.startedAt).toLocaleString('fr-FR')}
                      {selectedSession.endedAt
                        ? ` - ${new Date(selectedSession.endedAt).toLocaleString('fr-FR')}`
                        : ''}
                    </p>
                  </div>
                  <button className="button-compact" type="button" onClick={() => setIsHistoryDetailOpen(false)}>
                    Fermer
                  </button>
                </div>

                <div className="detail-exercises">
                  {selectedSession.exercises.map((exercise) => {
                    const exerciseInfo = EXERCISES.find((entry) => entry.id === exercise.exerciseId)

                    return (
                      <article className="detail-exercise" key={exercise.id}>
                        <div className="card-head">
                          <div>
                            <strong>{exerciseInfo?.name ?? exercise.exerciseId}</strong>
                            <p>{exerciseInfo?.category ?? 'General'}</p>
                          </div>
                        </div>
                        <div className="detail-sets">
                          {exercise.sets.map((set) => (
                            <div className="detail-set" key={set.id}>
                              <span>Set {set.setNumber}</span>
                              <span>{set.actualReps} reps</span>
                              <span>{set.actualWeight} kg</span>
                              <span>{set.restSeconds}s</span>
                              <span>
                                <span className={`tag-chip tag-chip--${set.phaseTag ?? 'working'}`}>
                                  {set.phaseTag ?? 'working'}
                                </span>
                                {set.effortTag ? (
                                  <span className={`tag-chip tag-chip--${set.effortTag}`}>
                                    {set.effortTag}
                                  </span>
                                ) : null}
                              </span>
                            </div>
                          ))}
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            </div>
          )}
        </section>
      )}
    </main>
  )
}

export default App