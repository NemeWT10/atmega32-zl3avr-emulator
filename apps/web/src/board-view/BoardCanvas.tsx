import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CONNECTORS, type Board, type BoardState, type NetLevel, type PinRef } from '@zl3avr/board'
import { BOARD_HELP, DECORATION_HELP, type BoardHelp } from '../knowledge/board-help'
import { getBox } from './bounds'
import { BoardArtwork } from './BoardArtwork'
import { WireLayer, describePin } from './WireLayer'
import { WirePreview } from './WirePreview'
import {
  DECORATIONS,
  HEADERS,
  JUMPERS,
  KEYPAD,
  MCU_BODY,
  KEY_LABELS,
  LCD_MODULE,
  LED_ROW,
  PIN_PITCH,
  PROGRAMMING_LED,
  RESET_BUTTON,
  SEGMENT_DISPLAY,
  pinPosition,
} from './layout'
import type { Point, Rope } from './rope'
import { panBy, zoomAt, type Viewport } from './viewport'

/**
 * Interaktywna plytka: piny, peryferia i przewody.
 *
 * Cztery decyzje, ktore decyduja o tym, czy da sie tego uzywac:
 *
 * 1. PINY SA RYSOWANE NAD PRZEWODAMI. Przy kilkunastu zylach wiszacych nad
 *    zlaczem nie da sie inaczej trafic w sasiedni pin - przewod przechwytywalby
 *    klikniecie.
 * 2. PRZYCIAGANIE DO NAJBLIZSZEGO PINU. Puszczenie przewodu w poblizu pinu
 *    wystarczy; nie trzeba celowac w kwadracik o boku 8 jednostek.
 * 3. PRZEWODY BLEDNA I PRZESTAJA LAPAC KLIKNIECIA NA CZAS PRZECIAGANIA,
 *    zeby bylo widac, dokad sie celuje.
 * 4. PRZESUWANIE I POWIEKSZANIE JAK NA MAPIE. Kolko myszy przybliza w miejscu
 *    kursora, przeciagniecie tla przesuwa obraz. Elementy, ktore cos robia
 *    (piny, klawisze, zworki, reset), maja `data-nopan` - na nich przeciagniecie
 *    znaczy co innego niz przesuwanie widoku.
 */

/** Co pokazac w dymku przy kursorze. */
export interface HoverInfo {
  help: BoardHelp
  /** Prostokat do obrysowania; `null`, gdy element nie ma wlasnego obrysu. */
  boxId: string | null
  /**
   * Co mozna z tym zrobic. Zastepuje domyslna stopke dymka („kliknij, aby
   * przeczytac wiecej”) tam, gdzie klikniecie znaczy co innego - pin zaczyna
   * przewod, a przewod da sie wypiac.
   */
  action?: string
}

interface Props {
  board: Board
  state: BoardState
  /** Czy trwa wgrywanie programu - miga wtedy dioda D10, jak na plytce. */
  programming: boolean
  onReset: () => void
  /** Element pod kursorem - nadrzedny widok pokazuje dla niego maly dymek. */
  onHover: (info: HoverInfo | null) => void
  /** Element wskazany klknieciem - jego opis zostaje przypiety w panelu obok. */
  onSelect: (help: BoardHelp | null, boxId: string | null) => void
  /** Identyfikator elementu, ktorego opis jest aktualnie przypiety. */
  pinnedBox: string | null
  /** Ukrycie przewodow ulatwia przepinanie przy gestym oplataniu. */
  wiresHidden: boolean
  /** Wycinek rysunku widoczny w oknie - patrz viewport.ts. */
  view: Viewport
  onView: (next: Viewport) => void
  /**
   * Wolane TUZ PRZED kazda zmiana polaczen - widok zapamietuje wtedy poprzedni
   * uklad przewodow, zeby dalo sie ja cofnac. Wypiecie zyly jednym klknieciem
   * bez mozliwosci cofniecia to najbolesniejsza pomylka w tym narzedziu.
   */
  onBeforeWiringChange: (label: string) => void
  /**
   * Krotki komunikat nad rysunkiem. Uzywany tam, gdzie przeciagniecie nie
   * daje zadnego efektu - bez slowa wyjasnienia „nic sie nie stalo” wyglada
   * identycznie jak usterka narzedzia.
   */
  onNotice: (text: string) => void
}

function samePin(a: PinRef, b: PinRef): boolean {
  return a.connector === b.connector && a.index === b.index
}

/** Promien, w ktorym przewod „wskakuje” na pin. */
const SNAP_RADIUS = 46

/** Ile pikseli musi przejechac kursor, zeby uznac to za przesuwanie, a nie klikniecie. */
const PAN_THRESHOLD = 4

interface PinCandidate {
  pin: PinRef
  position: Point
  occupied: boolean
}

