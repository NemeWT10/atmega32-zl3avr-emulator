import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { extractSection, parseGuide, parseInline } from '../src/guide/readme-section'

/**
 * Zakladka „README” czyta poradnik WPROST z pliku README.md, zeby nie powstala
 * druga kopia tego samego tekstu. Cena tego rozwiazania jest taka, ze zmiana
 * naglowka albo sposobu zapisu w README moze po cichu zepsuc zakladke.
 *
 * Ten test jest za to odpowiedzialny: sprawdza na PRAWDZIWYM pliku, ze sekcja
 * istnieje, da sie ja rozebrac i ze sa w niej wszystkie trzy rzeczy, ktore
 * przeniesiono tu z panelu obok plytki.
 */

const README = readFileSync(fileURLToPath(new URL('../../../README.md', import.meta.url)), 'utf8')

describe('poradnik wycinany z README', () => {
  it('sekcja 1c istnieje i konczy sie przed nastepnym naglowkiem', () => {
    const section = extractSection(README, 'Poradnik')
    expect(section).not.toBeNull()
    expect(section!.split('\n').filter((line) => line.startsWith('## '))).toHaveLength(1)
  })

  it('tytul jest bez numeru sekcji', () => {
    const guide = parseGuide(README, 'Poradnik')
    expect(guide?.title).toBe('Poradnik — jak używać narzędzia')
  })

  it('ma wszystkie trzy rozdzialy przeniesione z panelu przy plytce', () => {
    const guide = parseGuide(README, 'Poradnik')!
    const headings = guide.blocks
      .filter((block) => block.kind === 'heading')
      .map((block) => block.inline.map((token) => token.text).join(''))

    expect(headings).toContain('Jak prowadzić przewody')
    expect(headings).toContain('Jak oglądać płytkę z bliska')
    expect(headings).toContain('Klawiatura komputera steruje klawiaturą płytki')
  })

  it('rozbiera listy, tabele i akapity', () => {
    const guide = parseGuide(README, 'Poradnik')!
    const kinds = new Set(guide.blocks.map((block) => block.kind))
    expect(kinds.has('list')).toBe(true)
    expect(kinds.has('table')).toBe(true)
    expect(kinds.has('paragraph')).toBe(true)
    // Zaden blok nie moze byc pusty - to znaczyloby, ze cos zginelo po drodze.
    for (const block of guide.blocks) {
      if (block.kind === 'list') expect(block.items.length).toBeGreaterThan(0)
      if (block.kind === 'table') expect(block.head.length).toBeGreaterThan(0)
    }
  })

  it('tabela układu klawiatury ma cztery wiersze', () => {
    const guide = parseGuide(README, 'Poradnik')!
    const tables = guide.blocks.filter((block) => block.kind === 'table')
    const keypad = tables.find((table) =>
      table.rows.some((row) => row[0]?.some((token) => token.text.includes('1 2 3 A'))),
    )
    expect(keypad?.rows).toHaveLength(4)
  })

  it('nie gubi tekstu ciagniętego przez kilka linii', () => {
    const guide = parseGuide(README, 'Poradnik')!
    const joined = JSON.stringify(guide.blocks)
    // Zdanie zlamane w README na dwie linie musi trafic do jednego bloku.
    expect(joined).toContain('tę żyłę, która zaraz powstanie')
    expect(joined).not.toContain('\\n')
  })

  it('srodtytul o wiazce jest naglowkiem, nie akapitem z kratkami', () => {
    const guide = parseGuide(README, 'Poradnik')!
    const subheadings = guide.blocks
      .filter((block) => block.kind === 'subheading')
      .map((block) => block.inline.map((token) => token.text).join(''))
    expect(subheadings.some((text) => text.includes('Wiązka przewodów'))).toBe(true)
    // Kratki naglowka nie moga przeciec do zadnego tekstu.
    expect(JSON.stringify(guide.blocks)).not.toContain('####')
  })
})

describe('formatowanie w linii', () => {
  it('rozrozniar pogrubienie, kursywe i kod', () => {
    expect(parseInline('zwykly **gruby** *skos* `kod`')).toEqual([
      { kind: 'text', text: 'zwykly ' },
      { kind: 'strong', text: 'gruby' },
      { kind: 'text', text: ' ' },
      { kind: 'em', text: 'skos' },
      { kind: 'text', text: ' ' },
      { kind: 'code', text: 'kod' },
    ])
  })

  it('pogrubienia nie rozklada na dwie kursywy', () => {
    expect(parseInline('**tak**')).toEqual([{ kind: 'strong', text: 'tak' }])
  })

  it('tekst bez znacznikow zostaje jednym kawalkiem', () => {
    expect(parseInline('nic tu nie ma')).toEqual([{ kind: 'text', text: 'nic tu nie ma' }])
  })
})
