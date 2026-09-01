import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CONNECTORS, type Board, type BoardState, type NetLevel, type PinRef } from '@zl3avr/board'
import { BOARD_HELP, DECORATION_HELP, type BoardHelp } from '../knowledge/board-help'
import { getBox } from './bounds'
import { BoardArtwork } from './BoardArtwork'
import { ConnectorBoot, WireLayer, WireStrokes, describePin } from './WireLayer'
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
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
import { routeBetween, type Point, type WireRoute } from './route'
import { MAX_BUNDLE, bundleColours, bundleTargets, describeSelection } from './bundle'
import { panBy, zoomAt, type Viewport } from './viewport'

/**
 * Interaktywna plytka: piny, peryferia i przewody.
 *
 * PROWADZENIE PRZEWODU dziala na KLIKNIECIA, nie na przytrzymanie przycisku:
 *
 *   1. klikniecie wolnej szpilki PODNOSI przewod - plytka sie przygasza,
 *      wszystkie wolne szpilki dostaja obraczki, a nad rysunkiem staje pasek
 *      z informacja, co sie dzieje;
 *   2. zblizenie kursora do drugiej szpilki pokazuje DOKLADNIE te zyle, ktora
 *      powstanie (ten sam ksztalt liczy route.ts dla podgladu i polaczenia);
 *   3. drugie klikniecie laczy; Esc, ponowne klikniecie szpilki zrodlowej
 *      albo klikniecie w tlo odklada przewod.
 *
 * Dlaczego klikniecia: miedzy nimi wolno przyblizac i przesuwac widok, wiec
 * da sie wybrac szpilke przy jednym powiekszeniu i cel przy innym - przy
 * przeciaganiu bylo to niewykonalne. Klikniecie dziala tez na ekranie
 * dotykowym i nie wymaga trzymania wcisnietego przycisku przez pol plytki.
 * PRZECIAGNIECIE z szpilki nadal jednak dziala - to ten sam automat, w ktorym
 * puszczenie przycisku nad celem gra role drugiego klikniecia.
 *
 * Pozostale decyzje, ktore decyduja o tym, czy da sie tego uzywac:
 *
 * 1. PINY SA RYSOWANE NAD PRZEWODAMI. Przy kilkunastu zylach wiszacych nad
 *    zlaczem nie da sie inaczej trafic w sasiedni pin - przewod przechwytywalby
 *    klikniecie.
 * 2. PRZYCIAGANIE DO NAJBLIZSZEGO PINU. Klikniecie albo puszczenie w poblizu
 *    pinu wystarczy; nie trzeba celowac w kwadracik o boku 8 jednostek.
 * 3. PRZEWODY BLEDNA I PRZESTAJA LAPAC KLIKNIECIA NA CZAS PROWADZENIA,
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
   * Krotki komunikat nad rysunkiem. Uzywany tam, gdzie klikniecie nie
   * daje zadnego efektu - bez slowa wyjasnienia „nic sie nie stalo” wyglada
   * identycznie jak usterka narzedzia.
   */
  onNotice: (text: string) => void
  /**
   * Stan prowadzenia przewodu dla nadrzednego widoku: opis zrodla, kolor
   * pierwszej zyly i liczba zyl (wiazka ma ich kilka), albo `null`, gdy nic
   * nie jest podniesione. Widok pokazuje z tego staly pasek nad plytka -
   * w SVG napis skalowalby sie razem z rysunkiem i przy oddaleniu bylby
   * nieczytelny.
   */
  onWiringState: (state: { label: string; colour: string; count: number } | null) => void
}

function samePin(a: PinRef, b: PinRef): boolean {
  return a.connector === b.connector && a.index === b.index
}

