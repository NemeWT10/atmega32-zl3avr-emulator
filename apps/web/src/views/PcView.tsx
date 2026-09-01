import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSimulator } from '../sim/SimulationContext'
import { PythonHost, sharedMemoryAvailable, type PythonState } from '../pc/PythonHost'
import type { Project } from '../ide/project'

/**
 * „Komputer PC” po drugiej stronie kabla szeregowego.
 *
 * Na zajeciach plytka nie pracuje sama: obok stoi komputer, na ktorym chodzi
 * skrypt w Pythonie. Odbiera ramki, rozklada je na pola i odsyla odpowiedz.
 * Bez tej strony cwiczenie z ramkami dwojkowymi jest polowa zadania - widac
 * bajty w terminalu, ale nie widac, co one znacza.
 *
 * Skrypt chodzi w prawdziwym CPythonie (Pyodide) i BEZ ZMIAN: te same wywolania
 * `serial.Serial()`, `read()` i `input()` co na komputerze w laboratorium.
 *
 * Z dolaczonych cwiczen korzysta z tego JEDNO - L7, ramki dwojkowe - i mowimy
 * o tym wprost. Zakladka, ktora dla wiekszosci zadan nie robi nic, bez takiej
 * informacji wyglada na zepsuta albo na cos, o czym sie zapomnialo.
 */

interface Props {
  project: Project
}