export function BoardCanvas({
  board,
  state,
  programming,
  onReset,
  onHover,
  onSelect,
  pinnedBox,
  wiresHidden,
  view,
  onView,
  onBeforeWiringChange,
  onNotice,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  /** Zyla trzymana w reku. `colour` ustalamy z gory, zeby podglad mial juz kolor gotowego przewodu. */
  const [drag, setDrag] = useState<{ from: PinRef; anchor: Point; cursor: Point; colour: string } | null>(null)
  const [hoveredPin, setHoveredPin] = useState<string | null>(null)
  /** Identyfikator obrysu elementu pod kursorem - stad podswietlenie. */
  const [hoveredBox, setHoveredBox] = useState<string | null>(null)
  const [panning, setPanning] = useState(false)
  /**
   * Warstwa rysowana na samym koncu - trafia do niej opis wskazanego przewodu.
   * Bez tego napis „co z czym laczy” chowal sie pod rzedem pinow.
   */
  const [calloutHost, setCalloutHost] = useState<SVGGElement | null>(null)
  /**
   * Ksztalt, ktory swiezo utworzony przewod ma przejac po podgladzie.
   * Bez tego zyla w chwili polaczenia przeskakiwala w zupelnie inne polozenie.
   */
  const [handoff, setHandoff] = useState<{ id: string; rope: Rope } | null>(null)
  /** Lancuch podgladu udostepniony przez WirePreview - stad bierzemy ksztalt. */
  const previewRope = useRef<Rope | null>(null)
  const keepPreviewRope = useCallback((rope: Rope | null) => {
    previewRope.current = rope
  }, [])

  // Przekazany ksztalt jest jednorazowy - zwalniamy go zaraz po wykorzystaniu.
  useEffect(() => {
    if (handoff) setHandoff(null)
  }, [handoff])

  /**
   * Rozdzielenie wskazania od wyboru jest tu celowe.
   *
   * Panel z opisem NIE zmienia sie przy przesuwaniu myszy - to meczylo, bo tresc
   * skakala przy kazdym ruchu i trzeba bylo za nia wodzic wzrokiem. Najechanie
   * daje tylko obrys i maly dymek przy kursorze, a pelny opis pojawia sie
   * dopiero po KLIKNIECIU i zostaje, dopoki uzytkownik nie wybierze czegos innego.
   */
  const interact = useMemo(
    () => ({
      hover: (help: BoardHelp | null, boxId: string | null, action?: string) => {
        onHover(help ? { help, boxId, action } : null)
        setHoveredBox(help ? boxId : null)
      },
      select: (help: BoardHelp | null, boxId: string | null) => {
        if (help) onSelect(help, boxId)
      },
    }),
    [onHover, onSelect],
  )

  // Krotszy zapis dla wywolan w tym komponencie.
  const hover = interact.hover
  const select = interact.select

  /** Wszystkie piny plytki - lista jest stala, wiec liczymy ja raz. */
  const candidates = useMemo<PinCandidate[]>(() => {
    const list: PinCandidate[] = []
    for (const header of HEADERS) {
      for (let index = 0; index < header.rows; index++) {
        for (let column = 0; column < header.columns; column++) {
          const position = pinPosition(header.id, index, column)
          if (position) {
            list.push({ pin: { connector: header.id, index }, position, occupied: header.occupied === true })
          }
        }
      }
    }
    return list
  }, [])

  /** Przeliczenie punktu ekranu na wspolrzedne rysunku - uwzglednia powiekszenie. */
  const toSvgPoint = useCallback((clientX: number, clientY: number): Point => {
    const svg = svgRef.current
    const matrix = svg?.getScreenCTM()
    if (!svg || !matrix) return { x: 0, y: 0 }
    const point = svg.createSVGPoint()
    point.x = clientX
    point.y = clientY
    const transformed = point.matrixTransform(matrix.inverse())
    return { x: transformed.x, y: transformed.y }
  }, [])

  // -------------------------------------------------------------------------
  // Przesuwanie i powiekszanie
  // -------------------------------------------------------------------------

  /**
   * Biezacy widok trzymamy takze w referencji, bo obsluga kolka myszy jest
   * podpieta natywnie (React rejestruje `wheel` jako zdarzenie pasywne, wiec
   * z poziomu `onWheel` nie da sie zablokowac przewijania strony).
   */
  const viewRef = useRef(view)
  viewRef.current = view
  const onViewRef = useRef(onView)
  onViewRef.current = onView

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      // deltaMode: 0 = piksele, 1 = linie (Firefox), 2 = strony
      const delta =
        event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * 400 : event.deltaY
      const svgPoint = svg.createSVGPoint()
      svgPoint.x = event.clientX
      svgPoint.y = event.clientY
      const matrix = svg.getScreenCTM()
      if (!matrix) return
      const point = svgPoint.matrixTransform(matrix.inverse())
      onViewRef.current(zoomAt(viewRef.current, point, Math.exp(-delta * 0.0015)))
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  const pan = useRef<{
    pointerId: number
    originX: number
    originY: number
    start: Viewport
    unitsPerPixel: number
    /** Czy kursor przejechal juz tyle, ze to na pewno przesuwanie. */
    moved: boolean
    /** Czy przejelismy wskaznik - robimy to DOPIERO po ruszeniu, patrz nizej. */
    captured: boolean
  } | null>(null)

  /**
   * Po przesunieciu widoku trzeba polknac klikniecie, ktore i tak przyjdzie
   * na koncu przeciagniecia. Inaczej przesuniecie zakonczone nad przewodem
   * wypinaloby go - a to najbardziej irytujacy rodzaj bledu: uzytkownik nie
   * zrobil nic zlego, a stracil polaczenie.
   */
  const suppressClick = useRef(false)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const swallow = (event: MouseEvent) => {
      if (!suppressClick.current) return
      suppressClick.current = false
      event.stopPropagation()
      event.preventDefault()
    }
    /**
     * Kasowanie zaleglosci na poczatku KAZDEGO gestu.
     *
     * Klikniecie konczace przesuwanie czasem w ogole nie powstaje (zalezy to od
     * tego, czy nacisniecie i puszczenie trafily w ten sam element). Bez tego
     * kasowania flaga zostawalaby podniesiona i polykala nastepne, zupelnie
     * niewinne klikniecie - a to wyglada jak zepsuty interfejs.
     */
    const clear = () => {
      suppressClick.current = false
    }

    // Faza przechwytywania: React nasluchuje na korzeniu dokumentu, wiec tutaj
    // jestesmy pierwsi i mozemy nie dopuscic zdarzenia do jego obslugi.
    svg.addEventListener('click', swallow, true)
    svg.addEventListener('pointerdown', clear, true)
    return () => {
      svg.removeEventListener('click', swallow, true)
      svg.removeEventListener('pointerdown', clear, true)
    }
  }, [])

  const beginPan = (event: React.PointerEvent) => {
    if (drag) return
    // Lewy przycisk przesuwa tlo, srodkowy - takze elementy interaktywne.
    if (event.button !== 0 && event.button !== 1) return
    if (event.button === 0 && (event.target as Element).closest('[data-nopan]')) return
    const svg = svgRef.current
    const matrix = svg?.getScreenCTM()
    if (!svg || !matrix) return
    // Dwie rzeczy, ktorych TU NIE WOLNO zrobic - obie zabijaja klikanie po plytce:
    //
    //   preventDefault() - zablokowany `pointerdown` nie wytwarza pozniej
    //   zdarzenia `click` (zaznaczanie tekstu i tak wylacza `user-select`),
    //
    //   setPointerCapture() - przejety wskaznik przekierowuje kolejne zdarzenia
    //   na element przechwytujacy, wiec `click` trafialby w cale plotno zamiast
    //   w klikniety element. Wskaznik przejmujemy dopiero wtedy, gdy kursor
    //   naprawde ruszy (nizej) - a wtedy klikniecia i tak juz nie chcemy.
    pan.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      start: view,
      unitsPerPixel: 1 / matrix.a,
      moved: false,
      captured: false,
    }
  }

  const endPan = () => {
    const current = pan.current
    if (!current) return
    if (current.moved) suppressClick.current = true
    if (current.captured) {
      try {
        svgRef.current?.releasePointerCapture(current.pointerId)
      } catch {
        // Wskaznik moglo juz zabraknac (np. odlaczone urzadzenie) - nic sie nie dzieje.
      }
    }
    pan.current = null
    setPanning(false)
  }

  // -------------------------------------------------------------------------
  // Prowadzenie przewodow
  // -------------------------------------------------------------------------

  /**
   * Pin najblizszy podanemu punktowi - o ile miesci sie w promieniu przyciagania.
   *
   * Osobna funkcja, a nie tylko wartosc wyliczona ze stanu, bo w chwili
   * puszczenia przycisku musimy uzyc DOKLADNIE tej pozycji kursora, ktora
   * przyszla ze zdarzeniem. Poleganie na stanie oznaczaloby, ze przy bardzo
   * szybkim ruchu myszy zyla ladowala tam, gdzie kursor byl klatke wczesniej.
   */
  const findSnap = useCallback(
    (cursor: Point): PinCandidate | null => {
      let best: PinCandidate | null = null
      let bestDistance = SNAP_RADIUS
      for (const candidate of candidates) {
        if (candidate.occupied) continue
        const distance = Math.hypot(candidate.position.x - cursor.x, candidate.position.y - cursor.y)
        if (distance < bestDistance) {
          bestDistance = distance
          best = candidate
        }
      }
      return best
    },
    [candidates],
  )

  /** Cel widoczny na rysunku - liczony z ostatniego zatwierdzonego polozenia. */
  const snapTarget = useMemo<PinCandidate | null>(
    () => (drag ? findSnap(drag.cursor) : null),
    [drag, findSnap],
  )

  /**
   * Pin, do ktorego zyla naprawde sie podepnie.
   *
   * Pin zrodlowy zostaje na liscie kandydatow celowo: dopoki kursor jest tuz
   * przy nim, to on jest najblizszy, wiec podglad nie przeskakuje na sasiada
   * przy pierwszym drgnieciu reki. Do polaczenia i do podswietlenia bierzemy
   * juz jednak tylko cel INNY niz zrodlo.
   */
  const connectTarget = useMemo<PinCandidate | null>(() => {
    if (!drag || !snapTarget) return null
    return samePin(snapTarget.pin, drag.from) ? null : snapTarget
  }, [drag, snapTarget])

  const resolvePin = useCallback(
    (connector: string, index: number) => pinPosition(connector as PinRef['connector'], index),
    [],
  )

  /**
   * Wskaznik przeciagania. Przejmujemy go DOPIERO po ruszeniu kursorem, bo
   * przejety wskaznik przekierowuje pozniejsze `click` na cale plotno -
   * a samo klikniecie pinu ma pokazac opis zlacza.
   */
  const dragPointer = useRef<{
    pointerId: number
    originX: number
    originY: number
    captured: boolean
    /** Pin zrodlowy i kolor - trzymane tutaj, zeby nie zalezec od stanu Reacta. */
    from: PinRef
    colour: string
  } | null>(null)

  const beginDrag = (pin: PinRef, occupied: boolean, event: React.PointerEvent) => {
    if (occupied) {
      hover(BOARD_HELP.JP27 ?? null, 'złącze JP27')
      return
    }
    if (event.button !== 0) return
    const anchor = pinPosition(pin.connector, pin.index)
    if (!anchor) return
    // Bez preventDefault(): zablokowany `pointerdown` nie wytwarza pozniej
    // zdarzenia `click`, a klikniecie pinu ma przypiac opis zlacza.
    event.stopPropagation()
    const colour = nextWireColour(board.wires.length)
    dragPointer.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      captured: false,
      from: pin,
      colour,
    }
    setDrag({ from: pin, anchor, cursor: toSvgPoint(event.clientX, event.clientY), colour })
  }

  const releaseDragPointer = () => {
    const pointer = dragPointer.current
    if (pointer?.captured) {
      try {
        svgRef.current?.releasePointerCapture(pointer.pointerId)
      } catch {
        // Wskaznika moglo juz nie byc - nic sie nie dzieje.
      }
    }
    dragPointer.current = null
  }

  /**
   * Puszczenie przycisku: laczymy, jesli zyla trafila w pin.
   *
   * Wszystko bierzemy z referencji i z pozycji podanej przez samo zdarzenie -
   * stan Reacta moze byc o klatke z tylu.
   */
  const finishDrag = (cursor: Point) => {
    const pointer = dragPointer.current
    if (!pointer) {
      setDrag(null)
      return
    }
    const target = findSnap(cursor)
    const connect = target && !samePin(target.pin, pointer.from) ? target.pin : null

    if (!connect) {
      // O nieudanej probie mowimy tylko wtedy, gdy uzytkownik naprawde ciagnal
      // zyle. Zwykle klikniecie pinu ma pokazac opis zlacza i nic wiecej.
      if (pointer.captured) {
        onNotice('Przewód nie trafił w żadną szpilkę — puść go bliżej tej, do której chcesz go podpiąć.')
      }
    } else {
      // Te same dwa piny juz polaczone - druga zyla lezalaby dokladnie na
      // pierwszej, wiec nic by nie bylo widac, a licznik przewodow rosl.
      const duplicate = board.wires.some(
        (wire) =>
          (samePin(wire.a, pointer.from) && samePin(wire.b, connect)) ||
          (samePin(wire.a, connect) && samePin(wire.b, pointer.from)),
      )
      if (duplicate) {
        onNotice('Te dwie szpilki są już połączone — druga żyła nic by nie zmieniła.')
      } else {
        onNotice('') // udalo sie - gasimy ewentualne ostrzezenie z poprzedniej proby
        onBeforeWiringChange('podłączenie przewodu')
        const wire = board.connect(pointer.from, connect, pointer.colour)
        // Gotowa zyla zaczyna dokladnie tam, gdzie skonczyl podglad.
        if (previewRope.current) setHandoff({ id: wire.id, rope: previewRope.current })
      }
    }

    releaseDragPointer()
    setDrag(null)
  }

  /** Rezygnacja - Escape, wyjscie kursorem poza plytke, przerwane zdarzenie. */
  const cancelDrag = () => {
    releaseDragPointer()
    setDrag(null)
  }

  // Escape przerywa prowadzenie zyly. Bez tego jedynym wyjsciem bylo puszczenie
  // przycisku z dala od pinow - a to wymaga wiedzy, ze promien przyciagania
  // w ogole istnieje.
  useEffect(() => {
    if (!drag) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      releaseDragPointer()
      setDrag(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag])

  const describeConnector = (id: string): BoardHelp | null => BOARD_HELP[id] ?? null

  return (
    <svg
      ref={svgRef}
      viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
      className={'board-svg' + (drag ? ' dragging' : '') + (panning ? ' panning' : '')}
      onPointerDown={beginPan}
      onPointerMove={(event) => {
        const current = pan.current
        if (current && event.pointerId === current.pointerId) {
          const dx = event.clientX - current.originX
          const dy = event.clientY - current.originY
          if (!current.moved && Math.abs(dx) <= PAN_THRESHOLD && Math.abs(dy) <= PAN_THRESHOLD) {
            return // drgniecie reki przy klikaniu, jeszcze nie przesuwanie
          }
          if (!current.moved) {
            current.moved = true
            current.captured = true
            svgRef.current?.setPointerCapture(current.pointerId)
            setPanning(true)
          }
          onView(panBy(current.start, -dx * current.unitsPerPixel, -dy * current.unitsPerPixel))
          return
        }
        // Uwaga: warunkiem jest REFERENCJA, nie stan `drag`. Pierwszy ruch potrafi
        // przyjsc, zanim React zdazy zatwierdzic stan ustawiony przy nacisnieciu -
        // przy szybkim pociagnieciu myszy zyla w ogole wtedy nie ruszala.
        const pointer = dragPointer.current
        if (pointer && event.pointerId === pointer.pointerId) {
          if (
            !pointer.captured &&
            (Math.abs(event.clientX - pointer.originX) > PAN_THRESHOLD ||
              Math.abs(event.clientY - pointer.originY) > PAN_THRESHOLD)
          ) {
            // Od tej chwili to na pewno przeciaganie, a nie klikniecie: przejmujemy
            // wskaznik (zyle da sie prowadzic takze poza plotnem) i polykamy
            // klikniecie, ktore przyjdzie na koncu.
            pointer.captured = true
            suppressClick.current = true
            try {
              svgRef.current?.setPointerCapture(pointer.pointerId)
            } catch {
              // Wskaznik moze byc juz nieaktywny - przeciaganie dziala dalej,
              // tylko bez podazania za kursorem poza plotnem.
              pointer.captured = false
            }
          }
          const cursor = toSvgPoint(event.clientX, event.clientY)
          setDrag((current) => (current ? { ...current, cursor } : current))
        }
      }}
      onPointerUp={(event) => {
        endPan()
        if (dragPointer.current) finishDrag(toSvgPoint(event.clientX, event.clientY))
      }}
      onPointerCancel={() => {
        endPan()
        cancelDrag()
      }}
      onDoubleClick={(event) => {
        if ((event.target as Element).closest('[data-nopan]')) return
        onView(zoomAt(view, toSvgPoint(event.clientX, event.clientY), 1.8))
      }}
      onPointerLeave={() => {
        if (pan.current) return // trwa przesuwanie - wskaznik jest przechwycony
        // Wyjscie poza plotno przed przejeciem wskaznika to rezygnacja,
        // a nie polaczenie - inaczej zyla wpinalaby sie w przypadkowy pin.
        cancelDrag()
        hover(null, null)
      }}
    >
      <BoardArtwork />

      {/* obszary opisow dla elementow dekoracyjnych */}
      {DECORATIONS.map((part) => {
        const help = part.silkscreen ? DECORATION_HELP[part.silkscreen] : undefined
        if (!help) return null
        return (
          <rect
            key={`hit-${part.silkscreen}-${part.x}`}
            x={part.x}
            y={part.y - 20}
            width={part.width}
            height={part.height + 20}
            fill="transparent"
            onPointerEnter={() => hover(help, 'element ' + part.silkscreen)}
            onClick={() => select(help, 'element ' + part.silkscreen)}
            onPointerLeave={() => hover(null, null)}
          />
        )
      })}

      <g
        onPointerEnter={() => hover(BOARD_HELP.mcu, 'mikrokontroler U5')}
        onClick={() => select(BOARD_HELP.mcu, 'mikrokontroler U5')}
        onPointerLeave={() => hover(null, null)}
      >
        <rect
          x={MCU_BODY.x - 36}
          y={MCU_BODY.y - 30}
          width={MCU_BODY.width + 72}
          height={MCU_BODY.height + 44}
          fill="transparent"
        />
      </g>

      <LcdModule state={state} interact={interact} />
      <SegmentDisplay state={state} interact={interact} />
      <LedRow state={state} interact={interact} />
      <Keypad board={board} state={state} interact={interact} />
      <Jumpers board={board} interact={interact} />
      <ResetButton onReset={onReset} interact={interact} />
      <ProgrammingLed active={programming} interact={interact} />

      {/* przewody pod pinami - inaczej nie da sie trafic w sasiedni pin */}
      {!wiresHidden && (
        <g
          className="wire-stack"
          opacity={drag ? 0.28 : 1}
          pointerEvents={drag ? 'none' : undefined}
        >
          <WireLayer
            wires={board.wires}
            resolvePin={resolvePin}
            handoff={handoff}
            onRemove={(id) => {
              onBeforeWiringChange('wypięcie przewodu')
              board.disconnect(id)
            }}
            onHoverWire={(wire) =>
              hover(
                wire
                  ? {
                      title: 'Przewód',
                      what: `${describePin(wire.a)}   →   ${describePin(wire.b)}`,
                    }
                  : null,
                null,
                'Kliknij, aby wypiąć.',
              )
            }
            calloutHost={calloutHost}
          />
        </g>
      )}

      {/*
        Zyla trzymana w reku - OSOBNA warstwa, poza grupa przygaszanych przewodow
        i poza przelacznikiem ich ukrywania. To jedyny element, ktorym uzytkownik
        w tej chwili steruje, wiec musi byc widoczny zawsze i w pelnej jasnosci.
      */}
      {drag && (
        <WirePreview
          from={drag.anchor}
          to={connectTarget ? connectTarget.position : drag.cursor}
          colour={drag.colour}
          snapped={connectTarget !== null}
          onRope={keepPreviewRope}
        />
      )}

      {/* --- piny zlaczy (zawsze na wierzchu) --- */}
      {HEADERS.map((header) => {
        const connector = CONNECTORS[header.id]
        const help = describeConnector(header.id)
        return (
          <g
            key={`pins-${header.id}`}
            onPointerEnter={() => hover(help, 'złącze ' + header.id)}
            onClick={() => select(help, 'złącze ' + header.id)}
            onPointerLeave={() => hover(null, null)}
          >
            {Array.from({ length: header.rows }, (_, index) => {
              const pin: PinRef = { connector: header.id, index }
              const level = board.pinLevel(pin)
              const info = connector.pins[index]
              const key = `${header.id}:${index}`
              const isSource = drag?.from.connector === header.id && drag.from.index === index
              const isTarget =
                connectTarget?.pin.connector === header.id && connectTarget.pin.index === index
              const wired = board.wires.some(
                (wire) =>
                  (wire.a.connector === header.id && wire.a.index === index) ||
                  (wire.b.connector === header.id && wire.b.index === index),
              )
              return Array.from({ length: header.columns }, (_, column) => {
                const position = pinPosition(header.id, index, column)!
                return (
                  <g
                    key={`${key}:${column}`}
                    data-nopan
                    onPointerDown={(event) => beginDrag(pin, header.occupied === true, event)}
                    onPointerEnter={() => {
                      // Dymek pinu jest wazniejszy niz dymek calego zlacza: mowi,
                      // ktora to linia mikrokontrolera i jaki ma teraz stan.
                      setHoveredPin(key)
                      hover(
                        pinHelp(
                          connector.name,
                          info?.label,
                          info?.hint,
                          level,
                          header.occupied === true,
                          board.mcu.powered,
                        ),
                        'złącze ' + header.id,
                        'Przeciągnij, żeby poprowadzić stąd przewód.',
                      )
                    }}
                    onPointerLeave={() => {
                      setHoveredPin(null)
                      hover(help, 'złącze ' + header.id)
                    }}
                    style={{ cursor: header.occupied ? 'not-allowed' : 'crosshair' }}
                  >
                    {/*
                      Pole trafienia troche wieksze niz sam pad (22 x 22), ale
                      MNIEJSZE niz polowa rozstawu (14) - inaczej pola sasiednich
                      pinow zachodza na siebie i w polowie drogi miedzy nimi
                      reaguje ten, ktory akurat narysowano pozniej.
                    */}
                    <circle cx={position.x} cy={position.y} r={13} fill="transparent" />
                    <rect
                      x={position.x - 11}
                      y={position.y - 11}
                      width={22}
                      height={22}
                      rx={3}
                      fill="url(#solder)"
                      opacity={header.occupied ? 0.5 : 0.92}
                    />
                    <rect x={position.x - 4} y={position.y - 4} width={8} height={8} rx={1} fill="url(#gold)" />
                    {/* zielona poswiata pokazuje linie w stanie wysokim */}
                    {level === 1 && column === header.columns - 1 && (
                      <circle cx={position.x} cy={position.y} r={6} fill="#4ade80" opacity={0.5} />
                    )}
                    {wired && !drag && (
                      <circle cx={position.x} cy={position.y} r={13} fill="none" stroke="#38bdf8" strokeWidth={1.6} opacity={0.5} />
                    )}
                    {(isSource || isTarget || hoveredPin === key) && (
                      <circle
                        cx={position.x}
                        cy={position.y}
                        r={16}
                        fill="none"
                        stroke={isTarget ? '#22c55e' : isSource ? '#f59e0b' : '#e2e8f0'}
                        strokeWidth={3}
                      />
                    )}
                    {isTarget && (
                      <text x={position.x} y={position.y - 24} textAnchor="middle" className="snap-label">
                        {info?.label}
                      </text>
                    )}
                  </g>
                )
              })
            })}

            {/* opisy pinow na sitodruku */}
            {Array.from({ length: header.rows }, (_, index) => {
              const position = pinPosition(header.id, index, header.columns - 1)!
              const info = connector.pins[index]
              if (!info) return null
              return (
                <text
                  key={`lbl-${header.id}-${index}`}
                  x={header.orientation === 'vertical' ? position.x + 18 : position.x}
                  y={header.orientation === 'vertical' ? position.y + 4 : position.y + 26}
                  textAnchor={header.orientation === 'vertical' ? 'start' : 'middle'}
                  className="silk silk-tiny"
                >
                  {info.label.replace('seg ', '')}
                </text>
              )
            })}

            {header.occupied && (
              <text x={header.x - 30} y={header.y + 4} textAnchor="end" className="silk silk-tiny occupied-note">
                zajęte
              </text>
            )}
          </g>
        )
      })}

      <ElementOutline boxId={pinnedBox} variant="pinned" />
      <ElementOutline boxId={hoveredBox} variant="hovered" />

      {/* warstwa nad wszystkim - opis wskazanego przewodu */}
      <g ref={setCalloutHost} pointerEvents="none" />
    </svg>
  )
}

