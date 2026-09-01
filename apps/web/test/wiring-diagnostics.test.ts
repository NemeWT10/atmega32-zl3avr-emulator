import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Atmega32 } from '@zl3avr/avr-core'
import { Board, applyPreset, describeWiring } from '@zl3avr/board'
import { analyse, type Diagnostic, type HardwareContext } from '../src/ide/diagnostics'

/**
 * Ostrzezenia o PRZEWODACH.
 *
 * Sedno tej warstwy analizy: kompilator nie widzi plytki, a najczestszy powod
 * zdania „program jest dobry, a nic sie nie dzieje” to niepoprowadzona zyla.
 *
 * Druga polowa testu jest wazniejsza od pierwszej. Sprawdza, ze przy POPRAWNYCH
 * polaczeniach - tych z gotowego zestawu danego cwiczenia - regula milczy.
 * Falszywy alarm uczy ignorowania komunikatow i psuje cala reszte analizy.
 */

const SOURCE_DIR = fileURLToPath(new URL('../src/examples/src/', import.meta.url))

/** Ktore zrodla naleza do ktorego cwiczenia i z jakim zestawem polaczen chodza. */
const EXERCISES: { preset: string; sources: string[] }[] = [
  { preset: 'l1', sources: ['lab1_main.c'] },
  { preset: 'l2', sources: ['lab2_main.c'] },
  { preset: 'l3', sources: ['lab3_main.c'] },
  { preset: 'l4', sources: ['lab4_main.c'] },
  { preset: 'l5', sources: ['lab5_main.c'] },
  { preset: 'l6', sources: ['lab6_main.c', 'queue.c'] },
  { preset: 'l7', sources: ['lab7_main.c', 'queue.c'] },
  { preset: 'l8', sources: ['lab8_main.c'] },
  { preset: 'sw1', sources: ['sw1_main.c', 'sw1_klawiatura.c'] },
  { preset: 'sw2', sources: ['sw2_main.c', 'sw2_wyswietlacz.c', 'sw2_klawiatura.c'] },
  { preset: 'sw3', sources: ['sw3_main.c'] },
  { preset: 'sw4', sources: ['sw4_main.c'] },
]

function read(name: string): string {
  return readFileSync(join(SOURCE_DIR, name), 'utf8')
}

function wiringOf(presetId: string | null) {
  const board = new Board(new Atmega32())
  if (presetId) applyPreset(board, presetId)
  return describeWiring(board.wires)
}

function context(presetId: string | null): HardwareContext {
  return {
    clockHz: 1_000_000,
    jtagEnabled: false,
    jumpers: { JP3: false, JP4: true, JP25: false },
    wiring: wiringOf(presetId),
  }
}

/** Tylko komunikaty o przewodach - reszta warstwy „Plytka” ma swoje testy. */
function wiringMessages(found: Diagnostic[]): Diagnostic[] {
  return found.filter((item) => item.source === 'Płytka' && /przewod|przewód|diod/i.test(item.message))
}

describe('analiza widzi przewody na plytce', () => {
  it('pusta plytka: jeden komunikat, nie jeden na kazdy port', () => {
    const code = 'int main(void){ DDRB = 0xFF; PORTB = 0; DDRD = 0; PORTA = 1; return 0; }'
    const found = wiringMessages(analyse(code, context(null), ''))
    expect(found).toHaveLength(1)
    expect(found[0].severity).toBe('info')
    expect(found[0].message).toContain('ani jednego przewodu')
  })

  it('port uzyty w kodzie bez zyl: ostrzezenie mowi, co JEST podlaczone', () => {
    // Zestaw L1 laczy port D z diodami; kod siega po port B.
    const code = 'int main(void){ DDRB = 0xFF; PORTB = 0x55; return 0; }'
    const found = wiringMessages(analyse(code, context('l1'), ''))
    expect(found).toHaveLength(1)
    expect(found[0].severity).toBe('warning')
    expect(found[0].message).toContain('portu B')
    expect(found[0].hint).toContain('port D')
    expect(found[0].hint).toContain('Diody LED')
  })

  it('port podlaczony poprawnie: cisza', () => {
    const code = 'int main(void){ DDRD = 0xFF; PORTD = 0x01; return 0; }'
    expect(wiringMessages(analyse(code, context('l1'), ''))).toEqual([])
  })

  it('odczyt wejsc z portu obwieszonego samymi diodami', () => {
    const code = 'int main(void){ DDRD = 0xFF; if (PIND & 1) PORTD = 0; return 0; }'
    const found = wiringMessages(analyse(code, context('l1'), ''))
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('wyłącznie do diod LED')
  })

  it('sterownik wybierajacy port wskaznikiem nie jest posadzany o brak przewodow', () => {
    // Tak wyglada uniwersalny sterownik klawiatury: wymienia wszystkie porty,
    // ale uzywa tego jednego, ktory dostanie parametrem.
    const code = [
      'void wybierz(uint8_t n, volatile uint8_t **ddr) {',
      '  switch (n) {',
      '    case 2: *ddr = &DDRB; break;',
      '    case 3: *ddr = &DDRC; break;',
      '    default: *ddr = &DDRA; break;',
      '  }',
      '}',
    ].join('\n')
    expect(wiringMessages(analyse(code, context('l1'), ''))).toEqual([])
  })

  it('bez wiedzy o polaczeniach reguly milcza', () => {
    const code = 'int main(void){ DDRB = 0xFF; PORTB = 0x01; return 0; }'
    const blind: HardwareContext = {
      clockHz: 1_000_000,
      jtagEnabled: false,
      jumpers: { JP3: false, JP4: true, JP25: false },
    }
    expect(wiringMessages(analyse(code, blind, ''))).toEqual([])
  })
})

describe('gotowe cwiczenia nie dostaja falszywego alarmu o przewodach', () => {
  const available = new Set(readdirSync(SOURCE_DIR))

  for (const exercise of EXERCISES) {
    it(`${exercise.preset} — przy wlasnym zestawie polaczen bez ostrzezen`, () => {
      const missing = exercise.sources.filter((name) => !available.has(name))
      expect(missing).toEqual([])

      const hardware = context(exercise.preset)
      // Zestaw polaczen musi istniec - literowka w identyfikatorze dalaby
      // pusta plytke i test przechodzilby z zupelnie innego powodu.
      expect(hardware.wiring!.total).toBeGreaterThan(0)

      const complaints: string[] = []
      for (const name of exercise.sources) {
        const others = exercise.sources
          .filter((other) => other !== name)
          .map(read)
          .join('\n')
        for (const item of wiringMessages(analyse(read(name), hardware, others))) {
          complaints.push(`${name} l.${item.line}: ${item.message}`)
        }
      }
      expect(complaints).toEqual([])
    })
  }
})
