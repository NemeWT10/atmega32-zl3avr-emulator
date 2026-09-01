/**
 * Sterownik wyswietlacza alfanumerycznego HD44780 (na plytce: 2x16 znakow).
 *
 * Wazne wlasciwosci egzemplarza z ZL3AVR:
 *   - linia R/W jest przylutowana do masy, wiec mozliwy jest TYLKO ZAPIS.
 *     Flagi busy nie da sie odczytac - dlatego biblioteki studenckie odmierzaja
 *     czas programowo, a zbyt krotkie opoznienia objawiaja sie gubieniem znakow,
 *   - praca 4-bitowa: bajt wchodzi dwoma polowkami, starsza pierwsza,
 *   - po wlaczeniu zasilania kontroler jest w trybie 8-bitowym i dopiero
 *     sekwencja inicjujaca (0x33, 0x32) przelacza go na 4 bity.
 *
 * Dane zatrzaskiwane sa na ZBOCZU OPADAJACYM linii E.
 *
 * Zrodlo: docs/zrodla-txt/hd44780_datasheet.md
 */

export const DDRAM_SIZE = 0x68
export const CGRAM_SIZE = 64
export const LINE_LENGTH = 40
export const LINE2_ADDRESS = 0x40

export interface LcdState {
  /** Widoczne znaki: 2 wiersze po 16 kolumn (kody znakow). */
  rows: number[][]
  displayOn: boolean
  cursorOn: boolean
  blinkOn: boolean
  /** Pozycja kursora w widocznym oknie albo `null`, gdy jest poza nim. */
  cursor: { row: number; column: number } | null
  /** Wzory znakow wlasnych z CGRAM: 8 znakow po 8 wierszy po 5 pikseli. */
  customChars: number[][]
  backlight: boolean
}

export class Hd44780 {
  private readonly ddram = new Uint8Array(DDRAM_SIZE).fill(0x20)
  private readonly cgram = new Uint8Array(CGRAM_SIZE)

  private addressCounter = 0
  private addressingCgram = false
  private displayShift = 0

  private eightBitMode = true
  private pendingHighNibble: number | null = null

  private entryIncrement = true
  private entryShift = false

  private displayOn = false
  private cursorOn = false
  private blinkOn = false
  private twoLines = false

  private previousEnable = 0

  /** Ostatnia operacja - przydatne przy diagnozowaniu zbyt krotkich opoznien. */
  lastWrite: { rs: number; value: number } | null = null

  /**
   * Aktualizacja stanu linii sterujacych. Wywolywane przy kazdej zmianie
   * poziomow na zlaczu LCD.
   */
  update(rs: number, enable: number, dataNibble: number): void {
    if (this.previousEnable === 1 && enable === 0) {
      this.latch(rs, dataNibble & 0x0f)
    }
    this.previousEnable = enable
  }

  private latch(rs: number, nibble: number): void {
    if (this.eightBitMode) {
      // W trybie 8-bitowym linie D0..D3 sa niepodlaczone, wiec czytane jako zera.
      this.execute(rs, (nibble << 4) & 0xff)
      return
    }
    if (this.pendingHighNibble === null) {
      this.pendingHighNibble = nibble
      return
    }
    const value = ((this.pendingHighNibble << 4) | nibble) & 0xff
    this.pendingHighNibble = null
    this.execute(rs, value)
  }

  private execute(rs: number, value: number): void {
    this.lastWrite = { rs, value }
    if (rs === 1) {
      this.writeData(value)
      return
    }
    this.writeCommand(value)
  }