/**
 * Opis pojedynczego pinu.
 *
 * Wczesniej byl tu znacznik `<title>`, czyli dymek rysowany przez przegladarke:
 * pojawial sie po sekundzie, wygladal inaczej niz reszta pomocy i nie mowil,
 * co na linii dzieje sie TERAZ. Wlasny dymek pokazuje takze stan linii -
 * a to najczestsze pytanie przy szukaniu bledu w polaczeniach.
 */
function pinHelp(
  connectorName: string,
  label: string | undefined,
  hint: string | undefined,
  level: NetLevel,
  occupied: boolean,
  powered: boolean,
): BoardHelp {
  if (occupied) {
    return {
      title: `${connectorName} · ${label ?? 'pin'}`,
      what: 'To złącze zajmuje zamontowany na stałe wyświetlacz — nie da się tu nic podłączyć.',
    }
  }

  // Nozki portow opisujemy pelnym zdaniem: sam skrot "XCK/T0" nic nie mowi
  // komus, kto widzi mikrokontroler pierwszy raz.
  const portPin = /^P([A-D])(\d)$/.exec(label ?? '')
  const czym = portPin
    ? `Linia ${portPin[2]} portu ${portPin[1]} mikrokontrolera.` +
      (hint ? ` Ta sama nóżka obsługuje też ${hint}.` : '')
    : hint
      ? hint[0].toUpperCase() + hint.slice(1) + '.'
      : ''

  const stan = !powered
    ? 'Płytka jest teraz bez zasilania, więc na liniach nic się nie dzieje.'
    : level === 1
      ? 'Teraz jest na niej stan wysoki (1), czyli napięcie zasilania.'
      : level === 0
        ? 'Teraz jest na niej stan niski (0), czyli poziom masy.'
        : 'Nikt jej teraz nie steruje — linia „pływa”, więc jej stan jest nieustalony.'

  return {
    title: `${connectorName} · ${label ?? 'pin'}`,
    what: `${czym} ${stan}`.trim(),
  }
}

