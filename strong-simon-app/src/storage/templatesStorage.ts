import type { RoutineTemplate } from '../types'
import { DEFAULT_TEMPLATES } from '../data/defaultTemplates'

const STORAGE_KEY = 'strong-simon-templates-v1'

function cloneTemplates(templates: RoutineTemplate[]): RoutineTemplate[] {
  return templates.map((template) => ({
    ...template,
    exercises: template.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => ({ ...set })),
    })),
  }))
}

function normalizeTemplates(templates: RoutineTemplate[]): RoutineTemplate[] {
  return templates.map((template) => ({
    ...template,
    exercises: template.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => ({
        ...set,
        phaseTag: set.phaseTag ?? exercise.tag ?? 'working',
      })),
    })),
  }))
}

export function loadTemplates(): RoutineTemplate[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    const seeded = cloneTemplates(DEFAULT_TEMPLATES)
    saveTemplates(seeded)
    return seeded
  }

  try {
    const parsed = JSON.parse(raw) as RoutineTemplate[]
    if (!Array.isArray(parsed)) {
      return []
    }

    const normalized = normalizeTemplates(parsed)
    saveTemplates(normalized)
    return normalized
  } catch {
    return []
  }
}

export function saveTemplates(templates: RoutineTemplate[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
}
