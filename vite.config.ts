import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function resolveBasePath() {
  const isGithubActions = process.env.GITHUB_ACTIONS === 'true'
  const repository = process.env.GITHUB_REPOSITORY

  if (!isGithubActions || !repository) {
    return '/'
  }

  const repoName = repository.split('/')[1]
  return repoName ? `/${repoName}/` : '/'
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: resolveBasePath(),
})
