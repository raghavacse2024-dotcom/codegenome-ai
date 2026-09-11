import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Finds the first available local port at or above the requested port.
 * @param {number} startPort First port to test.
 * @returns {Promise<number>} Available port.
 */
function findAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    const tester = net.createServer()
    tester.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        findAvailablePort(startPort + 1).then(resolve, reject)
      } else {
        reject(error)
      }
    })
    tester.once('listening', () => tester.close(() => resolve(startPort)))
    tester.listen(startPort, '0.0.0.0')
  })
}

/**
 * Starts a child process with inherited stdio so dev errors stay visible.
 * @param {string} command Command to run.
 * @param {string[]} args Command arguments.
 * @param {NodeJS.ProcessEnv} env Environment overrides.
 * @returns {import('node:child_process').ChildProcess} Spawned process.
 */
function start(command, args, env) {
  return spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit' })
}

const apiPort = await findAvailablePort(Number(process.env.PORT || 3001))
const webPort = await findAvailablePort(5173)
const env = { PORT: String(apiPort), VITE_API_URL: '' }

console.log(`CodeGenome API: http://localhost:${apiPort}`)
console.log(`CodeGenome web: http://localhost:${webPort}`)

const api = start(process.execPath, ['--watch', 'server/index.js'], env)
const viteEntry = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const web = start(process.execPath, [viteEntry, '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], env)

/**
 * Stops both child processes when the dev launcher exits.
 */
function stopAll() {
  api.kill()
  web.kill()
}

api.on('exit', (code) => {
  if (code && code !== 0) process.exitCode = code
})
web.on('exit', (code) => {
  if (code && code !== 0) process.exitCode = code
})
process.on('SIGINT', () => {
  stopAll()
  process.exit()
})
process.on('SIGTERM', () => {
  stopAll()
  process.exit()
})
