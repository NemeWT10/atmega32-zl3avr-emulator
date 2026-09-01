/**
 * Kompendium: struktura tresci i odnosniki z innych widokow.
 *
 * Mikro-czytnik obsluguje dokladnie te skladnie, ktorej uzywa tresc - ten
 * test pilnuje, zeby zadna konstrukcja nie przeciekala do tekstu w postaci
 * surowych znakow (```, {{demo:...}}, ####). Pilnuje tez umowy miedzy
 * plikami: identyfikatory rozdzialow w kompendium.md musza zgadzac sie
 * z lista w navigation.ts, bo to na nia wskazuja odnosniki z pomocy plytki,
 * podgladu rejestrow i dymkow edytora.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseChapters, type Block, type InlineToken } from '../src/guide/readme-section'
import { KOMPENDIUM_CHAPTERS, chapterForSymbol } from '../src/kompendium/navigation'
import { DEMOS } from '../src/kompendium/demos'

const source = readFileSync(
  fileURLToPath(new URL('../src/kompendium/kompendium.md', import.meta.url)),
  'utf8',
)
const chapters = parseChapters(source)

function inlineText(tokens: InlineToken[]): string {
  return tokens.map((token) => token.text).join('')
}

function blockText(block: Block): string {
  switch (block.kind) {
    case 'heading':
    case 'subheading':
    case 'paragraph':
    case 'note':
    case 'callout':
      return inlineText(block.inline)
    case 'list':
      return block.items.map(inlineText).join('\n')
    case 'table':
      return [...block.head, ...block.rows.flat()].map(inlineText).join('\n')
    case 'code':
      return '' // kod moze zawierac dowolne znaki - nie sprawdzamy go tu
    case 'demo':
      return ''
  }
}

describe('struktura kompendium', () => {
  it('rozdziały i ich kolejność zgadzają się z listą nawigacji', () => {
    expect(chapters.map((chapter) => chapter.id)).toEqual(
      KOMPENDIUM_CHAPTERS.map((chapter) => chapter.id),
    )
  })

  it('tytuły rozdziałów zgadzają się z etykietami odnośników', () => {
    for (const chapter of chapters) {
      const label = KOMPENDIUM_CHAPTERS.find((item) => item.id === chapter.id)?.label
      expect(chapter.title).toBe(label)
    }
  })

  it('każdy rozdział ma treść: akapity i sekcję pułapek', () => {
    for (const chapter of chapters) {
      const kinds = chapter.blocks.map((block) => block.kind)
      expect(kinds, chapter.id).toContain('paragraph')
      const text = chapter.blocks.map(blockText).join('\n')
      expect(text, chapter.id).toContain('ułapk') // „pułapki” w dowolnej odmianie
    }
  })

  it('żadna składnia nie przecieka do tekstu', () => {
    for (const chapter of chapters) {
      for (const block of chapter.blocks) {
        const text = blockText(block)
        expect(text, `${chapter.id}: ${text.slice(0, 60)}`).not.toContain('```')
        expect(text).not.toContain('{{demo')
        expect(text).not.toContain('####')
        expect(text).not.toContain('{#')
      }
    }
  })

  it('każdy znacznik pokazu wskazuje istniejący komponent', () => {
    const used = chapters.flatMap((chapter) =>
      chapter.blocks.filter((block) => block.kind === 'demo'),
    )
    expect(used.length).toBeGreaterThanOrEqual(3)
    for (const block of used) {
      if (block.kind !== 'demo') continue
      expect(Object.keys(DEMOS), `pokaz ${block.id}`).toContain(block.id)
    }
  })

  it('rozdziały wymagane przez ćwiczenia niosą kluczowe fakty', () => {
    const text = Object.fromEntries(
      chapters.map((chapter) => [chapter.id, chapter.blocks.map(blockText).join('\n')]),
    )
    const codeOf = (id: string) =>
      chapters
        .find((chapter) => chapter.id === id)!
        .blocks.filter((block) => block.kind === 'code')
        .map((block) => (block.kind === 'code' ? block.lines.join('\n') : ''))
        .join('\n')

    expect(text['porty']).toContain('PIN')
    expect(text['timery']).toContain('TIMSK')
    expect(text['przerwania']).toContain('PD2')
    expect(codeOf('przerwania')).toContain('sei()')
    expect(text['usart']).toContain('URSEL')
    expect(text['lcd']).toContain('0x40')
    expect(text['klawiatura']).toContain('JP23')
    expect(codeOf('bity')).toContain('1 << 3')
  })
})

describe('dobór rozdziału dla symbolu (odnośniki z dymków)', () => {
  const cases: [string, string | null][] = [
    ['PORTA', 'porty'],
    ['DDRB', 'porty'],
    ['PA3', 'porty'],
    ['TCCR0', 'timery'],
    ['OCIE1A', 'timery'],
    ['TIFR', 'timery'],
    ['TIMER1_COMPA_vect', 'przerwania'],
    ['GICR', 'przerwania'],
    ['sei', 'przerwania'],
    ['UCSRC', 'usart'],
    ['URSEL', 'usart'],
    ['UDR', 'usart'],
    ['F_CPU', 'zegar'],
    ['_delay_ms', 'zegar'],
    ['uint8_t', 'bity'],
    ['moja_funkcja', null],
  ]

  for (const [symbol, expected] of cases) {
    it(`${symbol} → ${expected ?? 'brak odnośnika'}`, () => {
      expect(chapterForSymbol(symbol)?.id ?? null).toBe(expected)
    })
  }

  it('każdy wskazywany rozdział istnieje w treści', () => {
    const known = new Set(chapters.map((chapter) => chapter.id))
    for (const [symbol] of cases) {
      const chapter = chapterForSymbol(symbol)
      if (chapter) expect(known, symbol).toContain(chapter.id)
    }
  })
})
