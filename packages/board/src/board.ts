/**
 * Model plytki ZL3AVR: zlacza, przewody, zworki i peryferia.
 *
 * Sercem modelu jest NETLISTA. Przewody lacza piny w sieci, w kazdej sieci
 * ustalany jest wypadkowy poziom (silne wysterowanie wygrywa z pull-upem,
 * a pull-up z linia plywajaca), po czym wynik wraca do mikrokontrolera jako
 * stan wejsc. Dzieki temu zle podlaczony przewod naprawde nie dziala -
 * a o to wlasnie chodzi w cwiczeniu, w ktorym student sam prowadzi polaczenia.
 *
 * Peryferia (diody, wyswietlacze, LCD) sa dla netlisty biernymi odbiornikami.
 * Jedynym elementem, ktory sam tworzy polaczenia, jest klawiatura matrycowa:
 * wcisniety klawisz zwiera linie wiersza z linia kolumny.
 */

import type { Atmega32 } from '@zl3avr/avr-core'
import {
  CONNECTORS,
  CONNECTOR_FOR_PORT,
  isPortConnector,
  pinKey,
  PORT_CONNECTORS,
  type ConnectorId,
  type PinRef,
} from './connectors'
import { Hd44780, type LcdState } from './parts/hd44780'
import { Rs232Link } from './parts/rs232'

export type NetLevel = -1 | 0 | 1

export interface Wire {
  id: string
  a: PinRef
  b: PinRef
  /** Kolor zyly - w tasmie 8-zylowej rozroznia poszczegolne linie. */
  color: string
  /** Identyfikator tasmy, jesli zyla nalezy do przewodu wielozylowego. */
  ribbon?: string
}

export interface Jumpers {
  /** JP3 "Mala klawiatura" - redukcja matrycy do czterech przyciskow. */
  JP3: boolean
  /** JP4 "RxD Enable" - bez niej mikrokontroler nie odbiera nic z RS232. */
  JP4: boolean
  /** JP25 "Zegar" - dolacza kwarc 16 MHz do XTAL1/XTAL2. */
  JP25: boolean
}

export interface LedState {
  /** Jasnosc 0..1 usredniona po oknie czasu - stad plynne mruganie i PWM. */
  brightness: number
  on: boolean
}

export interface DigitState {
  /** Jasnosc kazdego z osmiu segmentow: a b c d e f g dp. */
  segments: number[]
}

export interface BoardState {
  leds: LedState[]
  digits: DigitState[]
  lcd: LcdState
  keysPressed: number[]
}

/** Okno usredniania jasnosci - 20 ms odpowiada bezwladnosci oka. */
const PERSISTENCE_WINDOW_SECONDS = 0.02

const LED_COUNT = 8
const DIGIT_COUNT = 4
const SEGMENT_COUNT = 8

export class Board {
  readonly lcd = new Hd44780()
  /** Tor RS232 do komputera - na plytce poprowadzony sciezkami, nie przewodami. */
  readonly rs232: Rs232Link

  wires: Wire[] = []

  /**
   * Wywolywane po kazdej zmianie ukladu plytki (przewody, zworki, klawisze).
   * Podpina sie pod to widok, zeby odrysowac sie takze przy zatrzymanej symulacji.
   */
  onWiringChange: (() => void) | null = null
  jumpers: Jumpers = { JP3: false, JP4: false, JP25: false }

  /** Numery wcisnietych klawiszy 0..15 (wiersz * 4 + kolumna). */
  private pressedKeys = new Set<number>()

  /** Akumulatory czasu swiecenia - podstawa modelu bezwladnosci oka. */
  private ledAccumulator = new Float64Array(LED_COUNT)
  private digitAccumulator = new Float64Array(DIGIT_COUNT * SEGMENT_COUNT)
  private accumulatedCycles = 0
  private lastSampleCycles = 0

  private ledSnapshot = new Float64Array(LED_COUNT)
  private digitSnapshot = new Float64Array(DIGIT_COUNT * SEGMENT_COUNT)
  private snapshotCycles = 0

  /** Aktualny (chwilowy) stan linii, wyliczony przez netliste. */
  private levels = new Map<string, NetLevel>()

  /**
   * Netlista zmienia sie tylko przy przepinaniu przewodow i wciskaniu klawiszy,
   * a `resolve()` biegnie po KAZDYM zapisie do portu (przy multipleksie
   * to tysiace razy na sekunde). Dlatego siec liczymy raz i trzymamy w cache.
   */
  private cachedNets: string[][] | null = null

