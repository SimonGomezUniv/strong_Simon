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
  SessionExercise,
  TemplateExercise,
  WorkoutSession,
} from './types'

function App() {
  const [templates, setTemplates] = useState<RoutineTemplate[]>(() => loadTemplates())
  const [sessionHistory, setSessionHistory] = useState<WorkoutSession[]>(() =>
    loadSessionHistory(),
  )
  const [activeSession, setActiveSession] = useState<WorkoutSession | null>(() =>
    loadActiveSession(),
  )

  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<TemplateExercise[]>([])

  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0)
  const [isResting, setIsResting] = useState(false)
  const [restRemaining, setRestRemaining] = useState(0)
  const [notice, setNotice] = useState('')
  const [notificationPermission, setNotificationPermission] = useState(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  )

  const filteredExercises = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) {
      return EXERCISES
    }

    return EXERCISES.filter((exercise) => {
      const inName = exercise.name.toLowerCase().includes(normalized)
      const inAliases = exercise.aliases.some((alias) =>
        alias.toLowerCase().includes(normalized),
      )
      return inName || inAliases
    })
  }, [query])

  const selectedIds = new Set(selected.map((item) => item.exerciseId))

  const currentExercise =
    activeSession?.exercises[currentExerciseIndex] ?? null

  useEffect(() => {
    if (!activeSession) {
      clearActiveSession()
      return
    }

    saveActiveSession(activeSession)
  }, [activeSession])

  useEffect(() => {
    if (!isResting) {
      return
    }

    const timer = window.setInterval(() => {
      setRestRemaining((previous) => {
        if (previous <= 1) {
          window.clearInterval(timer)
          setIsResting(false)
          triggerRestEndAlert()
          return 0
        }
        return previous - 1
      })
    }, 1000)

    return () => window.clearInterval(timer)
  }, [isResting])

  useEffect(() => {
    if (!notice) {
      return
    }

    const timeout = window.setTimeout(() => setNotice(''), 3500)
    return () => window.clearTimeout(timeout)
  }, [notice])

  function triggerRestEndAlert() {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('Repos termine', {
        body: 'Reprends la serie suivante.',
      })
      return
    }

    setNotice('Repos termine. Prochaine serie !')
  }

  async function requestNotifications() {
    if (typeof Notification === 'undefined') {
      setNotificationPermission('unsupported')
      setNotice('Notifications non supportees sur ce navigateur.')
      return
    }

    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)

    if (permission === 'granted') {
      setNotice('Notifications activees.')
      return
    }

    setNotice('Notifications refusees. Fallback visuel actif.')
  }

  function addExercise(exerciseId: string) {
    if (selectedIds.has(exerciseId)) {
      return
    }

    const orderIndex = selected.length
    setSelected((previous) => [
      ...previous,
      {
        id: crypto.randomUUID(),
        exerciseId,
        orderIndex,
        sets: [
          {
            setNumber: 1,
            targetReps: 10,
            targetWeight: 20,
            restSeconds: 90,
          },
          {
            setNumber: 2,
            targetReps: 10,
            targetWeight: 20,
            restSeconds: 90,
          },
          {
            setNumber: 3,
            targetReps: 10,
            targetWeight: 20,
            restSeconds: 90,
          },
        ],
      },
    ])
  }

  function updateTemplateSet(
    exerciseId: string,
    setIndex: number,
    field: 'targetReps' | 'targetWeight' | 'restSeconds',
    value: number,
  ) {
    setSelected((previous) =>
      previous.map((item) => {
        if (item.exerciseId !== exerciseId) {
          return item
        }

        const updated = item.sets.map((set, index) => {
          if (index !== setIndex) {
            return set
          }

          return {
            ...set,
            [field]: Number.isNaN(value) ? 0 : value,
          }
        })

        return {
          ...item,
          sets: updated,
        }
      }),
    )
  }

  function nudgeSessionSet(
    exerciseId: string,
    setId: string,
    field: 'actualReps' | 'actualWeight',
    delta: number,
  ) {
    setActiveSession((previous) => {
      if (!previous) {
        return previous
      }

      const nextExercises = previous.exercises.map((exercise) => {
        if (exercise.id !== exerciseId) {
          return exercise
        }

        return {
          ...exercise,
          sets: exercise.sets.map((set) => {
            if (set.id !== setId) {
              return set
            }

            const nextValue = Math.max(0, set[field] + delta)
            return {
              ...set,
              [field]: field === 'actualWeight' ? Number(nextValue.toFixed(1)) : nextValue,
            }
          }),
        }
      })

      return {
        ...previous,
        exercises: nextExercises,
      }
    })
  }

  function duplicateFromPreviousSet(exerciseId: string, setIndex: number) {
    if (setIndex <= 0) {
      return
    }

    setActiveSession((previous) => {
      if (!previous) {
        return previous
      }

      const nextExercises = previous.exercises.map((exercise) => {
        if (exercise.id !== exerciseId) {
          return exercise
        }

        const source = exercise.sets[setIndex - 1]
        const target = exercise.sets[setIndex]
        if (!source || !target) {
          return exercise
        }

        return {
          ...exercise,
          sets: exercise.sets.map((set, idx) => {
            if (idx !== setIndex) {
              return set
            }

            return {
              ...set,
              actualReps: source.actualReps,
              actualWeight: source.actualWeight,
            }
          }),
        }
      })

      return {
        ...previous,
        exercises: nextExercises,
      }
    })
  }

  function exportSessionHistoryCsv() {
    if (sessionHistory.length === 0) {
      setNotice('Aucune seance a exporter.')
      return
    }

    const header = [
      'session_id',
      'template_name',
      'started_at',
      'ended_at',
      'exercise_name',
      'set_number',
      'target_reps',
      'target_weight',
      'actual_reps',
      'actual_weight',
      'rest_seconds',
      'completed_at',
    ]

    const rows: string[] = [header.join(',')]

    sessionHistory.forEach((session) => {
      session.exercises.forEach((exercise) => {
        const exerciseName =
          EXERCISES.find((entry) => entry.id === exercise.exerciseId)?.name ?? exercise.exerciseId

        exercise.sets.forEach((set) => {
          rows.push(
            [
              session.id,
              session.templateName,
              session.startedAt,
              session.endedAt ?? '',
              exerciseName,
              set.setNumber,
              set.targetReps,
              set.targetWeight,
              set.actualReps,
              set.actualWeight,
              set.restSeconds,
              set.completedAt ?? '',
            ]
              .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
              .join(','),
          )
        })
      })
    })

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `strong-simon-sessions-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    setNotice('Export CSV genere.')
  }

  function removeExercise(exerciseId: string) {
    setSelected((previous) =>
      previous
        .filter((item) => item.exerciseId !== exerciseId)
        .map((item, index) => ({ ...item, orderIndex: index })),
    )
  }

  function createTemplate() {
    if (!name.trim() || selected.length === 0) {
      return
    }

    const now = new Date().toISOString()
    const nextTemplate: RoutineTemplate = {
      id: crypto.randomUUID(),
      name: name.trim(),
      createdAt: now,
      updatedAt: now,
      exercises: selected,
    }

    const next = [nextTemplate, ...templates]
    setTemplates(next)
    saveTemplates(next)
    setName('')
    setQuery('')
    setSelected([])
  }

  function deleteTemplate(templateId: string) {
    const next = templates.filter((template) => template.id !== templateId)
    setTemplates(next)
    saveTemplates(next)
  }

  function createSessionFromTemplate(template: RoutineTemplate): WorkoutSession {
    const exercises: SessionExercise[] = template.exercises
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((exercise) => ({
        id: crypto.randomUUID(),
        exerciseId: exercise.exerciseId,
        orderIndex: exercise.orderIndex,
        sets: exercise.sets.map((set) => ({
          id: crypto.randomUUID(),
          setNumber: set.setNumber,
          targetReps: set.targetReps,
          targetWeight: set.targetWeight,
          actualReps: set.targetReps,
          actualWeight: set.targetWeight,
          restSeconds: set.restSeconds,
        })),
      }))

    return {
      id: crypto.randomUUID(),
      templateId: template.id,
      templateName: template.name,
      startedAt: new Date().toISOString(),
      exercises,
    }
  }

  function startSession(template: RoutineTemplate) {
    const nextSession = createSessionFromTemplate(template)
    setActiveSession(nextSession)
    setCurrentExerciseIndex(0)
    setIsResting(false)
    setRestRemaining(0)
    setNotice(`Seance demarree: ${template.name}`)
  }

  function updateSessionSet(
    exerciseId: string,
    setId: string,
    field: 'actualReps' | 'actualWeight',
    value: number,
  ) {
    setActiveSession((previous) => {
      if (!previous) {
        return previous
      }

      const nextExercises = previous.exercises.map((exercise) => {
        if (exercise.id !== exerciseId) {
          return exercise
        }

        const nextSets = exercise.sets.map((set) => {
          if (set.id !== setId) {
            return set
          }

          return {
            ...set,
            [field]: Number.isNaN(value) ? 0 : value,
          }
        })

        return {
          ...exercise,
          sets: nextSets,
        }
      })

      return {
        ...previous,
        exercises: nextExercises,
      }
    })
  }

  function completeSet(exerciseId: string, setId: string) {
    let restDuration = 0

    setActiveSession((previous) => {
      if (!previous) {
        return previous
      }

      const nextExercises = previous.exercises.map((exercise) => {
        if (exercise.id !== exerciseId) {
          return exercise
        }

        const nextSets = exercise.sets.map((set) => {
          if (set.id !== setId) {
            return set
          }

          restDuration = set.restSeconds
          return {
            ...set,
            completedAt: new Date().toISOString(),
          }
        })

        return {
          ...exercise,
          sets: nextSets,
        }
      })

      return {
        ...previous,
        exercises: nextExercises,
      }
    })

    if (restDuration > 0) {
      setRestRemaining(restDuration)
      setIsResting(true)
    }
  }

  function finishSession() {
    if (!activeSession) {
      return
    }

    const completed: WorkoutSession = {
      ...activeSession,
      endedAt: new Date().toISOString(),
    }

    const nextHistory = [completed, ...sessionHistory]
    setSessionHistory(nextHistory)
    saveSessionHistory(nextHistory)
    setActiveSession(null)
    setCurrentExerciseIndex(0)
    setIsResting(false)
    setRestRemaining(0)
    setNotice('Seance terminee et enregistree.')
  }

  function previousExercise() {
    setCurrentExerciseIndex((previous) => Math.max(0, previous - 1))
  }

  function nextExercise() {
    if (!activeSession) {
      return
    }

    setCurrentExerciseIndex((previous) =>
      Math.min(activeSession.exercises.length - 1, previous + 1),
    )
  }

  return (
    <main className="app-shell">
      <header className="header">
        <p className="eyebrow">Strong Simon</p>
        <h1>Templates et seances de musculation</h1>
        <p className="subtitle">
          Catalogue integre, snapshot de seance, edition rapide et timer de repos.
        </p>
        <div className="status-bar">
          <button type="button" onClick={requestNotifications}>
            Notifications: {notificationPermission}
          </button>
          {isResting && <span className="rest-chip">Repos: {restRemaining}s</span>}
          {!isResting && activeSession && <span className="rest-chip">Seance active</span>}
        </div>
        {notice && <p className="notice">{notice}</p>}
      </header>

      {activeSession && currentExercise && (
        <section className="panel workout-panel">
          <h2>Seance en cours: {activeSession.templateName}</h2>
          <p>
            Exercice {currentExerciseIndex + 1} / {activeSession.exercises.length}
          </p>

          <div className="exercise-header">
            <strong>
              {
                EXERCISES.find((exercise) => exercise.id === currentExercise.exerciseId)
                  ?.name
              }
            </strong>
            <div className="session-nav">
              <button type="button" onClick={previousExercise}>
                Precedent
              </button>
              <button type="button" onClick={nextExercise}>
                Suivant
              </button>
            </div>
          </div>

          <div className="session-sets">
            {currentExercise.sets.map((set, setIndex) => (
              <article className="set-row" key={set.id}>
                <strong>Set {set.setNumber}</strong>
                <label>
                  Reps
                  <input
                    type="number"
                    value={set.actualReps}
                    onChange={(event) =>
                      updateSessionSet(
                        currentExercise.id,
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
                      updateSessionSet(
                        currentExercise.id,
                        set.id,
                        'actualWeight',
                        Number(event.target.value),
                      )
                    }
                  />
                </label>
                <div className="quick-actions">
                  <button
                    type="button"
                    onClick={() =>
                      nudgeSessionSet(currentExercise.id, set.id, 'actualReps', 1)
                    }
                  >
                    +1 rep
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      nudgeSessionSet(currentExercise.id, set.id, 'actualWeight', 0.5)
                    }
                  >
                    +0.5 kg
                  </button>
                  <button
                    type="button"
                    disabled={setIndex === 0}
                    onClick={() => duplicateFromPreviousSet(currentExercise.id, setIndex)}
                  >
                    Dupliquer precedente
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => completeSet(currentExercise.id, set.id)}
                >
                  {set.completedAt ? 'Refaire repos' : 'Valider set'}
                </button>
              </article>
            ))}
          </div>

          <button className="primary" type="button" onClick={finishSession}>
            Terminer la seance
          </button>
        </section>
      )}

      <section className="panel">
        <h2>Nouveau template</h2>
        <div className="form-grid">
          <label>
            Nom du template
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Push A"
            />
          </label>
          <label>
            Recherche exercice / machine
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ex: presse a cuisses"
            />
          </label>
        </div>

        <div className="catalog-grid">
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

        <h3>Exercices selectionnes</h3>
        <div className="selected-list">
          {selected.length === 0 && <p>Aucun exercice ajoute.</p>}
          {selected.map((item) => {
            const exercise = EXERCISES.find((entry) => entry.id === item.exerciseId)
            if (!exercise) {
              return null
            }

            return (
              <article className="selected-card" key={item.id}>
                <div>
                  <strong>{exercise.name}</strong>
                  <p>{exercise.category ?? 'General'}</p>
                </div>
                {item.sets.map((set, setIndex) => (
                  <div className="quick-fields" key={`${item.id}-${set.setNumber}`}>
                    <span className="set-label">Set {set.setNumber}</span>
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
                ))}
                <button type="button" onClick={() => removeExercise(item.exerciseId)}>
                  Retirer
                </button>
              </article>
            )
          })}
        </div>

        <button className="primary" type="button" onClick={createTemplate}>
          Enregistrer le template
        </button>
      </section>

      <section className="panel">
        <h2>Templates sauvegardes localement</h2>
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
              <div className="actions-row">
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

      <section className="panel">
        <h2>Historique des seances</h2>
        <button type="button" onClick={exportSessionHistoryCsv}>
          Export CSV
        </button>
        <div className="saved-list">
          {sessionHistory.length === 0 && <p>Aucune seance terminee pour l'instant.</p>}
          {sessionHistory.map((session) => (
            <article className="saved-card" key={session.id}>
              <div>
                <strong>{session.templateName}</strong>
                <p>
                  Debut: {new Date(session.startedAt).toLocaleString('fr-FR')} | Fin:{' '}
                  {session.endedAt
                    ? new Date(session.endedAt).toLocaleString('fr-FR')
                    : 'en cours'}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

export default App
