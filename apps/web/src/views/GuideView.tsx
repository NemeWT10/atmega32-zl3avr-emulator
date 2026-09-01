import { Fragment, useMemo } from 'react'
// Tresc bierzemy WPROST z README - Vite wkleja plik w czasie budowania,
// wiec nie ma tu ani drugiej kopii tekstu, ani pobierania czegokolwiek z sieci.
import readme from '../../../../README.md?raw'
import { parseGuide, type Block, type InlineToken } from '../guide/readme-section'

/**
 * Zakladka „README” - poradnik obslugi narzedzia.
 *
 * Trafily tu rzeczy, ktore wczesniej zajmowaly pol panelu obok plytki:
 * jak prowadzic przewody, jak ogladac plytke z bliska i jak sterowac klawiatura
 * matrycowa z klawiatury komputera. Czyta sie je RAZ, wiec nie musza stac
 * na oczach przy kazdym ekranie - ale musza byc pod reka, i to bez wychodzenia
 * z aplikacji do plikow projektu.
 */

// Rozdzial wyszukujemy po TYTULE, nie po numerze. Publiczne README nie jest
// specyfikacja i nie numeruje rozdzialow - a gdyby numerowalo, kazde wstawienie
// czegos wyzej cicho psuloby te zakladke.
const SECTION = 'Poradnik'

export function GuideView() {
  const guide = useMemo(() => parseGuide(readme, SECTION), [])

  if (!guide) {
    return (
      <div className="guide">
        <div className="guide-page">
          <p>
            Nie udało się odczytać poradnika z pliku <code>README.md</code>. Poradnik jest
            w sekcji „1c. Poradnik — jak używać narzędzia”.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="guide">
      <article className="guide-page">
        <h1>{guide.title}</h1>
        {guide.blocks.map((block, index) => (
          <BlockView key={index} block={block} />
        ))}
        <p className="guide-source">
          Ten tekst pochodzi z pliku <code>README.md</code> — sekcja „{SECTION} {guide.title}”.
        </p>
      </article>
    </div>
  )
}

function BlockView({ block }: { block: Block }) {
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

/** Wspolny renderer tekstu w linii - korzysta z niego takze kompendium. */
export function Inline({ tokens }: { tokens: InlineToken[] }) {
  return (
    <>
      {tokens.map((token, index) => {
        switch (token.kind) {
          case 'strong':
            return <strong key={index}>{token.text}</strong>
          case 'em':
            return <em key={index}>{token.text}</em>
          case 'code':
            return <code key={index}>{token.text}</code>
          default:
            return <Fragment key={index}>{token.text}</Fragment>
        }
      })}
    </>
  )
}
