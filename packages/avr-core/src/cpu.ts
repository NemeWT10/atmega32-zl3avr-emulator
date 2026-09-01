/**
 * Rdzen procesora AVR8 (rodzina avr5 - ATmega32).
 *
 * Model wykonania: instrukcja po instrukcji, z dokladnym zliczaniem cykli.
 * Cykle sa waluta calego emulatora - z nich wynika czas, a wiec i to,
 * czy `_delay_ms(1000)` trwa sekunde, czy cztery (patrz pulapka F_CPU).
 *
 * Przestrzen danych ATmega32 (2144 bajty):
 *   0x0000-0x001F  rejestry robocze R0-R31
 *   0x0020-0x005F  rejestry I/O (adres I/O = adres danych - 0x20)
 *   0x0060-0x085F  SRAM (2 kB)
 *
 * Peryferia podpinaja sie przez `onIoRead` / `onIoWrite` - dzieki temu rdzen
 * nic nie wie o timerach ani o USART, a rejestry zachowuja sie tak,
 * jak opisuje datasheet (np. zapis 1 kasuje flage w TIFR).
 */

import { SREG_C, SREG_H, SREG_I, SREG_N, SREG_S, SREG_T, SREG_V, SREG_Z } from './registers'

export const DATA_SIZE = 0x0860
export const SRAM_START = 0x0060
export const RAM_END = 0x085f
export const FLASH_WORDS = 16 * 1024

/** Handler odczytu rejestru I/O. Zwroc `undefined`, zeby uzyc surowej wartosci. */
export type IoReadHook = (io: number) => number | undefined
/** Handler zapisu rejestru I/O. Zwroc `true`, jesli zapis zostal w pelni obsluzony. */
export type IoWriteHook = (io: number, value: number) => boolean | void

export class CPU {
  readonly flash = new Uint16Array(FLASH_WORDS)
  readonly data = new Uint8Array(DATA_SIZE)

  /** Licznik rozkazow - adres SLOWNY (nie bajtowy), jak w dokumentacji AVR. */
  pc = 0
  /** Sumaryczna liczba cykli zegara od resetu. */
  cycles = 0
  /** Ustawiane przez SLEEP; przerwanie budzi rdzen. */
  sleeping = false
  /** Ustawiane przez BREAK - w emulatorze traktujemy jak pulapke debuggera. */
  breakHit = false

  private readonly ioReadHooks: (IoReadHook | undefined)[] = new Array(64).fill(undefined)
  private readonly ioWriteHooks: (IoWriteHook | undefined)[] = new Array(64).fill(undefined)

  constructor() {
    this.reset()
  }

  reset(): void {
    this.data.fill(0)
    this.pc = 0
    this.cycles = 0
    this.sleeping = false
    this.breakHit = false
    this.setSP(RAM_END)
  }

  onIoRead(io: number, hook: IoReadHook): void {
    this.ioReadHooks[io] = hook
  }

  onIoWrite(io: number, hook: IoWriteHook): void {
    this.ioWriteHooks[io] = hook
  }

  // -------------------------------------------------------------------------
  // Dostep do pamieci
  // -------------------------------------------------------------------------

  readData(addr: number): number {
    if (addr >= 0x20 && addr < 0x60) {
      const hook = this.ioReadHooks[addr - 0x20]
      if (hook) {
        const value = hook(addr - 0x20)
        if (value !== undefined) return value & 0xff
      }
    }
    return this.data[addr]
  }

  writeData(addr: number, value: number): void {
    value &= 0xff
    if (addr >= 0x20 && addr < 0x60) {
      const hook = this.ioWriteHooks[addr - 0x20]
      if (hook && hook(addr - 0x20, value) === true) return
    }
    this.data[addr] = value
  }

  /** Zapis rejestru I/O z pominieciem handlerow - dla peryferiow aktualizujacych swoj stan. */
  setIoDirect(io: number, value: number): void {
    this.data[io + 0x20] = value & 0xff
  }

  getIoDirect(io: number): number {
    return this.data[io + 0x20]
  }

  get sreg(): number {
    return this.data[0x5f]
  }

