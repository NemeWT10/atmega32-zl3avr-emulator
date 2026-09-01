// Tymczasowy sprawdzian: czy KAZDY dolaczony przyklad buduje sie kompilatorem
// w przegladarce i jak wynik ma sie do tego samego kodu zbudowanego prawdziwym
// avr-gcc. Uruchamiany recznie pod /probe-examples.html.
import { EXAMPLES } from './examples'
import { WasmAvrClang } from './ide/wasm/WasmAvrClang'
import { RemoteAvrGcc } from './ide/toolchain'

const log = document.getElementById('log') as HTMLElement
log.textContent = ''
const say = (text: string) => {
  log.textContent += text + '\n'
}

/** Liczba bajtow zapisana w pliku Intel HEX - do porownania obu kompilatorow. */
function hexBytes(hex: string): number {
  let total = 0
  for (const line of hex.split(/\r?\n/)) {
    if (!line.startsWith(':')) continue
    const count = parseInt(line.slice(1, 3), 16)
    const type = parseInt(line.slice(7, 9), 16)
    if (type === 0) total += count
  }
  return total
}

const browser = new WasmAvrClang()
const server = new RemoteAvrGcc()

const results: Record<string, unknown>[] = []
const serverStatus = await server.status()
say(`serwer avr-gcc: ${serverStatus.available ? serverStatus.label : 'niedostępny'}`)
say('')
say('przykład         clang        avr-gcc      różnica   ostrzeżenia')
say('─'.repeat(70))

for (const example of EXAMPLES) {
  const started = performance.now()
  const mine = await browser.compile(example.files)
  const ms = Math.round(performance.now() - started)
  const errors = mine.diagnostics.filter((d) => d.severity === 'error')
  const warnings = mine.diagnostics.filter((d) => d.severity === 'warning')

  let reference = 0
  if (serverStatus.available) {
    const theirs = await server.compile(example.files)
    reference = theirs.hex ? hexBytes(theirs.hex) : 0
  } else {
    reference = hexBytes(example.hex)
  }

  const size = mine.hex ? hexBytes(mine.hex) : 0
  const delta = reference ? `${size >= reference ? '+' : ''}${size - reference} B` : '—'
  say(
    `${example.id.padEnd(16)} ${(mine.ok ? `${size} B` : 'BŁĄD').padEnd(12)} ` +
      `${`${reference} B`.padEnd(12)} ${delta.padEnd(9)} ${warnings.length}  (${ms} ms)`,
  )
  for (const error of errors) say(`    BŁĄD ${error.file ?? '?'}:${error.line} ${error.message}`)
  for (const warning of warnings.slice(0, 3))
    say(`    ostrz. ${warning.file ?? '?'}:${warning.line} ${warning.message}`)

  results.push({ id: example.id, ok: mine.ok, size, reference, errors: errors.length })
}

const failed = results.filter((r) => !r.ok)
say('')
say(failed.length === 0 ? '=== WSZYSTKIE PRZYKLADY SIE BUDUJA ===' : `=== NIEUDANE: ${failed.length} ===`)
;(window as unknown as Record<string, unknown>).__results = results
