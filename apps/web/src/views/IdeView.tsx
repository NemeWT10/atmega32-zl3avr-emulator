import Editor, { type OnMount } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSimulator, useSimulatorEvents } from '../sim/SimulationContext'
import { describeWiring } from '@zl3avr/board'
import { analyse, type Diagnostic } from '../ide/diagnostics'
import { stripComments } from '../ide/strip-comments'
import { setProjectSources } from '../ide/monaco-avr'
import { copyToClipboard } from '../clipboard'
import type { CompilerDiagnostic } from '../ide/toolchain'
import {
  Project,
  downloadFile,
  downloadProject,
  languageOf,
  validateName,
  type ProjectFile,
} from '../ide/project'

/**
 * Edytor kodu.
 *
 * Poza samym pisaniem daje trzy rzeczy, ktorych student nie dostanie
 * od zwyklego edytora tekstu:
 *
 *   - PODPOWIEDZI z opisem, czym jest dany rejestr i skad pochodzi,
 *   - LISTE PROBLEMOW z wyjasnieniem, co jest nie tak i jak to naprawic,
 *   - OSTRZEZENIA ZALEZNE OD SPRZETU: jesli kod korzysta z odbioru przez
 *     USART, a zworka JP4 jest rozwarta, edytor mowi o tym od razu.
 *     Zaden kompilator tego nie zrobi, bo nie wie, jak ustawiona jest plytka,
 *   - SKOK DO DEFINICJI wlasnej funkcji albo zmiennej, takze do innego pliku,
 *   - PODGLAD BEZ KOMENTARZY do skopiowania kodu gdzie indziej.
 */

interface Props {
  project: Project
  activePath: string
  onSelectFile: (path: string) => void
  /**
   * Komunikaty PRAWDZIWEGO kompilatora z ostatniego budowania.
   * Pokazujemy je razem z wlasna analiza, ale wyraznie oznaczone - bo to one
   * decyduja o tym, czy program w ogole powstanie.
   */
  compilerDiagnostics: CompilerDiagnostic[]
}

const SEVERITY_LABEL: Record<Diagnostic['severity'], string> = {
  error: 'błąd',
  warning: 'ostrzeżenie',
  info: 'podpowiedź',
}

/**
 * Problem razem z plikiem, ktorego dotyczy.
 *
 * Bledy z INNYCH plikow tez musza byc widoczne. Wczesniej lista pokazywala
 * tylko otwarty plik, wiec blad w sterowniku klawiatury konczyl sie tak:
 * pasek stanu mowil „kompilacja nie powiodla sie”, a lista problemow byla
 * pusta i nie bylo jak dojsc, gdzie lezy przyczyna.
 */
interface Problem extends Diagnostic {
  /** `null` = komunikat nie dotyczy konkretnego pliku (np. blad konsolidacji). */
  path: string | null
}

/** Miejsce w projekcie, do ktorego edytor ma przewinac po przelaczeniu pliku. */
interface Place {
  path: string
  line: number
  column: number
}

/**
 * Polska odmiana rzeczownika po liczbie: 1 komentarz, 2 komentarze, 5 komentarzy.
 * Bez tego podglad pisalby „usunieto 2 komentarzy", co czyta sie jak usterka.
 */
function odmiana(count: number, forms: [string, string, string]): string {
  if (count === 1) return forms[0]
  const last = count % 10
  const twoLast = count % 100
  if (last >= 2 && last <= 4 && (twoLast < 12 || twoLast > 14)) return forms[1]
  return forms[2]
}

/**
 * Poczatek miejsca, do ktorego prowadzi skok. Monaco podaje raz zakres
 * (od-do), a raz sama pozycje - obie postacie sprowadzamy do jednej.
 */
function startOf(
  target: Monaco.IRange | Monaco.IPosition | undefined,
): { line: number; column: number } {
  if (!target) return { line: 1, column: 1 }
  if ('startLineNumber' in target) {
    return { line: target.startLineNumber, column: target.startColumn }
  }
  return { line: target.lineNumber, column: target.column }
}

/**
 * Komunikaty kompilatora niosa sciezke z katalogu roboczego serwera.
 * Porownujemy same nazwy plikow, bo tylko one maja sens po stronie edytora.
 */
function matchPath(reported: string | null, paths: string[]): string | null {
  if (!reported) return null
  const name = reported.replace(/\\/g, '/').split('/').pop()
  return paths.find((path) => path === name) ?? null
}

