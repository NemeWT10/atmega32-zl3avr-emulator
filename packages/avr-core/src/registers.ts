/**
 * Mapa rejestrow I/O ATmega32 oraz stale bitowe.
 *
 * Zrodlo: datasheet 2503Q-AVR-02/11, "Register Summary" (str. 327)
 * i Table 18 "Reset and Interrupt Vectors" (str. 44).
 * Zweryfikowane z docs/zrodla-txt/atmega32_datasheet.md.
 *
 * UWAGA: adresy ponizej to adresy I/O (te uzywane przez instrukcje IN/OUT/SBI/CBI).
 * Adres w przestrzeni danych = adres I/O + 0x20.
 */

/** Adres I/O -> adres w przestrzeni danych (dla LDS/STS i dostepu przez wskaznik). */
export const IO_BASE = 0x20

export const IO = {
  TWBR: 0x00,
  TWSR: 0x01,
  TWAR: 0x02,
  TWDR: 0x03,
  ADCL: 0x04,
  ADCH: 0x05,
  ADCSRA: 0x06,
  ADMUX: 0x07,
  ACSR: 0x08,
  UBRRL: 0x09,
  UCSRB: 0x0a,
  UCSRA: 0x0b,
  UDR: 0x0c,
  SPCR: 0x0d,
  SPSR: 0x0e,
  SPDR: 0x0f,
  PIND: 0x10,
  DDRD: 0x11,
  PORTD: 0x12,
  PINC: 0x13,
  DDRC: 0x14,
  PORTC: 0x15,
  PINB: 0x16,
  DDRB: 0x17,
  PORTB: 0x18,
  PINA: 0x19,
  DDRA: 0x1a,
  PORTA: 0x1b,
  EECR: 0x1c,
  EEDR: 0x1d,
  EEARL: 0x1e,
  EEARH: 0x1f,
  /** PULAPKA L6: UBRRH i UCSRC dziela ten sam adres. Rozroznia je bit URSEL (bit 7). */
  UBRRH_UCSRC: 0x20,
  WDTCR: 0x21,
  ASSR: 0x22,
  OCR2: 0x23,
  TCNT2: 0x24,
  TCCR2: 0x25,
  ICR1L: 0x26,
  ICR1H: 0x27,
  OCR1BL: 0x28,
  OCR1BH: 0x29,
  OCR1AL: 0x2a,
  OCR1AH: 0x2b,
  TCNT1L: 0x2c,
  TCNT1H: 0x2d,
  TCCR1B: 0x2e,
  TCCR1A: 0x2f,
  SFIOR: 0x30,
  OSCCAL: 0x31,
  TCNT0: 0x32,
  TCCR0: 0x33,
  MCUCSR: 0x34,
  MCUCR: 0x35,
  TWCR: 0x36,
  SPMCR: 0x37,
  TIFR: 0x38,
  TIMSK: 0x39,
  GIFR: 0x3a,
  GICR: 0x3b,
  OCR0: 0x3c,
  SPL: 0x3d,
  SPH: 0x3e,
  SREG: 0x3f,
} as const

export type IoName = keyof typeof IO

/** Odwrotna mapa: adres I/O -> nazwa (do debuggera i podgladu rejestrow). */
export const IO_NAME: Record<number, IoName> = Object.fromEntries(
  Object.entries(IO).map(([name, addr]) => [addr, name as IoName]),
) as Record<number, IoName>

// ---------------------------------------------------------------------------
// Bity SREG
// ---------------------------------------------------------------------------

export const SREG_C = 0
export const SREG_Z = 1
export const SREG_N = 2
export const SREG_V = 3
export const SREG_S = 4
export const SREG_H = 5
export const SREG_T = 6
export const SREG_I = 7

// ---------------------------------------------------------------------------
// Bity TIMSK / TIFR (wspolne dla wszystkich timerow - stara rodzina AVR!)
// ---------------------------------------------------------------------------

export const TOIE0 = 0
export const OCIE0 = 1
export const TOIE1 = 2
export const OCIE1B = 3
export const OCIE1A = 4
export const TICIE1 = 5
export const TOIE2 = 6
export const OCIE2 = 7

export const TOV0 = 0
export const OCF0 = 1
export const TOV1 = 2
export const OCF1B = 3
export const OCF1A = 4
export const ICF1 = 5
export const TOV2 = 6
export const OCF2 = 7

// ---------------------------------------------------------------------------
// Bity USART
// ---------------------------------------------------------------------------

export const MPCM = 0
export const U2X = 1
export const UPE = 2
export const DOR = 3
export const FE = 4
export const UDRE = 5
export const TXC = 6
export const RXC = 7

export const TXB8 = 0
export const RXB8 = 1
export const UCSZ2 = 2
export const TXEN = 3
export const RXEN = 4
export const UDRIE = 5
export const TXCIE = 6
export const RXCIE = 7

export const UCPOL = 0
export const UCSZ0 = 1
export const UCSZ1 = 2
export const USBS = 3
export const UPM0 = 4
export const UPM1 = 5
export const UMSEL = 6
/** Bit rozstrzygajacy, czy zapis pod adres 0x20 trafia do UCSRC (1) czy do UBRRH (0). */
export const URSEL = 7

