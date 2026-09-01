import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { analyse, type Diagnostic } from '../src/ide/diagnostics'

/**
 * Straznik przed FALSZYWYMI ALARMAMI.
 *
 * Kody dolaczone do aplikacji sa poprawne - kompiluja sie prawdziwym avr-gcc
 * i dzialaja na sprzecie. Jesli analiza zglosi w nich blad albo potkniecie
 * skladniowe, to znaczy, ze pomylila sie ONA, nie kod.
 *
 * To nie jest test kosmetyczny. Ostrzezenie pokazane przy poprawnym kodzie uczy
 * studenta ignorowania komunikatow, a wtedy przestaje dzialac cala reszta -
 * lacznie z ostrzezeniami o rozjezdzie F_CPU czy rozwartej zworce, ktore sa
 * najwiekszym atutem tego narzedzia.
 *
 * Ostrzezen z warstwy „Plytka” tu nie sprawdzamy: zaleza od stanu zworek
 * i fuse bitow, a te ustawia dopiero gotowy zestaw polaczen wybranego cwiczenia.
 */

const SOURCE_DIR = fileURLToPath(new URL('../src/examples/src/', import.meta.url))

function projectFiles(): { path: string; content: string }[] {
  return readdirSync(SOURCE_DIR)
    .filter((name) => name.endsWith('.c') || name.endsWith('.h'))
    .map((name) => ({ path: name, content: readFileSync(join(SOURCE_DIR, name), 'utf8') }))
}

function analyseFile(path: string, all: { path: string; content: string }[]): Diagnostic[] {
  const file = all.find((item) => item.path === path)!
  const others = all
    .filter((item) => item.path !== path)
    .map((item) => item.content)
    .join('\n')
  return analyse(
    file.content,
    { clockHz: 1_000_000, jtagEnabled: false, jumpers: { JP3: false, JP4: true, JP25: false } },
    others,
  )
}

describe('analiza kodu nie podwaza dolaczonych przykladow', () => {
  const all = projectFiles()

  it('znajduje pliki przykladow', () => {
    expect(all.length).toBeGreaterThan(10)
  })

  for (const file of all) {
    it(`${file.path} — bez bledow i bez potkniec skladniowych`, () => {
      const found = analyseFile(file.path, all)
      const errors = found.filter((item) => item.severity === 'error')
      const syntax = found.filter((item) => item.source === 'C')
      expect(
        [...errors, ...syntax].map((item) => `l.${item.line}: ${item.message}`),
      ).toEqual([])
    })
  }
})

describe('regula pustej instrukcji po if', () => {
  const hardware = {
    clockHz: 1_000_000,
    jtagEnabled: false,
    jumpers: { JP3: false, JP4: true, JP25: false },
  }

  it('nie rusza warunku z przesunieciem bitowym w tresci', () => {
    const code = '#include <avr/io.h>\nvoid f(uint8_t x) { if (x & 0b0001) PORTB |= (1 << 3); }\n'
    expect(analyse(code, hardware).filter((item) => item.source === 'C')).toEqual([])
  })

  it('nie rusza petli oczekujacej na zdarzenie', () => {
    const code = '#include <avr/io.h>\nvoid f(void) { while (!(UCSRA & (1 << RXC))); }\n'
    expect(analyse(code, hardware).filter((item) => item.source === 'C')).toEqual([])
  })

  it('wylapuje srednik ucinajacy tresc warunku', () => {
    const code = '#include <avr/io.h>\nvoid f(uint8_t x) { if (x > 3); PORTB = 1; }\n'
    const found = analyse(code, hardware).filter((item) => item.source === 'C')
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('wykona się ZAWSZE')
  })
})

describe('nazwy przerwan z innego ukladu', () => {
  const hardware = {
    clockHz: 1_000_000,
    jtagEnabled: false,
    jumpers: { JP3: false, JP4: true, JP25: false },
  }

  it('wskazuje odpowiednik dla TIMER0_COMPA_vect', () => {
    const code = '#include <avr/io.h>\n#include <avr/interrupt.h>\nISR(TIMER0_COMPA_vect) { }\nint main(void){ sei(); while(1); }\n'
    const found = analyse(code, hardware).filter((item) => item.severity === 'error')
    expect(found).toHaveLength(1)
    expect(found[0].hint).toContain('TIMER0_COMP_vect')
  })

  it('nie rusza poprawnej nazwy z ATmega32', () => {
    const code = '#include <avr/io.h>\n#include <avr/interrupt.h>\nISR(TIMER0_COMP_vect) { }\nint main(void){ sei(); while(1); }\n'
    expect(analyse(code, hardware).filter((item) => item.severity === 'error')).toEqual([])
  })

  it('mowi wprost, ze ATmega32 nie ma przerwan PCINT', () => {
    const code = '#include <avr/io.h>\n#include <avr/interrupt.h>\nISR(PCINT0_vect) { }\nint main(void){ sei(); while(1); }\n'
    const found = analyse(code, hardware).filter((item) => item.severity === 'error')
    expect(found[0].hint).toContain('INT0, INT1 i INT2')
  })
})

describe('biblioteki avr-libc', () => {
  const hardware = {
    clockHz: 1_000_000,
    jtagEnabled: false,
    jumpers: { JP3: false, JP4: true, JP25: false },
  }

  it('PROGMEM bez naglowka to blad', () => {
    const code = '#include <avr/io.h>\nconst char tekst[] PROGMEM = "abc";\n'
    const found = analyse(code, hardware).filter((item) => item.severity === 'error')
    expect(found).toHaveLength(1)
    expect(found[0].hint).toContain('avr/pgmspace.h')
  })

  it('PROGMEM z naglowkiem jest w porzadku', () => {
    const code = '#include <avr/io.h>\n#include <avr/pgmspace.h>\nconst char tekst[] PROGMEM = "abc";\n'
    expect(analyse(code, hardware).filter((item) => item.severity === 'error')).toEqual([])
  })

  it('ostrzega przed %f w printf', () => {
    const code = '#include <avr/io.h>\n#include <stdio.h>\nchar b[20];\nvoid f(double x){ sprintf(b, "%f", x); }\n'
    const found = analyse(code, hardware).filter((item) => item.message.includes('zmiennoprzecinkow'))
    expect(found).toHaveLength(1)
  })

  it('nie ostrzega przy zwyklym %d', () => {
    const code = '#include <avr/io.h>\n#include <stdio.h>\nchar b[20];\nvoid f(int x){ sprintf(b, "%d", x); }\n'
    expect(analyse(code, hardware).filter((item) => item.message.includes('zmiennoprzecinkow'))).toEqual([])
  })
})
