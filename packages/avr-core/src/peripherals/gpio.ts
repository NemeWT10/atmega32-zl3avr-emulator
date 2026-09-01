/**
 * Porty wejscia/wyjscia ATmega32 (PORTA..PORTD).
 *
 * Model elektryczny pinu jest celowo bogatszy niz "bit w rejestrze", bo polowa
 * zadan laboratoryjnych opiera sie wlasnie na jego wlasciwosciach:
 *   - wejscie z wlaczonym pull-upem czyta 1, dopoki cos nie sciagnie linii do masy
 *     (klawiatura matrycowa nie ma zadnych rezystorow na plytce),
 *   - wejscie bez pull-upa i bez zewnetrznego zrodla "plywa",
 *   - po resecie DDRx=0 i PORTx=0, czyli wszystkie linie sa plywajacymi wejsciami.
 *
 * PULAPKA JTAG: przy fabrycznie zaprogramowanym fuse JTAGEN linie PC2..PC5 naleza
 * do interfejsu JTAG, a nie do portu C. Dioda podlaczona do PC3 po prostu nie swieci,
 * mimo ze kod ustawia DDRC i PORTC - to najczestsze "nie dziala mi port C" z lab. 5.
 * Wylaczenie: fuse JTAGEN albo dwukrotny zapis bitu JTD w MCUCSR w ciagu 4 cykli.
 */

import { IO, PORT_NAMES, PORT_REGS, type PortName } from '../registers'
import type { CPU } from '../cpu'

/** Poziom logiczny linii. `-1` oznacza brak zewnetrznego zrodla (linia nie jest wysterowana). */
export type ExternalLevel = -1 | 0 | 1

/** Jak mikrokontroler wysterowuje pin - z punktu widzenia ukladu na zewnatrz. */
export type PinDrive = 'low' | 'high' | 'pullup' | 'float'

export interface PinChange {
  port: PortName
  bit: number
  level: number
}

/** Linie zajmowane przez JTAG, gdy fuse JTAGEN jest zaprogramowany. */
const JTAG_PINS: { port: PortName; bits: number[] } = { port: 'C', bits: [2, 3, 4, 5] }

export class Gpio {
  /** Poziom narzucony z zewnatrz (przez uklady na plytce); -1 = brak. */
  private readonly external: Record<PortName, Int8Array> = {
    A: new Int8Array(8).fill(-1),
    B: new Int8Array(8).fill(-1),
    C: new Int8Array(8).fill(-1),
    D: new Int8Array(8).fill(-1),
  }

  /**
   * Ostatni ustalony poziom - uzywany dla linii plywajacej.
   * Prawdziwe wejscie CMOS bez pull-upa zachowuje sie nieprzewidywalnie;
   * pamietanie ostatniego poziomu jest deterministycznym przyblizeniem
   * (i tak samo mylacym dla studenta, ktory zapomnial o pull-upach).
   */
  private readonly floating: Record<PortName, Uint8Array> = {
    A: new Uint8Array(8),
    B: new Uint8Array(8),
    C: new Uint8Array(8),
    D: new Uint8Array(8),
  }

  /**
   * Wymuszenie poziomu przez peryferium (wyjscia Output Compare: OC0, OC1A, OC1B, OC2).
   * Sprzetowo uklad porownania przejmuje pin, ale tylko wtedy, gdy DDR ustawia go
   * jako wyjscie - dokladnie tak dziala AVR. `-1` = brak wymuszenia.
   */
  private readonly override: Record<PortName, Int8Array> = {
    A: new Int8Array(8).fill(-1),
    B: new Int8Array(8).fill(-1),
    C: new Int8Array(8).fill(-1),
    D: new Int8Array(8).fill(-1),
  }

  /** Czy JTAG zajmuje PC2..PC5 (fuse JTAGEN i brak wylaczenia bitem JTD). */
  jtagEnabled = true

  /** Wywolywane przy kazdej zmianie stanu wyjscia - plytka odswieza swoj model. */
  onPortWrite: ((port: PortName) => void) | null = null

  private jtdWriteCycle = -1
  private jtdWriteValue = -1

  constructor(private readonly cpu: CPU) {
    for (const port of PORT_NAMES) this.install(port)
    this.installJtdHandling()
  }

