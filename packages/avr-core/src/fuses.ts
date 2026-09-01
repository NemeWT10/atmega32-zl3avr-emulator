/**
 * Fuse bity ATmega32 - model wierny dialogowi "Device Programming -> Fuses"
 * z Microchip Studio.
 *
 * NAJWAZNIEJSZA RZECZ W CALYM PROJEKCIE:
 * rzeczywista czestotliwosc zegara wynika WYLACZNIE z CKSEL/SUT, a nie z tego,
 * co student wpisal w `#define F_CPU`. `F_CPU` widzi tylko kompilator - decyduje,
 * ile cykli wygeneruje `_delay_ms()` i jaka wartosc UBRR policzy makro.
 * Rozjazd miedzy jednym a drugim to zrodlo polowy problemow na laboratorium:
 *   - szablon z L4 ma `F_CPU 400000000UL` przy realnym 1 MHz -> opoznienia 400x za krotkie,
 *   - szablony L5/L6 maja `F_CPU 4000000UL` przy fabrycznym 1 MHz -> mruganie 4x wolniejsze,
 *     a USART nadaje z 4x nizszym baudrate, wiec w terminalu sypia sie smieci.
 *
 * W AVR fuse "zaprogramowany" = bit rowny 0. Tutaj trzymamy surowe bajty
 * dokladnie tak, jak pokazuje je Microchip Studio.
 */

/** Stan fabryczny ATmega32: wewnetrzny RC 1 MHz, SUT = 10, BOOTSZ = 00, JTAGEN wlaczony. */
export const FACTORY_LOW_FUSE = 0xe1
export const FACTORY_HIGH_FUSE = 0x99

export interface FuseBytes {
  low: number
  high: number
}

export const FACTORY_FUSES: FuseBytes = { low: FACTORY_LOW_FUSE, high: FACTORY_HIGH_FUSE }

/**
 * Pozycje bitow w bajcie HIGH FUSE (datasheet Table 105).
 * Uwaga: 0 = zaprogramowany = funkcja WLACZONA.
 */
export const HFUSE_BIT = {
  BOOTRST: 0,
  BOOTSZ0: 1,
  BOOTSZ1: 2,
  EESAVE: 3,
  CKOPT: 4,
  SPIEN: 5,
  JTAGEN: 6,
  OCDEN: 7,
} as const

/** Pozycje bitow w bajcie LOW FUSE. CKSEL to bity 3..0, SUT to bity 5..4. */
export const LFUSE_BIT = {
  CKSEL0: 0,
  CKSEL1: 1,
  CKSEL2: 2,
  CKSEL3: 3,
  SUT0: 4,
  SUT1: 5,
  BODEN: 6,
  BODLEVEL: 7,
} as const

/**
 * Pozycja w liscie SUT_CKSEL dialogu Microchip Studio.
 * `cksel` i `sut` sa wpisywane wprost w LOW FUSE.
 */
export interface ClockOption {
  id: string
  /** Etykieta w brzmieniu zblizonym do listy w Microchip Studio. */
  label: string
  cksel: number
  sut: number
  /** Czestotliwosc w Hz. Dla zrodel zewnetrznych zalezy od kwarcu na plytce. */
  frequency: number
  external: boolean
}

/** Kwarc zamontowany na ZL3AVR (dolaczany zworka JP25). */
export const BOARD_CRYSTAL_HZ = 16_000_000

export const CLOCK_OPTIONS: ClockOption[] = [
  { id: 'int1', label: 'Int. RC Osc. 1 MHz; Start-up time: 6 CK + 64 ms', cksel: 0b0001, sut: 0b10, frequency: 1_000_000, external: false },
  { id: 'int2', label: 'Int. RC Osc. 2 MHz; Start-up time: 6 CK + 64 ms', cksel: 0b0010, sut: 0b10, frequency: 2_000_000, external: false },
  { id: 'int4', label: 'Int. RC Osc. 4 MHz; Start-up time: 6 CK + 64 ms', cksel: 0b0011, sut: 0b10, frequency: 4_000_000, external: false },
  { id: 'int8', label: 'Int. RC Osc. 8 MHz; Start-up time: 6 CK + 64 ms', cksel: 0b0100, sut: 0b10, frequency: 8_000_000, external: false },
  { id: 'ext-xtal', label: 'Ext. Crystal/Resonator High Freq.; Start-up time: 16K CK + 64 ms', cksel: 0b1111, sut: 0b11, frequency: BOARD_CRYSTAL_HZ, external: true },
  { id: 'ext-clock', label: 'Ext. Clock; Start-up time: 6 CK + 64 ms', cksel: 0b0000, sut: 0b10, frequency: BOARD_CRYSTAL_HZ, external: true },
]

export function isFuseProgrammed(byte: number, bit: number): boolean {
  return (byte & (1 << bit)) === 0
}

export function setFuseProgrammed(byte: number, bit: number, programmed: boolean): number {
  return programmed ? byte & ~(1 << bit) & 0xff : (byte | (1 << bit)) & 0xff
}

/** JTAGEN fabrycznie zaprogramowany -> PC2..PC5 zajete przez JTAG. */
export function isJtagEnabled(fuses: FuseBytes): boolean {
  return isFuseProgrammed(fuses.high, HFUSE_BIT.JTAGEN)
}

export function getCksel(fuses: FuseBytes): number {
  return fuses.low & 0x0f
}

export function getSut(fuses: FuseBytes): number {
  return (fuses.low >> 4) & 0x03
}

/**
 * Rzeczywista czestotliwosc zegara wynikajaca z fuse bitow.
 *
 * `crystalConnected` odpowiada zworce JP25 na plytce: przy zewnetrznym zrodle
 * zegara i rozwartej zworce mikrokontroler nie ma czym taktowac - martwy uklad,
 * dokladnie jak na prawdziwej plytce.
 */
export function resolveClockHz(fuses: FuseBytes, crystalConnected: boolean): number | null {
  const cksel = getCksel(fuses)

  // CKSEL 0001..0100 - wewnetrzny oscylator RC
  if (cksel >= 0b0001 && cksel <= 0b0100) {
    return [1_000_000, 2_000_000, 4_000_000, 8_000_000][cksel - 1]
  }
  // CKSEL 0000 - zewnetrzne zrodlo zegara; 0101..1111 - kwarc/rezonator
  if (!crystalConnected) return null
  return BOARD_CRYSTAL_HZ
}

/** Opis stanu zegara do wyswietlenia w pasku stanu. */
export function describeClock(fuses: FuseBytes, crystalConnected: boolean): string {
  const hz = resolveClockHz(fuses, crystalConnected)
  if (hz === null) return 'brak zegara (zewn. zrodlo, rozwarta zworka JP25)'
  const cksel = getCksel(fuses)
  const internal = cksel >= 0b0001 && cksel <= 0b0100
  const mhz = hz / 1_000_000
  return `${mhz} MHz (${internal ? 'wewn. RC' : 'kwarc zewn.'})`
}