  constructor(readonly mcu: Atmega32) {
    this.rs232 = new Rs232Link(mcu)
    this.mcu.gpio.onPortWrite = () => this.resolve()
    this.mcu.onStep = () => this.rs232.poll()
    this.resolve()
  }

  // -------------------------------------------------------------------------
  // Przewody
  // -------------------------------------------------------------------------

  connect(a: PinRef, b: PinRef, color = '#d0d0d0', ribbon?: string): Wire {
    const wire: Wire = { id: `w${this.wires.length}_${Date.now().toString(36)}`, a, b, color, ribbon }
    this.wires.push(wire)
    this.invalidateNets()
    this.resolve()
    return wire
  }

  /**
   * Tasma 8-zylowa: laczy osiem kolejnych pinow dwoch zlaczy.
   * `reverse` odwzorowuje typowe podlaczenie z instrukcji, w ktorym PD0 trafia
   * na LED7 - taka "odwrotna kolejnosc" jest w cwiczeniach normą.
   */
  connectRibbon(from: ConnectorId, to: ConnectorId, options: { reverse?: boolean; width?: number } = {}): Wire[] {
    const width = options.width ?? 8
    const ribbon = `r${this.wires.length}_${Date.now().toString(36)}`
    const colors = ['#8b5a2b', '#e11d48', '#f97316', '#eab308', '#22c55e', '#0ea5e9', '#8b5cf6', '#94a3b8']
    const created: Wire[] = []
    for (let i = 0; i < width; i++) {
      const target = options.reverse ? width - 1 - i : i
      created.push(this.connect({ connector: from, index: i }, { connector: to, index: target }, colors[i % colors.length], ribbon))
    }
    return created
  }

  disconnect(wireId: string): void {
    this.wires = this.wires.filter((wire) => wire.id !== wireId)
    this.invalidateNets()
    this.resolve()
  }

  disconnectRibbon(ribbonId: string): void {
    this.wires = this.wires.filter((wire) => wire.ribbon !== ribbonId)
    this.invalidateNets()
    this.resolve()
  }

  clearWires(): void {
    this.wires = []
    this.invalidateNets()
    this.resolve()
  }

  /**
   * Przywrocenie zapamietanego zestawu przewodow.
   *
   * Sluzy cofaniu zmian w widoku plytki. Wypiecie przewodu, wyczyszczenie
   * wszystkich albo wczytanie gotowego zestawu to operacje nieodwracalne,
   * a wykonuje sie je jednym klknieciem - bez cofania kazda pomylka oznacza
   * ponowne przepinanie kilkunastu zyl.
   */
  restoreWires(wires: Wire[]): void {
    this.wires = wires.map((wire) => ({ ...wire }))
    this.invalidateNets()
    this.resolve()
  }

  // -------------------------------------------------------------------------
  // Klawiatura
  // -------------------------------------------------------------------------

  setKeyPressed(key: number, pressed: boolean): void {
    if (pressed) this.pressedKeys.add(key)
    else this.pressedKeys.delete(key)
    this.invalidateNets()
    this.resolve()
  }

  isKeyPressed(key: number): boolean {
    return this.pressedKeys.has(key)
  }

  // -------------------------------------------------------------------------
  // Netlista
  // -------------------------------------------------------------------------

  /** Dynamiczne polaczenia tworzone przez wcisniete klawisze. */
  private keypadShorts(): [PinRef, PinRef][] {
    const shorts: [PinRef, PinRef][] = []
    for (const key of this.pressedKeys) {
      const row = Math.floor(key / 4)
      const column = key % 4
      // JP23: piny 0..3 to wiersze W1..W4, piny 4..7 to kolumny K1..K4.
      if (this.jumpers.JP3) {
        // "Mala klawiatura": aktywne sa tylko klawisze pierwszej kolumny,
        // a linie kolumnowe sa zwarte do masy na plytce.
        if (column !== 0) continue
        shorts.push([{ connector: 'JP23', index: row }, { connector: 'JP9', index: 0 }])
        continue
      }
      shorts.push([
        { connector: 'JP23', index: row },
        { connector: 'JP23', index: 4 + column },
      ])
    }
    return shorts
  }

  /**
   * Zmienil sie uklad plytki - trzeba odrysowac widok.
   *
   * Bez tego przewody, zworki i klawisze reagowaly tylko wtedy, gdy symulacja
   * biegla: widok odswiezal sie „przy okazji” zdarzenia zegara. Po zatrzymaniu
   * albo wylaczeniu zasilania - a tak wyglada plytka zaraz po otwarciu strony -
   * wypiety przewod nadal byl narysowany i wygladalo to na zepsute narzedzie.
   */
  private invalidateNets(): void {
    this.cachedNets = null
    this.onWiringChange?.()
  }

