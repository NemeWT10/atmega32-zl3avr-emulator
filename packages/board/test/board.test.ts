/**
 * Testy akceptacyjne plytki: PRAWDZIWE kody laboratoryjne uruchamiane na modelu
 * plytki z przewodami poprowadzonymi tak, jak kaze instrukcja.
 *
 * Kazdy test odpowiada na pytanie "czy student zobaczy to, co ma zobaczyc".
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Atmega32 } from '@zl3avr/avr-core'
import { Board } from '../src/board'
import { applyPreset } from '../src/presets'

const GOLDEN_DIR = join(__dirname, '..', '..', '..', 'tests', 'golden')

function setup(hexName: string, presetId: string): Board {
  const mcu = new Atmega32()
  const board = new Board(mcu)
  applyPreset(board, presetId)
  mcu.loadHex(readFileSync(join(GOLDEN_DIR, `${hexName}.hex`), 'utf8'))
  board.setPower(true)
  return board
}

/** Uruchamia symulacje krokami, az warunek bedzie spelniony albo skonczy sie czas. */
function runUntil(board: Board, predicate: () => boolean, maxSeconds: number): boolean {
  const stepSeconds = 0.002
  for (let elapsed = 0; elapsed < maxSeconds; elapsed += stepSeconds) {
    board.mcu.runSeconds(stepSeconds)
    if (predicate()) return true
  }
  return false
}

/** Zwraca kody znakow widocznego wiersza LCD jako tekst. */
function lcdLine(board: Board, row: number): string {
  return board.lcd
    .getState()
    .rows[row].map((code) => String.fromCharCode(code))
    .join('')
}

describe('L1 - przewody z portu D na linijke diod', () => {
  it('tasma w odwrotnej kolejnosci zapala diody lustrzanie do PORTD', () => {
    const board = setup('lab1_gpio_led', 'l1')
    board.mcu.runSeconds(0.01)

    // PORTD = 0b11000000, a PD0 idzie na LED7 -> swieca LED0 i LED1.
    expect(board.mcu.readPort('D')).toBe(0b11000000)
    const state = board.getState()
    expect(state.leds.map((led) => led.on)).toEqual([
      true, true, false, false, false, false, false, false,
    ])
  })

  it('bez przewodow zadna dioda nie swieci, mimo ze port pracuje', () => {
    const board = setup('lab1_gpio_led', 'l1')
    board.clearWires()
    board.mcu.runSeconds(0.05)

    expect(board.mcu.readPort('D')).not.toBe(0)
    expect(board.getState().leds.every((led) => !led.on)).toBe(true)
  })

  it('tasma podlaczona prosto zamiast odwrotnie daje inny obraz na diodach', () => {
    const board = setup('lab1_gpio_led', 'l1')
    board.clearWires()
    board.connectRibbon('JP19', 'JP22') // bez reverse - typowa pomylka
    board.mcu.runSeconds(0.05)

    const state = board.getState()
    expect(state.leds.map((led) => led.on)).toEqual([
      false, false, false, false, false, false, true, true,
    ])
  })
})

describe('L2 - klawiatura matrycowa i kalkulator (main (1).c)', () => {
  /**
   * Przytrzymuje klawisz, dopoki program go nie skonsumuje, a potem puszcza.
   * Numeracja klawiszy: wiersz * 4 + kolumna, uklad 1 2 3 A / 4 5 6 B / ...
   */
  function tapKey(board: Board, key: number, holdSeconds = 0.15): void {
    board.setKeyPressed(key, true)
    board.mcu.runSeconds(holdSeconds)
    board.setKeyPressed(key, false)
    board.mcu.runSeconds(0.05)
  }

  it('zwiera wiersz z kolumna, wiec skanowanie wykrywa wcisniety klawisz', () => {
    const board = setup('lab2_keypad', 'l2')
    board.mcu.runSeconds(0.05)

    // Klawisz "5" to wiersz 1, kolumna 1.
    board.setKeyPressed(5, true)
    // Wymus wysterowanie kolumny 1 (PA5) na niski, reszta wysoko, pull-upy na wierszach.
    board.mcu.cpu.writeData(0x3a, 0xf0) // DDRA
    board.mcu.cpu.writeData(0x3b, 0b11011111) // PORTA
    expect(board.mcu.readPort('A') & 0b0010).toBe(0) // PA1 = wiersz 2 sciagniety do zera

    board.setKeyPressed(5, false)
    expect(board.mcu.readPort('A') & 0b0010).toBe(0b0010) // pull-up podnosi linie
  })

  it('liczy 1 + 2 i wyswietla wynik na diodach', () => {
    const board = setup('lab2_keypad', 'l2')
    board.mcu.runSeconds(0.5)

    tapKey(board, 0) // '1'
    tapKey(board, 3) // 'A' = dodawanie
    tapKey(board, 1) // '2'
    tapKey(board, 14) // '#' = wykonaj

    const found = runUntil(board, () => board.mcu.readPort('D') === 3, 2.0)
    expect(found).toBe(true)

    // Daj diodom chwile na rozswiecenie - jasnosc jest calkowana po czasie,
    // wiec w chwili samej zmiany portu dioda jeszcze nie zdazyla zaswiecic.
    board.mcu.runSeconds(0.03)

    // PD0 -> LED7, wiec wynik 3 (bity 0 i 1) zapala LED7 i LED6.
    const leds = board.getState().leds.map((led) => led.on)
    expect(leds[7]).toBe(true)
    expect(leds[6]).toBe(true)
    expect(leds.slice(0, 6).some(Boolean)).toBe(false)
  })
})

