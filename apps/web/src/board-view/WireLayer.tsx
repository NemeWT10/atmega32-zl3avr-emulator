import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CONNECTORS, type PinRef, type Wire } from '@zl3avr/board'
import { Rope, type Point } from './rope'

/**
 * Warstwa przewodow.
 *
 * Kazdy przewod ma wlasna symulacje (rope.ts) liczona w petli animacji.
 * Rysowany jest czterema pociagnieciami: cieniem rzuconym na plytke, ciemnym
 * obrysem, wlasciwym kolorem izolacji i wąskim rozblyskiem u gory - dzieki temu
 * plaski SVG czyta sie jak okragla zyla lezaca NAD plytka, a nie jak kreska.
 *
 * Przy kilkunastu zylach nad jednym zlaczem nie da sie okiem przesledzic, ktora
 * dokad biegnie. Dlatego najechanie na przewod PRZYGASZA pozostale i podswietla
 * jego oba konce.
 *
 * Sam napis „co z czym laczy” nie jest juz rysowany na plytce. Byl ramka w SVG
 * przy srodku zyly, wiec skalowal sie razem z rysunkiem - przy powiekszeniu
 * zaslanial pol wiazki. Teraz idzie do tego samego dymka przy kursorze,
 * z ktorego korzystaja wszystkie pozostale elementy plytki: ma stala wielkosc
 * niezaleznie od powiekszenia i sam ucieka przed krawedzia okna.
 */

export interface WireLayerProps {
  wires: Wire[]
  /** Zwraca pozycje pinu albo `null`, jesli zlacze nie jest rysowane. */
  resolvePin: (connector: string, index: number) => Point | null
  /**
   * Przewod, ktory wlasnie powstal z podgladu - przejmie jego ksztalt zamiast
   * pojawiac sie w innym polozeniu. `null`, gdy nic takiego nie ma.
   */
  handoff: { id: string; rope: Rope } | null
  onRemove: (wireId: string) => void
  /** Wskazany przewod - nadrzedny widok pokazuje dla niego dymek przy kursorze. */
  onHoverWire: (wire: Wire | null) => void
  /**
   * Grupa rysowana NA SAMEJ GORZE rysunku - trafia do niej opis wskazanego
   * przewodu.
   *
   * Same przewody musza lezec pod pinami, inaczej nie da sie trafic w sasiedni
   * pin. Ale opis rysowany razem z nimi znikal pod rzedem pinow i ich napisami
   * i byl nieczytelny - a to jedyna rzecz, ktora ma tam byc widoczna. Dlatego
   * przenosimy go portalem do warstwy nad wszystkim.
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

export function WireLayer({
  wires,
  resolvePin,
  handoff,
  onRemove,
  onHoverWire,
  calloutHost,
}: WireLayerProps) {
  const ropes = useRef(new Map<string, Rope>())
  const [, setFrame] = useState(0)
  const [hovered, setHovered] = useState<string | null>(null)

  // Klucz zmienia sie tylko wtedy, gdy przybywa lub ubywa przewodow.
  const wiresKey = wires.map((wire) => wire.id).join('|')

  const endpoints = useMemo(() => {
    const map = new Map<string, { a: Point; b: Point }>()
    for (const wire of wires) {
      const a = resolvePin(wire.a.connector, wire.a.index)
      const b = resolvePin(wire.b.connector, wire.b.index)
      if (a && b) map.set(wire.id, { a, b })
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wiresKey, resolvePin])

  // Tworzenie i usuwanie lancuchow razem z przewodami.
  useEffect(() => {
    const current = ropes.current
    for (const wire of wires) {
      if (current.has(wire.id)) continue
      const ends = endpoints.get(wire.id)
      if (!ends) continue
      const rope = new Rope(ends.a, ends.b)
      if (handoff && handoff.id === wire.id && rope.copyShapeFrom(handoff.rope)) {
        // Zyla przed chwila prowadzona reka - zaczyna dokladnie tam, gdzie
        // skonczyl podglad, i sama sie uspokaja.
      } else {
        // Zestawy gotowych polaczen maja od razu lezec spokojnie,
        // zamiast opadac na oczach uzytkownika przy kazdym przelaczeniu widoku.
        rope.settle(ends.a, ends.b)
      }
      current.set(wire.id, rope)
    }
    for (const id of [...current.keys()]) {
      if (!wires.some((wire) => wire.id === id)) current.delete(id)
    }
  }, [wires, endpoints, handoff])

  /**
   * Petla fizyki - osobna od petli symulacji mikrokontrolera.
   *
   * Zalezy WYLACZNIE od `endpoints`, ktore zmieniaja sie tylko przy przybyciu
   * albo ubyciu przewodu. Wczesniej byl tu takze podglad przewodu - obiekt
   * tworzony na nowo przy kazdym ruchu myszy - wiec petla kasowala sie
   * i zakladala od poczatku kilkadziesiat razy na sekunde.
   */
  useEffect(() => {
    let handle = 0
    let last = performance.now()
    const loop = () => {
      const now = performance.now()
      const dt = Math.min(0.033, (now - last) / 1000)
      last = now

      for (const [id, rope] of ropes.current) {
        const ends = endpoints.get(id)
        if (ends) rope.step(dt, ends.a, ends.b)
      }

      setFrame((value) => value + 1)
      handle = requestAnimationFrame(loop)
    }
    handle = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(handle)
  }, [endpoints])

