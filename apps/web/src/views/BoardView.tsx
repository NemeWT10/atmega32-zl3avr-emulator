import { useCallback, useEffect, useRef, useState } from 'react'
import type { Wire } from '@zl3avr/board'
import { useSimulator, useSimulatorEvents } from '../sim/SimulationContext'
import { BoardCanvas, type HoverInfo } from '../board-view/BoardCanvas'
import { Minimap } from '../board-view/Minimap'
import { WiringHelp } from '../board-view/WiringHelp'
import { useKeyboardKeypad } from '../board-view/useKeyboardKeypad'
import { getBox } from '../board-view/bounds'
import { TerminalView } from './TerminalView'
import {
  FULL_VIEW,
  MAX_ZOOM,
  MIN_ZOOM,
  describeZoom,
  focusOn,
  isFullView,
  zoomBy,
  zoomOf,
  type Viewport,
} from '../board-view/viewport'
import type { BoardHelp } from '../knowledge/board-help'
import { chapterLabel, openKompendium } from '../kompendium/navigation'

/**
 * Widok plytki ZL3AVR.
 *
 * Pomoc dziala dwustopniowo i jest to swiadoma decyzja:
 *
 *   NAJECHANIE  - obrys elementu i maly dymek przy kursorze z jednym zdaniem.
 *                 Pojawia sie z opoznieniem, wiec samo przesuwanie myszy nad
 *                 plytka niczego nie miga.
 *   KLIKNIECIE  - pelny opis przypiety w panelu obok. Panel NIE zmienia sie
 *                 przy ruchu myszy, wiec da sie go spokojnie przeczytac,
 *                 jednoczesnie ogladajac plytke.
 *
 * Wczesniej panel podazal za kursorem - tresc skakala przy kazdym ruchu
 * i trzeba bylo za nia wodzic wzrokiem. To meczylo i utrudnialo czytanie.
 *
 * Kazda zmiana polaczen (wypiecie zyly, wyczyszczenie plytki) zapisuje
 * poprzedni stan, zeby dalo sie ja COFNAC. Bez tego jedno przypadkowe
 * klikniecie kasuje kwadrans przepinania.
 *
 * Gotowych zestawow polaczen NIE wczytuje sie z tego widoku. Przewody sa
 * czescia cwiczenia razem z kodem, wiec wczytanie przykladu jest JEDNA
 * operacja w pasku glownym - dwa osobne miejsca wczytywania prowadzily
 * do stanu, w ktorym na plytce stoja przewody z jednego cwiczenia,
 * a w mikrokontrolerze program z drugiego.
 *
 * Panel z prawej pokazuje wylacznie opis wskazanego elementu. Instrukcja
 * obslugi narzedzia (przewody, powiekszanie, klawiatura) jest w README -
 * czytelnik nie potrzebuje jej za kazdym razem, a zajmowala pol ekranu.
 */

/** Ile milisekund trzeba spokojnie postac nad elementem, zanim pojawi sie dymek. */
const TOOLTIP_DELAY = 320

/** Szerokosc dymka z index.css - potrzebna, zeby nie wyjechal poza okno. */
const TOOLTIP_WIDTH = 300

interface TooltipState extends HoverInfo {
  x: number
  y: number
}

