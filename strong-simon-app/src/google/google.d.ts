type GoogleTokenResponse = {
  access_token?: string
  error?: string
  error_description?: string
}

type GoogleTokenClientConfig = {
  client_id: string
  scope: string
  callback: (response: GoogleTokenResponse) => void
}

type GoogleTokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void
}

type GoogleOauth2Api = {
  initTokenClient: (config: GoogleTokenClientConfig) => GoogleTokenClient
  revoke: (token: string, done?: () => void) => void
}

type GoogleAccountsApi = {
  oauth2: GoogleOauth2Api
}

declare global {
  interface Window {
    google?: {
      accounts: GoogleAccountsApi
    }
  }
}

export {}
