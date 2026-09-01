/**
 * Tor RS232 plytki: PD1 (TXD) i PD0 (RXD) -> MAX232 -> gniazdo DB9 -> kabel -> PC.
 *
 * Na plytce te linie sa polaczone SCIEZKAMI, nie przewodami - dlatego nie ma ich
 * w netliscie. Jedyny element konfigurowalny to zworka JP4 "RxD Enable":
 * rozwarta odcina odbior, a nadawanie dziala dalej. Klasyczna zmylka z lab. 6 -
 * program "nie odpowiada", chociaz cos wysyla.
 *
 * Komputer PO DRUGIEJ STRONIE kabla ma WLASNY zegar. Dlatego probkuje linie
 * wlasnym okresem bitowym - i jesli mikrokontroler nadaje z inna predkoscia,
 * terminal pokazuje smieci. O to wlasnie chodzi w pulapce F_CPU.
 */

import { SerialReceiver, type Atmega32 } from '@zl3avr/avr-core'

export interface ReceivedByte {
  byte: number
  /** Bit stopu przeczytany jako zero - typowy objaw rozjazdu predkosci. */
  frameError: boolean
}

export class Rs232Link {
  /** Predkosc ustawiona w terminalu na komputerze (domyslnie jak w PuTTY na lab). */
  baud = 9600

  /** Wywolywane, gdy komputer odbierze bajt z plytki. */
  onByteFromBoard: ((received: ReceivedByte) => void) | null = null

  private readonly receiver = new SerialReceiver((byte, frameError) => {
    this.onByteFromBoard?.({ byte, frameError })
  })

  constructor(private readonly mcu: Atmega32) {}

  /** Okres bitowy komputera wyrazony w cyklach mikrokontrolera - wspolna os czasu. */
  private get bitCycles(): number {
    const hz = this.mcu.clockHz ?? 1_000_000
    return hz / this.baud
  }

  /** Odpytywane po kazdej instrukcji - inaczej odbiornik przegapilby bity. */
  poll(): void {
    this.receiver.poll(this.mcu.cpu.cycles, this.mcu.usart.txLine, this.bitCycles)
  }

  /** Wysyla bajt z komputera do plytki (klawisz w terminalu, ramka ze skryptu). */
  send(byte: number): void {
    this.mcu.usart.receiveFromPc(byte & 0xff, this.bitCycles)
  }

  sendText(text: string): void {
    for (const char of text) this.send(char.charCodeAt(0))
  }

  reset(): void {
    this.receiver.reset()
  }
}
