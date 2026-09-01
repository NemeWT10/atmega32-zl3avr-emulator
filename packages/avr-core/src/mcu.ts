/**
 * ATmega32 - zlozenie rdzenia, peryferiow, fuse bitow i systemu przerwan.
 *
 * To jest punkt, w ktorym spina sie najwazniejsza zasada calego emulatora:
 * czestotliwosc taktowania bierze sie z FUSE BITOW, a nie z `#define F_CPU`.
 * Kod skompilowany dla 4 MHz uruchomiony na fabrycznym 1 MHz bedzie dzialal
 * cztery razy wolniej - i tak wlasnie ma byc.
 */

import { CPU, RAM_END } from './cpu'
import { bytesToWords, parseIntelHex } from './hex'
import {
  FACTORY_FUSES,
  isJtagEnabled,
  resolveClockHz,
  type FuseBytes,
} from './fuses'
import {
  INTERRUPT_SOURCES,
  IO,
  SREG_I,
  type PortName,
} from './registers'
import { Gpio } from './peripherals/gpio'
import { Timer16, Timer8, createTimer0, createTimer2 } from './peripherals/timers'
import { Usart } from './peripherals/usart'

export interface McuOptions {
  fuses?: FuseBytes
  /** Zworka JP25 - kwarc 16 MHz dolaczony do XTAL1/XTAL2. */
  crystalConnected?: boolean
}

export class Atmega32 {
  readonly cpu = new CPU()
  readonly gpio: Gpio
  readonly timer0: Timer8
  readonly timer1: Timer16
  readonly timer2: Timer8
  readonly usart: Usart

  fuses: FuseBytes = { ...FACTORY_FUSES }
  crystalConnected = false

  /** Czy uklad ma wgrany program. Bez tego symulacja nie ma czego wykonywac. */
  programmed = false
  /** Czy plytka jest zasilona. */
  powered = false

  private previousIntPins = 0

  /**
   * Wywolywane po KAZDEJ instrukcji. Potrzebne ukladom, ktore probkuja przebiegi
   * z rozdzielczoscia pojedynczych cykli - np. odbiornik po stronie komputera PC,
   * dla ktorego jeden bit transmisji 9600 trwa okolo 100 cykli i przy odpytywaniu
   * raz na klatke ekranu przegapilby cala ramke.
   */
  onStep: ((cycles: number) => void) | null = null

  constructor(options: McuOptions = {}) {
    if (options.fuses) this.fuses = { ...options.fuses }
    if (options.crystalConnected !== undefined) this.crystalConnected = options.crystalConnected

    this.gpio = new Gpio(this.cpu)
    this.timer0 = createTimer0(this.cpu, this.gpio)
    this.timer1 = new Timer16(this.cpu, this.gpio)
    this.timer2 = createTimer2(this.cpu, this.gpio)
    this.usart = new Usart(this.cpu)

    this.installFlagRegisters()
    this.applyFuses()
  }

  /**
   * Flagi przerwan kasuje sie ZAPISEM JEDYNKI pod odpowiedni bit.
   * `TIFR = (1<<OCF0)` czysci flage; `TIFR &= ~(1<<OCF0)` nie robi nic sensownego.
   * Studenci mylą to nagminnie, wiec semantyka musi byc dokladna.
   */
  private installFlagRegisters(): void {
    for (const reg of [IO.TIFR, IO.GIFR]) {
      this.cpu.onIoWrite(reg, (_io, value) => {
        this.cpu.setIoDirect(reg, this.cpu.getIoDirect(reg) & ~value)
        return true
      })
    }
  }

  /** Czestotliwosc taktowania wynikajaca z fuse bitow. `null` = brak zegara. */
  get clockHz(): number | null {
    return resolveClockHz(this.fuses, this.crystalConnected)
  }

  applyFuses(): void {
    this.gpio.jtagEnabled = isJtagEnabled(this.fuses)
    this.usart.clockHz = this.clockHz ?? 1_000_000
  }

  setFuses(fuses: FuseBytes): void {
    this.fuses = { ...fuses }
    this.applyFuses()
  }

  /** Wgrywa program z pliku Intel HEX (dokladnie tak jak programator ISP). */
  loadHex(hexText: string): { size: number } {
    const { bytes, size } = parseIntelHex(hexText)
    this.cpu.flash.fill(0)
    bytesToWords(bytes, this.cpu.flash)
    this.programmed = size > 0
    this.reset()
    return { size }
  }

  /** Wgrywa gotowy obraz FLASH (do testow i do backendu kompilatora). */
  loadFlashBytes(bytes: Uint8Array): void {
    this.cpu.flash.fill(0)
    bytesToWords(bytes, this.cpu.flash)
    this.programmed = bytes.length > 0
    this.reset()
  }

  reset(): void {
    this.cpu.reset()
    this.cpu.setSP(RAM_END)
    this.gpio.reset()
    this.timer0.reset()
    this.timer1.reset()
    this.timer2.reset()
    this.usart.reset()
    this.previousIntPins = 0
    this.applyFuses()
  }

