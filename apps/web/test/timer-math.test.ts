/**
 * Kalkulator timerow: matematyka i generator kodu.
 *
 * Wartosci wzorcowe policzone z definicji (czas = tykniecia x preskaler / F_CPU)
 * dla konfiguracji uzywanych na cwiczeniach. Osobny straznik przepuszcza
 * WSZYSTKIE warianty wygenerowanego kodu przez te sama analize, ktora pilnuje
 * przykladow - narzedzie podpowiadajace kod nie moze podpowiadac kodu,
 * do ktorego samo mialoby zastrzezenia.
 */

import { describe, expect, it } from 'vitest'
import {
  TIMERS,
  formatSeconds,
  generateCode,
  generateDividedCode,
  solve,
  solveDivided,
  type ModeId,
  type TimerOption,
} from '../src/kalkulator/timer-math'
import { analyse, type HardwareContext } from '../src/ide/diagnostics'
import { stripComments } from '../src/ide/strip-comments'

const MHZ = 1_000_000

function byMode(options: TimerOption[], mode: ModeId) {
  return options.filter((option) => option.mode === mode)
}

describe('dobór konfiguracji z czasu', () => {
  it('1 ms na TC0 przy 1 MHz: trafia dokładnie CTC z preskalerem 8 i OCR0 = 124', () => {
    const options = solve({
      fCpu: MHZ,
      timer: TIMERS.TC0,
      targetSeconds: 0.001,
      mode: null,
      prescaler: null,
      countValue: null,
    })
    const best = options[0]
    expect(best.mode).toBe('ctc')
    expect(best.prescaler).toBe(8)
    expect(best.value).toBe(124)
    expect(best.exact).toBe(true)
    expect(best.seconds).toBeCloseTo(0.001, 12)

    // Przeladowanie o tym samym preskalerze tez trafia: start = 256 - 125.
    const preload = byMode(options, 'preload').find((option) => option.prescaler === 8)
    expect(preload?.value).toBe(131)
    expect(preload?.exact).toBe(true)
  })

  it('1 s na TC1 przy 1 MHz: dokładnie preskaler 64 i OCR1A = 15624', () => {
    const options = solve({
      fCpu: MHZ,
      timer: TIMERS.TC1,
      targetSeconds: 1,
      mode: 'ctc',
      prescaler: null,
      countValue: null,
    })
    expect(options[0]).toMatchObject({ prescaler: 64, value: 15624, exact: true })
    // Preskaler 8 wymagalby 125000 tykniec - poza zakresem, wiec go NIE MA.
    expect(options.some((option) => option.prescaler === 8)).toBe(false)
    // Preskaler 1024 nie trafia idealnie - blad ma byc maly i JAWNY.
    const rough = options.find((option) => option.prescaler === 1024)
    expect(rough?.exact).toBe(false)
    expect(Math.abs(rough!.errorPercent)).toBeLessThan(0.05)
  })

  it('czas poza zakresem licznika nie daje żadnych wierszy (zamiast przyciętych)', () => {
    const options = solve({
      fCpu: MHZ,
      timer: TIMERS.TC0,
      targetSeconds: 10,
      mode: 'ctc',
      prescaler: null,
      countValue: null,
    })
    expect(options).toEqual([])
  })

  it('zablokowany preskaler ogranicza listę do niego', () => {
    const options = solve({
      fCpu: MHZ,
      timer: TIMERS.TC0,
      targetSeconds: 0.001,
      mode: null,
      prescaler: 8,
      countValue: null,
    })
    expect(options.length).toBeGreaterThan(0)
    expect(options.every((option) => option.prescaler === 8)).toBe(true)
  })

  it('TC2 zna preskalery 32 i 128, których TC0 nie ma', () => {
    expect(TIMERS.TC2.prescalers).toContain(32)
    expect(TIMERS.TC2.prescalers).toContain(128)
    expect(TIMERS.TC0.prescalers).not.toContain(32)
  })
})