  /** Laczy piny w sieci metoda zbiorow rozlacznych. */
  private buildNets(): string[][] {
    const parent = new Map<string, string>()
    const find = (x: string): string => {
      let root = parent.get(x) ?? x
      if (root !== x) {
        root = find(root)
        parent.set(x, root)
      }
      return root
    }
    const union = (a: string, b: string) => {
      const ra = find(a)
      const rb = find(b)
      if (ra !== rb) parent.set(ra, rb)
    }

    const touch = (key: string) => {
      if (!parent.has(key)) parent.set(key, key)
    }

    for (const wire of this.wires) {
      const a = pinKey(wire.a)
      const b = pinKey(wire.b)
      touch(a)
      touch(b)
      union(a, b)
    }
    for (const [a, b] of this.keypadShorts()) {
      const ka = pinKey(a)
      const kb = pinKey(b)
      touch(ka)
      touch(kb)
      union(ka, kb)
    }

    const grouped = new Map<string, string[]>()
    for (const key of parent.keys()) {
      const root = find(key)
      const list = grouped.get(root)
      if (list) list.push(key)
      else grouped.set(root, [key])
    }
    return [...grouped.values()]
  }

  /**
   * Wylicza poziomy w sieciach i przekazuje wynik do mikrokontrolera.
   * Wywolywane po kazdym zapisie do portu i po kazdej zmianie polaczen.
   */
  resolve(): void {
    this.sampleBrightness()

    if (this.cachedNets === null) this.cachedNets = this.buildNets()
    const nets = this.cachedNets
    this.levels.clear()

    // Zdejmij poprzednie wymuszenia - piny bez polaczen maja zachowywac sie samodzielnie.
    for (const port of ['A', 'B', 'C', 'D'] as const) {
      for (let bit = 0; bit < 8; bit++) this.mcu.gpio.setExternal(port, bit, -1)
    }

    for (const members of nets) {
      let strongLow = false
      let strongHigh = false
      let pullup = false

      for (const key of members) {
        // Masa ze zlacza zasilania to twarde zero.
        if (key === 'JP9:0') {
          strongLow = true
          continue
        }
        if (key === 'JP9:1') {
          strongHigh = true
          continue
        }
        const [connector, indexText] = key.split(':')
        if (!isPortConnector(connector as ConnectorId)) continue
        const port = PORT_CONNECTORS[connector as 'JP16' | 'JP17' | 'JP18' | 'JP19']
        const drive = this.mcu.gpio.getDrive(port, Number(indexText))
        if (drive === 'low') strongLow = true
        else if (drive === 'high') strongHigh = true
        else if (drive === 'pullup') pullup = true
      }

      const level: NetLevel = strongLow ? 0 : strongHigh ? 1 : pullup ? 1 : -1
      for (const key of members) this.levels.set(key, level)

      if (level < 0) continue
      for (const key of members) {
        const [connector, indexText] = key.split(':')
        if (!isPortConnector(connector as ConnectorId)) continue
        const port = PORT_CONNECTORS[connector as 'JP16' | 'JP17' | 'JP18' | 'JP19']
        this.mcu.gpio.setExternal(port, Number(indexText), level)
      }
    }

    this.updateLcd()
  }

  /** Poziom na pinie zlacza: z netlisty, a jesli pin jest samotny - wprost z MCU. */
  pinLevel(pin: PinRef): NetLevel {
    const fromNet = this.levels.get(pinKey(pin))
    if (fromNet !== undefined) return fromNet
    if (isPortConnector(pin.connector)) {
      const port = PORT_CONNECTORS[pin.connector]
      return this.mcu.gpio.getLevel(port, pin.index) as NetLevel
    }
    return -1
  }

  // -------------------------------------------------------------------------
  // Peryferia
  // -------------------------------------------------------------------------

  private updateLcd(): void {
    const rs = this.pinLevel({ connector: 'JP29', index: 0 })
    const enable = this.pinLevel({ connector: 'JP29', index: 1 })
    let nibble = 0
    for (let i = 0; i < 4; i++) {
      if (this.pinLevel({ connector: 'JP29', index: 2 + i }) === 1) nibble |= 1 << i
    }
    this.lcd.update(rs === 1 ? 1 : 0, enable === 1 ? 1 : 0, nibble)
  }