  set sreg(value: number) {
    this.data[0x5f] = value & 0xff
  }

  getFlag(bit: number): boolean {
    return (this.data[0x5f] & (1 << bit)) !== 0
  }

  getSP(): number {
    return this.data[0x5d] | (this.data[0x5e] << 8)
  }

  setSP(value: number): void {
    this.data[0x5d] = value & 0xff
    this.data[0x5e] = (value >> 8) & 0xff
  }

  private push(value: number): void {
    const sp = this.getSP()
    this.data[sp] = value & 0xff
    this.setSP(sp - 1)
  }

  private pop(): number {
    const sp = this.getSP() + 1
    this.setSP(sp)
    return this.data[sp]
  }

  // -------------------------------------------------------------------------
  // Przerwania
  // -------------------------------------------------------------------------

  /**
   * Wejscie w obsluge przerwania: odloz PC na stos, wyzeruj I, skocz pod wektor.
   * Kosztuje 4 cykle (datasheet: 4 cykle + czas wykonania instrukcji w wektorze).
   */
  enterInterrupt(vector: number): void {
    this.sleeping = false
    this.push(this.pc & 0xff)
    this.push((this.pc >> 8) & 0xff)
    this.sreg = this.sreg & ~(1 << SREG_I)
    this.pc = vector
    this.cycles += 4
  }

  // -------------------------------------------------------------------------
  // Flagi
  // -------------------------------------------------------------------------

  private setFlagsLogic(result: number): void {
    let s = this.data[0x5f] & ~((1 << SREG_S) | (1 << SREG_V) | (1 << SREG_N) | (1 << SREG_Z))
    const n = (result & 0x80) !== 0
    if (n) s |= (1 << SREG_N) | (1 << SREG_S)
    if (result === 0) s |= 1 << SREG_Z
    this.data[0x5f] = s
  }

  private setFlagsAdd(d: number, r: number, result: number): void {
    const res = result & 0xff
    let s = this.data[0x5f] & ~0x3f
    const h = ((d & r) | (r & ~res) | (~res & d)) & 0x08
    const c = ((d & r) | (r & ~res) | (~res & d)) & 0x80
    const v = ((d & r & ~res) | (~d & ~r & res)) & 0x80
    const n = res & 0x80
    if (h) s |= 1 << SREG_H
    if (v) s |= 1 << SREG_V
    if (n) s |= 1 << SREG_N
    if (!!n !== !!v) s |= 1 << SREG_S
    if (c) s |= 1 << SREG_C
    if (res === 0) s |= 1 << SREG_Z
    this.data[0x5f] = s
  }

  private setFlagsSub(d: number, r: number, result: number, keepZ: boolean): void {
    const res = result & 0xff
    let s = this.data[0x5f] & ~0x3f
    const h = ((~d & r) | (r & res) | (res & ~d)) & 0x08
    const c = ((~d & r) | (r & res) | (res & ~d)) & 0x80
    const v = ((d & ~r & ~res) | (~d & r & res)) & 0x80
    const n = res & 0x80
    if (h) s |= 1 << SREG_H
    if (v) s |= 1 << SREG_V
    if (n) s |= 1 << SREG_N
    if (!!n !== !!v) s |= 1 << SREG_S
    if (c) s |= 1 << SREG_C
    if (keepZ) {
      // SBC/SBCI/CPC: Z pozostaje ustawione tylko jesli bylo i wynik jest zerowy
      if (res === 0 && (this.data[0x5f] & (1 << SREG_Z)) !== 0) s |= 1 << SREG_Z
    } else if (res === 0) {
      s |= 1 << SREG_Z
    }
    this.data[0x5f] = s
  }

  private setFlagsShift(result: number, carry: boolean, negative: boolean): void {
    let s = this.data[0x5f] & ~0x1f
    if (carry) s |= 1 << SREG_C
    if (negative) s |= 1 << SREG_N
    if (result === 0) s |= 1 << SREG_Z
    const v = negative !== carry
    if (v) s |= 1 << SREG_V
    if (negative !== v) s |= 1 << SREG_S
    this.data[0x5f] = s
  }