describe('dobór w drugą stronę: z wpisanej wartości rejestru', () => {
  it('OCR0 = 25 przy preskalerze 1024 daje 26,624 ms', () => {
    const options = solve({
      fCpu: MHZ,
      timer: TIMERS.TC0,
      targetSeconds: null,
      mode: 'ctc',
      prescaler: 1024,
      countValue: 25,
    })
    expect(options).toHaveLength(1)
    expect(options[0].ticks).toBe(26)
    expect(options[0].seconds).toBeCloseTo(0.026624, 9)
  })

  it('wartość ponad zakres licznika odpada', () => {
    const options = solve({
      fCpu: MHZ,
      timer: TIMERS.TC0,
      targetSeconds: null,
      mode: 'ctc',
      prescaler: null,
      countValue: 300,
    })
    expect(options).toEqual([])
  })

  it('wpisana wartość plus czas: kalkulator wskazuje preskaler, który trafia', () => {
    const options = solve({
      fCpu: MHZ,
      timer: TIMERS.TC0,
      targetSeconds: 0.001,
      mode: 'ctc',
      prescaler: null,
      countValue: 124,
    })
    expect(options[0]).toMatchObject({ prescaler: 8, exact: true })
  })
})

describe('format czasu', () => {
  it('dobiera jednostkę do rzędu wielkości', () => {
    expect(formatSeconds(1.5)).toBe('1,5 s')
    expect(formatSeconds(0.001)).toBe('1 ms')
    expect(formatSeconds(0.0000125)).toBe('12,5 µs')
  })
})

describe('generator kodu', () => {
  const ms1: TimerOption = {
    timer: 'TC0',
    mode: 'ctc',
    prescaler: 8,
    value: 124,
    ticks: 125,
    seconds: 0.001,
    errorPercent: 0,
    exact: true,
  }

  it('CTC z pętlą: konfiguracja, OCR i kasowanie flagi zapisem jedynki', () => {
    const code = generateCode(ms1, 'polling', true, MHZ)
    expect(code).toContain('TCCR0 = (1 << WGM01) | (1 << CS01);')
    expect(code).toContain('OCR0 = 124;')
    expect(code).toContain('while (!(TIFR & (1 << OCF0)))')
    expect(code).toContain('TIFR = (1 << OCF0);')
    expect(code).toContain('1 ms')
  })

  it('wariant bez komentarzy nie zawiera ani jednego komentarza', () => {
    const code = generateCode(ms1, 'interrupt', false, MHZ)
    expect(code).not.toContain('//')
    expect(code).not.toContain('/*')
    expect(stripComments(code).removedComments).toBe(0)
  })

  it('wariant z przerwaniem dokłada ISR, TIMSK i sei()', () => {
    const code = generateCode(ms1, 'interrupt', true, MHZ)
    expect(code).toContain('#include <avr/interrupt.h>')
    expect(code).toContain('ISR(TIMER0_COMP_vect)')
    expect(code).toContain('TIMSK |= (1 << OCIE0);')
    expect(code).toContain('sei();')
  })

  it('przeładowanie wraca do TCNT po każdym obiegu - w obu stylach', () => {
    const preload: TimerOption = { ...ms1, mode: 'preload', value: 131 }
    const polling = generateCode(preload, 'polling', true, MHZ)
    expect(polling).toContain('TCNT0 = 131;')
    expect(polling.indexOf('TCNT0 = 131;')).not.toBe(polling.lastIndexOf('TCNT0 = 131;'))
    const interrupt = generateCode(preload, 'interrupt', true, MHZ)
    expect(interrupt).toContain('ISR(TIMER0_OVF_vect)')
    expect(interrupt).toContain('TIMSK |= (1 << TOIE0);')
  })

  it('TC1 używa TCCR1B/WGM12/OCR1A, a TC2 składa preskaler 32 z CS21|CS20', () => {
    const tc1: TimerOption = {
      timer: 'TC1', mode: 'ctc', prescaler: 64, value: 15624,
      ticks: 15625, seconds: 1, errorPercent: 0, exact: true,
    }
    const code1 = generateCode(tc1, 'polling', true, MHZ)
    expect(code1).toContain('TCCR1B = (1 << WGM12) | (1 << CS11) | (1 << CS10);')
    expect(code1).toContain('OCR1A = 15624;')

    const tc2: TimerOption = {
      timer: 'TC2', mode: 'ctc', prescaler: 32, value: 249,
      ticks: 250, seconds: 0.008, errorPercent: 0, exact: true,
    }
    const code2 = generateCode(tc2, 'polling', true, MHZ)
    expect(code2).toContain('TCCR2 = (1 << WGM21) | (1 << CS21) | (1 << CS20);')
  })
})