export function PcView({ project }: Props) {
  const simulator = useSimulator()
  const [state, setState] = useState<PythonState>('stopped')
  const [output, setOutput] = useState('')
  const [prompt, setPrompt] = useState<string | null>(null)
  const [line, setLine] = useState('')
  const outputRef = useRef<HTMLPreElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  /**
   * Pliki `.py` widziane w tej chwili.
   *
   * Musi to byc SUBSKRYPCJA, a nie jednorazowe policzenie: plik dodaje sie
   * na zakladce IDE, czyli w zupelnie innym miejscu drzewa widokow. Bez
   * nasluchiwania nowy skrypt pojawialby sie na liscie dopiero po przeladowaniu
   * strony - a przecietny wniosek z tego jest taki, ze przycisk „+ Plik" nie dziala.
   */
  const [scripts, setScripts] = useState(() =>
    project.list().filter((file) => file.path.endsWith('.py')),
  )
  useEffect(
    () =>
      project.subscribe(() => {
        const next = project.list().filter((file) => file.path.endsWith('.py'))
        setScripts((previous) => {
          const same =
            previous.length === next.length &&
            previous.every((file, index) => file.path === next[index].path)
          // Ta sama lista bez zmian - inaczej przerysowywalibysmy sie przy
          // kazdym nacisnieciu klawisza w edytorze.
          return same ? previous : next
        })
      }),
    [project],
  )
  const [entry, setEntry] = useState('')
  const chosen = scripts.find((file) => file.path === entry)?.path ?? scripts[0]?.path ?? ''

  const host = useMemo(
    () =>
      new PythonHost(simulator, {
        onOutput: (text) => setOutput((previous) => previous + text),
        onState: setState,
        onPrompt: setPrompt,
      }),
    [simulator],
  )

  useEffect(() => () => host.stop(), [host])

  // Nowe wiersze przewijaja okno do dolu - tak samo jak konsola systemowa.
  useEffect(() => {
    const box = outputRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [output])

  // Skoro skrypt czeka na wpis, kursor ma tam stanac sam.
  useEffect(() => {
    if (prompt !== null) inputRef.current?.focus()
  }, [prompt])

  const run = useCallback(() => {
    setOutput('')
    if (!simulator.powered) simulator.setPower(true)
    host.start(project.list(), chosen)
  }, [host, project, chosen, simulator])

  const send = useCallback(() => {
    host.submitLine(line)
    setOutput((previous) => previous + line + '\n')
    setLine('')
  }, [host, line])

  const isolated = sharedMemoryAvailable()
  const running = state !== 'stopped'

  return (
    <div className="pc-view">
      <div className="pc-toolbar">
        <button className="primary" onClick={run} disabled={running || !chosen || !isolated}>
          {state === 'starting' ? 'Uruchamiam Pythona…' : 'Uruchom skrypt'}
        </button>
        <button onClick={() => host.stop()} disabled={!running}>
          Zatrzymaj
        </button>

        <label className="inline-select">
          Plik:
          <select value={chosen} onChange={(event) => setEntry(event.target.value)} disabled={running}>
            {scripts.length === 0 && <option value="">— brak plików .py —</option>}
            {scripts.map((file) => (
              <option key={file.path} value={file.path}>
                {file.path}
              </option>
            ))}
          </select>
        </label>

        <span className="spacer" />
        <span className={'pc-state pc-state-' + state}>
          {state === 'stopped' && 'zatrzymany'}
          {state === 'starting' && 'wczytuję Pythona…'}
          {state === 'running' && 'pracuje'}
          {state === 'waiting-input' && 'czeka na Twój wpis'}
        </span>
      </div>

      {!isolated ? (
        <div className="pc-warning">
          <strong>Python nie może tu wystartować.</strong>
          <p>
            Skrypt z ćwiczenia musi umieć <em>czekać</em> — na ramkę z płytki i na liczbę, którą
            wpiszesz. Przeglądarka pozwala na to tylko wtedy, gdy strona przyszła z odpowiednimi
            nagłówkami, a w tej chwili tak nie jest.
          </p>
          <p>
            Odśwież stronę. Jeśli to nie pomoże, otwórz aplikację przez adres
            <code> http://…</code>, a nie z pliku na dysku.
          </p>
        </div>
      ) : (
        <p className="pc-hint">
          <span className="pc-lab-badge">Używane w ćwiczeniu L7 — ramki binarne</span>
          To jest komputer stojący obok płytki, połączony z nią kablem szeregowym. Skrypt czyta
          z tego kabla ramki, rozkłada je na pola i odsyła odpowiedź — dokładnie tak jak na
          zajęciach. Nazwa portu w kodzie (<code>COM15</code>) nie ma tu znaczenia: kabel jest
          zawsze ten sam. Przy pozostałych ćwiczeniach ta zakładka jest po prostu niepotrzebna.
        </p>
      )}

      <pre className="pc-output" ref={outputRef}>
        {output || (isolated ? emptyHint(scripts.length > 0) : '')}
      </pre>

      <form
        className={'pc-input' + (prompt === null ? ' idle' : '')}
        onSubmit={(event) => {
          event.preventDefault()
          if (prompt !== null) send()
        }}
      >
        <label htmlFor="pc-line">{prompt === null ? 'Skrypt nic teraz nie czyta' : 'Skrypt czeka na wpis'}</label>
        <span className="pc-prompt">›</span>
        <input
          id="pc-line"
          ref={inputRef}
          value={line}
          onChange={(event) => setLine(event.target.value)}
          disabled={prompt === null}
          placeholder={prompt === null ? '' : 'wpisz i naciśnij Enter'}
          autoComplete="off"
        />
        <button type="submit" className="primary" disabled={prompt === null}>
          Wyślij (Enter)
        </button>
      </form>
    </div>
  )
}

/**
 * Co pokazac w pustym oknie wyjscia.
 *
 * Bez pliku `.py` przycisk „Uruchom skrypt” jest wygaszony i nic nie tlumaczy,
 * dlaczego - a to najczestszy stan tej zakladki, bo skrypt niesie tylko jedno
 * cwiczenie. Zamiast pustki mowimy wprost, skad go wziac.
 */
function emptyHint(hasScript: boolean): string {
  if (hasScript) return 'Naciśnij „Uruchom skrypt”.'
  return [
    'W projekcie nie ma żadnego pliku .py, więc nie ma czego uruchomić.',
    '',
    'Skryptu po stronie komputera używa ćwiczenie L7 („ramki binarne”).',
    'Wczytaj je z listy „Gotowe przykłady” w górnym pasku — przyjdzie razem',
    'z gotowym plikiem script.py.',
    '',
    'Własny plik .py możesz też dodać na zakładce IDE przyciskiem „+ Plik”.',
  ].join('\n')
}
