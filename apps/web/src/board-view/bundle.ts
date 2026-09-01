/**
 * Wiazka przewodow - laczenie kilku zyl jednym ruchem.
 *
 * Zaznaczenie prostokatne (Shift + przeciagniecie) podnosi kilka szpilek
 * naraz; klikniecie szpilki docelowej wpina pierwsza zyle wlasnie w nia,
 * a kazda nastepna w KOLEJNA linie tego samego zlacza - dokladnie tak,
 * jak wchodzi tasma wielozylowa. Ten modul trzyma czysta logike tej
 * operacji (kolejnosc, cele, opisy), zeby dala sie testowac bez rysunku.
 */

import { CONNECTORS, type PinRef } from '@zl3avr/board'

/**
 * Najwieksze zlacze, do ktorego da sie wpiac wiazke, ma 8 linii (zlacza
 * portow i peryferiow). Wieksze zaznaczenie nigdy by sie nie zmiescilo,
 * wiec ucinamy je od razu, z komunikatem - zamiast pozwolic prowadzic
 * wiazke, ktorej nie da sie nigdzie odlozyc.
 */
export const MAX_BUNDLE = 8

/**
 * Szpilki docelowe wiazki: od wskazanej w dol, po kolei.
 * `null`, gdy tyle linii nie miesci sie w zlaczu.
 */
export function bundleTargets(count: number, start: PinRef): PinRef[] | null {
  const connector = CONNECTORS[start.connector]
  if (!connector) return null
  if (start.index + count > connector.pins.length) return null
  return Array.from({ length: count }, (_, i) => ({
    connector: start.connector,
    index: start.index + i,
  }))
}

/**
 * Opis zrodla wiazki do paska nad plytka.
 *
 * Zaznaczenie ciagle w jednym zlaczu opisuje sie zakresem („Port A · PA0-PA7”),
 * bo to najczestszy i najczytelniejszy przypadek. Kazde inne - liczba szpilek.
 */
export function describeSelection(pins: PinRef[]): string {
  if (pins.length === 0) return ''
  const first = pins[0]
  const connector = CONNECTORS[first.connector]
  const label = (pin: PinRef) => connector?.pins[pin.index]?.label ?? `pin ${pin.index}`
  if (pins.length === 1) return `${connector?.name ?? first.connector} · ${label(first)}`

  const sameConnector = pins.every((pin) => pin.connector === first.connector)
  const contiguous =
    sameConnector && pins.every((pin, order) => pin.index === first.index + order)
  if (contiguous) {
    return `${connector?.name ?? first.connector} · ${label(first)}–${label(pins[pins.length - 1])}`
  }
  // Odmiana: 2-4 szpilki, 5+ szpilek (wiazka ma najwyzej 8 zyl, bez nastek).
  const ile = pins.length <= 4 ? `${pins.length} szpilki` : `${pins.length} szpilek`
  return sameConnector ? `${ile} złącza ${connector?.name ?? first.connector}` : `${ile} z różnych złączy`
}

/**
 * Kolory zyl wiazki - paleta tasmy wielozylowej, ta sama, ktorej uzywaja
 * gotowe zestawy polaczen. Dzieki temu wiazka polozona recznie wyglada
 * tak samo jak wiazka z wczytanego cwiczenia.
 */
export const RIBBON_COLOURS = [
  '#8b5a2b',
  '#e11d48',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#0ea5e9',
  '#8b5cf6',
  '#94a3b8',
]

export function bundleColours(count: number): string[] {
  return Array.from({ length: count }, (_, i) => RIBBON_COLOURS[i % RIBBON_COLOURS.length])
}