const WIRE_COLOURS = ['#dc2626', '#f97316', '#eab308', '#22c55e', '#0ea5e9', '#8b5cf6', '#ec4899', '#e2e8f0']

function nextWireColour(index: number): string {
  return WIRE_COLOURS[index % WIRE_COLOURS.length]
}

interface Interact {
  hover: (help: BoardHelp | null, boxId: string | null, action?: string) => void
  select: (help: BoardHelp | null, boxId: string | null) => void
}

/**
 * Obrys elementu. Dwa rozne wyglady, bo znacza co innego:
 *   hovered - przelotne wskazanie kursorem (przerywana, niebieska),
 *   pinned  - element wybrany klknieciem, ktorego opis stoi w panelu (ciagla, pomaranczowa).
 */
function ElementOutline({ boxId, variant }: { boxId: string | null; variant: 'hovered' | 'pinned' }) {
  const box = boxId ? getBox(boxId) : undefined
  if (!box) return null
  const pinned = variant === 'pinned'
  return (
    <g pointerEvents="none" className={pinned ? 'pinned-outline' : 'hover-outline'}>
      <rect
        x={box.x - 6}
        y={box.y - 6}
        width={box.width + 12}
        height={box.height + 12}
        rx={8}
        fill={pinned ? '#f59e0b' : '#38bdf8'}
        opacity={pinned ? 0.08 : 0.12}
      />
      <rect
        x={box.x - 6}
        y={box.y - 6}
        width={box.width + 12}
        height={box.height + 12}
        rx={8}
        fill="none"
        stroke={pinned ? '#fbbf24' : '#7dd3fc'}
        strokeWidth={3}
        strokeDasharray={pinned ? undefined : '14 8'}
      />
    </g>
  )
}