// ---------------------------------------------------------------------------
// Wektory przerwan (adresy SLOWNE we FLASH) - datasheet Table 18
// ---------------------------------------------------------------------------

export const VECTOR = {
  RESET: 0x000,
  INT0: 0x002,
  INT1: 0x004,
  INT2: 0x006,
  TIMER2_COMP: 0x008,
  TIMER2_OVF: 0x00a,
  TIMER1_CAPT: 0x00c,
  TIMER1_COMPA: 0x00e,
  TIMER1_COMPB: 0x010,
  TIMER1_OVF: 0x012,
  TIMER0_COMP: 0x014,
  TIMER0_OVF: 0x016,
  SPI_STC: 0x018,
  USART_RXC: 0x01a,
  USART_UDRE: 0x01c,
  USART_TXC: 0x01e,
  ADC: 0x020,
  EE_RDY: 0x022,
  ANA_COMP: 0x024,
  TWI: 0x026,
  SPM_RDY: 0x028,
} as const

export type VectorName = keyof typeof VECTOR

/**
 * Zrodla przerwan w kolejnosci priorytetu (nizszy adres = wyzszy priorytet).
 * `enable` wskazuje rejestr i bit maski, `flag` rejestr i bit flagi.
 * Flaga jest kasowana sprzetowo w chwili wejscia w obsluge przerwania.
 */
export interface InterruptSource {
  name: VectorName
  vector: number
  enableReg: number
  enableBit: number
  flagReg: number
  flagBit: number
}

export const INTERRUPT_SOURCES: InterruptSource[] = [
  { name: 'INT0', vector: VECTOR.INT0, enableReg: IO.GICR, enableBit: 6, flagReg: IO.GIFR, flagBit: 6 },
  { name: 'INT1', vector: VECTOR.INT1, enableReg: IO.GICR, enableBit: 7, flagReg: IO.GIFR, flagBit: 7 },
  { name: 'INT2', vector: VECTOR.INT2, enableReg: IO.GICR, enableBit: 5, flagReg: IO.GIFR, flagBit: 5 },
  { name: 'TIMER2_COMP', vector: VECTOR.TIMER2_COMP, enableReg: IO.TIMSK, enableBit: OCIE2, flagReg: IO.TIFR, flagBit: OCF2 },
  { name: 'TIMER2_OVF', vector: VECTOR.TIMER2_OVF, enableReg: IO.TIMSK, enableBit: TOIE2, flagReg: IO.TIFR, flagBit: TOV2 },
  { name: 'TIMER1_CAPT', vector: VECTOR.TIMER1_CAPT, enableReg: IO.TIMSK, enableBit: TICIE1, flagReg: IO.TIFR, flagBit: ICF1 },
  { name: 'TIMER1_COMPA', vector: VECTOR.TIMER1_COMPA, enableReg: IO.TIMSK, enableBit: OCIE1A, flagReg: IO.TIFR, flagBit: OCF1A },
  { name: 'TIMER1_COMPB', vector: VECTOR.TIMER1_COMPB, enableReg: IO.TIMSK, enableBit: OCIE1B, flagReg: IO.TIFR, flagBit: OCF1B },
  { name: 'TIMER1_OVF', vector: VECTOR.TIMER1_OVF, enableReg: IO.TIMSK, enableBit: TOIE1, flagReg: IO.TIFR, flagBit: TOV1 },
  { name: 'TIMER0_COMP', vector: VECTOR.TIMER0_COMP, enableReg: IO.TIMSK, enableBit: OCIE0, flagReg: IO.TIFR, flagBit: OCF0 },
  { name: 'TIMER0_OVF', vector: VECTOR.TIMER0_OVF, enableReg: IO.TIMSK, enableBit: TOIE0, flagReg: IO.TIFR, flagBit: TOV0 },
  { name: 'USART_RXC', vector: VECTOR.USART_RXC, enableReg: IO.UCSRB, enableBit: RXCIE, flagReg: IO.UCSRA, flagBit: RXC },
  { name: 'USART_UDRE', vector: VECTOR.USART_UDRE, enableReg: IO.UCSRB, enableBit: UDRIE, flagReg: IO.UCSRA, flagBit: UDRE },
  { name: 'USART_TXC', vector: VECTOR.USART_TXC, enableReg: IO.UCSRB, enableBit: TXCIE, flagReg: IO.UCSRA, flagBit: TXC },
]

// ---------------------------------------------------------------------------
// Porty
// ---------------------------------------------------------------------------

export const PORT_NAMES = ['A', 'B', 'C', 'D'] as const
export type PortName = (typeof PORT_NAMES)[number]

export const PORT_REGS: Record<PortName, { port: number; ddr: number; pin: number }> = {
  A: { port: IO.PORTA, ddr: IO.DDRA, pin: IO.PINA },
  B: { port: IO.PORTB, ddr: IO.DDRB, pin: IO.PINB },
  C: { port: IO.PORTC, ddr: IO.DDRC, pin: IO.PINC },
  D: { port: IO.PORTD, ddr: IO.DDRD, pin: IO.PIND },
}
