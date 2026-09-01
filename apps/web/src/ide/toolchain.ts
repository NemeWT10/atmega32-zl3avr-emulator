/**
 * Kompilacja kodu studenta.
 *
 * Warstwa abstrakcji, bo kompilator moze pochodzic z roznych miejsc:
 *
 *   RemoteAvrGcc  - lokalny serwer uruchamiajacy PRAWDZIWY avr-gcc
 *                   (tools/compile-server). Daje pelna zgodnosc z Microchip
 *                   Studio, bo to doslownie ten sam kompilator.
 *   WasmAvrClang  - clang, lld i llvm-objcopy zbudowane do WebAssembly,
 *                   pracujace w samej przegladarce. Nie wymaga niczego poza
 *                   otwarciem strony.
 *
 * Aplikacja rozmawia tylko z tym interfejsem, wiec podmiana zaplecza
 * nie dotknie reszty kodu.
 *
 * KOLEJNOSC WYBORU: najpierw serwer, potem przegladarka. Nie dlatego, ze serwer
 * jest wygodniejszy - jest mniej wygodny - tylko dlatego, ze to ten sam avr-gcc,
 * ktorym student zbuduje program na zajeciach. Gdy serwera nie ma, clang
 * w przegladarce robi to samo zadanie innym kodem wynikowym; roznice opisuje
 * `docs/spikes/spike-1-toolchain-wasm.md`. Pasek stanu mowi wprost, ktory
 * kompilator pracuje - to nie moze byc niespodzianka.
 */

import { explainCompilerMessage } from './compiler-messages'
import { WasmAvrClang } from './wasm/WasmAvrClang'

export { explainCompilerMessage }

export interface CompilerDiagnostic {
  /** Nazwa pliku albo `null`, gdy komunikat nie dotyczy konkretnego miejsca. */
  file: string | null
  line: number
  column: number
  severity: 'error' | 'warning' | 'info'
  message: string
  /** Doprecyzowanie od kompilatora (linie „note”). */
  note?: string
}

export interface CompileResult {
  ok: boolean
  /** Zawartosc pliku Intel HEX gotowa do wgrania. */
  hex?: string
  diagnostics: CompilerDiagnostic[]
  /** Zajetosc pamieci: kod, dane zainicjowane, dane niezainicjowane. */
  size?: { text: number; data: number; bss: number }
  log: string
}

export interface SourceFile {
  path: string
  content: string
}

export interface ToolchainStatus {
  available: boolean
  label: string
}

export interface ToolchainBackend {
  status(): Promise<ToolchainStatus>
  compile(files: SourceFile[]): Promise<CompileResult>
}

const DEFAULT_URL =
  (import.meta.env.VITE_COMPILER_URL as string | undefined) ?? 'http://localhost:5174'

/**
 * Czy w ogole ma sens pytac o serwer kompilacji.
 *
 * Serwer stoi na `localhost:5174`, czyli NA MASZYNIE UZYTKOWNIKA. Ma to sens,
 * gdy ktos pracuje u siebie. Nie ma zadnego, gdy aplikacja przyszla z internetu:
 * strona z adresu publicznego pytalaby wtedy komputer kazdego odwiedzajacego,
 * czy przypadkiem czegos u siebie nie uruchomil. Przegladarki traktuja takie
 * zapytania podejrzliwie (dostep z sieci publicznej do lokalnej), wiec konczy sie
 * to w najlepszym razie zmarnowana chwila przed przelaczeniem na kompilator
 * w przegladarce, a w gorszym ostrzezeniem w konsoli.
 *
 * Wlasny adres serwera podany przez `VITE_COMPILER_URL` respektujemy zawsze -
 * skoro ktos go ustawil przy budowaniu, to wie, co robi.
 */
function localCompilerPlausible(): boolean {
  if (import.meta.env.VITE_COMPILER_URL) return true
  const host = location.hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === ''
}

export class RemoteAvrGcc implements ToolchainBackend {
  constructor(private readonly baseUrl: string = DEFAULT_URL) {}

  async status(): Promise<ToolchainStatus> {
    try {
      const response = await fetch(`${this.baseUrl}/status`, { signal: AbortSignal.timeout(2500) })
      if (!response.ok) return { available: false, label: 'serwer kompilacji nie odpowiada' }
      const body = (await response.json()) as { ok: boolean; label: string }
      return { available: body.ok, label: body.label }
    } catch {
      return { available: false, label: 'serwer kompilacji nie jest uruchomiony' }
    }
  }

