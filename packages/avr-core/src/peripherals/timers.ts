/**
 * Timery/liczniki ATmega32: TC0 (8-bit), TC1 (16-bit), TC2 (8-bit).
 *
 * Rzeczy, ktore musza byc wierne, bo na nich opieraja sie lab. 4 i 5:
 *   - flagi TOV/OCF w TIFR kasuje sie ZAPISEM JEDYNKI (zapis zera nic nie robi),
 *   - w trybie CTC okres wynosi (1 + OCR) taktow preskalera,
 *   - rejestry 16-bitowe TC1 przechodza przez wspolny rejestr TEMP: zapis starszego
 *     bajtu trafia do TEMP, a dopiero zapis mlodszego przenosi cala pare do licznika.
 *     Odczyt dziala odwrotnie - mlodszy bajt zatrzaskuje starszy w TEMP.
 *     Kompilator generuje wlasciwa kolejnosc sam, ale bez tego mechanizmu
 *     16-bitowe odczyty TCNT1 rozjezdzalyby sie przy przekroczeniu 0xFF.
 */

import { IO, OCF0, OCF1A, OCF1B, OCF2, TOV0, TOV1, TOV2 } from '../registers'
import type { CPU } from '../cpu'
import type { Gpio } from './gpio'
import type { PortName } from '../registers'

const PRESCALER_T01 = [0, 1, 8, 64, 256, 1024, 0, 0]
const PRESCALER_T2 = [0, 1, 8, 32, 64, 128, 256, 1024]

/** Sposob reakcji wyjscia Output Compare (bity COM). */
const COM_DISCONNECTED = 0
const COM_TOGGLE = 1
const COM_CLEAR = 2
const COM_SET = 3

function setFlag(cpu: CPU, bit: number): void {
  cpu.setIoDirect(IO.TIFR, cpu.getIoDirect(IO.TIFR) | (1 << bit))
}

// ---------------------------------------------------------------------------
// Timer 8-bitowy (TC0 i TC2)
// ---------------------------------------------------------------------------

interface Timer8Config {
  tccr: number
  tcnt: number
  ocr: number
  ovfFlag: number
  ocfFlag: number
  prescalers: number[]
  ocPin: { port: PortName; bit: number }
}

export class Timer8 {
  private prescalerCounter = 0

  constructor(
    private readonly cpu: CPU,
    private readonly gpio: Gpio,
    private readonly cfg: Timer8Config,
  ) {
    // Zapis TCNT/OCR idzie zwykla sciezka - wystarcza domyslne przechowywanie w I/O.
  }

  private get tccr(): number {
    return this.cpu.getIoDirect(this.cfg.tccr)
  }

  private get divider(): number {
    return this.cfg.prescalers[this.tccr & 0x07]
  }

  /** WGM01:WGM00 -> 0 Normal, 1 PWM z korekcja fazy, 2 CTC, 3 Fast PWM. */
  private get wgm(): number {
    const tccr = this.tccr
    return (((tccr >> 3) & 1) << 1) | ((tccr >> 6) & 1)
  }

  private get com(): number {
    return (this.tccr >> 4) & 0x03
  }

  private get top(): number {
    return this.wgm === 2 ? this.cpu.getIoDirect(this.cfg.ocr) : 0xff
  }

  tick(cycles: number): void {
    const divider = this.divider
    if (divider === 0) return
    this.prescalerCounter += cycles
    while (this.prescalerCounter >= divider) {
      this.prescalerCounter -= divider
      this.count()
    }
  }

  private count(): void {
    const ocr = this.cpu.getIoDirect(this.cfg.ocr)
    const top = this.top
    let tcnt = this.cpu.getIoDirect(this.cfg.tcnt)

    if (this.wgm === 1) {
      // PWM z korekcja fazy: licznik chodzi w gore i w dol
      if (this.countingDown) {
        tcnt = (tcnt - 1) & 0xff
        if (tcnt === 0) {
          this.countingDown = false
          setFlag(this.cpu, this.cfg.ovfFlag)
        }
      } else {
        tcnt = (tcnt + 1) & 0xff
        if (tcnt === top) this.countingDown = true
      }
    } else if (tcnt === top) {
      tcnt = 0
      if (this.wgm === 3) setFlag(this.cpu, this.cfg.ovfFlag) // Fast PWM: TOV na TOP
      else if (top === 0xff) setFlag(this.cpu, this.cfg.ovfFlag)
    } else {
      tcnt = (tcnt + 1) & 0xff
      if (tcnt === 0) setFlag(this.cpu, this.cfg.ovfFlag)
    }

    this.cpu.setIoDirect(this.cfg.tcnt, tcnt)

    if (tcnt === ocr) {
      setFlag(this.cpu, this.cfg.ocfFlag)
      this.updateOutputPin()
    }
  }

