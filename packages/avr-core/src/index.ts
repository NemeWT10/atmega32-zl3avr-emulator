/**
 * Rdzen symulacji ATmega32 dla emulatora plytki ZL3AVR.
 *
 * Uwaga dla przyszlych sesji: ATmega32 nalezy do STAREJ rodziny rejestrow AVR.
 * Nie kopiujemy rozwiazan z ATmega328P - roznice, ktore najczesciej gryza:
 *   - TIMSK i TIFR sa POJEDYNCZE, wspoldzielone przez wszystkie timery,
 *   - przerwania zewnetrzne konfiguruje GICR/GIFR/MCUCR (nie EIMSK/EIFR/EICRA),
 *   - UCSRC i UBRRH leza pod TYM SAMYM adresem 0x20 (bit URSEL rozstrzyga),
 *   - ATmega32 NIE MA przelaczania pinu przez zapis do PINx.
 *
 * Zrodlo prawdy: docs/zrodla-txt/atmega32_datasheet.md
 */

export { CPU, DATA_SIZE, FLASH_WORDS, RAM_END, SRAM_START } from './cpu'
export type { IoReadHook, IoWriteHook } from './cpu'
export { Atmega32 } from './mcu'
export type { McuOptions } from './mcu'
export { parseIntelHex, bytesToWords, HexParseError } from './hex'
export type { HexParseResult } from './hex'
export * from './registers'
export * from './fuses'
export { Gpio } from './peripherals/gpio'
export type { ExternalLevel, PinDrive } from './peripherals/gpio'
export { Timer8, Timer16, createTimer0, createTimer2 } from './peripherals/timers'
export { Usart } from './peripherals/usart'
export { SerialLine, SerialReceiver } from './peripherals/serial-line'
export type { SerialFrame } from './peripherals/serial-line'

/** Typ mikrokontrolera obslugiwanego przez emulator. */
export const MCU = 'ATmega32' as const

/** Rozmiary pamieci ATmega32 wg datasheetu. */
export const MEMORY = {
  flashBytes: 32 * 1024,
  sramBytes: 2 * 1024,
  eepromBytes: 1024,
  sramStart: 0x0060,
} as const

/** Liczba wektorow przerwan (RESET + 20 zrodel). */
export const INTERRUPT_VECTOR_COUNT = 21
