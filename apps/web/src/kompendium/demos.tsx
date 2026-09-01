/**
 * Animowane pokazy do kompendium - odpowiednik "gifow", ale wektorowy.
 *
 * Ta sama decyzja co przy ikonie "?" na plytce: plik wideo trzeba by
 * renderowac od nowa przy kazdej zmianie wygladu, a animacja na ksztaltach
 * SVG jest ostra w kazdym powiekszeniu i wazy tyle co tekst. Uzywamy
 * deklaratywnych animacji SMIL (<animate>) zamiast petli JavaScriptu -
 * przegladarka prowadzi je sama, a po zamknieciu rozdzialu komponent
 * znika razem z calym kosztem.
 */

const ACCENT = '#4fb3ff'
const DIM = '#5a5a5a'
const ON = '#ffd23e'

/** Skrot: animacja opacity o stalych progach czasu (keyTimes 0..1). */
export function Fade({
  dur,
  windows,
  base = 0,
}: {
  dur: number
  /** Pary [start, koniec] w sekundach, w ktorych element jest widoczny. */
  windows: [number, number][]
  base?: number
}) {
  const points: { t: number; v: number }[] = [{ t: 0, v: base }]
  for (const [from, to] of windows) {
    points.push({ t: from / dur, v: base }, { t: from / dur + 0.001, v: 1 })
    points.push({ t: to / dur, v: 1 }, { t: to / dur + 0.001, v: base })
  }
  points.push({ t: 1, v: base })
  const sorted = points
    .filter((point) => point.t <= 1)
    .sort((a, b) => a.t - b.t)
  return (
    <animate
      attributeName="opacity"
      dur={`${dur}s`}
      repeatCount="indefinite"
      keyTimes={sorted.map((point) => point.t.toFixed(4)).join(';')}
      values={sorted.map((point) => point.v).join(';')}
    />
  )
}

/**
 * Skanowanie klawiatury matrycowej 4x4.
 *
 * Os czasu (12 s): kolumny K1..K4 dostaja stan niski po kolei (po 3 s).
 * W 4,8 s ktos wciska klawisz na przecieciu W2/K3 - gdy skan dochodzi
 * do K3 (6-9 s), wiersz W2 czyta zero i klawisz zostaje rozpoznany.
 */
export function KeyboardDemo() {
  const DUR = 12
  const keyX = (col: number) => 96 + col * 46
  const keyY = (row: number) => 44 + row * 32

  return (
    <svg viewBox="0 0 330 186" className="kdemo" role="img" aria-label="Pokaz skanowania klawiatury matrycowej">
      {/* linie kolumn (pionowe) i wierszy (poziome) */}
      {[0, 1, 2, 3].map((col) => (
        <g key={`k${col}`}>
          <line x1={keyX(col) + 14} y1={24} x2={keyX(col) + 14} y2={162} stroke={DIM} strokeWidth={2} />
          <line x1={keyX(col) + 14} y1={24} x2={keyX(col) + 14} y2={162} stroke={ACCENT} strokeWidth={2} opacity={0}>
            <Fade dur={DUR} windows={[[col * 3, col * 3 + 3]]} />
          </line>
          <text x={keyX(col) + 14} y={16} textAnchor="middle" className="kdemo-label">
            K{col + 1}
          </text>
          <text x={keyX(col) + 14} y={178} textAnchor="middle" className="kdemo-state" opacity={0}>
            0
            <Fade dur={DUR} windows={[[col * 3, col * 3 + 3]]} />
          </text>
        </g>
      ))}
      {[0, 1, 2, 3].map((row) => (
        <g key={`w${row}`}>
          <line x1={30} y1={keyY(row) + 11} x2={310} y2={keyY(row) + 11} stroke={DIM} strokeWidth={2} />
          <text x={14} y={keyY(row) + 15} textAnchor="middle" className="kdemo-label">
            W{row + 1}
          </text>
        </g>
      ))}
      {/* wiersz W2 "czyta zero", gdy aktywna jest K3 i klawisz wcisniety */}
      <line x1={30} y1={keyY(1) + 11} x2={310} y2={keyY(1) + 11} stroke={ON} strokeWidth={2.5} opacity={0}>
        <Fade dur={DUR} windows={[[6, 9]]} />
      </line>
      <text x={44} y={keyY(1) + 4} className="kdemo-hit" opacity={0}>
        W2 = 0
        <Fade dur={DUR} windows={[[6, 9]]} />
      </text>

      {/* klawisze */}
      {[0, 1, 2, 3].flatMap((row) =>
        [0, 1, 2, 3].map((col) => (
          <rect
            key={`${row}${col}`}
            x={keyX(col)}
            y={keyY(row)}
            width={28}
            height={22}
            rx={4}
            className="kdemo-key"
          />
        )),
      )}
      {/* wcisniecie: W2/K3 */}
      <g opacity={0}>
        <Fade dur={DUR} windows={[[4.8, 10.4]]} />
        <rect x={keyX(2)} y={keyY(1)} width={28} height={22} rx={4} fill={ON} opacity={0.28} />
        <circle cx={keyX(2) + 14} cy={keyY(1) + 11} r={7} fill={ON} />
      </g>
      <text x={keyX(2) + 14} y={keyY(1) - 6} textAnchor="middle" className="kdemo-hit" opacity={0}>
        rozpoznany: W2 × K3
        <Fade dur={DUR} windows={[[6, 9]]} />
      </text>
    </svg>
  )
}

