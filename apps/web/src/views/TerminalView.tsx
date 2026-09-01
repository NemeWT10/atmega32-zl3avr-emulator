import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useSimulator, useSimulatorEvents } from '../sim/SimulationContext'

/**
 * Terminal po stronie "komputera PC" - odpowiednik PuTTY z laboratorium.
 *
 * Terminal ma WLASNA predkosc transmisji. Jesli mikrokontroler nadaje z inna
 * (bo `#define F_CPU` nie zgadza sie z fuse bitami), na ekranie pojawia sie
 * smieci i bledy ramki - i o to chodzi. Pasek nad ekranem pokazuje obie
 * predkosci obok siebie, zeby student mial szanse zobaczyc przyczyne.
 */

const BAUD_RATES = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200]

interface Props {
  /**
   * Wersja skrocona - terminal zadokowany pod plytka. Ta sama tresc i te same
   * ustawienia, tylko ciasniej upakowane.
   */
  compact?: boolean
}

export function TerminalView({ compact = false }: Props = {}) {
  const simulator = useSimulator()
  useSimulatorEvents(['serial', 'state'], 20)

  const [input, setInput] = useState('')
  const [hexMode, setHexMode] = useState(false)
  const [localEcho, setLocalEcho] = useState(false)
  const [baud, setBaud] = useState(simulator.board.rs232.baud)
  const outputRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    simulator.board.rs232.baud = baud
  }, [simulator, baud])

  useEffect(() => {
    const element = outputRef.current
    if (element) element.scrollTop = element.scrollHeight
  })

  const received = simulator.serialFromBoard
  const frameErrors = received.filter((item) => item.frameError).length

  /**
   * Wlasne echo: to, co wysylamy, dopisujemy do okna sami.
   *
   * Prawdziwy terminal nie wyswietla wpisanego tekstu - pokazuje wylacznie to,
   * co przyszlo z drugiej strony. Gdy plytka odsyla echo, tekst widac raz.
   * Gdy nie odsyla, okno wyglada, jakby nic sie nie wyslalo - i wtedy wlasnie
   * przydaje sie ta opcja.
   */
  const [echoed, setEchoed] = useState<{ after: number; text: string }[]>([])
  useEffect(() => {
    if (!localEcho) setEchoed([])
  }, [localEcho])

  const text = hexMode
    ? received
        .map((item, index) => {
          const hex = item.byte.toString(16).padStart(2, '0')
          return index % 16 === 15 ? `${hex}\n` : `${hex} `
        })
        .join('')
    : received.map((item) => renderChar(item.byte)).join('')

  const send = () => {
    if (!input) return
    simulator.sendToBoard(input)
    // Zapamietujemy, ile bajtow przyszlo do tej pory - dzieki temu wlasny tekst
    // trafi w oknie dokladnie tam, gdzie zostal wyslany, a nie na sam koniec.
    if (localEcho) setEchoed((previous) => [...previous, { after: received.length, text: input }])
    setInput('')
  }

  const mcuBaud = simulator.mcu.usart.actualBaud
  // O rozjezdzie predkosci mowimy dopiero wtedy, gdy program naprawde wlaczyl
  // transmisje. Po resecie UBRR = 0 i „predkosc” wychodzi absurdalna - bez tego
  // warunku pasek straszylby rozjazdem, zanim cokolwiek zostanie wgrane.
  const usartOn = simulator.powered && simulator.mcu.usart.enabled
  const mismatch = usartOn && Number.isFinite(mcuBaud) && Math.abs(mcuBaud - baud) / baud > 0.03

  return (
    <div className={'terminal-view' + (compact ? ' compact' : '')}>
      <div className="terminal-toolbar">
        <label className="inline-select">
          Prędkość terminala:
          <select value={baud} onChange={(event) => setBaud(Number(event.target.value))}>
            {BAUD_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate} 8N1
              </option>
            ))}
          </select>
        </label>

        <label className="checkbox">
          <input type="checkbox" checked={hexMode} onChange={(event) => setHexMode(event.target.checked)} />
          tryb szesnastkowy (ramki binarne)
        </label>

        <label className="checkbox">
          <input type="checkbox" checked={localEcho} onChange={(event) => setLocalEcho(event.target.checked)} />
          echo lokalne
        </label>

        <span className="spacer" />
        <button onClick={() => simulator.clearSerial()}>Wyczyść</button>
      </div>

      <div className={'baud-bar' + (mismatch ? ' mismatch' : '')}>
        <span>
          Mikrokontroler nadaje:{' '}
          <strong>{usartOn && Number.isFinite(mcuBaud) ? `${Math.round(mcuBaud)} Bd` : '— (transmisja niewłączona)'}</strong>
        </span>
        <span>
          Terminal nasłuchuje: <strong>{baud} Bd</strong>
        </span>
        {frameErrors > 0 && <span className="errors">błędy ramki: {frameErrors}</span>}
        {mismatch && (
          <span className="mismatch-hint">
            Prędkości się nie zgadzają — na ekranie pojawią się śmieci. Sprawdź, czy{' '}
            <code>#define F_CPU</code> odpowiada zegarowi wybranemu w fuse bitach.
          </span>
        )}
        {usartOn && !simulator.board.jumpers.JP4 && (
          <span className="mismatch-hint">
            Zworka JP4 „RxD Enable” jest rozwarta — płytka nic nie odbiera (nadawanie działa).
          </span>
        )}
        {!simulator.powered && (
          <span className="mismatch-hint">
            Płytka jest wyłączona — nic nie nadaje i nic nie odbierze. Włącz zasilanie
            przyciskiem w pasku u góry.
          </span>
        )}
        {simulator.powered && !simulator.loadedProgram && (
          <span className="mismatch-hint">
            W mikrokontrolerze nie ma jeszcze żadnego programu — najpierw naciśnij „Zbuduj i wgraj”
            albo wczytaj gotowy przykład.
          </span>
        )}
      </div>

      <pre className="terminal-output" ref={outputRef}>
        {echoed.length === 0
          ? text || <EmptyHint powered={simulator.powered} />
          : renderWithEcho(received, echoed, hexMode)}
      </pre>

      {/*
        Wiersz wysylania celowo krzyczy: ramka w kolorze akcentu, znak zachety
        i wlasny podpis. Wczesniej byl to zwykly pasek w kolorze reszty panelu
        i po prostu ginal - uzytkownicy go nie zauwazali.
      */}
      <form
        className="terminal-input"
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
      >
        <label className="terminal-input-label" htmlFor="terminal-send">
          Wyślij do płytki
        </label>
        <div className="terminal-input-row">
          <span className="terminal-prompt" aria-hidden="true">
            ›
          </span>
          <input
            id="terminal-send"
            value={input}
            placeholder={
              simulator.powered
                ? 'wpisz tekst i naciśnij Enter…'
                : 'płytka jest wyłączona — włącz zasilanie, żeby cokolwiek wysłać'
            }
            disabled={!simulator.powered}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              // Enter wysyla, nie czekajac na domyslne zatwierdzenie formularza.
              if (event.key === 'Enter') {
                event.preventDefault()
                send()
              }
            }}
          />
          <button type="submit" className="primary" disabled={!simulator.powered || input === ''}>
            Wyślij (Enter)
          </button>
        </div>
      </form>
    </div>
  )
}

