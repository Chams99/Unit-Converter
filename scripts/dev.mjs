import { spawn, spawnSync } from 'node:child_process'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const turboEntrypoint = path.join(root, 'node_modules', 'turbo', 'bin', 'turbo')

function canListen(host, port) {
  return new Promise((resolve) => {
    const probe = net.createServer()
    const finish = (available) => probe.close(() => resolve(available))

    probe.once('error', () => resolve(false))
    probe.listen({ host, port }, () => finish(true))
  })
}

async function chooseApiEndpoint() {
  const requestedHost = process.env.HOST
  const requestedPort = process.env.PORT ? Number(process.env.PORT) : 8787

  if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535; received ${process.env.PORT}`)
  }

  const host = requestedHost ?? '127.0.0.1'
  if (await canListen(host, requestedPort)) return { host, port: requestedPort }

  if (requestedHost || process.env.PORT) {
    throw new Error(
      `The requested API endpoint ${host}:${requestedPort} is already in use. Set HOST and PORT to an unused endpoint, then run pnpm dev again.`,
    )
  }

  // A stale localhost proxy can own the usual loopback address while the
  // API remains available on the other loopback interface.
  if (await canListen('127.0.0.2', requestedPort)) return { host: '127.0.0.2', port: requestedPort }

  for (let port = requestedPort + 1; port < requestedPort + 100; port += 1) {
    if (await canListen('127.0.0.2', port)) return { host: '127.0.0.2', port }
  }

  throw new Error(`No available loopback API port was found near ${requestedPort}. Set HOST and PORT explicitly, then run pnpm dev again.`)
}

const apiEndpoint = await chooseApiEndpoint()
const devEnv = {
  ...process.env,
  HOST: apiEndpoint.host,
  PORT: String(apiEndpoint.port),
  CONVERTAL_API_URL: process.env.CONVERTAL_API_URL ?? `http://${apiEndpoint.host}:${apiEndpoint.port}`,
}

process.stdout.write(`Dev API: ${devEnv.CONVERTAL_API_URL} (HOST=${apiEndpoint.host}, PORT=${apiEndpoint.port})\n`)

const turbo = spawn(process.execPath, [
  turboEntrypoint,
  'run',
  'dev',
  '--ui=stream',
  '--output-logs=full',
], {
  cwd: root,
  env: devEnv,
  // Turbo's interactive Windows console path can fail under pnpm with
  // 0xC0000409. Piped output keeps the task graph and package scripts intact
  // while giving Turbo a stable non-interactive stream to multiplex.
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})

turbo.stdout.on('data', (chunk) => process.stdout.write(chunk))
turbo.stderr.on('data', (chunk) => process.stderr.write(chunk))

let shuttingDown = false

function stopTurbo() {
  if (shuttingDown || turbo.exitCode !== null || turbo.signalCode !== null) return
  shuttingDown = true

  if (process.platform === 'win32' && turbo.pid) {
    // Turbo starts the API and web watchers as child processes. Kill the owned
    // process tree so Ctrl+C never leaves a port-bound watcher behind.
    spawnSync('taskkill.exe', ['/PID', String(turbo.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    })
    return
  }

  turbo.kill('SIGTERM')
}

process.once('SIGINT', stopTurbo)
process.once('SIGTERM', stopTurbo)

turbo.once('error', (error) => {
  process.stderr.write(`Unable to start the Turbo dev graph: ${error.message}\n`)
  process.exitCode = 1
})

turbo.once('exit', (code, signal) => {
  if (signal && !shuttingDown) process.exitCode = 1
  else if (code !== null) process.exitCode = code
})
