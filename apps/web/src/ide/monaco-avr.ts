/**
 * Podpowiedzi i dymki w edytorze.
 *
 * Dwa zrodla wiedzy:
 *   1. Baza symboli AVR (knowledge/avr-symbols.ts) - rejestry, bity, makra.
 *      Kazdy wpis mowi, czym symbol jest, skad pochodzi i na co uwazac.
 *   2. Zawartosc otwartego pliku - funkcje, zmienne i stale napisane przez
 *      studenta. Przy kazdej piszemy, w ktorej linii zostala zadeklarowana,
 *      zeby dalo sie do niej wrocic.
 *
 * Dlaczego to wazne: nazwy typu OCIE1A albo URSEL nic same z siebie nie mowia,
 * a szukanie ich w liczacym kilkaset stron datasheecie skutecznie zniechecza.
 */

import type * as Monaco from 'monaco-editor'
import { SYMBOLS, findSymbol, symbolToMarkdown } from '../knowledge/avr-symbols'

export interface LocalSymbol {
  name: string
  kind: 'function' | 'variable' | 'macro' | 'type'
  /** Deklaracja tak, jak wyglada w kodzie. */
  signature: string
  line: number
}

/**
 * Wyciaga z kodu nazwy zdefiniowane przez uzytkownika.
 * To celowo proste wyszukiwanie wzorcow, a nie analiza skladni - w zupelnosci
 * wystarcza do podpowiadania, a nie wymaga wciagania kompilatora do edytora.
 */
export function parseSymbols(code: string): LocalSymbol[] {
  const symbols: LocalSymbol[] = []
  const lines = code.split(/\r?\n/)

  const TYPE = '(?:const\\s+|static\\s+|volatile\\s+|unsigned\\s+|signed\\s+)*[A-Za-z_][A-Za-z0-9_]*(?:\\s*\\*)*'

  lines.forEach((raw, index) => {
    const line = raw.replace(/\/\/.*$/, '').trim()
    if (line === '') return

    const macro = /^#\s*define\s+([A-Za-z_][A-Za-z0-9_]*)\s*(.*)$/.exec(line)
    if (macro) {
      symbols.push({
        name: macro[1],
        kind: 'macro',
        signature: `#define ${macro[1]} ${macro[2]}`.trim(),
        line: index + 1,
      })
      return
    }

    const typedef = /^typedef\s+.*\b([A-Za-z_][A-Za-z0-9_]*)\s*;/.exec(line)
    if (typedef) {
      symbols.push({ name: typedef[1], kind: 'type', signature: line, line: index + 1 })
      return
    }

    const fn = new RegExp(`^${TYPE}\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*\\(([^;]*)\\)\\s*\\{?$`).exec(line)
    if (fn && !/^(if|while|for|switch|return|else|do)\b/.test(line)) {
      symbols.push({
        name: fn[1],
        kind: 'function',
        signature: line.replace(/\s*\{$/, ''),
        line: index + 1,
      })
      return
    }

    const variable = new RegExp(`^${TYPE}\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*(\\[[^\\]]*\\])?\\s*(=|;)`).exec(line)
    if (variable && !/^(return|else|case|default)\b/.test(line)) {
      symbols.push({
        name: variable[1],
        kind: 'variable',
        signature: line.replace(/;$/, ''),
        line: index + 1,
      })
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
 * Rejestruje podpowiedzi i dymki dla jezyka C. Bezpieczne do wielokrotnego
 * wywolania - druga i kolejne proby nie robia nic.
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

        for (const local of parseSymbols(model.getValue())) {
          suggestions.push({
            label: local.name,
            kind:
              local.kind === 'function'
                ? monaco.languages.CompletionItemKind.Function
                : local.kind === 'macro'
                  ? monaco.languages.CompletionItemKind.Constant
                  : monaco.languages.CompletionItemKind.Variable,
            detail: `${local.signature}  ·  z tego pliku, linia ${local.line}`,
            documentation: {
              value: `\`\`\`c\n${local.signature}\n\`\`\`\n\n_Zdefiniowane w tym pliku, w linii ${local.line}._`,
            },
            insertText: local.kind === 'function' ? `${local.name}(` : local.name,
            range,
            sortText: '2' + local.name,
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

        const local = parseSymbols(model.getValue()).find((item) => item.name === word.word)
        if (local) {
          const kindLabel =
            local.kind === 'function' ? 'funkcja' : local.kind === 'macro' ? 'stała' : local.kind === 'type' ? 'typ' : 'zmienna'
          return {
            range,
            contents: [
              { value: `**${local.name}** — _${kindLabel} z tego pliku_` },
              { value: `\`\`\`c\n${local.signature}\n\`\`\`` },
              { value: `_Zadeklarowane w linii ${local.line}._` },
            ],
          }
        }

        return null
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
