import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { stripComments } from '../src/ide/strip-comments'
import { analyse } from '../src/ide/diagnostics'

/**
 * Podglad „bez komentarzy" ma dawac kod, ktory NADAL SIE KOMPILUJE.
 * Dlatego skaner musi znac napisy - inaczej `printf("// tak")` rozjechalby sie
 * w polowie, a student wkleilby do Microchip Studio plik nie do zbudowania.
 */

describe('usuwanie komentarzy z kodu C', () => {
  it('usuwa komentarz na koncu linii i zostawia sam kod', () => {
    const result = stripComments('PORTA = 0xFF;   // zapal wszystkie diody\n')
    expect(result.code).toBe('PORTA = 0xFF;\n')
    expect(result.removedComments).toBe(1)
  })

  it('kasuje cala linie, jesli byla samym komentarzem', () => {
    const result = stripComments('// opis\nint a = 1;\n')
    expect(result.code).toBe('int a = 1;\n')
    expect(result.removedLines).toBe(1)
  })

  it('NIE rusza dwoch ukosnikow w napisie', () => {
    const code = 'printf("// to nie komentarz");\n'
    expect(stripComments(code).code).toBe(code)
    expect(stripComments(code).removedComments).toBe(0)
  })

  it('NIE rusza otwarcia komentarza blokowego w napisie', () => {
    const code = 'const char *s = "/* nadal napis */";\n'
    expect(stripComments(code).code).toBe(code)
  })

  it('radzi sobie z cudzyslowem chronionym ukosnikiem wstecznym', () => {
    const code = 'printf("cudzyslow: \\" // nie komentarz");\n'
    expect(stripComments(code).code).toBe(code)
  })

  it('nie myli sie na stalej znakowej z apostrofem', () => {
    const code = "if (c == '\\'') PORTA = 1;\n"
    expect(stripComments(code).code).toBe(code)
  })

  it('usuwa komentarz blokowy rozciagniety na kilka linii', () => {
    const result = stripComments('/*\n * naglowek\n */\nint main(void)\n{\n}\n')
    expect(result.code).toBe('int main(void)\n{\n}\n')
    expect(result.removedComments).toBe(1)
  })

  it('zostawia spacje tam, gdzie komentarz rozdzielal kod', () => {
    expect(stripComments('f(a /* uwaga */, b);\n').code).toBe('f(a , b);\n')
    expect(stripComments('int/* typ */x;\n').code).toBe('int x;\n')
  })

  it('idzie za komentarzem przedluzonym ukosnikiem wstecznym', () => {
    const result = stripComments('int a; // ciag dalszy \\\nnadal komentarz\nint b;\n')
    expect(result.code).toBe('int a;\nint b;\n')
  })

  it('zbija ciag pustych linii do jednej i przycina koncowki', () => {
    const result = stripComments('\n// a\n\n// b\n\nint x;\n\n\n')
    expect(result.code).toBe('int x;\n')
  })

  it('nie rusza dyrektyw preprocesora', () => {
    const code = '#define F_CPU 1000000UL   // zegar\n#include <avr/io.h>\n'
    expect(stripComments(code).code).toBe('#define F_CPU 1000000UL\n#include <avr/io.h>\n')
  })

  it('z pliku zlozonego z samych komentarzy zostaje pustka, nie smieci', () => {
    expect(stripComments('// tylko opis\n/* i jeszcze jeden */\n').code).toBe('')
  })
})

describe('usuwanie komentarzy z kodu w Pythonie', () => {
  it('usuwa komentarz po kratce', () => {
    expect(stripComments('x = 1  # licznik ramek\n', 'python').code).toBe('x = 1\n')
  })

  it('NIE rusza kratki w napisie', () => {
    const code = 'print("# to nie komentarz")\n'
    expect(stripComments(code, 'python').code).toBe(code)
  })

  it('zostawia napis potrojny - to napis, nie komentarz', () => {
    const code = 'def f():\n    """Opis funkcji # z kratka."""\n    return 1\n'
    expect(stripComments(code, 'python').code).toBe(code)
  })
})

/**
 * Straznik na PRAWDZIWYCH plikach: kod pozbawiony komentarzy przepuszczamy przez
 * te sama analize skladni, ktora pilnuje dolaczonych przykladow. Gdyby skaner
 * zjadl nawias albo srednik, analiza natychmiast to zglosi.
 *
 * To jedyny sensowny sprawdzian tej funkcji: wynik ma sie NADAL KOMPILOWAC,
 * bo po to sie go kopiuje.
 */
describe('przyklady dolaczone do aplikacji przezywaja usuniecie komentarzy', () => {
  const dirs = [
    fileURLToPath(new URL('../src/examples/src/', import.meta.url)),
    fileURLToPath(new URL('../src/examples/start/', import.meta.url)),
  ]
  const files = dirs.flatMap((dir) =>
    readdirSync(dir)
      .filter((name) => name.endsWith('.c') || name.endsWith('.h'))
      .map((name) => ({ name, content: readFileSync(join(dir, name), 'utf8') })),
  )
  const hardware = {
    clockHz: 1_000_000,
    jtagEnabled: false,
    jumpers: { JP3: false, JP4: true, JP25: false },
  }

  it('znajduje pliki do sprawdzenia', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  for (const file of files) {
    it(`${file.name} — kod bez komentarzy przechodzi analize skladni`, () => {
      const clean = stripComments(file.content).code
      const others = files
        .filter((item) => item.name !== file.name)
        .map((item) => item.content)
        .join('\n')
      const found = analyse(clean, hardware, others).filter(
        (item) => item.severity === 'error' || item.source === 'C',
      )
      expect(found.map((item) => `l.${item.line}: ${item.message}`)).toEqual([])
    })

    it(`${file.name} — drugie przejscie nie ma juz czego usunac`, () => {
      const clean = stripComments(file.content).code
      expect(stripComments(clean).code).toBe(clean)
      expect(clean.length).toBeLessThan(file.content.length)
    })
  }
})
