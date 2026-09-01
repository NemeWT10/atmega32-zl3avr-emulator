/**
 * USART ATmega32 - tryb asynchroniczny (jedyny uzywany na laboratorium).
 *
 * Dwie rzeczy odwzorowane szczegolnie starannie:
 *
 * 1. PULAPKA URSEL. Rejestry UBRRH i UCSRC leza pod TYM SAMYM adresem 0x20.
 *    O tym, ktory z nich jest zapisywany, decyduje bit 7 zapisywanej wartosci:
 *      UCSRC = (1<<URSEL) | ...   -> trafia do UCSRC
 *      UCSRC = (1<<UCSZ1)| ...    -> trafia do UBRRH i NISZCZY baudrate
 *    Odczyt UCSRC wymaga dwoch odczytow pod rzad; pojedynczy zwraca UBRRH.
 *
 * 2. Transmisja jest modelowana NA POZIOMIE BITOW (patrz serial-line.ts), zeby
 *    rozjazd predkosci dawal smieci, a nie poprawny tekst.
 */

import {
  DOR,
  FE,
  IO,
  RXC,
  RXEN,
  TXC,
  TXEN,
  UCSZ2,
  UDRE,
  URSEL,
  U2X,
} from '../registers'
import type { CPU } from '../cpu'
import { SerialLine, SerialReceiver } from './serial-line'

export class Usart {
  /** Linia MCU -> PC (TxD mikrokontrolera). */
  readonly txLine = new SerialLine()
  /** Linia PC -> MCU (RxD mikrokontrolera, przez zworke JP4). */
  readonly rxLine = new SerialLine()

  /** Bufor odbiorczy - w AVR jest dwustopniowy; tu wystarczy jeden poziom + flaga DOR. */
  private rxBuffer: number | null = null
  private txBuffer: number | null = null
  private txShiftEnd = 0
  private txShiftBusy = false

  /** Odczyt UCSRC wymaga dwoch kolejnych odczytow spod adresu 0x20. */
  private ucsrcReadPrimed = false
  private ubrrh = 0
  private ucsrc = 0x86 // wartosc po resecie: URSEL=1, UCSZ1:0 = 11 (8 bitow danych)

  private readonly receiver = new SerialReceiver((byte, frameError) => {
    this.deliverReceivedByte(byte, frameError)
  })

  /** Czestotliwosc zegara MCU - potrzebna do przeliczenia UBRR na okres bitowy. */
  clockHz = 1_000_000

  /** Zworka JP4 "RxD Enable". Rozwarta = mikrokontroler nic nie odbiera. */
  rxdEnabled = true

  /** Wywolywane, gdy mikrokontroler wystawil bajt na linie (do podgladu w UI). */
  onTransmit: ((byte: number) => void) | null = null

  constructor(private readonly cpu: CPU) {
    this.install()
    this.cpu.setIoDirect(IO.UCSRA, (1 << UDRE) as number)
  }

  private install(): void {
    const cpu = this.cpu

    cpu.onIoWrite(IO.UDR, (_io, value) => {
      this.writeUdr(value)
      return true
    })

    cpu.onIoRead(IO.UDR, () => this.readUdr())

    // UCSRA: RXC/TXC/UDRE sa tylko do odczytu, ale TXC kasuje sie zapisem jedynki.
    cpu.onIoWrite(IO.UCSRA, (_io, value) => {
      const current = cpu.getIoDirect(IO.UCSRA)
      let next = (current & ~((1 << U2X) | 1)) | (value & ((1 << U2X) | 1))
      if (value & (1 << TXC)) next &= ~(1 << TXC)
      cpu.setIoDirect(IO.UCSRA, next)
      return true
    })

    // Wspoldzielony adres 0x20: UBRRH albo UCSRC, w zaleznosci od bitu URSEL.
    cpu.onIoWrite(IO.UBRRH_UCSRC, (_io, value) => {
      if (value & (1 << URSEL)) this.ucsrc = value
      else this.ubrrh = value & 0x0f
      return true
    })

    cpu.onIoRead(IO.UBRRH_UCSRC, () => {
      if (this.ucsrcReadPrimed) {
        this.ucsrcReadPrimed = false
        return this.ucsrc
      }
      this.ucsrcReadPrimed = true
      return this.ubrrh
    })
  }

  /** Liczba bitow danych z UCSZ2:0. Na laboratorium zawsze 8. */
  private get dataBits(): number {
    const ucsz = ((this.cpu.getIoDirect(IO.UCSRB) >> UCSZ2) & 1) * 4 | ((this.ucsrc >> 1) & 0x03)
    return [5, 6, 7, 8, 8, 8, 8, 9][ucsz]
  }