/** Przycisk S17 - zerowanie mikrokontrolera, dokladnie jak na plytce. */
function ResetButton({ onReset, interact }: { onReset: () => void; interact: Interact }) {
  const [pressed, setPressed] = useState(false)
  return (
    <g
      data-nopan
      onPointerDown={(event) => {
        event.stopPropagation()
        setPressed(true)
        onReset()
      }}
      onPointerUp={() => setPressed(false)}
      onPointerEnter={() => interact.hover(BOARD_HELP.reset, 'przycisk Reset')}
      onClick={() => interact.select(BOARD_HELP.reset, 'przycisk Reset')}
      onPointerLeave={() => {
        setPressed(false)
        interact.hover(null, null)
      }}
      style={{ cursor: 'pointer' }}
      filter="url(#part-shadow)"
    >
      <rect x={RESET_BUTTON.x - 42} y={RESET_BUTTON.y - 42} width={84} height={84} rx={7} fill="#1b1b1d" />
      <circle
        cx={RESET_BUTTON.x}
        cy={RESET_BUTTON.y}
        r={pressed ? RESET_BUTTON.radius - 3 : RESET_BUTTON.radius}
        fill="url(#metal)"
      />
      <circle
        cx={RESET_BUTTON.x}
        cy={RESET_BUTTON.y}
        r={RESET_BUTTON.radius - 12}
        fill="#6f747b"
        opacity={pressed ? 0.9 : 0.5}
      />
      <text x={RESET_BUTTON.x} y={RESET_BUTTON.y - 52} textAnchor="middle" className="silk">
        Reset
      </text>
    </g>
  )
}

