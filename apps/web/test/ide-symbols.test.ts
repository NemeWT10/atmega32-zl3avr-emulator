import { describe, expect, it } from 'vitest'
import {
  findLocalSymbol,
  functionScopeAt,
  parseSymbols,
  setProjectSources,
} from '../src/ide/monaco-avr'

/**
 * Dymki i „przejdz do definicji" opieraja sie na jednym rozpoznawaniu nazw.
 * Testy pilnuja trzech rzeczy, ktore latwo popsuc:
 *   - ARGUMENT funkcji tez jest nazwa, ktora da sie wskazac (wczesniej nie byl),
 *   - nazwa z wezszego zasiegu PRZESLANIA szersza,
 *   - kolumna wskazuje sama nazwe, a nie poczatek linii.
 */

const KIEROWNIK = `#include <avr/io.h>

#define LICZBA_DIOD 8

uint8_t stan_diod = 0;

void zapal(uint8_t numer, uint8_t jasnosc)
{
    uint8_t maska = (1 << numer);
    PORTA |= maska;
    stan_diod |= maska;
}

int main(void)
{
    DDRA = 0xFF;
    for (uint8_t i = 0; i < LICZBA_DIOD; i++)
    {
        zapal(i, 255);
    }
    while (1)
    {
    }
}
`

describe('rozpoznawanie nazw z kodu', () => {
  const symbols = parseSymbols(KIEROWNIK)
  const byName = (name: string) => symbols.find((item) => item.name === name)

  it('znajduje stala, zmienna globalna i obie funkcje', () => {
    expect(byName('LICZBA_DIOD')?.kind).toBe('macro')
    expect(byName('stan_diod')?.kind).toBe('variable')
    expect(byName('zapal')?.kind).toBe('function')
    expect(byName('main')?.kind).toBe('function')
  })

  it('wskazuje kolumne samej nazwy, nie poczatku linii', () => {
    const zapal = byName('zapal')!
    const line = KIEROWNIK.split('\n')[zapal.line - 1]
    expect(line.slice(zapal.column - 1, zapal.column - 1 + 'zapal'.length)).toBe('zapal')
  })

  it('znajduje zmienna sterujaca petli', () => {
    expect(byName('i')?.kind).toBe('variable')
  })

  it('nie bierze slow kluczowych za deklaracje', () => {
    for (const keyword of ['while', 'for', 'if', 'return']) {
      expect(byName(keyword)).toBeUndefined()
    }
  })
})

describe('zasieg funkcji', () => {
  it('podaje argumenty funkcji, w ktorej stoi kursor', () => {
    const scope = functionScopeAt(KIEROWNIK, 10)
    expect(scope?.name).toBe('zapal')
    expect(scope?.params.map((item) => item.name)).toEqual(['numer', 'jasnosc'])
  })

  it('nie przypisuje argumentow sasiedniej funkcji', () => {
    const scope = functionScopeAt(KIEROWNIK, 18)
    expect(scope?.name).toBe('main')
    expect(scope?.params).toEqual([])
  })

  it('poza cialem funkcji nie ma zadnego zasiegu', () => {
    expect(functionScopeAt(KIEROWNIK, 3)).toBeNull()
  })

  it('rozpoznaje wskaznik jako argument', () => {
    const code = 'void pisz(volatile uint8_t *port, const char *tekst)\n{\n    *port = 1;\n}\n'
    const scope = functionScopeAt(code, 3)
    expect(scope?.params.map((item) => item.name)).toEqual(['port', 'tekst'])
  })

  it('argument bez nazwy nie udaje, ze ja ma', () => {
    const code = 'void f(uint8_t)\n{\n}\n'
    expect(functionScopeAt(code, 2)?.params).toEqual([])
  })

  it('klamra w napisie nie przesuwa konca funkcji', () => {
    const code = [
      'void pierwsza(uint8_t a)',
      '{',
      '    lcd_pisz("}");',
      '}',
      '',
      'void druga(uint8_t b)',
      '{',
      '}',
      '',
    ].join('\n')
    expect(functionScopeAt(code, 3)?.name).toBe('pierwsza')
    expect(functionScopeAt(code, 7)?.name).toBe('druga')
  })

  it('klamra w komentarzu tez nie przesuwa konca funkcji', () => {
    const code = ['void pierwsza(void)', '{', '    // koniec: }', '}', 'int x;', ''].join('\n')
    expect(functionScopeAt(code, 3)?.name).toBe('pierwsza')
    expect(functionScopeAt(code, 5)).toBeNull()
  })
})

describe('szukanie nazwy pod kursorem', () => {
  it('argument funkcji jest rozpoznawany — to on gryzl najczesciej', () => {
    const found = findLocalSymbol(KIEROWNIK, 'main.c', 10, 'numer')
    expect(found?.kind).toBe('parameter')
    expect(found?.owner).toBe('zapal')
    expect(found?.signature).toBe('uint8_t numer')
  })

  it('zmienna lokalna wygrywa z globalna o tej samej nazwie', () => {
    const code = [
      'uint8_t licznik = 0;',
      '',
      'void f(void)',
      '{',
      '    uint8_t licznik = 5;',
      '    licznik++;',
      '}',
      '',
    ].join('\n')
    expect(findLocalSymbol(code, 'main.c', 6, 'licznik')?.line).toBe(5)
    // Poza funkcja widoczna jest juz ta globalna.
    expect(findLocalSymbol(code, 'main.c', 1, 'licznik')?.line).toBe(1)
  })

  it('argument przeslania zmienna globalna o tej samej nazwie', () => {
    const code = ['uint8_t port = 0;', '', 'void f(uint8_t port)', '{', '    port++;', '}', ''].join(
      '\n',
    )
    expect(findLocalSymbol(code, 'main.c', 5, 'port')?.kind).toBe('parameter')
  })

  it('siega po funkcje zadeklarowana w innym pliku projektu', () => {
    setProjectSources(() => [
      { path: 'main.c', content: 'int main(void)\n{\n    klawiatura_start(2);\n}\n' },
      {
        path: 'klawiatura.c',
        content: '#include <avr/io.h>\n\nvoid klawiatura_start(uint8_t port)\n{\n}\n',
      },
    ])
    const found = findLocalSymbol(
      'int main(void)\n{\n    klawiatura_start(2);\n}\n',
      'main.c',
      3,
      'klawiatura_start',
    )
    expect(found?.file).toBe('klawiatura.c')
    expect(found?.line).toBe(3)
    setProjectSources(() => [])
  })

  it('nieznana nazwa nie wymysla definicji', () => {
    expect(findLocalSymbol(KIEROWNIK, 'main.c', 10, 'czegos_takiego_nie_ma')).toBeNull()
  })
})
