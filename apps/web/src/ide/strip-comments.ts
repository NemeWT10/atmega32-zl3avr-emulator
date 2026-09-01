/**
 * Usuwanie komentarzy z kodu - na potrzeby podgladu „bez komentarzy".
 *
 * PO CO TO JEST: pliki w tym narzedziu sa gesto komentowane, bo maja uczyc.
 * Kiedy jednak student chce przeniesc kod do Microchip Studio albo wkleic go
 * do sprawozdania, komentarze zwykle przeszkadzaja - a kasowanie ich recznie
 * to kilkanascie minut klikania i pewnosc, ze cos przy okazji zniknie.
 *
 * DLACZEGO NIE ZWYKLE WYRAZENIE REGULARNE: `printf("// to nie komentarz")`
 * jest napisem, a nie komentarzem, i takie wyrazenie rozjechaloby go w polowie.
 * Dlatego jest tu maly skaner, ktory zna napisy, stale znakowe i znaki ucieczki.
 * Kod ma po tej operacji nadal sie kompilowac - inaczej funkcja przynosi wiecej
 * szkody niz pozytku.
 */

export type CommentLanguage = 'c' | 'python'

export interface StripResult {
  /** Kod bez komentarzy, bez pustych linii po nich i bez spacji na koncach linii. */
  code: string
  /** O ile linii krotszy jest wynik. */
  removedLines: number
  /** Ile komentarzy usunieto (komentarz blokowy liczy sie jako jeden). */
  removedComments: number
}

interface ScanState {
  /** Jestesmy w srodku komentarza blokowego (jezyk C). */
  inBlock: boolean
  /** Otwarty napis potrojny w Pythonie. */
  inTriple: string | null
  /**
   * Komentarz do konca linii zakonczony ukosnikiem wstecznym ciagnie sie
   * na nastepna linie (tak mowi norma C99). Rzadkie, ale pominiecie tego
   * zostawiloby w kodzie sam ogon komentarza.
   */
  lineCommentContinues: boolean
  /**
   * Czy wnetrze napisow ma zostac zastapione spacjami. Potrzebne tam, gdzie
   * liczy sie klamry: `lcd_pisz("}")` przesunaloby koniec funkcji.
   * Dlugosc linii zostaje bez zmian, wiec kolumny nadal sie zgadzaja.
   */
  blankLiterals: boolean
}

const BACKSLASH = '\\'

/**
 * Przepisuje napis albo stala znakowa BEZ ZMIAN, razem z cudzyslowami.
 * Zwraca pozycje pierwszego znaku za napisem.
 */
function readLiteral(
  line: string,
  start: number,
  quote: string,
  blank = false,
): { text: string; end: number } {
  let index = start + 1
  let text = quote
  const keep = (char: string) => (blank && char !== quote ? ' ' : char)
  while (index < line.length) {
    const char = line[index]
    text += keep(char)
    index++
    // Ukosnik wsteczny chroni nastepny znak - takze cudzyslow konczacy napis.
    if (char === BACKSLASH && index < line.length) {
      text += blank ? ' ' : line[index]
      index++
      continue
    }
    if (char === quote) break
  }
  return { text, end: index }
}

function stripLineC(line: string, state: ScanState): { text: string; comments: number } {
  if (state.lineCommentContinues) {
    state.lineCommentContinues = line.endsWith(BACKSLASH)
    return { text: '', comments: 0 }
  }

  let out = ''
  let comments = 0
  let index = 0

  while (index < line.length) {
    if (state.inBlock) {
      const end = line.indexOf('*/', index)
      if (end === -1) return { text: out, comments }
      state.inBlock = false
      index = end + 2
      // Komentarz miedzy dwoma kawalkami kodu zastepujemy pojedyncza spacja -
      // inaczej skleilby oba w jedno slowo.
      if (out !== '' && !/\s$/.test(out) && index < line.length && !/^\s/.test(line[index])) {
        out += ' '
      }
      continue
    }

    const char = line[index]

    if (char === '"' || char === "'") {
      const literal = readLiteral(line, index, char, state.blankLiterals)
      out += literal.text
      index = literal.end
      continue
    }

    if (char === '/' && line[index + 1] === '/') {
      comments++
      state.lineCommentContinues = line.endsWith(BACKSLASH)
      return { text: out, comments }
    }

    if (char === '/' && line[index + 1] === '*') {
      comments++
      state.inBlock = true
      index += 2
      continue
    }

    out += char
    index++
  }

  return { text: out, comments }
}