  private install(port: PortName): void {
    const regs = PORT_REGS[port]

    this.cpu.onIoWrite(regs.port, (_io, value) => {
      this.cpu.setIoDirect(regs.port, value)
      this.onPortWrite?.(port)
      return true
    })

    this.cpu.onIoWrite(regs.ddr, (_io, value) => {
      this.cpu.setIoDirect(regs.ddr, value)
      this.onPortWrite?.(port)
      return true
    })

    // ATmega32 NIE MA przelaczania pinu zapisem do PINx (to funkcja nowszych ukladow).
    // Zapis do PINx nie robi nic.
    this.cpu.onIoWrite(regs.pin, () => true)

    this.cpu.onIoRead(regs.pin, () => this.readPort(port))
  }

  /**
   * Dwukrotny zapis bitu JTD w MCUCSR w ciagu czterech cykli przelacza JTAG.
   * Tak wlasnie robi sie to programowo, gdy nie chce sie ruszac fuse bitow.
   */
  private installJtdHandling(): void {
    this.cpu.onIoWrite(IO.MCUCSR, (_io, value) => {
      const jtd = (value >> 7) & 1
      if (this.jtdWriteValue === jtd && this.cpu.cycles - this.jtdWriteCycle <= 4) {
        this.jtagEnabled = jtd === 0
        this.jtdWriteCycle = -1
        this.jtdWriteValue = -1
        this.onPortWrite?.('C')
      } else {
        this.jtdWriteCycle = this.cpu.cycles
        this.jtdWriteValue = jtd
      }
      this.cpu.setIoDirect(IO.MCUCSR, value)
      return true
    })
  }

  private isJtagPin(port: PortName, bit: number): boolean {
    return this.jtagEnabled && port === JTAG_PINS.port && JTAG_PINS.bits.includes(bit)
  }

  /** Ustawia poziom narzucony przez uklad zewnetrzny. `-1` odlacza zrodlo. */
  setExternal(port: PortName, bit: number, level: ExternalLevel): void {
    this.external[port][bit] = level
  }

  getExternal(port: PortName, bit: number): ExternalLevel {
    return this.external[port][bit] as ExternalLevel
  }

  /** Ustawia lub zdejmuje wymuszenie poziomu przez uklad Output Compare. */
  setOverride(port: PortName, bit: number, level: ExternalLevel): void {
    if (this.override[port][bit] === level) return
    this.override[port][bit] = level
    this.onPortWrite?.(port)
  }

  /** Jak mikrokontroler wysterowuje dany pin - to widzi plytka. */
  getDrive(port: PortName, bit: number): PinDrive {
    if (this.isJtagPin(port, bit)) return 'pullup'
    const regs = PORT_REGS[port]
    const ddr = this.cpu.getIoDirect(regs.ddr)
    const out = this.cpu.getIoDirect(regs.port)
    if ((ddr >> bit) & 1) {
      const forced = this.override[port][bit]
      if (forced >= 0) return forced === 1 ? 'high' : 'low'
      return (out >> bit) & 1 ? 'high' : 'low'
    }
    return (out >> bit) & 1 ? 'pullup' : 'float'
  }

  /** Ustalony poziom na pinie - to, co przeczyta instrukcja IN z rejestru PINx. */
  getLevel(port: PortName, bit: number): number {
    // JTAG trzyma swoje linie w stanie wysokim (wewnetrzne pull-upy interfejsu).
    if (this.isJtagPin(port, bit)) return 1

    const drive = this.getDrive(port, bit)
    const ext = this.external[port][bit]

    if (drive === 'low' || drive === 'high') {
      // Wyjscie wysterowane. Zwarcie do przeciwnego poziomu to elektryczny konflikt -
      // na prawdziwym ukladzie wygrywa silniejsze zrodlo; przyjmujemy, ze zewnetrzne.
      if (ext === 0 || ext === 1) return ext
      return drive === 'high' ? 1 : 0
    }

    if (ext === 0 || ext === 1) {
      this.floating[port][bit] = ext
      return ext
    }
    if (drive === 'pullup') return 1

    // Linia plywajaca - brak pull-upa i brak zrodla.
    return this.floating[port][bit]
  }

  /** Zawartosc rejestru PINx. */
  readPort(port: PortName): number {
    let value = 0
    for (let bit = 0; bit < 8; bit++) {
      if (this.getLevel(port, bit)) value |= 1 << bit
    }
    return value
  }

  /** Bajt wysterowany na wyjsciach - wygodne dla modelu plytki (diody, segmenty). */
  readOutputLevels(port: PortName): number {
    return this.readPort(port)
  }

  reset(): void {
    for (const port of PORT_NAMES) {
      this.external[port].fill(-1)
      this.floating[port].fill(0)
      this.override[port].fill(-1)
    }
    this.jtdWriteCycle = -1
    this.jtdWriteValue = -1
  }
}