/** Promien, w ktorym klikniecie albo puszczony przewod „wskakuje” na pin. */
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
  onWiringState,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  /**
   * Podniesione przewody: szpilki zrodlowe i kolory przyszlych zyl.
   * Zwykle klikniecie podnosi jedna (lista jednoelementowa); zaznaczenie
   * prostokatne z Shiftem podnosi cala wiazke. Kolory ustalamy juz przy
   * podniesieniu, zeby podglad mial kolory polaczen, ktore z niego powstana.
   */
  const [armed, setArmed] = useState<{ pins: PinRef[]; colours: string[] } | null>(null)
  /**
   * Szpilka, na ktora przewod wskoczy przy nastepnym kliknieciu - najblizsza
   * kursorowi w promieniu przyciagania. Trzymana jako klucz `zlacze:linia`,
   * wiec stan zmienia sie TYLKO przy przejsciu na inna szpilke, a nie przy
   * kazdym ruchu myszy (aktualizacje ta sama wartoscia React pomija).
   */
  const [snapKey, setSnapKey] = useState<string | null>(null)
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
   * Cienka linia od szpilki zrodlowej do kursora - widac, ze przewod „idzie
   * za reka”. Aktualizowana WPROST na elemencie SVG, bez stanu Reacta:
   * ruch myszy nie moze przerysowywac calego widoku przy kazdym pikselu,
   * bo to wlasnie takie ciagle przerysowania dlawia slabsze komputery.
   */
  const cursorLine = useRef<SVGLineElement | null>(null)

  // Pasek „prowadzisz przewod” w nadrzednym widoku podaza za podniesieniem.
  useEffect(() => {
    onWiringState(
      armed
        ? {
            label: describeSelection(armed.pins),
            colour: armed.colours[0],
            count: armed.pins.length,
          }
        : null,
    )
  }, [armed, onWiringState])

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
    // Shift + przeciagniecie to zaznaczenie prostokatne (wiazka przewodow),
    // nie przesuwanie widoku. Dziala takze wtedy, gdy zaczyna sie na szpilce.
    if (event.button === 0 && event.shiftKey) {
      beginMarquee(event)
      return
    }
    // Podniesiony przewod NIE blokuje przesuwania: miedzy kliknieciami wolno
    // dojechac do celu po drugiej stronie plytki. To jedna z glownych przewag
    // laczenia kliknieciami nad przeciaganiem.
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
  // Prowadzenie przewodow: klikniecie podnosi, klikniecie laczy
  // (przeciagniecie ze szpilki tez dziala - to ten sam automat)
  // -------------------------------------------------------------------------

  /**
   * Pin najblizszy podanemu punktowi - o ile miesci sie w promieniu przyciagania.
   *
   * Osobna funkcja, a nie tylko wartosc wyliczona ze stanu, bo w chwili
   * klikniecia musimy uzyc DOKLADNIE tej pozycji kursora, ktora przyszla
   * ze zdarzeniem. Poleganie na stanie oznaczaloby, ze przy bardzo szybkim
   * ruchu myszy zyla ladowala tam, gdzie kursor byl klatke wczesniej.
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

  /** Szpilka docelowa odtworzona z klucza przyciagania. */
  const snapPin = useMemo<PinRef | null>(() => {
    if (!snapKey) return null
    const [connector, index] = snapKey.split(':')
    return { connector: connector as PinRef['connector'], index: Number(index) }
  }, [snapKey])

  /** Czy te dwie szpilki juz laczy zyla. */
  const alreadyWired = (a: PinRef, b: PinRef) =>
    board.wires.some(
      (wire) =>
        (samePin(wire.a, a) && samePin(wire.b, b)) || (samePin(wire.a, b) && samePin(wire.b, a)),
    )

  /**
   * Podglad zyl do szpilki docelowej - DOKLADNIE te trasy, ktore powstana
   * po kliknieciu. Liczy je ta sama funkcja, co dla gotowych przewodow, wiec
   * polaczenie nie moze wyladowac gdzie indziej, niz pokazywal podglad.
   * (W wersji z fizyka podglad i gotowa zyla byly dwiema roznymi symulacjami
   * i przewod potrafil po polaczeniu "nie trafic w pin".)
   *
   * Dla wiazki cel to wskazana szpilka i KOLEJNE linie zlacza w dol - jak
   * przy wpinaniu tasmy. `fit: false` mowi, czemu wiazka tu nie wejdzie.
   */
  const preview = (() => {
    if (!armed || !snapPin) return null
    if (armed.pins.length === 1 && samePin(armed.pins[0], snapPin)) return null
    const targets = bundleTargets(armed.pins.length, snapPin)
    if (!targets) return { fit: false as const, reason: 'za krótkie złącze na taką wiązkę' }
    if (targets.some((target) => armed.pins.some((pin) => samePin(pin, target)))) {
      return { fit: false as const, reason: 'cel zachodzi na zaznaczone szpilki' }
    }
    const wires: Array<{ route: WireRoute; colour: string; duplicate: boolean }> = []
    for (let i = 0; i < armed.pins.length; i++) {
      const route = routeBetween(armed.pins[i], targets[i])
      if (!route) return null
      wires.push({
        route,
        colour: armed.colours[i],
        duplicate: alreadyWired(armed.pins[i], targets[i]),
      })
    }
    return { fit: true as const, wires, targets }
  })()

  /** Szpilki docelowe wiazki - do obraczek w rzedzie pinow. */
  const targetKeys = new Set<string>()
  if (preview?.fit) {
    for (const target of preview.targets) targetKeys.add(`${target.connector}:${target.index}`)
  }

  /** Powod, dla ktorego klikniecie w cel NIC by nie dalo - do bursztynowej etykiety. */
  const snapProblem = !armed || !preview
    ? null
    : preview.fit === false
      ? preview.reason
      : preview.wires.every((wire) => wire.duplicate)
        ? armed.pins.length === 1
          ? 'już połączone'
          : 'wszystko już połączone'
        : null

  /** Gest rozpoczety na szpilce zrodlowej - odroznia klikniecie od przeciagniecia. */
  const gesture = useRef<{
    pointerId: number
    originX: number
    originY: number
    moved: boolean
  } | null>(null)

  /** Odlozenie przewodu - konczy prowadzenie bez polaczenia. */
  const disarm = useCallback(() => {
    setArmed(null)
    setSnapKey(null)
    gesture.current = null
    if (cursorLine.current) cursorLine.current.style.display = 'none'
  }, [])

  /**
   * Domkniecie polaczenia - wspolne dla klikniecia, puszczenia przewodu
   * i wiazki. Cel wiazki: wskazana szpilka i kolejne linie zlacza w dol.
   */
  const completeConnection = (
    source: { pins: PinRef[]; colours: string[] },
    target: PinRef,
  ) => {
    const targets = bundleTargets(source.pins.length, target)
    if (!targets) {
      onNotice(
        `Wiązka ${source.pins.length} żył potrzebuje ${source.pins.length} kolejnych linii od klikniętej szpilki w dół — to złącze jest za krótkie.`,
      )
      return
    }
    if (targets.some((t) => source.pins.some((pin) => samePin(pin, t)))) {
      onNotice('Miejsce docelowe zachodzi na zaznaczone szpilki — wybierz inne złącze.')
      return
    }
    // Pary juz polaczone pomijamy: druga zyla lezalaby dokladnie na pierwszej,
    // wiec nic by nie bylo widac, a licznik przewodow rosl.
    const fresh = source.pins
      .map((pin, i) => ({ a: pin, b: targets[i], colour: source.colours[i] }))
      .filter(({ a, b }) => !alreadyWired(a, b))
    if (fresh.length === 0) {
      onNotice(
        source.pins.length === 1
          ? 'Te dwie szpilki są już połączone — druga żyła nic by nie zmieniła.'
          : 'Wszystkie te połączenia już istnieją — nowe żyły nic by nie zmieniły.',
      )
      return
    }
    onNotice(
      fresh.length < source.pins.length
        ? `Dołożono ${fresh.length} z ${source.pins.length} żył — reszta tych połączeń już była.`
        : '', // udalo sie w calosci - gasimy ewentualne ostrzezenie z poprzedniej proby
    )
    onBeforeWiringChange(
      fresh.length === 1 ? 'podłączenie przewodu' : `podłączenie wiązki ${fresh.length} przewodów`,
    )
    // Wspolny identyfikator tasmy: zyly polozone jednym ruchem sa jedna wiazka.
    const ribbon = fresh.length > 1 ? `u${board.wires.length}_${Date.now().toString(36)}` : undefined
    for (const { a, b, colour } of fresh) board.connect(a, b, colour, ribbon)
    disarm()
  }

  /**
   * Nacisniecie szpilki. Trzy znaczenia, zaleznie od stanu: podniesienie
   * przewodu, odlozenie go (ta sama szpilka) albo polaczenie (inna szpilka).
   */
  const pressPin = (pin: PinRef, occupied: boolean, event: React.PointerEvent) => {
    if (event.button !== 0) return
    // Shift + nacisniecie zaczyna zaznaczenie prostokatne (wiazke) - nie
    // przechwytujemy go tutaj, ma dojsc do obslugi na calym plotnie.
    if (event.shiftKey) return
    if (occupied) {
      hover(BOARD_HELP.JP27 ?? null, 'złącze JP27')
      return
    }
    // Bez preventDefault(): zablokowany `pointerdown` nie wytwarza pozniej
    // zdarzenia `click`, a klikniecie pinu ma takze przypiac opis zlacza.
    event.stopPropagation()
    if (!armed) {
      setArmed({ pins: [pin], colours: [nextWireColour(board.wires.length)] })
      setSnapKey(null)
      gesture.current = {
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
        moved: false,
      }
      return
    }
    if (armed.pins.length === 1 && samePin(armed.pins[0], pin)) {
      disarm()
      return
    }
    completeConnection(armed, pin)
  }

  /**
   * Puszczenie przycisku po gescie rozpoczetym na szpilce zrodlowej.
   *
   * Kursor sie nie ruszyl = zwykle klikniecie: przewod zostaje podniesiony
   * i czeka na drugie klikniecie. Kursor sie ruszyl = uzytkownik PRZECIAGNAL
   * zyle starym zwyczajem: puszczenie przy szpilce laczy, puszczenie w polu
   * odklada przewod i podpowiada, ze mozna laczyc kliknieciami.
   */
  const finishArmGesture = (cursor: Point) => {
    const active = gesture.current
    gesture.current = null
    if (!active || !active.moved || !armed) return
    const target = findSnap(cursor)
    if (!target) {
      disarm()
      onNotice(
        'Przewód odłożony — nie trafił w żadną szpilkę. Wygodniej łączyć dwoma kliknięciami: raz pierwsza szpilka, raz druga.',
      )
      return
    }
    // Powrot na szpilke zrodlowa to nie pomylka - przewod zostaje w reku.
    if (armed.pins.length === 1 && samePin(target.pin, armed.pins[0])) return
    completeConnection(armed, target.pin)
  }

  // -------------------------------------------------------------------------
  // Zaznaczenie prostokatne (Shift + przeciagniecie) - wiazka przewodow
  // -------------------------------------------------------------------------

  /** Trwajace zaznaczenie; prostokat rysowany jest wprost na elemencie SVG. */
  const marquee = useRef<{ pointerId: number; start: Point } | null>(null)
  const marqueeRect = useRef<SVGRectElement | null>(null)

  const beginMarquee = (event: React.PointerEvent) => {
    const start = toSvgPoint(event.clientX, event.clientY)
    marquee.current = { pointerId: event.pointerId, start }
    try {
      svgRef.current?.setPointerCapture(event.pointerId)
    } catch {
      // Wskaznika moglo juz nie byc - zaznaczanie dziala dalej w obrebie plotna.
    }
  }

  const trackMarquee = (event: React.PointerEvent) => {
    const active = marquee.current
    const rect = marqueeRect.current
    if (!active || !rect || event.pointerId !== active.pointerId) return
    const cursor = toSvgPoint(event.clientX, event.clientY)
    rect.setAttribute('x', String(Math.min(active.start.x, cursor.x)))
    rect.setAttribute('y', String(Math.min(active.start.y, cursor.y)))
    rect.setAttribute('width', String(Math.abs(cursor.x - active.start.x)))
    rect.setAttribute('height', String(Math.abs(cursor.y - active.start.y)))
    rect.style.display = ''
  }

  /**
   * Koniec zaznaczenia: wolne szpilki z prostokata staja sie wiazka.
   *
   * Obie kolumny zlacza portu to ta sama linia, wiec liczymy LINIE, nie pady.
   * Kolejnosc zyl w wiazce: od gory do dolu (potem od lewej) - pierwsza
   * zaznaczona linia trafi w klikniete miejsce, kazda nastepna o linie nizej.
   */
  const finishMarquee = (event: React.PointerEvent) => {
    const active = marquee.current
    marquee.current = null
    if (marqueeRect.current) marqueeRect.current.style.display = 'none'
    try {
      svgRef.current?.releasePointerCapture(event.pointerId)
    } catch {
      // Wskaznika moglo juz nie byc - nic sie nie dzieje.
    }
    if (!active) return
    suppressClick.current = true
    const cursor = toSvgPoint(event.clientX, event.clientY)
    const minX = Math.min(active.start.x, cursor.x)
    const maxX = Math.max(active.start.x, cursor.x)
    const minY = Math.min(active.start.y, cursor.y)
    const maxY = Math.max(active.start.y, cursor.y)

    const lines = new Map<string, { pin: PinRef; x: number; y: number }>()
    for (const candidate of candidates) {
      if (candidate.occupied) continue
      const { x, y } = candidate.position
      if (x < minX || x > maxX || y < minY || y > maxY) continue
      const key = `${candidate.pin.connector}:${candidate.pin.index}`
      const known = lines.get(key)
      if (!known || y < known.y || (y === known.y && x < known.x)) {
        lines.set(key, { pin: candidate.pin, x, y })
      }
    }
    const ordered = [...lines.values()].sort((a, b) => a.y - b.y || a.x - b.x)
    if (ordered.length === 0) return
    if (ordered.length > MAX_BUNDLE) {
      onNotice(
        `Zaznaczono ${ordered.length} szpilek, a największe złącze ma ${MAX_BUNDLE} linii — takiej wiązki nie dałoby się nigdzie wpiąć.`,
      )
      return
    }
    const pins = ordered.map((entry) => entry.pin)
    setArmed({
      pins,
      colours: pins.length === 1 ? [nextWireColour(board.wires.length)] : bundleColours(pins.length),
    })
    setSnapKey(null)
    onNotice('')
  }

  // Escape odklada podniesiony przewod. Bez tego jedynym wyjsciem byloby
  // klikniecie w tlo - a to wymaga wiedzy, ze tak wlasnie sie rezygnuje.
  useEffect(() => {
    if (!armed) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      disarm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [armed, disarm])

  const describeConnector = (id: string): BoardHelp | null => BOARD_HELP[id] ?? null

  /** Pad szpilki zrodlowej najblizszy kursorowi - stad rusza linia podgladu. */
  const nearestSourcePad = (pin: PinRef, cursor: Point): Point | null => {
    let best: Point | null = null
    let bestDistance = Infinity
    for (const candidate of candidates) {
      if (!samePin(candidate.pin, pin)) continue
      const distance = Math.hypot(candidate.position.x - cursor.x, candidate.position.y - cursor.y)
      if (distance < bestDistance) {
        bestDistance = distance
        best = candidate.position
      }
    }
    return best
  }

  /**
   * Ruch myszy z przewodem w reku. Jedyna zmiana stanu Reacta to przejscie
   * przyciagania na INNA szpilke; sama linia do kursora jest ustawiana wprost
   * na elemencie SVG. Dzieki temu prowadzenie przewodu nie przerysowuje
   * widoku przy kazdym pikselu - a to wlasnie takie ciagle przerysowania
   * dlawily slabsze komputery w wersji z fizyka.
   */
  const trackWiring = (event: React.PointerEvent) => {
    if (!armed) return
    const cursor = toSvgPoint(event.clientX, event.clientY)

    const snap = findSnap(cursor)
    const selfSnap =
      snap !== null && armed.pins.length === 1 && samePin(snap.pin, armed.pins[0])
    const nextKey = snap && !selfSnap ? `${snap.pin.connector}:${snap.pin.index}` : null
    setSnapKey((current) => (current === nextKey ? current : nextKey))

    const line = cursorLine.current
    if (!line) return
    if (nextKey) {
      // Przy widocznym podgladzie zyly linia tylko by go dublowala.
      line.style.display = 'none'
      return
    }
    const start = nearestSourcePad(armed.pins[0], cursor)
    if (!start) return
    line.setAttribute('x1', String(Math.round(start.x)))
    line.setAttribute('y1', String(Math.round(start.y)))
    line.setAttribute('x2', String(Math.round(cursor.x)))
    line.setAttribute('y2', String(Math.round(cursor.y)))
    line.style.display = ''
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
      className={'board-svg' + (armed ? ' wiring' : '') + (panning ? ' panning' : '')}
      onPointerDown={beginPan}
      onPointerMove={(event) => {
        if (marquee.current) {
          trackMarquee(event)
          return
        }
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
        // Uwaga: prog ruchu liczymy na REFERENCJI, nie na stanie. Pierwszy ruch
        // potrafi przyjsc, zanim React zatwierdzi stan ustawiony przy nacisnieciu.
        const active = gesture.current
        if (
          active &&
          event.pointerId === active.pointerId &&
          !active.moved &&
          (Math.abs(event.clientX - active.originX) > PAN_THRESHOLD ||
            Math.abs(event.clientY - active.originY) > PAN_THRESHOLD)
        ) {
          active.moved = true
        }
        trackWiring(event)
      }}
      onPointerUp={(event) => {
        if (marquee.current && event.pointerId === marquee.current.pointerId) {
          finishMarquee(event)
          return
        }
        // Czy to bylo klikniecie w tlo (nacisniecie bez ruchu)? Sprawdzamy,
        // ZANIM endPan() wyczysci stan przesuwania.
        const backgroundClick = pan.current !== null && !pan.current.moved && event.button === 0
        endPan()
        if (gesture.current && event.pointerId === gesture.current.pointerId) {
          finishArmGesture(toSvgPoint(event.clientX, event.clientY))
          return
        }
        if (armed && backgroundClick) {
          // Klikniecie w tlo z przewodem w reku: przy szpilce laczy
          // (przyciaganie wybacza niecelne klikniecie), w polu odklada przewod.
          const snap = findSnap(toSvgPoint(event.clientX, event.clientY))
          const ownSource =
            snap !== null && armed.pins.length === 1 && samePin(snap.pin, armed.pins[0])
          if (snap && !ownSource) completeConnection(armed, snap.pin)
          else disarm()
        }
      }}
      onPointerCancel={() => {
        endPan()
        // Przerwany gest konczy tylko przeciaganie i zaznaczanie; podniesiony
        // przewod zostaje w reku - na ekranie dotykowym przewijanie strony
        // nie moze odkladac przewodu w polowie laczenia.
        gesture.current = null
        marquee.current = null
        if (marqueeRect.current) marqueeRect.current.style.display = 'none'
      }}
      onDoubleClick={(event) => {
        if ((event.target as Element).closest('[data-nopan]')) return
        onView(zoomAt(view, toSvgPoint(event.clientX, event.clientY), 1.8))
      }}
      onPointerLeave={() => {
        if (pan.current) return // trwa przesuwanie - wskaznik jest przechwycony
        // Przewod zostaje w reku (mozna wrocic), ale linia do kursora znika -
        // inaczej wskazywalaby ostatni punkt przy krawedzi.
        if (cursorLine.current) cursorLine.current.style.display = 'none'
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

      {/*
        Przygaszenie plytki na czas prowadzenia przewodu. Jeden prostokat
        z przejsciem CSS na przezroczystosci - najtanszy mozliwy sposob:
        zadnych filtrow, zadnego przerysowywania elementow pod spodem.
        Lezy POD warstwa przewodow i pod pinami, wiec szpilki - jedyne
        miejsca, ktore w tym trybie cos znacza - zostaja w pelnej jasnosci.
      */}
      <rect
        className={'board-dim' + (armed ? ' on' : '')}
        x={-60}
        y={-60}
        width={BOARD_WIDTH + 120}
        height={BOARD_HEIGHT + 120}
        pointerEvents="none"
      />

      {/* przewody pod pinami - inaczej nie da sie trafic w sasiedni pin */}
      {!wiresHidden && (
        <g
          className="wire-stack"
          opacity={armed ? 0.28 : 1}
          pointerEvents={armed ? 'none' : undefined}
        >
          <WireLayer
            wires={board.wires}
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
        Prowadzony przewod - OSOBNA warstwa, poza grupa przygaszanych przewodow
        i poza przelacznikiem ich ukrywania. To jedyny element, ktorym uzytkownik
        w tej chwili steruje, wiec musi byc widoczny zawsze i w pelnej jasnosci.

        Linia do kursora jest w drzewie na stale (aktualizuje ja trackWiring
        wprost na elemencie), a podglad zyly pojawia sie po zblizeniu do celu
        i jest DOKLADNIE trasa przyszlego polaczenia.
      */}
      {armed && (
        <g pointerEvents="none">
          <line
            ref={cursorLine}
            className="wire-cursor-line"
            stroke={armed.colours[0]}
            style={{ display: 'none' }}
          />
          {preview?.fit && (
            <g opacity={0.92}>
              {preview.wires.map((item, order) => (
                <g key={order} opacity={item.duplicate ? 0.35 : 1}>
                  <WireStrokes path={item.route.path} colour={item.colour} />
                  <ConnectorBoot point={item.route.a} color={item.colour} />
                  <ConnectorBoot point={item.route.b} color={item.colour} />
                </g>
              ))}
            </g>
          )}
        </g>
      )}

      {/* Prostokat zaznaczenia wiazki - aktualizowany wprost, bez stanu Reacta. */}
      <rect
        ref={marqueeRect}
        className="board-marquee"
        style={{ display: 'none' }}
        pointerEvents="none"
      />

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
              const sourceOrder = armed ? armed.pins.findIndex((p) => samePin(p, pin)) : -1
              const isSource = sourceOrder >= 0
              const isSnap = snapKey === key
              const isTarget = isSnap || targetKeys.has(key)
              const wired = board.wires.some(
                (wire) =>
                  (wire.a.connector === header.id && wire.a.index === index) ||
                  (wire.b.connector === header.id && wire.b.index === index),
              )
              // Stopka dymka mowi, co znaczy klikniecie W TYM stanie automatu.
              const action = header.occupied
                ? undefined
                : armed
                  ? isSource && armed.pins.length === 1
                    ? 'Kliknij, żeby odłożyć przewód (Esc też przerywa).'
                    : armed.pins.length > 1
                      ? `Kliknij, żeby wpiąć tu wiązkę ${armed.pins.length} żył — pierwsza wejdzie tutaj, reszta w kolejne linie w dół.`
                      : alreadyWired(armed.pins[0], pin)
                        ? 'Te szpilki są już połączone.'
                        : `Kliknij, żeby połączyć z ${describePin(armed.pins[0])}.`
                  : 'Kliknij, żeby zacząć stąd przewód.'
              return Array.from({ length: header.columns }, (_, column) => {
                const position = pinPosition(header.id, index, column)!
                return (
                  <g
                    key={`${key}:${column}`}
                    data-nopan
                    onPointerDown={(event) => pressPin(pin, header.occupied === true, event)}
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
                        action,
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
                    {wired && !armed && (
                      <circle cx={position.x} cy={position.y} r={13} fill="none" stroke="#38bdf8" strokeWidth={1.6} opacity={0.5} />
                    )}
                    {/*
                      Obraczka na kazdej wolnej szpilce, gdy przewod jest w reku -
                      na przygaszonej plytce od razu widac WSZYSTKIE miejsca,
                      w ktore da sie go wpiac. Elementy sa statyczne (bez animacji),
                      wiec setka obraczek nie kosztuje nic poza jednym rysowaniem.
                    */}
                    {armed && !header.occupied && !isSource && !isTarget && (
                      <circle className="pin-open" cx={position.x} cy={position.y} r={13} />
                    )}
                    {(isSource || isTarget || (hoveredPin === key && !armed)) && (
                      <circle
                        cx={position.x}
                        cy={position.y}
                        r={isSnap || isSource ? 16 : 14}
                        fill="none"
                        stroke={
                          isTarget
                            ? snapProblem
                              ? '#f59e0b'
                              : '#22c55e'
                            : isSource
                              ? (armed?.colours[sourceOrder] ?? '#f59e0b')
                              : '#e2e8f0'
                        }
                        strokeWidth={isSnap || isSource ? 3 : 2}
                      />
                    )}
                    {isSnap && column === 0 && (
                      <text
                        x={position.x}
                        y={position.y - 24}
                        textAnchor="middle"
                        className={'snap-label' + (snapProblem ? ' snap-duplicate' : '')}
                      >
                        {snapProblem
                          ? `${info?.label ?? ''} — ${snapProblem}`
                          : armed && armed.pins.length > 1
                            ? `${info?.label ?? ''} — tu wejdzie pierwsza żyła`
                            : info?.label}
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
