/**
 * Uruchamia razem serwer aplikacji i serwer kompilacji.
 *
 * Bez kompilatora aplikacja pozwala tylko ogladac gotowe przyklady, wiec
 * domyslne `npm run dev` startuje oba procesy. Sam interfejs mozna uruchomic
 * poleceniem `npm run dev:web`, a sam kompilator `npm run kompilator`.
 */

import { spawn } from 'node:child_process'

const processes = [
  { name: 'aplikacja', command: 'npm', args: ['run', 'dev:web'] },
  { name: 'kompilator', command: 'node', args: ['tools/compile-server/server.mjs'] },
]

const children = processes.map(({ name, command, args }) => {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: true })
  const prefix = (line) => `[${name}] ${line}`
  child.stdout.on('data', (chunk) => process.stdout.write(String(chunk).replace(/^/gm, prefix(''))))
  child.stderr.on('data', (chunk) => process.stderr.write(String(chunk).replace(/^/gm, prefix(''))))
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) console.error(`[${name}] zakończony kodem ${code}`)
  })
  return child
})

const stopAll = () => {
  for (const child of children) child.kill()
  process.exit(0)
}

process.on('SIGINT', stopAll)
process.on('SIGTERM', stopAll)