  // -------------------------------------------------------------------------
  // Wykonanie jednej instrukcji
  // -------------------------------------------------------------------------

  /** Wykonuje jedna instrukcje i zwraca liczbe zuzytych cykli. */
  step(): number {
    if (this.sleeping) {
      this.cycles += 1
      return 1
    }

    const startCycles = this.cycles
    const data = this.data
    const opcode = this.flash[this.pc]
    this.pc = (this.pc + 1) & 0xffff

    switch (opcode & 0xf000) {
      // ---------------------------------------------------------------- 0x0
      case 0x0000: {
        if (opcode === 0x0000) {
          this.cycles += 1 // NOP
        } else if ((opcode & 0xff00) === 0x0100) {
          // MOVW Rd+1:Rd, Rr+1:Rr
          const d = ((opcode & 0xf0) >> 4) * 2
          const r = (opcode & 0x0f) * 2
          data[d] = data[r]
          data[d + 1] = data[r + 1]
          this.cycles += 1
        } else if ((opcode & 0xff00) === 0x0200) {
          // MULS
          const d = 16 + ((opcode & 0xf0) >> 4)
          const r = 16 + (opcode & 0x0f)
          const product = (((data[d] << 24) >> 24) * ((data[r] << 24) >> 24)) & 0xffff
          data[0] = product & 0xff
          data[1] = (product >> 8) & 0xff
          this.setMulFlags(product)
          this.cycles += 2
        } else if ((opcode & 0xff00) === 0x0300) {
          const d = 16 + ((opcode & 0x70) >> 4)
          const r = 16 + (opcode & 0x07)
          const dSigned = (data[d] << 24) >> 24
          const rSigned = (data[r] << 24) >> 24
          let product: number
          if ((opcode & 0x88) === 0x00) {
            product = (dSigned * data[r]) & 0xffff // MULSU
          } else if ((opcode & 0x88) === 0x08) {
            product = ((data[d] * data[r]) << 1) & 0xffff // FMUL
          } else if ((opcode & 0x88) === 0x80) {
            product = ((dSigned * rSigned) << 1) & 0xffff // FMULS
          } else {
            product = ((dSigned * data[r]) << 1) & 0xffff // FMULSU
          }
          data[0] = product & 0xff
          data[1] = (product >> 8) & 0xff
          this.setMulFlags(product)
          this.cycles += 2
        } else {
          // CPC / SBC / ADD
          const d = (opcode & 0x01f0) >> 4
          const r = (opcode & 0x0f) | ((opcode & 0x0200) >> 5)
          const vd = data[d]
          const vr = data[r]
          const carry = data[0x5f] & 1
          if ((opcode & 0x0c00) === 0x0400) {
            // CPC
            const result = (vd - vr - carry) & 0xff
            this.setFlagsSub(vd, vr, result, true)
          } else if ((opcode & 0x0c00) === 0x0800) {
            // SBC
            const result = (vd - vr - carry) & 0xff
            this.setFlagsSub(vd, vr, result, true)
            data[d] = result
          } else {
            // ADD
            const result = (vd + vr) & 0xff
            this.setFlagsAdd(vd, vr, result)
            data[d] = result
          }
          this.cycles += 1
        }
        break
      }

      // ---------------------------------------------------------------- 0x1
      case 0x1000: {
        const d = (opcode & 0x01f0) >> 4
        const r = (opcode & 0x0f) | ((opcode & 0x0200) >> 5)
        const vd = data[d]
        const vr = data[r]
        switch (opcode & 0x0c00) {
          case 0x0000: {
            // CPSE - pomin nastepna instrukcje, jesli rowne
            this.cycles += 1
            if (vd === vr) this.skipNextInstruction()
            break
          }
          case 0x0400: {
            // CP
            this.setFlagsSub(vd, vr, (vd - vr) & 0xff, false)
            this.cycles += 1
            break
          }
          case 0x0800: {
            // SUB
            const result = (vd - vr) & 0xff
            this.setFlagsSub(vd, vr, result, false)
            data[d] = result
            this.cycles += 1
            break
          }
          default: {
            // ADC
            const carry = data[0x5f] & 1
            const result = (vd + vr + carry) & 0xff
            this.setFlagsAdd(vd, vr, result)
            data[d] = result
            this.cycles += 1
            break
          }
        }
        break
      }

      // ---------------------------------------------------------------- 0x2
      case 0x2000: {
        const d = (opcode & 0x01f0) >> 4
        const r = (opcode & 0x0f) | ((opcode & 0x0200) >> 5)
        switch (opcode & 0x0c00) {
          case 0x0000: {
            const result = data[d] & data[r]
            data[d] = result
            this.setFlagsLogic(result)
            break
          }
          case 0x0400: {
            const result = data[d] ^ data[r]
            data[d] = result
            this.setFlagsLogic(result)
            break
          }
          case 0x0800: {
            const result = data[d] | data[r]
            data[d] = result
            this.setFlagsLogic(result)
            break
          }
          default:
            data[d] = data[r] // MOV
            break
        }
        this.cycles += 1
        break
      }

      // -------------------------------------------------- 0x3 CPI / 0x4 SBCI
      case 0x3000: {
        const d = 16 + ((opcode & 0xf0) >> 4)
        const k = (opcode & 0x0f) | ((opcode & 0x0f00) >> 4)
        this.setFlagsSub(data[d], k, (data[d] - k) & 0xff, false)
        this.cycles += 1
        break
      }
      case 0x4000: {
        const d = 16 + ((opcode & 0xf0) >> 4)
        const k = (opcode & 0x0f) | ((opcode & 0x0f00) >> 4)
        const carry = data[0x5f] & 1
        const result = (data[d] - k - carry) & 0xff
        this.setFlagsSub(data[d], k, result, true)
        data[d] = result
        this.cycles += 1
        break
      }
      case 0x5000: {
        const d = 16 + ((opcode & 0xf0) >> 4)
        const k = (opcode & 0x0f) | ((opcode & 0x0f00) >> 4)
        const result = (data[d] - k) & 0xff
        this.setFlagsSub(data[d], k, result, false)
        data[d] = result
        this.cycles += 1
        break
      }
      case 0x6000: {
        const d = 16 + ((opcode & 0xf0) >> 4)
        const k = (opcode & 0x0f) | ((opcode & 0x0f00) >> 4)
        const result = data[d] | k
        data[d] = result
        this.setFlagsLogic(result)
        this.cycles += 1
        break
      }
      case 0x7000: {
        const d = 16 + ((opcode & 0xf0) >> 4)
        const k = (opcode & 0x0f) | ((opcode & 0x0f00) >> 4)
        const result = data[d] & k
        data[d] = result
        this.setFlagsLogic(result)
        this.cycles += 1
        break
      }

      // ------------------------------------------- 0x8 / 0xA: LDD / STD (+q)
      case 0x8000:
      case 0xa000: {
        const q =
          (opcode & 0x07) | ((opcode & 0x0c00) >> 7) | ((opcode & 0x2000) >> 8)
        const reg = (opcode & 0x01f0) >> 4
        const useY = (opcode & 0x08) !== 0
        const base = useY
          ? data[28] | (data[29] << 8)
          : data[30] | (data[31] << 8)
        if ((opcode & 0x0200) === 0) {
          data[reg] = this.readData((base + q) & 0xffff)
        } else {
          this.writeData((base + q) & 0xffff, data[reg])
        }
        this.cycles += 2
        break
      }

      // ---------------------------------------------------------------- 0x9
      case 0x9000: {
        this.exec9xxx(opcode)
        break
      }

      // ---------------------------------------------------------- 0xB IN/OUT
      case 0xb000: {
        const reg = (opcode & 0x01f0) >> 4
        const io = (opcode & 0x0f) | ((opcode & 0x0600) >> 5)
        if ((opcode & 0x0800) === 0) {
          data[reg] = this.readData(io + 0x20)
        } else {
          this.writeData(io + 0x20, data[reg])
        }
        this.cycles += 1
        break
      }

      // ------------------------------------------------------- 0xC/0xD R*JMP
      case 0xc000: {
        const k = ((opcode & 0x0fff) << 20) >> 20 // rozszerzenie znaku 12-bit
        this.pc = (this.pc + k) & 0xffff
        this.cycles += 2
        break
      }
      case 0xd000: {
        const k = ((opcode & 0x0fff) << 20) >> 20
        this.push(this.pc & 0xff)
        this.push((this.pc >> 8) & 0xff)
        this.pc = (this.pc + k) & 0xffff
        this.cycles += 3
        break
      }

      // ------------------------------------------------------------ 0xE LDI
      case 0xe000: {
        const d = 16 + ((opcode & 0xf0) >> 4)
        data[d] = (opcode & 0x0f) | ((opcode & 0x0f00) >> 4)
        this.cycles += 1
        break
      }

      // ---------------------------------------------------------------- 0xF
      default: {
        this.execFxxx(opcode)
        break
      }
    }

    return this.cycles - startCycles
  }