  // -------------------------------------------------------------------------
  // Przerwania
  // -------------------------------------------------------------------------

  /** Znajduje przerwanie o najwyzszym priorytecie gotowe do obsluzenia. */
  private pendingInterrupt(): (typeof INTERRUPT_SOURCES)[number] | null {
    for (const source of INTERRUPT_SOURCES) {
      const enabled = this.cpu.getIoDirect(source.enableReg) & (1 << source.enableBit)
      if (!enabled) continue
      const flagged = this.cpu.getIoDirect(source.flagReg) & (1 << source.flagBit)
      if (flagged) return source
    }
    return null
  }

  private serviceInterrupts(): void {
    if (!this.cpu.getFlag(SREG_I)) return
    const source = this.pendingInterrupt()
    if (!source) return

    // Flagi USART sa kasowane operacja na UDR (odczyt dla RXC, zapis dla UDRE),
    // a nie wejsciem w wektor - inaczej przerwanie UDRE gubiloby sie po jednym bajcie.
    if (source.flagReg !== IO.UCSRA) {
      this.cpu.setIoDirect(
        source.flagReg,
        this.cpu.getIoDirect(source.flagReg) & ~(1 << source.flagBit),
      )
    }
    this.cpu.enterInterrupt(source.vector)
  }

  /**
   * Przerwania zewnetrzne INT0 (PD2), INT1 (PD3) i INT2 (PB2).
   * Na plytce uzywa sie ich z linia JP13 "Klawisz wcisniety".
   */
  private updateExternalInterrupts(): void {
    const mcucr = this.cpu.getIoDirect(IO.MCUCR)
    const mcucsr = this.cpu.getIoDirect(IO.MCUCSR)
    const levels =
      this.gpio.getLevel('D', 2) | (this.gpio.getLevel('D', 3) << 1) | (this.gpio.getLevel('B', 2) << 2)
    const changed = levels ^ this.previousIntPins

    const trigger = (index: number, isc: number, flagBit: number) => {
      const mask = 1 << index
      const level = (levels & mask) !== 0
      const wasLevel = (this.previousIntPins & mask) !== 0
      let fire = false
      switch (isc) {
        case 0: // poziom niski
          fire = !level
          break
        case 1: // dowolna zmiana
          fire = (changed & mask) !== 0
          break
        case 2: // zbocze opadajace
          fire = wasLevel && !level
          break
        default: // zbocze narastajace
          fire = !wasLevel && level
          break
      }
      if (fire) {
        this.cpu.setIoDirect(IO.GIFR, this.cpu.getIoDirect(IO.GIFR) | (1 << flagBit))
      }
    }

    trigger(0, mcucr & 0x03, 6) // INT0 -> ISC01:ISC00, flaga INTF0
    trigger(1, (mcucr >> 2) & 0x03, 7) // INT1 -> ISC11:ISC10, flaga INTF1
    // INT2 jest wylacznie zboczowe; ISC2 w MCUCSR wybiera narastajace (1) lub opadajace (0)
    trigger(2, (mcucsr >> 6) & 1 ? 3 : 2, 5)

    this.previousIntPins = levels
  }

  // -------------------------------------------------------------------------
  // Wykonanie
  // -------------------------------------------------------------------------

  /** Wykonuje jedna instrukcje wraz z obsluga peryferiow. Zwraca liczbe cykli. */
  step(): number {
    if (!this.powered || !this.programmed || this.clockHz === null) return 0

    this.serviceInterrupts()
    const cycles = this.cpu.step()

    this.timer0.tick(cycles)
    this.timer1.tick(cycles)
    this.timer2.tick(cycles)
    this.usart.tick()
    this.updateExternalInterrupts()
    this.onStep?.(cycles)

    return cycles
  }

  /** Wykonuje co najmniej `cycles` cykli. Zwraca faktyczna liczbe wykonanych cykli. */
  runCycles(cycles: number): number {
    if (!this.powered || !this.programmed || this.clockHz === null) return 0
    const target = this.cpu.cycles + cycles
    let executed = 0
    while (this.cpu.cycles < target) {
      const used = this.step()
      if (used === 0) break
      executed += used
      if (this.cpu.breakHit) break
    }
    return executed
  }

  /** Wykonuje symulacje przez zadany czas rzeczywisty (w sekundach). */
  runSeconds(seconds: number): number {
    const hz = this.clockHz
    if (hz === null) return 0
    return this.runCycles(Math.round(seconds * hz))
  }

  /** Czas symulowany od resetu, w sekundach. */
  get elapsedSeconds(): number {
    const hz = this.clockHz
    if (hz === null) return 0
    return this.cpu.cycles / hz
  }

  /** Stan wyjsc portu - to, co "widzi" plytka. */
  readPort(port: PortName): number {
    return this.gpio.readPort(port)
  }
}