/** Dioda D10 - mruga w trakcie wgrywania programu. */
function ProgrammingLed({ active, interact }: { active: boolean; interact: Interact }) {
  return (
    <g
      onPointerEnter={() => interact.hover(BOARD_HELP.progLed, 'dioda D10')}
      onClick={() => interact.select(BOARD_HELP.progLed, 'dioda D10')}
      onPointerLeave={() => interact.hover(null, null)}
    >
      {active && (
        <circle cx={PROGRAMMING_LED.x} cy={PROGRAMMING_LED.y} r={26} fill="#facc15" opacity={0.35} filter="url(#wire-blur)">
          <animate attributeName="opacity" values="0.05;0.45;0.05" dur="0.35s" repeatCount="indefinite" />
        </circle>
      )}
      <circle
        cx={PROGRAMMING_LED.x}
        cy={PROGRAMMING_LED.y}
        r={PROGRAMMING_LED.radius}
        fill={active ? '#facc15' : '#6b5a1c'}
        stroke="#3a3010"
        strokeWidth={2}
      >
        {active && <animate attributeName="fill" values="#3a3010;#facc15;#3a3010" dur="0.35s" repeatCount="indefinite" />}
      </circle>
      <text x={PROGRAMMING_LED.x} y={PROGRAMMING_LED.y - 22} textAnchor="middle" className="silk silk-tiny">
        D10 PROG
      </text>
    </g>
  )
}