/** Segmenty cyfry 7-seg: [x, y, szerokosc, wysokosc] wzgledem naroznika cyfry. */
const SEGMENT_SHAPES: Record<string, [number, number, number, number]> = {
  a: [6, 0, 24, 5],
  b: [30, 5, 5, 22],
  c: [30, 32, 5, 22],
  d: [6, 54, 24, 5],
  e: [1, 32, 5, 22],
  f: [1, 5, 5, 22],
  g: [6, 27, 24, 5],
}

const DIGIT_SEGMENTS: Record<string, string> = {
  '1': 'bc',
  '2': 'abged',
  '3': 'abgcd',
  '4': 'fgbc',
}

/**
 * Multipleksowanie wyswietlacza 7-segmentowego.
 *
 * Os czasu (12 s): najpierw "zwolnione tempo" - kazda cyfra swieci osobno
 * po 2 s (0-8 s), widac, ze w danej chwili aktywna jest JEDNA kolumna.
 * Potem odswiezanie "przyspiesza" i oko widzi wszystkie cyfry naraz (8-12 s).
 */
export function SevenSegDemo() {
  const DUR = 12
  const digits = ['1', '2', '3', '4']

  return (
    <svg viewBox="0 0 330 150" className="kdemo" role="img" aria-label="Pokaz multipleksowania wyświetlacza 7-segmentowego">
      {digits.map((digit, index) => {
        const x = 70 + index * 54
        const lit = DIGIT_SEGMENTS[digit]
        return (
          <g key={index}>
            {/* wszystkie segmenty jako tlo (zgaszone) */}
            {Object.entries(SEGMENT_SHAPES).map(([name, [sx, sy, w, h]]) => (
              <rect key={name} x={x + sx} y={20 + sy} width={w} height={h} rx={2} fill="#333" />
            ))}
            {/* segmenty tej cyfry - widoczne w jej oknie i w fazie szybkiej */}
            <g opacity={0}>
              <Fade dur={DUR} windows={[[index * 2, index * 2 + 2], [8, 12]]} />
              {lit.split('').map((name) => {
                const [sx, sy, w, h] = SEGMENT_SHAPES[name]
                return <rect key={name} x={x + sx} y={20 + sy} width={w} height={h} rx={2} fill={ON} />
              })}
            </g>
            {/* wybor kolumny (stan niski = aktywna) */}
            <rect x={x + 2} y={94} width={32} height={14} rx={4} className="kdemo-key" />
            <rect x={x + 2} y={94} width={32} height={14} rx={4} fill={ACCENT} opacity={0}>
              <Fade dur={DUR} windows={[[index * 2, index * 2 + 2], [8, 12]]} base={0} />
            </rect>
            <text x={x + 18} y={104.5} textAnchor="middle" className="kdemo-label">
              C{index + 1}
            </text>
          </g>
        )
      })}
      <text x={165} y={128} textAnchor="middle" className="kdemo-hit" opacity={0}>
        zwolnione tempo: świeci jedna cyfra naraz
        <Fade dur={DUR} windows={[[0, 8]]} />
      </text>
      <text x={165} y={128} textAnchor="middle" className="kdemo-hit" opacity={0}>
        pełna prędkość (&gt;50 obiegów/s): oko widzi wszystkie
        <Fade dur={DUR} windows={[[8, 12]]} />
      </text>
      <text x={165} y={144} textAnchor="middle" className="kdemo-state">
        wspólna anoda — zero zapala segment, zero uaktywnia kolumnę
      </text>
    </svg>
  )
}

