/**
 * Wycinanie i rozbior sekcji README na potrzeby zakladki „README”.
 *
 * Poradnik dla studenta zyje w JEDNYM miejscu - w pliku `README.md`. Zakladka
 * czyta go wprost stamtad (Vite wkleja tresc pliku w czasie budowania), zeby
 * nie powstala druga kopia tego samego tekstu. Dwie kopie zawsze sie rozjezdzaja,
 * a wtedy narzedzie zaczyna klamac studentowi w zywe oczy.
 *
 * Rozbior obejmuje WYLACZNIE te elementy skladni, ktorych uzywa sekcja 1c:
 * naglowki trzeciego poziomu, akapity, listy numerowane i punktowane, tabele
 * oraz pogrubienie, kursywe i kod w linii. To nie jest kompletny czytnik
 * Markdown i nie ma nim byc - pelna biblioteka to kolejne megabajty do pobrania
 * przez studenta, a tu wystarcza kilkadziesiat linii, ktore rozumiemy w calosci.
 *
 * Kontrolę nad tym, czy README nadal pasuje do parsera, trzyma test
 * `apps/web/test/guide.test.ts`.
 */

export type InlineToken =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'em'; text: string }
  | { kind: 'code'; text: string }

export type Block =
  | { kind: 'heading'; inline: InlineToken[] }
  /** Srodtytul (`####`) - mniejszy naglowek wewnatrz rozdzialu. */
  | { kind: 'subheading'; inline: InlineToken[] }
  | { kind: 'paragraph'; inline: InlineToken[] }
  /** Cala linia w kursywie - w poradniku sluzy do zdania wprowadzajacego. */
  | { kind: 'note'; inline: InlineToken[] }
  | { kind: 'list'; ordered: boolean; items: InlineToken[][] }
  | { kind: 'table'; head: InlineToken[][]; rows: InlineToken[][][] }
  /** Blok kodu w plocie ``` - uzywany przez kompendium. */
  | { kind: 'code'; language: string; lines: string[] }
  /** Cytat `> ` - w kompendium ramka „pulapka / rzecz do zapamietania”. */
  | { kind: 'callout'; inline: InlineToken[] }
  /** Znacznik `{{demo:nazwa}}` - miejsce na animowany pokaz w aplikacji. */
  | { kind: 'demo'; id: string }

export interface GuideSection {
  /** Tytul sekcji bez numeru, np. „Poradnik — jak używać narzędzia”. */
  title: string
  blocks: Block[]
}

/**
 * Wyciaga z README sekcje zaczynajaca sie od podanego naglowka drugiego poziomu
 * i konczaca przed kolejnym naglowkiem tego poziomu.
 */
export function extractSection(markdown: string, headingPrefix: string): string | null {
  const lines = markdown.split(/\r?\n/)
  const start = lines.findIndex((line) => line.startsWith(`## ${headingPrefix}`))
  if (start < 0) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) {
      end = i
      break
    }
  }
  return lines.slice(start, end).join('\n')
}

