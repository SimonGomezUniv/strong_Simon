import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { DEFAULT_TEMPLATES } from './data/defaultTemplates'
import { EXERCISES } from './data/exercises'
import {
  type GoogleDriveBackupPayload,
  pullTemplatesAndSessionsFromGoogleDrive,
  syncTemplatesAndSessionsToGoogleDrive,
} from './google/googleDriveStorage'
import { revokeGoogleAccess, signInWithGoogle, type GoogleIdentityProfile } from './google/googleIdentity'
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

type ActiveView = 'templates' | 'session' | 'history' | 'stats'
type TemplateSetField = 'targetReps' | 'targetWeight' | 'restSeconds'
type SessionSetField = 'actualReps' | 'actualWeight'
type HistoryRange = '7d' | '1m' | '1y' | 'all' | 'custom'
type HistoryBucketRange = '7d' | '1m' | '1y' | 'all'
type AppThemeId = 'classic' | 'sunset' | 'forest' | 'graphite' | 'ocean' | 'rose'
type StatsMachineOption = {
  id: string
  label: string
}

type StatsWeightPoint = {
  key: string
  label: string
  machineId: string
  machineLabel: string
  weight: number
  date: string
}

type StatsUsagePoint = {
  machineId: string
  label: string
  imageUrl?: string
  sessions: number
  sets: number
  maxWeight: number
}

type StatsHeatmapDay = {
  date: string
  inRange: boolean
  sessions: number
  sets: number
  volume: number
}

type StatsWeeklyScore = {
  current: number
  previous: number
  delta: number
  frequencyScore: number
  volumeScore: number
  progressionScore: number
  streakDays: number
}

type StatsPersonalRecordPoint = {
  key: string
  sourceSessionId: string
  date: string
  machineId: string
  machineLabel: string
  weight: number
}

type StatsStagnationPoint = {
  machineId: string
  machineLabel: string
  sourceSessionId: string
  trend: 'progressing' | 'stagnating'
  recentMax: number
  previousMax: number
  recommendation: string
}

type StatsHeatmapMetric = 'sessions' | 'sets' | 'volume'

type StatsOverview = {
  hasCompletedSessions: boolean
  machineOptions: StatsMachineOption[]
  activeMachineId: string
  selectedMachineLabel: string
  rangeLabel: string
  totalSessions: number
  totalSets: number
  maxWeight: number
  usage: StatsUsagePoint[]
  filteredUsage: StatsUsagePoint[]
  weightPoints: StatsWeightPoint[]
  heatmapDaysByWeek: StatsHeatmapDay[][]
  heatmapPeak: number
  weeklyScore: StatsWeeklyScore
  personalRecords: StatsPersonalRecordPoint[]
  stagnationPoints: StatsStagnationPoint[]
}
type HistorySessionDraft = {
  sessionId: string
  name: string
  exercises: WorkoutSession['exercises']
}
type StatsWeightMode = 'max-per-session' | 'all-weights'
const TEMPLATE_COLLAPSE_STORAGE_KEY = 'strong-simon-template-collapse-state'
const APP_THEME_STORAGE_KEY = 'strong-simon-theme-v1'
const TEMPLATES_STORAGE_KEY = 'strong-simon-templates-v1'
const SESSION_HISTORY_STORAGE_KEY = 'strong-simon-session-history-v1'
const ACTIVE_SESSION_STORAGE_KEY = 'strong-simon-active-session-v1'
const APP_THEME_OPTIONS: Array<{ id: AppThemeId; label: string; description: string }> = [
  {
    id: 'classic',
    label: 'Classique Strong Simon',
    description: 'Le theme actuel de l\'application.',
  },
  {
    id: 'sunset',
    label: 'Sunset Energy',
    description: 'Ambiance chaude corail et sable pour une UI dynamique.',
  },
  {
    id: 'forest',
    label: 'Forest Iron',
    description: 'Palette verte et cuivree, douce pour les longues seances.',
  },
  {
    id: 'graphite',
    label: 'Graphite Pro',
    description: 'Style neutre pro, contraste net et lisibilite maximale.',
  },
  {
    id: 'ocean',
    label: 'Ocean Sprint',
    description: 'Bleu lagon et cyan pour un rendu frais et moderne.',
  },
  {
    id: 'rose',
    label: 'Rose Punch',
    description: 'Tons framboise et creme pour une identite plus expressive.',
  },
]

function isAppThemeId(value: string): value is AppThemeId {
  return APP_THEME_OPTIONS.some((option) => option.id === value)
}

function loadAppTheme(): AppThemeId {
  if (typeof window === 'undefined') {
    return 'classic'
  }

  const raw = window.localStorage.getItem(APP_THEME_STORAGE_KEY)
  if (!raw) {
    return 'classic'
  }

  return isAppThemeId(raw) ? raw : 'classic'
}

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function resolvePublicAssetUrl(path: string) {
  if (/^(https?:)?\/\//.test(path) || path.startsWith('data:')) {
    return path
  }

  const normalizedPath = path.startsWith('/') ? path.slice(1) : path
  return `${import.meta.env.BASE_URL}${normalizedPath}`
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

function cloneSessionExercises(exercises: WorkoutSession['exercises']): WorkoutSession['exercises'] {
  return exercises.map((exercise) => ({
    ...exercise,
    sets: exercise.sets.map((set) => ({ ...set })),
  }))
}

function cloneDefaultTemplates(): RoutineTemplate[] {
  return DEFAULT_TEMPLATES.map((template) => ({
    ...template,
    exercises: template.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => ({ ...set })),
    })),
  }))
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

function formatStatDateLabel(value: string) {
  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return 'Date inconnue'
  }

  return parsedDate.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
  })
}

function formatWeightValue(value: number) {
  return `${value.toLocaleString('fr-FR', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
    maximumFractionDigits: 1,
  })} kg`
}

function formatVolumeValue(value: number) {
  return `${Math.round(value).toLocaleString('fr-FR')} vol`
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function buildLinePath(points: StatsWeightPoint[], width: number, height: number) {
  if (points.length === 0) {
    return ''
  }

  if (points.length === 1) {
    const y = height / 2
    return `M 0 ${y} L ${width} ${y}`
  }

  const weights = points.map((point) => point.weight)
  const minWeight = Math.min(...weights)
  const maxWeight = Math.max(...weights)
  const span = maxWeight - minWeight || 1

  return points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width
      const normalized = (point.weight - minWeight) / span
      const y = height - normalized * height
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

function getLinePointPosition(points: StatsWeightPoint[], index: number, width: number, height: number) {
  if (points.length === 0) {
    return { x: 0, y: 0 }
  }

  if (points.length === 1) {
    return { x: width / 2, y: height / 2 }
  }

  const weights = points.map((point) => point.weight)
  const minWeight = Math.min(...weights)
  const maxWeight = Math.max(...weights)
  const span = maxWeight - minWeight || 1
  const x = (index / (points.length - 1)) * width
  const normalized = (points[index].weight - minWeight) / span
  const y = height - normalized * height

  return { x, y }
}

async function showWorkoutNotification(title: string, body: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return
  }

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready
      await registration.showNotification(title, {
        body,
        tag: 'strong-simon-rest',
        renotify: true,
        icon: resolvePublicAssetUrl('/logo_simon_strong.png'),
        badge: resolvePublicAssetUrl('/logo_simon_strong.png'),
      })
      return
    } catch {
      // Fallback to document-level notifications when service worker notification fails.
    }
  }

  new Notification(title, { body })
}

function triggerWorkoutAlert(title: string, body: string) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      const didVibrate = navigator.vibrate([350, 180, 350, 180, 350])
      if (!didVibrate) {
        navigator.vibrate(900)
      }
    } catch {
      // Ignore unsupported vibration errors and keep notification fallback.
    }
  }

  void showWorkoutNotification(title, body)
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

function formatDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateInputValue(value: string) {
  if (!value) {
    return null
  }

  const [year, month, day] = value.split('-').map(Number)

  if (!year || !month || !day) {
    return null
  }

  const parsedDate = new Date(year, month - 1, day)
  return Number.isNaN(parsedDate.getTime()) ? null : startOfDay(parsedDate)
}

