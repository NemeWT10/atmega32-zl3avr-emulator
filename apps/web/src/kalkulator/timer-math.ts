/**
 * Kalkulator timerow - czysta matematyka i generator kodu, bez interfejsu.
 *
 * Typowy klopot na cwiczeniach: "ustaw licznik tak, zeby mrugalo co 100 ms".
 * Prowadzacy raz podaje sam czas, raz czas i preskaler, raz gotowe OCR -
 * a student ma z tych strzepow poskladac wartosci trzech rejestrow.
 * Kalkulator robi to w obie strony: z czasu wylicza konfiguracje,
 * a z wpisanych wartosci - osiagniety czas.
 *
 * Fakty sprzetowe (preskalery, bity, rejestry, wektory) pochodza
 * z datasheeta ATmega32 (docs/zrodla-txt/atmega32_datasheet.md):
 *   - TC0/TC1: preskaler 1, 8, 64, 256, 1024 (CS02:0 / CS12:0),
 *   - TC2:     preskaler 1, 8, 32, 64, 128, 256, 1024 (CS22:0),
 *   - tryb CTC: WGM01 (TC0), WGM12 w TCCR1B (TC1), WGM21 (TC2),
 *   - flagi OCF/TOV w TIFR kasowane zapisem jedynki,
 *   - zezwolenia OCIE/TOIE w TIMSK (wspolnym dla wszystkich licznikow).
 */

export type TimerId = 'TC0' | 'TC1' | 'TC2'

/**
 * Sposob odmierzania czasu:
 *   ctc      - licznik sam zeruje sie na OCR (Clear Timer on Compare),
 *   preload  - tryb Normal z recznym przeladowaniem TCNT po kazdym obiegu,
 *   overflow - tryb Normal bez przeladowania: pelny obieg 0..MAX.
 */
export type ModeId = 'ctc' | 'preload' | 'overflow'

export interface TimerInfo {
  id: TimerId
  bits: 8 | 16
  /** Najwieksza wartosc licznika (255 albo 65535). */
  max: number
  prescalers: number[]
  /** Preskaler → symbole bitow CS do wstawienia w rejestr konfiguracji. */
  csBits: Record<number, string[]>
  /** Rejestr konfiguracji, do ktorego ida bity CS i WGM (dla TC1: TCCR1B). */
  control: string
  counter: string
  compare: string
  /** Bit(y) wlaczajace tryb CTC w rejestrze konfiguracji. */
  ctcBits: string[]
  compareFlag: string
  overflowFlag: string
  compareEnable: string
  overflowEnable: string
  compareVector: string
  overflowVector: string
  /** Przedrostek nazw generowanych funkcji. */
  prefix: string
}

