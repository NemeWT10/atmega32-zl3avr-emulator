/**
 * Zaplecze kompilacji dzialajace w SAMEJ PRZEGLADARCE.
 *
 * Cala robota dzieje sie w wątku roboczym (`toolchain.worker.ts`); tutaj
 * zostaje rozmowa z nim i przetlumaczenie tego, co wypisaly narzedzia,
 * na liste problemow przy odpowiednich liniach kodu.
 *
 * Roznice wzgledem prawdziwego avr-gcc opisuje `docs/spikes/spike-1-toolchain-wasm.md`.
 * Najwazniejsza: to inny kompilator, wiec komunikaty maja INNE BRZMIENIE.
 * Dlatego parser rozumie oba dialekty, a tabela wyjasnien po polsku
 * (`explainCompilerMessage`) dopasowuje sie do obu.
 */

import type {
  CompileResult,
  CompilerDiagnostic,
  SourceFile,
  ToolchainBackend,
  ToolchainStatus,
} from '../toolchain'
import { explainCompilerMessage } from '../compiler-messages'
import type { WorkerResult } from './toolchain.worker'

/** Katalog z narzedziami; `base: './'` w Vite, wiec liczymy od adresu strony. */
function artifactsUrl(): string {
  return new URL('toolchain/', document.baseURI).href
}

/**
 * Ile czekamy na kompilacje, zanim uznamy, ze narzedzie sie zaciela.
 * Pierwsze uruchomienie pobiera i kompiluje 60 MB WebAssembly, wiec
 * nie moze to byc kilka sekund; kolejne mieszcza sie w ulamku sekundy.
 */
const TIMEOUT_MS = 180_000

export class WasmAvrClang implements ToolchainBackend {
  private worker: Worker | null = null
  private nextId = 1
  private pending = new Map<number, (result: WorkerResult) => void>()
  private known: ToolchainStatus | null = null

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(new URL('./toolchain.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (event: MessageEvent<WorkerResult | { type: 'warm' }>) => {
      if (event.data.type !== 'result') return
      const resolve = this.pending.get(event.data.id)
      if (resolve) {
        this.pending.delete(event.data.id)
        resolve(event.data)
      }
    }
    this.worker = worker
    return worker
  }

  /** Zwolnienie watku - po awarii startujemy od czysta. */
  private reset(): void {
    this.worker?.terminate()
    this.worker = null
    this.pending.clear()
  }

  async status(): Promise<ToolchainStatus> {
    if (this.known) return this.known
    try {
      // Wystarczy sprawdzic, czy najwiekszy plik w ogole jest wydany razem
      // z aplikacja - bez niego nie ma z czego kompilowac.
      const response = await fetch(`${artifactsUrl()}clang.wasm`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(4000),
      })
      this.known = response.ok
        ? { available: true, label: 'clang w przeglądarce (WebAssembly)' }
        : { available: false, label: 'brak kompilatora w przeglądarce' }
    } catch {
      this.known = { available: false, label: 'brak kompilatora w przeglądarce' }
    }
    return this.known
  }

  /** Pobranie narzedzi z wyprzedzeniem, zeby pierwsza budowa nie czekala na 60 MB. */
  warmUp(): void {
    try {
      this.ensureWorker().postMessage({ type: 'warm', baseUrl: artifactsUrl() })
    } catch {
      /* brak Workerow - `compile` powie o tym wprost */
    }
  }

  async compile(files: SourceFile[]): Promise<CompileResult> {
    const sources = files.filter((file) => file.path.toLowerCase().endsWith('.c'))
    if (sources.length === 0) return noSources(files)

    const id = this.nextId++
    let result: WorkerResult
    try {
      result = await new Promise<WorkerResult>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.reset()
          reject(new Error('przekroczony czas kompilacji'))
        }, TIMEOUT_MS)
        this.pending.set(id, (value) => {
          clearTimeout(timer)
          resolve(value)
        })
        this.ensureWorker().postMessage({
          type: 'compile',
          id,
          baseUrl: artifactsUrl(),
          files: files.map((file) => ({ path: file.path, content: file.content })),
        })
      })
    } catch (error) {
      return {
        ok: false,
        diagnostics: [
          notice(
            'Kompilator w przeglądarce nie odpowiedział. Odśwież stronę i spróbuj ponownie — ' +
              'a jeśli to się powtarza, uruchom kompilator lokalny poleceniem `npm run kompilator`.',
          ),
        ],
        log: String(error),
      }
    }

    const diagnostics = parseToolOutput(result.log).map(withExplanation)
    if (!result.ok && diagnostics.every((item) => item.severity !== 'error')) {
      diagnostics.push(notice('Budowanie nie powiodło się, ale kompilator nie podał przyczyny.'))
    }

    return {
      ok: result.ok,
      hex: result.hex,
      diagnostics,
      size: result.sections ?? undefined,
      log: result.log,
    }
  }
}

// ---------------------------------------------------------------------------
// Parser wyjscia clanga, lld i llvm-objcopy
// ---------------------------------------------------------------------------

/**
 * Komunikaty, ktore nic nie wnosza, a wygladaja grozniej niz sa.
 *
 * `>>>` to kontynuacje opisu lld (gdzie symbol byl uzyty). Wciagamy je
 * do poprzedniego komunikatu jako doprecyzowanie, zeby nie mnozyc pozycji
 * na liscie problemow.
 */
const NOISE = [/^\d+ (error|warning)s? generated\.$/, /^lld: warning: cannot find entry symbol/]