describe('L3 - multipleksowany wyswietlacz 7-segmentowy (main (2).c)', () => {
  it('pokazuje zero na ostatniej cyfrze, pozostale cyfry pozostaja wygaszone', () => {
    const board = setup('lab3_7seg', 'l3')
    board.mcu.runSeconds(0.3)

    const digits = board.getState().digits
    // seg[0] = 0b11000000 -> segmenty a..f swieca, g i dp zgaszone.
    const last = digits[3].segments
    for (const index of [0, 1, 2, 3, 4, 5]) {
      expect(last[index]).toBeGreaterThan(0.05)
    }
    expect(last[6]).toBeLessThan(0.01) // segment g
    expect(last[7]).toBeLessThan(0.01) // kropka dziesietna

    // Licznik stoi na zerze, wiec starsze cyfry sa wygaszone.
    for (const digit of [0, 1, 2]) {
      expect(digits[digit].segments.every((value) => value < 0.01)).toBe(true)
    }
  })

  it('kazda cyfra swieci przez ulamek czasu - to jest multipleks, a nie ciagle swiecenie', () => {
    const board = setup('lab3_7seg', 'l3')
    board.mcu.runSeconds(0.3)

    const segmentA = board.getState().digits[3].segments[0]
    expect(segmentA).toBeGreaterThan(0.05)
    expect(segmentA).toBeLessThan(0.95)
  })
})

describe('L8-9 - wyswietlacz LCD w trybie 4-bitowym (main (7).c)', () => {
  it('wypisuje oba napisy we wlasciwych miejscach ekranu', () => {
    const board = setup('lab8_lcd', 'l8')

    const ready = runUntil(board, () => lcdLine(board, 1).includes('Tech uPROC'), 4)
    expect(ready).toBe(true)

    expect(lcdLine(board, 0)).toContain('Emulator AVR')
    expect(lcdLine(board, 1)).toContain('Tech uPROC')

    // lcd_move_cursor_to(0, 2) i (1, 3) - napisy zaczynaja sie z wciecien.
    expect(lcdLine(board, 0).indexOf('Emulator')).toBe(2)
    expect(lcdLine(board, 1).indexOf('Tech')).toBe(3)
  })

  it('zapisuje wlasny znak do CGRAM', () => {
    const board = setup('lab8_lcd', 'l8')
    // Znak wlasny zapisuje sie osmioma bajtami - czekamy na komplet, nie na pierwszy.
    runUntil(board, () => board.lcd.getState().customChars[0].every((row) => row !== 0), 6)

    const custom = board.lcd.getState().customChars[0]
    expect(custom.slice(0, 8)).toEqual([
      0b00100, 0b01010, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100,
    ])
  })

  it('wlacza wyswietlacz, kursor i miganie zgodnie z sekwencja inicjujaca', () => {
    const board = setup('lab8_lcd', 'l8')
    runUntil(board, () => board.lcd.getState().displayOn, 4)

    const state = board.lcd.getState()
    expect(state.displayOn).toBe(true)
    expect(state.cursorOn).toBe(true)
    expect(state.blinkOn).toBe(true)
  })
})