  /**
   * Calkuje czas swiecenia diod i segmentow.
   * Wywolywane przed kazda zmiana stanu, wiec calka jest dokladna,
   * a nie probkowana - stad wierne odwzorowanie multipleksu i "ducha" cyfr.
   */
  private sampleBrightness(): void {
    const now = this.mcu.cpu.cycles
    const delta = now - this.lastSampleCycles
    this.lastSampleCycles = now
    if (delta <= 0) return

    for (let i = 0; i < LED_COUNT; i++) {
      if (this.pinLevel({ connector: 'JP22', index: i }) === 1) this.ledAccumulator[i] += delta
    }

    for (let digit = 0; digit < DIGIT_COUNT; digit++) {
      // Kolumna aktywna stanem niskim (tranzystor PNP na wspolnej anodzie).
      if (this.pinLevel({ connector: 'JP28', index: digit }) !== 0) continue
      for (let segment = 0; segment < SEGMENT_COUNT; segment++) {
        // Segment swieci przy stanie niskim (wspolna anoda).
        if (this.pinLevel({ connector: 'JP24', index: segment }) === 0) {
          this.digitAccumulator[digit * SEGMENT_COUNT + segment] += delta
        }
      }
    }

    this.accumulatedCycles += delta

    const hz = this.mcu.clockHz ?? 1_000_000
    if (this.accumulatedCycles >= PERSISTENCE_WINDOW_SECONDS * hz) {
      this.ledSnapshot = this.ledAccumulator.slice()
      this.digitSnapshot = this.digitAccumulator.slice()
      this.snapshotCycles = this.accumulatedCycles
      this.ledAccumulator.fill(0)
      this.digitAccumulator.fill(0)
      this.accumulatedCycles = 0
    }
  }

  /**
   * Stan plytki do wyrenderowania. Wywoluj z czestotliwoscia odswiezania ekranu.
   *
   * Jasnosc liczymy z zamknietego okna ORAZ z okna biezacego. Bez tego drugiego
   * skladnika swiezo zapalona dioda byla niewidoczna az do konca okna - a wtedy
   * test tuz po zmianie portu widzialby jeszcze stary obraz.
   */
  getState(): BoardState {
    this.sampleBrightness()
    const totalCycles = this.snapshotCycles + this.accumulatedCycles
    const scale = totalCycles > 0 ? 1 / totalCycles : 0

    const leds: LedState[] = []
    for (let i = 0; i < LED_COUNT; i++) {
      const brightness = Math.min(1, (this.ledSnapshot[i] + this.ledAccumulator[i]) * scale)
      leds.push({ brightness, on: brightness > 0.02 })
    }

    const digits: DigitState[] = []
    for (let digit = 0; digit < DIGIT_COUNT; digit++) {
      const segments: number[] = []
      for (let segment = 0; segment < SEGMENT_COUNT; segment++) {
        const index = digit * SEGMENT_COUNT + segment
        segments.push(Math.min(1, (this.digitSnapshot[index] + this.digitAccumulator[index]) * scale))
      }
      digits.push({ segments })
    }

    return {
      leds,
      digits,
      lcd: this.lcd.getState(),
      keysPressed: [...this.pressedKeys],
    }
  }

  // -------------------------------------------------------------------------
  // Zasilanie i zworki
  // -------------------------------------------------------------------------

  setPower(on: boolean): void {
    this.mcu.powered = on
    this.onWiringChange?.()
    if (on) {
      this.mcu.reset()
      this.lcd.reset()
      this.rs232.reset()
      this.resetPersistence()
    }
    this.resolve()
  }

  setJumper(name: keyof Jumpers, closed: boolean): void {
    this.jumpers[name] = closed
    this.invalidateNets()
    if (name === 'JP4') this.mcu.usart.rxdEnabled = closed
    if (name === 'JP25') {
      this.mcu.crystalConnected = closed
      this.mcu.applyFuses()
    }
    this.resolve()
  }

  reset(): void {
    this.mcu.reset()
    this.lcd.reset()
    this.rs232.reset()
    this.resetPersistence()
    this.resolve()
  }

  private resetPersistence(): void {
    this.ledAccumulator.fill(0)
    this.digitAccumulator.fill(0)
    this.ledSnapshot.fill(0)
    this.digitSnapshot.fill(0)
    this.accumulatedCycles = 0
    this.lastSampleCycles = this.mcu.cpu.cycles
    this.snapshotCycles = 0
  }
}

export { CONNECTORS, CONNECTOR_FOR_PORT }