  // Przewody lezace nizej rysujemy pozniej - dzieki temu wygladaja,
  // jakby lezaly na wierzchu stosu. Wskazany zawsze na samej gorze.
  const ordered = [...wires]
    .filter((wire) => ropes.current.has(wire.id))
    .sort((a, b) => {
      if (a.id === hovered) return 1
      if (b.id === hovered) return -1
      return (ropes.current.get(a.id)?.lowestY() ?? 0) - (ropes.current.get(b.id)?.lowestY() ?? 0)
    })

  const hoveredWire = hovered ? wires.find((wire) => wire.id === hovered) : undefined
  const hoveredEnds = hovered ? endpoints.get(hovered) : undefined

  return (
    <g className="wire-layer">
      {ordered.map((wire) => {
        const rope = ropes.current.get(wire.id)!
        const path = rope.toPath()
        const ends = endpoints.get(wire.id)
        const dimmed = hovered !== null && hovered !== wire.id
        return (
          <g key={wire.id} opacity={dimmed ? 0.12 : 1}>
            <WireStrokes path={path} colour={wire.color} />
            {ends && <ConnectorBoot point={ends.a} color={wire.color} />}
            {ends && <ConnectorBoot point={ends.b} color={wire.color} />}
            {/*
              Pole trafienia zyly. Szerokosc dobrana do samego przewodu
              (widoczny obrys ma 10), z jedna jednostka zapasu na stronie.
              Wczesniej bylo 18, czyli prawie dwa razy tyle - przewod reagowal,
              gdy kursor stal wyraznie OBOK niego.
            */}
            <path
              d={path}
              stroke="transparent"
              strokeWidth={12}
              strokeLinecap="round"
              fill="none"
              style={{ cursor: 'pointer' }}
              onPointerEnter={() => {
                setHovered(wire.id)
                onHoverWire(wire)
              }}
              onPointerLeave={() => {
                setHovered((current) => (current === wire.id ? null : current))
                onHoverWire(null)
              }}
              onClick={() => {
                setHovered(null)
                onHoverWire(null)
                onRemove(wire.id)
              }}
            />
          </g>
        )
      })}

      {/* --- konce wskazanego przewodu, rysowane nad pinami --- */}
      {hoveredWire &&
        hoveredEnds &&
        calloutHost &&
        createPortal(<WireEnds colour={hoveredWire.color} ends={hoveredEnds} />, calloutHost)}

    </g>
  )
}

/**
 * Cztery pociagniecia, z ktorych sklada sie zyla: cien rzucony na plytke,
 * ciemny obrys, wlasciwy kolor izolacji i waski rozblysk u gory. Dzieki nim
 * plaski SVG czyta sie jak okragly przewod LEZACY NAD plytka, a nie jak kreska.
 *
 * Wydzielone, bo tak samo rysuje sie przewod trzymany w reku (WirePreview) -
 * podglad ma wygladac dokladnie tak, jak polaczenie, ktore z niego powstanie.
 */
export function WireStrokes({ path, colour }: { path: string; colour: string }) {
  return (
    // `pointerEvents="none"` jest tu KONIECZNE. Kazde z tych pociagniec jest
    // normalnym ksztaltem SVG i lapie kursor - a cien jest do tego przesuniety
    // o kilka jednostek w bok i rozmyty. Bez tego rysunek jednej zyly zaslanial
    // pola trafienia zyl lezacych pod nia i podswietlal sie nie ten przewod,
    // nad ktorym stal kursor.
    <g pointerEvents="none">
      <path d={path} className="wire-shadow" />
      <path d={path} stroke={shade(colour, 0.45)} strokeWidth={10} fill="none" strokeLinecap="round" />
      <path d={path} stroke={colour} strokeWidth={7} fill="none" strokeLinecap="round" />
      <path
        d={path}
        stroke="#ffffff"
        strokeOpacity={0.3}
        strokeWidth={2.2}
        fill="none"
        strokeLinecap="round"
        transform="translate(0, -1.8)"
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
