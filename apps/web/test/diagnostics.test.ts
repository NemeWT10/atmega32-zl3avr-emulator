/**
 * Testy analizy kodu.
 *
 * Dwie rzeczy sa tu rownie wazne:
 *   - czy wykrywamy bledy, ktore student naprawde popelnia,
 *   - czy NIE ZGLASZAMY nic przy poprawnym kodzie. Falszywy alarm uczy
 *     ignorowania komunikatow i jest gorszy niz brak ostrzezenia.
 */

import { describe, expect, it } from 'vitest'
import { analyse, type HardwareContext } from '../src/ide/diagnostics'

const FABRYCZNA_PLYTKA: HardwareContext = {
  clockHz: 1_000_000,
  jtagEnabled: true,
  jumpers: { JP3: false, JP4: false, JP25: false },
}

const PLYTKA_4MHZ_BEZ_JTAG: HardwareContext = {
  clockHz: 4_000_000,
  jtagEnabled: false,
  jumpers: { JP3: false, JP4: true, JP25: false },
}

const messages = (code: string, hardware = FABRYCZNA_PLYTKA) =>
  analyse(code, hardware).map((item) => item.message)

describe('poprawny kod nie wywołuje alarmów', () => {
  it('typowy program z opóźnieniem przechodzi bez uwag', () => {
    const code = [
      '#define F_CPU 1000000UL',
      '#include <avr/io.h>',
      '#include <util/delay.h>',
      '',
      'int main(void)',
      '{',
      '    DDRD = 0xFF;',
      '    while (1)',
      '    {',
      '        PORTD ^= 0xFF;',
      '        _delay_ms(500);',
      '    }',
      '}',
    ].join('\n')
    expect(analyse(code, FABRYCZNA_PLYTKA)).toEqual([])
  })

  it('program z przerwaniem i poprawnym kasowaniem flagi przechodzi bez uwag', () => {
    const code = [
      '#define F_CPU 1000000UL',
      '#include <avr/io.h>',
      '#include <avr/interrupt.h>',
      '',
      'ISR(TIMER1_COMPA_vect)',
      '{',
      '    PORTD ^= 0xFF;',
      '}',
      '',
      'int main(void)',
      '{',
      '    DDRD = 0xFF;',
      '    TIMSK |= (1 << OCIE1A);',
      '    TIFR = (1 << OCF1A);',
      '    sei();',
      '    while (1) { }',
      '}',
    ].join('\n')
    expect(analyse(code, FABRYCZNA_PLYTKA)).toEqual([])
  })
})

describe('błędy składniowe języka C', () => {
  it('wykrywa niedomkniętą klamrę i wskazuje miejsce jej otwarcia', () => {
    const code = 'int main(void)\n{\n    return 0;\n'
    // Miniprogram nie ma tez zadnej petli, wiec obok bledu klamry pojawia sie
    // informacja o zatrzymaniu programu - szukamy wiec po tresci, nie po indeksie.
    const found = analyse(code, FABRYCZNA_PLYTKA).filter((item) => item.source === 'C')
    expect(found).toHaveLength(1)
    expect(found[0].line).toBe(2)
    expect(found[0].message).toContain('nie został zamknięty')
  })

  it('wykrywa przypisanie zamiast porównania w warunku', () => {
    const code = '#include <avr/io.h>\nint main(void) {\n  int x = 0;\n  if (x = 1) { }\n  return 0;\n}'
    expect(messages(code).join(' ')).toContain('przypisanie „=”')
  })

  it('wykrywa średnik tworzący pustą instrukcję po if', () => {
    const code = '#include <avr/io.h>\nint main(void) {\n  if (PIND == 0);\n  return 0;\n}'
    expect(messages(code).join(' ')).toContain('pustą instrukcję')
  })
})

