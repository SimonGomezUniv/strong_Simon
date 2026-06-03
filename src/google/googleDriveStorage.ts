import type { RoutineTemplate, WorkoutSession } from '../types'

const DRIVE_UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files'
const DRIVE_SEARCH_ENDPOINT = 'https://www.googleapis.com/drive/v3/files'

const TEMPLATES_FILE_NAME = 'strong-simon-templates.json'
const SESSIONS_FILE_NAME = 'strong-simon-sessions.json'

type DriveFile = {
  id: string
  name: string
}

type DriveTemplatesPayload = {
  templates: RoutineTemplate[]
  updatedAt: string
}

type GoogleDriveSessionPayload = {
  activeSession: WorkoutSession | null
  sessionHistory: WorkoutSession[]
  updatedAt: string
}

export type GoogleDriveBackupPayload = {
  templates: RoutineTemplate[]
  sessionHistory: WorkoutSession[]
  activeSession: WorkoutSession | null
  updatedAt: string
}

function stringifyPayload(payload: unknown) {
  return JSON.stringify(payload, null, 2)
}

async function findAppDataFile(accessToken: string, fileName: string): Promise<DriveFile | null> {
  const query = encodeURIComponent(`name='${fileName}' and 'appDataFolder' in parents and trashed=false`)
  const response = await fetch(
    `${DRIVE_SEARCH_ENDPOINT}?spaces=appDataFolder&fields=files(id,name)&q=${query}&pageSize=1`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  )

  if (!response.ok) {
    throw new Error('Recherche du fichier Drive impossible.')
  }

  const data = (await response.json()) as { files?: DriveFile[] }
  return data.files?.[0] ?? null
}

async function upsertAppDataFile(accessToken: string, fileName: string, jsonPayload: string): Promise<string> {
  const existing = await findAppDataFile(accessToken, fileName)

  const boundary = `strong-simon-${Date.now()}`
  const metadata = existing
    ? { name: fileName }
    : {
        name: fileName,
        parents: ['appDataFolder'],
      }

  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    jsonPayload,
    `--${boundary}--`,
  ].join('\r\n')

  const targetUrl = existing
    ? `${DRIVE_UPLOAD_ENDPOINT}/${existing.id}?uploadType=multipart&fields=id`
    : `${DRIVE_UPLOAD_ENDPOINT}?uploadType=multipart&fields=id`

  const response = await fetch(targetUrl, {
    method: existing ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })

  if (!response.ok) {
    const details = await response.text().catch(() => '')
    throw new Error(`Upload Drive impossible (${response.status}). ${details}`.trim())
  }

  const data = (await response.json()) as { id?: string }

  if (!data.id) {
    throw new Error('Reponse Google Drive invalide: id fichier manquant.')
  }

  return data.id
}

async function readAppDataFileContent(accessToken: string, fileName: string): Promise<string | null> {
  const existing = await findAppDataFile(accessToken, fileName)

  if (!existing) {
    return null
  }

  const response = await fetch(`${DRIVE_SEARCH_ENDPOINT}/${existing.id}?alt=media`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    const details = await response.text().catch(() => '')
    throw new Error(`Lecture Drive impossible (${response.status}). ${details}`.trim())
  }

  return response.text()
}

function parseTemplatesPayload(rawContent: string | null): DriveTemplatesPayload | null {
  if (!rawContent) {
    return null
  }

  try {
    const parsed = JSON.parse(rawContent) as Partial<DriveTemplatesPayload>
    if (!Array.isArray(parsed.templates) || typeof parsed.updatedAt !== 'string') {
      return null
    }

    return {
      templates: parsed.templates,
      updatedAt: parsed.updatedAt,
    }
  } catch {
    return null
  }
}

function parseSessionsPayload(rawContent: string | null): GoogleDriveSessionPayload | null {
  if (!rawContent) {
    return null
  }

  try {
    const parsed = JSON.parse(rawContent) as Partial<GoogleDriveSessionPayload>
    if (!Array.isArray(parsed.sessionHistory) || typeof parsed.updatedAt !== 'string') {
      return null
    }

    return {
      sessionHistory: parsed.sessionHistory,
      activeSession: parsed.activeSession ?? null,
      updatedAt: parsed.updatedAt,
    }
  } catch {
    return null
  }
}

export async function syncTemplatesAndSessionsToGoogleDrive(
  accessToken: string,
  payload: {
    templates: RoutineTemplate[]
    sessionHistory: WorkoutSession[]
    activeSession: WorkoutSession | null
  },
): Promise<{ updatedCount: number; updatedAt: string }> {
  if (!accessToken) {
    throw new Error('Token Google manquant.')
  }

  const updatedAt = new Date().toISOString()

  const templatesPayload = {
    updatedAt,
    templates: payload.templates,
  }

  const sessionsPayload: GoogleDriveSessionPayload = {
    updatedAt,
    activeSession: payload.activeSession,
    sessionHistory: payload.sessionHistory,
  }

  await Promise.all([
    upsertAppDataFile(accessToken, TEMPLATES_FILE_NAME, stringifyPayload(templatesPayload)),
    upsertAppDataFile(accessToken, SESSIONS_FILE_NAME, stringifyPayload(sessionsPayload)),
  ])

  return {
    updatedAt,
    updatedCount: 2,
  }
}

export async function pullTemplatesAndSessionsFromGoogleDrive(
  accessToken: string,
): Promise<GoogleDriveBackupPayload | null> {
  if (!accessToken) {
    throw new Error('Token Google manquant.')
  }

  const [templatesRaw, sessionsRaw] = await Promise.all([
    readAppDataFileContent(accessToken, TEMPLATES_FILE_NAME),
    readAppDataFileContent(accessToken, SESSIONS_FILE_NAME),
  ])

  const templatesPayload = parseTemplatesPayload(templatesRaw)
  const sessionsPayload = parseSessionsPayload(sessionsRaw)

  if (!templatesPayload && !sessionsPayload) {
    return null
  }

  const updatedAtCandidates = [templatesPayload?.updatedAt, sessionsPayload?.updatedAt].filter(
    (value): value is string => Boolean(value),
  )

  return {
    templates: templatesPayload?.templates ?? [],
    sessionHistory: sessionsPayload?.sessionHistory ?? [],
    activeSession: sessionsPayload?.activeSession ?? null,
    updatedAt: updatedAtCandidates.sort().at(-1) ?? new Date(0).toISOString(),
  }
}
