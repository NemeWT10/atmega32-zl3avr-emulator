/**
 * Analiza kodu studenta - błędy, ostrzeżenia i podpowiedzi.
 *
 * Trzy warstwy, kazda o innym zrodle:
 *   C       - typowe potkniecia skladniowe jezyka,
 *   AVR     - semantyka rejestrow i biblioteki avr-libc,
 *   Plytka  - kontekst SPRZETOWY: zworki, fuse bity i PRZEWODY poprowadzone
 *             na plytce w tej chwili.
 *
 * Trzecia warstwa jest tym, czego nie da zaden kompilator. Kod moze byc idealnie
 * poprawny i nadal nie dzialac, bo rozwarta jest zworka JP4, fuse JTAGEN zabral
 * linie portu C albo - najczesciej ze wszystkiego - z uzywanego portu nie wychodzi
 * ani jeden przewod. Zamiast pozwolic studentowi stracic na tym godzine, mowimy
 * mu o tym od razu w edytorze.
 *
 * Zasada nadrzedna: FALSZYWE ALARMY SA GORSZE NIZ BRAK OSTRZEZENIA.
 * Kazda regula jest celowo ostrozna - lepiej przepuscic blad, niz podwazac
 * poprawny kod i uczyc ignorowania komunikatow.
 */

import type { PortName, WiringSummary } from '@zl3avr/board'

export type DiagnosticSeverity = 'error' | 'warning' | 'info'
export type DiagnosticSource = 'C' | 'AVR' | 'Płytka' | 'Kompilator'

export interface Diagnostic {
  /** Numer linii liczony od jedynki. */
  line: number
  column: number
  endColumn: number
  severity: DiagnosticSeverity
  source: DiagnosticSource
  message: string
  /** Co z tym zrobic. */
  hint?: string
}

export interface HardwareContext {
  /** Rzeczywista czestotliwosc z fuse bitow (null = brak zegara). */
  clockHz: number | null
  jtagEnabled: boolean
  jumpers: { JP3: boolean; JP4: boolean; JP25: boolean }
  /**
   * Przewody poprowadzone na plytce, zebrane po portach (`describeWiring`).
   *
   * `undefined` znaczy „nie wiem, jak plytka jest polaczona” - wtedy reguly
   * dotyczace przewodow milcza. Lepiej nie powiedziec nic, niz zarzucic brak
   * przewodu komus, kogo plytki nie widzimy.
   */
  wiring?: WiringSummary
}

interface Line {
  /** Tresc bez komentarzy i zawartosci literalow tekstowych. */
  code: string
  raw: string
  number: number
}

/** Rejestry ATmega32 - uzywane do wykrycia braku naglowka i literowek. */
const KNOWN_REGISTERS = new Set([
  'SREG', 'SPL', 'SPH', 'OCR0', 'GICR', 'GIFR', 'TIMSK', 'TIFR', 'SPMCR', 'TWCR',
  'MCUCR', 'MCUCSR', 'TCCR0', 'TCNT0', 'OSCCAL', 'SFIOR', 'TCCR1A', 'TCCR1B',
  'TCNT1', 'TCNT1H', 'TCNT1L', 'OCR1A', 'OCR1AH', 'OCR1AL', 'OCR1B', 'OCR1BH',
  'OCR1BL', 'ICR1', 'ICR1H', 'ICR1L', 'TCCR2', 'TCNT2', 'OCR2', 'ASSR', 'WDTCR',
  'UBRRH', 'UBRRL', 'UCSRA', 'UCSRB', 'UCSRC', 'UDR', 'SPCR', 'SPSR', 'SPDR',
  'ACSR', 'ADMUX', 'ADCSRA', 'ADCH', 'ADCL', 'ADC', 'TWDR', 'TWAR', 'TWSR', 'TWBR',
  'EECR', 'EEDR', 'EEARL', 'EEARH', 'EEAR',
  'PORTA', 'DDRA', 'PINA', 'PORTB', 'DDRB', 'PINB',
  'PORTC', 'DDRC', 'PINC', 'PORTD', 'DDRD', 'PIND',
])

/** Nazwy z nowszych ukladow (ATmega328P) - czesty efekt kopiowania kodu z internetu. */
const WRONG_FAMILY: Record<string, string> = {
  TIMSK0: 'TIMSK', TIMSK1: 'TIMSK', TIMSK2: 'TIMSK',
  TIFR0: 'TIFR', TIFR1: 'TIFR', TIFR2: 'TIFR',
  EIMSK: 'GICR', EIFR: 'GIFR', EICRA: 'MCUCR',
  UCSR0A: 'UCSRA', UCSR0B: 'UCSRB', UCSR0C: 'UCSRC',
  UBRR0H: 'UBRRH', UBRR0L: 'UBRRL', UDR0: 'UDR',
  TCCR0A: 'TCCR0', TCCR0B: 'TCCR0', OCR0A: 'OCR0', OCR0B: 'OCR0',
  TCCR2A: 'TCCR2', TCCR2B: 'TCCR2', OCR2A: 'OCR2', OCR2B: 'OCR2',
  ADCSRB: '— ATmega32 nie ma tego rejestru', PRR: '— ATmega32 nie ma tego rejestru',
}

/**
 * Nazwy przerwan z nowszych ukladow.
 *
 * To pulapka gorsza niz zly rejestr: avr-gcc zglasza tylko OSTRZEZENIE
 * („misspelled signal handler”), program buduje sie normalnie i po prostu
 * nigdy nie wchodzi w te funkcje. Student widzi „skompilowalo sie”
 * i szuka bledu w zupelnie innym miejscu.
 *
 * Zrodlo nazw: naglowki avr-libc `avr/iom32.h` (ATmega32) oraz `avr/iom328p.h`.
 */
const WRONG_VECTORS: Record<string, string> = {
  TIMER0_COMPA_vect: 'TIMER0_COMP_vect',
  TIMER0_COMPB_vect: '— licznik TC0 w ATmega32 ma tylko jeden komparator (TIMER0_COMP_vect)',
  TIMER2_COMPA_vect: 'TIMER2_COMP_vect',
  TIMER2_COMPB_vect: '— licznik TC2 w ATmega32 ma tylko jeden komparator (TIMER2_COMP_vect)',
  USART_RX_vect: 'USART_RXC_vect',
  USART_TX_vect: 'USART_TXC_vect',
  USART0_RX_vect: 'USART_RXC_vect',
  USART0_TX_vect: 'USART_TXC_vect',
  USART0_UDRE_vect: 'USART_UDRE_vect',
  ANALOG_COMP_vect: 'ANA_COMP_vect',
  EE_READY_vect: 'EE_RDY_vect',
  SPM_READY_vect: 'SPM_RDY_vect',
  PCINT0_vect: '— ATmega32 nie ma przerwan od zmiany stanu pinu, tylko INT0, INT1 i INT2',
  PCINT1_vect: '— ATmega32 nie ma przerwan od zmiany stanu pinu, tylko INT0, INT1 i INT2',
  PCINT2_vect: '— ATmega32 nie ma przerwan od zmiany stanu pinu, tylko INT0, INT1 i INT2',
  WDT_vect: '— watchdog w ATmega32 tylko zeruje uklad, nie zglasza przerwania',
}