export const TIMERS: Record<TimerId, TimerInfo> = {
  TC0: {
    id: 'TC0',
    bits: 8,
    max: 255,
    prescalers: [1, 8, 64, 256, 1024],
    csBits: {
      1: ['CS00'],
      8: ['CS01'],
      64: ['CS01', 'CS00'],
      256: ['CS02'],
      1024: ['CS02', 'CS00'],
    },
    control: 'TCCR0',
    counter: 'TCNT0',
    compare: 'OCR0',
    ctcBits: ['WGM01'],
    compareFlag: 'OCF0',
    overflowFlag: 'TOV0',
    compareEnable: 'OCIE0',
    overflowEnable: 'TOIE0',
    compareVector: 'TIMER0_COMP_vect',
    overflowVector: 'TIMER0_OVF_vect',
    prefix: 'timer0',
  },
  TC1: {
    id: 'TC1',
    bits: 16,
    max: 65535,
    prescalers: [1, 8, 64, 256, 1024],
    csBits: {
      1: ['CS10'],
      8: ['CS11'],
      64: ['CS11', 'CS10'],
      256: ['CS12'],
      1024: ['CS12', 'CS10'],
    },
    control: 'TCCR1B',
    counter: 'TCNT1',
    compare: 'OCR1A',
    ctcBits: ['WGM12'],
    compareFlag: 'OCF1A',
    overflowFlag: 'TOV1',
    compareEnable: 'OCIE1A',
    overflowEnable: 'TOIE1',
    compareVector: 'TIMER1_COMPA_vect',
    overflowVector: 'TIMER1_OVF_vect',
    prefix: 'timer1',
  },
  TC2: {
    id: 'TC2',
    bits: 8,
    max: 255,
    prescalers: [1, 8, 32, 64, 128, 256, 1024],
    csBits: {
      1: ['CS20'],
      8: ['CS21'],
      32: ['CS21', 'CS20'],
      64: ['CS22'],
      128: ['CS22', 'CS20'],
      256: ['CS22', 'CS21'],
      1024: ['CS22', 'CS21', 'CS20'],
    },
    control: 'TCCR2',
    counter: 'TCNT2',
    compare: 'OCR2',
    ctcBits: ['WGM21'],
    compareFlag: 'OCF2',
    overflowFlag: 'TOV2',
    compareEnable: 'OCIE2',
    overflowEnable: 'TOIE2',
    compareVector: 'TIMER2_COMP_vect',
    overflowVector: 'TIMER2_OVF_vect',
    prefix: 'timer2',
  },
}

export const MODE_LABEL: Record<ModeId, string> = {
  ctc: 'CTC (licznik zeruje się sam)',
  preload: 'Normal z przeładowaniem TCNT',
  overflow: 'Normal (pełny obieg 0…MAX)',
}

export interface SolveRequest {
  fCpu: number
  timer: TimerInfo
  /** Docelowy odstep zdarzen w sekundach; null = nie podano. */
  targetSeconds: number | null
  /** null = przejrzyj wszystkie tryby. */
  mode: ModeId | null
  /** null = przejrzyj wszystkie preskalery. */
  prescaler: number | null
  /**
   * Wartosc wpisana przez uzytkownika: OCR (dla CTC) albo startowe TCNT
   * (dla przeladowania). null = wylicz ja z czasu.
   */
  countValue: number | null
}

export interface TimerOption {
  timer: TimerId
  mode: ModeId
  prescaler: number
  /** Wartosc do wpisania: OCR dla ctc, startowe TCNT dla preload, null dla overflow. */
  value: number | null
  /** Ile tykniec licznika miedzy zdarzeniami. */
  ticks: number
  /** Osiagniety odstep zdarzen w sekundach. */
  seconds: number
  /** Blad wzgledem celu w procentach (0, gdy celu nie podano). */
  errorPercent: number
  /** Czy trafia DOKLADNIE w podany czas. */
  exact: boolean
}

/** Klucz do porownywania i zapamietywania wybranego wiersza. */
export function optionKey(option: TimerOption): string {
  return `${option.timer}:${option.mode}:${option.prescaler}:${option.value ?? 'x'}`
}

