import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CONNECTORS, type PinRef, type Wire } from '@zl3avr/board'
import { routeBetween, type Point, type WireRoute } from './route'

/**
 * Warstwa przewodow.
 *
 * Kazdy przewod ma STALY ksztalt liczony w route.ts - z samych pozycji koncow,
 * bez zadnej symulacji. Warstwa nie ma wiec petli animacji: przerysowuje sie
 * tylko wtedy, gdy przybywa lub ubywa przewodow albo zmienia sie wskazanie.
 * Wczesniejsza wersja z fizyka renderowala sie 60 razy na sekunde takze
 * w zupelnym spoczynku - i to byl glowny koszt tego widoku na slabszym sprzecie.
 *
 * Rysowanie jednej zyly to cztery pociagniecia: cien rzucony na plytke, ciemny
 * obrys, wlasciwy kolor izolacji i waski rozblysk u gory - dzieki temu plaski
 * SVG czyta sie jak okragla zyla lezaca NAD plytka, a nie jak kreska.
 *
 * Swiezo polaczona zyla "dorysowuje sie" od szpilki zrodlowej do docelowej
 * (jednorazowa animacja CSS na stroke-dashoffset). To potwierdzenie celu:
 * widac, ze wtyk wszedl dokladnie w te szpilke, ktora pokazywal podglad.
 *
 * Przy kilkunastu zylach nad jednym zlaczem nie da sie okiem przesledzic, ktora
 * dokad biegnie. Dlatego najechanie na przewod PRZYGASZA pozostale i podswietla
 * jego oba konce; tresc "co z czym laczy" idzie do dymka przy kursorze.
 */

export interface WireLayerProps {
  wires: Wire[]
  onRemove: (wireId: string) => void
  /** Wskazany przewod - nadrzedny widok pokazuje dla niego dymek przy kursorze. */
  onHoverWire: (wire: Wire | null) => void
  /**
   * Grupa rysowana NA SAMEJ GORZE rysunku - trafia do niej podswietlenie
   * koncow wskazanego przewodu.
   *
   * Same przewody musza lezec pod pinami, inaczej nie da sie trafic w sasiedni
   * pin. Ale podswietlenie rysowane razem z nimi znikaloby pod rzedem pinow -
   * a to jedyna rzecz, ktora ma tam byc widoczna. Dlatego przenosimy je
   * portalem do warstwy nad wszystkim.
   */
  calloutHost: SVGGElement | null
}