function LedRow({ state, interact }: { state: BoardState; interact: Interact }) {
  return (
    <g
      onPointerEnter={() => interact.hover(BOARD_HELP.ledRow, 'linijka diod')}
      onClick={() => interact.select(BOARD_HELP.ledRow, 'linijka diod')}
      onPointerLeave={() => interact.hover(null, null)}
    >
      {state.leds.map((led, index) => {
        const x = LED_ROW.x + index * LED_ROW.pitch
        return (
          <g key={`led-${index}`}>
            <rect x={x - 26} y={LED_ROW.y - 56} width={16} height={34} rx={3} fill="#1b1b1d" />
            <text x={x} y={LED_ROW.y - 40} textAnchor="middle" className="silk silk-tiny">
              D{index + 2}
            </text>
            {led.brightness > 0.02 && (
              <circle cx={x} cy={LED_ROW.y} r={30} fill="#ef4444" opacity={led.brightness * 0.35} filter="url(#wire-blur)" />
            )}
            <circle cx={x} cy={LED_ROW.y} r={17} fill="#5a1414" stroke="#2a0b0b" strokeWidth={2} />
            <circle
              cx={x}
              cy={LED_ROW.y}
              r={14}
              fill={`rgb(${90 + led.brightness * 165}, ${20 + led.brightness * 55}, ${20 + led.brightness * 45})`}
            />
            <circle cx={x - 4} cy={LED_ROW.y - 5} r={4} fill="#ffffff" opacity={0.18 + led.brightness * 0.5} />
          </g>
        )
      })}
    </g>
  )
}

const SEGMENT_SHAPES = (w: number, h: number, t: number): string[] => {
  const half = h / 2
  return [
    `M ${t} 0 L ${w - t} 0 L ${w - t - t / 2} ${t} L ${t + t / 2} ${t} Z`,
    `M ${w} ${t} L ${w} ${half - t / 2} L ${w - t} ${half - t} L ${w - t} ${t + t / 2} Z`,
    `M ${w} ${half + t / 2} L ${w} ${h - t} L ${w - t} ${h - t - t / 2} L ${w - t} ${half + t} Z`,
    `M ${t} ${h} L ${w - t} ${h} L ${w - t - t / 2} ${h - t} L ${t + t / 2} ${h - t} Z`,
    `M 0 ${half + t / 2} L 0 ${h - t} L ${t} ${h - t - t / 2} L ${t} ${half + t} Z`,
    `M 0 ${t} L 0 ${half - t / 2} L ${t} ${half - t} L ${t} ${t + t / 2} Z`,
    `M ${t / 2} ${half} L ${t + t / 2} ${half - t / 2} L ${w - t - t / 2} ${half - t / 2} L ${w - t / 2} ${half} L ${w - t - t / 2} ${half + t / 2} L ${t + t / 2} ${half + t / 2} Z`,
  ]
}

function SegmentDisplay({ state, interact }: { state: BoardState; interact: Interact }) {
  const digitWidth = 76
  const digitHeight = 132
  const shapes = SEGMENT_SHAPES(digitWidth, digitHeight, 12)
  const gap = (SEGMENT_DISPLAY.width - 4 * digitWidth) / 3

  return (
    <g
      filter="url(#part-shadow)"
      onPointerEnter={() => interact.hover(BOARD_HELP.segments, 'wyświetlacz 7-segmentowy')}
      onClick={() => interact.select(BOARD_HELP.segments, 'wyświetlacz 7-segmentowy')}
      onPointerLeave={() => interact.hover(null, null)}
    >
      <rect
        x={SEGMENT_DISPLAY.x - 22}
        y={SEGMENT_DISPLAY.y - 22}
        width={SEGMENT_DISPLAY.width + 44}
        height={digitHeight + 60}
        rx={8}
        fill="#0d0d0f"
      />
      {state.digits.map((digit, index) => (
        <g
          key={`digit-${index}`}
          transform={`translate(${SEGMENT_DISPLAY.x + index * (digitWidth + gap)}, ${SEGMENT_DISPLAY.y})`}
        >
          {shapes.map((shape, segment) => (
            <path key={segment} d={shape} fill="#ff3b30" opacity={0.05 + digit.segments[segment] * 0.95} />
          ))}
          <circle
            cx={digitWidth + 12}
            cy={digitHeight - 4}
            r={6}
            fill="#ff3b30"
            opacity={0.05 + digit.segments[7] * 0.95}
          />
          <text x={digitWidth / 2} y={digitHeight + 30} textAnchor="middle" className="silk silk-tiny">
            W{index + 1}
          </text>
        </g>
      ))}
    </g>
  )
}

