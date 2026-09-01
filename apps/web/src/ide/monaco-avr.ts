/**
 * Podpowiedzi, dymki i skok do definicji w edytorze.
 *
 * Trzy zrodla wiedzy:
 *   1. Baza symboli AVR (knowledge/avr-symbols.ts) - rejestry, bity, makra.
 *      Kazdy wpis mowi, czym symbol jest, skad pochodzi i na co uwazac.
 *   2. Zawartosc otwartego pliku - funkcje, zmienne, stale i ARGUMENTY funkcji,
 *      w ktorej stoi kursor.
 *   3. Pozostale pliki projektu - sterownik klawiatury czy wyswietlacza siedzi
 *      zwykle w osobnym pliku, a wlasnie jego funkcje wola sie najczesciej.
 *
 * Dlaczego to wazne: nazwy typu OCIE1A albo URSEL nic same z siebie nie mowia,
 * a szukanie ich w liczacym kilkaset stron datasheecie skutecznie zniechecza.
 */

import type * as Monaco from 'monaco-editor'
import { SYMBOLS, findSymbol, symbolToMarkdown } from '../knowledge/avr-symbols'
import { blankComments } from './strip-comments'

export interface LocalSymbol {
  name: string
  kind: 'function' | 'variable' | 'macro' | 'type' | 'parameter'
  /** Deklaracja tak, jak wyglada w kodzie. */
  signature: string
  line: number
  /** Kolumna, w ktorej zaczyna sie sama nazwa - stad skacze „przejdz do definicji". */
  column: number
  /** Plik projektu, jesli symbol pochodzi spoza otwartego dokumentu. */
  file?: string
  /** Dla argumentu: funkcja, do ktorej nalezy. */
  owner?: string
}

const TYPE = '(?:const\\s+|static\\s+|volatile\\s+|unsigned\\s+|signed\\s+)*[A-Za-z_][A-Za-z0-9_]*(?:\\s*\\*)*'

function isWordChar(char: string): boolean {
  return char !== '' && /[A-Za-z0-9_]/.test(char)
}

/**
 * Kolumna (liczona od 1), w ktorej w danej linii stoi CALE slowo `name`.
 * Bez tego skok do definicji ladowalby zawsze na poczatku linii, a zaznaczenie
 * obejmowaloby typ zamiast nazwy.
 */
function nameColumn(line: string, name: string): number {
  let from = 0
  while (from <= line.length - name.length) {
    const at = line.indexOf(name, from)
    if (at === -1) break
    const before = at > 0 ? line[at - 1] : ''
    const after = line[at + name.length] ?? ''
    if (!isWordChar(before) && !isWordChar(after)) return at + 1
    from = at + 1
  }
  return 1
}

/**
 * Wyciaga z kodu nazwy zdefiniowane przez uzytkownika.
 * To celowo proste wyszukiwanie wzorcow, a nie analiza skladni - w zupelnosci
 * wystarcza do podpowiadania, a nie wymaga wciagania kompilatora do edytora.
 */