function stripLinePython(line: string, state: ScanState): { text: string; comments: number } {
  let out = ''
  let comments = 0
  let index = 0

  while (index < line.length) {
    if (state.inTriple) {
      // Napis potrojny (takze opis funkcji) to NAPIS, nie komentarz - zostaje.
      const end = line.indexOf(state.inTriple, index)
      if (end === -1) {
        out += state.blankLiterals ? ' '.repeat(line.length - index) : line.slice(index)
        return { text: out, comments }
      }
      out += state.blankLiterals ? ' '.repeat(end + 3 - index) : line.slice(index, end + 3)
      index = end + 3
      state.inTriple = null
      continue
    }

    const triple = line.startsWith('"""', index)
      ? '"""'
      : line.startsWith("'''", index)
        ? "'''"
        : null
    if (triple) {
      out += triple
      index += 3
      state.inTriple = triple
      continue
    }

    const char = line[index]

    if (char === '"' || char === "'") {
      const literal = readLiteral(line, index, char, state.blankLiterals)
      out += literal.text
      index = literal.end
      continue
    }

    if (char === '#') {
      comments++
      return { text: out, comments }
    }

    out += char
    index++
  }

  return { text: out, comments }
}

/** Jedno przejscie skanera przez caly plik - linia w linie, bez porzadkowania. */
function scan(
  source: string,
  language: CommentLanguage,
  blankLiterals = false,
): { lines: string[]; comments: number } {
  const state: ScanState = {
    inBlock: false,
    inTriple: null,
    lineCommentContinues: false,
    blankLiterals,
  }
  const strip = language === 'python' ? stripLinePython : stripLineC
  let comments = 0
  const lines = source.split(/\r?\n/).map((line) => {
    const result = strip(line, state)
    comments += result.comments
    return result.text
  })
  return { lines, comments }
}

/**
 * Te same linie, ale z wygaszonymi komentarzami - LICZBA LINII SIE NIE ZMIENIA.
 *
 * Uzywane tam, gdzie numery linii musza zostac na miejscu: przy szukaniu konca
 * funkcji liczymy klamry, a klamra w komentarzu albo w napisie przesunelaby
 * ten koniec o pol pliku. `blankStrings` wygasza takze wnetrza napisow.
 */
export function blankComments(
  source: string,
  language: CommentLanguage = 'c',
  options: { blankStrings?: boolean } = {},
): string[] {
  return scan(source, language, options.blankStrings ?? false).lines
}

/**
 * Zwraca kod pozbawiony komentarzy.
 *
 * Zasady porzadkowania, zeby wynik dalo sie od razu wkleic:
 *   - linia, ktora byla samym komentarzem, znika w calosci (nie zostaje po niej dziura),
 *   - spacje na koncu linii leca,
 *   - ciag pustych linii zbija sie do jednej,
 *   - puste linie z poczatku i konca pliku znikaja.
 */
export function stripComments(source: string, language: CommentLanguage = 'c'): StripResult {
  const original = source.split(/\r?\n/)
  // Plik zakonczony znakiem nowej linii daje na koncu pusty element - nie liczymy
  // go jako linii, bo wtedy „usunieto 1 linie" pojawialoby sie zawsze.
  if (original.length > 0 && original[original.length - 1] === '') original.pop()

  const scanned = scan(source, language)
  const kept: string[] = []
  const removedComments = scanned.comments

  original.forEach((line, index) => {
    const trimmed = (scanned.lines[index] ?? '').replace(/\s+$/, '')
    // Linia, w ktorej byl tylko komentarz, znika razem z nim.
    if (trimmed === '' && line.trim() !== '') return
    kept.push(trimmed)
  })

  const collapsed: string[] = []
  for (const line of kept) {
    if (line === '' && collapsed[collapsed.length - 1] === '') continue
    collapsed.push(line)
  }
  while (collapsed.length > 0 && collapsed[0] === '') collapsed.shift()
  while (collapsed.length > 0 && collapsed[collapsed.length - 1] === '') collapsed.pop()

  return {
    code: collapsed.length > 0 ? collapsed.join('\n') + '\n' : '',
    removedLines: original.length - collapsed.length,
    removedComments,
  }
}