function formatHistoryDateValue(value: string) {
  const parsedDate = parseDateInputValue(value)

  if (!parsedDate) {
    return 'date invalide'
  }

  return parsedDate.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function startOfWeekMonday(date: Date) {
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  return startOfDay(addDays(date, diff))
}

function getOldestSessionStartedAt(sessions: WorkoutSession[]) {
  let oldestTime = Number.POSITIVE_INFINITY
  let oldestStartedAt: string | undefined

  sessions.forEach((session) => {
    const sessionTime = new Date(session.startedAt).getTime()
    if (!Number.isFinite(sessionTime)) {
      return
    }

    if (sessionTime < oldestTime) {
      oldestTime = sessionTime
      oldestStartedAt = session.startedAt
    }
  })

  return oldestStartedAt
}

function getHistoryRangeBounds(range: HistoryBucketRange, now: Date, oldestStartedAt?: string) {
  if (range === '7d') {
    return {
      start: formatDateInputValue(startOfDay(addDays(now, -6))),
      end: formatDateInputValue(startOfDay(now)),
    }
  }

  if (range === '1m') {
    return {
      start: formatDateInputValue(startOfDay(addDays(now, -29))),
      end: formatDateInputValue(startOfDay(now)),
    }
  }

  if (range === '1y') {
    return {
      start: formatDateInputValue(startOfDay(addMonths(now, -11))),
      end: formatDateInputValue(startOfDay(now)),
    }
  }

  return {
    start: formatDateInputValue(startOfDay(oldestStartedAt ? new Date(oldestStartedAt) : now)),
    end: formatDateInputValue(startOfDay(now)),
  }
}

function getCustomHistoryBucketRange(start: Date, endExclusive: Date): HistoryBucketRange {
  const daySpan = Math.max(1, Math.round((endExclusive.getTime() - start.getTime()) / 86400000))

  if (daySpan <= 14) {
    return '7d'
  }

  if (daySpan <= 90) {
    return '1m'
  }

  if (daySpan <= 730) {
    return '1y'
  }

  return 'all'
}

function formatHistoryBucketLabel(range: HistoryBucketRange, start: Date) {
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

function formatHistoryBucketTitle(range: HistoryBucketRange, start: Date, end: Date) {
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
      exerciseLookup.get(normalizedExerciseName) ?? normalizedExerciseName.replace(/\s+/g, '-')

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

function getLocalDataUpdatedAt(
  templates: RoutineTemplate[],
  sessionHistory: WorkoutSession[],
  activeSession: WorkoutSession | null,
) {
  const candidates = [
    ...templates.map((template) => template.updatedAt),
    ...sessionHistory.map((session) => session.endedAt ?? session.startedAt),
  ]

  if (activeSession) {
    candidates.push(activeSession.startedAt)
  }

  if (candidates.length === 0) {
    return new Date(0).toISOString()
  }

  return candidates.sort().at(-1) ?? new Date(0).toISOString()
}

function toSafeTimestamp(value?: string) {
  if (!value) {
    return 0
  }

  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function getSessionMergeKey(session: WorkoutSession) {
  return `${session.startedAt}__${session.templateName}`
}

function getSessionSetCount(session: WorkoutSession) {
  return session.exercises.reduce((count, exercise) => count + exercise.sets.length, 0)
}

function pickMostRelevantSession(left: WorkoutSession, right: WorkoutSession) {
  const leftUpdatedAt = toSafeTimestamp(left.endedAt ?? left.startedAt)
  const rightUpdatedAt = toSafeTimestamp(right.endedAt ?? right.startedAt)

  if (leftUpdatedAt !== rightUpdatedAt) {
    return rightUpdatedAt > leftUpdatedAt ? right : left
  }

  const leftSetCount = getSessionSetCount(left)
  const rightSetCount = getSessionSetCount(right)

  if (leftSetCount !== rightSetCount) {
    return rightSetCount > leftSetCount ? right : left
  }

  return left
}

function mergeTemplatesById(localTemplates: RoutineTemplate[], remoteTemplates: RoutineTemplate[]) {
  const mergedById = new Map<string, RoutineTemplate>()

  localTemplates.forEach((template) => {
    mergedById.set(template.id, template)
  })

  remoteTemplates.forEach((remoteTemplate) => {
    const localTemplate = mergedById.get(remoteTemplate.id)

    if (!localTemplate) {
      mergedById.set(remoteTemplate.id, remoteTemplate)
      return
    }

    const localUpdatedAt = toSafeTimestamp(localTemplate.updatedAt)
    const remoteUpdatedAt = toSafeTimestamp(remoteTemplate.updatedAt)

    mergedById.set(remoteTemplate.id, remoteUpdatedAt > localUpdatedAt ? remoteTemplate : localTemplate)
  })

  return Array.from(mergedById.values()).sort(
    (left, right) => toSafeTimestamp(right.updatedAt) - toSafeTimestamp(left.updatedAt),
  )
}

function mergeSessionsByKey(localSessions: WorkoutSession[], remoteSessions: WorkoutSession[]) {
  const mergedByKey = new Map<string, WorkoutSession>()

  localSessions.forEach((session) => {
    mergedByKey.set(getSessionMergeKey(session), session)
  })

  remoteSessions.forEach((remoteSession) => {
    const key = getSessionMergeKey(remoteSession)
    const localSession = mergedByKey.get(key)

    if (!localSession) {
      mergedByKey.set(key, remoteSession)
      return
    }

    mergedByKey.set(key, pickMostRelevantSession(localSession, remoteSession))
  })

  return Array.from(mergedByKey.values()).sort(
    (left, right) => toSafeTimestamp(right.startedAt) - toSafeTimestamp(left.startedAt),
  )
}

function mergeActiveSession(
  localActiveSession: WorkoutSession | null,
  remoteActiveSession: WorkoutSession | null,
) {
  if (!localActiveSession && !remoteActiveSession) {
    return null
  }

  if (!localActiveSession) {
    return remoteActiveSession
  }

  if (!remoteActiveSession) {
    return localActiveSession
  }

  return pickMostRelevantSession(localActiveSession, remoteActiveSession)
}

type MergePreviewStats = {
  localCount: number
  remoteCount: number
  addedFromRemote: number
  replacedByRemote: number
  keptLocal: number
  mergedCount: number
}

type ActiveSessionMergePreview = {
  decision: 'none' | 'keep-local' | 'take-remote'
}

type GoogleDriveMergePreview = {
  remoteUpdatedAt: string
  localUpdatedAt: string
  templates: MergePreviewStats
  sessions: MergePreviewStats
  activeSession: ActiveSessionMergePreview
  blockedByTimestampGuard: boolean
}

function computeTemplateMergeStats(
  localTemplates: RoutineTemplate[],
  remoteTemplates: RoutineTemplate[],
): MergePreviewStats {
  const localById = new Map(localTemplates.map((template) => [template.id, template]))

  let addedFromRemote = 0
  let replacedByRemote = 0
  let keptLocal = 0

  remoteTemplates.forEach((remoteTemplate) => {
    const localTemplate = localById.get(remoteTemplate.id)

    if (!localTemplate) {
      addedFromRemote += 1
      return
    }

    if (toSafeTimestamp(remoteTemplate.updatedAt) > toSafeTimestamp(localTemplate.updatedAt)) {
      replacedByRemote += 1
      return
    }

    keptLocal += 1
  })

  const mergedCount = mergeTemplatesById(localTemplates, remoteTemplates).length

  return {
    localCount: localTemplates.length,
    remoteCount: remoteTemplates.length,
    addedFromRemote,
    replacedByRemote,
    keptLocal,
    mergedCount,
  }
}

function computeSessionMergeStats(
  localSessions: WorkoutSession[],
  remoteSessions: WorkoutSession[],
): MergePreviewStats {
  const localByKey = new Map(localSessions.map((session) => [getSessionMergeKey(session), session]))

  let addedFromRemote = 0
  let replacedByRemote = 0
  let keptLocal = 0

  remoteSessions.forEach((remoteSession) => {
    const localSession = localByKey.get(getSessionMergeKey(remoteSession))

    if (!localSession) {
      addedFromRemote += 1
      return
    }

    const preferred = pickMostRelevantSession(localSession, remoteSession)

    if (preferred === remoteSession) {
      replacedByRemote += 1
    } else {
      keptLocal += 1
    }
  })

  const mergedCount = mergeSessionsByKey(localSessions, remoteSessions).length

  return {
    localCount: localSessions.length,
    remoteCount: remoteSessions.length,
    addedFromRemote,
    replacedByRemote,
    keptLocal,
    mergedCount,
  }
}

function computeActiveSessionMergePreview(
  localActiveSession: WorkoutSession | null,
  remoteActiveSession: WorkoutSession | null,
): ActiveSessionMergePreview {
  if (!localActiveSession && !remoteActiveSession) {
    return { decision: 'none' }
  }

  if (!localActiveSession && remoteActiveSession) {
    return { decision: 'take-remote' }
  }

  if (localActiveSession && !remoteActiveSession) {
    return { decision: 'keep-local' }
  }

  const merged = mergeActiveSession(localActiveSession, remoteActiveSession)

  if (!merged || !localActiveSession || !remoteActiveSession) {
    return { decision: 'none' }
  }

  return merged === remoteActiveSession ? { decision: 'take-remote' } : { decision: 'keep-local' }
}

function computeGoogleDriveMergePreview(
  localTemplates: RoutineTemplate[],
  localSessionHistory: WorkoutSession[],
  localActiveSession: WorkoutSession | null,
  remoteBackup: GoogleDriveBackupPayload,
): GoogleDriveMergePreview {
  const localUpdatedAt = getLocalDataUpdatedAt(localTemplates, localSessionHistory, localActiveSession)
  const remoteUpdatedAt = remoteBackup.updatedAt

  return {
    remoteUpdatedAt,
    localUpdatedAt,
    templates: computeTemplateMergeStats(localTemplates, remoteBackup.templates),
    sessions: computeSessionMergeStats(localSessionHistory, remoteBackup.sessionHistory),
    activeSession: computeActiveSessionMergePreview(localActiveSession, remoteBackup.activeSession),
    blockedByTimestampGuard: new Date(remoteUpdatedAt).getTime() <= new Date(localUpdatedAt).getTime(),
  }
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

  if (view === 'stats') {
    return (
      <svg {...commonProps}>
        <path d="M4 19h16" />
        <path d="M7 15v-4" />
        <path d="M12 15V8" />
        <path d="M17 15v-6" />
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

function CloseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
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
  const initialHistoryBounds = getHistoryRangeBounds(
    '7d',
    new Date(),
    getOldestSessionStartedAt(initialHistory),
  )

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
  const [historyDateStart, setHistoryDateStart] = useState(initialHistoryBounds.start)
  const [historyDateEnd, setHistoryDateEnd] = useState(initialHistoryBounds.end)
  const [statsRange, setStatsRange] = useState<HistoryRange>('1m')
  const [statsDateStart, setStatsDateStart] = useState(() => getHistoryRangeBounds('1m', new Date(), getOldestSessionStartedAt(initialHistory)).start)
  const [statsDateEnd, setStatsDateEnd] = useState(() => getHistoryRangeBounds('1m', new Date(), getOldestSessionStartedAt(initialHistory)).end)
  const [isHistoryDetailOpen, setIsHistoryDetailOpen] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    initialHistory[0]?.id ?? null,
  )
  const [isExerciseImageBroken, setIsExerciseImageBroken] = useState(false)
  const [isResting, setIsResting] = useState(false)
  const [restRemaining, setRestRemaining] = useState(0)
  const [restEndsAtMs, setRestEndsAtMs] = useState<number | null>(null)
  const [notice, setNotice] = useState('')
  const [isRestDonePopupOpen, setIsRestDonePopupOpen] = useState(false)
  const [isWatchStartPopupOpen, setIsWatchStartPopupOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [appTheme, setAppTheme] = useState<AppThemeId>(() => loadAppTheme())
  const [statsWeightMode, setStatsWeightMode] = useState<StatsWeightMode>('max-per-session')
  const [statsHeatmapMetric, setStatsHeatmapMetric] = useState<StatsHeatmapMetric>('sessions')
  const [statsMachineFilter, setStatsMachineFilter] = useState('all')
  const [googleProfile, setGoogleProfile] = useState<GoogleIdentityProfile | null>(null)
  const [googleAccessToken, setGoogleAccessToken] = useState('')
  const [isGoogleAuthLoading, setIsGoogleAuthLoading] = useState(false)
  const [isGoogleDriveSyncLoading, setIsGoogleDriveSyncLoading] = useState(false)
  const [isGoogleDrivePullLoading, setIsGoogleDrivePullLoading] = useState(false)
  const [isGoogleDrivePreviewLoading, setIsGoogleDrivePreviewLoading] = useState(false)
  const [googleDrivePreview, setGoogleDrivePreview] = useState<{
    remoteBackup: GoogleDriveBackupPayload
    summary: GoogleDriveMergePreview
  } | null>(null)
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
  const [historySessionDraft, setHistorySessionDraft] = useState<HistorySessionDraft | null>(null)

  const selectedIds = useMemo(() => new Set(selected.map((item) => item.exerciseId)), [selected])
  const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim()

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
    const fallbackBounds = getHistoryRangeBounds('7d', now, getOldestSessionStartedAt(sessionHistory))
    const parsedStart = parseDateInputValue(historyDateStart) ?? parseDateInputValue(fallbackBounds.start)
    const parsedEnd = parseDateInputValue(historyDateEnd) ?? parseDateInputValue(fallbackBounds.end)
    const tentativeStart = parsedStart ?? startOfDay(addDays(now, -6))
    const tentativeEnd = parsedEnd ?? startOfDay(now)
    const rangeStart = tentativeStart.getTime() <= tentativeEnd.getTime() ? tentativeStart : tentativeEnd
    const rangeEnd = tentativeStart.getTime() <= tentativeEnd.getTime() ? tentativeEnd : tentativeStart
    const rangeEndExclusive = addDays(rangeEnd, 1)
    const bucketRange = historyRange === 'custom' ? getCustomHistoryBucketRange(rangeStart, rangeEndExclusive) : historyRange
    const historyInRange = sessionHistory
      .filter((session) => {
        const sessionTime = new Date(session.startedAt).getTime()
        return sessionTime >= rangeStart.getTime() && sessionTime < rangeEndExclusive.getTime()
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

    if (bucketRange === '7d') {
      let cursor = rangeStart

      while (cursor.getTime() < rangeEndExclusive.getTime()) {
        const start = cursor
        const end = addDays(start, 1)
        buckets.push({
          key: start.toISOString(),
          label: formatHistoryBucketLabel(bucketRange, start),
          title: formatHistoryBucketTitle(bucketRange, start, end),
          start,
          end,
          sessions: [],
        })

        cursor = end
      }
    } else if (bucketRange === '1m') {
      let cursor = startOfWeekMonday(rangeStart)

      while (cursor.getTime() < rangeEndExclusive.getTime()) {
        const start = cursor.getTime() < rangeStart.getTime() ? rangeStart : cursor
        const end = addDays(cursor, 7)
        const boundedEnd = end.getTime() > rangeEndExclusive.getTime() ? rangeEndExclusive : end

        buckets.push({
          key: start.toISOString(),
          label: formatHistoryBucketLabel(bucketRange, start),
          title: formatHistoryBucketTitle(bucketRange, start, boundedEnd),
          start,
          end: boundedEnd,
          sessions: [],
        })

        cursor = addDays(cursor, 7)
      }
    } else if (bucketRange === '1y') {
      let monthCursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1)

      while (monthCursor.getTime() < rangeEndExclusive.getTime()) {
        const start = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1)
        const end = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1)

        buckets.push({
          key: start.toISOString(),
          label: formatHistoryBucketLabel(bucketRange, start),
          title: formatHistoryBucketTitle(bucketRange, start, end),
          start,
          end,
          sessions: [],
        })

        monthCursor = end
      }
    } else {
      const fromYear = rangeStart.getFullYear()
      const toYear = rangeEnd.getFullYear()

      for (let year = fromYear; year <= toYear; year += 1) {
        const start = new Date(year, 0, 1)
        const end = addYears(start, 1)
        buckets.push({
          key: String(year),
          label: formatHistoryBucketLabel(bucketRange, start),
          title: formatHistoryBucketTitle(bucketRange, start, end),
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
      rangeLabel: `${formatHistoryDateValue(formatDateInputValue(rangeStart))} au ${formatHistoryDateValue(
        formatDateInputValue(rangeEnd),
      )}`,
    }
  }, [sessionHistory, historyRange, historyDateStart, historyDateEnd])

  const selectedSession = useMemo(() => {
    if (historyOverview.sessions.length === 0) {
      return null
    }

    return (
      historyOverview.sessions.find((session) => session.id === selectedSessionId) ??
      historyOverview.sessions[0]
    )
  }, [historyOverview.sessions, selectedSessionId])

  const isEditingSelectedSession =
    Boolean(selectedSession) && historySessionDraft?.sessionId === selectedSession?.id

  const statsOverview = useMemo<StatsOverview>(() => {
    const fallbackBounds = getHistoryRangeBounds('1m', new Date(), getOldestSessionStartedAt(sessionHistory))
    const parsedStart = parseDateInputValue(statsDateStart) ?? parseDateInputValue(fallbackBounds.start)
    const parsedEnd = parseDateInputValue(statsDateEnd) ?? parseDateInputValue(fallbackBounds.end)
    const tentativeStart = parsedStart ?? startOfDay(addDays(new Date(), -29))
    const tentativeEnd = parsedEnd ?? startOfDay(new Date())
    const rangeStart = tentativeStart.getTime() <= tentativeEnd.getTime() ? tentativeStart : tentativeEnd
    const rangeEnd = tentativeStart.getTime() <= tentativeEnd.getTime() ? tentativeEnd : tentativeStart
    const rangeEndExclusive = addDays(rangeEnd, 1)
    const completedSessions = sessionHistory
      .filter((session) => Boolean(session.endedAt))
      .filter((session) => {
        const sessionTime = new Date(session.startedAt).getTime()
        return sessionTime >= rangeStart.getTime() && sessionTime < rangeEndExclusive.getTime()
      })
      .sort((left, right) => new Date(left.startedAt).getTime() - new Date(right.startedAt).getTime())

    const exerciseLookup = createExerciseLookup()
    const exerciseById = new Map(EXERCISES.map((exercise) => [exercise.id, exercise]))
    const resolveExerciseId = (exerciseId: string) =>
      exerciseLookup.get(normalizeText(exerciseId)) ?? exerciseId

    const usageMap = new Map<string, StatsUsagePoint>()

    completedSessions.forEach((session) => {
      const machinesSeenInSession = new Set<string>()

      session.exercises.forEach((exercise) => {
        const machineId = resolveExerciseId(exercise.exerciseId)
        const exerciseInfo = exerciseById.get(machineId)
        const machineLabel = exerciseInfo?.name ?? 'Machine inconnue'
        let maxWeightForExerciseInSession = 0
        let countedSets = 0

        exercise.sets.forEach((set) => {
          if (set.actualWeight > 0) {
            countedSets += 1
            if (set.actualWeight > maxWeightForExerciseInSession) {
              maxWeightForExerciseInSession = set.actualWeight
            }
          }
        })

        if (countedSets === 0) {
          return
        }

        const currentUsage = usageMap.get(machineId) ?? {
          machineId,
          label: machineLabel,
          imageUrl: exerciseInfo?.imageUrl,
          sessions: 0,
          sets: 0,
          maxWeight: 0,
        }

        if (!currentUsage.imageUrl && exerciseInfo?.imageUrl) {
          currentUsage.imageUrl = exerciseInfo.imageUrl
        }

        currentUsage.sets += countedSets
        currentUsage.maxWeight = Math.max(currentUsage.maxWeight, maxWeightForExerciseInSession)

        if (!machinesSeenInSession.has(machineId)) {
          currentUsage.sessions += 1
          machinesSeenInSession.add(machineId)
        }

        usageMap.set(machineId, currentUsage)
      })
    })

    const usage = Array.from(usageMap.values()).sort((left, right) => {
      if (right.sessions !== left.sessions) {
        return right.sessions - left.sessions
      }

      if (right.sets !== left.sets) {
        return right.sets - left.sets
      }

      return left.label.localeCompare(right.label, 'fr')
    })

    const machineOptions = usage.map((entry) => ({ id: entry.machineId, label: entry.label }))
    const activeMachineId =
      statsMachineFilter !== 'all' && machineOptions.some((option) => option.id === statsMachineFilter)
        ? statsMachineFilter
        : 'all'
    const filteredUsage =
      activeMachineId === 'all' ? usage : usage.filter((entry) => entry.machineId === activeMachineId)
    const selectedMachineLabel =
      activeMachineId === 'all'
        ? 'Toutes les machines'
        : machineOptions.find((option) => option.id === activeMachineId)?.label ?? 'Machine inconnue'

    const heatmapDayMap = new Map<string, { sessions: number; sets: number; volume: number }>()

    completedSessions.forEach((session) => {
      const dayKey = formatDateInputValue(startOfDay(new Date(session.startedAt)))
      let sessionSets = 0
      let sessionVolume = 0

      session.exercises.forEach((exercise) => {
        const machineId = resolveExerciseId(exercise.exerciseId)

        if (activeMachineId !== 'all' && machineId !== activeMachineId) {
          return
        }

        exercise.sets.forEach((set) => {
          if (set.actualWeight <= 0) {
            return
          }

          sessionSets += 1
          sessionVolume += set.actualWeight * Math.max(0, set.actualReps)
        })
      })

      if (sessionSets === 0) {
        return
      }

      const current = heatmapDayMap.get(dayKey) ?? { sessions: 0, sets: 0, volume: 0 }
      current.sessions += 1
      current.sets += sessionSets
      current.volume += sessionVolume
      heatmapDayMap.set(dayKey, current)
    })

    const heatmapStart = startOfWeekMonday(rangeStart)
    const heatmapEnd = addDays(startOfWeekMonday(rangeEnd), 6)
    const heatmapDaysByWeek: StatsHeatmapDay[][] = []

    for (
      let weekStart = heatmapStart;
      weekStart.getTime() <= heatmapEnd.getTime();
      weekStart = addDays(weekStart, 7)
    ) {
      const week: StatsHeatmapDay[] = []

      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const dayDate = addDays(weekStart, dayIndex)
        const dayKey = formatDateInputValue(dayDate)
        const dayStats = heatmapDayMap.get(dayKey)
        const inRange = dayDate.getTime() >= rangeStart.getTime() && dayDate.getTime() <= rangeEnd.getTime()

        week.push({
          date: dayKey,
          inRange,
          sessions: dayStats?.sessions ?? 0,
          sets: dayStats?.sets ?? 0,
          volume: dayStats?.volume ?? 0,
        })
      }

      heatmapDaysByWeek.push(week)
    }

    const getHeatmapMetricValue = (day: StatsHeatmapDay) => {
      if (statsHeatmapMetric === 'sets') {
        return day.sets
      }

      if (statsHeatmapMetric === 'volume') {
        return day.volume
      }

      return day.sessions
    }

    const heatmapPeak = Math.max(
      1,
      ...heatmapDaysByWeek.flatMap((week) => week.map((day) => (day.inRange ? getHeatmapMetricValue(day) : 0))),
    )

    const sessionSnapshots = completedSessions.map((session) => {
      const weightedSets: Array<{
        machineId: string
        machineLabel: string
        weight: number
        reps: number
      }> = []

      session.exercises.forEach((exercise) => {
        const machineId = resolveExerciseId(exercise.exerciseId)

        if (activeMachineId !== 'all' && machineId !== activeMachineId) {
          return
        }

        const machineLabel = exerciseById.get(machineId)?.name ?? 'Machine inconnue'
        exercise.sets.forEach((set) => {
          if (set.actualWeight <= 0) {
            return
          }

          weightedSets.push({
            machineId,
            machineLabel,
            weight: set.actualWeight,
            reps: Math.max(0, set.actualReps),
          })
        })
      })

      return {
        session,
        weightedSets,
        setCount: weightedSets.length,
        maxWeight: weightedSets.length > 0 ? Math.max(...weightedSets.map((set) => set.weight)) : 0,
        volume: weightedSets.reduce((sum, set) => sum + set.weight * set.reps, 0),
      }
    })

    const collectWindowMetrics = (windowStart: Date, windowEndExclusive: Date) => {
      const matches = sessionSnapshots.filter(({ session, setCount }) => {
        if (setCount === 0) {
          return false
        }

        const sessionDate = new Date(session.startedAt)
        return sessionDate >= windowStart && sessionDate < windowEndExclusive
      })

      return {
        sessions: matches.length,
        sets: matches.reduce((sum, point) => sum + point.setCount, 0),
        volume: matches.reduce((sum, point) => sum + point.volume, 0),
        maxWeight: matches.length > 0 ? Math.max(...matches.map((point) => point.maxWeight)) : 0,
      }
    }

    const currentWindowEndExclusive = addDays(rangeEnd, 1)
    const currentWindowStart = addDays(currentWindowEndExclusive, -7)
    const previousWindowEndExclusive = currentWindowStart
    const previousWindowStart = addDays(previousWindowEndExclusive, -7)
    const olderWindowEndExclusive = previousWindowStart
    const olderWindowStart = addDays(olderWindowEndExclusive, -7)

    const currentWindowMetrics = collectWindowMetrics(currentWindowStart, currentWindowEndExclusive)
    const previousWindowMetrics = collectWindowMetrics(previousWindowStart, previousWindowEndExclusive)
    const olderWindowMetrics = collectWindowMetrics(olderWindowStart, olderWindowEndExclusive)

    const getCompositeScore = (
      current: { sessions: number; volume: number; maxWeight: number },
      baseline: { sessions: number; volume: number; maxWeight: number },
    ) => {
      const frequencyScore = clamp(current.sessions * 20, 0, 100)
      const volumeScore =
        baseline.volume > 0
          ? clamp(50 + ((current.volume - baseline.volume) / baseline.volume) * 50, 0, 100)
          : current.volume > 0
            ? 70
            : 0
      const progressionScore =
        baseline.maxWeight > 0
          ? clamp(50 + ((current.maxWeight - baseline.maxWeight) / baseline.maxWeight) * 100, 0, 100)
          : current.maxWeight > 0
            ? 70
            : 0

      return {
        score: Math.round(frequencyScore * 0.4 + volumeScore * 0.35 + progressionScore * 0.25),
        frequencyScore: Math.round(frequencyScore),
        volumeScore: Math.round(volumeScore),
        progressionScore: Math.round(progressionScore),
      }
    }

    const currentComposite = getCompositeScore(currentWindowMetrics, previousWindowMetrics)
    const previousComposite = getCompositeScore(previousWindowMetrics, olderWindowMetrics)

    let streakDays = 0
    for (
      let cursor = rangeEnd;
      cursor.getTime() >= rangeStart.getTime();
      cursor = addDays(cursor, -1)
    ) {
      const key = formatDateInputValue(cursor)
      const daySessions = heatmapDayMap.get(key)?.sessions ?? 0
      if (daySessions <= 0) {
        break
      }
      streakDays += 1
    }

    const weeklyScore: StatsWeeklyScore = {
      current: currentComposite.score,
      previous: previousComposite.score,
      delta: currentComposite.score - previousComposite.score,
      frequencyScore: currentComposite.frequencyScore,
      volumeScore: currentComposite.volumeScore,
      progressionScore: currentComposite.progressionScore,
      streakDays,
    }

    const personalRecordsRaw: StatsPersonalRecordPoint[] = []
    const machineBestWeight = new Map<string, number>()

    sessionSnapshots.forEach(({ session, weightedSets }) => {
      weightedSets.forEach((set, index) => {
        const previousBest = machineBestWeight.get(set.machineId) ?? 0
        if (set.weight > previousBest) {
          machineBestWeight.set(set.machineId, set.weight)
          personalRecordsRaw.push({
            key: `${session.id}-${set.machineId}-${index}`,
            sourceSessionId: session.id,
            date: session.startedAt,
            machineId: set.machineId,
            machineLabel: set.machineLabel,
            weight: set.weight,
          })
        }
      })
    })

    const personalRecords = personalRecordsRaw.slice(-8).reverse()

    const machineTimeline = new Map<
      string,
      Array<{ date: string; maxWeight: number; machineLabel: string; sessionId: string }>
    >()
    sessionSnapshots.forEach(({ session, weightedSets }) => {
      const sessionMaxByMachine = new Map<string, { maxWeight: number; machineLabel: string }>()

      weightedSets.forEach((set) => {
        const current = sessionMaxByMachine.get(set.machineId)
        if (!current || set.weight > current.maxWeight) {
          sessionMaxByMachine.set(set.machineId, {
            maxWeight: set.weight,
            machineLabel: set.machineLabel,
          })
        }
      })

      sessionMaxByMachine.forEach((point, machineId) => {
        const timeline = machineTimeline.get(machineId) ?? []
        timeline.push({
          date: session.startedAt,
          maxWeight: point.maxWeight,
          machineLabel: point.machineLabel,
          sessionId: session.id,
        })
        machineTimeline.set(machineId, timeline)
      })
    })

    const stagnationPoints = Array.from(machineTimeline.entries())
      .map(([machineId, timeline]) => {
        if (timeline.length < 4) {
          return null
        }

        const recentWindow = timeline.slice(-4)
        const previousWindow = timeline.slice(Math.max(0, timeline.length - 8), Math.max(0, timeline.length - 4))

        if (previousWindow.length === 0) {
          return null
        }

        const recentMax = Math.max(...recentWindow.map((point) => point.maxWeight))
        const previousMax = Math.max(...previousWindow.map((point) => point.maxWeight))
        const trend: StatsStagnationPoint['trend'] = recentMax >= previousMax * 1.02 ? 'progressing' : 'stagnating'

        return {
          machineId,
          machineLabel: timeline[timeline.length - 1]?.machineLabel ?? 'Machine inconnue',
          sourceSessionId: timeline[timeline.length - 1]?.sessionId ?? '',
          trend,
          recentMax,
          previousMax,
          recommendation:
            trend === 'stagnating'
              ? 'Essaie +1 rep sur les 2 premieres series ou un deload court avant de remonter.'
              : 'Continue le cycle actuel, progression reguliere detectee.',
        } satisfies StatsStagnationPoint
      })
      .filter((point): point is StatsStagnationPoint => point !== null)
      .sort((left, right) => {
        if (left.trend !== right.trend) {
          return left.trend === 'stagnating' ? -1 : 1
        }

        return right.recentMax - left.recentMax
      })
      .slice(0, 4)

    const weightPoints = completedSessions.flatMap((session) => {
      if (statsWeightMode === 'max-per-session') {
        let sessionMaxWeight = 0

        session.exercises.forEach((exercise) => {
          const machineId = resolveExerciseId(exercise.exerciseId)

          if (activeMachineId !== 'all' && machineId !== activeMachineId) {
            return
          }

          exercise.sets.forEach((set) => {
            if (set.actualWeight > sessionMaxWeight) {
              sessionMaxWeight = set.actualWeight
            }
          })
        })

        if (sessionMaxWeight <= 0) {
          return [] as StatsWeightPoint[]
        }

        return [
          {
            key: `${session.id}-${activeMachineId}-max`,
            label: formatStatDateLabel(session.startedAt),
            machineId: activeMachineId,
            machineLabel: selectedMachineLabel,
            weight: sessionMaxWeight,
            date: session.startedAt,
          },
        ] satisfies StatsWeightPoint[]
      }

      const points: StatsWeightPoint[] = []
      session.exercises.forEach((exercise) => {
        const machineId = resolveExerciseId(exercise.exerciseId)

        if (activeMachineId !== 'all' && machineId !== activeMachineId) {
          return
        }

        const machineLabel = exerciseById.get(machineId)?.name ?? 'Machine inconnue'

        exercise.sets.forEach((set) => {
          if (set.actualWeight <= 0) {
            return
          }

          points.push({
            key: `${session.id}-${exercise.id}-${set.id}`,
            label: formatStatDateLabel(session.startedAt),
            machineId,
            machineLabel,
            weight: set.actualWeight,
            date: set.completedAt ?? session.startedAt,
          })
        })
      })

      return points
    })

    return {
      hasCompletedSessions: completedSessions.length > 0,
      machineOptions,
      activeMachineId,
      selectedMachineLabel,
      rangeLabel: `${formatHistoryDateValue(formatDateInputValue(rangeStart))} au ${formatHistoryDateValue(
        formatDateInputValue(rangeEnd),
      )}`,
      totalSessions:
        activeMachineId === 'all'
          ? completedSessions.length
          : filteredUsage.reduce((sum, entry) => sum + entry.sessions, 0),
      totalSets: filteredUsage.reduce((sum, entry) => sum + entry.sets, 0),
      maxWeight: weightPoints.length > 0 ? Math.max(...weightPoints.map((point) => point.weight)) : 0,
      usage,
      filteredUsage,
      weightPoints,
      heatmapDaysByWeek,
      heatmapPeak,
      weeklyScore,
      personalRecords,
      stagnationPoints,
    }
  }, [
    sessionHistory,
    statsMachineFilter,
    statsDateEnd,
    statsDateStart,
    statsWeightMode,
    statsHeatmapMetric,
  ])

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
  const upcomingRestSeconds = Math.max(0, currentSet?.restSeconds ?? 0)
  const restWidgetLabel = isResting ? 'Chrono en cours' : 'Prochain chrono'
  const restWidgetValue = isResting ? restRemaining : upcomingRestSeconds
  const restWidgetHint = isResting
    ? 'Decompte en cours'
    : upcomingRestSeconds > 0
      ? 'Demarre au clic sur Valider'
      : 'Aucun repos configure pour ce set'

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
    if (historyRange === 'custom') {
      return
    }

    const nextBounds = getHistoryRangeBounds(
      historyRange,
      new Date(),
      getOldestSessionStartedAt(sessionHistory),
    )

    setHistoryDateStart(nextBounds.start)
    setHistoryDateEnd(nextBounds.end)
  }, [historyRange, sessionHistory])

  useEffect(() => {
    if (statsRange === 'custom') {
      return
    }

    const nextBounds = getHistoryRangeBounds(
      statsRange,
      new Date(),
      getOldestSessionStartedAt(sessionHistory),
    )

    setStatsDateStart(nextBounds.start)
    setStatsDateEnd(nextBounds.end)
  }, [statsRange, sessionHistory])

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
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(APP_THEME_STORAGE_KEY, appTheme)
  }, [appTheme])

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    document.body.dataset.theme = appTheme
  }, [appTheme])

  useEffect(() => {
    if (statsMachineFilter === 'all') {
      return
    }

    if (!statsOverview.machineOptions.some((option) => option.id === statsMachineFilter)) {
      setStatsMachineFilter('all')
    }
  }, [statsMachineFilter, statsOverview.machineOptions])

  useEffect(() => {
    if (!isResting || !restEndsAtMs) {
      return undefined
    }

    let didComplete = false

    const syncRemainingTime = () => {
      if (didComplete) {
        return
      }

      const remainingSeconds = Math.max(0, Math.ceil((restEndsAtMs - Date.now()) / 1000))

      setRestRemaining(remainingSeconds)

      if (remainingSeconds <= 0) {
        didComplete = true
        setIsResting(false)
        setRestEndsAtMs(null)
        setNotice('Repos terminé.')
        setIsRestDonePopupOpen(true)
        triggerWorkoutAlert('Strong Simon', 'Le temps de repos est terminé.')
      }
    }

    syncRemainingTime()

    const timer = window.setInterval(syncRemainingTime, 250)
    const handleWindowFocus = () => syncRemainingTime()
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        syncRemainingTime()
      }
    }

    window.addEventListener('focus', handleWindowFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isResting, restEndsAtMs])

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

  useEffect(() => {
    if (!historySessionDraft) {
      return
    }

    if (!sessionHistory.some((session) => session.id === historySessionDraft.sessionId)) {
      setHistorySessionDraft(null)
    }
  }, [historySessionDraft, sessionHistory])

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

  function applyHistoryPreset(range: HistoryBucketRange) {
    const nextBounds = getHistoryRangeBounds(range, new Date(), getOldestSessionStartedAt(sessionHistory))
    setHistoryRange(range)
    setHistoryDateStart(nextBounds.start)
    setHistoryDateEnd(nextBounds.end)
  }

  function updateHistoryDateBoundary(boundary: 'start' | 'end', value: string) {
    setHistoryRange('custom')

    if (boundary === 'start') {
      setHistoryDateStart(value)
      return
    }

    setHistoryDateEnd(value)
  }

  function applyStatsPreset(range: HistoryBucketRange) {
    const nextBounds = getHistoryRangeBounds(range, new Date(), getOldestSessionStartedAt(sessionHistory))
    setStatsRange(range)
    setStatsDateStart(nextBounds.start)
    setStatsDateEnd(nextBounds.end)
  }

  function updateStatsDateBoundary(boundary: 'start' | 'end', value: string) {
    setStatsRange('custom')

    if (boundary === 'start') {
      setStatsDateStart(value)
      return
    }

    setStatsDateEnd(value)
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
    setRestEndsAtMs(null)
    setIsRestDonePopupOpen(false)
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
    const restDuration = targetSet.restSeconds

    // Validation is idempotent: repeated taps should not unvalidate a set.
    if (targetSet.completedAt) {
      return
    }

    if (isResting) {
      setIsResting(false)
      setRestRemaining(0)
      setRestEndsAtMs(null)
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

              return {
                ...set,
                completedAt: new Date().toISOString(),
              }
            }),
          }
        }),
      }
    })

    if (restDuration > 0) {
      setRestRemaining(restDuration)
      setRestEndsAtMs(Date.now() + restDuration * 1000)
      setIsResting(true)
      setIsRestDonePopupOpen(false)
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
    triggerWorkoutAlert('Strong Simon', 'Ta séance est terminée et enregistrée.')
    setActiveSetByExerciseId({})
    setCurrentExerciseIndex(0)
    setIsResting(false)
    setRestRemaining(0)
    setRestEndsAtMs(null)
    setIsRestDonePopupOpen(false)
    showNotice('Seance terminee et enregistree.')
  }

  function selectSession(sessionId: string) {
    setHistorySessionDraft((previous) => (previous?.sessionId === sessionId ? previous : null))
    setSelectedSessionId(sessionId)
    setActiveView('history')
    setIsHistoryDetailOpen(true)
  }

  function startHistorySessionEdition(session: WorkoutSession) {
    setHistorySessionDraft({
      sessionId: session.id,
      name: session.templateName,
      exercises: cloneSessionExercises(session.exercises),
    })
  }

  function cancelHistorySessionEdition() {
    setHistorySessionDraft(null)
  }

  function updateHistoryDraftName(value: string) {
    setHistorySessionDraft((previous) => {
      if (!previous) {
        return previous
      }

      return {
        ...previous,
        name: value,
      }
    })
  }

  function updateHistoryDraftSet(
    exerciseId: string,
    setId: string,
    field: SessionSetField,
    value: number,
  ) {
    setHistorySessionDraft((previous) => {
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

  function addHistoryDraftSet(exerciseId: string) {
    setHistorySessionDraft((previous) => {
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
          return {
            ...exercise,
            sets: [
              ...exercise.sets,
              {
                ...createFollowupSessionSet(lastSet),
                setNumber: exercise.sets.length + 1,
              },
            ],
          }
        }),
      }
    })
  }

  function removeHistoryDraftSet(exerciseId: string, setId: string) {
    setHistorySessionDraft((previous) => {
      if (!previous) {
        return previous
      }

      return {
        ...previous,
        exercises: previous.exercises.map((exercise) => {
          if (exercise.id !== exerciseId) {
            return exercise
          }

          const nextSets = exercise.sets
            .filter((set) => set.id !== setId)
            .map((set, index) => ({
              ...set,
              setNumber: index + 1,
            }))

          return {
            ...exercise,
            sets: nextSets,
          }
        }),
      }
    })
  }

  function saveHistorySessionEdition() {
    if (!historySessionDraft) {
      return
    }

    const nextName = historySessionDraft.name.trim()

    if (!nextName) {
      showNotice('Le nom de la seance est obligatoire.')
      return
    }

    const normalizedExercises = historySessionDraft.exercises
      .map((exercise) => ({
        ...exercise,
        sets: exercise.sets.map((set, index) => ({
          ...set,
          setNumber: index + 1,
          actualReps: Math.max(0, Math.round(set.actualReps)),
          actualWeight: Math.max(0, set.actualWeight),
        })),
      }))
      .filter((exercise) => exercise.sets.length > 0)

    if (normalizedExercises.length === 0) {
      showNotice('Ajoute au moins une serie pour enregistrer la seance.')
      return
    }

    setSessionHistory((previous) =>
      previous.map((session) => {
        if (session.id !== historySessionDraft.sessionId) {
          return session
        }

        return {
          ...session,
          templateName: nextName,
          exercises: normalizedExercises,
        }
      }),
    )

    setHistorySessionDraft(null)
    showNotice('Seance historique mise a jour.')
  }

  function reloadDefaultTemplates(mode: 'replace' | 'merge') {
    const defaultTemplates = cloneDefaultTemplates()

    if (mode === 'replace') {
      const shouldContinue = window.confirm(
        'Remplacer les templates va ecraser tes templates actuels. Continuer ?',
      )

      if (!shouldContinue) {
        return
      }

      setTemplates(defaultTemplates)
      showNotice(`${defaultTemplates.length} templates par defaut recharges (remplacement).`)
      return
    }

    let addedCount = 0
    setTemplates((previous) => {
      const existingIds = new Set(previous.map((template) => template.id))
      const missingDefaults = defaultTemplates.filter((template) => !existingIds.has(template.id))
      addedCount = missingDefaults.length
      return [...previous, ...missingDefaults]
    })

    if (addedCount === 0) {
      showNotice('Aucun template par defaut ajoute: tous les IDs existent deja.')
      return
    }

    showNotice(`${addedCount} template(s) par defaut ajoute(s) en fusion.`)
  }

  function purgeAllLocalData() {
    const shouldContinue = window.confirm(
      'Cette action supprime toutes les donnees locales (templates, seances, preferences). Continuer ?',
    )

    if (!shouldContinue) {
      return
    }

    if (typeof window !== 'undefined') {
      ;[
        TEMPLATES_STORAGE_KEY,
        SESSION_HISTORY_STORAGE_KEY,
        ACTIVE_SESSION_STORAGE_KEY,
        TEMPLATE_COLLAPSE_STORAGE_KEY,
        APP_THEME_STORAGE_KEY,
      ].forEach((storageKey) => window.localStorage.removeItem(storageKey))
    }

    setTemplates([])
    setSessionHistory([])
    setActiveSession(null)
    setSelectedSessionId(null)
    setHistorySessionDraft(null)
    setActiveSetByExerciseId({})
    setCurrentExerciseIndex(0)
    setIsHistoryDetailOpen(false)
    setIsTemplateEditorOpen(false)
    setIsExercisePickerOpen(false)
    setIsFinishRecapOpen(false)
    setIsResting(false)
    setRestRemaining(0)
    setRestEndsAtMs(null)
    setIsRestDonePopupOpen(false)
    setIsWatchStartPopupOpen(false)
    setStatsMachineFilter('all')
    setStatsWeightMode('max-per-session')
    setStatsHeatmapMetric('sessions')
    setGoogleDrivePreview(null)
    setGoogleAccessToken('')
    setGoogleProfile(null)
    setAppTheme('classic')
    setActiveView('templates')
    setIsSettingsOpen(false)

    showNotice('Toutes les donnees locales ont ete supprimees.')
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

  async function connectWithGoogle() {
    if (!googleClientId) {
      showNotice('Google Client ID manquant. Configure VITE_GOOGLE_CLIENT_ID dans .env.local.')
      return
    }

    setIsGoogleAuthLoading(true)

    try {
      const result = await signInWithGoogle(googleClientId)
      setGoogleAccessToken(result.accessToken)
      setGoogleProfile(result.profile)

      if (result.profile.givenName || result.profile.familyName) {
        showNotice(`Connecte avec Google: ${result.profile.givenName} ${result.profile.familyName}`.trim())
      } else {
        showNotice(`Connecte avec Google: ${result.profile.fullName || 'profil recupere'}.`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connexion Google impossible.'
      showNotice(message)
    } finally {
      setIsGoogleAuthLoading(false)
    }
  }

  async function disconnectGoogle() {
    setIsGoogleAuthLoading(true)

    try {
      await revokeGoogleAccess(googleAccessToken)
    } catch {
      // Keep local state cleanup even if revoke call fails.
    } finally {
      setGoogleAccessToken('')
      setGoogleProfile(null)
      setGoogleDrivePreview(null)
      setIsGoogleAuthLoading(false)
    }

    showNotice('Compte Google deconnecte.')
  }

  async function syncDataToGoogleDrive() {
    if (!googleAccessToken) {
      showNotice('Connecte ton compte Google avant la synchronisation Drive.')
      return
    }

    setIsGoogleDriveSyncLoading(true)

    try {
      const result = await syncTemplatesAndSessionsToGoogleDrive(googleAccessToken, {
        templates,
        sessionHistory,
        activeSession,
      })
      showNotice(`Synchronisation Drive terminee (${result.updatedCount} fichiers, ${result.updatedAt}).`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Synchronisation Drive impossible.'
      showNotice(message)
    } finally {
      setIsGoogleDriveSyncLoading(false)
    }
  }

  async function importDataFromGoogleDrive(options?: {
    forceReplace?: boolean
    remoteBackup?: GoogleDriveBackupPayload
  }) {
    if (!googleAccessToken) {
      showNotice('Connecte ton compte Google avant l\'import Drive.')
      return
    }

    const forceReplace = Boolean(options?.forceReplace)

    if (forceReplace) {
      const shouldContinue = window.confirm(
        'Forcer l\'import va remplacer toutes les donnees locales par la sauvegarde Drive. Continuer ?',
      )

      if (!shouldContinue) {
        return
      }
    }

    setIsGoogleDrivePullLoading(true)

    try {
      const remoteBackup =
        options?.remoteBackup ?? (await pullTemplatesAndSessionsFromGoogleDrive(googleAccessToken))

      if (!remoteBackup) {
        showNotice('Aucune sauvegarde Drive trouvee.')
        return
      }

      const localUpdatedAt = getLocalDataUpdatedAt(templates, sessionHistory, activeSession)

      if (!forceReplace && new Date(remoteBackup.updatedAt).getTime() <= new Date(localUpdatedAt).getTime()) {
        showNotice('Conflit evite: les donnees locales sont plus recentes ou identiques.')
        return
      }

      const mergedTemplates = forceReplace
        ? remoteBackup.templates
        : mergeTemplatesById(templates, remoteBackup.templates)

      const mergedSessions = forceReplace
        ? remoteBackup.sessionHistory
        : mergeSessionsByKey(sessionHistory, remoteBackup.sessionHistory)

      const mergedActiveSession = forceReplace
        ? remoteBackup.activeSession
        : mergeActiveSession(activeSession, remoteBackup.activeSession)

      setTemplates(mergedTemplates)
      setSessionHistory(mergedSessions)
      setActiveSession(mergedActiveSession)
      setSelectedSessionId(mergedSessions[0]?.id ?? null)
      setCurrentExerciseIndex(0)
      setActiveSetByExerciseId({})
      if (mergedActiveSession) {
        setActiveView('session')
      }

      if (forceReplace) {
        showNotice(`Import Drive force termine. Donnees remplacees (${remoteBackup.updatedAt}).`)
      } else {
        showNotice(`Import Drive fusionne termine (${remoteBackup.updatedAt}).`)
      }

      setGoogleDrivePreview(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import Drive impossible.'
      showNotice(message)
    } finally {
      setIsGoogleDrivePullLoading(false)
    }
  }

  async function previewGoogleDriveImport() {
    if (!googleAccessToken) {
      showNotice('Connecte ton compte Google avant la previsualisation Drive.')
      return
    }

    setIsGoogleDrivePreviewLoading(true)

    try {
      const remoteBackup = await pullTemplatesAndSessionsFromGoogleDrive(googleAccessToken)

      if (!remoteBackup) {
        setGoogleDrivePreview(null)
        showNotice('Aucune sauvegarde Drive trouvee.')
        return
      }

      const summary = computeGoogleDriveMergePreview(
        templates,
        sessionHistory,
        activeSession,
        remoteBackup,
      )

      setGoogleDrivePreview({ remoteBackup, summary })
      showNotice('Previsualisation Drive prete. Verifie les impacts avant application.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Previsualisation Drive impossible.'
      showNotice(message)
    } finally {
      setIsGoogleDrivePreviewLoading(false)
    }
  }

  function renderActiveSessionDecision(decision: ActiveSessionMergePreview['decision']) {
    if (decision === 'take-remote') {
      return 'Remote remplace locale'
    }

    if (decision === 'keep-local') {
      return 'Locale conservee'
    }

    return 'Aucune seance active'
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

  function openStatsSourceSession(sessionId: string) {
    if (!sessionId) {
      return
    }

    const exists = sessionHistory.some((session) => session.id === sessionId)
    if (!exists) {
      showNotice('Seance source introuvable dans l historique local.')
      return
    }

    selectSession(sessionId)
  }

  function exportStatsInsightsCsv() {
    const rows = [
      [
        'section',
        'metric',
        'machine',
        'value',
        'delta',
        'date',
        'trend',
        'recommendation',
        'source_session_id',
      ],
      [
        'weekly_score',
        'current',
        'all',
        String(statsOverview.weeklyScore.current),
        String(statsOverview.weeklyScore.delta),
        '',
        '',
        '',
        '',
      ],
      [
        'weekly_score',
        'frequency',
        'all',
        String(statsOverview.weeklyScore.frequencyScore),
        '',
        '',
        '',
        '',
        '',
      ],
      [
        'weekly_score',
        'volume',
        'all',
        String(statsOverview.weeklyScore.volumeScore),
        '',
        '',
        '',
        '',
        '',
      ],
      [
        'weekly_score',
        'progression',
        'all',
        String(statsOverview.weeklyScore.progressionScore),
        '',
        '',
        '',
        '',
        '',
      ],
      ...statsOverview.personalRecords.map((record) => [
        'personal_record',
        'max_weight',
        record.machineLabel,
        String(record.weight),
        '',
        record.date,
        '',
        '',
        record.sourceSessionId,
      ]),
      ...statsOverview.stagnationPoints.map((point) => [
        'stagnation',
        'recent_max',
        point.machineLabel,
        String(point.recentMax),
        String(point.recentMax - point.previousMax),
        '',
        point.trend,
        point.recommendation,
        point.sourceSessionId,
      ]),
    ]

    const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'strong-simon-stats-insights.csv'
    link.click()
    URL.revokeObjectURL(url)
    showNotice('Export insights stats genere.')
  }

  return (
    <main className="app-shell">
      <header className="header">
        <img
          className="header-logo"
          src={resolvePublicAssetUrl('logo_simon_strong.png')}
          alt="Strong Simon"
        />
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
        </div>
      </header>

      {notice && (
        <p className="notice">
          <span>{notice}</span>
        </p>
      )}

      {isRestDonePopupOpen && (
        <div
          className="rest-done-popup-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setIsRestDonePopupOpen(false)}
        >
          <section className="rest-done-popup-panel" onClick={(event) => event.stopPropagation()}>
            <div className="card-head section-head section-head--tight popup-head">
              <h3>Repos termine</h3>
              <button
                className="popup-close-button"
                type="button"
                onClick={() => setIsRestDonePopupOpen(false)}
                aria-label="Fermer"
                title="Fermer"
              >
                <CloseIcon />
              </button>
            </div>
            <p>Tu peux reprendre la serie suivante.</p>
          </section>
        </div>
      )}

      {isWatchStartPopupOpen && (
        <div
          className="watch-start-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setIsWatchStartPopupOpen(false)}
        >
          <section className="watch-start-panel" onClick={(event) => event.stopPropagation()}>
            <div className="card-head section-head section-head--tight popup-head">
              <div className="watch-start-title">
                <WatchIcon />
                <h3>Seance demarree</h3>
              </div>
              <button
                className="popup-close-button"
                type="button"
                onClick={() => setIsWatchStartPopupOpen(false)}
                aria-label="Fermer"
                title="Fermer"
              >
                <CloseIcon />
              </button>
            </div>
            <p>Pensez a lancer votre Apple Watch.</p>
          </section>
        </div>
      )}

      {isSettingsOpen && (
        <div className="settings-overlay" role="dialog" aria-modal="true" onClick={() => setIsSettingsOpen(false)}>
          <section className="settings-panel" onClick={(event) => event.stopPropagation()}>
            <div className="card-head section-head section-head--tight popup-head popup-head--flush">
              <h3>Settings</h3>
              <button
                className="popup-close-button"
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                aria-label="Fermer"
                title="Fermer"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="settings-block">
              <strong>Theme</strong>
              <p className="panel-intro">
                Conserve le theme historique ou choisis une ambiance differente.
              </p>
              <label>
                Theme actif
                <select
                  value={appTheme}
                  onChange={(event) => {
                    const nextTheme = event.target.value
                    if (isAppThemeId(nextTheme)) {
                      setAppTheme(nextTheme)
                    }
                  }}
                >
                  {APP_THEME_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="settings-theme-grid">
                {APP_THEME_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={
                      option.id === appTheme
                        ? 'theme-preview-chip is-active'
                        : 'theme-preview-chip'
                    }
                    onClick={() => setAppTheme(option.id)}
                  >
                    <span className={`theme-preview-swatch theme-preview-swatch--${option.id}`} aria-hidden="true" />
                    <span className="theme-preview-copy">
                      <strong>{option.label}</strong>
                      <span>{option.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="settings-block">
              <strong>Statistiques</strong>
              <p className="panel-intro">
                Ouvre un tableau de bord avec l'evolution des poids et les machines les plus utilisees.
              </p>
              <button
                type="button"
                className="button-compact"
                onClick={() => {
                  setActiveView('stats')
                  setIsSettingsOpen(false)
                }}
              >
                Voir les statistiques
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

            <div className="settings-block">
              <strong>Templates par defaut</strong>
              <p className="panel-intro">
                Recharge les templates seed de l'application en mode fusion ou remplacement.
              </p>
              <div className="settings-actions-row">
                <button
                  type="button"
                  className="button-compact"
                  onClick={() => reloadDefaultTemplates('merge')}
                >
                  Recharger templates par defaut (fusion)
                </button>
                <button
                  type="button"
                  className="button-compact button-compact--warning"
                  onClick={() => reloadDefaultTemplates('replace')}
                >
                  Recharger templates par defaut (remplacer)
                </button>
              </div>
            </div>

            <div className="settings-block">
              <strong>Donnees locales</strong>
              <p className="panel-intro">
                Supprime tous les templates, seances et preferences stockes localement sur cet appareil.
              </p>
              <button
                type="button"
                className="button-compact button-compact--danger"
                onClick={purgeAllLocalData}
              >
                Supprimer toutes les donnees locales
              </button>
            </div>

            <div className="settings-block">
              <strong>Compte Google</strong>
              <p className="panel-intro">
                Connecte ton compte Google pour recuperer nom et prenom puis synchroniser templates/seances.
              </p>

              {googleProfile ? (
                <div className="google-user-card">
                  <span className="google-user-card__name">
                    {googleProfile.givenName || googleProfile.familyName
                      ? `${googleProfile.givenName} ${googleProfile.familyName}`.trim()
                      : googleProfile.fullName}
                  </span>
                  {googleProfile.email && <span className="google-user-card__email">{googleProfile.email}</span>}
                </div>
              ) : (
                <p className="google-disconnected-hint">Aucun compte Google connecte.</p>
              )}

              {!googleClientId && (
                <p className="google-config-warning">
                  Variable manquante: VITE_GOOGLE_CLIENT_ID dans .env.local.
                </p>
              )}

              <div className="settings-actions-row">
                <button
                  type="button"
                  className="button-compact"
                  onClick={connectWithGoogle}
                  disabled={isGoogleAuthLoading || !googleClientId}
                >
                  {isGoogleAuthLoading ? 'Connexion...' : 'Se connecter avec Google'}
                </button>

                <button
                  type="button"
                  className="button-compact"
                  onClick={syncDataToGoogleDrive}
                  disabled={!googleAccessToken || isGoogleDriveSyncLoading}
                >
                  {isGoogleDriveSyncLoading ? 'Sync en cours...' : 'Synchroniser vers Google Drive'}
                </button>

                <button
                  type="button"
                  className="button-compact"
                  onClick={previewGoogleDriveImport}
                  disabled={!googleAccessToken || isGoogleDrivePreviewLoading || isGoogleDrivePullLoading}
                >
                  {isGoogleDrivePreviewLoading ? 'Analyse en cours...' : 'Previsualiser import'}
                </button>

                <button
                  type="button"
                  className="button-compact"
                  onClick={() => {
                    void importDataFromGoogleDrive()
                  }}
                  disabled={!googleAccessToken || isGoogleDrivePullLoading}
                >
                  {isGoogleDrivePullLoading ? 'Import en cours...' : 'Importer (fusion intelligente)'}
                </button>

                <button
                  type="button"
                  className="button-compact button-compact--warning"
                  onClick={() => {
                    void importDataFromGoogleDrive({ forceReplace: true })
                  }}
                  disabled={!googleAccessToken || isGoogleDrivePullLoading}
                >
                  {isGoogleDrivePullLoading ? 'Import en cours...' : 'Forcer import (remplacer local)'}
                </button>

                {googleDrivePreview && (
                  <article className="google-merge-preview">
                    <strong>Previsualisation merge Drive</strong>
                    <p className="google-merge-preview__meta">
                      Local {googleDrivePreview.summary.localUpdatedAt} | Remote {googleDrivePreview.summary.remoteUpdatedAt}
                    </p>

                    <div className="google-merge-preview__grid">
                      <div>
                        <h4>Templates</h4>
                        <p>Local: {googleDrivePreview.summary.templates.localCount}</p>
                        <p>Remote: {googleDrivePreview.summary.templates.remoteCount}</p>
                        <p>Ajouts remote: {googleDrivePreview.summary.templates.addedFromRemote}</p>
                        <p>Remplacements remote: {googleDrivePreview.summary.templates.replacedByRemote}</p>
                        <p>Locaux conserves: {googleDrivePreview.summary.templates.keptLocal}</p>
                        <p>Total apres merge: {googleDrivePreview.summary.templates.mergedCount}</p>
                      </div>

                      <div>
                        <h4>Seances</h4>
                        <p>Local: {googleDrivePreview.summary.sessions.localCount}</p>
                        <p>Remote: {googleDrivePreview.summary.sessions.remoteCount}</p>
                        <p>Ajouts remote: {googleDrivePreview.summary.sessions.addedFromRemote}</p>
                        <p>Remplacements remote: {googleDrivePreview.summary.sessions.replacedByRemote}</p>
                        <p>Locales conservees: {googleDrivePreview.summary.sessions.keptLocal}</p>
                        <p>Total apres merge: {googleDrivePreview.summary.sessions.mergedCount}</p>
                      </div>

                      <div>
                        <h4>Seance active</h4>
                        <p>{renderActiveSessionDecision(googleDrivePreview.summary.activeSession.decision)}</p>
                      </div>
                    </div>

                    {googleDrivePreview.summary.blockedByTimestampGuard && (
                      <p className="google-merge-preview__warning">
                        Garde active: remote pas plus recent. Utilise Forcer import pour override.
                      </p>
                    )}

                    <div className="settings-actions-row">
                      <button
                        type="button"
                        className="button-compact"
                        onClick={() => {
                          void importDataFromGoogleDrive({ remoteBackup: googleDrivePreview.remoteBackup })
                        }}
                        disabled={isGoogleDrivePullLoading}
                      >
                        {isGoogleDrivePullLoading ? 'Import en cours...' : 'Appliquer fusion previsualisee'}
                      </button>

                      <button
                        type="button"
                        className="button-compact button-compact--warning"
                        onClick={() => {
                          void importDataFromGoogleDrive({
                            forceReplace: true,
                            remoteBackup: googleDrivePreview.remoteBackup,
                          })
                        }}
                        disabled={isGoogleDrivePullLoading}
                      >
                        {isGoogleDrivePullLoading ? 'Import en cours...' : 'Appliquer remplacement complet'}
                      </button>

                      <button
                        type="button"
                        className="button-compact"
                        onClick={() => setGoogleDrivePreview(null)}
                        disabled={isGoogleDrivePullLoading}
                      >
                        Fermer previsualisation
                      </button>
                    </div>
                  </article>
                )}

                <button
                  type="button"
                  className="button-compact button-compact--danger"
                  onClick={disconnectGoogle}
                  disabled={!googleAccessToken || isGoogleAuthLoading}
                >
                  Deconnecter Google
                </button>
              </div>
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
        <button
          type="button"
          className={activeView === 'stats' ? 'top-menu__button is-active' : 'top-menu__button'}
          onClick={() => setActiveView('stats')}
        >
          <MenuIcon view="stats" />
          <span>Stats</span>
        </button>
      </nav>

      {activeView === 'stats' && (
        <section className="panel stats-page">
          <div className="card-head section-head section-head--tight">
            <div>
              <h2>Statistiques</h2>
              <p className="panel-intro">Analyse des seances terminees et des charges saisies.</p>
            </div>
          </div>

          <div className="stats-toolbar">
            <div className="stats-range-controls" role="group" aria-label="Periode des statistiques">
              <button
                type="button"
                className={statsRange === '7d' ? 'button-compact is-active' : 'button-compact'}
                onClick={() => applyStatsPreset('7d')}
              >
                7j
              </button>
              <button
                type="button"
                className={statsRange === '1m' ? 'button-compact is-active' : 'button-compact'}
                onClick={() => applyStatsPreset('1m')}
              >
                1m
              </button>
              <button
                type="button"
                className={statsRange === '1y' ? 'button-compact is-active' : 'button-compact'}
                onClick={() => applyStatsPreset('1y')}
              >
                1a
              </button>
              <button
                type="button"
                className={statsRange === 'all' ? 'button-compact is-active' : 'button-compact'}
                onClick={() => applyStatsPreset('all')}
              >
                tout
              </button>
            </div>

            <label className="stats-filter-field">
              <span>Machine</span>
              <select value={statsMachineFilter} onChange={(event) => setStatsMachineFilter(event.target.value)}>
                <option value="all">Toutes les machines</option>
                {statsOverview.machineOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="stats-filter-field">
              <span>Visualisation poids</span>
              <select
                value={statsWeightMode}
                onChange={(event) => setStatsWeightMode(event.target.value as StatsWeightMode)}
              >
                <option value="max-per-session">Poids max par seance</option>
                <option value="all-weights">Tous les poids</option>
              </select>
            </label>

            <label className="stats-filter-field">
              <span>Heatmap</span>
              <select
                value={statsHeatmapMetric}
                onChange={(event) => setStatsHeatmapMetric(event.target.value as StatsHeatmapMetric)}
              >
                <option value="sessions">Seances</option>
                <option value="sets">Sets avec poids</option>
                <option value="volume">Volume</option>
              </select>
            </label>

            <div className="stats-date-controls">
              <label className="history-date-field">
                <span>Du</span>
                <input
                  type="date"
                  value={statsDateStart}
                  max={statsDateEnd || undefined}
                  onChange={(event) => updateStatsDateBoundary('start', event.target.value)}
                />
              </label>
              <label className="history-date-field">
                <span>Au</span>
                <input
                  type="date"
                  value={statsDateEnd}
                  min={statsDateStart || undefined}
                  onChange={(event) => updateStatsDateBoundary('end', event.target.value)}
                />
              </label>
            </div>

            <button type="button" className="button-compact" onClick={exportStatsInsightsCsv}>
              Export insights CSV
            </button>

            <p className="stats-filter-hint">
              Periode affichee: {statsOverview.rangeLabel}. Filtre applique a tous les graphes.
            </p>
          </div>

          {!statsOverview.hasCompletedSessions && (
            <div className="stats-empty-state">
              <strong>Aucune statistique disponible</strong>
              <p>Finalise au moins une seance avec des poids renseignes pour afficher les graphes.</p>
            </div>
          )}

          {statsOverview.hasCompletedSessions && statsOverview.filteredUsage.length === 0 && (
            <div className="stats-empty-state">
              <strong>Aucun resultat pour ce filtre</strong>
              <p>Essaie une autre machine pour retrouver des donnees exploitables.</p>
            </div>
          )}

          {statsOverview.hasCompletedSessions && statsOverview.filteredUsage.length > 0 && (
            <>
              <div className="stats-summary-grid">
                <article className="stats-summary-card">
                  <span className="stats-summary-card__label">Seances prises en compte</span>
                  <strong>{statsOverview.totalSessions}</strong>
                  <p>{statsOverview.selectedMachineLabel}</p>
                </article>
                <article className="stats-summary-card">
                  <span className="stats-summary-card__label">Sets avec poids</span>
                  <strong>{statsOverview.totalSets}</strong>
                  <p>Historique filtre</p>
                </article>
                <article className="stats-summary-card">
                  <span className="stats-summary-card__label">Charge max observee</span>
                  <strong>{statsOverview.maxWeight > 0 ? formatWeightValue(statsOverview.maxWeight) : '0 kg'}</strong>
                  <p>Meilleure performance enregistree</p>
                </article>
              </div>

              <div className="stats-insights-grid">
                <article className="stats-chart-card stats-insight-card">
                  <div className="card-head section-head section-head--tight">
                    <div>
                      <h3>Score progression hebdo</h3>
                      <p className="panel-intro">Frequence, volume et progression de charge.</p>
                    </div>
                  </div>
                  <div className="stats-score-main">
                    <strong>{statsOverview.weeklyScore.current}/100</strong>
                    <span
                      className={
                        statsOverview.weeklyScore.delta >= 0 ? 'stats-score-delta is-up' : 'stats-score-delta is-down'
                      }
                    >
                      {statsOverview.weeklyScore.delta >= 0 ? '+' : ''}
                      {statsOverview.weeklyScore.delta} vs semaine precedente
                    </span>
                  </div>
                  <div className="stats-score-breakdown">
                    <p>Frequence: {statsOverview.weeklyScore.frequencyScore}</p>
                    <p>Volume: {statsOverview.weeklyScore.volumeScore}</p>
                    <p>Progression charge: {statsOverview.weeklyScore.progressionScore}</p>
                    <p>Streak actuel: {statsOverview.weeklyScore.streakDays} jour(s)</p>
                  </div>
                </article>

                <article className="stats-chart-card stats-insight-card">
                  <div className="card-head section-head section-head--tight">
                    <div>
                      <h3>Derniers records</h3>
                      <p className="panel-intro">Records personnels detectes sur la periode.</p>
                    </div>
                    <span className="history-total-chip">{statsOverview.personalRecords.length}</span>
                  </div>

                  {statsOverview.personalRecords.length === 0 ? (
                    <p className="stats-chart-empty">Pas encore de nouveau record sur cette selection.</p>
                  ) : (
                    <div className="stats-pr-list">
                      {statsOverview.personalRecords.map((record) => (
                        <button
                          type="button"
                          className="stats-pr-item"
                          key={record.key}
                          onClick={() => openStatsSourceSession(record.sourceSessionId)}
                          title="Ouvrir la seance source"
                        >
                          <strong>{record.machineLabel}</strong>
                          <span>{formatWeightValue(record.weight)}</span>
                          <small>{formatStatDateLabel(record.date)}</small>
                          <span className="stats-drilldown-hint">Voir la seance -&gt;</span>
                        </button>
                      ))}
                    </div>
                  )}
                </article>

                <article className="stats-chart-card stats-insight-card">
                  <div className="card-head section-head section-head--tight">
                    <div>
                      <h3>Stagnation et actions</h3>
                      <p className="panel-intro">Detection des exercices a relancer.</p>
                    </div>
                  </div>

                  {statsOverview.stagnationPoints.length === 0 ? (
                    <p className="stats-chart-empty">Pas assez d historique pour detecter une stagnation.</p>
                  ) : (
                    <div className="stats-stagnation-list">
                      {statsOverview.stagnationPoints.map((point) => (
                        <button
                          type="button"
                          className="stats-stagnation-item"
                          key={point.machineId}
                          onClick={() => openStatsSourceSession(point.sourceSessionId)}
                          title="Ouvrir la seance source"
                        >
                          <div className="stats-stagnation-item__head">
                            <strong>{point.machineLabel}</strong>
                            <span className={point.trend === 'stagnating' ? 'is-stagnating' : 'is-progressing'}>
                              {point.trend === 'stagnating' ? 'Stagnation' : 'Progression'}
                            </span>
                          </div>
                          <p>
                            Recent: {formatWeightValue(point.recentMax)} | Avant: {formatWeightValue(point.previousMax)}
                          </p>
                          <small>{point.recommendation}</small>
                          <span className="stats-drilldown-hint">Voir la seance -&gt;</span>
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              </div>

              <div className="stats-main-layout">
                <article className="stats-chart-card stats-chart-card--usage">
                  <div className="card-head section-head section-head--tight">
                    <div>
                      <h3>Machines les plus utilisees</h3>
                      <p className="panel-intro">Clique sur une machine pour filtrer les graphes.</p>
                    </div>
                    <span className="history-total-chip">{statsOverview.usage.length} machines</span>
                  </div>

                  <div className="stats-usage-list" aria-label="Classement des machines utilisees">
                    {statsOverview.usage.map((entry) => {
                      const maxSessions = Math.max(1, ...statsOverview.usage.map((item) => item.sessions))
                      const width = Math.max(10, Math.round((entry.sessions / maxSessions) * 100))
                      const isActive = statsOverview.activeMachineId === entry.machineId

                      return (
                        <button
                          type="button"
                          className={isActive ? 'stats-usage-row is-active' : 'stats-usage-row'}
                          key={entry.machineId}
                          onClick={() => {
                            setStatsMachineFilter((previous) =>
                              previous === entry.machineId ? 'all' : entry.machineId,
                            )
                          }}
                          aria-pressed={isActive}
                          title={isActive ? 'Retirer le filtre machine' : `Filtrer sur ${entry.label}`}
                        >
                          <div className="stats-usage-row__main">
                            <div className="stats-usage-row__thumb" aria-hidden="true">
                              {entry.imageUrl ? (
                                <img src={resolvePublicAssetUrl(entry.imageUrl)} alt="" loading="lazy" />
                              ) : (
                                <span>?</span>
                              )}
                            </div>
                            <div className="stats-usage-row__content">
                              <div className="stats-usage-row__head">
                                <strong>{entry.label}</strong>
                                <span>{entry.sessions} seances</span>
                              </div>
                              <div className="stats-usage-row__track">
                                <div className="stats-usage-row__fill" style={{ width: `${width}%` }} />
                              </div>
                            </div>
                          </div>
                          <div className="stats-usage-row__meta">
                            <span>{entry.sets} sets avec poids</span>
                            <span>{formatWeightValue(entry.maxWeight)} max</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </article>

                <article className="stats-chart-card stats-chart-card--line">
                  <div className="card-head section-head section-head--tight">
                    <div>
                      <h3>
                        {statsWeightMode === 'max-per-session'
                          ? 'Evolution du poids max par seance'
                          : 'Evolution de tous les poids'}
                      </h3>
                      <p className="panel-intro">
                        {statsWeightMode === 'max-per-session'
                          ? `Poids maximum releve par seance pour ${statsOverview.selectedMachineLabel.toLowerCase()}.`
                          : `Toutes les charges enregistrees pour ${statsOverview.selectedMachineLabel.toLowerCase()}.`}
                      </p>
                    </div>
                    <span className="history-total-chip">{statsOverview.weightPoints.length} points</span>
                  </div>

                  {statsOverview.weightPoints.length === 0 ? (
                    <p className="stats-chart-empty">Aucune charge enregistree pour cette selection.</p>
                  ) : (
                    <div className="stats-line-chart" aria-label="Graphique des poids">
                      <svg viewBox="0 0 100 48" preserveAspectRatio="none" role="img">
                        <path
                          className="stats-line-chart__path"
                          d={buildLinePath(statsOverview.weightPoints, 100, 40)}
                        />
                        {statsOverview.weightPoints.map((point, index) => {
                          const position = getLinePointPosition(statsOverview.weightPoints, index, 100, 40)

                          return (
                            <circle
                              key={point.key}
                              cx={position.x}
                              cy={position.y}
                              r="0.42"
                              className="stats-line-chart__dot"
                            >
                              <title>{`${point.machineLabel} · ${point.label} · ${formatWeightValue(point.weight)}`}</title>
                            </circle>
                          )
                        })}
                      </svg>

                      <div className="stats-line-chart__legend">
                        {statsOverview.weightPoints.map((point) => (
                          <div className="stats-line-chart__legend-item" key={`legend-${point.key}`}>
                            <span>{point.label}</span>
                            <strong>{formatWeightValue(point.weight)}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              </div>

              <article className="stats-chart-card stats-chart-card--heatmap stats-chart-card--heatmap-compact">
                <div className="card-head section-head section-head--tight">
                  <div>
                    <h3>Heatmap des seances</h3>
                    <p className="panel-intro">
                      Intensite: {statsHeatmapMetric === 'sessions' ? 'seances' : statsHeatmapMetric === 'sets' ? 'sets avec poids' : 'volume'}. Clique sur un jour pour filtrer cette date.
                    </p>
                  </div>
                  <span className="history-total-chip">{statsOverview.heatmapDaysByWeek.length} semaines</span>
                </div>

                <div className="stats-heatmap__head" aria-hidden="true">
                  <span className="stats-heatmap__week-label">Sem.</span>
                  {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((label, index) => (
                    <span key={`${label}-${index}`}>{label}</span>
                  ))}
                </div>

                <div className="stats-heatmap" aria-label="Heatmap des seances">
                  {statsOverview.heatmapDaysByWeek.map((week, weekIndex) => {
                    const weekStartLabel = formatHistoryDateValue(week[0]?.date ?? '')
                    const weekEndLabel = formatHistoryDateValue(week[6]?.date ?? '')

                    return (
                      <div className="stats-heatmap__week" key={`week-${weekIndex}`}>
                        <span className="stats-heatmap__week-label">{`${weekStartLabel} - ${weekEndLabel}`}</span>
                        {week.map((day) => {
                          const metricValue =
                            statsHeatmapMetric === 'sessions'
                              ? day.sessions
                              : statsHeatmapMetric === 'sets'
                                ? day.sets
                                : day.volume
                          const level =
                            metricValue <= 0
                              ? 0
                              : Math.min(4, Math.ceil((metricValue / statsOverview.heatmapPeak) * 4))
                          const dayOfMonth = day.date.split('-')[2] ?? '--'
                          const metricLabel =
                            statsHeatmapMetric === 'sessions'
                              ? `${day.sessions} seance(s)`
                              : statsHeatmapMetric === 'sets'
                                ? `${day.sets} set(s)`
                                : formatVolumeValue(day.volume)

                          return (
                            <button
                              type="button"
                              key={day.date}
                              className={`stats-heatmap__day is-level-${level}`}
                              disabled={!day.inRange}
                              onClick={() => {
                                if (!day.inRange) {
                                  return
                                }

                                setStatsRange('custom')
                                setStatsDateStart(day.date)
                                setStatsDateEnd(day.date)
                              }}
                              title={`${formatHistoryDateValue(day.date)} · ${metricLabel}`}
                              aria-label={`${formatHistoryDateValue(day.date)}: ${metricLabel}`}
                            >
                              <span>{dayOfMonth}</span>
                            </button>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>

                <div className="stats-heatmap__legend" aria-hidden="true">
                  <span>Moins</span>
                  <div className="stats-heatmap__legend-scale">
                    <span className="stats-heatmap__day is-level-0" />
                    <span className="stats-heatmap__day is-level-1" />
                    <span className="stats-heatmap__day is-level-2" />
                    <span className="stats-heatmap__day is-level-3" />
                    <span className="stats-heatmap__day is-level-4" />
                  </div>
                  <span>Plus</span>
                  <strong>
                    Max: {statsHeatmapMetric === 'sessions' ? `${statsOverview.heatmapPeak} seance(s)` : statsHeatmapMetric === 'sets' ? `${statsOverview.heatmapPeak} set(s)` : formatVolumeValue(statsOverview.heatmapPeak)}
                  </strong>
                </div>
              </article>
            </>
          )}
        </section>
      )}

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
                        src={resolvePublicAssetUrl(currentExerciseInfo.imageUrl)}
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
                <aside className={isResting ? 'session-rest-widget is-active' : 'session-rest-widget'} aria-live="polite">
                  <span className="session-rest-widget__label">{restWidgetLabel}</span>
                  <strong className="session-rest-widget__value">{restWidgetValue}s</strong>
                  <span className="session-rest-widget__hint">{restWidgetHint}</span>
                </aside>
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
                    <div className="card-head section-head section-head--tight popup-head">
                      <div>
                        <h3>Ajouter un exercice</h3>
                        <p className="panel-intro">Recherche par nom ou machine.</p>
                      </div>
                      <button
                        className="popup-close-button"
                        type="button"
                        onClick={() => setIsExercisePickerOpen(false)}
                        aria-label="Fermer"
                        title="Fermer"
                      >
                        <CloseIcon />
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
                            <img
                              src={resolvePublicAssetUrl(exercise.imageUrl)}
                              alt={exercise.name}
                              loading="lazy"
                            />
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
              onClick={() => applyHistoryPreset('7d')}
            >
              7j
            </button>
            <button
              type="button"
              className={historyRange === '1m' ? 'button-compact is-active' : 'button-compact'}
              onClick={() => applyHistoryPreset('1m')}
            >
              1m
            </button>
            <button
              type="button"
              className={historyRange === '1y' ? 'button-compact is-active' : 'button-compact'}
              onClick={() => applyHistoryPreset('1y')}
            >
              1a
            </button>
            <button
              type="button"
              className={historyRange === 'all' ? 'button-compact is-active' : 'button-compact'}
              onClick={() => applyHistoryPreset('all')}
            >
              tout
            </button>
          </div>
          <div className="history-date-controls">
            <label className="history-date-field">
              <span>Du</span>
              <input
                type="date"
                value={historyDateStart}
                max={historyDateEnd || undefined}
                onChange={(event) => updateHistoryDateBoundary('start', event.target.value)}
              />
            </label>
            <label className="history-date-field">
              <span>Au</span>
              <input
                type="date"
                value={historyDateEnd}
                min={historyDateStart || undefined}
                onChange={(event) => updateHistoryDateBoundary('end', event.target.value)}
              />
            </label>
            <p className="history-range-summary">Periode affichee: {historyOverview.rangeLabel}</p>
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
                <div className="card-head section-head section-head--tight popup-head popup-head--flush">
                  <div>
                    <h3>{isEditingSelectedSession ? historySessionDraft?.name ?? selectedSession.templateName : selectedSession.templateName}</h3>
                    <p>
                      {new Date(selectedSession.startedAt).toLocaleString('fr-FR')}
                      {selectedSession.endedAt
                        ? ` - ${new Date(selectedSession.endedAt).toLocaleString('fr-FR')}`
                        : ''}
                    </p>
                  </div>
                  <button
                    className="popup-close-button"
                    type="button"
                    onClick={() => setIsHistoryDetailOpen(false)}
                    aria-label="Fermer"
                    title="Fermer"
                  >
                    <CloseIcon />
                  </button>
                </div>

                <div className="history-detail-actions">
                  {isEditingSelectedSession ? (
                    <>
                      <button type="button" className="button-compact" onClick={saveHistorySessionEdition}>
                        Enregistrer les modifications
                      </button>
                      <button type="button" className="button-compact" onClick={cancelHistorySessionEdition}>
                        Annuler l'edition
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="button-compact"
                      onClick={() => startHistorySessionEdition(selectedSession)}
                    >
                      Editer cette seance
                    </button>
                  )}
                </div>

                {isEditingSelectedSession && (
                  <label className="history-session-name-field">
                    Nom de la seance
                    <input
                      value={historySessionDraft?.name ?? ''}
                      onChange={(event) => updateHistoryDraftName(event.target.value)}
                      placeholder="Nom de la seance"
                    />
                  </label>
                )}

                <div className="detail-exercises">
                  {(isEditingSelectedSession ? historySessionDraft?.exercises ?? [] : selectedSession.exercises).map((exercise) => {
                    const exerciseInfo = EXERCISES.find((entry) => entry.id === exercise.exerciseId)

                    return (
                      <article className="detail-exercise" key={exercise.id}>
                        <div className="card-head">
                          <div>
                            <strong>{exerciseInfo?.name ?? exercise.exerciseId}</strong>
                            <p>{exerciseInfo?.category ?? 'General'}</p>
                          </div>
                          {isEditingSelectedSession && (
                            <button
                              type="button"
                              className="button-compact"
                              onClick={() => addHistoryDraftSet(exercise.id)}
                            >
                              + Ajouter une serie
                            </button>
                          )}
                        </div>
                        <div className="detail-sets">
                          {exercise.sets.map((set) => {
                            if (!isEditingSelectedSession) {
                              return (
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
                              )
                            }

                            return (
                              <div className="detail-set detail-set--editing" key={set.id}>
                                <span>Set {set.setNumber}</span>
                                <label>
                                  Reps
                                  <input
                                    type="number"
                                    value={set.actualReps}
                                    onChange={(event) =>
                                      updateHistoryDraftSet(
                                        exercise.id,
                                        set.id,
                                        'actualReps',
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
                                    value={set.actualWeight}
                                    onChange={(event) =>
                                      updateHistoryDraftSet(
                                        exercise.id,
                                        set.id,
                                        'actualWeight',
                                        Number(event.target.value),
                                      )
                                    }
                                  />
                                </label>
                                <span>{set.restSeconds}s repos</span>
                                <button
                                  type="button"
                                  className="button-compact button-compact--danger"
                                  onClick={() => removeHistoryDraftSet(exercise.id, set.id)}
                                  disabled={exercise.sets.length <= 1}
                                >
                                  Supprimer la serie
                                </button>
                              </div>
                            )
                          })}
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