/** Sciezka wewnetrzna wirtualnego systemu plikow -> sciezka w projekcie studenta. */
function projectPath(path: string): string | null {
  const cleaned = path.replace(/\\/g, '/')
  if (cleaned.startsWith('/src/')) return cleaned.slice(5)
  // Naglowki avr-libc i pliki posrednie - student nie ma do nich dostepu.
  if (cleaned.startsWith('/avr/') || /^\/o\d+\.o$/.test(cleaned) || cleaned.startsWith('/out.'))
    return null
  return cleaned.replace(/^\//, '')
}

export function parseToolOutput(text: string): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = []
  let last: CompilerDiagnostic | null = null
  let includedFrom: { file: string; line: number } | null = null

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd()
    if (line === '' || NOISE.some((pattern) => pattern.test(line))) continue

    // Podkreslenia clanga („   ~~~^~~~”) i przepisana linia zrodlowa -
    // w edytorze i tak widac to miejsce zaznaczone.
    if (/^\s/.test(raw) && !/^\s*(from|>>>)/.test(raw)) continue

    // „In file included from /src/main.c:2:” - miejsce w KODZIE UZYTKOWNIKA,
    // do ktorego trzeba przeniesc komunikat wypisany z naglowka biblioteki.
    //
    // Lancuch dolaczen bywa kilkupietrowy (`main.c` -> `avr/delay.h` ->
    // `util/delay.h`) i wypisywany jest od zewnatrz do srodka. Zapamietujemy
    // WYLACZNIE pierwsze ogniwo nalezace do projektu: tylko tam student moze
    // cokolwiek zmienic. Gdyby kolejne pietra je nadpisaly, ostrzezenie
    // „F_CPU not defined” wskazywaloby wnetrze biblioteki zamiast linii
    // z `#include`, ktora je wywolala.
    const included = /^(?:In file included from|\s+from)\s+(.+?):(\d+)[:,]/.exec(line)
    if (included) {
      const file = projectPath(included[1])
      if (file && !includedFrom) includedFrom = { file, line: Number(included[2]) }
      continue
    }

    // lld: „>>> referenced by main.c” - doprecyzowanie poprzedniego bledu.
    const continuation = /^>>>\s*(.*)$/.exec(line)
    if (continuation) {
      const detail = continuation[1].trim()
      if (last && detail) last.note = last.note ? `${last.note}\n${detail}` : detail
      continue
    }

    // clang: „plik:linia:kolumna: rodzaj: tresc”
    const located = /^(.+?):(\d+):(?:(\d+):)?\s*(error|warning|note|fatal error):\s*(.*)$/.exec(line)
    if (located) {
      const [, file, lineNumber, column, kind, message] = located
      const owned = projectPath(file)
      const entry: CompilerDiagnostic = {
        file: owned,
        line: Number(lineNumber),
        column: Number(column ?? 1),
        severity: kind === 'warning' ? 'warning' : kind === 'note' ? 'info' : 'error',
        message,
      }

      // Komunikat z naglowka biblioteki przenosimy na linie z `#include` -
      // tylko tam student moze cokolwiek zmienic.
      if (!owned && includedFrom) {
        entry.file = includedFrom.file
        entry.line = includedFrom.line
        entry.column = 1
        entry.note = `Komunikat pochodzi z nagłówka ${file.split('/').pop()} dołączonego w tej linii.`
      }

      // „note” to doprecyzowanie poprzedniego problemu, nie osobna pozycja.
      if (kind === 'note' && last) {
        last.note = last.note ? `${last.note}\n${message}` : message
      } else {
        diagnostics.push(entry)
        last = entry
      }
      // Lancuch dolaczen dotyczyl tego komunikatu; nastepny ma swoj wlasny.
      includedFrom = null
      continue
    }

    // lld: „lld: error: undefined symbol: nazwa”
    const linker = /^lld:\s*(error|warning):\s*(.*)$/.exec(line)
    if (linker) {
      const symbol = /undefined symbol:\s*(.+)$/.exec(linker[2])
      const entry: CompilerDiagnostic = {
        file: null,
        line: 1,
        column: 1,
        severity: linker[1] === 'warning' ? 'warning' : 'error',
        message: symbol ? `Nie znaleziono definicji „${symbol[1]}” (undefined symbol).` : linker[2],
      }
      diagnostics.push(entry)
      last = entry
      continue
    }

    // Pozostale bledy bez lokalizacji (np. llvm-objcopy).
    if (/\berror\b/i.test(line)) {
      const entry = notice(line)
      diagnostics.push(entry)
      last = entry
    }
  }

  return diagnostics
}

function notice(message: string): CompilerDiagnostic {
  return { file: null, line: 1, column: 1, severity: 'error', message }
}

function withExplanation(diagnostic: CompilerDiagnostic): CompilerDiagnostic {
  const hint = explainCompilerMessage(diagnostic.message)
  if (!hint) return diagnostic
  return { ...diagnostic, note: diagnostic.note ? `${diagnostic.note}\n${hint}` : hint }
}

function noSources(files: SourceFile[]): CompileResult {
  const onlyHeaders = files.some((file) => file.path.endsWith('.h'))
  return {
    ok: false,
    diagnostics: [
      notice(
        'W projekcie nie ma żadnego pliku z rozszerzeniem .c, a to w nich pisze się program. ' +
          (onlyHeaders
            ? 'Pliki .h to tylko nagłówki — same z siebie nic nie robią. Dodaj plik main.c z funkcją main().'
            : 'Dodaj plik main.c przyciskiem „+ Plik”.'),
      ),
    ],
    log: '',
  }
}
