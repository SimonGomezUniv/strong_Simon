export type Exercise = {
  id: string
  name: string
  aliases: string[]
  imageUrl: string
  category?: string
}

export type TemplateSet = {
  setNumber: number
  targetReps: number
  targetWeight: number
  restSeconds: number
  phaseTag?: TemplateExerciseTag
}

export type TemplateExerciseTag = 'warmup' | 'working' | 'finisher'

export type TemplateExercise = {
  id: string
  exerciseId: string
  orderIndex: number
  // Legacy field kept for migration of older local data.
  tag?: TemplateExerciseTag
  sets: TemplateSet[]
}

export type RoutineTemplate = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  exercises: TemplateExercise[]
}

export type SessionSet = {
  id: string
  setNumber: number
  targetReps: number
  targetWeight: number
  actualReps: number
  actualWeight: number
  restSeconds: number
  phaseTag?: TemplateExerciseTag
  effortTag?: 'fail' | 'drop'
  completedAt?: string
}

export type SessionExercise = {
  id: string
  exerciseId: string
  orderIndex: number
  // Legacy field kept for migration of older local data.
  tag?: TemplateExerciseTag
  sets: SessionSet[]
}

export type WorkoutSession = {
  id: string
  templateId: string
  templateName: string
  startedAt: string
  endedAt?: string
  notes?: string
  exercises: SessionExercise[]
}