  private countingDown = false
  private pinLevel = 0

  private updateOutputPin(): void {
    const com = this.com
    if (com === COM_DISCONNECTED) {
      this.gpio.setOverride(this.cfg.ocPin.port, this.cfg.ocPin.bit, -1)
      return
    }
    if (com === COM_TOGGLE) this.pinLevel = this.pinLevel ? 0 : 1
    else if (com === COM_CLEAR) this.pinLevel = 0
    else if (com === COM_SET) this.pinLevel = 1
    this.gpio.setOverride(this.cfg.ocPin.port, this.cfg.ocPin.bit, this.pinLevel ? 1 : 0)
  }

  reset(): void {
    this.prescalerCounter = 0
    this.countingDown = false
    this.pinLevel = 0
  }
}

// ---------------------------------------------------------------------------
// Timer 16-bitowy (TC1)
// ---------------------------------------------------------------------------

export class Timer16 {
  private prescalerCounter = 0
  private countingDown = false
  /** Wspolny rejestr TEMP dla wszystkich 16-bitowych rejestrow TC1. */
  private temp = 0
  private tcnt = 0
  private ocr1a = 0
  private ocr1b = 0
  private icr1 = 0
  private pinLevelA = 0
  private pinLevelB = 0

  constructor(
    private readonly cpu: CPU,
    private readonly gpio: Gpio,
  ) {
    this.install()
  }

  private install(): void {
    const cpu = this.cpu

    // --- TCNT1: zapis przez TEMP, odczyt zatrzaskuje starszy bajt
    cpu.onIoWrite(IO.TCNT1H, (_io, value) => {
      this.temp = value
      return true
    })
    cpu.onIoWrite(IO.TCNT1L, (_io, value) => {
      this.tcnt = ((this.temp << 8) | value) & 0xffff
      this.syncShadow()
      return true
    })
    cpu.onIoRead(IO.TCNT1L, () => {
      this.temp = (this.tcnt >> 8) & 0xff
      return this.tcnt & 0xff
    })
    cpu.onIoRead(IO.TCNT1H, () => this.temp)

    this.installPair(IO.OCR1AH, IO.OCR1AL, (v) => (this.ocr1a = v), () => this.ocr1a)
    this.installPair(IO.OCR1BH, IO.OCR1BL, (v) => (this.ocr1b = v), () => this.ocr1b)
    this.installPair(IO.ICR1H, IO.ICR1L, (v) => (this.icr1 = v), () => this.icr1)
  }

  private installPair(
    high: number,
    low: number,
    set: (value: number) => void,
    get: () => number,
  ): void {
    this.cpu.onIoWrite(high, (_io, value) => {
      this.temp = value
      return true
    })
    this.cpu.onIoWrite(low, (_io, value) => {
      set(((this.temp << 8) | value) & 0xffff)
      this.syncShadow()
      return true
    })
    this.cpu.onIoRead(low, () => {
      this.temp = (get() >> 8) & 0xff
      return get() & 0xff
    })
    this.cpu.onIoRead(high, () => this.temp)
  }

  /** Kopia w rejestrach I/O, zeby podglad rejestrow w debuggerze pokazywal prawde. */
  private syncShadow(): void {
    this.cpu.setIoDirect(IO.TCNT1L, this.tcnt & 0xff)
    this.cpu.setIoDirect(IO.TCNT1H, (this.tcnt >> 8) & 0xff)
    this.cpu.setIoDirect(IO.OCR1AL, this.ocr1a & 0xff)
    this.cpu.setIoDirect(IO.OCR1AH, (this.ocr1a >> 8) & 0xff)
    this.cpu.setIoDirect(IO.OCR1BL, this.ocr1b & 0xff)
    this.cpu.setIoDirect(IO.OCR1BH, (this.ocr1b >> 8) & 0xff)
  }

  private get tccr1a(): number {
    return this.cpu.getIoDirect(IO.TCCR1A)
  }

  private get tccr1b(): number {
    return this.cpu.getIoDirect(IO.TCCR1B)
  }

  private get divider(): number {
    return PRESCALER_T01[this.tccr1b & 0x07]
  }

  /** WGM13..WGM10 zlozone w jedna liczbe 0..15 (datasheet Table 47). */
  private get wgm(): number {
    const a = this.tccr1a
    const b = this.tccr1b
    return ((b >> 4) & 1) * 8 + ((b >> 3) & 1) * 4 + ((a >> 1) & 1) * 2 + (a & 1)
  }

