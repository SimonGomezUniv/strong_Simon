import { spawn } from 'node:child_process'

const isWin = process.platform === 'win32'
const port = process.env.PHONE_TEST_PORT || '4173'

function spawnCmd(command, args, options = {}) {
  if (isWin) {
    return spawn('cmd', ['/c', command, ...args], options)
  }

  return spawn(command, args, options)
}

const children = []

function run(command, args, label) {
  const child = spawnCmd(command, args, {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: false,
  })

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[${label}] ${chunk}`)
  })

  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[${label}] ${chunk}`)
  })

  child.on('exit', (code) => {
    if (code !== 0) {
      process.stderr.write(`\n[${label}] exited with code ${code}\n`)
    }
  })

  children.push(child)
  return child
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM')
    }
  }
}

process.on('SIGINT', () => {
  shutdown()
  process.exit(0)
})

process.on('SIGTERM', () => {
  shutdown()
  process.exit(0)
})

const build = spawnCmd('npm', ['run', 'build'], {
  stdio: 'inherit',
  shell: false,
})

build.on('exit', (code) => {
  if (code !== 0) {
    process.exit(code ?? 1)
  }

  run('npm', ['run', 'preview', '--', '--host', '0.0.0.0', '--port', port, '--strictPort'], 'preview')
  run('npx', ['localtunnel', '--port', port], 'tunnel')

  process.stdout.write('\nMobile test started. Open the tunnel URL shown above on your phone.\n')
  process.stdout.write('Press Ctrl+C to stop preview and tunnel.\n\n')
})