/** Sekcja README zamieniona na bloki gotowe do wyswietlenia. */
export function parseGuide(markdown: string, headingPrefix: string): GuideSection | null {
  const section = extractSection(markdown, headingPrefix)
  if (!section) return null

  const lines = section.split(/\r?\n/)
  const title = lines[0]
    .replace(/^##\s*/, '')
    // Numer sekcji ma sens w README, ale nie w zakladce.
    .replace(/^\d+[a-z]?\.\s*/, '')
    .trim()

  return { title, blocks: parseBlocks(lines.slice(1)) }
}

function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (trimmed === '' || trimmed === '---') {
      index++
      continue
    }

    // Blok kodu: wszystko miedzy plotami ``` idzie do bloku BEZ rozbioru,
    // z zachowaniem wciec - to jest kod C, nie proza.
    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim()
      const codeLines: string[] = []
      index++
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index])
        index++
      }
      index++ // plot zamykajacy
      blocks.push({ kind: 'code', language, lines: codeLines })
      continue
    }

    // Znacznik pokazu: {{demo:klawiatura}} w osobnej linii.
    const demo = /^\{\{demo:([a-z0-9-]+)\}\}$/.exec(trimmed)
    if (demo) {
      blocks.push({ kind: 'demo', id: demo[1] })
      index++
      continue
    }

    // Cytat `> ` - kolejne linie cytatu sklejamy w jedna ramke.
    if (trimmed.startsWith('>')) {
      const quoted: string[] = []
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        quoted.push(lines[index].trim().replace(/^>\s?/, ''))
        index++
      }
      blocks.push({ kind: 'callout', inline: parseInline(quoted.join(' ').trim()) })
      continue
    }

    if (trimmed.startsWith('#### ')) {
      blocks.push({ kind: 'subheading', inline: parseInline(trimmed.slice(5).trim()) })
      index++
      continue
    }

    if (trimmed.startsWith('### ')) {
      blocks.push({ kind: 'heading', inline: parseInline(trimmed.slice(4).trim()) })
      index++
      continue
    }

    if (trimmed.startsWith('|')) {
      const table: string[] = []
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        table.push(lines[index].trim())
        index++
      }
      const parsed = parseTable(table)
      if (parsed) blocks.push(parsed)
      continue
    }

    const bullet = /^([-*])\s+/.exec(trimmed)
    const numbered = /^\d+\.\s+/.exec(trimmed)
    if (bullet || numbered) {
      const ordered = Boolean(numbered)
      const items: string[] = []
      while (index < lines.length) {
        const current = lines[index]
        const currentTrimmed = current.trim()
        if (currentTrimmed === '') break
        const nextBullet = /^([-*])\s+/.exec(currentTrimmed)
        const nextNumbered = /^\d+\.\s+/.exec(currentTrimmed)
        if (nextBullet || nextNumbered) {
          if (Boolean(nextNumbered) !== ordered) break
          items.push(currentTrimmed.replace(/^([-*]|\d+\.)\s+/, ''))
        } else if (items.length > 0 && /^\s+/.test(current)) {
          // Ciag dalszy poprzedniego punktu - w README lamiemy dlugie linie.
          items[items.length - 1] += ' ' + currentTrimmed
        } else {
          break
        }
        index++
      }
      blocks.push({ kind: 'list', ordered, items: items.map(parseInline) })
      continue
    }

    // Akapit: kolejne niepuste linie sklejamy w jedno zdanie.
    const paragraph: string[] = []
    while (index < lines.length) {
      const current = lines[index].trim()
      if (
        current === '' ||
        current === '---' ||
        current.startsWith('### ') ||
        current.startsWith('|') ||
        current.startsWith('```') ||
        current.startsWith('>') ||
        current.startsWith('{{demo:') ||
        /^([-*]|\d+\.)\s+/.test(current)
      ) {
        break
      }
      paragraph.push(current)
      index++
    }
    const text = paragraph.join(' ')
    const italicOnly = /^\*([^*].*)\*$/.exec(text)
    blocks.push(
      italicOnly
        ? { kind: 'note', inline: parseInline(italicOnly[1]) }
        : { kind: 'paragraph', inline: parseInline(text) },
    )
  }

  return blocks
}

function splitRow(row: string): string[] {
  return row
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function parseTable(rows: string[]): Block | null {
  if (rows.length < 2) return null
  // Druga linia tabeli w Markdown to same myslniki - sluzy tylko do wyrownania.
  if (!/^\|[\s|:-]+\|$/.test(rows[1])) return null
  const head = splitRow(rows[0]).map(parseInline)
  const body = rows.slice(2).map((row) => splitRow(row).map(parseInline))
  return { kind: 'table', head, rows: body }
}

// ---------------------------------------------------------------------------
// Rozdzialy kompendium
// ---------------------------------------------------------------------------

export interface Chapter {
  /** Staly identyfikator z naglowka `{#id}` - do odnosnikow z innych widokow. */
  id: string
  title: string
  blocks: Block[]
}

/**
 * Dzieli dokument na rozdzialy po naglowkach drugiego poziomu.
 *
 * Kazdy naglowek MUSI niesc jawny identyfikator: `## Tytuł {#id}`.
 * Identyfikator jest adresem rozdzialu dla odnosnikow z pomocy plytki,
 * podgladu rejestrow i dymkow edytora - wyliczanie go z polskiego tytulu
 * psuloby te odnosniki przy kazdej zmianie brzmienia tytulu.
 */
export function parseChapters(markdown: string): Chapter[] {
  const lines = markdown.split(/\r?\n/)
  const chapters: Chapter[] = []
  let current: { id: string; title: string; body: string[] } | null = null

  const close = () => {
    if (!current) return
    chapters.push({ id: current.id, title: current.title, blocks: parseBlocks(current.body) })
    current = null
  }

  for (const line of lines) {
    const heading = /^##\s+(.+?)\s*\{#([a-z0-9-]+)\}\s*$/.exec(line)
    if (heading) {
      close()
      current = { id: heading[2], title: heading[1].trim(), body: [] }
      continue
    }
    if (line.startsWith('## ')) {
      // Naglowek bez identyfikatora zamyka poprzedni rozdzial, ale sam nie
      // zaczyna nowego - test kompendium pilnuje, zeby takich nie bylo.
      close()
      continue
    }
    current?.body.push(line)
  }
  close()

  return chapters
}

/**
 * Pogrubienie, kursywa i kod w linii. Kolejnosc ma znaczenie: `**` musi byc
 * sprawdzone przed `*`, inaczej pogrubienie rozpadloby sie na dwie kursywy.
 */
export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = []
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*/g
  let last = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) tokens.push({ kind: 'text', text: text.slice(last, match.index) })
    if (match[1] !== undefined) tokens.push({ kind: 'strong', text: match[1] })
    else if (match[2] !== undefined) tokens.push({ kind: 'code', text: match[2] })
    else tokens.push({ kind: 'em', text: match[3] })
    last = match.index + match[0].length
  }

  if (last < text.length) tokens.push({ kind: 'text', text: text.slice(last) })
  return tokens
}