describe('wygenerowany kod przechodzi własną analizę bez zastrzeżeń', () => {
  const hardware: HardwareContext = {
    clockHz: MHZ,
    jtagEnabled: false,
    jumpers: { JP3: false, JP4: true, JP25: false },
  }

  const samples: TimerOption[] = [
    { timer: 'TC0', mode: 'ctc', prescaler: 8, value: 124, ticks: 125, seconds: 0.001, errorPercent: 0, exact: true },
    { timer: 'TC0', mode: 'preload', prescaler: 1024, value: 6, ticks: 250, seconds: 0.256, errorPercent: 0, exact: true },
    { timer: 'TC0', mode: 'overflow', prescaler: 64, value: null, ticks: 256, seconds: 0.016384, errorPercent: 0, exact: true },
    { timer: 'TC1', mode: 'ctc', prescaler: 64, value: 15624, ticks: 15625, seconds: 1, errorPercent: 0, exact: true },
    { timer: 'TC2', mode: 'ctc', prescaler: 128, value: 77, ticks: 78, seconds: 0.009984, errorPercent: 0, exact: true },
  ]

  for (const option of samples) {
    for (const style of ['polling', 'interrupt'] as const) {
      for (const comments of [true, false]) {
        it(`${option.timer}/${option.mode}/${style}${comments ? '' : ' bez komentarzy'}`, () => {
          const code = generateCode(option, style, comments, MHZ)
          const found = analyse(code, hardware).filter(
            (item) => item.severity !== 'info',
          )
          expect(found.map((item) => `l.${item.line}: ${item.message}`)).toEqual([])
        })
      }
    }
  }
})

