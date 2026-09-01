import { useEffect, useMemo, useRef } from 'react'
// Tresc siedzi w jednym pliku Markdown - Vite wkleja go w czasie budowania.
import kompendiumSource from '../kompendium/kompendium.md?raw'
import { parseChapters, type Block } from '../guide/readme-section'
import { DEMOS } from '../kompendium/demos'
import { Inline } from './GuideView'

/**
 * Zakladka „Kompendium” - podreczna teoria do cwiczen.
 *
 * To DOM dla wiedzy, ktora dotad zyla w strzepach: dymkach edytora, pomocy
 * plytki i opisach bitow w symulatorze. Tamte miejsca zostaja krotkie
 * i linkuja tutaj - jedna tresc, wiele wejsc, zero rozjazdow.
 *
 * Nawigacja jak w ksiazce: spis rozdzialow z lewej, jeden rozdzial na raz.
 * Rozdzial montuje tez swoje animowane pokazy - a poniewaz niewybrane
 * rozdzialy w ogole nie istnieja w DOM, pokazy nic nie kosztuja, dopoki
 * ktos ich nie oglada.
 */
export function KompendiumView({
  chapter,
  onSelect,
}: {
  chapter: string
  onSelect: (id: string) => void
}) {
  const chapters = useMemo(() => parseChapters(kompendiumSource), [])
  const current = chapters.find((item) => item.id === chapter) ?? chapters[0]
  const position = chapters.indexOf(current)
  const previous = position > 0 ? chapters[position - 1] : null
  const next = position < chapters.length - 1 ? chapters[position + 1] : null
  const pageRef = useRef<HTMLElement>(null)

  // Przejscie z odnosnika (pomoc plytki, dymek w edytorze) ma zaczynac
  // rozdzial od gory - a nie od miejsca, w ktorym ktos skonczyl czytac inny.
  useEffect(() => {
    pageRef.current?.scrollTo({ top: 0 })
  }, [current.id])

  return (
    <div className="kompendium">
      <nav className="kompendium-toc" aria-label="Rozdziały kompendium">
        <h2>Kompendium</h2>
        <p className="kompendium-toc-lead">
          Teoria do ćwiczeń — krótko, z przykładami i pułapkami.
        </p>
        {chapters.map((item, index) => (
          <button
            key={item.id}
            className={item.id === current.id ? 'active' : ''}
            onClick={() => onSelect(item.id)}
          >
            <span className="kompendium-toc-number">{index + 1}</span>
            {item.title}
          </button>
        ))}
      </nav>
      <article className="kompendium-page" ref={pageRef} key={current.id}>
        <h1>{current.title}</h1>
        {current.blocks.map((block, index) => (
          <KompendiumBlock key={index} block={block} />
        ))}
        {/*
          Kartkowanie na dole strony: kto doczytal rozdzial do konca, nie musi
          wracac do spisu tresci, zeby czytac dalej.
        */}
        <nav className="kompendium-pager" aria-label="Sąsiednie rozdziały">
          {previous ? (
            <button onClick={() => onSelect(previous.id)}>
              <span className="kompendium-pager-dir">← poprzedni</span>
              {previous.title}
            </button>
          ) : (
            <span />
          )}
          {next ? (
            <button className="kompendium-pager-next" onClick={() => onSelect(next.id)}>
              <span className="kompendium-pager-dir">następny →</span>
              {next.title}
            </button>
          ) : (
            <span />
          )}
        </nav>
        <footer className="kompendium-footer">
          Znalazłeś nieścisłość? Rozstrzyga karta katalogowa ATmega32 (doc2503) —
          każdą wartość z tego rozdziału można w niej sprawdzić.
        </footer>
      </article>
    </div>
  )
}

function KompendiumBlock({ block }: { block: Block }) {
  switch (block.kind) {
    case 'heading':
      return (
        <h2>
          <Inline tokens={block.inline} />
        </h2>
      )
    case 'subheading':
      return (
        <h3>
          <Inline tokens={block.inline} />
        </h3>
      )
    case 'note':
      return (
        <p className="guide-note">
          <Inline tokens={block.inline} />
        </p>
      )
    case 'paragraph':
      return (
        <p>
          <Inline tokens={block.inline} />
        </p>
      )
    case 'callout':
      return (
        <div className="kompendium-callout">
          <Inline tokens={block.inline} />
        </div>
      )
    case 'code':
      return (
        <pre className="kompendium-code">
          <code>{block.lines.join('\n')}</code>
        </pre>
      )
    case 'demo': {
      const Demo = DEMOS[block.id]
      // Nieznany identyfikator pokazu to blad tresci - test kompendium go
      // lapie, ale na wszelki wypadek nie zostawiamy dziury w ukladzie.
      return Demo ? (
        <div className="kompendium-demo">
          <Demo />
        </div>
      ) : null
    }
    case 'list': {
      const items = block.items.map((item, index) => (
        <li key={index}>
          <Inline tokens={item} />
        </li>
      ))
      return block.ordered ? <ol>{items}</ol> : <ul>{items}</ul>
    }
    case 'table':
      return (
        <div className="guide-table">
          <table>
            <thead>
              <tr>
                {block.head.map((cell, index) => (
                  <th key={index}>
                    <Inline tokens={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>
                      <Inline tokens={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
  }
}