/**
 * Wektor przerwania → rejestr i bit, ktory to przerwanie odblokowuje.
 *
 * Z tej mapy zyja dwie reguly-lustra:
 *  - bit wlaczony, a procedury ISR nigdzie nie ma → program przy pierwszym
 *    przerwaniu skacze do pustego wektora i avr-libc zaczyna go OD NOWA
 *    (wyglada jak samoczynny restart — jeden z najtrudniejszych bledow
 *    do znalezienia golym okiem),
 *  - procedura ISR jest, ale bitu nikt nie ustawia → przerwanie nigdy
 *    sie nie wykona i kod wyglada na „zepsuty bez powodu".
 *
 * Zrodlo przyporzadkowania: datasheet ATmega32, rozdzialy o TIMSK, GICR,
 * UCSRB i rejestrach pozostalych peryferiow.
 */
const VECTOR_ENABLE: Record<string, { register: string; bit: string; event: string }> = {
  TIMER0_COMP_vect: { register: 'TIMSK', bit: 'OCIE0', event: 'porównanie licznika TC0' },
  TIMER0_OVF_vect: { register: 'TIMSK', bit: 'TOIE0', event: 'przepełnienie licznika TC0' },
  TIMER1_CAPT_vect: { register: 'TIMSK', bit: 'TICIE1', event: 'przechwycenie stanu licznika TC1' },
  TIMER1_COMPA_vect: { register: 'TIMSK', bit: 'OCIE1A', event: 'porównanie A licznika TC1' },
  TIMER1_COMPB_vect: { register: 'TIMSK', bit: 'OCIE1B', event: 'porównanie B licznika TC1' },
  TIMER1_OVF_vect: { register: 'TIMSK', bit: 'TOIE1', event: 'przepełnienie licznika TC1' },
  TIMER2_COMP_vect: { register: 'TIMSK', bit: 'OCIE2', event: 'porównanie licznika TC2' },
  TIMER2_OVF_vect: { register: 'TIMSK', bit: 'TOIE2', event: 'przepełnienie licznika TC2' },
  INT0_vect: { register: 'GICR', bit: 'INT0', event: 'przerwanie zewnętrzne INT0' },
  INT1_vect: { register: 'GICR', bit: 'INT1', event: 'przerwanie zewnętrzne INT1' },
  INT2_vect: { register: 'GICR', bit: 'INT2', event: 'przerwanie zewnętrzne INT2' },
  USART_RXC_vect: { register: 'UCSRB', bit: 'RXCIE', event: 'odebranie znaku przez USART' },
  USART_TXC_vect: { register: 'UCSRB', bit: 'TXCIE', event: 'koniec nadawania przez USART' },
  USART_UDRE_vect: { register: 'UCSRB', bit: 'UDRIE', event: 'pusty bufor nadawania USART' },
  ADC_vect: { register: 'ADCSRA', bit: 'ADIE', event: 'koniec pomiaru przetwornika ADC' },
  SPI_STC_vect: { register: 'SPCR', bit: 'SPIE', event: 'koniec transmisji SPI' },
  TWI_vect: { register: 'TWCR', bit: 'TWIE', event: 'zdarzenie magistrali TWI' },
  EE_RDY_vect: { register: 'EECR', bit: 'EERIE', event: 'gotowość pamięci EEPROM' },
  ANA_COMP_vect: { register: 'ACSR', bit: 'ACIE', event: 'komparator analogowy' },
}

/**
 * Rejestry 8-bitowe, dla ktorych pilnujemy zakresu wartosci i numerow bitow.
 *
 * To KNOWN_REGISTERS bez nazw zlozonych z dwoch rejestrow (TCNT1, OCR1A/B,
 * ICR1, ADC, EEAR) - te avr-libc skleja w pary 16-bitowe i wieksze wartosci
 * sa tam poprawne.
 */
const EIGHT_BIT_REGISTERS = new Set(
  [...KNOWN_REGISTERS].filter(
    (name) => !['TCNT1', 'OCR1A', 'OCR1B', 'ICR1', 'ADC', 'EEAR'].includes(name),
  ),
)

/** Usuwa komentarze i tresc literalow, zeby reguly nie reagowaly na tekst w cudzyslowie. */
function stripNoise(source: string): Line[] {
  const lines: Line[] = []
  let inBlockComment = false

  source.split(/\r?\n/).forEach((raw, index) => {
    let code = ''
    let i = 0
    while (i < raw.length) {
      if (inBlockComment) {
        if (raw.startsWith('*/', i)) {
          inBlockComment = false
          i += 2
        } else {
          i++
        }
        continue
      }
      if (raw.startsWith('/*', i)) {
        inBlockComment = true
        i += 2
        continue
      }
      if (raw.startsWith('//', i)) break
      if (raw[i] === '"' || raw[i] === "'") {
        const quote = raw[i]
        code += quote
        i++
        while (i < raw.length && raw[i] !== quote) {
          if (raw[i] === '\\') i++
          i++
        }
        code += quote
        i++
        continue
      }
      code += raw[i]
      i++
    }
    lines.push({ code, raw, number: index + 1 })
  })

  return lines
}

function add(
  list: Diagnostic[],
  line: Line,
  match: string,
  severity: DiagnosticSeverity,
  source: DiagnosticSource,
  message: string,
  hint?: string,
): void {
  const column = Math.max(1, line.code.indexOf(match) + 1)
  list.push({
    line: line.number,
    column,
    endColumn: column + Math.max(1, match.length),
    severity,
    source,
    message,
    hint,
  })
}