describe('podział programowy (zmienna globalna zlicza zdarzenia)', () => {
  it('scenariusz z ćwiczeń: 1 s na TC0 przy preskalerze 256 i 4 MHz — 125 × 8 ms', () => {
    const divided = solveDivided({
      fCpu: 4 * MHZ,
      timer: TIMERS.TC0,
      targetSeconds: 1,
      mode: null,
      prescaler: 256,
      countValue: null,
    })
    // 4 MHz / 256 = 15625 tyknięć na sekundę = 125 zdarzeń × 125 tyknięć.
    expect(divided).not.toBeNull()
    expect(divided!.exact).toBe(true)
    expect(divided!.base.ticks * divided!.repeats).toBe(15625)
    expect(divided!.base.mode).toBe('ctc')
    expect(divided!.totalSeconds).toBeCloseTo(1, 12)
    // Preferujemy najrzadsze przerwania: najdłuższe zdarzenie bazowe.
    expect(divided!.base.ticks).toBe(125)
    expect(divided!.repeats).toBe(125)
  })

  it('milczy, gdy czas MIEŚCI SIĘ w liczniku — wtedy byłby szumem', () => {
    expect(
      solveDivided({
        fCpu: MHZ,
        timer: TIMERS.TC0,
        targetSeconds: 0.001,
        mode: null,
        prescaler: null,
        countValue: null,
      }),
    ).toBeNull()
    // 1 s mieści się w TC1 przy dużym preskalerze - też cisza.
    expect(
      solveDivided({
        fCpu: MHZ,
        timer: TIMERS.TC1,
        targetSeconds: 1,
        mode: null,
        prescaler: null,
        countValue: null,
      }),
    ).toBeNull()
  })

  it('milczy, gdy użytkownik wpisał już wartość rejestru', () => {
    expect(
      solveDivided({
        fCpu: 4 * MHZ,
        timer: TIMERS.TC0,
        targetSeconds: 1,
        mode: null,
        prescaler: 256,
        countValue: 124,
      }),
    ).toBeNull()
  })

  it('tryb Normal (pełny obieg): klasyczne liczenie przepełnień', () => {
    const divided = solveDivided({
      fCpu: MHZ,
      timer: TIMERS.TC0,
      targetSeconds: 1,
      mode: 'overflow',
      prescaler: 1024,
      countValue: null,
    })
    expect(divided).not.toBeNull()
    expect(divided!.base.mode).toBe('overflow')
    expect(divided!.base.ticks).toBe(256)
    // 1 s / 0,262144 s = 3,81... → 4 przepełnienia, błąd jawny.
    expect(divided!.repeats).toBe(4)
    expect(divided!.exact).toBe(false)
  })

  it('kod z przerwaniem: volatile licznik, próg powtórzeń i zerowanie', () => {
    const divided = solveDivided({
      fCpu: 4 * MHZ,
      timer: TIMERS.TC0,
      targetSeconds: 1,
      mode: null,
      prescaler: 256,
      countValue: null,
    })!
    const code = generateDividedCode(divided, 'interrupt', true, 4 * MHZ)
    expect(code).toContain('volatile uint8_t odliczone = 0;')
    expect(code).toContain('if (odliczone >= 125)')
    expect(code).toContain('odliczone = 0;')
    expect(code).toContain('ISR(TIMER0_COMP_vect)')

    const polling = generateDividedCode(divided, 'polling', true, 4 * MHZ)
    expect(polling).toContain('timer0_czekaj_calosc')
    expect(polling).toContain('for (uint8_t i = 0; i < 125; i++)')
  })

  it('ponad 255 powtórzeń przechodzi na uint16_t', () => {
    const divided = solveDivided({
      fCpu: 8 * MHZ,
      timer: TIMERS.TC0,
      targetSeconds: 10,
      mode: null,
      prescaler: 64,
      countValue: null,
    })!
    expect(divided.repeats).toBeGreaterThan(255)
    const code = generateDividedCode(divided, 'interrupt', true, 8 * MHZ)
    expect(code).toContain('volatile uint16_t odliczone')
  })

  it('wygenerowany kod podziału przechodzi własną analizę bez zastrzeżeń', () => {
    const hardware: HardwareContext = {
      clockHz: 4 * MHZ,
      jtagEnabled: false,
      jumpers: { JP3: false, JP4: true, JP25: false },
    }
    const cases = [
      solveDivided({ fCpu: 4 * MHZ, timer: TIMERS.TC0, targetSeconds: 1, mode: null, prescaler: 256, countValue: null })!,
      solveDivided({ fCpu: MHZ, timer: TIMERS.TC0, targetSeconds: 1, mode: 'overflow', prescaler: 1024, countValue: null })!,
      solveDivided({ fCpu: MHZ, timer: TIMERS.TC2, targetSeconds: 2, mode: 'preload', prescaler: null, countValue: null })!,
    ]
    for (const divided of cases) {
      for (const style of ['polling', 'interrupt'] as const) {
        for (const comments of [true, false]) {
          const code = generateDividedCode(divided, style, comments, 4 * MHZ)
          const found = analyse(code, hardware).filter((item) => item.severity !== 'info')
          expect(found.map((item) => `${style}: l.${item.line} ${item.message}`)).toEqual([])
        }
      }
    }
  })
})
