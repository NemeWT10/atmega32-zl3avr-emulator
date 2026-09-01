import { useMemo, useState } from 'react'
import { useSimulator } from '../sim/SimulationContext'
import { copyToClipboard } from '../clipboard'
import { openKompendium } from '../kompendium/navigation'
import { Fade } from '../kompendium/demos'
import {
  MODE_LABEL,
  TIMERS,
  formatHz,
  formatSeconds,
  generateCode,
  generateDividedCode,
  optionKey,
  solve,
  solveDivided,
  type CodeStyle,
  type ModeId,
  type TimerId,
  type TimerOption,
} from '../kalkulator/timer-math'

/**
 * Zakladka „Kalkulator timerow”.
 *
 * Na cwiczeniach polecenie pada w roznych postaciach: sam czas („mrugaj
 * co 100 ms”), czas z preskalerem, gotowe OCR do sprawdzenia. Kalkulator
 * przyjmuje DOWOLNY podzbior tych danych: co wpisane, jest wiazace,
 * a reszte wylicza i pokazuje wszystkie sensowne konfiguracje. Klikniecie
 * wiersza daje gotowa funkcje do wklejenia - z komentarzami albo bez.
 */
export function KalkulatorView() {
  const simulator = useSimulator()
  const boardClock = simulator.mcu.clockHz ?? 1_000_000

  const [fCpuText, setFCpuText] = useState(String(boardClock))
  const [timerId, setTimerId] = useState<TimerId>('TC0')
  const [mode, setMode] = useState<ModeId | ''>('')
  const [prescaler, setPrescaler] = useState<number>(0)
  const [targetText, setTargetText] = useState('')
  const [targetUnit, setTargetUnit] = useState<'s' | 'ms' | 'us' | 'hz'>('ms')
  const [valueText, setValueText] = useState('')
  /**
   * Ktory rejestr uzytkownik ZNA: '' = zaden (wylicz), 'ctc' = OCRx,
   * 'preload' = startowe TCNTx. Wybor rejestru to jednoczesnie deklaracja
   * trybu pracy, wiec oba pola trzymamy w zgodzie.
   */
  const [valueKind, setValueKind] = useState<'' | 'ctc' | 'preload'>('')
  const [style, setStyle] = useState<CodeStyle>('polling')
  const [withComments, setWithComments] = useState(true)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState<'single' | 'divided' | null>(null)

  const timer = TIMERS[timerId]
  const fCpu = parseNumber(fCpuText)

  const targetSeconds = useMemo(() => {
    const value = parseNumber(targetText)
    if (value === null || value <= 0) return null
    switch (targetUnit) {
      case 's':
        return value
      case 'ms':
        return value / 1000
      case 'us':
        return value / 1_000_000
      case 'hz':
        return 1 / value
    }
  }, [targetText, targetUnit])

  const countValue = useMemo(() => {
    if (valueKind === '') return null
    const value = parseNumber(valueText)
    if (value === null || value < 0 || !Number.isInteger(value)) return null
    return value
  }, [valueText, valueKind])

  const options = useMemo(
    () =>
      fCpu
        ? solve({
            fCpu,
            timer,
            targetSeconds,
            mode: mode === '' ? null : mode,
            prescaler: prescaler === 0 ? null : prescaler,
            countValue,
          })
        : [],
    [fCpu, timer, targetSeconds, mode, prescaler, countValue],
  )

  const selected: TimerOption | null =
    options.find((option) => optionKey(option) === selectedKey) ?? options[0] ?? null

  const code = selected && fCpu ? generateCode(selected, style, withComments, fCpu) : null

  /**
   * Gdy zaden wiersz nie trafia sensownie w cel, sprawdzamy pozostale liczniki.
   * Klasyka: 100 ms nie miesci sie w 8-bitowym TC0, a student nie wie,
   * ze o krok dalej czeka 16-bitowy TC1, ktory trafia co do tykniecia.
   */
  const bestErrorPercent = options.length
    ? Math.min(...options.map((option) => Math.abs(option.errorPercent)))
    : null
  const offTarget =
    targetSeconds !== null &&
    countValue === null &&
    (bestErrorPercent === null || bestErrorPercent > 0.5)
  const suggestion = useMemo(() => {
    if (!offTarget || fCpu === null || targetSeconds === null) return null
    for (const other of ['TC1', 'TC0', 'TC2'] as TimerId[]) {
      if (other === timerId) continue
      const alternative = solve({
        fCpu,
        timer: TIMERS[other],
        targetSeconds,
        mode: mode === '' ? null : mode,
        prescaler: null,
        countValue: null,
      })[0]
      if (alternative && Math.abs(alternative.errorPercent) <= 0.5) {
        return { timer: other, option: alternative }
      }
    }
    return null
  }, [offTarget, fCpu, targetSeconds, timerId, mode])

  const copy = async (which: 'single' | 'divided', text: string | null) => {
    if (!text) return
    setCopied((await copyToClipboard(text)) ? which : null)
    setTimeout(() => setCopied(null), 2500)
  }

  /**
   * Podzial programowy - pokazywany WYLACZNIE, gdy licznik przy zadanych
   * ograniczeniach jest za maly na ten czas (solveDivided zwraca null,
   * gdy cel miesci sie w jednym zdarzeniu).
   */
  const divided = useMemo(
    () =>
      fCpu
        ? solveDivided({
            fCpu,
            timer,
            targetSeconds,
            mode: mode === '' ? null : mode,
            prescaler: prescaler === 0 ? null : prescaler,
            countValue,
          })
        : null,
    [fCpu, timer, targetSeconds, mode, prescaler, countValue],
  )
  const dividedCode =
    divided && fCpu ? generateDividedCode(divided, style, withComments, fCpu) : null

  const nothingEntered = targetSeconds === null && countValue === null

  /** Wspolny pasek przelacznikow stylu kodu - ten sam nad oboma blokami. */
  const codeBar = (which: 'single' | 'divided', text: string | null) => (
    <div className="kalkulator-code-bar">
      <strong>Gotowy kod</strong>
      <div className="kalkulator-seg" role="radiogroup" aria-label="Sposób pracy">
        <label className={style === 'polling' ? 'on' : ''}>
          <input
            type="radio"
            name={`kalkulator-style-${which}`}
            checked={style === 'polling'}
            onChange={() => setStyle('polling')}
          />
          pętla sprawdzająca flagę
        </label>
        <label className={style === 'interrupt' ? 'on' : ''}>
          <input
            type="radio"
            name={`kalkulator-style-${which}`}
            checked={style === 'interrupt'}
            onChange={() => setStyle('interrupt')}
          />
          przerwanie (ISR)
        </label>
      </div>
      <label className={'kalkulator-comments' + (withComments ? ' on' : '')}>
        <input
          type="checkbox"
          checked={withComments}
          onChange={(event) => setWithComments(event.target.checked)}
        />
        z komentarzami
      </label>
      <button className="kalkulator-mini" onClick={() => copy(which, text)}>
        {copied === which ? 'Skopiowano ✓' : 'Kopiuj'}
      </button>
    </div>
  )

  return (
    <div className="kalkulator">
      <div className="kalkulator-form">
        <div className="kalkulator-header">
          <h2>Kalkulator timerów</h2>
          <KalkulatorHelp />
        </div>
        <p className="kalkulator-lead">
          Wpisz to, co znasz — resztę wyliczy. Teoria:{' '}
          <button className="kalkulator-chapter" onClick={() => openKompendium('timery')}>
            rozdział „Timery” w Kompendium
          </button>
          .
        </p>

        <label className="kalkulator-field">
          <span>
            Zegar F_CPU{' '}
            <em title="Rzeczywisty zegar ustawiają fuse bity — nie #define w kodzie.">
              (z fuse bitów płytki: {formatHz(boardClock)})
            </em>
          </span>
          <div className="kalkulator-fcpu">
            <input
              value={fCpuText}
              onChange={(event) => setFCpuText(event.target.value)}
              inputMode="numeric"
              aria-label="Częstotliwość zegara w hercach"
            />
            <span className="kalkulator-unit">Hz</span>
            {fCpu !== boardClock && (
              <button
                className="kalkulator-mini"
                onClick={() => setFCpuText(String(boardClock))}
                title="Przepisz częstotliwość ustawioną fuse bitami płytki"
              >
                z płytki
              </button>
            )}
          </div>
          <div className="kalkulator-presets">
            {[1, 2, 4, 8, 16].map((mhz) => (
              <button
                key={mhz}
                className={fCpu === mhz * 1_000_000 ? 'active' : ''}
                onClick={() => setFCpuText(String(mhz * 1_000_000))}
              >
                {mhz} MHz
              </button>
            ))}
          </div>
        </label>

        <label className="kalkulator-field">
          <span>Licznik</span>
          <select value={timerId} onChange={(event) => setTimerId(event.target.value as TimerId)}>
            <option value="TC0">TC0 — 8-bitowy (0–255)</option>
            <option value="TC1">TC1 — 16-bitowy (0–65535)</option>
            <option value="TC2">TC2 — 8-bitowy, więcej preskalerów</option>
          </select>
        </label>

        <label className="kalkulator-field">
          <span>
            Odstęp zdarzeń <em>(albo częstotliwość — wybierz jednostkę)</em>
          </span>
          <div className="kalkulator-target">
            <input
              value={targetText}
              onChange={(event) => setTargetText(event.target.value)}
              placeholder="np. 100"
              inputMode="decimal"
            />
            <select
              value={targetUnit}
              onChange={(event) => setTargetUnit(event.target.value as typeof targetUnit)}
            >
              <option value="ms">ms</option>
              <option value="us">µs</option>
              <option value="s">s</option>
              <option value="hz">Hz</option>
            </select>
          </div>
        </label>

        <label className="kalkulator-field">
          <span>Tryb pracy</span>
          <select
            value={mode}
            onChange={(event) => {
              const next = event.target.value as ModeId | ''
              setMode(next)
              // Wybrany rejestr przestaje pasowac do innego trybu.
              if (valueKind !== '' && next !== valueKind) setValueKind('')
            }}
          >
            <option value="">dowolny — pokaż wszystkie</option>
            <option value="ctc">{MODE_LABEL.ctc}</option>
            <option value="preload">{MODE_LABEL.preload}</option>
            <option value="overflow">{MODE_LABEL.overflow}</option>
          </select>
        </label>

        <label className="kalkulator-field">
          <span>Preskaler</span>
          <select
            value={prescaler}
            onChange={(event) => setPrescaler(Number(event.target.value))}
          >
            <option value={0}>dowolny — pokaż wszystkie</option>
            {timer.prescalers.map((value) => (
              <option key={value} value={value}>
                {value === 1 ? 'bez podziału (1)' : `÷${value}`}
              </option>
            ))}
          </select>
        </label>

        <label className="kalkulator-field">
          <span>
            Znana wartość rejestru <em>(gdy prowadzący podał gotową liczbę, np. „OCR0 = 124”)</em>
          </span>
          <div className="kalkulator-target">
            <select
              value={valueKind}
              onChange={(event) => {
                const kind = event.target.value as '' | 'ctc' | 'preload'
                setValueKind(kind)
                // Rejestr wskazuje tryb - ustawiamy go, zeby lista wynikow
                // pokazywala dokladnie te interpretacje.
                if (kind !== '') setMode(kind)
              }}
              aria-label="Który rejestr znasz"
            >
              <option value="">żadna — wylicz ją za mnie</option>
              <option value="ctc">{timer.compare} (tryb CTC)</option>
              <option value="preload">start {timer.counter} (przeładowanie)</option>
            </select>
            <input
              value={valueText}
              onChange={(event) => setValueText(event.target.value)}
              disabled={valueKind === ''}
              placeholder={valueKind === '' ? '—' : `0–${timer.max}, np. 124`}
              inputMode="numeric"
              aria-label="Wartość rejestru"
            />
          </div>
        </label>
      </div>

      <div className="kalkulator-results">
        {fCpu === null && (
          <p className="kalkulator-empty">Podaj częstotliwość zegara w hercach (np. 1000000).</p>
        )}
        {fCpu !== null && nothingEntered && (
          <div className="kalkulator-empty">
            <p>
              <strong>Od czego zacząć:</strong> wpisz odstęp zdarzeń (np. <code>100 ms</code>) —
              zobaczysz wszystkie konfiguracje, które w niego trafiają.
            </p>
            <p>
              Prowadzący podał więcej? Zablokuj tryb albo preskaler w polach obok. Podał gotowe{' '}
              <code>{timer.compare} = 124</code>? Wybierz ten rejestr w „Znana wartość rejestru”,
              wpisz liczbę, a kalkulator policzy czasy w drugą stronę.
            </p>
          </div>
        )}
        {fCpu !== null && !nothingEntered && options.length === 0 && (
          <div className="kalkulator-empty">
            <p>
              Ten czas nie mieści się w zakresie licznika {timer.id} przy wybranych ustawieniach.
            </p>
            <p>
              Spróbuj: większy preskaler, licznik 16-bitowy TC1 albo odliczaj programowo kilka
              krótszych zdarzeń (np. 10 × 100 ms).
            </p>
          </div>
        )}

        {offTarget && options.length > 0 && (
          <div className="kalkulator-warning">
            <p>
              Licznik {timer.id} nie trafia w {formatSeconds(targetSeconds!)} — najbliższa
              konfiguracja daje {formatSeconds(options[0].seconds)}. Poniższe wiersze pokazują,
              co NAPRAWDĘ da się z niego wycisnąć.
            </p>
            {suggestion && (
              <button className="kalkulator-mini" onClick={() => setTimerId(suggestion.timer)}>
                Przełącz na {suggestion.timer} —{' '}
                {suggestion.option.exact
                  ? 'trafia dokładnie'
                  : `błąd tylko ${Math.abs(suggestion.option.errorPercent).toLocaleString('pl-PL', { maximumFractionDigits: 2 })}%`}
              </button>
            )}
          </div>
        )}
        {offTarget && options.length === 0 && suggestion && (
          <div className="kalkulator-warning">
            <button className="kalkulator-mini" onClick={() => setTimerId(suggestion.timer)}>
              Przełącz na {suggestion.timer} —{' '}
              {suggestion.option.exact ? 'trafia dokładnie' : 'trafia z małym błędem'}
            </button>
          </div>
        )}

        {divided && dividedCode && (
          <div className="kalkulator-software">
            <h3>Ten czas nie mieści się w liczniku — odlicz go programowo</h3>
            <p>
              Ustaw krótsze zdarzenie co <strong>{formatSeconds(divided.base.seconds)}</strong>{' '}
              (
              {divided.base.mode === 'overflow' ? (
                <>pełny obieg przy preskalerze ÷{divided.base.prescaler}</>
              ) : (
                <code>
                  {divided.base.mode === 'ctc'
                    ? `${TIMERS[divided.base.timer].compare} = ${divided.base.value}`
                    : `${TIMERS[divided.base.timer].counter} = ${divided.base.value}`}
                  {', ÷'}
                  {divided.base.prescaler}
                </code>
              )}
              ), a <strong>zmienna globalna</strong> doliczy do{' '}
              <strong>{divided.repeats}</strong> takich zdarzeń — razem{' '}
              <strong>{formatSeconds(divided.totalSeconds)}</strong>
              {divided.exact
                ? ' (dokładnie co do taktu).'
                : ` (błąd ${divided.errorPercent > 0 ? '+' : ''}${divided.errorPercent.toLocaleString('pl-PL', { maximumFractionDigits: 3 })}%).`}
            </p>
            <div className="kalkulator-code">
              {codeBar('divided', dividedCode)}
              <pre>
                <code>{dividedCode}</code>
              </pre>
            </div>
          </div>
        )}

        {options.length > 0 && (
          <table className="kalkulator-table">
            <thead>
              <tr>
                <th>Tryb</th>
                <th>Preskaler</th>
                <th>Do wpisania</th>
                <th>Odstęp zdarzeń</th>
                <th>Częstotliwość</th>
                <th title="Odchyłka od podanego czasu">Błąd</th>
              </tr>
            </thead>
            <tbody>
              {options.map((option) => {
                const key = optionKey(option)
                const active = selected !== null && optionKey(selected) === key
                return (
                  <tr
                    key={key}
                    className={active ? 'active' : ''}
                    onClick={() => setSelectedKey(key)}
                  >
                    <td>{MODE_LABEL[option.mode]}</td>
                    <td>{option.prescaler === 1 ? '1' : `÷${option.prescaler}`}</td>
                    <td>
                      {option.mode === 'ctc' && <code>{TIMERS[option.timer].compare} = {option.value}</code>}
                      {option.mode === 'preload' && (
                        <code>{TIMERS[option.timer].counter} = {option.value}</code>
                      )}
                      {option.mode === 'overflow' && <span className="kalkulator-dim">nic — pełny obieg</span>}
                    </td>
                    <td>{formatSeconds(option.seconds)}</td>
                    <td>{formatHz(1 / option.seconds)}</td>
                    <td className={option.exact ? 'kalkulator-exact' : ''}>
                      {targetSeconds === null
                        ? '—'
                        : option.exact
                          ? 'dokładnie'
                          : `${option.errorPercent > 0 ? '+' : ''}${option.errorPercent.toLocaleString('pl-PL', { maximumFractionDigits: 2 })}%`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {selected && code && (
          <div className="kalkulator-code">
            {codeBar('single', code)}
            <pre>
              <code>{code}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

function parseNumber(text: string): number | null {
  const cleaned = text.trim().replace(/\s/g, '').replace(',', '.')
  if (cleaned === '') return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

/**
 * Ikona „?” z krotka sciaga i animowanym pokazem trybu CTC:
 * licznik rosnie, trafia w OCR, flaga blyska, licznik wraca do zera.
 */
function KalkulatorHelp() {
  const [open, setOpen] = useState(false)
  /**
   * Karta jest pozycjonowana WZGLEDEM OKNA (fixed), nie przycisku: formularz
   * jest przewijana kolumna o szerokosci 320 px, wiec karta zakotwiczona
   * w srodku bylaby przycinana na jego krawedzi.
   */
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)
  const place = (button: HTMLElement) => {
    const rect = button.getBoundingClientRect()
    setAnchor({
      top: rect.bottom + 8,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 356)),
    })
  }
  return (
    <div
      className="kalkulator-help"
      onPointerEnter={(event) => {
        place(event.currentTarget.querySelector('button')!)
        setOpen(true)
      }}
      onPointerLeave={() => setOpen(false)}
    >
      {open && anchor && (
        <div className="kalkulator-help-card" style={{ top: anchor.top, left: anchor.left }}>
          <KalkulatorDemo />
          <ol>
            <li>
              <strong>Wpisz, co znasz.</strong> Sam czas? Zostaw resztę na „dowolny”. Prowadzący
              podał preskaler albo tryb? Zablokuj je — lista się dopasuje.
            </li>
            <li>
              <strong>Masz gotowe OCR/TCNT?</strong> Wpisz je w „Wartość rejestru” — kalkulator
              policzy czas w drugą stronę.
            </li>
            <li>
              <strong>Kliknij wiersz</strong> — pod tabelą dostaniesz gotową funkcję. Przełącznik
              wybiera pętlę albo przerwanie, a pole obok dodaje komentarze.
            </li>
          </ol>
          <p className="kalkulator-help-note">
            „Błąd” to odchyłka od podanego czasu: licznik tyka całymi krokami, więc nie każdy czas
            da się trafić idealnie. Wiersze „dokładnie” trafiają co do tyknięcia.
          </p>
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        onClick={(event) => {
          place(event.currentTarget)
          setOpen((value) => !value)
        }}
        title="Jak używać kalkulatora?"
      >
        ?
      </button>
    </div>
  )
}

/** Pokaz: TCNT rosnie do OCR, flaga OCF blyska, licznik wraca do zera (CTC). */
function KalkulatorDemo() {
  const DUR = 6
  return (
    <svg viewBox="0 0 320 106" className="kdemo" role="img" aria-label="Pokaz trybu CTC">
      {/* osie */}
      <line x1={30} y1={66} x2={302} y2={66} stroke="#5a5a5a" strokeWidth={1.5} />
      <line x1={30} y1={72} x2={30} y2={10} stroke="#5a5a5a" strokeWidth={1.5} />
      <text x={6} y={14} className="kdemo-label">
        TCNT
      </text>
      {/* poziom OCR - podpis NAD linia, wewnatrz rysunku */}
      <line x1={30} y1={18} x2={302} y2={18} stroke="#ffd23e" strokeWidth={1} strokeDasharray="4 3" />
      <text x={300} y={12} textAnchor="end" className="kdemo-hit">
        poziom OCR
      </text>
      {/* dwa narastajace zeby licznika */}
      <g transform="translate(30,0)">
        <polygon points="0,66 0,66 0,66" fill="#4fb3ff" opacity={0.8}>
          <animate
            attributeName="points"
            dur={`${DUR}s`}
            repeatCount="indefinite"
            keyTimes="0;0.45;0.451;0.5;1"
            values="0,66 0,66 0,66;0,66 118,18 118,66;0,66 118,18 118,66;0,66 0,66 0,66;0,66 0,66 0,66"
          />
        </polygon>
        <polygon points="130,66 130,66 130,66" fill="#4fb3ff" opacity={0.8}>
          <animate
            attributeName="points"
            dur={`${DUR}s`}
            repeatCount="indefinite"
            keyTimes="0;0.5;0.95;0.951;1"
            values="130,66 130,66 130,66;130,66 130,66 130,66;130,66 248,18 248,66;130,66 130,66 130,66;130,66 130,66 130,66"
          />
        </polygon>
      </g>
      {/* blysk flagi przy trafieniu w OCR */}
      <g opacity={0}>
        <Fade dur={DUR} windows={[[0.45 * DUR - 0.05, 0.45 * DUR + 1.1]]} />
        <circle cx={148} cy={18} r={5} fill="#ffd23e" />
        <text x={154} y={40} className="kdemo-hit">
          flaga OCF = 1, licznik → 0
        </text>
      </g>
      <g opacity={0}>
        <Fade dur={DUR} windows={[[0.95 * DUR - 0.05, 0.95 * DUR + 0.35]]} />
        <circle cx={278} cy={18} r={5} fill="#ffd23e" />
        <text x={272} y={40} textAnchor="end" className="kdemo-hit">
          flaga OCF = 1, licznik → 0
        </text>
      </g>
      <text x={166} y={88} textAnchor="middle" className="kdemo-state">
        CTC: obieg trwa (OCR + 1) tyknięć
      </text>
      <text x={166} y={100} textAnchor="middle" className="kdemo-state">
        tyknięcie = preskaler / F_CPU
      </text>
    </svg>
  )
}