/**
 * Zapis do wyswietlacza HD44780: znaki pojawiaja sie jeden po drugim,
 * kursor wedruje, a po koncu pierwszej linii skacze pod adres 0x40.
 */
export function LcdDemo() {
  const DUR = 10
  const CELL = 17
  const line1 = 'WITAJ!'
  const line2 = 'LINIA 2'
  const cellX = (index: number) => 30 + index * CELL
  const charAppears = (index: number, offset: number) => offset + index * 0.55

  return (
    <svg viewBox="0 0 330 128" className="kdemo" role="img" aria-label="Pokaz zapisu na wyświetlacz LCD">
      <rect x={16} y={14} width={298} height={78} rx={6} fill="#17331d" stroke="#0c1f10" strokeWidth={3} />
      {Array.from({ length: 16 }, (_, index) => (
        <g key={index}>
          <rect x={cellX(index)} y={24} width={CELL - 3} height={26} rx={2} fill="#1d4526" opacity={0.5} />
          <rect x={cellX(index)} y={56} width={CELL - 3} height={26} rx={2} fill="#1d4526" opacity={0.5} />
        </g>
      ))}
      {/* linia 1: znaki wpisywane kolejno */}
      {line1.split('').map((char, index) => (
        <text key={index} x={cellX(index) + 7} y={43} textAnchor="middle" className="kdemo-lcd" opacity={0}>
          {char}
          <Fade dur={DUR} windows={[[charAppears(index, 0.6), DUR]]} />
        </text>
      ))}
      {/* kursor linii 1: stoi na komorce, ktora zaraz dostanie znak */}
      {line1.split('').map((_, index) => (
        <rect key={index} x={cellX(index) + 1} y={44} width={CELL - 5} height={4} fill={ON} opacity={0}>
          <Fade dur={DUR} windows={[[charAppears(index, 0.05), charAppears(index, 0.6)]]} />
        </rect>
      ))}
      {/* skok kursora do drugiej linii */}
      <text x={165} y={108} textAnchor="middle" className="kdemo-hit" opacity={0}>
        komenda 0x80 + 0x40: kursor na początek drugiej linii
        <Fade dur={DUR} windows={[[4.1, 6]]} />
      </text>
      {/* linia 2 */}
      {line2.split('').map((char, index) => (
        <text key={index} x={cellX(index) + 7} y={75} textAnchor="middle" className="kdemo-lcd" opacity={0}>
          {char}
          <Fade dur={DUR} windows={[[charAppears(index, 5.2), DUR]]} />
        </text>
      ))}
      {line2.split('').map((_, index) => (
        <rect key={index} x={cellX(index) + 1} y={76} width={CELL - 5} height={4} fill={ON} opacity={0}>
          <Fade dur={DUR} windows={[[charAppears(index, 4.65), charAppears(index, 5.2)]]} />
        </rect>
      ))}
    </svg>
  )
}

/** Mapa identyfikatorow z `{{demo:...}}` na komponenty. */
export const DEMOS: Record<string, () => JSX.Element> = {
  klawiatura: KeyboardDemo,
  'wyswietlacz-7seg': SevenSegDemo,
  lcd: LcdDemo,
}