  private writeCommand(value: number): void {
    if (value & 0x80) {
      this.addressingCgram = false
      this.addressCounter = value & 0x7f
      return
    }
    if (value & 0x40) {
      this.addressingCgram = true
      this.addressCounter = value & 0x3f
      return
    }
    if (value & 0x20) {
      // Function set: DL (bit 4) wybiera szerokosc magistrali, N (bit 3) liczbe wierszy
      this.eightBitMode = (value & 0x10) !== 0
      this.twoLines = (value & 0x08) !== 0
      this.pendingHighNibble = null
      return
    }
    if (value & 0x10) {
      // Cursor or display shift
      const shiftDisplay = (value & 0x08) !== 0
      const right = (value & 0x04) !== 0
      if (shiftDisplay) {
        this.displayShift = (this.displayShift + (right ? 1 : -1) + LINE_LENGTH) % LINE_LENGTH
      } else {
        this.moveCursor(right ? 1 : -1)
      }
      return
    }
    if (value & 0x08) {
      this.displayOn = (value & 0x04) !== 0
      this.cursorOn = (value & 0x02) !== 0
      this.blinkOn = (value & 0x01) !== 0
      return
    }
    if (value & 0x04) {
      this.entryIncrement = (value & 0x02) !== 0
      this.entryShift = (value & 0x01) !== 0
      return
    }
    if (value & 0x02) {
      // Return home
      this.addressCounter = 0
      this.addressingCgram = false
      this.displayShift = 0
      return
    }
    if (value & 0x01) {
      // Clear display
      this.ddram.fill(0x20)
      this.addressCounter = 0
      this.addressingCgram = false
      this.displayShift = 0
      this.entryIncrement = true
    }
  }

  private writeData(value: number): void {
    if (this.addressingCgram) {
      this.cgram[this.addressCounter % CGRAM_SIZE] = value & 0x1f
      this.addressCounter = (this.addressCounter + (this.entryIncrement ? 1 : -1) + CGRAM_SIZE) % CGRAM_SIZE
      return
    }
    this.ddram[this.addressCounter % DDRAM_SIZE] = value
    this.moveCursor(this.entryIncrement ? 1 : -1)
    if (this.entryShift) {
      this.displayShift = (this.displayShift + (this.entryIncrement ? 1 : -1) + LINE_LENGTH) % LINE_LENGTH
    }
  }

  private moveCursor(delta: number): void {
    if (this.addressingCgram) {
      this.addressCounter = (this.addressCounter + delta + CGRAM_SIZE) % CGRAM_SIZE
      return
    }
    let next = this.addressCounter + delta
    // Adresy DDRAM sa nieciagle: wiersz 1 to 0x00..0x27, wiersz 2 to 0x40..0x67.
    if (next > 0x27 && next < LINE2_ADDRESS) next = LINE2_ADDRESS
    else if (next > 0x67) next = 0x00
    else if (next < 0) next = 0x67
    else if (next < LINE2_ADDRESS && next > 0x27) next = 0x27
    this.addressCounter = next
  }

  /** Widoczna zawartosc ekranu wraz ze stanem kursora - do renderowania w UI. */
  getState(columns = 16): LcdState {
    const rows: number[][] = []
    const lineBases = this.twoLines ? [0x00, LINE2_ADDRESS] : [0x00]
    for (const base of lineBases) {
      const row: number[] = []
      for (let i = 0; i < columns; i++) {
        row.push(this.ddram[base + ((this.displayShift + i) % LINE_LENGTH)])
      }
      rows.push(row)
    }
    while (rows.length < 2) rows.push(new Array(columns).fill(0x20))

    const customChars: number[][] = []
    for (let charIndex = 0; charIndex < 8; charIndex++) {
      customChars.push(Array.from(this.cgram.subarray(charIndex * 8, charIndex * 8 + 8)))
    }

    return {
      rows,
      displayOn: this.displayOn,
      cursorOn: this.cursorOn,
      blinkOn: this.blinkOn,
      cursor: this.cursorPosition(columns),
      customChars,
      backlight: true,
    }
  }

  private cursorPosition(columns: number): { row: number; column: number } | null {
    if (this.addressingCgram) return null
    const address = this.addressCounter
    const row = address >= LINE2_ADDRESS ? 1 : 0
    const base = row === 1 ? LINE2_ADDRESS : 0
    const column = (address - base - this.displayShift + LINE_LENGTH) % LINE_LENGTH
    if (column >= columns) return null
    return { row, column }
  }

  reset(): void {
    this.ddram.fill(0x20)
    this.cgram.fill(0)
    this.addressCounter = 0
    this.addressingCgram = false
    this.displayShift = 0
    this.eightBitMode = true
    this.pendingHighNibble = null
    this.entryIncrement = true
    this.entryShift = false
    this.displayOn = false
    this.cursorOn = false
    this.blinkOn = false
    this.twoLines = false
    this.previousEnable = 0
    this.lastWrite = null
  }
}