/**
 * Co pokazac, dopoki plytka nic nie nadala.
 *
 * Samo „brak danych z plytki” zostawialo studenta z pytaniem, czy cos jest
 * zepsute. Najczestsza przyczyna pustego okna wcale nie jest usterka: program
 * odzywa sie DOPIERO w odpowiedzi na wyslany znak, a klawiatura 4x4 na plytce
 * nie ma z terminalem nic wspolnego - czyta ja program, nie lacze szeregowe.
 */
function EmptyHint({ powered }: { powered: boolean }) {
  return (
    <span className="terminal-empty">
      Płytka nic jeszcze nie nadała.
      {'\n\n'}
      {powered
        ? 'Wiele programów odzywa się dopiero w odpowiedzi na znak z terminala — wpisz coś w polu na dole i naciśnij Enter.'
        : 'Najpierw włącz zasilanie płytki.'}
      {'\n'}
      Klawiatura 4×4 na płytce nie wysyła nic do terminala — czyta ją program, a nie łącze szeregowe.
    </span>
  )
}

/**
 * Sklada zawartosc okna z tego, co przyszlo z plytki, i z wlasnego echa.
 *
 * Wlasny tekst wyroznia sie kolorem, zeby od razu bylo widac, co napisal
 * uzytkownik, a co odpowiedziala plytka - bez tego przy programie odsylajacym
 * echo nie da sie tego rozroznic.
 */
function renderWithEcho(
  received: { byte: number }[],
  echoed: { after: number; text: string }[],
  hexMode: boolean,
): ReactNode[] {
  const nodes: ReactNode[] = []
  let position = 0

  const chunk = (from: number, to: number) => {
    if (to <= from) return
    const part = received.slice(from, to)
    const rendered = hexMode
      ? part.map((item) => item.byte.toString(16).padStart(2, '0')).join(' ') + ' '
      : part.map((item) => renderChar(item.byte)).join('')
    nodes.push(<span key={`r-${from}`}>{rendered}</span>)
  }

  echoed.forEach((entry, index) => {
    chunk(position, entry.after)
    position = entry.after
    nodes.push(
      <span key={`e-${index}`} className="terminal-echo">
        {entry.text}
      </span>,
    )
  })
  chunk(position, received.length)

  return nodes
}

function renderChar(byte: number): string {
  if (byte === 0x0a || byte === 0x0d || byte === 0x09) return String.fromCharCode(byte)
  if (byte < 0x20 || byte > 0x7e) return `·`
  return String.fromCharCode(byte)
}
