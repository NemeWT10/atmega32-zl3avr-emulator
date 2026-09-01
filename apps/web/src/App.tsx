import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { describeClock } from '@zl3avr/avr-core'
import { IdeView } from './views/IdeView'
import { BoardView } from './views/BoardView'
import { SimulatorView } from './views/SimulatorView'
import { TerminalView } from './views/TerminalView'
import { GuideView } from './views/GuideView'
import { PcView } from './views/PcView'
import { FuseDialog } from './components/FuseDialog'
import { EXAMPLES, type Example, type ExampleGroup } from './examples'
import { demoProject } from './project/demoProject'
import { Project, downloadProject } from './ide/project'
import {
  describeSize,
  toolchain,
  type CompilerDiagnostic,
  type ToolchainStatus,
} from './ide/toolchain'
import { useSimulator, useSimulatorEvents } from './sim/SimulationContext'
import {
  decodePayload,
  loadLocal,
  payloadFromHash,
  payloadToState,
  saveLocal,
  shareUrl,
  type WorkspaceState,
} from './workspace'
import { Atmega32 } from '@zl3avr/avr-core'
import { Board } from '@zl3avr/board'

/**
 * Przyklady pogrupowane wedlug przedmiotu, z ktorego pochodza.
 * Plaska lista kilkunastu pozycji przestala byc czytelna.
 */
const EXAMPLE_GROUPS: [ExampleGroup, Example[]][] = (
  ['Technika mikroprocesorowa', 'Systemy wbudowane'] as ExampleGroup[]
).map((group) => [group, EXAMPLES.filter((example) => example.group === group)])

type ViewId = 'ide' | 'board' | 'simulator' | 'terminal' | 'pc' | 'guide'

const VIEWS: { id: ViewId; label: string; title?: string }[] = [
  { id: 'ide', label: 'IDE' },
  { id: 'board', label: 'Płytka' },
  { id: 'simulator', label: 'Symulator' },
  { id: 'terminal', label: 'Terminal USART' },
  // Komputer stojacy obok plytki. Bez niego cwiczenie z ramkami dwojkowymi jest
  // polowa zadania: widac bajty, ale nie widac, co znacza.
  {
    id: 'pc',
    label: 'Komputer PC',
    title: 'Skrypt w Pythonie po drugiej stronie kabla szeregowego (ćwiczenie L7 — ramki binarne)',
  },
  // Poradnik obslugi trzymamy na koncu: czyta sie go raz, na poczatku,
  // a potem juz nie zaglada. Tresc pochodzi wprost z README.
  { id: 'guide', label: 'README', title: 'Poradnik: od czego zacząć, jak prowadzić przewody, jak oglądać płytkę' },
]