  private get top(): number {
    switch (this.wgm) {
      case 1:
      case 5:
        return 0x00ff
      case 2:
      case 6:
        return 0x01ff
      case 3:
      case 7:
        return 0x03ff
      case 4:
      case 9:
      case 11:
      case 15:
        return this.ocr1a
      case 8:
      case 10:
      case 12:
      case 14:
        return this.icr1
      default:
        return 0xffff
    }
  }

  /** Tryby z licznikiem chodzacym w gore i w dol (PWM z korekcja fazy). */
  private get isDualSlope(): boolean {
    const wgm = this.wgm
    return wgm === 1 || wgm === 2 || wgm === 3 || wgm === 8 || wgm === 9 || wgm === 10 || wgm === 11
  }

  /** Tryby Fast PWM ustawiaja TOV na TOP, a nie na MAX. */
  private get isFastPwm(): boolean {
    const wgm = this.wgm
    return wgm === 5 || wgm === 6 || wgm === 7 || wgm === 14 || wgm === 15
  }

  tick(cycles: number): void {
    const divider = this.divider
    if (divider === 0) return
    this.prescalerCounter += cycles
    while (this.prescalerCounter >= divider) {
      this.prescalerCounter -= divider
      this.count()
    }
  }

  private count(): void {
    const top = this.top

    if (this.isDualSlope) {
      if (this.countingDown) {
        this.tcnt = (this.tcnt - 1) & 0xffff
        if (this.tcnt === 0) {
          this.countingDown = false
          setFlag(this.cpu, TOV1)
        }
      } else {
        this.tcnt = (this.tcnt + 1) & 0xffff
        if (this.tcnt >= top) {
          this.tcnt = top
          this.countingDown = true
        }
      }
    } else if (this.tcnt === top) {
      this.tcnt = 0
      if (this.isFastPwm || top === 0xffff) setFlag(this.cpu, TOV1)
    } else {
      this.tcnt = (this.tcnt + 1) & 0xffff
      if (this.tcnt === 0) setFlag(this.cpu, TOV1)
    }

    if (this.tcnt === this.ocr1a) {
      setFlag(this.cpu, OCF1A)
      this.updatePin('A')
    }
    if (this.tcnt === this.ocr1b) {
      setFlag(this.cpu, OCF1B)
      this.updatePin('B')
    }

    this.syncShadow()
  }

  private updatePin(channel: 'A' | 'B'): void {
    const com = channel === 'A' ? (this.tccr1a >> 6) & 0x03 : (this.tccr1a >> 4) & 0x03
    const pin = channel === 'A' ? { port: 'D' as PortName, bit: 5 } : { port: 'D' as PortName, bit: 4 }
    if (com === COM_DISCONNECTED) {
      this.gpio.setOverride(pin.port, pin.bit, -1)
      return
    }
    let level = channel === 'A' ? this.pinLevelA : this.pinLevelB
    if (com === COM_TOGGLE) level = level ? 0 : 1
    else if (com === COM_CLEAR) level = 0
    else if (com === COM_SET) level = 1
    if (channel === 'A') this.pinLevelA = level
    else this.pinLevelB = level
    this.gpio.setOverride(pin.port, pin.bit, level ? 1 : 0)
  }

  getCounter(): number {
    return this.tcnt
  }

  reset(): void {
    this.prescalerCounter = 0
    this.countingDown = false
    this.temp = 0
    this.tcnt = 0
    this.ocr1a = 0
    this.ocr1b = 0
    this.icr1 = 0
    this.pinLevelA = 0
    this.pinLevelB = 0
  }
}

// ---------------------------------------------------------------------------
// Fabryki dla konkretnych timerow ATmega32
// ---------------------------------------------------------------------------

export function createTimer0(cpu: CPU, gpio: Gpio): Timer8 {
  return new Timer8(cpu, gpio, {
    tccr: IO.TCCR0,
    tcnt: IO.TCNT0,
    ocr: IO.OCR0,
    ovfFlag: TOV0,
    ocfFlag: OCF0,
    prescalers: PRESCALER_T01,
    ocPin: { port: 'B', bit: 3 }, // OC0 = PB3
  })
}

export function createTimer2(cpu: CPU, gpio: Gpio): Timer8 {
  return new Timer8(cpu, gpio, {
    tccr: IO.TCCR2,
    tcnt: IO.TCNT2,
    ocr: IO.OCR2,
    ovfFlag: TOV2,
    ocfFlag: OCF2,
    prescalers: PRESCALER_T2,
    ocPin: { port: 'D', bit: 7 }, // OC2 = PD7
  })
}