export function solve(request: SolveRequest): TimerOption[] {
  const { fCpu, timer, targetSeconds, countValue } = request
  if (!Number.isFinite(fCpu) || fCpu <= 0) return []

  const modes: ModeId[] = request.mode ? [request.mode] : ['ctc', 'preload', 'overflow']
  const prescalers = request.prescaler ? [request.prescaler] : timer.prescalers
  const options: TimerOption[] = []

  for (const mode of modes) {
    for (const prescaler of prescalers) {
      if (!timer.prescalers.includes(prescaler)) continue
      const tickSeconds = prescaler / fCpu

      let ticks: number | null = null
      if (mode === 'overflow') {
        // Wpisana wartosc rejestru nie ma tu zastosowania - pomijamy tryb,
        // zamiast pokazywac wiersz, ktory ignoruje czesc danych wejsciowych.
        if (countValue !== null) continue
        ticks = timer.max + 1
      } else if (countValue !== null) {
        if (countValue < 0 || countValue > timer.max) continue
        ticks = mode === 'ctc' ? countValue + 1 : timer.max + 1 - countValue
      } else if (targetSeconds !== null && targetSeconds > 0) {
        const ideal = targetSeconds / tickSeconds
        // Poza zakresem licznika: taka konfiguracja nie istnieje. Nie
        // pokazujemy wiersza "przycietego" do maksimum - wprowadzalby
        // w blad, ze cos sie prawie udalo.
        if (ideal > timer.max + 1.5 || ideal < 0.5) continue
        ticks = Math.min(timer.max + 1, Math.max(1, Math.round(ideal)))
      } else {
        continue
      }

      const seconds = ticks * tickSeconds
      const errorPercent =
        targetSeconds !== null && targetSeconds > 0
          ? ((seconds - targetSeconds) / targetSeconds) * 100
          : 0

      options.push({
        timer: timer.id,
        mode,
        prescaler,
        value: mode === 'ctc' ? ticks - 1 : mode === 'preload' ? timer.max + 1 - ticks : null,
        ticks,
        seconds,
        errorPercent,
        exact: Math.abs(errorPercent) < 1e-9,
      })
    }
  }

  // Najpierw trafienia dokladne, potem rosnacy blad; przy rownym bledzie
  // CTC przed przeladowaniem (mniej rzeczy do pilnowania w kodzie),
  // a na koncu mniejszy preskaler (dokladniejsza podzialka).
  const modeOrder: Record<ModeId, number> = { ctc: 0, preload: 1, overflow: 2 }
  return options.sort((a, b) => {
    if (a.exact !== b.exact) return a.exact ? -1 : 1
    const errorDiff = Math.abs(a.errorPercent) - Math.abs(b.errorPercent)
    if (Math.abs(errorDiff) > 1e-12) return errorDiff
    if (modeOrder[a.mode] !== modeOrder[b.mode]) return modeOrder[a.mode] - modeOrder[b.mode]
    return a.prescaler - b.prescaler
  })
}

/** „12,5 ms”, „125 µs”, „1,5 s” - sekundy w najczytelniejszej jednostce. */
export function formatSeconds(seconds: number): string {
  const format = (value: number) =>
    (Math.round(value * 1000) / 1000).toLocaleString('pl-PL', { maximumFractionDigits: 3 })
  if (seconds >= 1) return `${format(seconds)} s`
  if (seconds >= 0.001) return `${format(seconds * 1000)} ms`
  return `${format(seconds * 1_000_000)} µs`
}

export function formatHz(hz: number): string {
  const format = (value: number) =>
    (Math.round(value * 100) / 100).toLocaleString('pl-PL', { maximumFractionDigits: 2 })
  if (hz >= 1_000_000) return `${format(hz / 1_000_000)} MHz`
  if (hz >= 1000) return `${format(hz / 1000)} kHz`
  return `${format(hz)} Hz`
}

/** `(1 << CS01) | (1 << CS00)` z listy nazw bitow. */
function shiftedBits(names: string[]): string {
  return names.map((name) => `(1 << ${name})`).join(' | ')
}

export type CodeStyle = 'polling' | 'interrupt'

/**
 * Gotowa funkcja (albo para funkcji) do wklejenia do projektu.
 *
 * Wersja z komentarzami i bez to TEN SAM kod - roznia sie wylacznie
 * dopiskami. Dzieki temu przelacznik nie moze niczego zepsuc.
 */
