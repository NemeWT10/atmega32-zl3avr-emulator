/**
 * Ksztalt przewodu liczony DETERMINISTYCZNIE - bez fizyki.
 *
 * Wczesniej kazda zyla miala wlasna symulacje lancucha (metoda Verleta) liczona
 * w petli animacji. Wygladalo to zywo, ale kosztowalo z trzech stron naraz:
 *
 *   1. WYDAJNOSC. Petla `requestAnimationFrame` przeliczala i przerysowywala
 *      warstwe przewodow 60 razy na sekunde - takze wtedy, gdy nic sie nie
 *      ruszalo. Na starszym komputerze to byla najdrozsza rzecz w calym oknie.
 *   2. POWTARZALNOSC. Ten sam uklad polaczen za kazdym razem opadal odrobine
 *      inaczej, wiec plytka z instrukcji i plytka studenta wygladaly roznie.
 *   3. WIERNOSC PODGLADU. Zyla prowadzona reka i zyla gotowa byly DWOMA roznymi
 *      symulacjami - zdarzalo sie, ze po polaczeniu przewod konczyl w innym
 *      miejscu, niz pokazywal podglad, i "nie trafial w pin".
 *
 * Teraz ksztalt jest czysta funkcja koncow: te same dwa piny daja ZAWSZE
 * dokladnie te sama krzywa. Podglad przed polaczeniem wola te sama funkcje,
 * co gotowy przewod - wiec z konstrukcji nie moze pokazac czegos innego.
 * Zadnej petli animacji nie ma; jedyny ruch to jednorazowe "dorysowanie"
 * swiezej zyly, robione w CSS.
 *
 * Model dlugosci zostal ten sam, co w wersji z fizyka: przewod z laboratorium
 * ma swoja dlugosc, wiec polaczenie dwoch sasiednich pinow daje wyrazna petle,
 * a nie krotka kreske.
 */

import type { PinRef } from '@zl3avr/board'
import { HEADER_BY_ID, pinPosition } from './layout'

export interface Point {
  x: number
  y: number
}

/** Gotowa trasa: sciezka SVG plus dane potrzebne warstwie przewodow. */
export interface WireRoute {
  path: string
  /** Poczatek i koniec - juz po wyborze wlasciwej kolumny pada. */
  a: Point
  b: Point
  /** Najnizszy punkt trasy - do ukladania przewodow "w glab" sceny. */
  bottom: number
}

/** Zapas dlugosci ponad linie prosta - taki sam mial przewod z fizyka. */
const SLACK = 1.18
/** Najkrotszy przewod dostepny na laboratorium - stad minimalna petla. */
const MINIMUM_LENGTH = 230

/**
 * Pozycje wszystkich padow danej linii.
 *
 * Zlacza portow maja DWIE kolumny padow na te sama linie mikrokontrolera
 * (sluza rozgalezianiu polaczen). Elektrycznie to jeden punkt, ale na rysunku
 * to dwa rozne miejsca - i wlasnie tu siedzial zgloszony blad: przyciaganie
 * celowalo w dowolny pad, a gotowa zyla rysowala sie zawsze w kolumnie 0,
 * wiec po polaczeniu przeskakiwala o caly rozstaw i "nie trafiala w pin".
 */
function padOptions(pin: PinRef): Point[] {
  const header = HEADER_BY_ID.get(pin.connector)
  if (!header) {
    const single = pinPosition(pin.connector, pin.index)
    return single ? [single] : []
  }
  const options: Point[] = []
  for (let column = 0; column < header.columns; column++) {
    const position = pinPosition(pin.connector, pin.index, column)
    if (position) options.push(position)
  }
  return options
}

/**
 * Wybiera po jednym padzie na kazdym koncu tak, zeby pady byly ZWROCONE
 * ku sobie (najkrotsza para sposrod dostepnych kolumn).
 *
 * Wybor jest deterministyczny, wiec przewod po odswiezeniu strony siedzi
 * dokladnie tam, gdzie przedtem. Przy remisie (zyla w obrebie jednego zlacza)
 * wygrywa pierwsza sprawdzona para, czyli kolumna 0 - tez zawsze ta sama.
 */
export function wireEndpoints(a: PinRef, b: PinRef): { a: Point; b: Point } | null {
  const optionsA = padOptions(a)
  const optionsB = padOptions(b)
  let best: { a: Point; b: Point } | null = null
  let bestDistance = Infinity
  for (const pointA of optionsA) {
    for (const pointB of optionsB) {
      const distance = Math.hypot(pointB.x - pointA.x, pointB.y - pointA.y)
      if (distance < bestDistance - 0.001) {
        bestDistance = distance
        best = { a: pointA, b: pointB }
      }
    }
  }
  return best
}

const round = (value: number) => Math.round(value * 10) / 10

/**
 * Krzywa przewodu miedzy dwoma punktami.
 *
 * Jedna krzywa Beziera z punktami kontrolnymi opuszczonymi o zwis - przewod
 * wychodzi z obu pinow lekko w dol i opada, jak zyla, ktora naprawde wisi.
 * Zwis wynika z nadmiaru dlugosci przewodu nad odlegloscia miedzy pinami,
 * wiec dwa sasiednie piny lacza sie widoczna petla.
 *
 * Przewody biegnace niemal pionowo dostaja dodatkowo wybrzuszenie w bok -
 * bez niego petla skladalaby sie w pionowa kreske i nie byloby jej widac.
 * Strona wybrzuszenia jest STALA (w prawo), zeby ten sam uklad polaczen
 * zawsze wygladal tak samo.
 */
export function wireRoute(a: Point, b: Point): WireRoute {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const distance = Math.hypot(dx, dy) || 1
  const length = Math.max(distance * SLACK, MINIMUM_LENGTH)
  const spare = length - distance
  const sag = Math.min(150, 24 + spare * 0.55)
  const bow = Math.max(0, 1 - Math.abs(dx) / 140) * Math.min(70, sag)

  const control1 = { x: a.x + dx * 0.25 + bow, y: a.y + dy * 0.25 + sag }
  const control2 = { x: a.x + dx * 0.75 + bow, y: a.y + dy * 0.75 + sag }

  const path =
    `M ${round(a.x)} ${round(a.y)} ` +
    `C ${round(control1.x)} ${round(control1.y)}, ` +
    `${round(control2.x)} ${round(control2.y)}, ` +
    `${round(b.x)} ${round(b.y)}`

  return {
    path,
    a,
    b,
    // Krzywa Beziera nie wychodzi poza obrys punktow kontrolnych,
    // wiec ich maksimum wystarcza do ulozenia przewodow w glab sceny.
    bottom: Math.max(a.y, b.y, control1.y, control2.y),
  }
}

/** Trasa przewodu wprost z odniesien do pinow - wybor padow + krzywa. */
export function routeBetween(a: PinRef, b: PinRef): WireRoute | null {
  const ends = wireEndpoints(a, b)
  return ends ? wireRoute(ends.a, ends.b) : null
}