function Keypad({ board, state, interact }: { board: Board; state: BoardState; interact: Interact }) {
  return (
    <g
      filter="url(#part-shadow)"
      onPointerEnter={() => interact.hover(BOARD_HELP.keypad, 'klawiatura 4x4')}
      onClick={() => interact.select(BOARD_HELP.keypad, 'klawiatura 4x4')}
      onPointerLeave={() => interact.hover(null, null)}
    >
      <rect
        x={KEYPAD.x - 24}
        y={KEYPAD.y - 24}
        width={3 * KEYPAD.pitchX + KEYPAD.width + 48}
        height={3 * KEYPAD.pitchY + KEYPAD.height + 48}
        rx={10}
        fill="#0f3a28"
      />
      {KEY_LABELS.map((label, key) => {
        const row = Math.floor(key / 4)
        const column = key % 4
        const x = KEYPAD.x + column * KEYPAD.pitchX
        const y = KEYPAD.y + row * KEYPAD.pitchY
        const pressed = state.keysPressed.includes(key)
        return (
          <g
            key={`key-${key}`}
            data-nopan
            onPointerDown={(event) => {
              event.stopPropagation()
              board.setKeyPressed(key, true)
            }}
            onPointerUp={() => board.setKeyPressed(key, false)}
            onPointerLeave={() => board.setKeyPressed(key, false)}
            style={{ cursor: 'pointer' }}
          >
            <rect x={x} y={y} width={KEYPAD.width} height={KEYPAD.height} rx={6} fill="#1c1c1f" />
            <rect
              x={x + 6}
              y={y + (pressed ? 7 : 4)}
              width={KEYPAD.width - 12}
              height={KEYPAD.height - 12}
              rx={5}
              fill={pressed ? '#2b2b30' : '#3a3a40'}
            />
            <text x={x + KEYPAD.width / 2} y={y + KEYPAD.height / 2 + 9} textAnchor="middle" className="key-cap">
              {label}
            </text>
            <text x={x + KEYPAD.width - 6} y={y + 16} textAnchor="end" className="silk silk-tiny">
              S{key + 1}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function LcdModule({ state, interact }: { state: BoardState; interact: Interact }) {
  const lcd = state.lcd
  const cellWidth = 33
  const cellHeight = 56
  const originX = LCD_MODULE.x + 30
  const originY = LCD_MODULE.y + 30

  return (
    <g
      filter="url(#part-shadow)"
      onPointerEnter={() => interact.hover(BOARD_HELP.lcd, 'wyświetlacz LCD')}
      onClick={() => interact.select(BOARD_HELP.lcd, 'wyświetlacz LCD')}
      onPointerLeave={() => interact.hover(null, null)}
    >
      <rect x={LCD_MODULE.x} y={LCD_MODULE.y} width={LCD_MODULE.width} height={LCD_MODULE.height} rx={8} fill="#16324a" />
      <rect
        x={LCD_MODULE.x + 16}
        y={LCD_MODULE.y + 16}
        width={LCD_MODULE.width - 32}
        height={LCD_MODULE.height - 32}
        rx={4}
        fill={lcd.displayOn ? '#57a06a' : '#3d6f4a'}
      />
      {lcd.rows.map((row, rowIndex) =>
        row.map((code, columnIndex) => {
          const x = originX + columnIndex * cellWidth
          const y = originY + rowIndex * cellHeight
          if (code < 8) {
            const pattern = lcd.customChars[code] ?? []
            return (
              <g key={`c-${rowIndex}-${columnIndex}`} transform={`translate(${x + 6}, ${y + 4})`}>
                {pattern.map((bits, dotRow) =>
                  [4, 3, 2, 1, 0].map((bit, dotColumn) =>
                    (bits >> bit) & 1 ? (
                      <rect
                        key={`${dotRow}-${dotColumn}`}
                        x={dotColumn * 4.4}
                        y={dotRow * 5.2}
                        width={3.8}
                        height={4.6}
                        fill="#0a2413"
                      />
                    ) : null,
                  ),
                )}
              </g>
            )
          }
          return (
            <text
              key={`c-${rowIndex}-${columnIndex}`}
              x={x + 14}
              y={y + 36}
              textAnchor="middle"
              className="lcd-glyph"
              opacity={lcd.displayOn ? 1 : 0.2}
            >
              {String.fromCharCode(code)}
            </text>
          )
        }),
      )}
      {lcd.displayOn && lcd.cursorOn && lcd.cursor && (
        <rect
          x={originX + lcd.cursor.column * cellWidth + 4}
          y={originY + lcd.cursor.row * cellHeight + 42}
          width={cellWidth - 10}
          height={4}
          fill="#0a2413"
        />
      )}
    </g>
  )
}

function Jumpers({ board, interact }: { board: Board; interact: Interact }) {
  return (
    <g>
      {JUMPERS.map((jumper) => {
        const closed = board.jumpers[jumper.id]
        return (
          <g
            key={jumper.id}
            data-nopan
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              // Klikniecie zworki robi dwie rzeczy naraz: przelacza ja i przypina jej opis.
              // To wygodne, bo od razu widac, co wlasnie zmieniono.
              board.setJumper(jumper.id, !closed)
              interact.select(BOARD_HELP[jumper.id] ?? null, 'zworka ' + jumper.id)
            }}
            onPointerEnter={() => interact.hover(BOARD_HELP[jumper.id] ?? null, 'zworka ' + jumper.id)}
            onPointerLeave={() => interact.hover(null, null)}
            style={{ cursor: 'pointer' }}
          >
            <rect
              x={jumper.x - 16}
              y={jumper.y - 16}
              width={32 + PIN_PITCH}
              height={32}
              rx={4}
              fill="#0f4530"
              opacity={0.6}
            />
            {[0, 1].map((index) => (
              <g key={index}>
                <rect
                  x={jumper.x - 11 + index * PIN_PITCH}
                  y={jumper.y - 11}
                  width={22}
                  height={22}
                  rx={3}
                  fill="url(#solder)"
                />
                <rect x={jumper.x - 4 + index * PIN_PITCH} y={jumper.y - 4} width={8} height={8} fill="url(#gold)" />
              </g>
            ))}
            {closed && (
              <rect
                x={jumper.x - 13}
                y={jumper.y - 13}
                width={26 + PIN_PITCH}
                height={26}
                rx={4}
                fill="#1e3a8a"
                stroke="#60a5fa"
                strokeWidth={2}
              />
            )}
            <text x={jumper.x + PIN_PITCH / 2} y={jumper.y - 22} textAnchor="middle" className="silk">
              {jumper.id} {jumper.silkscreen}
            </text>
          </g>
        )
      })}
    </g>
  )
}