export function analyse(
  source: string,
  hardware: HardwareContext,
  /**
   * Pozostale pliki projektu sklejone w jeden tekst.
   *
   * Bez nich analiza widzi wylacznie otwarty plik i zglasza falszywe alarmy:
   * program ustawiajacy DDRB w osobnym sterowniku dostawal ostrzezenie
   * "nigdzie nie ustawiasz DDRB". A falszywy alarm jest gorszy niz brak
   * ostrzezenia - uczy ignorowania komunikatow.
   */
  otherSources = '',
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const lines = stripNoise(source)
  const code = lines.map((line) => line.code).join('\n')

  const has = (pattern: RegExp) => pattern.test(code)
  const includes = {
    io: has(/#\s*include\s*[<"]avr\/io\.h[>"]/),
    delay: has(/#\s*include\s*[<"](util|avr)\/delay\.h[>"]/),
    interrupt: has(/#\s*include\s*[<"]avr\/interrupt\.h[>"]/),
    stdio: has(/#\s*include\s*[<"]stdio\.h[>"]/),
    pgmspace: has(/#\s*include\s*[<"]avr\/pgmspace\.h[>"]/),
  }

  const fCpuMatch = /#\s*define\s+F_CPU\s+([0-9]+)/.exec(code)
  const declaredFCpu = fCpuMatch ? Number(fCpuMatch[1]) : null

  /**
   * Caly projekt - do pytan w rodzaju "czy GDZIEKOLWIEK ustawiono DDRB",
   * ktore nie moga byc rozstrzygane w granicach jednego pliku.
   */
  const projectCode = otherSources
    ? code + '\n' + stripNoise(otherSources).map((line) => line.code).join('\n')
    : code

  checkBalance(lines, diagnostics)
  checkStatements(lines, diagnostics)
  checkAvrSemantics(lines, diagnostics, includes, declaredFCpu, code, projectCode)
  checkHardware(lines, diagnostics, hardware, declaredFCpu, projectCode)

  return diagnostics.sort((a, b) => a.line - b.line || a.column - b.column)
}

// ---------------------------------------------------------------------------
// Warstwa 1: skladnia C
// ---------------------------------------------------------------------------

function checkBalance(lines: Line[], diagnostics: Diagnostic[]): void {
  const stack: { char: string; line: Line; column: number }[] = []
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

  for (const line of lines) {
    for (let i = 0; i < line.code.length; i++) {
      const char = line.code[i]
      if (char === '(' || char === '[' || char === '{') {
        stack.push({ char, line, column: i + 1 })
      } else if (char === ')' || char === ']' || char === '}') {
        const top = stack.pop()
        if (!top || top.char !== pairs[char]) {
          diagnostics.push({
            line: line.number,
            column: i + 1,
            endColumn: i + 2,
            severity: 'error',
            source: 'C',
            message: `Nadmiarowy nawias „${char}” — nie ma pasującego nawiasu otwierającego.`,
            hint: 'Sprawdź, czy wyżej nie brakuje nawiasu otwierającego albo czy jeden nie został zamknięty dwa razy.',
          })
          return
        }
      }
    }
  }

  if (stack.length > 0) {
    const unclosed = stack[stack.length - 1]
    diagnostics.push({
      line: unclosed.line.number,
      column: unclosed.column,
      endColumn: unclosed.column + 1,
      severity: 'error',
      source: 'C',
      message: `Nawias „${unclosed.char}” otwarty tutaj nie został zamknięty.`,
      hint:
        unclosed.char === '{'
          ? 'Każdej klamrze otwierającej blok musi odpowiadać klamra zamykająca. Sprawdź wcięcia — zwykle od razu widać, gdzie brakuje.'
          : 'Policz nawiasy w tym wyrażeniu.',
    })
  }
}

const CONTROL_KEYWORDS = /^\s*(if|else|for|while|switch|case|default|do)\b/

/**
 * Czy linia ma postac `if (...)` zakonczona srednikiem zamiast instrukcji.
 *
 * Zwykle wyrazenie regularne tego nie rozstrzygnie, bo nie umie liczyc
 * nawiasow: w linii `if (x & 1) PORT |= (1 << 3);` ostatni nawias zamykajacy
 * nalezy do przesuniecia, a nie do warunku - i naiwna regula zglaszala tu blad
 * w poprawnym kodzie. Dlatego przechodzimy po znakach i szukamy nawiasu
 * domykajacego WARUNEK.
 */
function emptyIfBody(code: string): boolean {
  const start = /\bif\s*\(/.exec(code)
  if (!start) return false
  let depth = 0
  for (let i = start.index + start[0].length - 1; i < code.length; i++) {
    if (code[i] === '(') depth++
    else if (code[i] === ')') {
      depth--
      if (depth === 0) return /^\s*;/.test(code.slice(i + 1))
    }
  }
  return false
}

function checkStatements(lines: Line[], diagnostics: Diagnostic[]): void {
  lines.forEach((line, index) => {
    const trimmed = line.code.trim()
    if (trimmed === '' || trimmed.startsWith('#')) return

    // --- pusta instrukcja po warunku: if (...) ;
    //
    // Tylko `if`. Pusta petla `while (warunek);` to normalny sposob czekania
    // na zdarzenie i wystepuje w polowie kodow z laboratorium - ostrzeganie
    // przed nia byloby czystym falszywym alarmem.
    if (emptyIfBody(trimmed)) {
      add(
        diagnostics,
        line,
        ';',
        'warning',
        'C',
        'Średnik zaraz po „if” tworzy pustą instrukcję — blok poniżej wykona się ZAWSZE.',
        'Usuń średnik po nawiasie zamykającym warunek.',
      )
    }

    // --- przypisanie w warunku: if (x = 1)
    const assignInCondition = /\b(if|while)\s*\(\s*[A-Za-z_][A-Za-z0-9_]*\s*=[^=]/.exec(trimmed)
    if (assignInCondition) {
      add(
        diagnostics,
        line,
        assignInCondition[0],
        'warning',
        'C',
        'W warunku jest przypisanie „=”, a nie porównanie „==”.',
        'Przypisanie zwraca przypisaną wartość, więc warunek prawie zawsze będzie prawdziwy. Jeśli to celowe, otocz je dodatkowym nawiasem.',
      )
    }

    // --- brak srednika: linia z przypisaniem albo wywolaniem, zakonczona bez znaku konca
    const next = lines[index + 1]
    const endsOpen = !/[;{}(,:\\]$/.test(trimmed) && !trimmed.endsWith(')')
    const looksLikeStatement = /^[A-Za-z_][A-Za-z0-9_ \t*[\]]*=[^=]/.test(trimmed)
    const nextStartsFresh = !next || /^\s*[A-Za-z_}#]/.test(next.code)
    if (endsOpen && looksLikeStatement && nextStartsFresh && !CONTROL_KEYWORDS.test(trimmed)) {
      add(
        diagnostics,
        line,
        trimmed.slice(-1),
        'error',
        'C',
        'Prawdopodobnie brakuje średnika na końcu instrukcji.',
        'W języku C każda instrukcja kończy się średnikiem. Kompilator zgłosi błąd dopiero w NASTĘPNEJ linii, więc szukaj o jedną wyżej.',
      )
    }
  })
}

// ---------------------------------------------------------------------------
// Warstwa 2: semantyka AVR
// ---------------------------------------------------------------------------

function checkAvrSemantics(
  lines: Line[],
  diagnostics: Diagnostic[],
  includes: { io: boolean; delay: boolean; interrupt: boolean; stdio: boolean; pgmspace: boolean },
  declaredFCpu: number | null,
  code: string,
  /** Kod wszystkich plikow projektu - sterownik moze siedziec w innym pliku. */
  projectCode: string,
): void {
  const writtenDirections = new Set<string>()
  const writtenPorts = new Set<string>()
  let usesInterrupts = false
  let hasSei = false

  for (const line of lines) {
    const trimmed = line.code.trim()

    // --- rejestry z innego ukladu
    for (const [wrong, right] of Object.entries(WRONG_FAMILY)) {
      const pattern = new RegExp(`\\b${wrong}\\b`)
      if (pattern.test(trimmed)) {
        add(
          diagnostics,
          line,
          wrong,
          'error',
          'AVR',
          `ATmega32 nie ma rejestru ${wrong} — to nazwa z nowszych układów (np. ATmega328P).`,
          `Odpowiednik w ATmega32 to ${right}.`,
        )
      }
    }

    // --- przerwanie o nazwie z innego ukladu
    for (const [wrong, right] of Object.entries(WRONG_VECTORS)) {
      if (!new RegExp(`\\b${wrong}\\b`).test(trimmed)) continue
      add(
        diagnostics,
        line,
        wrong,
        'error',
        'AVR',
        `ATmega32 nie ma przerwania ${wrong} — to nazwa z nowszego układu.`,
        `Odpowiednik w ATmega32 to ${right}. Uwaga: kompilator zgłosi tu tylko ostrzeżenie, ` +
          'program się zbuduje i po prostu NIGDY nie wejdzie w tę procedurę.',
      )
    }

    // --- PROGMEM bez naglowka
    if (/\b(PROGMEM|pgm_read_(byte|word|dword|float))\b/.test(trimmed) && !includes.pgmspace) {
      add(
        diagnostics,
        line,
        /\bPROGMEM\b/.test(trimmed) ? 'PROGMEM' : 'pgm_read',
        'error',
        'AVR',
        'Zapis danych w pamięci programu wymaga nagłówka <avr/pgmspace.h>.',
        'Dopisz na górze pliku: `#include <avr/pgmspace.h>`',
      )
    }

    // --- liczba zmiennoprzecinkowa w printf
    //
    // Formatu szukamy w linii ORYGINALNEJ: `stripNoise` czysci wnetrze
    // cudzyslowow, wiec w `line.code` nie ma juz „%f”.
    const printsFloat =
      /\b(s?n?printf|fprintf)\s*\(/.test(trimmed) && /%[-+ 0-9.#]*[fgeFGE]\b/.test(line.raw)
    if (printsFloat) {
      add(
        diagnostics,
        line,
        '%',
        'warning',
        'AVR',
        'Standardowe printf w avr-libc NIE drukuje liczb zmiennoprzecinkowych — w tym miejscu pojawi się znak „?”.',
        'Albo policz i wypisz część całkowitą i ułamkową osobno (`%d.%02d`), albo dołącz do konsolidacji ' +
          'pełną wersję: `-Wl,-u,vfprintf -lprintf_flt -lm`.',
      )
    }

    // --- kasowanie flag przez zerowanie bitu
    const wrongClear = /\b(TIFR|GIFR)\s*&=\s*~/.exec(trimmed)
    if (wrongClear) {
      add(
        diagnostics,
        line,
        wrongClear[0],
        'warning',
        'AVR',
        `Tak nie skasujesz flagi w ${wrongClear[1]} — zapis zera nie robi nic.`,
        `Flagi przerwań kasuje się ZAPISEM JEDYNKI: \`${wrongClear[1]} = (1 << FLAGA);\``,
      )
    }

    // --- zapis do PINx
    const pinWrite = /\bPIN([A-D])\s*(\||&|\^)?=[^=]/.exec(trimmed)
    if (pinWrite) {
      add(
        diagnostics,
        line,
        pinWrite[0],
        'error',
        'AVR',
        `Zapis do PIN${pinWrite[1]} nic nie da — ATmega32 nie obsługuje przełączania linii tą drogą.`,
        `Ten sposób działa dopiero w nowszych układach. Użyj \`PORT${pinWrite[1]} ^= maska;\``,
      )
    }

    // --- odczyt wejsc z PORTx zamiast PINx
    const readFromPort = /\b(if|while)\s*\(.*\bPORT([A-D])\s*&/.exec(trimmed)
    if (readFromPort) {
      add(
        diagnostics,
        line,
        `PORT${readFromPort[2]}`,
        'warning',
        'AVR',
        `Stan wejść czyta się z PIN${readFromPort[2]}, a nie z PORT${readFromPort[2]}.`,
        `PORT${readFromPort[2]} pokazuje to, co program wystawił na wyjścia (albo stan pull-upów). ` +
          `Rzeczywisty poziom na wyprowadzeniu jest w PIN${readFromPort[2]}.`,
      )
    }

    // --- UCSRC bez URSEL
    if (/\bUCSRC\s*=/.test(trimmed) && !/URSEL/.test(trimmed)) {
      add(
        diagnostics,
        line,
        'UCSRC',
        'error',
        'AVR',
        'Zapis do UCSRC bez bitu URSEL trafi do UBRRH i zepsuje prędkość transmisji.',
        'UCSRC i UBRRH leżą pod tym samym adresem. Poprawnie: `UCSRC = (1 << URSEL) | (1 << UCSZ1) | (1 << UCSZ0);`',
      )
    }

    // --- wartosc nie miesci sie w rejestrze 8-bitowym
    //
    // Tylko literaly liczbowe: o wyrazeniach i zmiennych nie da sie orzec
    // bez wykonania programu, a falszywy alarm jest gorszy niz brak ostrzezenia.
    for (const literalWrite of trimmed.matchAll(
      /\b([A-Z][A-Z0-9]{1,7})\s*=\s*(0[xX][0-9a-fA-F]+|\d+)\s*[;,)]/g,
    )) {
      if (!EIGHT_BIT_REGISTERS.has(literalWrite[1]) || Number(literalWrite[2]) <= 255) continue
      const register = literalWrite[1]
      const isTimerValue = /^(OCR0|OCR2|TCNT0|TCNT2)$/.test(register)
      add(
        diagnostics,
        line,
        literalWrite[0],
        'error',
        'AVR',
        `${register} jest rejestrem 8-bitowym — wartość ${literalWrite[2]} się w nim nie zmieści.`,
        isTimerValue
          ? 'Zwiększ preskaler albo wydłuż odmierzany czas tak, żeby wynik zmieścił się w przedziale 0–255. ' +
            'Do dłuższych czasów służy 16-bitowy licznik TC1 (OCR1A mieści 0–65535).'
          : 'Rejestr mieści wartości 0–255. Starsze bity zapisu po prostu przepadną.',
      )
    }

    // --- przesuniecie jedynki poza rejestr 8-bitowy: (1 << 9)
    const shiftTarget = /\b([A-Z][A-Z0-9]{1,7})\s*[|^]?=(?!=)/.exec(trimmed)
    if (shiftTarget && EIGHT_BIT_REGISTERS.has(shiftTarget[1])) {
      const badShift = /\b1\s*<<\s*(\d+)/g
      let shift: RegExpExecArray | null
      while ((shift = badShift.exec(trimmed)) !== null) {
        if (Number(shift[1]) <= 7) continue
        add(
          diagnostics,
          line,
          shift[0],
          'error',
          'AVR',
          `W rejestrze ${shiftTarget[1]} nie ma bitu ${shift[1]} — bity numeruje się od 0 do 7.`,
          '`1 << n` przesuwa jedynkę na pozycję n. W rejestrze 8-bitowym pozycje 8 i wyższe ' +
            'wypadają poza rejestr, więc taki zapis niczego nie zmienia.',
        )
        break
      }
    }

    // --- zbieranie informacji do kontroli calego pliku
    const ddr = /\bDDR([A-D])\s*[|&^]?=/.exec(trimmed)
    if (ddr) writtenDirections.add(ddr[1])
    const port = /\bPORT([A-D])\s*[|&^]?=/.exec(trimmed)
    if (port) writtenPorts.add(port[1])
    if (/\bISR\s*\(/.test(trimmed)) usesInterrupts = true
    if (/\bsei\s*\(\s*\)/.test(trimmed)) hasSei = true

    // --- naglowki
    if (/\b_delay_(ms|us)\s*\(/.test(trimmed) && !includes.delay) {
      add(
        diagnostics,
        line,
        '_delay_',
        'error',
        'AVR',
        'Użyto opóźnienia bez włączenia nagłówka z jego definicją.',
        'Dopisz na górze pliku: `#include <util/delay.h>` (a przed nim `#define F_CPU ...`).',
      )
    }
    if (/\b(ISR\s*\(|sei\s*\(|cli\s*\()/.test(trimmed) && !includes.interrupt) {
      add(
        diagnostics,
        line,
        'ISR',
        'error',
        'AVR',
        'Obsługa przerwań wymaga nagłówka <avr/interrupt.h>.',
        'Dopisz na górze pliku: `#include <avr/interrupt.h>`',
      )
    }
    if (/\bprintf\s*\(/.test(trimmed) && !includes.stdio) {
      add(
        diagnostics,
        line,
        'printf',
        'warning',
        'AVR',
        'printf bez nagłówka <stdio.h> — kompilator zgłosi ostrzeżenie o niejawnej deklaracji.',
        'Na mikrokontrolerze printf i tak nie ma dokąd pisać, dopóki nie podepniesz strumienia do USART. ' +
          'Do diagnostyki lepiej wysłać znak wprost przez UDR.',
      )
    }

    if (!includes.io) {
      const register = /\b([A-Z][A-Z0-9]{2,6})\b/.exec(trimmed)
      if (register && KNOWN_REGISTERS.has(register[1])) {
        add(
          diagnostics,
          line,
          register[1],
          'error',
          'AVR',
          `Nazwa ${register[1]} nie istnieje bez nagłówka <avr/io.h>.`,
          'Dopisz na górze pliku: `#include <avr/io.h>`',
        )
      }
    }
  }

  // --- kontrole obejmujace caly plik
  if (usesInterrupts && !hasSei) {
    const isrLine = lines.find((line) => /\bISR\s*\(/.test(line.code))
    if (isrLine) {
      add(
        diagnostics,
        isrLine,
        'ISR',
        'warning',
        'AVR',
        'Zdefiniowano procedurę obsługi przerwania, ale nigdzie nie ma wywołania sei().',
        'Bez globalnego zezwolenia (`sei()`) żadne przerwanie się nie wykona, choćby było odblokowane w TIMSK.',
      )
    }
  }

  for (const port of writtenPorts) {
    if (writtenDirections.has(port)) continue
    // Kierunek moze byc ustawiany w innym pliku projektu - wtedy alarmu nie ma.
    if (new RegExp(`\\bDDR${port}\\s*[|&^]?=`).test(projectCode)) continue
    // Sterownik moze dostawac wskaznik do rejestru zamiast siegac po nazwe.
    if (new RegExp(`&\\s*DDR${port}\\b`).test(projectCode)) continue
    const portLine = lines.find((line) => new RegExp(`\\bPORT${port}\\s*[|&^]?=`).test(line.code))
    if (!portLine) continue
    add(
      diagnostics,
      portLine,
      `PORT${port}`,
      'warning',
      'AVR',
      `Program zapisuje PORT${port}, ale nigdzie nie ustawia kierunku DDR${port}.`,
      `Po resecie DDR${port} = 0, czyli wszystkie linie są wejściami — zapis do PORT${port} włączy tylko ` +
        `rezystory podciągające i nic nie zaświeci. Dodaj np. \`DDR${port} = 0xFF;\``,
    )
  }

  // Uwaga: NIE ostrzegamy przed `_delay_ms(nazwa)`. Nazwa jest najczesciej stala
  // z `#define`, a tego nie da sie odroznic od zmiennej bez rozwijania makr -
  // regula zglaszalaby blad w poprawnych sterownikach klawiatury z ZASOBOW.

  if (/\b_delay_(ms|us)\s*\(/.test(code) && declaredFCpu === null) {
    const line = lines.find((item) => /\b_delay_(ms|us)\s*\(/.test(item.code))
    if (line) {
      add(
        diagnostics,
        line,
        '_delay_',
        'warning',
        'AVR',
        'Brak definicji F_CPU — kompilator przyjmie 1 MHz i wypisze ostrzeżenie.',
        'Dodaj `#define F_CPU 1000000UL` PRZED włączeniem nagłówka <util/delay.h>.',
      )
    }
  }

  // --- F_CPU zdefiniowane po dolaczeniu naglowka
  const fCpuLine = lines.findIndex((line) => /#\s*define\s+F_CPU/.test(line.code))
  const delayIncludeLine = lines.findIndex((line) => /#\s*include\s*[<"](util|avr)\/delay\.h[>"]/.test(line.code))
  if (fCpuLine >= 0 && delayIncludeLine >= 0 && fCpuLine > delayIncludeLine) {
    add(
      diagnostics,
      lines[fCpuLine],
      'F_CPU',
      'warning',
      'AVR',
      'F_CPU jest zdefiniowane PO włączeniu nagłówka opóźnień — nagłówek go nie zobaczy.',
      'Przenieś `#define F_CPU ...` nad linię `#include <util/delay.h>`.',
    )
  }

  checkInterruptPairs(lines, diagnostics, projectCode)

  // --- main bez zadnej petli: program wykona sie raz i stanie
  //
  // Celowo najostrozniejsza wersja tej reguly: milczymy, gdy GDZIEKOLWIEK
  // w projekcie jest `while` albo `for` - kazda petla moze byc ta nieskonczona
  // (takze `while (dziala)` ze zmienna). Odzywamy sie tylko wtedy, gdy petli
  // nie ma wcale, czyli w programie pisanym pierwszy raz w zyciu.
  const mainLine = lines.find((line) => /\b(int|void)\s+main\s*\(/.test(line.code))
  if (mainLine && !/\b(while|for)\s*\(/.test(projectCode)) {
    add(
      diagnostics,
      mainLine,
      'main',
      'info',
      'AVR',
      'main dojdzie do końca i program się zatrzyma — mikrokontroler nie zrobi już nic aż do resetu.',
      'Na mikrokontrolerze nie ma systemu, do którego można wrócić po zakończeniu programu ' +
        '(avr-libc zamyka go wtedy w pustej pętli z wyłączonymi przerwaniami). ' +
        'Zwykle całą pracę programu zamyka się w nieskończonej pętli `while (1) { ... }` na końcu main.',
    )
  }
}

/**
 * Dwie reguly-lustra wokol par „bit wlaczajacy przerwanie ↔ procedura ISR”.
 *
 * Obie strony tej pary psuja sie po cichu: kompilator nie wie, ze OCIE0
 * i TIMER0_COMP_vect maja sie spotkac, wiec zbuduje program z kazda polowka
 * osobno. Z wlaczonym bitem bez procedury program RESTARTUJE SIE przy
 * pierwszym przerwaniu; z procedura bez bitu — przerwanie po prostu milczy.
 */
function checkInterruptPairs(lines: Line[], diagnostics: Diagnostic[], projectCode: string): void {
  for (const line of lines) {
    const trimmed = line.code

    // --- bit wlaczony, a procedury nigdzie nie ma
    for (const [vector, enable] of Object.entries(VECTOR_ENABLE)) {
      if (!new RegExp(`\\b${enable.bit}\\b`).test(trimmed)) continue
      // Tylko zapis mogacy bit USTAWIC: `REG = ...` albo `REG |= ...`.
      // `&=` i `^=` moga go kasowac albo przelaczac - o nich milczymy.
      if (!new RegExp(`\\b${enable.register}\\s*\\|?=(?!=)`).test(trimmed)) continue
      if (new RegExp(`\\b(ISR|SIGNAL)\\s*\\(\\s*${vector}\\b`).test(projectCode)) continue
      add(
        diagnostics,
        line,
        enable.bit,
        'warning',
        'AVR',
        `Bit ${enable.bit} włącza przerwanie (${enable.event}), ale w projekcie nie ma procedury ISR(${vector}).`,
        'Przerwanie bez procedury obsługi trafia w pusty wektor i avr-libc zaczyna program OD NOWA — ' +
          `wygląda to jak samoczynny restart bez śladu błędu. Dopisz \`ISR(${vector}) { ... }\` ` +
          'albo nie ustawiaj tego bitu.',
      )
    }

    // --- procedura jest, wlaczenia nie widac nigdzie w projekcie
    const isr = /\b(?:ISR|SIGNAL)\s*\(\s*([A-Z0-9_]+_vect)\b/.exec(trimmed)
    if (!isr) continue
    const enable = VECTOR_ENABLE[isr[1]]
    if (!enable) continue
    if (new RegExp(`\\b${enable.bit}\\b`).test(projectCode)) continue
    // Rejestr bywa zapisywany liczba albo wybierany wskaznikiem - kazda
    // wzmianka o nim w projekcie wystarcza, zebysmy zamilkli.
    if (new RegExp(`\\b${enable.register}\\b`).test(projectCode)) continue
    add(
      diagnostics,
      line,
      isr[1],
      'info',
      'AVR',
      `Procedura ISR(${isr[1]}) jest gotowa, ale nigdzie nie włączasz tego przerwania — nie wykona się ani razu.`,
      `Samo napisanie procedury nie uruchamia przerwania. Odblokuj je: \`${enable.register} |= (1 << ${enable.bit});\` ` +
        'i zezwól globalnie przez `sei()`.',
    )
  }
}

// ---------------------------------------------------------------------------
// Warstwa 3: kontekst sprzetowy - zworki i fuse bity
// ---------------------------------------------------------------------------

function checkHardware(
  lines: Line[],
  diagnostics: Diagnostic[],
  hardware: HardwareContext,
  declaredFCpu: number | null,
  code: string,
): void {
  // --- F_CPU kontra rzeczywisty zegar z fuse bitow
  if (declaredFCpu !== null && hardware.clockHz !== null && declaredFCpu !== hardware.clockHz) {
    const line = lines.find((item) => /#\s*define\s+F_CPU/.test(item.code))
    if (line) {
      const ratio = declaredFCpu / hardware.clockHz
      const usesDelay = /\b_delay_(ms|us)\s*\(/.test(code)
      const usesUsart = /\bUBRR|BAUD/.test(code)
      const effects: string[] = []
      if (usesDelay) {
        effects.push(
          ratio > 1
            ? `opóźnienia będą ${formatRatio(ratio)} razy KRÓTSZE, niż zapisano w kodzie`
            : `opóźnienia będą ${formatRatio(1 / ratio)} razy DŁUŻSZE, niż zapisano w kodzie`,
        )
      }
      if (usesUsart) {
        effects.push(
          `transmisja szeregowa pobiegnie z prędkością ${formatRatio(1 / ratio)} razy ` +
            `${ratio > 1 ? 'niższą' : 'wyższą'} niż zakładana — w terminalu pojawią się śmieci`,
        )
      }
      add(
        diagnostics,
        line,
        'F_CPU',
        'warning',
        'Płytka',
        `F_CPU mówi ${formatHz(declaredFCpu)}, ale fuse bity ustawiają zegar na ${formatHz(hardware.clockHz)}.`,
        (effects.length > 0 ? `Skutek: ${effects.join('; ')}. ` : '') +
          'F_CPU nie ustawia zegara — zmień fuse bity w oknie „Fuse bity…” albo popraw wartość w kodzie.',
      )
    }
  }

  // --- port C przy wlaczonym JTAG
  if (hardware.jtagEnabled) {
    for (const line of lines) {
      const touchesPortC = /\b(PORTC|DDRC|PINC)\b/.exec(line.code)
      if (!touchesPortC) continue
      if (!usesJtagBits(line.code)) continue
      add(
        diagnostics,
        line,
        touchesPortC[1],
        'warning',
        'Płytka',
        'Fuse JTAGEN jest zaprogramowany — linie PC2, PC3, PC4 i PC5 należą do interfejsu JTAG i nie zadziałają.',
        'Wyłącz JTAGEN w oknie „Fuse bity…” albo zapisz dwukrotnie bit JTD w MCUCSR. ' +
          'Bez tego dioda na tych liniach po prostu nie zaświeci, choć program jest poprawny.',
      )
      break
    }
  }

  checkWiring(lines, diagnostics, hardware)

  // --- odbior USART przy rozwartej zworce JP4
  if (!hardware.jumpers.JP4) {
    const line = lines.find((item) => /\bRXEN\b|USART_RXC_vect|\bRXCIE\b/.test(item.code))
    if (line) {
      const marker = /\bRXEN\b/.test(line.code) ? 'RXEN' : /\bRXCIE\b/.test(line.code) ? 'RXCIE' : 'USART_RXC_vect'
      add(
        diagnostics,
        line,
        marker,
        'warning',
        'Płytka',
        'Program włącza odbiór przez USART, ale zworka JP4 „RxD Enable” jest rozwarta.',
        'Przy rozwartej JP4 płytka NADAJE poprawnie, ale nie odbiera ani jednego znaku. ' +
          'Zewrzyj zworkę w widoku płytki.',
      )
    }
  }

  // --- pelne skanowanie matrycy przy zwartej zworce JP3
  if (hardware.jumpers.JP3) {
    const line = lines.find((item) => /\bfor\s*\(.*col.*<\s*4/.test(item.code) || /0xF0/.test(item.code))
    if (line) {
      add(
        diagnostics,
        line,
        line.code.trim().slice(0, 12),
        'info',
        'Płytka',
        'Zworka JP3 „mała klawiatura” jest zwarta — matryca 4×4 jest zredukowana do czterech przycisków.',
        'W tym trybie działają tylko klawisze pierwszej kolumny (1, 4, 7, *), a linie wierszy zachowują się ' +
          'jak zwykłe przyciski zwierające do masy. Do pełnej matrycy zdejmij zworkę.',
      )
    }
  }

  // --- zewnetrzny kwarc przy rozwartej zworce JP25
  // Wewnetrzny oscylator RC ATmega32 daje 1, 2, 4 albo 8 MHz (datasheet, tab. 9),
  // wiec dopiero WIECEJ niz 8 MHz wymaga kwarcu z plytki.
  if (!hardware.jumpers.JP25 && declaredFCpu !== null && declaredFCpu > 8_000_000) {
    const line = lines.find((item) => /#\s*define\s+F_CPU/.test(item.code))
    if (line) {
      add(
        diagnostics,
        line,
        'F_CPU',
        'info',
        'Płytka',
        `F_CPU ${formatHz(declaredFCpu)} sugeruje pracę z kwarcem, ale zworka JP25 jest rozwarta.`,
        'Rezonator 16 MHz jest odłączony od wyprowadzeń XTAL. Zewrzyj JP25 i ustaw fuse bity na zewnętrzne ' +
          'źródło zegara — inaczej układ nadal pracuje z oscylatora wewnętrznego.',
      )
    }
  }

  // --- odczyt wejsc bez pull-upow
  checkMissingPullUps(lines, diagnostics, code)
}

/** Czy linia dotyka bitow 2..5 portu C - tych zajmowanych przez JTAG. */
function usesJtagBits(code: string): boolean {
  if (/\b(PORTC|DDRC|PINC)\s*=\s*0x[fF][fF]/.test(code)) return true
  if (/\b(PORTC|DDRC|PINC)\s*=\s*0b[01]{8}/.test(code)) return true
  if (/PC[2-5]\b/.test(code)) return true
  if (/1\s*<<\s*[2-5]\b/.test(code) && /\b(PORTC|DDRC|PINC)\b/.test(code)) return true
  if (/\b(PORTC|DDRC)\s*\^?=\s*0x[fF][fF]/.test(code)) return true
  return false
}

/** Odczyt wejsc bez wlaczonych rezystorow podciagajacych - klasyczny blad z klawiatura. */
function checkMissingPullUps(lines: Line[], diagnostics: Diagnostic[], projectCode: string): void {
  for (const port of ['A', 'B', 'C', 'D'] as const) {
    const readsPin = lines.find((line) => new RegExp(`\\bPIN${port}\\b`).test(line.code))
    if (!readsPin) continue

    const setsDirection = lines.some((line) => new RegExp(`\\bDDR${port}\\s*[|&^]?=`).test(line.code))
    if (!setsDirection) continue

    // Pull-upy moga byc wlaczane w innym pliku projektu albo przez wskaznik do rejestru.
    if (new RegExp(`&\\s*PORT${port}\\b`).test(projectCode)) continue

    // Czy gdziekolwiek wlaczane sa pull-upy na tym porcie?
    const enablesPullUps = lines.some((line) => {
      const match = new RegExp(`\\bPORT${port}\\s*([|^]?)=\\s*([^;]+)`).exec(line.code)
      if (!match) return false
      const value = match[2]
      if (/0x00\b|^\s*0\s*$/.test(value)) return false
      return true
    })
    if (enablesPullUps) continue

    add(
      diagnostics,
      readsPin,
      `PIN${port}`,
      'warning',
      'Płytka',
      `Program czyta PIN${port}, ale nigdzie nie włącza rezystorów podciągających na tym porcie.`,
      `Klawiatura na płytce ZL3AVR nie ma własnych rezystorów. Bez pull-upów linie „pływają” i odczyty ` +
        `są przypadkowe. Włącz je zapisem do PORT${port}, np. \`PORT${port} = 0x0F;\` dla czterech młodszych linii.`,
    )
  }
}

function formatHz(hz: number): string {
  if (hz >= 1_000_000) return `${(hz / 1_000_000).toString().replace('.', ',')} MHz`
  if (hz >= 1000) return `${(hz / 1000).toString().replace('.', ',')} kHz`
  return `${hz} Hz`
}

function formatRatio(ratio: number): string {
  const rounded = Math.round(ratio * 10) / 10
  return String(rounded).replace('.', ',')
}


// ---------------------------------------------------------------------------
// Warstwa 3, ciag dalszy: PRZEWODY
// ---------------------------------------------------------------------------

/**
 * Peryferia tej plytki nie sa na stale polaczone z mikrokontrolerem - wszystko
 * idzie przez goldpiny i to student decyduje, co z czym polaczyc. Wynika z tego
 * najczestszy powod zdania „program jest dobry, a nic sie nie dzieje”: zyla
 * nie zostala poprowadzona albo trafila na sasiednie zlacze.
 *
 * Zaden kompilator tego nie zauwazy, bo nie widzi plytki. My widzimy.
 */
function checkWiring(lines: Line[], diagnostics: Diagnostic[], hardware: HardwareContext): void {
  const wiring = hardware.wiring
  if (!wiring) return

  /** Pierwsza linia, w ktorej kod naprawde siega po dany port - tam damy komunikat. */
  const firstUse = new Map<PortName, { line: Line; marker: string }>()
  for (const line of lines) {
    for (const use of portUses(line.code)) {
      if (!firstUse.has(use.port)) firstUse.set(use.port, { line, marker: use.marker })
    }
  }

  /**
   * Slady uzycia przerwan zewnetrznych - LICZA SIE OSOBNO, bo kod z INT0
   * czesto w ogole nie wymienia PORTD ani PIND (wystarcza GICR i ISR),
   * a pin przerwania jest zwyklym pinem: bez przewodu nie ma go czym wyzwolic.
   * Przypisanie linii: INT0=PD2, INT1=PD3, INT2=PB2 (datasheet ATmega32).
   */
  const INT_PINS: { name: string; port: PortName; pin: number; pinLabel: string }[] = [
    { name: 'INT0', port: 'D', pin: 2, pinLabel: 'PD2' },
    { name: 'INT1', port: 'D', pin: 3, pinLabel: 'PD3' },
    { name: 'INT2', port: 'B', pin: 2, pinLabel: 'PB2' },
  ]
  const intUses = INT_PINS.flatMap((int) => {
    const use = lines.find(
      (item) =>
        new RegExp(`\\bISR\\s*\\(\\s*${int.name}_vect\\b`).test(item.code) ||
        (new RegExp(`\\bGICR\\s*\\|?=(?!=)`).test(item.code) &&
          new RegExp(`\\b${int.name}\\b`).test(item.code)),
    )
    return use ? [{ int, use }] : []
  })

  if (firstUse.size === 0 && intUses.length === 0) return

  // --- plytka bez ani jednego przewodu
  //
  // Jeden komunikat, nie jeden na port: pusta plytka to jeden stan rzeczy,
  // a nie cztery osobne problemy. Jest to `info`, a nie ostrzezenie - pisanie
  // kodu przed poprowadzeniem przewodow jest zupelnie normalna kolejnoscia pracy.
  if (wiring.total === 0) {
    const first =
      [...firstUse.values()][0] ??
      { line: intUses[0].use, marker: intUses[0].int.name }
    add(
      diagnostics,
      first.line,
      first.marker,
      'info',
      'Płytka',
      'Na płytce nie ma ani jednego przewodu, więc ten port nie jest z niczym połączony.',
      'Peryferia tej płytki nie są na stałe podłączone do mikrokontrolera — przejdź ' +
        'na zakładkę „Płytka” i poprowadź żyły ze złącza portu do złącza peryferium.',
    )
    return
  }

  // --- port uzyty w kodzie, ale bez ani jednej zyly
  const warnedPorts = new Set<PortName>()
  for (const [port, use] of firstUse) {
    const wired = wiring.ports[port]
    if (wired.count > 0) continue
    warnedPorts.add(port)

    // Co JEST podlaczone - bez tego komunikat mowi tylko „czegos brakuje”,
    // a z tym student widzi od razu, ze pomylil zlacze.
    const elsewhere = (Object.keys(wiring.ports) as PortName[])
      .filter((name) => wiring.ports[name].count > 0)
      .map((name) => `port ${name} → ${wiring.ports[name].targets.join(', ')}`)

    add(
      diagnostics,
      use.line,
      use.marker,
      'warning',
      'Płytka',
      `Program używa portu ${port}, ale ze złącza tego portu nie wychodzi żaden przewód.`,
      (elsewhere.length > 0
        ? `Podłączone są za to: ${elsewhere.join('; ')}. Sprawdź, czy żyły nie trafiły na sąsiednie złącze. `
        : '') + 'Połączenia poprowadzisz na zakładce „Płytka”.',
    )
  }

  // --- przerwanie zewnetrzne na linii bez przewodu
  for (const { int, use } of intUses) {
    // Gdy caly port dostal juz ostrzezenie o braku przewodow, drugi komunikat
    // o tym samym mowilby to samo innymi slowami.
    if (warnedPorts.has(int.port)) continue
    const wired = wiring.ports[int.port]
    if (wired.pins.includes(int.pin)) continue
    add(
      diagnostics,
      use,
      int.name,
      'warning',
      'Płytka',
      `Przerwanie ${int.name} nasłuchuje na linii ${int.pinLabel}, a z tej linii nie wychodzi żaden przewód.`,
      (wired.count > 0
        ? `Z portu ${int.port} idą przewody (linie ${wired.pins.map((pin) => `P${int.port}${pin}`).join(', ')}), ale żaden z ${int.pinLabel}. `
        : '') +
        `Połącz ${int.pinLabel} na złączu portu ${int.port} z tym, co ma wyzwalać przerwanie — ` +
        'np. z linią klawiatury albo innym źródłem sygnału.',
    )
  }

  // --- odczyt wejsc z portu, na ktorym wisza same diody
  //
  // Dioda swieci, kiedy sie ja wysteruje, i nie odpowiada niczym z powrotem.
  // `PINx` da wtedy stan wymuszony przez sam mikrokontroler, a nie zaden pomiar.
  for (const line of lines) {
    const read = portUses(line.code).find((use) => use.marker.startsWith('PIN'))
    if (!read) continue
    const port = read.port
    const wired = wiring.ports[port]
    if (wired.count === 0) continue
    if (wired.targets.length !== 1 || !/diod/i.test(wired.targets[0])) continue
    add(
      diagnostics,
      line,
      read.marker,
      'warning',
      'Płytka',
      `Port ${port} jest podłączony wyłącznie do diod LED, a program czyta z niego stan wejść.`,
      'Dioda tylko świeci — niczego nie zwraca. Odczyt pokaże stan, który mikrokontroler ' +
        'sam wystawił, a nie żaden pomiar. Klawiaturę lub przyciski podłącz do innego portu.',
    )
    break
  }
}

/**
 * Rejestry portow uzyte w linii - z pominieciem POBRANIA ADRESU.
 *
 * `DDRB = 0xFF` znaczy „program steruje portem B”. `&DDRB` nie znaczy nic
 * takiego: to wskazanie rejestru, ktory dopiero zostanie wybrany w czasie
 * dzialania programu. Tak wlasnie pisze sie sterownik uniwersalny -
 * `switch (nrPortu) { case 2: *ddr = &DDRB; ... }` - i taki plik wymienia
 * wszystkie cztery porty, choc uzywa dokladnie jednego.
 *
 * Bez tego rozroznienia kazdy sterownik z wyborem portu dostawalby trzy
 * ostrzezenia o nieistniejacych przewodach. Falszywy alarm przy poprawnym
 * kodzie jest gorszy niz brak ostrzezenia.
 */
function portUses(code: string): { port: PortName; marker: string }[] {
  const found: { port: PortName; marker: string }[] = []
  const pattern = /\b(PORT|DDR|PIN)([A-D])\b/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(code)) !== null) {
    const before = code.slice(0, match.index).trimEnd()
    // Pojedynczy `&` tuz przed nazwa to pobranie adresu. Podwojny to koniunkcja
    // (`if (gotowe && PINB)`), wiec jego nie pomijamy.
    const addressOf = before.endsWith('&') && !before.endsWith('&&')
    if (addressOf) continue
    found.push({ port: match[2] as PortName, marker: match[0] })
  }
  return found
}