export function generateCode(
  option: TimerOption,
  style: CodeStyle,
  withComments: boolean,
  fCpu: number,
): string {
  const timer = TIMERS[option.timer]
  const period = formatSeconds(option.seconds)
  const cs = shiftedBits(timer.csBits[option.prescaler])
  const config =
    option.mode === 'ctc' ? `${shiftedBits(timer.ctcBits)} | ${cs}` : cs
  const flag = option.mode === 'ctc' ? timer.compareFlag : timer.overflowFlag
  const enable = option.mode === 'ctc' ? timer.compareEnable : timer.overflowEnable
  const vector = option.mode === 'ctc' ? timer.compareVector : timer.overflowVector

  /** Linia kodu + opcjonalny komentarz, wyrownany do wspolnej kolumny. */
  const rows: [string, string?][] = []
  const emit = (code: string, comment?: string) => rows.push([code, comment])

  emit('#include <avr/io.h>')
  if (style === 'interrupt') emit('#include <avr/interrupt.h>')
  emit('')

  if (style === 'interrupt') {
    emit(`ISR(${vector})`, `wykonuje się co ${period}`)
    emit('{')
    if (option.mode === 'preload') {
      emit(
        `    ${timer.counter} = ${option.value};`,
        'przeładowanie: bez tego następny obieg trwa pełne maksimum',
      )
    }
    if (withComments) emit('    /* tu wstaw swoją reakcję */')
    emit('}')
    emit('')
  }

  emit(`void ${timer.prefix}_start(void)`, `${MODE_LABEL[option.mode]}, preskaler ${option.prescaler}`)
  emit('{')
  emit(
    `    ${timer.control} = ${config};`,
    option.mode === 'ctc' ? 'tryb CTC + preskaler' : 'tryb Normal + preskaler',
  )
  if (option.mode === 'ctc') {
    emit(
      `    ${timer.compare} = ${option.value};`,
      `${option.ticks} tyknięć = ${period} przy F_CPU ${formatHz(fCpu)}`,
    )
  }
  if (option.mode === 'preload') {
    emit(
      `    ${timer.counter} = ${option.value};`,
      `start ${option.value}: do przepełnienia ${option.ticks} tyknięć = ${period}`,
    )
  }
  if (style === 'interrupt') {
    emit(`    TIMSK |= (1 << ${enable});`, 'odblokuj to jedno przerwanie')
    emit('    sei();', 'globalne zezwolenie na przerwania')
  }
  emit('}')

  if (style === 'polling') {
    emit('')
    emit(`void ${timer.prefix}_czekaj(void)`, `czeka jedno zdarzenie (${period})`)
    emit('{')
    emit(`    while (!(TIFR & (1 << ${flag}))) { }`, 'flaga ustawi się sprzętowo')
    emit(`    TIFR = (1 << ${flag});`, 'flagę kasuje ZAPIS JEDYNKI')
    if (option.mode === 'preload') {
      emit(`    ${timer.counter} = ${option.value};`, 'przeładowanie przed kolejnym obiegiem')
    }
    emit('}')
  }

  const codeWidth = Math.max(...rows.map(([code]) => code.length))
  return rows
    .map(([code, comment]) =>
      withComments && comment ? `${code.padEnd(codeWidth + 2)}// ${comment}` : code,
    )
    .join('\n')
    .replace(/[ \t]+$/gm, '')
}

// ---------------------------------------------------------------------------
// Podzial programowy: zdarzenie krotsze + zmienna globalna zliczajaca
// ---------------------------------------------------------------------------

/**
 * Rozwiazanie dla czasu, ktory NIE miesci sie w liczniku: krotsze zdarzenie
 * bazowe powtorzone `repeats` razy, odliczane zmienna globalna.
 *
 * Tak wlasnie robi sie na cwiczeniach sekundnik na 8-bitowym TC0 - licznik
 * dolicza najwyzej do 256 tykniec, ale nikt nie broni doliczyc 125 zdarzen
 * po 8 ms. To technika, nie sztuczka: przerwanie zostaje krotkie, a czas
 * sklada sie z dokladnych kawalkow.
 */
export interface DividedOption {
  /** Zdarzenie bazowe - normalna konfiguracja licznika. */
  base: TimerOption
  /** Ile zdarzen bazowych sklada sie na cel. */
  repeats: number
  totalSeconds: number
  errorPercent: number
  exact: boolean
}

