/**
 * Reguly PRZEKROJOWE analizy kodu - takie, ktore lacza dwie funkcjonalnosci:
 * kod z przerwaniami, kod z przewodami na plytce, kod z rozmiarem rejestru.
 *
 * Kazda regula ma tu dwa rodzaje testow:
 *   - ze sie odzywa, kiedy blad naprawde jest,
 *   - ze MILCZY przy kodzie poprawnym - w tym na WSZYSTKICH dolaczonych
 *     przykladach z ich wlasnymi zestawami polaczen. Falszywy alarm uczy
 *     ignorowania komunikatow i psuje cala analize.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Atmega32 } from '@zl3avr/avr-core'
import { Board, applyPreset, describeWiring } from '@zl3avr/board'
import { analyse, type Diagnostic, type HardwareContext } from '../src/ide/diagnostics'

const SOURCE_DIR = fileURLToPath(new URL('../src/examples/src/', import.meta.url))
const START_DIR = fileURLToPath(new URL('../src/examples/start/', import.meta.url))

function context(presetId: string | null, wire?: (board: Board) => void): HardwareContext {
  const board = new Board(new Atmega32())
  if (presetId) applyPreset(board, presetId)
  wire?.(board)
  return {
    clockHz: 1_000_000,
    jtagEnabled: false,
    jumpers: { JP3: false, JP4: true, JP25: false },
    wiring: describeWiring(board.wires),
  }
}

const BEZ_PLYTKI: HardwareContext = {
  clockHz: 1_000_000,
  jtagEnabled: false,
  jumpers: { JP3: false, JP4: true, JP25: false },
}

describe('przerwanie włączone bitem, ale bez procedury ISR', () => {
  it('OCIE0 bez ISR(TIMER0_COMP_vect): ostrzeżenie o restarcie', () => {
    const code = [
      '#include <avr/io.h>',
      '#include <avr/interrupt.h>',
      'int main(void) {',
      '  TIMSK |= (1 << OCIE0);',
      '  sei();',
      '  while (1) { }',
      '}',
    ].join('\n')
    const found = analyse(code, BEZ_PLYTKI).filter((item) => item.message.includes('OCIE0'))
    expect(found).toHaveLength(1)
    expect(found[0].severity).toBe('warning')
    expect(found[0].message).toContain('nie ma procedury ISR(TIMER0_COMP_vect)')
    expect(found[0].hint).toContain('OD NOWA')
  })

  it('procedura w INNYM pliku projektu wystarcza — cisza', () => {
    const code =
      '#include <avr/io.h>\nint main(void) { TIMSK |= (1 << OCIE0); sei(); while (1) { } }'
    const other = 'ISR(TIMER0_COMP_vect) { }'
    expect(
      analyse(code, BEZ_PLYTKI, other).filter((item) => item.message.includes('OCIE0')),
    ).toEqual([])
  })

  it('kasowanie bitu (&= ~) nie jest włączeniem — cisza', () => {
    const code =
      '#include <avr/io.h>\nint main(void) { TIMSK &= ~(1 << OCIE0); while (1) { } }'
    expect(
      analyse(code, BEZ_PLYTKI).filter((item) => item.message.includes('OCIE0')),
    ).toEqual([])
  })

  it('RXCIE bez ISR(USART_RXC_vect) też jest wyłapane', () => {
    const code =
      '#include <avr/io.h>\nint main(void) { UCSRB = (1 << RXEN) | (1 << RXCIE); sei(); while (1) { } }'
    const found = analyse(code, BEZ_PLYTKI).filter((item) => item.message.includes('RXCIE'))
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('USART_RXC_vect')
  })
})

describe('procedura ISR bez włączenia przerwania', () => {
  it('ISR(TIMER0_COMP_vect) bez śladu TIMSK: informacja', () => {
    const code = [
      '#include <avr/io.h>',
      '#include <avr/interrupt.h>',
      'ISR(TIMER0_COMP_vect) { }',
      'int main(void) { sei(); while (1) { } }',
    ].join('\n')
    const found = analyse(code, BEZ_PLYTKI).filter((item) =>
      item.message.includes('nie wykona się ani razu'),
    )
    expect(found).toHaveLength(1)
    expect(found[0].severity).toBe('info')
    expect(found[0].hint).toContain('TIMSK |= (1 << OCIE0)')
  })

  it('zapis liczbowy do TIMSK ucisza regułę (nie umiemy go rozstrzygnąć)', () => {
    const code = [
      '#include <avr/io.h>',
      '#include <avr/interrupt.h>',
      'ISR(TIMER0_COMP_vect) { }',
      'int main(void) { TIMSK = 0x02; sei(); while (1) { } }',
    ].join('\n')
    expect(
      analyse(code, BEZ_PLYTKI).filter((item) => item.message.includes('nie wykona się ani razu')),
    ).toEqual([])
  })

  it('włączenie w INNYM pliku projektu wystarcza — cisza', () => {
    const code = '#include <avr/interrupt.h>\nISR(USART_RXC_vect) { }\n'
    const other = 'void init(void) { UCSRB |= (1 << RXCIE); while (1) { } }'
    expect(
      analyse(code, BEZ_PLYTKI, other).filter((item) =>
        item.message.includes('nie wykona się ani razu'),
      ),
    ).toEqual([])
  })
})

describe('wartość i numer bitu poza rejestrem 8-bitowym', () => {
  it('PORTA = 300 to błąd', () => {
    const code = '#include <avr/io.h>\nint main(void) { DDRA = 0xFF; PORTA = 300; while (1) { } }'
    const found = analyse(code, BEZ_PLYTKI).filter((item) => item.message.includes('8-bitowym'))
    expect(found).toHaveLength(1)
    expect(found[0].severity).toBe('error')
    expect(found[0].message).toContain('PORTA')
  })

  it('TCNT1 = 40000 jest w porządku — licznik TC1 jest 16-bitowy', () => {
    const code = '#include <avr/io.h>\nint main(void) { TCNT1 = 40000; while (1) { } }'
    expect(
      analyse(code, BEZ_PLYTKI).filter((item) => item.message.includes('8-bitowym')),
    ).toEqual([])
  })

  it('PORTB |= (1 << 9): bit poza rejestrem', () => {
    const code =
      '#include <avr/io.h>\nint main(void) { DDRB = 0xFF; PORTB |= (1 << 9); while (1) { } }'
    const found = analyse(code, BEZ_PLYTKI).filter((item) => item.message.includes('nie ma bitu'))
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('bitu 9')
  })

  it('OCR1A = (1 << 14) jest w porządku — rejestr 16-bitowy', () => {
    const code = '#include <avr/io.h>\nint main(void) { OCR1A = (1 << 14); while (1) { } }'
    expect(
      analyse(code, BEZ_PLYTKI).filter((item) => item.message.includes('nie ma bitu')),
    ).toEqual([])
  })
})

describe('main bez żadnej pętli', () => {
  it('program bez pętli dostaje informację o zatrzymaniu', () => {
    const code = '#include <avr/io.h>\nint main(void) { DDRA = 0xFF; PORTA = 0xFF; }'
    const found = analyse(code, BEZ_PLYTKI).filter((item) =>
      item.message.includes('dojdzie do końca'),
    )
    expect(found).toHaveLength(1)
    expect(found[0].severity).toBe('info')
  })

  it('każda pętla — także ze zmienną w warunku — ucisza regułę', () => {
    const code =
      '#include <avr/io.h>\nint main(void) { unsigned char dziala = 1; while (dziala) { } }'
    expect(
      analyse(code, BEZ_PLYTKI).filter((item) => item.message.includes('dojdzie do końca')),
    ).toEqual([])
  })

  it('pętla w innym pliku projektu też wystarcza', () => {
    const code = '#include <avr/io.h>\nint main(void) { petla(); }'
    const other = 'void petla(void) { while (1) { } }'
    expect(
      analyse(code, BEZ_PLYTKI, other).filter((item) => item.message.includes('dojdzie do końca')),
    ).toEqual([])
  })
})

describe('przerwanie zewnętrzne na linii bez przewodu', () => {
  const KOD_INT0 = [
    '#include <avr/io.h>',
    '#include <avr/interrupt.h>',
    'ISR(INT0_vect) { }',
    'int main(void) {',
    '  GICR |= (1 << INT0);',
    '  sei();',
    '  while (1) { }',
    '}',
  ].join('\n')

  it('PD2 bez żyły przy okablowanym porcie D: ostrzeżenie wymienia zajęte linie', () => {
    // Przewody z portu D sa, ale zaden z linii PD2.
    const hardware = context(null, (board) => {
      board.connect({ connector: 'JP19', index: 4 }, { connector: 'JP22', index: 0 }, '#e11d48')
      board.connect({ connector: 'JP19', index: 5 }, { connector: 'JP22', index: 1 }, '#f97316')
    })
    const found = analyse(KOD_INT0, hardware).filter((item) => item.message.includes('INT0'))
    expect(found).toHaveLength(1)
    expect(found[0].severity).toBe('warning')
    expect(found[0].message).toContain('PD2')
    expect(found[0].hint).toContain('PD4, PD5')
  })

  it('żyła z PD2 ucisza regułę', () => {
    const hardware = context(null, (board) => {
      board.connect({ connector: 'JP19', index: 2 }, { connector: 'JP23', index: 0 }, '#e11d48')
    })
    expect(analyse(KOD_INT0, hardware).filter((item) => item.message.includes('INT0'))).toEqual([])
  })

  it('pusta płytka nie dubluje komunikatów: zostaje jedna ogólna informacja', () => {
    const found = analyse(KOD_INT0, context(null))
    const wiring = found.filter((item) => item.source === 'Płytka')
    expect(wiring).toHaveLength(1)
    expect(wiring[0].message).toContain('ani jednego przewodu')
  })

  it('INT2 nasłuchuje na PB2 portu B', () => {
    const code = [
      '#include <avr/io.h>',
      '#include <avr/interrupt.h>',
      'ISR(INT2_vect) { }',
      'int main(void) { GICR |= (1 << INT2); sei(); while (1) { } }',
    ].join('\n')
    const hardware = context(null, (board) => {
      board.connect({ connector: 'JP16', index: 0 }, { connector: 'JP22', index: 0 }, '#e11d48')
    })
    const found = analyse(code, hardware).filter((item) => item.message.includes('INT2'))
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('PB2')
  })

  it('bez wiedzy o połączeniach reguła milczy', () => {
    expect(analyse(KOD_INT0, BEZ_PLYTKI).filter((item) => item.source === 'Płytka')).toEqual([])
  })
})

/**
 * STRAZNIK: zadna z nowych regul nie moze sie odezwac na dolaczonych
 * przykladach uruchamianych z wlasnym zestawem polaczen.
 */