/**
 * Kopiowanie tekstu do schowka - dwoma drogami.
 *
 * Nowoczesne `navigator.clipboard` wymaga bezpiecznego polaczenia i zgody,
 * a odmawia takze wtedy, gdy okno nie ma w danej chwili skupienia. Starsze
 * `execCommand` nie potrzebuje niczego z tych rzeczy, wiec zostaje jako zapas.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // spróbujemy starszą drogą
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.append(area)
    area.select()
    const copied = document.execCommand('copy')
    area.remove()
    return copied
  } catch {
    return false
  }
}

export function App() {
  const simulator = useSimulator()
  // 'tick' jest potrzebny, zeby pasek stanu pokazywal biezacy czas symulacji;
  // 4 klatki na sekunde w zupelnosci wystarcza i nie odbieraja mocy symulacji.
  useSimulatorEvents(['state', 'tick'], 4)

  const project = useMemo(() => new Project(demoProject), [])

  const [view, setView] = useState<ViewId>('ide')
  const [activePath, setActivePath] = useState(demoProject[0].path)
  const [fuseDialogOpen, setFuseDialogOpen] = useState(false)
  const [status, setStatus] = useState('Gotowy. Napisz program i naciśnij „Zbuduj i wgraj”.')
  /**
   * Wydzwiek komunikatu w pasku stanu. Skoro po nieudanym budowaniu nie
   * przerzucamy uzytkownika do edytora, niepowodzenie musi byc widoczne
   * z kazdego miejsca - stad kolor paska, a nie tylko tresc.
   */
  const [statusKind, setStatusKind] = useState<'info' | 'ok' | 'error'>('info')
  const [busy, setBusy] = useState(false)
  const [compilerDiagnostics, setCompilerDiagnostics] = useState<CompilerDiagnostic[]>([])
  const [toolchainStatus, setToolchainStatus] = useState<ToolchainStatus | null>(null)
  /** Przyklad czekajacy na potwierdzenie - wczytanie go skasuje biezacy projekt. */
  const [pendingExample, setPendingExample] = useState<Example | null>(null)

  const hexInputRef = useRef<HTMLInputElement>(null)
  /** Ostatnio wgrany program - zapisujemy go, zeby plytka po odswiezeniu zyla dalej. */
  const lastHex = useRef<string | null>(null)
  /**
   * Osobna plytka uzywana wylacznie do porownan przy skladaniu i czytaniu linku
   * (rozlozyc gotowy zestaw polaczen i sprawdzic, czy zgadza sie z biezacym).
   * Nie moze to byc plytka symulatora - porownanie skasowaloby prace uzytkownika.
   */
  const scratchBoard = useMemo(() => new Board(new Atmega32()), [])
  const [shareState, setShareState] = useState<'idle' | 'done' | 'failed'>('idle')

  /** Biezacy stan pracy w postaci, ktora da sie zapisac i wyslac linkiem. */
  const captureWorkspace = useCallback(
    (): WorkspaceState => ({
      files: project.list(),
      wires: simulator.board.wires,
      jumpers: { ...simulator.board.jumpers },
      fuses: { ...simulator.mcu.fuses },
      hex: lastHex.current,
      hexName: simulator.loadedProgram,
      running: simulator.running,
      powered: simulator.powered,
    }),
    [project, simulator],
  )

  /**
   * Wejscie na strone: najpierw link, potem zapamietany stan.
   *
   * Link ma pierwszenstwo, bo ktos go wlasnie otworzyl - to jasna deklaracja
   * „chce zobaczyc TO”. Zapamietany stan jest tylko powrotem do przerwanej pracy.
   */
  useEffect(() => {
    let cancelled = false
    const restore = async () => {
      const fromLink = payloadFromHash(location.hash)
      if (fromLink) {
        const payload = await decodePayload(fromLink)
        if (cancelled) return
        if (!payload) {
          setStatus('Nie udało się odczytać stanu z adresu — link jest niepełny albo uszkodzony.')
          setStatusKind('error')
          return
        }
        const state = payloadToState(payload, scratchBoard)
        project.replaceAll(state.files)
        setActivePath(state.files[0]?.path ?? 'main.c')
        simulator.board.restoreWires(state.wires)
        for (const [name, closed] of Object.entries(state.jumpers)) {
          simulator.board.setJumper(name as keyof typeof state.jumpers, closed)
        }
        simulator.setFuses(state.fuses)
        if (!simulator.powered) simulator.setPower(true)
        if (state.hex) {
          lastHex.current = state.hex
          simulator.restoreProgram(state.hex, state.hexName ?? 'program z linku')
          simulator.start()
          setStatus('Wczytano stan z linku: kod, przewody i fuse bity są takie jak u nadawcy.')
        } else {
          setStatus(
            'Wczytano projekt z linku. Program nie jest jeszcze w układzie — ' +
              'naciśnij „Zbuduj i wgraj” (F7).',
          )
        }
        setStatusKind('ok')
        // Adres wraca do postaci bez stanu. Gdyby zostal, kazde pozniejsze
        // odswiezenie cofalo by prace do chwili otwarcia linku - a odtad
        // biezacy stan pamieta juz zwykly zapis w przegladarce.
        history.replaceState(null, '', location.pathname + location.search)
        return
      }

      const saved = loadLocal()
      if (!saved || cancelled) return
      simulator.board.restoreWires(saved.wires)
      for (const [name, closed] of Object.entries(saved.jumpers)) {
        simulator.board.setJumper(name as keyof typeof saved.jumpers, closed)
      }
      simulator.setFuses(saved.fuses)
      if (saved.powered && !simulator.powered) simulator.setPower(true)
      if (saved.hex) {
        lastHex.current = saved.hex
        if (simulator.restoreProgram(saved.hex, saved.hexName ?? 'zapamiętany program')) {
          if (saved.running) simulator.start()
        }
      }
      if (saved.wires.length > 0 || saved.hex) {
        setStatus('Przywrócono poprzednią pracę: przewody, zworki i fuse bity są tam, gdzie były.')
      }
    }
    void restore()
    return () => {
      cancelled = true
    }
    // Odtwarzamy dokladnie raz, przy wejsciu na strone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Zapis stanu plytki po kazdej zmianie.
   *
   * Z opoznieniem, bo `state` leci takze przy przelaczaniu zasilania i zmianie
   * zworek, a zapis do pamieci przegladarki jest synchroniczny - bez zwloki
   * potrafilby zajac czas potrzebny symulacji.
   */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => saveLocal(captureWorkspace()), 400)
    }
    const off = simulator.on('state', schedule)
    const offProject = project.subscribe(schedule)
    return () => {
      if (timer) clearTimeout(timer)
      off()
      offProject()
    }
  }, [simulator, project, captureWorkspace])

  /**
   * Adres z zapisanym stanem, skopiowany do schowka.
   *
   * Paska adresu NIE ruszamy. Gdyby zostal w nim link, odswiezenie strony
   * cofaloby prace do chwili udostepnienia - a ktos, kto wysyla komus swoj stan,
   * najczesciej pracuje dalej.
   */
  const share = useCallback(async () => {
    const url = await shareUrl(captureWorkspace(), scratchBoard)
    if (await copyToClipboard(url)) {
      setShareState('done')
      setStatus(`Link skopiowany (${url.length} znaków). Otworzy dokładnie ten kod, te przewody i te fuse bity.`)
      setStatusKind('ok')
    } else {
      // Schowek bywa zablokowany - w trybie prywatnym albo bez zgody na dostep.
      // Wtedy pokazujemy adres wprost, zeby dalo sie go zaznaczyc i skopiowac recznie.
      setShareState('failed')
      setStatus(`Nie udało się użyć schowka. Link do skopiowania: ${url}`)
      setStatusKind('info')
    }
    setTimeout(() => setShareState('idle'), 4000)
  }, [captureWorkspace, scratchBoard])

  // Sprawdzenie, czy kompilator jest dostepny - zeby powiedziec o tym od razu,
  // a nie dopiero przy pierwszej nieudanej probie budowania.
  useEffect(() => {
    void toolchain.status().then(setToolchainStatus)
  }, [])

  /**
   * Zbudowanie projektu i wgranie wyniku do mikrokontrolera.
   *
   * Kompilacja i programowanie sa celowo jednym poleceniem: rozdzielenie ich
   * to najczestsze zrodlo pomylki „poprawilem kod, ale plytka robi stare rzeczy”.
   */
  const buildAndProgram = useCallback(async () => {
    // Uwaga: NIE przelaczamy zakladki. Uzytkownik zostaje tam, gdzie pracowal -
    // przeskok w inne miejsce po kazdym budowaniu gubil kontekst i zmuszal
    // do klikania z powrotem. O bledach informuje pasek stanu i licznik przy
    // zakladce IDE.
    if (busy) return
    setBusy(true)
    setStatus('Kompilowanie…')
    setStatusKind('info')

    const files = project.list()
    const result = await toolchain.compile(files)
    setCompilerDiagnostics(result.diagnostics)

    if (!result.ok || !result.hex) {
      const errors = result.diagnostics.filter((item) => item.severity === 'error')
      const first = errors[0]
      // Miejsce bledu podajemy od razu w pasku stanu: student widzi komunikat
      // z kazdej zakladki, a bez nazwy pliku i linii nie wie, gdzie patrzec.
      const place = first?.file
        ? `${first.file.replace(/\\/g, '/').split('/').pop()}, linia ${first.line}: `
        : ''
      setStatus(
        errors.length > 0
          ? `Kompilacja nie powiodła się — ${place}${first.message}` +
            (errors.length > 1 ? ` (błędów: ${errors.length})` : '')
          : 'Kompilacja nie powiodła się — szczegóły w liście problemów w zakładce IDE.',
      )
      setStatusKind('error')
      setBusy(false)
      return
    }

    const warnings = result.diagnostics.filter((item) => item.severity === 'warning').length
    try {
      if (!simulator.powered) simulator.setPower(true)
      lastHex.current = result.hex
      await simulator.program(result.hex, 'własny program')
      setStatus(
        `Zbudowano i wgrano. ${describeSize(result.size)}` +
          (warnings > 0 ? ` · ostrzeżeń: ${warnings}` : ''),
      )
      setStatusKind('ok')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
      setStatusKind('error')
    } finally {
      setBusy(false)
    }
  }, [busy, project, simulator])

  /**
   * Wczytanie przykladu podmienia CALY projekt - kod zrodlowy razem z programem.
   * Bez zrodel przyklad bylby czarna skrzynka: cos sie dzieje na plytce,
   * ale nie wiadomo dlaczego. Dlatego najpierw pytamy o zgode.
   */
  const loadExample = useCallback(
    async (example: Example) => {
      setPendingExample(null)
      project.replaceAll(example.files)
      setActivePath(example.files[0]?.path ?? 'main.c')
      setCompilerDiagnostics([])
      simulator.applyWiringPreset(example.preset)
      if (!simulator.powered) simulator.setPower(true)
      try {
        lastHex.current = example.hex
        await simulator.program(example.hex, example.label)
        setStatus(
          `Wczytano przykład: ${example.label}. Kod jest w edytorze — możesz go zmienić ` +
            `i zbudować na nowo.${example.note ? ` ${example.note}` : ''}`,
        )
        setStatusKind('ok')
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error))
        setStatusKind('error')
      }
    },
    [project, simulator],
  )

  const programHexFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return
      try {
        const content = await file.text()
        if (!simulator.powered) simulator.setPower(true)
        lastHex.current = content
        await simulator.program(content, file.name)
        setStatus(`Wgrano plik ${file.name}.`)
        setStatusKind('ok')
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error))
        setStatusKind('error')
      }
      if (hexInputRef.current) hexInputRef.current.value = ''
    },
    [simulator],
  )

  // Skroty jak w Microchip Studio: F7 buduje, F5 uruchamia i zatrzymuje.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'F7') {
        event.preventDefault()
        void buildAndProgram()
      } else if (event.key === 'F5') {
        event.preventDefault()
        if (simulator.running) simulator.stop()
        else simulator.start()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [buildAndProgram, simulator])

  const clockLabel = describeClock(simulator.mcu.fuses, simulator.mcu.crystalConnected)

  /**
   * Liczba bledow kompilacji pokazywana przy zakladce IDE.
   * Skoro po nieudanym budowaniu nie przerzucamy uzytkownika do edytora,
   * musi byc z kazdego miejsca widac, ze cos tam na niego czeka.
   */
  const compilerErrors = compilerDiagnostics.filter((item) => item.severity === 'error').length

  return (
    <div className="app">
      <div className="toolbar">
        <span className="title">
          ZL3AVR <small>· ATmega32</small>
        </span>

        <button className="primary" onClick={() => void buildAndProgram()} disabled={busy}>
          {busy ? 'Buduję…' : 'Zbuduj i wgraj (F7)'}
        </button>

        <label className="inline-select">
          Gotowe przykłady:
          <select
            value=""
            onChange={(event) => {
              const example = EXAMPLES.find((item) => item.id === event.target.value)
              if (example) setPendingExample(example)
              event.target.value = ''
            }}
          >
            <option value="">— wybierz —</option>
            {EXAMPLE_GROUPS.map(([group, items]) => (
              <optgroup key={group} label={group}>
                {items.map((example) => (
                  <option key={example.id} value={example.id} title={example.description}>
                    {example.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <button onClick={() => hexInputRef.current?.click()} title="Wgraj gotowy plik .hex zbudowany gdzie indziej">
          Wgraj .hex
        </button>

        {/*
          Link niesie CALY stan: kod, przewody, zworki i fuse bity. Dzieki temu
          zdanie „u mnie nie dziala” przestaje byc rozmowa w ciemno - prowadzacy
          otwiera dokladnie te plytke, ktora widzi student. Gotowy przyklad bez
          zmian miesci sie w kilkunastu znakach.
        */}
        <button
          onClick={() => void share()}
          title="Kopiuje adres, pod którym ktoś inny zobaczy dokładnie ten kod, te przewody i te fuse bity"
        >
          {shareState === 'done'
            ? 'Skopiowano link ✓'
            : shareState === 'failed'
              ? 'Nie udało się skopiować'
              : 'Udostępnij'}
        </button>
        <input
          ref={hexInputRef}
          type="file"
          accept=".hex"
          style={{ display: 'none' }}
          onChange={(event) => void programHexFile(event.target.files?.[0])}
        />

        <button onClick={() => setFuseDialogOpen(true)}>Fuse bity…</button>

        <span className="spacer" />

        <label className="inline-select">
          Tempo:
          <select value={simulator.speed} onChange={(event) => simulator.setSpeed(Number(event.target.value))}>
            <option value={1}>czas rzeczywisty</option>
            <option value={0.1}>10× wolniej</option>
            <option value={0.01}>100× wolniej</option>
            <option value={0.001}>1000× wolniej</option>
          </select>
        </label>

        <button
          onClick={() => (simulator.running ? simulator.stop() : simulator.start())}
          disabled={!simulator.powered}
        >
          {simulator.running ? 'Pauza' : 'Wznów'} (F5)
        </button>
        <button onClick={() => simulator.reset()} disabled={!simulator.powered}>
          Reset
        </button>
        <button
          className={'power-button ' + (simulator.powered ? 'on' : 'off')}
          onClick={() => simulator.setPower(!simulator.powered)}
          title={
            simulator.powered
              ? 'Kliknij, aby odciąć zasilanie płytki'
              : 'Płytka jest bez zasilania — nic na niej nie zadziała. Kliknij, aby włączyć.'
          }
        >
          <span className="power-dot" />
          Zasilanie {simulator.powered ? 'WŁĄCZONE' : 'WYŁĄCZONE'}
        </button>
      </div>

      {simulator.programming.active && (
        <div className="programming-bar">
          <span>Programowanie mikrokontrolera…</span>
          <progress value={simulator.programming.progress} max={1} />
          <span className="prog-led" />
        </div>
      )}

      {/*
        Pasek pojawia sie tylko wtedy, gdy NIE MA ZADNEGO kompilatora - ani serwera
        z avr-gcc, ani tego w przegladarce. Wczesniej mowil „uruchom npm run kompilator”
        takze wtedy, gdy budowanie dzialalo bez zadnego serwera; to zdanie bylo
        wtedy zwyczajna nieprawda.
      */}
      {toolchainStatus && !toolchainStatus.available && (
        <div className="toolchain-bar">
          <strong>Kompilator niedostępny</strong>
          <span>
            {toolchainStatus.label}. Bez niego możesz korzystać z gotowych przykładów i wgrywać
            własne pliki .hex. Żeby budować własny kod, uruchom kompilator lokalny poleceniem{' '}
            <code>npm run kompilator</code> w katalogu projektu.
          </span>
          <span className="spacer" />
          <button onClick={() => void toolchain.status().then(setToolchainStatus)}>Sprawdź ponownie</button>
        </div>
      )}

      <div className="tabs">
        {VIEWS.map((item) => (
          <button
            key={item.id}
            className={view === item.id ? 'active' : ''}
            title={item.title}
            onClick={() => setView(item.id)}
          >
            {item.label}
            {item.id === 'ide' && compilerErrors > 0 && (
              <span className="tab-badge" title={`Błędów kompilacji: ${compilerErrors}`}>
                {compilerErrors}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="view">
        {view === 'ide' && (
          <IdeView
            project={project}
            activePath={activePath}
            onSelectFile={setActivePath}
            compilerDiagnostics={compilerDiagnostics}
          />
        )}
        {view === 'board' && <BoardView />}
        {view === 'simulator' && <SimulatorView />}
        {view === 'terminal' && <TerminalView />}
        {/*
          „Komputer PC” zostaje zamontowany takze wtedy, gdy patrzysz na plytke.
          Cwiczenie z ramkami polega wlasnie na tym, ze naciska sie klawisz na plytce
          i oglada, co wypisze skrypt - a odmontowanie zakladki zabiloby dzialajacy
          skrypt razem z calym jego wyjsciem. Pozostale widoki nie maja wlasnego zycia
          i moga znikac razem z przelaczeniem.
        */}
        <div className="view-slot" hidden={view !== 'pc'}>
          <PcView project={project} />
        </div>
        {view === 'guide' && <GuideView />}
      </div>

      <div className={`statusbar ${statusKind}`}>
        {/* Dlugi komunikat jest w pasku skracany - pelna tresc pokazuje dymek. */}
        <span title={status}>{status}</span>
        {statusKind === 'error' && compilerErrors > 0 && view !== 'ide' && (
          <button className="status-action" onClick={() => setView('ide')}>
            Pokaż błędy
          </button>
        )}
        <span className="spacer" />
        {simulator.loadedProgram && <span>W pamięci: {simulator.loadedProgram}</span>}
        <span>Zegar: {clockLabel}</span>
        <span>JTAG: {simulator.mcu.gpio.jtagEnabled ? 'włączony' : 'wyłączony'}</span>
        <span>{simulator.mcu.elapsedSeconds.toFixed(2)} s symulacji</span>
      </div>

      {fuseDialogOpen && <FuseDialog onClose={() => setFuseDialogOpen(false)} />}

      {pendingExample && (
        <div className="modal-backdrop" onClick={() => setPendingExample(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <strong>Wczytać przykład „{pendingExample.label}”?</strong>
            </div>

            <div className="modal-body">
              <p>
                Do edytora trafi kod źródłowy przykładu, a do mikrokontrolera gotowy program.
                Ustawione zostaną też przewody potrzebne temu ćwiczeniu.
              </p>

              <div className="warning-box">
                <strong>Twój obecny projekt zostanie zastąpiony</strong>
                <p>
                  Tej operacji nie da się cofnąć. Jeśli chcesz zachować to, nad czym pracujesz,
                  pobierz projekt przed wczytaniem przykładu.
                </p>
                <p className="warning-files">
                  Zostaną zastąpione pliki: {project.paths().join(', ')}
                </p>
              </div>
            </div>

            <div className="modal-footer">
              <button
                onClick={() => {
                  downloadProject(project.list())
                  void loadExample(pendingExample)
                }}
              >
                Pobierz mój projekt i wczytaj
              </button>
              <span className="spacer" />
              <button onClick={() => setPendingExample(null)}>Anuluj</button>
              <button className="primary" onClick={() => void loadExample(pendingExample)}>
                Wczytaj bez zapisywania
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