describe('semantyka rejestrów AVR', () => {
  it('rozpoznaje rejestr z innego układu i podaje odpowiednik', () => {
    const code = '#include <avr/io.h>\nint main(void) { TIMSK0 = 0; return 0; }'
    const found = analyse(code, FABRYCZNA_PLYTKA).find((item) =>
      item.message.includes('TIMSK0'),
    )
    expect(found?.message).toContain('ATmega32 nie ma rejestru TIMSK0')
    expect(found?.hint).toContain('TIMSK')
  })

  it('wyłapuje próbę skasowania flagi przez wyzerowanie bitu', () => {
    const code = '#include <avr/io.h>\nint main(void) { TIFR &= ~(1 << OCF0); return 0; }'
    const found = analyse(code, FABRYCZNA_PLYTKA).find((item) =>
      item.message.includes('flagi'),
    )
    expect(found?.message).toContain('nie skasujesz flagi')
    expect(found?.hint).toContain('ZAPISEM JEDYNKI')
  })

  it('wyłapuje zapis do UCSRC bez bitu URSEL', () => {
    const code = '#include <avr/io.h>\nint main(void) { UCSRC = (1 << UCSZ1); return 0; }'
    expect(messages(code).join(' ')).toContain('bez bitu URSEL')
  })

  it('wyłapuje zapis do PORTx bez ustawienia kierunku', () => {
    const code = '#include <avr/io.h>\nint main(void) { PORTB = 0xFF; return 0; }'
    expect(messages(code).join(' ')).toContain('nigdzie nie ustawia kierunku DDRB')
  })

  it('wyłapuje odczyt wejść z PORTx zamiast z PINx', () => {
    const code = '#include <avr/io.h>\nint main(void) { DDRA = 0; if (PORTA & 1) { } return 0; }'
    expect(messages(code).join(' ')).toContain('czyta się z PINA')
  })

  it('wyłapuje brak nagłówka przy użyciu opóźnienia', () => {
    const code = '#include <avr/io.h>\nint main(void) { _delay_ms(10); return 0; }'
    expect(messages(code).join(' ')).toContain('bez włączenia nagłówka')
  })

  it('wyłapuje przerwanie bez globalnego zezwolenia', () => {
    const code = [
      '#include <avr/io.h>',
      '#include <avr/interrupt.h>',
      'ISR(TIMER0_OVF_vect) { }',
      'int main(void) { DDRD = 0xFF; PORTD = 0; while (1) { } }',
    ].join('\n')
    expect(messages(code).join(' ')).toContain('nie ma wywołania sei()')
  })

  it('wyłapuje wartość OCR0 poza zakresem rejestru ośmiobitowego', () => {
    const code = '#include <avr/io.h>\nint main(void) { OCR0 = 3905; return 0; }'
    expect(messages(code).join(' ')).toContain('się w nim nie zmieści')
  })
})