describe('nowe reguły milczą na wszystkich dołączonych przykładach', () => {
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

  const NEW_RULES = [
    /nie ma procedury ISR/,
    /nie wykona się ani razu/,
    /jest rejestrem 8-bitowym/,
    /nie ma bitu/,
    /dojdzie do końca/,
    /Przerwanie INT[012] nasłuchuje/,
  ]

  const matchesNewRule = (item: Diagnostic) => NEW_RULES.some((rule) => rule.test(item.message))

  for (const exercise of EXERCISES) {
    it(`${exercise.preset} — cisza`, () => {
      const hardware = context(exercise.preset)
      const complaints: string[] = []
      for (const name of exercise.sources) {
        const others = exercise.sources
          .filter((other) => other !== name)
          .map((other) => readFileSync(join(SOURCE_DIR, other), 'utf8'))
          .join('\n')
        const source = readFileSync(join(SOURCE_DIR, name), 'utf8')
        for (const item of analyse(source, hardware, others).filter(matchesNewRule)) {
          complaints.push(`${name} l.${item.line}: ${item.message}`)
        }
      }
      expect(complaints).toEqual([])
    })
  }

  it('pusty projekt startowy — cisza', () => {
    const files = readdirSync(START_DIR).filter((name) => name.endsWith('.c'))
    expect(files.length).toBeGreaterThan(0)
    for (const name of files) {
      const source = readFileSync(join(START_DIR, name), 'utf8')
      const found = analyse(source, context('start')).filter(matchesNewRule)
      expect(found.map((item) => item.message)).toEqual([])
    }
  })
})
