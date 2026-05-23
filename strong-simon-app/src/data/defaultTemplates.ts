import type { RoutineTemplate, TemplateExercise, TemplateSet } from '../types'

const SEED_TIMESTAMP = '2026-05-23T00:00:00.000Z'

function makeSet(setNumber: number, targetReps: number, targetWeight: number, restSeconds: number): TemplateSet {
  return {
    setNumber,
    targetReps,
    targetWeight,
    restSeconds,
  }
}

function makeExercise(
  id: string,
  exerciseId: string,
  orderIndex: number,
  sets: TemplateSet[],
): TemplateExercise {
  return {
    id,
    exerciseId,
    orderIndex,
    sets,
  }
}

export const DEFAULT_TEMPLATES: RoutineTemplate[] = [
  {
    id: 'tpl-a-bis',
    name: 'Seance A bis - Pecs Dos Epaules',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
    exercises: [
      makeExercise('tpl-a-ex-1', 'chest-press', 0, [
        makeSet(1, 10, 36, 120),
        makeSet(2, 8, 41, 120),
        makeSet(3, 8, 54, 120),
        makeSet(4, 8, 54, 120),
        makeSet(5, 8, 54, 120),
      ]),
      makeExercise('tpl-a-ex-2', 'seated-row-cable', 1, [
        makeSet(1, 10, 50, 90),
        makeSet(2, 10, 50, 90),
        makeSet(3, 9, 50, 90),
      ]),
      makeExercise('tpl-a-ex-3', 'pec-deck', 2, [
        makeSet(1, 12, 72, 60),
        makeSet(2, 12, 72, 60),
        makeSet(3, 12, 72, 60),
      ]),
      makeExercise('tpl-a-ex-4', 'reverse-fly-machine', 3, [
        makeSet(1, 15, 27, 60),
        makeSet(2, 15, 27, 60),
        makeSet(3, 15, 27, 60),
      ]),
      makeExercise('tpl-a-ex-5', 'seated-overhead-press', 4, [
        makeSet(1, 10, 29, 90),
        makeSet(2, 9, 29, 90),
        makeSet(3, 7, 29, 90),
      ]),
      makeExercise('tpl-a-ex-6', 'cable-lateral-raise', 5, [
        makeSet(1, 13, 8, 45),
        makeSet(2, 13, 8, 45),
        makeSet(3, 13, 8, 45),
      ]),
      makeExercise('tpl-a-ex-7', 'lat-pulldown', 6, [
        makeSet(1, 12, 35, 90),
        makeSet(2, 12, 35, 90),
      ]),
    ],
  },
  {
    id: 'tpl-b-bis',
    name: 'Seance B bis - Dos Bras Haut du corps',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
    exercises: [
      makeExercise('tpl-b-ex-1', 'lat-pulldown', 0, [
        makeSet(1, 10, 43, 90),
        makeSet(2, 10, 43, 90),
        makeSet(3, 9, 43, 90),
      ]),
      makeExercise('tpl-b-ex-2', 'low-row-triangle', 1, [
        makeSet(1, 10, 45, 90),
        makeSet(2, 10, 45, 90),
        makeSet(3, 10, 45, 90),
      ]),
      makeExercise('tpl-b-ex-3', 'seated-row-machine', 2, [
        makeSet(1, 10, 50, 90),
        makeSet(2, 10, 50, 90),
        makeSet(3, 9, 50, 90),
      ]),
      makeExercise('tpl-b-ex-4', 'cable-biceps-curl', 3, [
        makeSet(1, 11, 20, 60),
        makeSet(2, 11, 20, 60),
        makeSet(3, 11, 20, 60),
      ]),
      makeExercise('tpl-b-ex-5', 'triceps-pushdown', 4, [
        makeSet(1, 11, 22, 60),
        makeSet(2, 11, 22, 60),
        makeSet(3, 11, 22, 60),
      ]),
      makeExercise('tpl-b-ex-6', 'rope-hammer-curl', 5, [
        makeSet(1, 12, 18, 60),
        makeSet(2, 12, 18, 60),
        makeSet(3, 12, 18, 60),
      ]),
      makeExercise('tpl-b-ex-7', 'leg-press', 6, [
        makeSet(1, 12, 63, 90),
        makeSet(2, 12, 72, 90),
        makeSet(3, 12, 72, 90),
      ]),
      makeExercise('tpl-b-ex-8', 'crunch-machine', 7, [
        makeSet(1, 15, 0, 45),
        makeSet(2, 15, 0, 45),
        makeSet(3, 15, 0, 45),
      ]),
    ],
  },
]
