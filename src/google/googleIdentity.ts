const GOOGLE_IDENTITY_SCRIPT_ID = 'google-identity-services-script'
const GOOGLE_IDENTITY_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'

type GoogleUserInfoResponse = {
  sub: string
  email?: string
  name?: string
  given_name?: string
  family_name?: string
  picture?: string
}

export type GoogleIdentityProfile = {
  id: string
  email?: string
  fullName: string
  givenName: string
  familyName: string
  picture?: string
}

export type GoogleSignInResult = {
  accessToken: string
  profile: GoogleIdentityProfile
}

async function ensureGoogleIdentityLoaded(): Promise<void> {
  if (window.google?.accounts?.oauth2) {
    return
  }

  await new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_IDENTITY_SCRIPT_ID) as HTMLScriptElement | null

    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true })
      existingScript.addEventListener('error', () => reject(new Error('Impossible de charger Google Identity Services.')), {
        once: true,
      })
      return
    }

    const script = document.createElement('script')
    script.id = GOOGLE_IDENTITY_SCRIPT_ID
    script.src = GOOGLE_IDENTITY_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Impossible de charger Google Identity Services.'))
    document.head.append(script)
  })

  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google Identity Services indisponible.')
  }
}

function requestGoogleAccessToken(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services indisponible.'))
      return
    }

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: [
        'openid',
        'profile',
        'email',
        'https://www.googleapis.com/auth/drive.appdata',
      ].join(' '),
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description ?? response.error))
          return
        }

        if (!response.access_token) {
          reject(new Error('Token Google manquant.'))
          return
        }

        resolve(response.access_token)
      },
    })

    tokenClient.requestAccessToken({ prompt: 'consent' })
  })
}

async function fetchGoogleUserProfile(accessToken: string): Promise<GoogleIdentityProfile> {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error('Impossible de recuperer le profil Google.')
  }

  const userInfo = (await response.json()) as GoogleUserInfoResponse
  const givenName = userInfo.given_name ?? ''
  const familyName = userInfo.family_name ?? ''

  return {
    id: userInfo.sub,
    email: userInfo.email,
    fullName: userInfo.name ?? [givenName, familyName].filter(Boolean).join(' ').trim(),
    givenName,
    familyName,
    picture: userInfo.picture,
  }
}

export async function signInWithGoogle(clientId: string): Promise<GoogleSignInResult> {
  const normalizedClientId = clientId.trim()

  if (!normalizedClientId) {
    throw new Error('Client ID Google manquant. Configure VITE_GOOGLE_CLIENT_ID.')
  }

  await ensureGoogleIdentityLoaded()

  const accessToken = await requestGoogleAccessToken(normalizedClientId)
  const profile = await fetchGoogleUserProfile(accessToken)

  return {
    accessToken,
    profile,
  }
}

export async function revokeGoogleAccess(accessToken: string): Promise<void> {
  if (!accessToken || !window.google?.accounts?.oauth2) {
    return
  }

  await new Promise<void>((resolve) => {
    window.google?.accounts?.oauth2.revoke(accessToken, () => resolve())
  })
}
