import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Atmega32, IO } from '@zl3avr/avr-core'
import { Board, applyPreset } from '@zl3avr/board'

/**
 * Pusty projekt startowy - jedyny przyklad, ktorego pliku HEX nie zbudowal
 * avr-gcc. Zlozono go recznie z czterech instrukcji, wiec MUSI byc sprawdzony
 * w symulatorze: gdyby ktorys bajt byl zly, student dostalby na dzien dobry
 * plytke, na ktorej „nic nie dziala".
 *
 * Sprawdzamy dokladnie to, co obiecuje opis przykladu: port A jako wyjscie,
 * wszystkie osiem diod zapalonych i przewody z portu A do linijki diod.
 */

const HEX = readFileSync(
  fileURLToPath(new URL('../src/examples/start/start_leds.hex', import.meta.url)),
  'utf8',
)

function boot(preset: string | null): Board {
  const mcu = new Atmega32()
  const board = new Board(mcu)
  if (preset) applyPreset(board, preset)
  mcu.loadHex(HEX)
  board.setPower(true)
  mcu.runSeconds(0.01)
  return board
}

describe('pusty projekt startowy', () => {
  it('ustawia caly port A jako wyjscie i podaje na nim same jedynki', () => {
    const board = boot('start')
    expect(board.mcu.cpu.getIoDirect(IO.DDRA)).toBe(0xff)
    expect(board.mcu.readPort('A')).toBe(0xff)
  })

  it('zapala wszystkie osiem diod', () => {
    const board = boot('start')
    expect(board.getState().leds.map((led) => led.on)).toEqual([
      true, true, true, true, true, true, true, true,
    ])
  })

  it('zestaw polaczen laczy port A z diodami w kolejnosci prostej', () => {
    const board = boot('start')
    expect(board.wires).toHaveLength(8)
    for (const wire of board.wires) {
      expect(wire.a.connector).toBe('JP17')
      expect(wire.b.connector).toBe('JP22')
      expect(wire.a.index).toBe(wire.b.index)
    }
  })

  it('bez przewodow nie swieci nic, choc port pracuje', () => {
    const board = boot(null)
    expect(board.mcu.readPort('A')).toBe(0xff)
    expect(board.getState().leds.some((led) => led.on)).toBe(false)
  })
})