  async compile(files: SourceFile[]): Promise<CompileResult> {
    try {
      const response = await fetch(`${this.baseUrl}/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
        signal: AbortSignal.timeout(60_000),
      })
      if (!response.ok) {
        return {
          ok: false,
          diagnostics: [notice(`Serwer kompilacji odpowiedział błędem ${response.status}.`)],
          log: '',
        }
      }
      const result = (await response.json()) as CompileResult
      return { ...result, diagnostics: result.diagnostics.map(withExplanation) }
    } catch (error) {
      return {
        ok: false,
        diagnostics: [
          notice(
            'Nie udało się połączyć z kompilatorem. Uruchom go poleceniem ' +
              '`npm run kompilator` w katalogu projektu i spróbuj ponownie.',
          ),
        ],
        log: String(error),
      }
    }
  }
}

function notice(message: string): CompilerDiagnostic {
  return { file: null, line: 1, column: 1, severity: 'error', message }
}


function withExplanation(diagnostic: CompilerDiagnostic): CompilerDiagnostic {
  const hint = explainCompilerMessage(diagnostic.message)
  if (!hint) return diagnostic
  return { ...diagnostic, note: diagnostic.note ? `${diagnostic.note}\n${hint}` : hint }
}

/**
 * Zaplecze wybierane samoczynnie: serwerowy avr-gcc, a gdy go nie ma -
 * clang w przegladarce.
 *
 * Wybor zapada raz, przy pierwszym pytaniu o stan, i zostaje - inaczej
 * projekt zbudowany raz jednym kompilatorem, a raz drugim dawalby
 * niewytlumaczalne roznice w dzialaniu.
 */
class AutoToolchain implements ToolchainBackend {
  private readonly server = new RemoteAvrGcc()
  private readonly browser = new WasmAvrClang()
  private chosen: ToolchainBackend | null = null

  async status(): Promise<ToolchainStatus> {
    if (this.chosen) return this.chosen.status()

    // Wymuszenie zaplecza adresem: `?kompilator=przegladarka` albo `=serwer`.
    // Potrzebne, zeby dalo sie porownac wynik obu kompilatorow tego samego kodu
    // - i zeby test mogl sprawdzic ten w przegladarce mimo dzialajacego serwera.
    const forced = new URLSearchParams(location.search).get('kompilator')
    if (forced === 'przegladarka') {
      this.chosen = this.browser
      this.browser.warmUp()
      return this.browser.status()
    }
    if (forced === 'serwer') {
      this.chosen = this.server
      return this.server.status()
    }

    const server = localCompilerPlausible()
      ? await this.server.status()
      : { available: false, label: 'serwer kompilacji działa tylko przy pracy lokalnej' }
    if (server.available) {
      this.chosen = this.server
      return { available: true, label: server.label }
    }

    const browser = await this.browser.status()
    if (browser.available) {
      this.chosen = this.browser
      // Narzedzia wazą kilkadziesiat megabajtow. Pobieramy je od razu w tle,
      // zeby pierwsze „Zbuduj i wgraj” nie wygladalo na zawieszenie.
      this.browser.warmUp()
      return { available: true, label: browser.label }
    }

    return {
      available: false,
      label: 'nie znaleziono żadnego kompilatora',
    }
  }

  async compile(files: SourceFile[]): Promise<CompileResult> {
    if (!this.chosen) await this.status()
    if (!this.chosen) return this.server.compile(files)
    return this.chosen.compile(files)
  }
}

/** Domyslne zaplecze uzywane przez aplikacje. */
export const toolchain: ToolchainBackend = new AutoToolchain()

/** Krotki opis zajetosci pamieci - ATmega32 ma 32 kB kodu i 2 kB danych. */
export function describeSize(size: CompileResult['size']): string {
  if (!size) return ''
  const flashPercent = Math.round((size.text / (32 * 1024)) * 1000) / 10
  const ramPercent = Math.round(((size.data + size.bss) / (2 * 1024)) * 1000) / 10
  return (
    `kod ${size.text} B (${String(flashPercent).replace('.', ',')}% pamięci programu), ` +
    `dane ${size.data + size.bss} B (${String(ramPercent).replace('.', ',')}% pamięci RAM)`
  )
}