export function IdeView({ project, activePath, onSelectFile, compilerDiagnostics }: Props) {
  const simulator = useSimulator()
  useSimulatorEvents(['state'], 4)

  /**
   * Trzymamy tylko LISTE plikow, nie ich tresc.
   *
   * Gdyby edytor dostawal tresc przez `value`, kazde nacisniecie klawisza
   * wracaloby do niego jako nowa wartosc i Monaco resetowaloby model razem
   * z pozycja kursora. Dlatego tresc podajemy raz, przez `defaultValue`,
   * a edytor prowadzi ja dalej sam.
   */
  const [files, setFiles] = useState<ProjectFile[]>(() => project.list())
  /** Numer podmiany projektu - zmienia sie tylko przy wczytaniu przykladu. */
  const [revision, setRevision] = useState(project.revision)
  const [ownDiagnostics, setOwnDiagnostics] = useState<Diagnostic[]>([])
  const [renaming, setRenaming] = useState<string | null>(null)
  /** Czy w drzewie stoi otwarty wiersz na nazwe nowego pliku. */
  const [creating, setCreating] = useState(false)
  const newNameRef = useRef<HTMLInputElement>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  /**
   * Podglad kodu BEZ KOMENTARZY.
   *
   * Nie wycinamy komentarzy z pliku - to byloby nieodwracalne zniszczenie pracy.
   * Zamiast tego pokazujemy osobny, TYLKO DO ODCZYTU dokument obok tego samego
   * projektu. Plik zostaje nietkniety, a student dostaje to, po co siegnal:
   * czysty kod do skopiowania do Microchip Studio albo do sprawozdania.
   */
  const [hideComments, setHideComments] = useState(false)
  const [copied, setCopied] = useState(false)
  /** Miejsca, z ktorych skoczono do definicji - zeby dalo sie wrocic. */
  const jumpHistory = useRef<Place[]>([])
  const [canGoBack, setCanGoBack] = useState(false)

  // Komunikat o operacji na plikach znika sam - inaczej wisi do konca sesji
  // i po chwili nie wiadomo, czego dotyczyl.
  useEffect(() => {
    if (!message) return
    const handle = setTimeout(() => setMessage(null), 8000)
    return () => clearTimeout(handle)
  }, [message])

  /**
   * Wysokosc listy problemow. `null` = dopasowana do tresci.
   *
   * Przy kilkunastu komunikatach lista sciskala sie do trzech wierszy, a nad nia
   * zostawal pusty edytor. Uchwyt pozwala ja rozciagnac i przeczytac wszystko
   * bez przewijania.
   */
  const [problemsHeight, setProblemsHeight] = useState<number | null>(null)
  const resizing = useRef(false)
  const paneRef = useRef<HTMLDivElement>(null)

  /** Miejsce, do ktorego trzeba przewinac zaraz po otwarciu innego pliku. */
  const pendingJump = useRef<Place | null>(null)
  /** Uchwyt do wyrejestrowania obslugi skokow miedzy plikami. */
  const openerRef = useRef<Monaco.IDisposable | null>(null)
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof Monaco | null>(null)
  const uploadRef = useRef<HTMLInputElement>(null)

  useEffect(
    () =>
      project.subscribe(() => {
        const next = project.list()
        // Odswiezamy liste tylko wtedy, gdy zmienil sie zestaw plikow.
        setFiles((previous) => {
          const samePaths =
            previous.length === next.length &&
            previous.every((file, index) => file.path === next[index].path)
          return samePaths ? previous : next
        })
        // Ta sama wartosc nie wywoluje przerysowania, wiec mozemy ustawiac ja
        // przy kazdej zmianie - takze przy zwyklym pisaniu w edytorze.
        setRevision(project.revision)
      }),
    [project],
  )

  const active = useMemo(
    () => files.find((file) => file.path === activePath) ?? files[0],
    [files, activePath],
  )

  /*
    Podpowiedzi, dymki i skok do definicji musza widziec CALY projekt, nie tylko
    otwarty plik. Sterownik klawiatury czy wyswietlacza siedzi zwykle w osobnym
    pliku i to wlasnie jego funkcje wola sie najczesciej - a dostawcy sa
    rejestrowani raz, przy starcie aplikacji, wiec dostaja tu funkcje siegajaca
    po AKTUALNA liste plikow.
  */
  useEffect(() => {
    setProjectSources(() => project.list())
    return () => setProjectSources(() => [])
  }, [project])

  /**
   * Najswiezsze wartosci dla obslugi zdarzen, ktore Monaco trzyma od chwili
   * rejestracji. Bez tego skok do definicji przelaczalby na plik otwarty
   * w chwili zaladowania edytora, a nie na biezacy.
   */
  const latest = useRef({ activePath, onSelectFile, project })
  latest.current = { activePath, onSelectFile, project }

  /** Tresc pobierana wprost z magazynu - zawsze aktualna, bez posrednictwa stanu. */
  const initialContent = active ? (project.read(active.path)?.content ?? '') : ''

  /**
   * Kod bez komentarzy liczymy TYLKO wtedy, gdy podglad jest wlaczony -
   * inaczej przelatywalby przez caly plik przy kazdym nacisnieciu klawisza.
   */
  const cleaned = useMemo(() => {
    if (!hideComments || !active) return { code: '', removedLines: 0, removedComments: 0 }
    return stripComments(initialContent, languageOf(active.path) === 'python' ? 'python' : 'c')
  }, [hideComments, initialContent, active])

  /**
   * Kontekst sprzetowy dla analizy kodu. Bierzemy go z zywego modelu plytki,
   * wiec ostrzezenia zmieniaja sie razem ze zworkami i fuse bitami.
   */
  const hardware = useMemo(
    () => ({
      clockHz: simulator.mcu.clockHz,
      jtagEnabled: simulator.mcu.gpio.jtagEnabled,
      jumpers: { ...simulator.board.jumpers },
      wiring: describeWiring(simulator.board.wires),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      simulator.mcu.clockHz,
      simulator.mcu.gpio.jtagEnabled,
      simulator.board.jumpers.JP3,
      simulator.board.jumpers.JP4,
      simulator.board.jumpers.JP25,
      // Przewody zmieniaja tresc ostrzezen tak samo jak zworki.
      simulator.board.wires.length,
    ],
  )

  /** Analiza kodu i przelozenie wynikow na podkreslenia w edytorze. */
  const refreshDiagnostics = useCallback(
    (code: string) => {
      if (!active || languageOf(active.path) !== 'c') {
        setOwnDiagnostics([])
        return
      }
      /**
       * Pozostale pliki projektu ida do analizy razem z otwartym.
       * Sterownik klawiatury czy wyswietlacza siedzi zwykle w osobnym pliku,
       * a bez niego analiza zglaszalaby "nigdzie nie ustawiasz DDRx"
       * dla kodu, ktory ustawia to poprawnie - tylko gdzie indziej.
       */
      const otherSources = project
        .list()
        .filter((file) => file.path !== active.path && languageOf(file.path) === 'c')
        .map((file) => file.content)
        .join('\n')

      const found = analyse(code, hardware, otherSources)
      setOwnDiagnostics(found)

      const monaco = monacoRef.current
      const editor = editorRef.current
      const model = editor?.getModel()
      if (!monaco || !model) return

      monaco.editor.setModelMarkers(
        model,
        'zl3avr',
        found.map((item) => ({
          startLineNumber: item.line,
          endLineNumber: item.line,
          startColumn: item.column,
          endColumn: item.endColumn,
          message: item.hint ? `${item.message}\n\n${item.hint}` : item.message,
          source: item.source,
          severity:
            item.severity === 'error'
              ? monaco.MarkerSeverity.Error
              : item.severity === 'warning'
                ? monaco.MarkerSeverity.Warning
                : monaco.MarkerSeverity.Info,
        })),
      )
    },
    [active, hardware, project],
  )

  useEffect(() => {
    if (active) refreshDiagnostics(project.read(active.path)?.content ?? '')
  }, [active, project, refreshDiagnostics])

  /** Zapamietuje miejsce, z ktorego nastapil skok - zeby dalo sie do niego wrocic. */
  const rememberJump = (place: Place) => {
    const stack = jumpHistory.current
    const top = stack[stack.length - 1]
    if (top && top.path === place.path && top.line === place.line) return
    stack.push(place)
    if (stack.length > 30) stack.shift()
    setCanGoBack(true)
  }

  /** Powrot tam, skad skoczono do definicji. */
  const goBack = () => {
    const place = jumpHistory.current.pop()
    setCanGoBack(jumpHistory.current.length > 0)
    if (!place) return
    setHideComments(false)
    if (place.path !== latest.current.activePath) {
      pendingJump.current = place
      latest.current.onSelectFile(place.path)
      return
    }
    const editor = editorRef.current
    if (!editor) return
    editor.revealLineInCenter(place.line)
    editor.setPosition({ lineNumber: place.line, column: place.column })
    editor.focus()
  }

  /*
    Skok do definicji lezacej w INNYM pliku projektu.

    Monaco samo potrafi przewinac do miejsca w otwartym dokumencie, ale nie ma
    pojecia o zakladkach plikow - to nasza sprawa. `registerEditorOpener` jest
    wolane przy kazdym „przejdz do definicji": gdy cel jest w tym samym pliku,
    oddajemy sprawe Monaco (`false`), a gdy w innym - przelaczamy zakladke
    i zostawiamy sobie miejsce do przewiniecia po jej zaladowaniu.
  */
  const registerOpener = (monaco: typeof Monaco) => {
    if (openerRef.current) return
    openerRef.current = monaco.editor.registerEditorOpener({
      openCodeEditor(source, resource, selectionOrPosition) {
        const model = source.getModel()
        const from = source.getPosition()
        if (model && from) {
          rememberJump({
            path: model.uri.path.replace(/^\//, ''),
            line: from.lineNumber,
            column: from.column,
          })
        }
        if (model && model.uri.toString() === resource.toString()) return false

        const path = resource.path.replace(/^\//, '')
        if (!latest.current.project.read(path)) return false

        pendingJump.current = { path, ...startOf(selectionOrPosition) }
        latest.current.onSelectFile(path)
        return true
      },
    })
  }

  // Obsluga skokow jest globalna dla Monaco, wiec musi zniknac razem z widokiem.
  useEffect(
    () => () => {
      openerRef.current?.dispose()
      openerRef.current = null
    },
    [],
  )

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    registerOpener(monaco)
    // Alt + strzalka w lewo to ten sam skrot, co powrot w VS Code i w przegladarce.
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.LeftArrow, goBack)
    if (active) refreshDiagnostics(project.read(active.path)?.content ?? '')

    const jump = pendingJump.current
    if (jump && jump.path === active?.path) {
      pendingJump.current = null
      editor.revealLineInCenter(jump.line)
      editor.setPosition({ lineNumber: jump.line, column: jump.column })
      editor.focus()
    }
  }

  /**
   * Podmiana calego projektu (wczytanie gotowego przykladu) musi trafic
   * do OTWARTEGO edytora.
   *
   * Gdy nowy plik nazywa sie tak samo jak poprzedni, edytor trzyma swoj stary
   * dokument i pokazuje kod, ktorego juz nie ma w projekcie. Student buduje
   * wtedy co innego, niz widzi na ekranie - a to najbardziej mylacy blad,
   * jaki moze zrobic narzedzie.
   *
   * Sprawdzenie sciezki dokumentu jest konieczne: przy przelaczaniu plikow
   * efekt potrafi wyprzedzic podmiane dokumentu w edytorze, a wtedy bez tego
   * warunku wpisalibysmy tresc jednego pliku do drugiego.
   */
  useEffect(() => {
    const model = editorRef.current?.getModel()
    if (!model || !active) return
    const path = model.uri.path.replace(/^\//, '')
    if (path !== active.path) return
    const content = project.read(active.path)?.content ?? ''
    if (model.getValue() !== content) {
      model.setValue(content)
      refreshDiagnostics(content)
    }
  }, [revision, active, project, refreshDiagnostics])

  const handleChange = (value: string | undefined) => {
    if (!active) return
    const content = value ?? ''
    project.write(active.path, content)
    refreshDiagnostics(content)
  }

  // ---------------------------------------------------------------- pliki

  /**
   * Nowy plik: nazwe wpisuje sie WPROST W DRZEWIE, a nie w okienku systemowym.
   *
   * `window.prompt` bywa cicho blokowany - Chrome po kilku okienkach proponuje
   * „nie pokazuj wiecej okien z tej strony", a raz zaznaczone zostaje na stale
   * i wtedy przycisk wyglada na martwy: klikasz i nie dzieje sie nic, bez
   * jakiegokolwiek komunikatu. Wpisywanie w miejscu nie zalezy od niczyjej zgody,
   * dziala tak samo jak zmiana nazwy pliku obok i pokazuje blad tam, gdzie patrzysz.
   */
  const startCreating = () => {
    setMessage(null)
    setCreating(true)
  }

  /**
   * Plik powstaje WYLACZNIE po nacisnieciu Entera.
   *
   * Zapisywanie przy utracie ogniska wyglada na wygodne, ale kazde przypadkowe
   * przeniesienie uwagi - klikniecie w edytor, skrot klawiszowy, przelaczenie
   * okna - tworzylo wtedy po cichu plik o nazwie domyslnej. Znikad brany
   * „nowy.c" w drzewie jest gorszy niz koniecznosc wpisania nazwy drugi raz.
   */
  const finishCreating = (raw: string) => {
    const name = raw.trim()
    if (name === '') return
    const problem = validateName(name, project.paths())
    if (problem) {
      // Wiersz zostaje otwarty z bledna nazwa - inaczej wpisana tresc przepadlaby
      // razem z komunikatem, ktorego nie ma juz jak poprawic.
      setMessage(problem)
      return
    }
    project.create(name, Project.template(name))
    onSelectFile(name)
    setCreating(false)
    setMessage(null)
  }

  const renameFile = (path: string, next: string) => {
    setRenaming(null)
    if (next === path) return
    const problem = validateName(next, project.paths().filter((item) => item !== path))
    if (problem) {
      setMessage(problem)
      return
    }
    project.rename(path, next.trim())
    onSelectFile(next.trim())
    setMessage(null)
  }

  const removeFile = (path: string) => {
    if (!window.confirm(`Usunąć plik „${path}”? Tej operacji nie da się cofnąć.`)) return
    project.remove(path)
    const remaining = project.paths()
    if (remaining.length > 0) onSelectFile(remaining[0])
    setMessage(null)
  }

  const uploadFiles = async (list: FileList | null) => {
    if (!list) return
    let added = 0
    const rejected: string[] = []
    for (const file of Array.from(list)) {
      // Nazwa z dysku tez musi przejsc kontrole - inaczej „sprawozdanie 2.c”
      // wladowaloby sie do projektu i psulo kazde kolejne budowanie.
      const problem = validateName(file.name, project.paths().filter((path) => path !== file.name))
      if (problem && !problem.includes('już istnieje')) {
        rejected.push(`${file.name} — ${problem}`)
        continue
      }
      const content = await file.text()
      const existing = project.read(file.name)
      if (existing) {
        if (!window.confirm(`Plik „${file.name}” już istnieje. Zastąpić jego zawartość?`)) continue
        project.write(file.name, content)
      } else {
        project.create(file.name, content)
      }
      added++
      onSelectFile(file.name)
    }
    setMessage(
      rejected.length > 0
        ? `Nie wczytano: ${rejected.join('; ')}`
        : added > 0
          ? `Wczytano plików: ${added}.`
          : null,
    )
    if (uploadRef.current) uploadRef.current.value = ''
  }

  /**
   * Skok do miejsca problemu. Jesli lezy w innym pliku, najpierw go otwieramy -
   * inaczej klikniecie w blad z innego pliku nie robiloby nic i wygladalo
   * na zepsuty interfejs.
   */
  const jumpTo = (problem: Problem) => {
    const place: Place = {
      path: problem.path ?? active?.path ?? '',
      line: problem.line,
      column: problem.column,
    }
    // W podgladzie bez komentarzy numery linii sa inne, a dokumentu nie da sie
    // edytowac - wracamy wiec do zwyklego edytora i przewijamy juz w nim.
    if (hideComments) {
      setHideComments(false)
      pendingJump.current = place
      if (place.path !== active?.path) onSelectFile(place.path)
      return
    }
    if (problem.path && problem.path !== active?.path) {
      pendingJump.current = place
      onSelectFile(problem.path)
      return
    }
    const editor = editorRef.current
    if (!editor) return
    editor.revealLineInCenter(problem.line)
    editor.setPosition({ lineNumber: problem.line, column: problem.column })
    editor.focus()
  }

  /**
   * Komunikaty kompilatora doklejamy na poczatek listy - sa wazniejsze niz nasze
   * wlasne podpowiedzi, bo bez nich program w ogole nie powstanie. Pokazujemy
   * WSZYSTKIE, takze te z innych plikow projektu, z etykieta pliku.
   */
  const compilerItems: Problem[] = useMemo(() => {
    const paths = files.map((file) => file.path)
    return compilerDiagnostics.map((item) => ({
      path: matchPath(item.file, paths),
      line: item.line,
      column: item.column,
      endColumn: item.column + 1,
      severity: item.severity,
      source: 'Kompilator' as const,
      message: item.message,
      hint: item.note,
    }))
  }, [compilerDiagnostics, files])

  const diagnostics: Problem[] = useMemo(
    () => [
      ...compilerItems,
      ...ownDiagnostics.map((item) => ({ ...item, path: active?.path ?? null })),
    ],
    [compilerItems, ownDiagnostics, active],
  )

  /**
   * Podglad bez komentarzy jest OSOBNYM dokumentem, tylko do odczytu. Kiedy jest
   * wlaczony, zwykly edytor znika razem ze swoim modelem - a wtedy uchwyt do
   * niego nie moze zostac, bo pozniejszy skok do problemu trafilby w nicosc.
   */
  useEffect(() => {
    if (hideComments) editorRef.current = null
  }, [hideComments])

  const copyClean = async () => {
    const ok = await copyToClipboard(cleaned.code)
    setCopied(ok)
    if (!ok) setMessage('Nie udało się użyć schowka. Zaznacz kod w podglądzie i naciśnij Ctrl + C.')
    setTimeout(() => setCopied(false), 3000)
  }

  const errorCount = diagnostics.filter((item) => item.severity === 'error').length
  const warningCount = diagnostics.filter((item) => item.severity === 'warning').length

  /** Ile bledow kompilatora przypada na kazdy plik - znacznik w drzewie plikow. */
  const errorsByFile = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of compilerItems) {
      if (item.path && item.severity === 'error') {
        counts.set(item.path, (counts.get(item.path) ?? 0) + 1)
      }
    }
    return counts
  }, [compilerItems])

  return (
    <div className="ide">
      <div className="filetree">
        <div className="filetree-toolbar">
          <button onClick={startCreating} title="Nowy plik — nazwę wpiszesz w drzewie poniżej">
            + Plik
          </button>
          <button onClick={() => uploadRef.current?.click()} title="Wczytaj pliki z dysku">
            Wczytaj
          </button>
          <button onClick={() => downloadProject(project.list())} title="Pobierz cały projekt jako archiwum ZIP">
            Pobierz
          </button>
          <input
            ref={uploadRef}
            type="file"
            multiple
            accept=".c,.h,.cpp,.hpp,.py,.txt"
            style={{ display: 'none' }}
            onChange={(event) => void uploadFiles(event.target.files)}
          />
        </div>

        <div className="header">Pliki projektu</div>
        {creating && (
          <div className="item creating">
            <span className="file-icon">+</span>
            <input
              ref={newNameRef}
              autoFocus
              defaultValue="nowy.c"
              title="Wpisz nazwę i naciśnij Enter albo kliknij ✓. Escape anuluje."
              // Nazwa domyslna od razu zaznaczona: bez tego kursor staje na jej
              // koncu i pierwsza wpisana litera dokleja sie do „nowy.c”.
              onFocus={(event) => event.target.select()}
              onBlur={() => {
                setCreating(false)
                setMessage(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') finishCreating(event.currentTarget.value)
                if (event.key === 'Escape') {
                  setCreating(false)
                  setMessage(null)
                }
              }}
            />
            {/*
              Druga droga, myszą. Sam Enter to za waska umowa: jesli klawisz
              z jakiegokolwiek powodu nie dojdzie do pola, uzytkownikowi zostaje
              wrazenie, ze przycisk „+ Plik” nie dziala - a nie ma zadnego innego
              sposobu, zeby dokonczyc.

              `onMouseDown` z `preventDefault` jest tu konieczne: bez tego
              nacisniecie przycisku najpierw zabiera ognisko polu, `onBlur`
              zamyka wiersz, a klikniecie nie ma juz w co trafic.
            */}
            <button
              className="creating-ok"
              title="Utwórz plik"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => finishCreating(newNameRef.current?.value ?? '')}
            >
              ✓
            </button>
          </div>
        )}
        {files.map((file) => (
          <div
            key={file.path}
            className={'item' + (file.path === active?.path ? ' active' : '')}
            onClick={() => onSelectFile(file.path)}
          >
            {renaming === file.path ? (
              <input
                autoFocus
                defaultValue={file.path}
                onBlur={(event) => renameFile(file.path, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
                  if (event.key === 'Escape') setRenaming(null)
                }}
                onClick={(event) => event.stopPropagation()}
              />
            ) : (
              <>
                <span className="file-icon">{languageOf(file.path) === 'c' ? 'C' : languageOf(file.path) === 'python' ? 'PY' : '≡'}</span>
                <span className="file-name">{file.path}</span>
                {errorsByFile.has(file.path) && (
                  <span className="file-errors" title={`Błędów kompilacji w tym pliku: ${errorsByFile.get(file.path)}`}>
                    {errorsByFile.get(file.path)}
                  </span>
                )}
                <span className="file-actions">
                  <button
                    title="Zmień nazwę"
                    onClick={(event) => {
                      event.stopPropagation()
                      setRenaming(file.path)
                    }}
                  >
                    ✎
                  </button>
                  <button
                    title="Pobierz ten plik"
                    onClick={(event) => {
                      event.stopPropagation()
                      downloadFile(file.path, file.content)
                    }}
                  >
                    ↓
                  </button>
                  <button
                    title="Usuń"
                    onClick={(event) => {
                      event.stopPropagation()
                      removeFile(file.path)
                    }}
                  >
                    ✕
                  </button>
                </span>
              </>
            )}
          </div>
        ))}

        {message && <div className="filetree-message">{message}</div>}

        <div className="shortcuts">
          <button
            className="section-toggle"
            onClick={() => setShortcutsOpen((open) => !open)}
            title={shortcutsOpen ? 'Zwiń' : 'Rozwiń'}
          >
            <span className="toggle-sign">{shortcutsOpen ? '−' : '+'}</span>
            Skróty klawiszowe
          </button>

          {shortcutsOpen && (
            <>
              <dl>
                <dt>Ctrl + Spacja</dt><dd>podpowiedzi</dd>
                <dt>Ctrl + klik</dt><dd>przejdź do definicji</dd>
                <dt>Alt + ←</dt><dd>wróć po skoku</dd>
                <dt>Ctrl + F / H</dt><dd>szukaj / zamień</dd>
                <dt>Ctrl + /</dt><dd>zakomentuj linię</dd>
                <dt>Alt + ↑ / ↓</dt><dd>przenieś linię</dd>
                <dt>Shift+Alt+↓</dt><dd>powiel linię</dd>
                <dt>Ctrl + D</dt><dd>zaznacz kolejne wystąpienie</dd>
                <dt>Ctrl + Z / Y</dt><dd>cofnij / ponów</dd>
                <dt>F7</dt><dd>zbuduj i wgraj</dd>
                <dt>F5</dt><dd>pauza / wznów</dd>
              </dl>

              {/*
                Dymki sa najwieksza czescia wiedzy w tym narzedziu, a jednoczesnie
                jedyna, ktora sama sie nie pokazuje - trzeba wiedziec, ze warto
                najechac. Dlatego zamiast jednego zdania na szarym tle jest tu
                wyliczenie: co konkretnie odpowie, kiedy sie na nie najedzie.
              */}
              <div className="tip-card">
                <strong>Najedź kursorem — prawie wszystko tu coś opowiada</strong>
                <ul>
                  <li>
                    <b>nazwa rejestru albo bitu</b> (<code>UCSRC</code>, <code>OCIE1A</code>) —
                    czym jest, po co się jej używa i na co uważać;
                  </li>
                  <li>
                    <b>własna funkcja, zmienna lub argument</b> — jej deklaracja i plik,
                    w którym powstała;
                  </li>
                  <li>
                    <b>zakładki u góry, przyciski i pola wyboru</b> — po co są i kiedy się przydają.
                  </li>
                </ul>
                <p>
                  Przytrzymaj <b>Ctrl</b>: własne nazwy zmienią się w odsyłacze i kliknięcie
                  przeniesie do miejsca, w którym je zadeklarowano.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="editor-pane" ref={paneRef}>
        <div className="editor-tabs">
          <div className="tab active">{active?.path ?? '—'}</div>

          {canGoBack && (
            <button
              className="editor-back"
              onClick={goBack}
              title="Wróć tam, skąd nastąpił skok do definicji (Alt + ←)"
            >
              ← wróć
            </button>
          )}

          <span className="spacer" />

          {/*
            Przelacznik jest CELOWO duzy i podpisany stanem („WŁ." / „WYŁ.").
            Zwykly kwadracik pola wyboru w pasku nad edytorem ginie - a to jedyne
            miejsce, w ktorym da sie o tej mozliwosci dowiedziec.
          */}
          <label
            className={'switch' + (hideComments ? ' on' : '')}
            title={
              'Pokazuje ten sam kod bez komentarzy — do skopiowania do Microchip Studio ' +
              'albo do sprawozdania. Plik zostaje nietknięty, komentarze wracają po wyłączeniu.'
            }
          >
            <input
              type="checkbox"
              checked={hideComments}
              onChange={(event) => setHideComments(event.target.checked)}
            />
            <span className="switch-track" aria-hidden="true">
              <span className="switch-knob" />
            </span>
            <span className="switch-text">Bez komentarzy</span>
            <span className="switch-state">{hideComments ? 'WŁ.' : 'WYŁ.'}</span>
          </label>
        </div>

        <div className={'editor-area' + (hideComments ? ' with-bar' : '')}>
          {hideComments && (
            <div className="preview-bar">
              <strong>Podgląd bez komentarzy</strong>
              <span>
                {cleaned.removedComments > 0
                  ? `Ukryto ${cleaned.removedComments} ${odmiana(cleaned.removedComments, [
                      'komentarz',
                      'komentarze',
                      'komentarzy',
                    ])} — kod jest krótszy o ${cleaned.removedLines} ${odmiana(cleaned.removedLines, [
                      'linię',
                      'linie',
                      'linii',
                    ])}.`
                  : 'W tym pliku nie ma komentarzy — kod wygląda tak samo.'}{' '}
                Plik na dysku jest nietknięty; wyłącz przełącznik, żeby wrócić do pisania.
              </span>
              <span className="spacer" />
              <button className="primary" onClick={() => void copyClean()}>
                {copied ? 'Skopiowano ✓' : 'Kopiuj kod'}
              </button>
            </div>
          )}

          {active && !hideComments && (
            <Editor
              key={active.path}
              theme="vs-dark"
              path={active.path}
              language={languageOf(active.path)}
              defaultValue={initialContent}
              onMount={handleMount}
              onChange={handleChange}
              options={{
                fontFamily: "Consolas, 'Courier New', monospace",
                fontSize: 14,
                minimap: { enabled: true },
                tabSize: 4,
                renderWhitespace: 'selection',
                automaticLayout: true,
                scrollBeyondLastLine: false,
                quickSuggestions: { other: true, comments: false, strings: false },
                suggestOnTriggerCharacters: true,
                bracketPairColorization: { enabled: true },
                padding: { top: 10 },
              }}
            />
          )}

          {/*
            Podglad ma WLASNA sciezke dokumentu. Gdyby dzielil ja z plikiem,
            Monaco podmienialoby tresc tego samego modelu - i kod bez komentarzy
            trafilby do projektu, kasujac je nieodwracalnie.
          */}
          {active && hideComments && (
            <Editor
              key={'podglad:' + active.path}
              theme="vs-dark"
              path={'bez-komentarzy/' + active.path}
              language={languageOf(active.path)}
              value={cleaned.code}
              options={{
                fontFamily: "Consolas, 'Courier New', monospace",
                fontSize: 14,
                readOnly: true,
                domReadOnly: true,
                minimap: { enabled: true },
                tabSize: 4,
                automaticLayout: true,
                scrollBeyondLastLine: false,
                bracketPairColorization: { enabled: true },
                padding: { top: 10 },
              }}
            />
          )}
        </div>

        <div
          className="problems"
          style={problemsHeight ? { height: problemsHeight, maxHeight: 'none' } : undefined}
        >
          <div
            className="problems-resizer"
            title="Przeciągnij, żeby zmienić wysokość listy problemów"
            onPointerDown={(event) => {
              resizing.current = true
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerMove={(event) => {
              if (!resizing.current) return
              const pane = paneRef.current
              if (!pane) return
              const rect = pane.getBoundingClientRect()
              const height = rect.bottom - event.clientY
              setProblemsHeight(Math.max(90, Math.min(rect.height - 140, height)))
            }}
            onPointerUp={(event) => {
              resizing.current = false
              event.currentTarget.releasePointerCapture(event.pointerId)
            }}
            onDoubleClick={() => setProblemsHeight(null)}
          />
          <div className="problems-header">
            <strong>Problemy</strong>
            {errorCount > 0 && <span className="badge error">{errorCount} błędów</span>}
            {warningCount > 0 && <span className="badge warning">{warningCount} ostrzeżeń</span>}
            {diagnostics.length === 0 && <span className="badge ok">nic nie znaleziono</span>}
            <span className="spacer" />
            {/*
              Kompilator bywa dwojaki - serwerowy avr-gcc albo clang w przegladarce -
              wiec nie wskazujemy tu ktoregos z nich po nazwie. Ktory pracuje, mowi
              pasek stanu; tutaj wazne jest tylko, skad bierze sie ktora czesc listy.
            */}
            <span className="problems-hint">
              Komunikaty oznaczone „Kompilator” pochodzą wprost z kompilatora. Pozostałe to
              analiza uwzględniająca stan płytki: przewody, zworki i fuse bity.
            </span>
          </div>

          <div className="problems-list">
            {diagnostics.length === 0 && (
              <p className="problems-empty">
                Nie znaleziono typowych błędów. To nie zastępuje kompilacji — sprawdzane są
                najczęstsze potknięcia składniowe, błędy w obsłudze rejestrów oraz zgodność
                programu z aktualnym ustawieniem płytki.
              </p>
            )}
            {diagnostics.map((item, index) => (
              <div key={index} className={`problem ${item.severity}`} onClick={() => jumpTo(item)}>
                <span className="problem-place">
                  {item.path && item.path !== active?.path ? `${item.path}, ` : ''}linia {item.line}
                </span>
                <span
                  className={
                    'problem-source source-' +
                    (item.source === 'Płytka' ? 'board' : item.source === 'Kompilator' ? 'compiler' : item.source.toLowerCase())
                  }
                >
                  {item.source}
                </span>
                <div className="problem-text">
                  <div className="problem-message">
                    <span className="problem-severity">{SEVERITY_LABEL[item.severity]}:</span> {item.message}
                  </div>
                  {item.hint && <div className="problem-hint">{item.hint}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