function shade(color: string, amount: number): string {
  const hex = color.replace('#', '')
  const value = Number.parseInt(hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex, 16)
  const channel = (shift: number) =>
    Math.max(0, Math.min(255, Math.round(((value >> shift) & 0xff) * amount)))
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`
}

/** Opis konca przewodu w postaci „Port D · PD0”. */
export function describePin(pin: PinRef): string {
  const connector = CONNECTORS[pin.connector]
  const label = connector?.pins[pin.index]?.label ?? `pin ${pin.index}`
  return `${connector?.name ?? pin.connector} · ${label.replace('seg ', 'segment ')}`
}

export function WireLayer({ wires, onRemove, onHoverWire, calloutHost }: WireLayerProps) {
  const [hovered, setHovered] = useState<string | null>(null)

  // Klucz zmienia sie tylko wtedy, gdy przybywa lub ubywa przewodow.
  const wiresKey = wires.map((wire) => wire.id).join('|')

  const routes = useMemo(() => {
    const map = new Map<string, WireRoute>()
    for (const wire of wires) {
      const route = routeBetween(wire.a, wire.b)
      if (route) map.set(wire.id, route)
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wiresKey])

  /**
   * Przewody obecne przy PIERWSZYM renderze nie dostaja animacji dorysowania -
   * gotowy zestaw polaczen (przyklad, stan po odswiezeniu) ma od razu lezec
   * na plytce. Dorysowuje sie tylko zyla, ktora przybyla w trakcie pracy.
   */
  const seen = useRef<Set<string> | null>(null)
  if (seen.current === null) seen.current = new Set(wires.map((wire) => wire.id))
  const known = seen.current
  useEffect(() => {
    for (const wire of wires) known.add(wire.id)
  })

  /**
   * Przewody lezace nizej rysujemy pozniej - dzieki temu wygladaja, jakby
   * lezaly na wierzchu stosu.
   *
   * KOLEJNOSC NIE ZALEZY OD WSKAZANIA. Przestawienie wskazanego przewodu
   * na koniec listy wygladalo niewinnie, ale React przesuwal wtedy jego
   * wezly w drzewie DOM - a przesuniecie wezla RESTARTUJE jego animacje CSS.
   * Efekt: najechanie na wiazke odtwarzalo od nowa "dorysowanie" zyl
   * i cala warstwa migotala. Wskazany przewod idzie na wierzch inaczej -
   * kopia rysowana w warstwie ponad wszystkim (portal nizej).
   */
  const ordered = [...wires]
    .filter((wire) => routes.has(wire.id))
    .sort((a, b) => routes.get(a.id)!.bottom - routes.get(b.id)!.bottom)

  const hoveredWire = hovered ? wires.find((wire) => wire.id === hovered) : undefined
  const hoveredRoute = hovered ? routes.get(hovered) : undefined

  return (
    <g className="wire-layer">
      {ordered.map((wire) => (
        <WireGroup
          key={wire.id}
          wire={wire}
          route={routes.get(wire.id)!}
          dimmed={hovered !== null && hovered !== wire.id}
          drawInAtMount={!known.has(wire.id)}
          onEnter={() => {
            setHovered(wire.id)
            onHoverWire(wire)
          }}
          onLeave={() => {
            setHovered((current) => (current === wire.id ? null : current))
            onHoverWire(null)
          }}
          onClick={() => {
            setHovered(null)
            onHoverWire(null)
            onRemove(wire.id)
          }}
        />
      ))}

      {/* --- wskazany przewod w calosci nad wszystkim + jego oba konce --- */}
      {hoveredWire &&
        hoveredRoute &&
        calloutHost &&
        createPortal(
          <g pointerEvents="none">
            {/*
              Kopia wskazanej zyly ponad pinami. Oryginal zostaje na swoim
              miejscu w stosie - dzieki temu wskazanie NICZEGO nie przestawia
              w drzewie (patrz komentarz przy sortowaniu wyzej), a przewod
              i tak widac w calosci.
            */}
            <WireStrokes path={hoveredRoute.path} colour={hoveredWire.color} />
            <ConnectorBoot point={hoveredRoute.a} color={hoveredWire.color} />
            <ConnectorBoot point={hoveredRoute.b} color={hoveredWire.color} />
            <WireEnds colour={hoveredWire.color} ends={{ a: hoveredRoute.a, b: hoveredRoute.b }} />
          </g>,
          calloutHost,
        )}
    </g>
  )
}

/**
 * Jedna zyla: rysunek, wtyki na koncach i pole trafienia.
 *
 * Decyzja o dorysowaniu zapada RAZ, w chwili powstania elementu (`useState`
 * z wartoscia poczatkowa) - pozniejsze przerysowania nie moga wznowic ani
 * przerwac animacji w polowie. Po zakonczeniu calej sekwencji klasa animacji
 * SCHODZI z elementu: przesuniecie wezla w DOM (np. przy dojsciu kolejnego
 * przewodu) restartuje animacje CSS, wiec zadna nie moze na nim zostac.
 */
function WireGroup({
  wire,
  route,
  dimmed,
  drawInAtMount,
  onEnter,
  onLeave,
  onClick,
}: {
  wire: Wire
  route: WireRoute
  dimmed: boolean
  drawInAtMount: boolean
  onEnter: () => void
  onLeave: () => void
  onClick: () => void
}) {
  const [drawIn, setDrawIn] = useState(drawInAtMount)
  return (
    <g
      opacity={dimmed ? 0.12 : 1}
      className={drawIn ? 'wire-draw' : undefined}
      onAnimationEnd={(event) => {
        // Pierscien potwierdzenia konczy sie jako ostatni z trzech animacji.
        if (event.animationName === 'wire-arrive') setDrawIn(false)
      }}
    >
      <WireStrokes path={route.path} colour={wire.color} />
      <ConnectorBoot point={route.a} color={wire.color} />
      <g className="wire-boot-target">
        <ConnectorBoot point={route.b} color={wire.color} />
      </g>
      {drawIn && (
        // Jednorazowy pierscien rozchodzacy sie od szpilki docelowej -
        // potwierdzenie, ze wtyk wszedl dokladnie tam, gdzie mial.
        <circle
          className="wire-arrive"
          cx={route.b.x}
          cy={route.b.y}
          r={14}
          fill="none"
          stroke={wire.color}
          strokeWidth={4}
        />
      )}
      {/*
        Pole trafienia zyly. Szerokosc dobrana do samego przewodu
        (widoczny obrys ma 10), z jedna jednostka zapasu na stronie.
      */}
      <path
        d={route.path}
        stroke="transparent"
        strokeWidth={12}
        strokeLinecap="round"
        fill="none"
        className="wire-hit"
        style={{ cursor: 'pointer' }}
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
        onClick={onClick}
      />
    </g>
  )
}

/**
 * Cztery pociagniecia, z ktorych sklada sie zyla: cien rzucony na plytke,
 * ciemny obrys, wlasciwy kolor izolacji i waski rozblysk u gory. Dzieki nim
 * plaski SVG czyta sie jak okragly przewod LEZACY NAD plytka, a nie jak kreska.
 *
 * Wydzielone, bo tak samo rysuje sie podglad przewodu przed polaczeniem -
 * podglad ma wygladac dokladnie tak, jak polaczenie, ktore z niego powstanie.
 *
 * `pathLength={100}` normalizuje dlugosc kazdej sciezki: animacja dorysowania
 * operuje wtedy stalymi wartosciami stroke-dash* w CSS, bez mierzenia sciezek.
 */
export function WireStrokes({ path, colour }: { path: string; colour: string }) {
  return (
    // `pointerEvents="none"` jest tu KONIECZNE. Kazde z tych pociagniec jest
    // normalnym ksztaltem SVG i lapie kursor - a cien jest do tego przesuniety
    // o kilka jednostek w bok i rozmyty. Bez tego rysunek jednej zyly zaslanial
    // pola trafienia zyl lezacych pod nia i podswietlal sie nie ten przewod,
    // nad ktorym stal kursor.
    <g pointerEvents="none" className="wire-visual">
      <path d={path} className="wire-shadow" pathLength={100} />
      <path
        d={path}
        stroke={shade(colour, 0.45)}
        strokeWidth={10}
        fill="none"
        strokeLinecap="round"
        pathLength={100}
      />
      <path d={path} stroke={colour} strokeWidth={7} fill="none" strokeLinecap="round" pathLength={100} />
      <path
        d={path}
        stroke="#ffffff"
        strokeOpacity={0.3}
        strokeWidth={2.2}
        fill="none"
        strokeLinecap="round"
        transform="translate(0, -1.8)"
        pathLength={100}
      />
    </g>
  )
}

/**
 * Podswietlenie obu koncow wskazanego przewodu.
 *
 * To jedyna czesc opisu, ktora MUSI zostac na rysunku: odpowiada na pytanie
 * „dokad ta zyla biegnie” w miejscu, w ktorym da sie na to spojrzec. Rysujemy
 * ja nad pinami, inaczej schowalaby sie pod nimi. Tresc slowna - kto z kim -
 * poszla do dymka przy kursorze, bo tam nie zaslania sasiednich przewodow.
 */
function WireEnds({ colour, ends }: { colour: string; ends: { a: Point; b: Point } }) {
  return (
    <g pointerEvents="none">
      {[ends.a, ends.b].map((point, index) => (
        <g key={index}>
          <circle cx={point.x} cy={point.y} r={22} fill={colour} opacity={0.25} />
          <circle cx={point.x} cy={point.y} r={18} fill="none" stroke="#ffffff" strokeWidth={3} />
        </g>
      ))}
    </g>
  )
}

/** Plastikowa koszulka wtyku na koncu zyly. */
export function ConnectorBoot({ point, color }: { point: Point; color: string }) {
  return (
    <g transform={`translate(${point.x}, ${point.y})`} pointerEvents="none">
      <rect x={-8} y={-9} width={16} height={18} rx={3} fill="#141414" opacity={0.9} />
      <rect x={-6} y={-7} width={12} height={7} rx={2} fill={shade(color, 0.75)} />
      <circle r={3.2} cy={3} fill="#c9a227" />
    </g>
  )
}