  private get stopBits(): number {
    return (this.ucsrc >> 3) & 1 ? 2 : 1
  }

  private get ubrr(): number {
    return ((this.ubrrh & 0x0f) << 8) | this.cpu.getIoDirect(IO.UBRRL)
  }

  /** Dlugosc jednego bitu w cyklach zegara. To ona decyduje o realnej predkosci. */
  get bitCycles(): number {
    const divider = this.cpu.getIoDirect(IO.UCSRA) & (1 << U2X) ? 8 : 16
    return divider * (this.ubrr + 1)
  }

  /** Realna predkosc transmisji w bodach - to, co naprawde leci po kablu. */
  get actualBaud(): number {
    return this.clockHz / this.bitCycles
  }

  /**
   * Czy program w ogole wlaczyl transmisje (bit TXEN albo RXEN w UCSRB).
   *
   * Interfejs pyta o to, zanim ostrzeze o rozjezdzie predkosci: po resecie
   * UBRR jest zerowy, wiec „predkosc” wychodzi absurdalna i bez tego warunku
   * terminal straszylby rozjazdem takze wtedy, gdy w ukladzie nie ma jeszcze
   * zadnego programu.
   */
  get enabled(): boolean {
    return (this.cpu.getIoDirect(IO.UCSRB) & ((1 << TXEN) | (1 << RXEN))) !== 0
  }

  private writeUdr(value: number): void {
    const ucsrb = this.cpu.getIoDirect(IO.UCSRB)
    if (!(ucsrb & (1 << TXEN))) return

    if (!this.txShiftBusy) {
      this.startTransmit(value)
    } else {
      this.txBuffer = value
      this.setFlag(UDRE, false)
    }
  }

  private startTransmit(byte: number): void {
    const now = this.cpu.cycles
    const end = this.txLine.send(now, byte, this.bitCycles, this.dataBits, this.stopBits)
    this.txShiftBusy = true
    this.txShiftEnd = end
    this.setFlag(UDRE, true)
    this.setFlag(TXC, false)
    this.onTransmit?.(byte)
  }

  private readUdr(): number {
    const value = this.rxBuffer ?? 0
    this.rxBuffer = null
    this.setFlag(RXC, false)
    this.setFlag(DOR, false)
    return value
  }

  private deliverReceivedByte(byte: number, frameError: boolean): void {
    const ucsra = this.cpu.getIoDirect(IO.UCSRA)
    if (ucsra & (1 << RXC)) {
      // Poprzedni bajt nie zostal odczytany - przepelnienie bufora odbiorczego.
      this.setFlag(DOR, true)
      return
    }
    this.rxBuffer = byte
    this.setFlag(RXC, true)
    this.setFlag(FE, frameError)
  }

  private setFlag(bit: number, value: boolean): void {
    const current = this.cpu.getIoDirect(IO.UCSRA)
    this.cpu.setIoDirect(IO.UCSRA, value ? current | (1 << bit) : current & ~(1 << bit))
  }

  tick(): void {
    const now = this.cpu.cycles
    const ucsrb = this.cpu.getIoDirect(IO.UCSRB)

    // --- nadawanie
    if (this.txShiftBusy && now >= this.txShiftEnd) {
      if (this.txBuffer !== null) {
        const next = this.txBuffer
        this.txBuffer = null
        this.startTransmit(next)
      } else {
        this.txShiftBusy = false
        this.setFlag(TXC, true)
        this.setFlag(UDRE, true)
      }
    }

    // --- odbior
    if (ucsrb & (1 << RXEN) && this.rxdEnabled) {
      this.receiver.poll(now, this.rxLine, this.bitCycles)
    }

    if ((now & 0xffff) === 0) {
      this.txLine.gc(now - 1_000_000)
      this.rxLine.gc(now - 1_000_000)
    }
  }

  /** Wysyla bajt z "komputera PC" do mikrokontrolera, z predkoscia terminala. */
  receiveFromPc(byte: number, pcBitCycles: number): void {
    if (!this.rxdEnabled) return
    this.rxLine.send(this.cpu.cycles, byte, pcBitCycles)
  }

  reset(): void {
    this.txLine.reset()
    this.rxLine.reset()
    this.receiver.reset()
    this.rxBuffer = null
    this.txBuffer = null
    this.txShiftBusy = false
    this.txShiftEnd = 0
    this.ucsrcReadPrimed = false
    this.ubrrh = 0
    this.ucsrc = 0x86
    this.cpu.setIoDirect(IO.UCSRA, 1 << UDRE)
  }
}
