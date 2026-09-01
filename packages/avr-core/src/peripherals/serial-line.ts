/**
 * Model fizycznej linii szeregowej - jeden kierunek transmisji.
 *
 * To nie jest kolejka bajtow. Nadajnik zapisuje na linii PRZEBIEG w czasie
 * (bit startu, bity danych, bit stopu), a odbiornik probkuje ten przebieg
 * WLASNYM zegarem. Dzieki temu rozjazd predkosci daje dokladnie to, co widac
 * na laboratorium: sypiace sie znaki, a nie czysty tekst.
 *
 * Po co az tyle: szablon z lab. 6 ma `#define F_CPU 4000000UL`, a uklad startuje
 * z fabrycznym zegarem 1 MHz. Makro liczy UBRR dla 4 MHz, wiec mikrokontroler
 * nadaje z predkoscia 2400 zamiast 9600. Terminal probkuje co 1/9600 s i dostaje
 * smieci - dopoki student nie przestawi fuse na 4 MHz. Prosta kolejka bajtow
 * pokazalaby poprawny tekst i zgubila cala pointe cwiczenia.
 *
 * Czas mierzymy w cyklach zegara mikrokontrolera - to wspolna waluta emulatora.
 */

export interface SerialFrame {
  /** Chwila (w cyklach), w ktorej zaczyna sie bit startu. */
  start: number
  byte: number
  /** Dlugosc jednego bitu w cyklach - wlasciwosc NADAJNIKA. */
  bitCycles: number
  /** Liczba bitow danych (na laboratorium zawsze 8). */
  dataBits: number
  /** Liczba bitow stopu. */
  stopBits: number
}

const IDLE_LEVEL = 1

export class SerialLine {
  private frames: SerialFrame[] = []
  private nextFree = 0

  /** Ile ramek czeka na wyslanie lub jest w trakcie nadawania. */
  get pending(): number {
    return this.frames.length
  }

  /**
   * Wystawia bajt na linie. Jesli poprzednia ramka jeszcze trwa, nowa ustawia sie
   * bezposrednio za nia (transmisja ciagla, bez przerw miedzy ramkami).
   * Zwraca chwile zakonczenia ramki.
   */
  send(now: number, byte: number, bitCycles: number, dataBits = 8, stopBits = 1): number {
    const start = Math.max(now, this.nextFree)
    const frame: SerialFrame = { start, byte, bitCycles, dataBits, stopBits }
    this.frames.push(frame)
    this.nextFree = start + bitCycles * (1 + dataBits + stopBits)
    return this.nextFree
  }

  /** Poziom logiczny linii w zadanej chwili. */
  levelAt(time: number): number {
    for (let i = 0; i < this.frames.length; i++) {
      const frame = this.frames[i]
      const total = frame.bitCycles * (1 + frame.dataBits + frame.stopBits)
      if (time < frame.start || time >= frame.start + total) continue
      const index = Math.floor((time - frame.start) / frame.bitCycles)
      if (index === 0) return 0 // bit startu
      if (index <= frame.dataBits) return (frame.byte >> (index - 1)) & 1 // LSB first
      return 1 // bit stopu
    }
    return IDLE_LEVEL
  }

  /** Usuwa ramki, ktore juz w calosci minely - inaczej lista rosnie bez konca. */
  gc(before: number): void {
    if (this.frames.length === 0) return
    this.frames = this.frames.filter(
      (frame) => frame.start + frame.bitCycles * (1 + frame.dataBits + frame.stopBits) >= before,
    )
  }

  reset(): void {
    this.frames = []
    this.nextFree = 0
  }
}

/**
 * Odbiornik: szuka zbocza opadajacego na LINII (nie w metadanych ramki),
 * a potem probkuje srodki kolejnych bitow wlasnym okresem bitowym.
 *
 * Zbocze wykrywamy na przebiegu, bo prawdziwy UART tez tak robi - i wlasnie
 * dlatego przy rozjezdzie predkosci potrafi zsynchronizowac sie w SRODKU cudzej
 * ramki i wyprodukowac znak, ktorego nikt nie wyslal. To zrodlo "krzakow"
 * w terminalu przy zlym F_CPU.
 */
export class SerialReceiver {
  private receiving = false
  private frameStart = 0
  private sampleIndex = 0
  private bits = 0
  private lastLevel = 1

  constructor(
    /** Wywolywane po odebraniu ramki. `frameError` = bit stopu przeczytany jako 0. */
    private readonly onByte: (byte: number, frameError: boolean) => void,
  ) {}

  /**
   * @param now        biezaca chwila (cykle)
   * @param line       linia, z ktorej czytamy
   * @param bitCycles  okres bitowy ODBIORNIKA - z jego wlasnej konfiguracji
   */
  poll(now: number, line: SerialLine, bitCycles: number): void {
    if (bitCycles <= 0) return

    if (!this.receiving) {
      const level = line.levelAt(now)
      const fallingEdge = this.lastLevel === 1 && level === 0
      this.lastLevel = level
      if (!fallingEdge) return
      this.receiving = true
      this.frameStart = now
      this.sampleIndex = 0
      this.bits = 0
    }

    // Probkujemy srodek kazdego bitu: frameStart + bitCycles * (k + 0.5)
    while (this.receiving) {
      const sampleTime = this.frameStart + bitCycles * (this.sampleIndex + 0.5)
      if (sampleTime > now) {
        this.lastLevel = line.levelAt(now)
        return
      }

      const level = line.levelAt(sampleTime)

      if (this.sampleIndex === 0) {
        if (level !== 0) {
          // Falstart: w chwili probkowania linia byla juz wysoka.
          this.receiving = false
          this.lastLevel = line.levelAt(now)
          return
        }
      } else if (this.sampleIndex <= 8) {
        if (level) this.bits |= 1 << (this.sampleIndex - 1)
      } else {
        this.onByte(this.bits & 0xff, level === 0)
        this.receiving = false
        this.lastLevel = line.levelAt(now)
        return
      }

      this.sampleIndex++
    }
  }

  reset(): void {
    this.receiving = false
    this.frameStart = 0
    this.sampleIndex = 0
    this.bits = 0
    this.lastLevel = 1
  }
}
