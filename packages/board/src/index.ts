/**
 * Model plytki ewaluacyjnej ZL3AVR: zlacza goldpin, przewody, zworki i peryferia.
 *
 * Peryferia nie sa na stale polaczone z portami mikrokontrolera - wszystko
 * biegnie przez zlacza, a polaczenia tworzy student. Netlista w board.ts
 * odwzorowuje to doslownie, wiec zle poprowadzony przewod naprawde nie dziala.
 */

export { Board } from './board'
export type { BoardState, DigitState, Jumpers, LedState, NetLevel, Wire } from './board'
export { Hd44780 } from './parts/hd44780'
export type { LcdState } from './parts/hd44780'
export * from './connectors'
export { Rs232Link } from './parts/rs232'
export type { ReceivedByte } from './parts/rs232'
export { PRESETS, applyPreset, findPreset } from './presets'
export type { WiringPreset } from './presets'
export { describeWiring, PORT_CONNECTORS } from './wiring'
export type { PortName, PortWiring, WiringSummary } from './wiring'