/**
 * Szuka podzialu TYLKO wtedy, gdy licznik przy zadanych ograniczeniach jest
 * ZA MALY (cel wymaga wiecej tykniec, niz miesci rejestr). Gdy czas miesci
 * sie w pojedynczym zdarzeniu, zwraca null - wtedy ta podpowiedz bylaby szumem.
 */
export function solveDivided(request: SolveRequest): DividedOption | null {
  const { fCpu, timer, targetSeconds } = request
  if (!Number.isFinite(fCpu) || fCpu <= 0) return null
  if (targetSeconds === null || targetSeconds <= 0) return null
  if (request.countValue !== null) return null

  const usable = (request.prescaler ? [request.prescaler] : timer.prescalers).filter((value) =>
    timer.prescalers.includes(value),
  )
  if (usable.length === 0) return null

  // Warunek "za maly": nawet najwolniejsza dozwolona podzialka nie miesci
  // celu w jednym zdarzeniu.
  const slowest = Math.max(...usable)
  if ((targetSeconds * fCpu) / slowest <= timer.max + 1.5) return null

  const mode: ModeId = request.mode ?? 'ctc'
  let best: DividedOption | null = null

  const consider = (prescaler: number, ticks: number, repeats: number) => {
    if (repeats < 2 || repeats > 65535) return
    if (ticks < 1 || ticks > timer.max + 1) return
    const seconds = (ticks * repeats * prescaler) / fCpu
    const errorPercent = ((seconds - targetSeconds) / targetSeconds) * 100
    const exact = Math.abs(errorPercent) < 1e-9
    const candidate: DividedOption = {
      base: {
        timer: timer.id,
        mode,
        prescaler,
        value: mode === 'ctc' ? ticks - 1 : mode === 'preload' ? timer.max + 1 - ticks : null,
        ticks,
        seconds: (ticks * prescaler) / fCpu,
        errorPercent: 0,
        exact: true,
      },
      repeats,
      totalSeconds: seconds,
      errorPercent,
      exact,
    }
    if (!best) {
      best = candidate
      return
    }
    // Najpierw dokladnosc; przy rownej - mniej powtorzen (rzadsze przerwania).
    if (candidate.exact !== best.exact) {
      if (candidate.exact) best = candidate
      return
    }
    const errorDiff = Math.abs(candidate.errorPercent) - Math.abs(best.errorPercent)
    if (errorDiff < -1e-12) best = candidate
    else if (Math.abs(errorDiff) <= 1e-12 && candidate.repeats < best.repeats) best = candidate
  }

  for (const prescaler of usable) {
    const totalTicks = (targetSeconds * fCpu) / prescaler
    if (mode === 'overflow') {
      // Klasyczne "licz przepelnienia": zdarzenie ma sztywno MAX+1 tykniec.
      consider(prescaler, timer.max + 1, Math.round(totalTicks / (timer.max + 1)))
    } else {
      // Przegladamy dlugosci zdarzenia bazowego (dla licznika 8-bitowego to
      // ledwie 256 mozliwosci) i dobieramy do kazdej liczbe powtorzen.
      for (let ticks = timer.max + 1; ticks >= 1; ticks--) {
        consider(prescaler, ticks, Math.round(totalTicks / ticks))
      }
    }
  }

  return best
}