export function BoardView() {
  const simulator = useSimulator()
  useSimulatorEvents(['tick', 'state', 'serial'], 30)

  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [pinned, setPinned] = useState<{ help: BoardHelp; boxId: string | null } | null>(null)
  const [wiresHidden, setWiresHidden] = useState(false)
  /** Wycinek rysunku widoczny w oknie: przesuwanie i powiekszanie. */
  const [view, setView] = useState<Viewport>(FULL_VIEW)
  /** Poprzedni uklad przewodow - jeden krok wstecz wystarcza do naprawy pomylki. */
  const [undo, setUndo] = useState<{ wires: Wire[]; label: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /**
   * Prowadzony wlasnie przewod (opis zrodla + kolor + liczba zyl) - przez caly
   * czas prowadzenia nad plytka stoi pasek z ta informacja. Bez niego tryb
   * "podniesionego przewodu" byłby stanem, ktorego nigdzie nie widac,
   * a przygaszona plytka wygladalaby na usterke.
   */
  const [wiring, setWiring] = useState<{ label: string; colour: string; count: number } | null>(
    null,
  )
  /**
   * Podpowiedz o przesuwaniu i powiekszaniu pokazujemy tylko do pierwszego
   * uzycia. Potem znika na stale - kto raz przybliżyl, juz wie, jak to dziala,
   * a staly napis nad plytka tylko zaslania rysunek.
   */
  const [navHintSeen, setNavHintSeen] = useState(false)

  /**
   * Terminal zadokowany pod plytka.
   *
   * Czesc cwiczen wymaga patrzenia na OBIE rzeczy naraz: wcisnac klawisz
   * na plytce i zobaczyc, co poszlo laczem szeregowym. Na osobnych zakladkach
   * nie da sie tego zrobic - dlatego terminal da sie miec pod plytka, tak jak
   * w laboratorium ma sie okno terminala obok zestawu.
   *
   * Otwiera sie SAM, gdy plytka pierwszy raz cos nada. To jedyny moment,
   * w ktorym na pewno jest potrzebny, a bez tego student nie wie, ze gdzies
   * czeka na niego odpowiedz.
   */
  const [serialOpen, setSerialOpen] = useState(false)
  /** Reczne zamkniecie wylacza samoczynne otwieranie - nie wracamy z tym co chwile. */
  const closedByUser = useRef(false)
  /** Wysokosc zadokowanego terminala - jedne cwiczenia potrzebuja jednej linii, inne kilkunastu. */
  const [serialHeight, setSerialHeight] = useState(300)

  /**
   * Otwarcie panelu dopasowuje jego wysokosc do okna. Stale 300 px na niskim
   * ekranie zostawialo z plytki paseczek - a to ona jest tu najwazniejsza.
   */
  const openSerial = useCallback(() => {
    const height = viewRef.current?.getBoundingClientRect().height ?? 0
    if (height > 0) setSerialHeight(Math.max(160, Math.min(300, Math.round(height * 0.4))))
    setSerialOpen(true)
  }, [])
  const resizingSerial = useRef(false)
  const viewRef = useRef<HTMLDivElement>(null)

  const changeView = useCallback((next: Viewport) => {
    setView(next)
    setNavHintSeen(true)
  }, [])

  const containerRef = useRef<HTMLDivElement>(null)
  const pointer = useRef({ x: 0, y: 0 })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const board = simulator.board
  const state = board.getState()

  // Klawiatura komputera steruje klawiatura matrycowa, dopoki widoczny jest ten widok.
  useKeyboardKeypad(board, true)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      if (noticeTimer.current) clearTimeout(noticeTimer.current)
    },
    [],
  )

  const receivedBytes = simulator.serialFromBoard.length
  useEffect(() => {
    if (receivedBytes > 0 && !closedByUser.current) openSerial()
  }, [receivedBytes, openSerial])

  /**
   * Krotki komunikat nad rysunkiem - znika sam, nie wymaga zamykania.
   * Pusty tekst gasi go od razu: po udanej operacji nie ma sensu trzymac
   * na ekranie ostrzezenia o poprzedniej, nieudanej probie.
   */
  const announce = useCallback((text: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    setNotice(text || null)
    if (text) noticeTimer.current = setTimeout(() => setNotice(null), 6000)
  }, [])

  /** Zapamietanie ukladu przewodow PRZED operacja, ktora go zmieni. */
  const rememberWires = useCallback(
    (label: string) => {
      setUndo({ wires: board.wires.map((wire) => ({ ...wire })), label })
    },
    [board],
  )

  const handleHover = useCallback((info: HoverInfo | null) => {
    if (timer.current) clearTimeout(timer.current)
    if (!info) {
      setTooltip(null)
      return
    }
    timer.current = setTimeout(() => {
      setTooltip({ ...info, x: pointer.current.x, y: pointer.current.y })
    }, TOOLTIP_DELAY)
  }, [])

  const handleSelect = useCallback((help: BoardHelp | null, boxId: string | null) => {
    if (!help) return
    setPinned({ help, boxId })
    setTooltip(null)
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const trackPointer = (event: React.MouseEvent) => {
    const box = containerRef.current?.getBoundingClientRect()
    if (!box) return
    pointer.current = { x: event.clientX - box.left, y: event.clientY - box.top }
  }

  const undoWiring = () => {
    if (!undo) return
    board.restoreWires(undo.wires)
    setUndo(null)
    announce('Cofnięto: ' + undo.label + '.')
  }

  /** Dojazd do wskazanego elementu - przy powiekszeniu szukanie wzrokiem jest beznadziejne. */
  const showOnBoard = (boxId: string | null) => {
    const box = boxId ? getBox(boxId) : undefined
    if (!box) return
    changeView(focusOn(box))
  }

  const zoom = zoomOf(view)
  const canvasHeight = containerRef.current?.clientHeight ?? 0
  /** Blisko dolnej krawedzi dymek nie zmiesci sie pod kursorem - otwieramy go w gore. */
  const flipUp = canvasHeight > 0 && tooltip !== null && tooltip.y > canvasHeight - 190

  return (
    <div
      className={'board-view' + (serialOpen ? ' with-serial' : '')}
      ref={viewRef}
      style={serialOpen ? { gridTemplateRows: `auto minmax(0, 1fr) ${serialHeight}px` } : undefined}
    >
      <div className="board-toolbar">
        <button
          onClick={() => {
            if (board.wires.length === 0) return
            rememberWires('wypięcie wszystkich przewodów')
            board.clearWires()
            announce('Wypięto wszystkie przewody.')
          }}
          disabled={board.wires.length === 0}
        >
          Wypnij wszystkie przewody
        </button>

        <button onClick={undoWiring} disabled={!undo} title={undo ? `Cofnij: ${undo.label}` : 'Nie ma czego cofać'}>
          ↩ Cofnij
        </button>

        {/*
          Przelacznik terminala ma sie wyroznic sposrod przyciskow obok, bo to
          jedyny sposob, zeby zobaczyc plytke i lacze szeregowe naraz - a nikt
          go nie szuka, dopoki nie wie, ze istnieje. Stad znak zachety zamiast
          samego napisu i wyrazny stan „wlaczone”.
        */}
        <button
          className={'serial-toggle' + (serialOpen ? ' active' : '')}
          onClick={() => {
            closedByUser.current = serialOpen
            if (serialOpen) setSerialOpen(false)
            else openSerial()
          }}
          title={
            serialOpen
              ? 'Schowaj terminal USART spod płytki'
              : 'Pokaż terminal USART pod płytką — zobaczysz naraz klawiaturę, diody i to, co idzie łączem'
          }
        >
          <span className="serial-toggle-icon" aria-hidden="true">
            ›_
          </span>
          <span className="serial-toggle-label">Terminal USART</span>
          <span className="serial-toggle-state">{serialOpen ? 'ukryj' : 'pokaż'}</span>
          {!serialOpen && receivedBytes > 0 && (
            <span className="serial-badge" title={`Płytka nadała bajtów: ${receivedBytes}`}>
              {receivedBytes}
            </span>
          )}
        </button>

        <label
          className={'checkbox toggle-warning' + (wiresHidden ? ' active' : '')}
          title="Przydatne, gdy nad złączem wisi już kilka żył"
        >
          <input type="checkbox" checked={wiresHidden} onChange={(event) => setWiresHidden(event.target.checked)} />
          {wiresHidden ? 'przewody UKRYTE' : 'ukryj przewody'}
        </label>

        <span className="spacer" />

        <span className="board-toolbar-hint">przewodów: {board.wires.length}</span>

        <span className="zoom-control" title="Kółko myszy przybliża tam, gdzie stoi kursor">
          <button onClick={() => changeView(zoomBy(view, 1 / 1.4))} disabled={zoom <= MIN_ZOOM + 0.001}>
            −
          </button>
          <span className="zoom-value">{describeZoom(view)}</span>
          <button onClick={() => changeView(zoomBy(view, 1.4))} disabled={zoom >= MAX_ZOOM - 0.001}>
            +
          </button>
          <button onClick={() => changeView(FULL_VIEW)} disabled={isFullView(view)}>
            cała płytka
          </button>
        </span>
      </div>

      <div className="board-layout">
        <div
          className="board-canvas"
          ref={containerRef}
          onMouseMove={trackPointer}
          onMouseLeave={() => handleHover(null)}
        >
          <BoardCanvas
            board={board}
            state={state}
            programming={simulator.programming.active}
            onReset={() => simulator.reset()}
            onHover={handleHover}
            onSelect={handleSelect}
            pinnedBox={pinned?.boxId ?? null}
            wiresHidden={wiresHidden}
            view={view}
            onView={changeView}
            onBeforeWiringChange={rememberWires}
            onNotice={announce}
            onWiringState={setWiring}
          />

          {!navHintSeen && (
            <div className="board-nav-hint">
              Kółko myszy przybliża · przeciągnij płytkę, żeby ją przesunąć · dwuklik przybliża
            </div>
          )}

          {!isFullView(view) && <Minimap view={view} onView={changeView} />}

          <WiringHelp />

          {wiring && (
            <div className="board-wiring-chip">
              <span className="wiring-dot" style={{ background: wiring.colour }} aria-hidden="true" />
              {wiring.count === 1 ? (
                <span>
                  Prowadzisz przewód z&nbsp;<strong>{wiring.label}</strong> — kliknij drugą
                  szpilkę, żeby połączyć.
                </span>
              ) : (
                <span>
                  Prowadzisz wiązkę <strong>{wiring.count} przewodów</strong> z&nbsp;
                  <strong>{wiring.label}</strong> — kliknij szpilkę pierwszej żyły, reszta
                  wejdzie w kolejne linie.
                </span>
              )}
              <span className="wiring-esc">Esc odkłada</span>
            </div>
          )}

          {notice && <div className="board-notice">{notice}</div>}

          {tooltip && (
            <div
              className="board-tooltip"
              style={{
                left: Math.max(
                  4,
                  Math.min(tooltip.x + 18, (containerRef.current?.clientWidth ?? 0) - TOOLTIP_WIDTH - 8),
                ),
                // Przy dolnej krawedzi dymek otwiera sie W GORE - inaczej wystaje
                // poza okno i nie da sie go doczytac.
                top: flipUp ? undefined : tooltip.y + 18,
                bottom: flipUp ? canvasHeight - tooltip.y + 18 : undefined,
              }}
            >
              <strong>{tooltip.help.title}</strong>
              {tooltip.help.rare && <span className="rare-badge">rzadko używane</span>}
              <p>{tooltip.help.what}</p>
              <span className="tooltip-hint">
                {tooltip.action ??
                  (tooltip.help.trap
                    ? 'Ma z tym związaną pułapkę — kliknij, aby przeczytać.'
                    : 'Kliknij, aby przeczytać więcej.')}
              </span>
            </div>
          )}
        </div>

        <aside className="board-help">
          {pinned ? (
            <div className="help-card">
              <div className="help-card-header">
                <h3>{pinned.help.title}</h3>
                <button className="help-close" onClick={() => setPinned(null)} title="Zamknij opis">
                  ✕
                </button>
              </div>
              {pinned.help.rare && (
                <p className="rare-note">
                  <span className="rare-badge">rzadko używane</span> Typowe ćwiczenia się bez tego obywają —
                  możesz spokojnie przejść dalej.
                </p>
              )}
              <p className="help-what">{pinned.help.what}</p>
              {pinned.help.use && (
                <>
                  <h4>Jak się tego używa</h4>
                  <p>{pinned.help.use}</p>
                </>
              )}
              {pinned.help.trap && (
                <div className="help-trap">
                  <strong>Uwaga na to</strong>
                  <p>{pinned.help.trap}</p>
                </div>
              )}
              {pinned.boxId && getBox(pinned.boxId) && (
                <button className="help-locate" onClick={() => showOnBoard(pinned.boxId)}>
                  Pokaż na płytce
                </button>
              )}
              {pinned.help.chapter && (
                <button
                  className="kompendium-link"
                  onClick={() => openKompendium(pinned.help.chapter)}
                  title="Otwiera zakładkę Kompendium na rozdziale o tym elemencie"
                >
                  📖 Teoria: „{chapterLabel(pinned.help.chapter)}” w Kompendium
                </button>
              )}
            </div>
          ) : (
            <div className="help-card help-empty">
              <h3>Opis elementu</h3>
              <p>
                Najedź kursorem na dowolny element płytki — pokaże się krótka podpowiedź.
                <strong> Kliknij</strong>, żeby przeczytać tu pełny opis: czym jest, po co tu jest,
                jak się go używa i na co uważać.
              </p>
              <p className="help-note">Opis zostaje na miejscu, dopóki nie wybierzesz innego elementu.</p>
              <p className="help-note">
                Prowadzenie przewodów, przybliżanie rysunku i sterowanie klawiaturą opisuje
                zakładka <strong>Poradnik</strong>.
              </p>
            </div>
          )}
        </aside>
      </div>

      {serialOpen && (
        <div className="board-serial">
          <div
            className="board-serial-resizer"
            title="Przeciągnij, żeby zmienić wysokość terminala"
            onPointerDown={(event) => {
              resizingSerial.current = true
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerMove={(event) => {
              if (!resizingSerial.current) return
              const box = viewRef.current?.getBoundingClientRect()
              if (!box) return
              const height = box.bottom - event.clientY
              setSerialHeight(Math.max(160, Math.min(box.height - 220, height)))
            }}
            onPointerUp={(event) => {
              resizingSerial.current = false
              event.currentTarget.releasePointerCapture(event.pointerId)
            }}
            onDoubleClick={() => setSerialHeight(300)}
          />
          <div className="board-serial-header">
            <strong>Terminal USART</strong>
            <span className="help-note">
              to samo okno co w zakładce „Terminal USART” — pełny rozmiar znajdziesz tam
            </span>
            <span className="spacer" />
            <button
              onClick={() => {
                closedByUser.current = true
                setSerialOpen(false)
              }}
            >
              Zamknij ✕
            </button>
          </div>
          <TerminalView compact />
        </div>
      )}
    </div>
  )
}
