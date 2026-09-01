import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Atmega32 } from '@zl3avr/avr-core'
import { Board, type PinRef } from '@zl3avr/board'
import { pinPosition } from '../src/board-view/layout'
import { routeBetween, wireEndpoints, wireRoute } from '../src/board-view/route'

/**
 * Ksztalt przewodu jest teraz CZYSTA FUNKCJA koncow - bez fizyki i bez losowosci.
 * To fundament dwoch obietnic interfejsu:
 *   - podglad przed polaczeniem pokazuje DOKLADNIE te zyle, ktora powstanie
 *     (obie strony wolaja te same funkcje),
 *   - ten sam uklad polaczen wyglada zawsze tak samo, takze po odswiezeniu.
 *
 * Druga czesc testow sprawdza, ze polaczenie zawarte przez interfejs to nie
 * tylko rysunek: zyla naprawde przewodzi w netliscie symulatora.
 */

const pin = (connector: PinRef['connector'], index: number): PinRef => ({ connector, index })

describe('deterministyczna trasa przewodu', () => {
  it('te same konce daja zawsze dokladnie te sama sciezke', () => {
    const first = routeBetween(pin('JP17', 0), pin('JP22', 0))
    const second = routeBetween(pin('JP17', 0), pin('JP22', 0))
    expect(first?.path).toBe(second?.path)
    expect(first?.path).toMatch(/^M -?[\d.]+ -?[\d.]+ C /)
  })

  it('w zlaczu dwukolumnowym wybiera pad zwrocony ku drugiemu koncowi', () => {
    // Obie kolumny zlacza portu to ta sama linia mikrokontrolera; rysunkowo
    // zyla ma wychodzic z pada blizszego celowi. Tu wlasnie siedzial blad
    // "przewod nie trafia w pin": przyciaganie celowalo w dowolny pad,
    // a gotowa zyla rysowala sie zawsze w kolumnie 0.
    const fromPortA = wireEndpoints(pin('JP17', 0), pin('JP22', 0))!
    expect(fromPortA.a.x).toBe(pinPosition('JP17', 0, 1)!.x)

    const fromPortB = wireEndpoints(pin('JP16', 0), pin('JP22', 0))!
    expect(fromPortB.a.x).toBe(pinPosition('JP16', 0, 1)!.x)
  })

  it('zyla w obrebie jednego zlacza trzyma sie jednej kolumny na obu koncach', () => {
    const ends = wireEndpoints(pin('JP17', 0), pin('JP17', 5))!
    expect(ends.a.x).toBe(ends.b.x)
  })

  it('sasiednie szpilki laczy widoczna petla, nie krotka kreska', () => {
    // Najkrotszy przewod z laboratorium ma swoja dlugosc - polaczenie
    // sasiadow musi zwisac wyraznie ponizej obu szpilek.
    const a = pinPosition('JP22', 0)!
    const b = pinPosition('JP22', 1)!
    const route = wireRoute(a, b)
    expect(route.bottom).toBeGreaterThan(Math.max(a.y, b.y) + 60)
  })

  it('dluzsza zyla dostaje wiekszy zwis, ale ograniczony z gory', () => {
    const short = wireRoute({ x: 0, y: 0 }, { x: 300, y: 0 })
    const long = wireRoute({ x: 0, y: 0 }, { x: 900, y: 0 })
    expect(long.bottom).toBeGreaterThan(short.bottom)
    expect(long.bottom).toBeLessThan(200)
  })

  it('nietypowe kombinacje zlaczy maja poprawna trase', () => {
    const pairs: Array<[PinRef, PinRef]> = [
      [pin('JP16', 0), pin('JP23', 7)], // przez cala plytke, port B -> klawiatura
      [pin('JP19', 7), pin('JP29', 0)], // port D -> zlacze LCD 4bit
      [pin('JP28', 3), pin('JP24', 0)], // dwa zlacza w jednym pionowym pasie
      [pin('JP17', 0), pin('JP17', 1)], // sasiedzi w tym samym zlaczu
      [pin('JP18', 0), pin('JP16', 7)], // port C -> port B, nad mikrokontrolerem
      [pin('JP22', 7), pin('JP23', 0)], // dioda -> klawiatura, niemal pionowo
    ]
    for (const [a, b] of pairs) {
      const route = routeBetween(a, b)!
      expect(route, `brak trasy ${a.connector}:${a.index} -> ${b.connector}:${b.index}`).toBeTruthy()
      expect(route.path).not.toContain('NaN')
      expect(route.bottom).toBeGreaterThanOrEqual(Math.max(route.a.y, route.b.y))
    }
  })

  it('pokrywajace sie konce nie daja NaN w sciezce', () => {
    const route = wireRoute({ x: 100, y: 100 }, { x: 100, y: 100 })
    expect(route.path).not.toContain('NaN')
  })
})

/**
 * Program startowy (DDRA = 0xFF, PORTA = 0xFF) + jedna zyla poprowadzona
 * "recznie" - dokladnie tym samym wywolaniem `board.connect`, ktore wykonuje
 * klikniecie na plytce. Skutek ma byc elektryczny, nie rysunkowy.
 */
const HEX = readFileSync(
  fileURLToPath(new URL('../src/examples/start/start_leds.hex', import.meta.url)),
  'utf8',
)

describe('polaczenie zawarte kliknieciami dziala w symulatorze', () => {
  function bootWith(wireFrom: PinRef, wireTo: PinRef) {
    const mcu = new Atmega32()
    const board = new Board(mcu)
    const wire = board.connect(wireFrom, wireTo, '#dc2626')
    mcu.loadHex(HEX)
    board.setPower(true)
    mcu.runSeconds(0.01)
    return { board, mcu, wire }
  }

  it('pojedyncza zyla PA3 -> LED6 zapala dokladnie te diode', () => {
    const { board } = bootWith(pin('JP17', 3), pin('JP22', 6))
    const leds = board.getState().leds.map((led) => led.on)
    expect(leds[6]).toBe(true)
    expect(leds.filter(Boolean)).toHaveLength(1)
  })

  it('wypiecie zyly naprawde gasi diode', () => {
    const { board, mcu, wire } = bootWith(pin('JP17', 3), pin('JP22', 6))
    expect(board.getState().leds[6].on).toBe(true)
    board.disconnect(wire.id)
    // Jasnosc jest usredniana w oknie 20 ms (bezwladnosc oka), a okno domyka
    // sie przy odczycie stanu - stara jasnosc wyplywa wiec z pamieci dopiero
    // po DWOCH odczytach rozdzielonych czasem, jak dwie klatki ekranu.
    mcu.runSeconds(0.05)
    board.getState()
    mcu.runSeconds(0.05)
    expect(board.getState().leds[6].on).toBe(false)
  })
})