  private setMulFlags(product: number): void {
    let s = this.data[0x5f] & ~((1 << SREG_C) | (1 << SREG_Z))
    if (product & 0x8000) s |= 1 << SREG_C
    if ((product & 0xffff) === 0) s |= 1 << SREG_Z
    this.data[0x5f] = s
  }

  /** Instrukcje dwuslowne (JMP/CALL/LDS/STS) zajmuja 2 slowa - skok musi to uwzglednic. */
  private isTwoWordInstruction(opcode: number): boolean {
    return (
      (opcode & 0xfe0c) === 0x940c || // JMP / CALL
      (opcode & 0xfe0f) === 0x9000 || // LDS
      (opcode & 0xfe0f) === 0x9200 // STS
    )
  }

  private skipNextInstruction(): void {
    const next = this.flash[this.pc]
    if (this.isTwoWordInstruction(next)) {
      this.pc = (this.pc + 2) & 0xffff
      this.cycles += 2
    } else {
      this.pc = (this.pc + 1) & 0xffff
      this.cycles += 1
    }
  }

  // -------------------------------------------------------------------------
  // Grupa 0x9xxx
  // -------------------------------------------------------------------------

  private exec9xxx(opcode: number): void {
    const data = this.data

    // --- 1001 000d dddd xxxx (LD/LPM/POP) i 1001 001r rrrr xxxx (ST/PUSH)
    if ((opcode & 0xfc00) === 0x9000) {
      const reg = (opcode & 0x01f0) >> 4
      const isStore = (opcode & 0x0200) !== 0
      const mode = opcode & 0x0f

      if (mode === 0x0 && !isStore) {
        // LDS Rd, k (2 slowa)
        const addr = this.flash[this.pc]
        this.pc = (this.pc + 1) & 0xffff
        data[reg] = this.readData(addr)
        this.cycles += 2
        return
      }
      if (mode === 0x0 && isStore) {
        // STS k, Rr (2 slowa)
        const addr = this.flash[this.pc]
        this.pc = (this.pc + 1) & 0xffff
        this.writeData(addr, data[reg])
        this.cycles += 2
        return
      }
      if (mode === 0xf) {
        if (isStore) {
          this.push(data[reg]) // PUSH
        } else {
          data[reg] = this.pop() // POP
        }
        this.cycles += 2
        return
      }
      if (!isStore && (mode === 0x4 || mode === 0x5 || mode === 0x6 || mode === 0x7)) {
        // LPM Rd, Z / LPM Rd, Z+  (ELPM traktujemy jak LPM - ATmega32 ma 32 kB)
        const z = data[30] | (data[31] << 8)
        const word = this.flash[z >> 1]
        data[reg] = z & 1 ? (word >> 8) & 0xff : word & 0xff
        if (mode === 0x5 || mode === 0x7) {
          const inc = (z + 1) & 0xffff
          data[30] = inc & 0xff
          data[31] = (inc >> 8) & 0xff
        }
        this.cycles += 3
        return
      }

      // LD/ST z X (0xc-0xe), Y (0x9-0xa) i Z (0x1-0x2)
      let pointerLow = 30
      switch (mode) {
        case 0x1:
        case 0x2:
          pointerLow = 30 // Z
          break
        case 0x9:
        case 0xa:
          pointerLow = 28 // Y
          break
        case 0xc:
        case 0xd:
        case 0xe:
          pointerLow = 26 // X
          break
        default:
          this.cycles += 1
          return
      }
      let addr = data[pointerLow] | (data[pointerLow + 1] << 8)
      const isPreDecrement = mode === 0x2 || mode === 0xa || mode === 0xe
      const isPostIncrement = mode === 0x1 || mode === 0x9 || mode === 0xd
      if (isPreDecrement) addr = (addr - 1) & 0xffff

      if (isStore) {
        this.writeData(addr, data[reg])
      } else {
        data[reg] = this.readData(addr)
      }

      if (isPostIncrement) addr = (addr + 1) & 0xffff
      if (isPreDecrement || isPostIncrement) {
        data[pointerLow] = addr & 0xff
        data[pointerLow + 1] = (addr >> 8) & 0xff
      }
      this.cycles += 2
      return
    }

    // --- 1001 010x xxxx xxxx: jednoargumentowe, skoki, sterujace
    if ((opcode & 0xfe00) === 0x9400) {
      const reg = (opcode & 0x01f0) >> 4
      const mode = opcode & 0x0f

      switch (mode) {
        case 0x0: {
          // COM
          const result = ~data[reg] & 0xff
          data[reg] = result
          this.setFlagsLogic(result)
          this.data[0x5f] |= 1 << SREG_C
          this.cycles += 1
          return
        }
        case 0x1: {
          // NEG
          const vd = data[reg]
          const result = (0 - vd) & 0xff
          data[reg] = result
          let s = this.data[0x5f] & ~0x3f
          if (((result | vd) & 0x08) !== 0) s |= 1 << SREG_H
          if (result === 0x80) s |= 1 << SREG_V
          if (result & 0x80) s |= 1 << SREG_N
          if (!!(result & 0x80) !== (result === 0x80)) s |= 1 << SREG_S
          if (result === 0) s |= 1 << SREG_Z
          else s |= 1 << SREG_C
          this.data[0x5f] = s
          this.cycles += 1
          return
        }
        case 0x2: {
          // SWAP
          const v = data[reg]
          data[reg] = ((v << 4) | (v >> 4)) & 0xff
          this.cycles += 1
          return
        }
        case 0x3: {
          // INC
          const result = (data[reg] + 1) & 0xff
          const overflow = result === 0x80
          data[reg] = result
          let s = this.data[0x5f] & ~((1 << SREG_S) | (1 << SREG_V) | (1 << SREG_N) | (1 << SREG_Z))
          if (overflow) s |= 1 << SREG_V
          if (result & 0x80) s |= 1 << SREG_N
          if (!!(result & 0x80) !== overflow) s |= 1 << SREG_S
          if (result === 0) s |= 1 << SREG_Z
          this.data[0x5f] = s
          this.cycles += 1
          return
        }
        case 0xa: {
          // DEC
          const result = (data[reg] - 1) & 0xff
          const overflow = result === 0x7f
          data[reg] = result
          let s = this.data[0x5f] & ~((1 << SREG_S) | (1 << SREG_V) | (1 << SREG_N) | (1 << SREG_Z))
          if (overflow) s |= 1 << SREG_V
          if (result & 0x80) s |= 1 << SREG_N
          if (!!(result & 0x80) !== overflow) s |= 1 << SREG_S
          if (result === 0) s |= 1 << SREG_Z
          this.data[0x5f] = s
          this.cycles += 1
          return
        }
        case 0x5: {
          // ASR
          const vd = data[reg]
          const result = ((vd >> 1) | (vd & 0x80)) & 0xff
          data[reg] = result
          this.setFlagsShift(result, (vd & 1) !== 0, (result & 0x80) !== 0)
          this.cycles += 1
          return
        }
        case 0x6: {
          // LSR
          const vd = data[reg]
          const result = vd >> 1
          data[reg] = result
          this.setFlagsShift(result, (vd & 1) !== 0, false)
          this.cycles += 1
          return
        }
        case 0x7: {
          // ROR
          const vd = data[reg]
          const carryIn = this.data[0x5f] & 1
          const result = (vd >> 1) | (carryIn << 7)
          data[reg] = result
          this.setFlagsShift(result, (vd & 1) !== 0, (result & 0x80) !== 0)
          this.cycles += 1
          return
        }
        case 0x8: {
          // BSET / BCLR / RET / RETI / SLEEP / WDR / BREAK / IJMP / ICALL
          if ((opcode & 0x0f00) === 0x0400) {
            const bit = (opcode & 0x70) >> 4
            if (opcode & 0x80) this.data[0x5f] &= ~(1 << bit) // BCLR
            else this.data[0x5f] |= 1 << bit // BSET
            this.cycles += 1
            return
          }
          switch (opcode) {
            case 0x9508: {
              // RET
              const high = this.pop()
              const low = this.pop()
              this.pc = ((high << 8) | low) & 0xffff
              this.cycles += 4
              return
            }
            case 0x9518: {
              // RETI
              const high = this.pop()
              const low = this.pop()
              this.pc = ((high << 8) | low) & 0xffff
              this.data[0x5f] |= 1 << SREG_I
              this.cycles += 4
              return
            }
            case 0x95c8: {
              // LPM (postac domyslna): R0 <- FLASH[Z]
              const z = data[30] | (data[31] << 8)
              const word = this.flash[z >> 1]
              data[0] = z & 1 ? (word >> 8) & 0xff : word & 0xff
              this.cycles += 3
              return
            }
            case 0x9588: // SLEEP
              this.sleeping = true
              this.cycles += 1
              return
            case 0x9598: // BREAK
              this.breakHit = true
              this.cycles += 1
              return
            case 0x95a8: // WDR
              this.cycles += 1
              return
            case 0x95e8: // SPM - programowanie flash z poziomu kodu, nieuzywane na lab
              this.cycles += 1
              return
            default:
              this.cycles += 1
              return
          }
        }
        case 0x9: {
          if (opcode === 0x9409) {
            // IJMP
            this.pc = (data[30] | (data[31] << 8)) & 0xffff
            this.cycles += 2
            return
          }
          if (opcode === 0x9509) {
            // ICALL
            this.push(this.pc & 0xff)
            this.push((this.pc >> 8) & 0xff)
            this.pc = (data[30] | (data[31] << 8)) & 0xffff
            this.cycles += 3
            return
          }
          this.cycles += 1
          return
        }
        case 0xc:
        case 0xd: {
          // JMP k (2 slowa) - ATmega32 ma 16 kslow, wiec liczy sie tylko dolne slowo
          const target = this.flash[this.pc]
          this.pc = target & 0xffff
          this.cycles += 3
          return
        }
        case 0xe:
        case 0xf: {
          // CALL k (2 slowa)
          const target = this.flash[this.pc]
          const returnAddr = (this.pc + 1) & 0xffff
          this.push(returnAddr & 0xff)
          this.push((returnAddr >> 8) & 0xff)
          this.pc = target & 0xffff
          this.cycles += 4
          return
        }
        default:
          this.cycles += 1
          return
      }
    }

    // --- 1001 0110 / 0111: ADIW / SBIW
    if ((opcode & 0xfe00) === 0x9600) {
      const k = (opcode & 0x0f) | ((opcode & 0xc0) >> 2)
      const d = 24 + ((opcode & 0x30) >> 4) * 2
      const value = data[d] | (data[d + 1] << 8)
      const isSub = (opcode & 0x0100) !== 0
      const result = (isSub ? value - k : value + k) & 0xffff
      data[d] = result & 0xff
      data[d + 1] = (result >> 8) & 0xff

      let s = this.data[0x5f] & ~0x1f
      const rHigh = (result & 0x8000) !== 0
      const dHigh = (value & 0x8000) !== 0
      const v = isSub ? dHigh && !rHigh : !dHigh && rHigh
      const c = isSub ? rHigh && !dHigh : !rHigh && dHigh
      if (v) s |= 1 << SREG_V
      if (rHigh) s |= 1 << SREG_N
      if (rHigh !== v) s |= 1 << SREG_S
      if (result === 0) s |= 1 << SREG_Z
      if (c) s |= 1 << SREG_C
      this.data[0x5f] = s
      this.cycles += 2
      return
    }

    // --- 1001 10xx: CBI / SBIC / SBI / SBIS
    if ((opcode & 0xfc00) === 0x9800) {
      const io = (opcode & 0xf8) >> 3
      const bit = opcode & 0x07
      switch (opcode & 0x0300) {
        case 0x0000: {
          // CBI - czytaj-modyfikuj-zapisz przez normalna sciezke I/O
          const value = this.readData(io + 0x20) & ~(1 << bit)
          this.writeData(io + 0x20, value)
          this.cycles += 2
          return
        }
        case 0x0200: {
          // SBI
          const value = this.readData(io + 0x20) | (1 << bit)
          this.writeData(io + 0x20, value)
          this.cycles += 2
          return
        }
        case 0x0100: {
          // SBIC - pomin, jesli bit skasowany
          this.cycles += 1
          if ((this.readData(io + 0x20) & (1 << bit)) === 0) this.skipNextInstruction()
          return
        }
        default: {
          // SBIS - pomin, jesli bit ustawiony
          this.cycles += 1
          if ((this.readData(io + 0x20) & (1 << bit)) !== 0) this.skipNextInstruction()
          return
        }
      }
    }

    // --- 1001 11rd dddd rrrr: MUL
    if ((opcode & 0xfc00) === 0x9c00) {
      const d = (opcode & 0x01f0) >> 4
      const r = (opcode & 0x0f) | ((opcode & 0x0200) >> 5)
      const product = (data[d] * data[r]) & 0xffff
      data[0] = product & 0xff
      data[1] = (product >> 8) & 0xff
      this.setMulFlags(product)
      this.cycles += 2
      return
    }

    this.cycles += 1
  }

