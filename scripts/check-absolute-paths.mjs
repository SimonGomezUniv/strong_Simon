import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()

const scanConfig = [
  {
    dir: 'src',
    extensions: new Set(['.ts', '.tsx']),
    checks: [
      {
        name: 'serviceWorker.register absolute path',
        regex: /serviceWorker\.register\(\s*['"]\//g,
      },
      {
        name: 'imageUrl absolute path',
        regex: /imageUrl\s*:\s*['"]\//g,
      },
      {
        name: 'absolute src/href in JSX/TSX',
        regex: /\b(?:src|href)\s*=\s*['"]\//g,
      },
    ],
  },
  {
    dir: '.',
    exactFile: 'index.html',
    extensions: new Set(['.html']),
    checks: [
      {
        name: 'absolute src/href in index.html',
        regex: /\b(?:src|href)\s*=\s*['"]\//g,
        allow: (line) => line.includes('src="/src/main.tsx"'),
      },
    ],
  },
  {
    dir: 'public',
    exactFile: 'manifest.webmanifest',
    extensions: new Set(['.webmanifest']),
    checks: [
      {
        name: 'manifest start_url absolute path',
        regex: /"start_url"\s*:\s*"\//g,
      },
      {
        name: 'manifest scope absolute path',
        regex: /"scope"\s*:\s*"\//g,
      },
      {
        name: 'manifest icon src absolute path',
        regex: /"src"\s*:\s*"\//g,
      },
    ],
  },
  {
    dir: 'public',
    exactFile: 'sw.js',
    extensions: new Set(['.js']),
    checks: [
      {
        name: 'service worker hardcoded absolute cache/fallback paths',
        regex: /['"]\/(?:index\.html|manifest\.webmanifest|favicon\.svg|logo_simon_strong\.png|sw\.js)['"]/g,
      },
    ],
  },
]

async function* walk(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })

  for (const entry of entries) {
    const absPath = path.join(dirPath, entry.name)

    if (entry.isDirectory()) {
      yield* walk(absPath)
      continue
    }

    yield absPath
  }
}

function toRelative(filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/')
}

function findLineNumber(content, index) {
  return content.slice(0, index).split('\n').length
}

async function collectFiles(config) {
  if (config.exactFile) {
    return [path.join(root, config.dir, config.exactFile)]
  }

  const absDir = path.join(root, config.dir)
  const result = []

  for await (const file of walk(absDir)) {
    if (config.extensions.has(path.extname(file))) {
      result.push(file)
    }
  }

  return result
}

async function main() {
  const violations = []

  for (const config of scanConfig) {
    const files = await collectFiles(config)

    for (const filePath of files) {
      let content = ''

      try {
        content = await fs.readFile(filePath, 'utf8')
      } catch {
        continue
      }

      const lines = content.split('\n')

      for (const check of config.checks) {
        const regex = new RegExp(check.regex.source, check.regex.flags)
        let match

        while ((match = regex.exec(content)) !== null) {
          const lineNumber = findLineNumber(content, match.index)
          const line = lines[lineNumber - 1] ?? ''

          if (check.allow && check.allow(line)) {
            continue
          }

          violations.push({
            file: toRelative(filePath),
            line: lineNumber,
            check: check.name,
            lineText: line.trim(),
          })
        }
      }
    }
  }

  if (violations.length === 0) {
    console.log('No problematic absolute paths found.')
    return
  }

  console.error('Found problematic absolute paths:')
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line} [${violation.check}] ${violation.lineText}`)
  }

  process.exitCode = 1
}

await main()