/** Kod dla podzialu programowego - zmienna globalna zlicza zdarzenia bazowe. */
export function generateDividedCode(
  divided: DividedOption,
  style: CodeStyle,
  withComments: boolean,
  fCpu: number,
): string {
  const timer = TIMERS[divided.base.timer]
  const basePeriod = formatSeconds(divided.base.seconds)
  const totalPeriod = formatSeconds(divided.totalSeconds)
  const counterType = divided.repeats <= 255 ? 'uint8_t' : 'uint16_t'
  const cs = shiftedBits(timer.csBits[divided.base.prescaler])
  const config = divided.base.mode === 'ctc' ? `${shiftedBits(timer.ctcBits)} | ${cs}` : cs
  const flag = divided.base.mode === 'ctc' ? timer.compareFlag : timer.overflowFlag
  const enable = divided.base.mode === 'ctc' ? timer.compareEnable : timer.overflowEnable
  const vector = divided.base.mode === 'ctc' ? timer.compareVector : timer.overflowVector

  const rows: [string, string?][] = []
  const emit = (code: string, comment?: string) => rows.push([code, comment])

  emit('#include <avr/io.h>')
  if (style === 'interrupt') emit('#include <avr/interrupt.h>')
  emit('')

  if (style === 'interrupt') {
    emit(`volatile ${counterType} odliczone = 0;`, 'ile zdarzeń bazowych już minęło')
    emit('')
    emit(`ISR(${vector})`, `wykonuje się co ${basePeriod}`)
    emit('{')
    if (divided.base.mode === 'preload') {
      emit(`    ${timer.counter} = ${divided.base.value};`, 'przeładowanie licznika')
    }
    emit('    odliczone++;')
    emit(
      `    if (odliczone >= ${divided.repeats})`,
      `${divided.repeats} × ${basePeriod} = ${totalPeriod}`,
    )
    emit('    {')
    emit('        odliczone = 0;')
    if (withComments) emit(`        /* tu wstaw reakcję wykonywaną co ${totalPeriod} */`)
    emit('    }')
    emit('}')
    emit('')
  }

  emit(
    `void ${timer.prefix}_start(void)`,
    `${MODE_LABEL[divided.base.mode]}, preskaler ${divided.base.prescaler}`,
  )
  emit('{')
  emit(
    `    ${timer.control} = ${config};`,
    divided.base.mode === 'ctc' ? 'tryb CTC + preskaler' : 'tryb Normal + preskaler',
  )
  if (divided.base.mode === 'ctc') {
    emit(
      `    ${timer.compare} = ${divided.base.value};`,
      `${divided.base.ticks} tyknięć = ${basePeriod} przy F_CPU ${formatHz(fCpu)}`,
    )
  }
  if (divided.base.mode === 'preload') {
    emit(
      `    ${timer.counter} = ${divided.base.value};`,
      `do przepełnienia ${divided.base.ticks} tyknięć = ${basePeriod}`,
    )
  }
  if (style === 'interrupt') {
    emit(`    TIMSK |= (1 << ${enable});`, 'odblokuj to jedno przerwanie')
    emit('    sei();', 'globalne zezwolenie na przerwania')
  }
  emit('}')

  if (style === 'polling') {
    emit('')
    emit(`void ${timer.prefix}_czekaj_raz(void)`, `jedno zdarzenie bazowe (${basePeriod})`)
    emit('{')
    emit(`    while (!(TIFR & (1 << ${flag}))) { }`)
    emit(`    TIFR = (1 << ${flag});`, 'flagę kasuje ZAPIS JEDYNKI')
    if (divided.base.mode === 'preload') {
      emit(`    ${timer.counter} = ${divided.base.value};`, 'przeładowanie przed kolejnym obiegiem')
    }
    emit('}')
    emit('')
    emit(
      `void ${timer.prefix}_czekaj_calosc(void)`,
      `${divided.repeats} × ${basePeriod} = ${totalPeriod}`,
    )
    emit('{')
    emit(`    for (${counterType} i = 0; i < ${divided.repeats}; i++)`)
    emit('    {')
    emit(`        ${timer.prefix}_czekaj_raz();`)
    emit('    }')
    emit('}')
  }

  const width = Math.max(...rows.map(([line]) => line.length))
  return rows
    .map(([line, comment]) =>
      withComments && comment ? `${line.padEnd(width + 2)}// ${comment}` : line,
    )
    .join('\n')
    .replace(/[ \t]+$/gm, '')
}