export function parseSymbols(code: string): LocalSymbol[] {
  const symbols: LocalSymbol[] = []
  const lines = code.split(/\r?\n/)

  lines.forEach((raw, index) => {
    const line = raw.replace(/\/\/.*$/, '').trim()
    if (line === '') return

    const add = (name: string, kind: LocalSymbol['kind'], signature: string) => {
      symbols.push({ name, kind, signature, line: index + 1, column: nameColumn(raw, name) })
    }

    const macro = /^#\s*define\s+([A-Za-z_][A-Za-z0-9_]*)\s*(.*)$/.exec(line)
    if (macro) {
      add(macro[1], 'macro', `#define ${macro[1]} ${macro[2]}`.trim())
      return
    }

    const typedef = /^typedef\s+.*\b([A-Za-z_][A-Za-z0-9_]*)\s*;/.exec(line)
    if (typedef) {
      add(typedef[1], 'type', line)
      return
    }

    const fn = new RegExp(`^${TYPE}\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*\\(([^;]*)\\)\\s*\\{?$`).exec(line)
    if (fn && !/^(if|while|for|switch|return|else|do)\b/.test(line)) {
      add(fn[1], 'function', line.replace(/\s*\{$/, ''))
      return
    }

    /*
      Zmienna sterujaca petli (`for (uint8_t i = 0; ...)`) tez jest deklaracja,
      choc nie stoi na poczatku linii. Bez tego najechanie na „i" nie pokazywalo
      niczego - a to jedna z najczesciej ogladanych nazw w calym pliku.
    */
    const loopVariable = new RegExp(`^for\\s*\\(\\s*${TYPE}\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*=`).exec(line)
    if (loopVariable) {
      const declaration = /\(([^;]*)/.exec(line)
      add(loopVariable[1], 'variable', (declaration ? declaration[1] : line).trim())
      return
    }

    const variable = new RegExp(`^${TYPE}\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*(\\[[^\\]]*\\])?\\s*(=|;)`).exec(line)
    if (variable && !/^(return|else|case|default)\b/.test(line)) {
      add(variable[1], 'variable', line.replace(/;$/, ''))
    }
  })

  // Ta sama nazwa moze pasowac do kilku wzorcow - zostawiamy pierwsze wystapienie.
  const seen = new Set<string>()
  return symbols.filter((symbol) => {
    if (seen.has(symbol.name)) return false
    seen.add(symbol.name)
    return true
  })
}

// ---------------------------------------------------------------------------
// Zasieg funkcji: argumenty i zmienne lokalne
// ---------------------------------------------------------------------------

export interface FunctionScope {
  /** Nazwa funkcji, w ktorej ciele stoi kursor. */
  name: string
  /** Pierwsza i ostatnia linia funkcji (razem z naglowkiem). */
  from: number
  to: number
  /** Argumenty wypisane w naglowku. */
  params: LocalSymbol[]
}

/**
 * Rozklada liste argumentow z naglowka funkcji.
 *
 * `void ekran_pisz(uint8_t wiersz, const char *tekst)` daje dwa wpisy:
 * `wiersz` i `tekst`. Nazwa argumentu to ostatni identyfikator w jego
 * deklaracji - reszta to typ.
 */
function parseParams(header: string, line: number, owner: string): LocalSymbol[] {
  const open = header.indexOf('(')
  const close = header.lastIndexOf(')')
  if (open === -1 || close <= open) return []

  const params: LocalSymbol[] = []
  let depth = 0
  let current = ''
  const pieces: string[] = []
  for (const char of header.slice(open + 1, close)) {
    if (char === '(') depth++
    if (char === ')') depth--
    if (char === ',' && depth === 0) {
      pieces.push(current)
      current = ''
      continue
    }
    current += char
  }
  pieces.push(current)

  for (const piece of pieces) {
    const text = piece.trim()
    if (text === '' || text === 'void' || text === '...') continue
    const names = text.match(/[A-Za-z_][A-Za-z0-9_]*/g)
    if (!names) continue
    const name = names[names.length - 1]
    // Sam typ bez nazwy (`void f(uint8_t)`) nie jest argumentem, ktory da sie wskazac.
    if (names.length < 2 && !/\*/.test(text)) continue
    params.push({
      name,
      kind: 'parameter',
      signature: text,
      line,
      column: nameColumn(header, name),
      owner,
    })
  }
  return params
}

/**
 * Funkcja, w ktorej ciele stoi wskazana linia - razem z jej argumentami.
 *
 * Koniec funkcji znajdujemy licząc klamry, w tekscie z WYGASZONYMI komentarzami:
 * klamra w komentarzu albo w napisie przesunelaby koniec funkcji o pol pliku.
 */
export function functionScopeAt(code: string, line: number): FunctionScope | null {
  const rawLines = code.split(/\r?\n/)
  const clean = blankComments(code, 'c', { blankStrings: true })
  const functions = parseSymbols(code).filter((symbol) => symbol.kind === 'function')

  for (let index = functions.length - 1; index >= 0; index--) {
    const fn = functions[index]
    if (fn.line > line) continue

    let depth = 0
    let opened = false
    let end = rawLines.length
    for (let current = fn.line - 1; current < clean.length; current++) {
      for (const char of clean[current]) {
        if (char === '{') {
          depth++
          opened = true
        } else if (char === '}') {
          depth--
        }
      }
      if (opened && depth <= 0) {
        end = current + 1
        break
      }
    }
    if (!opened) return null
    if (line > end) return null

    return {
      name: fn.name,
      from: fn.line,
      to: end,
      params: parseParams(rawLines[fn.line - 1] ?? fn.signature, fn.line, fn.name),
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Wiedza o calym projekcie
// ---------------------------------------------------------------------------

export interface ProjectSourceFile {
  path: string
  content: string
}

/**
 * Dostawcy podpowiedzi rejestrujemy raz, przy starcie aplikacji, a pliki
 * projektu zyja w komponencie edytora. Ten uchwyt laczy jedno z drugim:
 * IdeView podaje tu funkcje zwracajaca AKTUALNA liste plikow.
 */
let projectSources: () => ProjectSourceFile[] = () => []

export function setProjectSources(provider: () => ProjectSourceFile[]): void {
  projectSources = provider
}

function isCFile(path: string): boolean {
  return path.endsWith('.c') || path.endsWith('.h')
}

/** Sciezka pliku wyliczona z adresu dokumentu Monaco (`/main.c` → `main.c`). */
function pathOfModel(model: Monaco.editor.ITextModel): string {
  return model.uri.path.replace(/^\//, '')
}

/** Symbole ze wszystkich plikow C projektu POZA wskazanym. */
function otherFileSymbols(exceptPath: string): LocalSymbol[] {
  const found: LocalSymbol[] = []
  for (const file of projectSources()) {
    if (file.path === exceptPath || !isCFile(file.path)) continue
    for (const symbol of parseSymbols(file.content)) found.push({ ...symbol, file: file.path })
  }
  return found
}

/**
 * Znajduje symbol pod kursorem, przechodząc zasiegi od najwezszego do najszerszego:
 * argument funkcji → deklaracja w jej ciele → reszta pliku → pozostale pliki projektu.
 *
 * Kolejnosc ma znaczenie: argument o tej samej nazwie co zmienna globalna
 * przeslania ja, wiec dymek musi mowic o argumencie.
 */
export function findLocalSymbol(code: string, path: string, line: number, name: string): LocalSymbol | null {
  const scope = functionScopeAt(code, line)
  if (scope) {
    const param = scope.params.find((item) => item.name === name)
    if (param) return param

    const bodyLines = code.split(/\r?\n/).slice(scope.from - 1, scope.to)
    const inBody = parseSymbols(bodyLines.join('\n')).find(
      (item) => item.name === name && item.kind !== 'function',
    )
    if (inBody) return { ...inBody, line: inBody.line + scope.from - 1 }
  }

  const inFile = parseSymbols(code).find((item) => item.name === name)
  if (inFile) return inFile

  return otherFileSymbols(path).find((item) => item.name === name) ?? null
}

const KIND_LABEL: Record<LocalSymbol['kind'], string> = {
  function: 'funkcja',
  variable: 'zmienna',
  macro: 'stała',
  type: 'typ',
  parameter: 'argument funkcji',
}

/** Zdanie o tym, gdzie symbol zostal zadeklarowany - razem z podpowiedzia o skoku. */
function whereDeclared(symbol: LocalSymbol): string {
  const place = symbol.file
    ? `w pliku \`${symbol.file}\`, w linii ${symbol.line}`
    : `w linii ${symbol.line}`
  return `_Zadeklarowane ${place}. **Ctrl + kliknięcie** przenosi do tego miejsca._`
}

/** Gotowe fragmenty kodu - do wstawienia jednym klawiszem. */
const SNIPPETS: { label: string; description: string; body: string }[] = [
  {
    label: 'szkielet-programu',
    description: 'Kompletny szkielet programu z pętlą nieskończoną',
    body: [
      '#define F_CPU 1000000UL',
      '#include <avr/io.h>',
      '#include <util/delay.h>',
      '',
      'int main(void)',
      '{',
      '\t${1:DDRD = 0xFF;}',
      '',
      '\twhile (1)',
      '\t{',
      '\t\t$0',
      '\t}',
      '}',
    ].join('\n'),
  },
  {
    label: 'przerwanie',
    description: 'Procedura obsługi przerwania',
    body: 'ISR(${1|TIMER1_COMPA_vect,TIMER1_OVF_vect,TIMER0_COMP_vect,USART_RXC_vect,INT0_vect|})\n{\n\t$0\n}',
  },
  {
    label: 'timer1-ctc',
    description: 'Timer TC1 w trybie CTC z przerwaniem',
    body: [
      'void timer1_init(void)',
      '{',
      '\tTCCR1B |= (1 << WGM12);          // tryb CTC',
      '\tTCCR1B |= (1 << CS12);           // preskaler 256',
      '\tOCR1A = ${1:3905};               // okres = (1 + OCR1A) * preskaler / f_zegara',
      '\tTIMSK |= (1 << OCIE1A);          // zezwolenie na przerwanie porównania',
      '\tsei();                           // globalne zezwolenie na przerwania',
      '}',
    ].join('\n'),
  },
  {
    label: 'usart-init',
    description: 'Konfiguracja transmisji szeregowej',
    body: [
      '#define BAUDRATE 9600',
      '#define BAUD_PRESCALER (F_CPU / 16 / BAUDRATE - 1)',
      '',
      'void usart_init(void)',
      '{',
      '\tUBRRH = BAUD_PRESCALER >> 8;',
      '\tUBRRL = BAUD_PRESCALER;',
      '\tUCSRB = (1 << RXEN) | (1 << TXEN);',
      '\tUCSRC = (1 << URSEL) | (1 << UCSZ1) | (1 << UCSZ0);   // URSEL jest konieczny!',
      '}',
    ].join('\n'),
  },
  {
    label: 'czekaj-na-przycisk',
    description: 'Odczyt przycisku z eliminacją drgań styków',
    body: [
      'if ((PIN${1:D} & (1 << P${1:D}${2:0})) == 0)   // przycisk zwiera linię do masy',
      '{',
      '\t_delay_ms(5);                      // odczekanie na ustanie drgań styków',
      '\tif ((PIN${1:D} & (1 << P${1:D}${2:0})) == 0)',
      '\t{',
      '\t\t$0',
      '\t}',
      '}',
    ].join('\n'),
  },
]

/**
 * Dostawcy podpowiedzi sa GLOBALNI dla calego jezyka, a nie dla pojedynczego
 * edytora. Ponowna rejestracja dopisuje kolejnego dostawce, a Monaco skleja
 * odpowiedzi wszystkich - wiec dymek pokazywalby ten sam opis dwa razy.
 * Stad ten straznik.
 */
let registered: Monaco.IDisposable[] | null = null

/**
 * Rejestruje podpowiedzi, dymki i skok do definicji dla jezyka C.
 * Bezpieczne do wielokrotnego wywolania - druga i kolejne proby nie robia nic.
 */
export function registerAvrSupport(monaco: typeof Monaco): Monaco.IDisposable[] {
  if (registered) return registered

  const disposables: Monaco.IDisposable[] = []

  disposables.push(
    monaco.languages.registerCompletionItemProvider('c', {
      triggerCharacters: ['<', '(', ' '],
      provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position)
        const range: Monaco.IRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        }

        const suggestions: Monaco.languages.CompletionItem[] = []

        for (const symbol of SYMBOLS) {
          suggestions.push({
            label: symbol.name,
            kind: completionKind(monaco, symbol.kind),
            detail: symbol.summary,
            documentation: { value: symbolToMarkdown(symbol) },
            insertText: symbol.name,
            range,
            // Rejestry i bity przed reszta - to ich najczesciej sie szuka.
            sortText: symbol.kind === 'register' ? '0' + symbol.name : '1' + symbol.name,
          })
        }

        // Najpierw symbole z otwartego pliku, potem z pozostalych plikow projektu -
        // funkcje sterownika w osobnym pliku wola sie tak samo czesto jak wlasne.
        const path = pathOfModel(model)
        const locals = [...parseSymbols(model.getValue()), ...otherFileSymbols(path)]
        for (const local of locals) {
          const origin = local.file ? `z pliku ${local.file}` : 'z tego pliku'
          suggestions.push({
            label: local.name,
            kind:
              local.kind === 'function'
                ? monaco.languages.CompletionItemKind.Function
                : local.kind === 'macro'
                  ? monaco.languages.CompletionItemKind.Constant
                  : monaco.languages.CompletionItemKind.Variable,
            detail: `${local.signature}  ·  ${origin}, linia ${local.line}`,
            documentation: {
              value: `\`\`\`c\n${local.signature}\n\`\`\`\n\n_Zdefiniowane ${origin}, w linii ${local.line}._`,
            },
            insertText: local.kind === 'function' ? `${local.name}(` : local.name,
            range,
            sortText: (local.file ? '25' : '2') + local.name,
          })
        }

        for (const snippet of SNIPPETS) {
          suggestions.push({
            label: snippet.label,
            kind: monaco.languages.CompletionItemKind.Snippet,
            detail: snippet.description,
            insertText: snippet.body,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
            sortText: '3' + snippet.label,
          })
        }

        return { suggestions }
      },
    }),
  )

  disposables.push(
    monaco.languages.registerHoverProvider('c', {
      provideHover(model, position) {
        const word = model.getWordAtPosition(position)
        if (!word) return null

        const range: Monaco.IRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        }

        const symbol = findSymbol(word.word)
        if (symbol) {
          return { range, contents: [{ value: symbolToMarkdown(symbol) }] }
        }

        const local = findLocalSymbol(
          model.getValue(),
          pathOfModel(model),
          position.lineNumber,
          word.word,
        )
        if (!local) return null

        if (local.kind === 'parameter') {
          return {
            range,
            contents: [
              { value: `**${local.name}** — _argument funkcji \`${local.owner}\`_` },
              { value: `\`\`\`c\n${local.signature}\n\`\`\`` },
              {
                value:
                  'Argument to wartość podana funkcji w chwili jej wywołania. Wewnątrz funkcji ' +
                  'zachowuje się jak zwykła zmienna, ale zaczyna z tym, co przekazał wołający — ' +
                  'i znika, gdy funkcja się skończy.',
              },
              { value: `_Zadeklarowany w nagłówku funkcji, w linii ${local.line}._` },
            ],
          }
        }

        return {
          range,
          contents: [
            {
              value: `**${local.name}** — _${KIND_LABEL[local.kind]}${
                local.file ? ` z pliku ${local.file}` : ' z tego projektu'
              }_`,
            },
            { value: `\`\`\`c\n${local.signature}\n\`\`\`` },
            { value: whereDeclared(local) },
          ],
        }
      },
    }),
  )

  /*
    Skok do definicji (Ctrl + klikniecie, F12, „Przejdz do definicji" z menu).

    Szukamy tak samo jak dymek - od argumentu funkcji po pozostale pliki projektu.
    Gdy definicja lezy w innym pliku, Monaco potrzebuje jego dokumentu; tworzymy
    go w locie, a zakladke przelacza edytor (patrz `registerEditorOpener`
    w IdeView).
  */
  disposables.push(
    monaco.languages.registerDefinitionProvider('c', {
      provideDefinition(model, position) {
        const word = model.getWordAtPosition(position)
        if (!word) return null

        const path = pathOfModel(model)
        const found = findLocalSymbol(model.getValue(), path, position.lineNumber, word.word)
        if (!found) return null

        const range: Monaco.IRange = {
          startLineNumber: found.line,
          startColumn: found.column,
          endLineNumber: found.line,
          endColumn: found.column + found.name.length,
        }

        if (!found.file) return [{ uri: model.uri, range }]

        const content = projectSources().find((file) => file.path === found.file)?.content ?? ''
        const uri = monaco.Uri.parse(found.file)
        const existing = monaco.editor.getModel(uri)
        if (!existing) {
          monaco.editor.createModel(content, 'c', uri)
        } else if (
          existing.getValue() !== content &&
          !monaco.editor.getEditors().some((editor) => editor.getModel() === existing)
        ) {
          // Dokument utworzony na potrzeby wczesniejszego skoku moze byc juz
          // nieaktualny. Odswiezamy go - ale nigdy tego, w ktorym ktos wlasnie pisze.
          existing.setValue(content)
        }

        return [{ uri, range }]
      },
    }),
  )

  registered = disposables
  return disposables
}

function completionKind(monaco: typeof Monaco, kind: string): Monaco.languages.CompletionItemKind {
  switch (kind) {
    case 'register':
      return monaco.languages.CompletionItemKind.Field
    case 'bit':
      return monaco.languages.CompletionItemKind.EnumMember
    case 'macro':
      return monaco.languages.CompletionItemKind.Constant
    case 'function':
      return monaco.languages.CompletionItemKind.Function
    case 'vector':
      return monaco.languages.CompletionItemKind.Event
    case 'header':
      return monaco.languages.CompletionItemKind.File
    default:
      return monaco.languages.CompletionItemKind.Keyword
  }
}