describe('ostrzeżenia zależne od stanu płytki', () => {
  it('zgłasza rozjazd F_CPU z zegarem ustawionym w fuse bitach', () => {
    const code = [
      '#define F_CPU 4000000UL',
      '#include <avr/io.h>',
      '#include <util/delay.h>',
      'int main(void) { DDRD = 0xFF; PORTD = 0; _delay_ms(100); while (1) { } }',
    ].join('\n')
    const found = analyse(code, FABRYCZNA_PLYTKA).filter((item) => item.source === 'Płytka')
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('F_CPU mówi 4 MHz')
    expect(found[0].message).toContain('fuse bity ustawiają zegar na 1 MHz')
    expect(found[0].hint).toContain('KRÓTSZE')
  })

  it('milczy, gdy F_CPU zgadza się z fuse bitami', () => {
    const code = [
      '#define F_CPU 4000000UL',
      '#include <avr/io.h>',
      '#include <util/delay.h>',
      'int main(void) { DDRD = 0xFF; PORTD = 0; _delay_ms(100); while (1) { } }',
    ].join('\n')
    expect(analyse(code, PLYTKA_4MHZ_BEZ_JTAG).filter((item) => item.source === 'Płytka')).toEqual([])
  })

  it('ostrzega przed sterowaniem portem C przy włączonym JTAG', () => {
    const code = '#include <avr/io.h>\nint main(void) { DDRC = 0xFF; PORTC = 0xFF; while (1) { } }'
    const found = analyse(code, FABRYCZNA_PLYTKA).filter((item) => item.source === 'Płytka')
    expect(found[0].message).toContain('JTAGEN')
    expect(found[0].message).toContain('PC2, PC3, PC4 i PC5')
  })

  it('milczy o porcie C, gdy fuse JTAGEN jest wyłączony', () => {
    const code = '#include <avr/io.h>\nint main(void) { DDRC = 0xFF; PORTC = 0xFF; while (1) { } }'
    const board = analyse(code, PLYTKA_4MHZ_BEZ_JTAG).filter((item) => item.source === 'Płytka')
    expect(board).toEqual([])
  })

  it('ostrzega przed włączaniem odbioru USART przy rozwartej zworce JP4', () => {
    const code = [
      '#include <avr/io.h>',
      'int main(void) { UCSRB = (1 << RXEN) | (1 << TXEN); while (1) { } }',
    ].join('\n')
    const found = analyse(code, FABRYCZNA_PLYTKA).filter((item) => item.source === 'Płytka')
    expect(found[0].message).toContain('zworka JP4')
    expect(found[0].hint).toContain('nie odbiera ani jednego znaku')
  })

  it('milczy o zworce JP4, gdy jest zwarta', () => {
    const code = '#include <avr/io.h>\nint main(void) { UCSRB = (1 << RXEN); while (1) { } }'
    const found = analyse(code, PLYTKA_4MHZ_BEZ_JTAG).filter((item) => item.message.includes('JP4'))
    expect(found).toEqual([])
  })

  it('ostrzega przed czytaniem wejść bez rezystorów podciągających', () => {
    const code = [
      '#include <avr/io.h>',
      'int main(void) {',
      '  DDRA = 0xF0;',
      '  while (1) { if (PINA & 1) { } }',
      '}',
    ].join('\n')
    expect(messages(code).join(' ')).toContain('nie włącza rezystorów podciągających')
  })

  it('milczy o pull-upach, gdy program je włącza', () => {
    const code = [
      '#include <avr/io.h>',
      'int main(void) {',
      '  DDRA = 0xF0;',
      '  PORTA = 0x0F;',
      '  while (1) { if (PINA & 1) { } }',
      '}',
    ].join('\n')
    expect(messages(code).join(' ')).not.toContain('rezystorów podciągających')
  })

  it('nie zglasza braku DDRx, gdy kierunek ustawia inny plik projektu', () => {
    // Klasyczny uklad z laboratorium: main.c wola sterownik, ktory siedzi obok.
    const main = [
      '#include <avr/io.h>',
      '#include "klawiatura.h"',
      'int main(void) {',
      '  initWyjscie(2);',
      '  while (1) { PORTB = getkey(1, 1); }',
      '}',
    ].join('\n')
    const sterownik = [
      '#include <avr/io.h>',
      'void initWyjscie(uint8_t nr) { DDRB = 0xFF; PORTB = 0x00; }',
    ].join('\n')

    // Sam plik main.c - ostrzezenie jest zasadne, bo nikt nie ustawia kierunku.
    expect(messages(main).join(' ')).toContain('nie ustawia kierunku DDRB')

    // Z pozostalymi plikami projektu ostrzezenie musi zniknac.
    const zProjektem = analyse(main, FABRYCZNA_PLYTKA, sterownik).map((item) => item.message)
    expect(zProjektem.join(' ')).not.toContain('nie ustawia kierunku DDRB')
  })

  it('nie zglasza braku DDRx, gdy sterownik dostaje wskaznik do rejestru', () => {
    const main = [
      '#include <avr/io.h>',
      '#include "wyswietlacz.h"',
      'int main(void) {',
      '  volatile uint8_t *ddr = &DDRB;',
      '  volatile uint8_t *port = &PORTB;',
      '  LCD_init(ddr, port);',
      '  while (1) { }',
      '}',
    ].join('\n')
    const sterownik = 'void LCD_init(volatile uint8_t *ddr, volatile uint8_t *port) { *ddr = 0xFF; }'
    const wynik = analyse(main, FABRYCZNA_PLYTKA, sterownik).map((item) => item.message)
    expect(wynik.join(' ')).not.toContain('nie ustawia kierunku')
  })
})