  // -------------------------------------------------------------------------
  // Grupa 0xFxxx
  // -------------------------------------------------------------------------

  private execFxxx(opcode: number): void {
    const data = this.data

    if ((opcode & 0xf800) === 0xf000) {
      // BRBS / BRBC - skoki warunkowe
      const bit = opcode & 0x07
      const isSet = (this.data[0x5f] & (1 << bit)) !== 0
      const branchOnSet = (opcode & 0x0400) === 0
      if (isSet === branchOnSet) {
        const k = ((opcode & 0x03f8) << 22) >> 25 // 7 bitow ze znakiem
        this.pc = (this.pc + k) & 0xffff
        this.cycles += 2
      } else {
        this.cycles += 1
      }
      return
    }

    if ((opcode & 0xfe08) === 0xf800) {
      // BLD Rd, b - przepisz T do bitu rejestru
      const reg = (opcode & 0x01f0) >> 4
      const bit = opcode & 0x07
      if ((this.data[0x5f] & (1 << SREG_T)) !== 0) data[reg] |= 1 << bit
      else data[reg] &= ~(1 << bit)
      this.cycles += 1
      return
    }

    if ((opcode & 0xfe08) === 0xfa00) {
      // BST Rd, b - przepisz bit rejestru do T
      const reg = (opcode & 0x01f0) >> 4
      const bit = opcode & 0x07
      if ((data[reg] & (1 << bit)) !== 0) this.data[0x5f] |= 1 << SREG_T
      else this.data[0x5f] &= ~(1 << SREG_T)
      this.cycles += 1
      return
    }

    if ((opcode & 0xfc08) === 0xfc00) {
      // SBRC / SBRS
      const reg = (opcode & 0x01f0) >> 4
      const bit = opcode & 0x07
      const isSet = (data[reg] & (1 << bit)) !== 0
      const skipOnSet = (opcode & 0x0200) !== 0
      this.cycles += 1
      if (isSet === skipOnSet) this.skipNextInstruction()
      return
    }

    this.cycles += 1
  }
}
