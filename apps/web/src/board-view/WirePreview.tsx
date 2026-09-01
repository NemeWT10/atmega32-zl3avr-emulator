import { useEffect, useRef, useState } from 'react'
import { ConnectorBoot, WireStrokes } from './WireLayer'
import { Rope, type Point } from './rope'

/**
 * Przewod trzymany w reku - miedzy chwyceniem pinu a puszczeniem przycisku.
 *
 * Wydzielony do osobnego komponentu z trzech powodow, a kazdy z nich byl
 * wczesniej widoczna usterka:
 *
 * 1. Podglad byl rysowany W SRODKU warstwy gotowych przewodow, ktora na czas
 *    przeciagania przygasza sie do 35%. Najjasniejszy element sceny - ten,
 *    ktorym uzytkownik wlasnie steruje - byl wiec najbledszy.
 * 2. Przy wlaczonym „ukryj przewody” cala ta warstwa znikala, a razem z nia
 *    podglad. Prowadzenie zyly odbywalo sie wtedy na slepo - mimo ze wlasnie
 *    po to sie te warstwe ukrywa, zeby dosiegnac pinow.
 * 3. Petla animacji byla podpieta pod zmienny obiekt `preview`, wiec kasowala
 *    sie i zakladala od nowa przy KAZDYM ruchu myszy. Zyla szarpala sie
 *    i gubila krok calkowania.
 *
 * Dlugosc zyly podaza za odlegloscia od kursora, dokladnie tak, jak liczy ja
 * gotowy przewod. Dzieki temu podglad ma ten sam zwis co polaczenie, ktore
 * zaraz powstanie - nie ma skoku ksztaltu w chwili puszczenia przycisku.
 */

/** Zapas dlugosci ponad odleglosc w linii prostej - tyle samo ma gotowy przewod. */
const SLACK = 1.18

interface Props {
  /** Pin, z ktorego wychodzi zyla. */
  from: Point
  /** Koniec trzymany w reku: kursor albo pin, na ktory zyla wskoczy. */
  to: Point
  /** Kolor, ktory dostanie gotowy przewod - widac od razu, co powstanie. */
  colour: string
  /** Czy koniec trzyma sie juz pinu. */
  snapped: boolean
  /**
   * Udostepnia lancuch na zewnatrz. Gotowy przewod przejmuje jego ksztalt,
   * wiec w chwili polaczenia zyla nie „przeskakuje” w inne polozenie.
   */
  onRope: (rope: Rope | null) => void
}

export function WirePreview({ from, to, colour, snapped, onRope }: Props) {
  // Lancuch powstaje raz, przy chwyceniu pinu. Komponent zyje tylko przez czas
  // przeciagania, wiec nie ma tu nic do sprzatania miedzy przewodami.
  const [rope] = useState(() => new Rope(from, to))

  /** Konce czytane w petli animacji - bez tego petla musialaby sie restartowac. */
  const ends = useRef({ from, to })
  ends.current = { from, to }

  const [, setFrame] = useState(0)
  /**
   * Zyla lezy zwinieta na pinie, dopoki nie zostanie z niego sciagnieta.
   * Przy pierwszym wyraznym ruchu rozkladamy lancuch wzdluz linii do kursora -
   * inaczej przez chwile widac wezel rozplatujacy sie w miejscu chwycenia.
   */
  const pulledOut = useRef(false)

  useEffect(() => {
    onRope(rope)
    return () => onRope(null)
  }, [rope, onRope])

  useEffect(() => {
    let handle = 0
    let last = performance.now()
    const loop = () => {
      const now = performance.now()
      const dt = Math.min(0.033, (now - last) / 1000)
      last = now

      const { from: start, to: end } = ends.current
      const distance = Math.hypot(end.x - start.x, end.y - start.y)
      rope.setLength(distance * SLACK)
      if (!pulledOut.current && distance > 30) {
        pulledOut.current = true
        rope.reseed(start, end)
      }
      rope.step(dt, start, end)
      setFrame((value) => value + 1)

      handle = requestAnimationFrame(loop)
    }
    handle = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(handle)
  }, [rope])

  const path = rope.toPath()

  return (
    <g className="wire-preview" pointerEvents="none">
      <WireStrokes path={path} colour={colour} />
      <ConnectorBoot point={from} color={colour} />
      {snapped ? (
        // Wtyk osadzony na pinie - taki sam jak w gotowym przewodzie.
        <ConnectorBoot point={to} color={colour} />
      ) : (
        // Wolny koniec: otwarty pierscien mowi, ze zyla nie jest jeszcze wpieta.
        <g transform={`translate(${to.x}, ${to.y})`}>
          <circle r={9} fill="none" stroke={colour} strokeWidth={3} opacity={0.9} />
          <circle r={3} fill={colour} opacity={0.9} />
        </g>
      )}
    </g>
  )
}
