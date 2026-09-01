import { Atmega32, FACTORY_FUSES, type FuseBytes } from '@zl3avr/avr-core'
import { Board, applyPreset } from '@zl3avr/board'

/**
 * Petla czasu rzeczywistego emulatora.
 *
 * Symulacja liczona jest w CYKLACH mikrokontrolera, a nie w klatkach ekranu:
 * w kazdej klatce wykonujemy tyle cykli, ile odpowiada uplynietemu czasowi
 * rzeczywistemu. Dzieki temu `_delay_ms(1000)` trwa naprawde sekunde,
 * a jesli fuse bity mowia 1 MHz, to kod skompilowany dla 4 MHz bedzie
 * czterokrotnie wolniejszy - tak jak na plytce.
 *
 * `speed` pozwala spowolnic czas do celow dydaktycznych (podgladanie multipleksu
 * albo pojedynczych kroków timera), nie zmieniajac niczego w samym modelu.
 */

export type SimulatorEvent = 'tick' | 'state' | 'serial'

export interface ProgrammingState {
  active: boolean
  progress: number
}

export class Simulator {
  readonly mcu = new Atmega32()
  readonly board: Board

  running = false
  /** Mnoznik uplywu czasu: 1 = czas rzeczywisty, 0.01 = stukrotne spowolnienie. */
  speed = 1

  /** Bajty odebrane przez "komputer PC" z plytki - wejscie terminala. */
  readonly serialFromBoard: { byte: number; frameError: boolean }[] = []

  /**
   * Sluchacze pojedynczych bajtow z plytki.
   *
   * Dziennik `serialFromBoard` sluzy terminalowi i bywa przycinany, gdy urosnie -
   * przez co nie da sie po nim wodzic wlasnym znacznikiem. Skrypt Pythona
   * potrzebuje KAZDEGO bajtu dokladnie raz, wiec dostaje je wprost.
   */
  private readonly serialListeners = new Set<(received: { byte: number; frameError: boolean }) => void>()

  programming: ProgrammingState = { active: false, progress: 0 }
  lastError: string | null = null
  /** Nazwa ostatnio wgranego programu - pokazywana w pasku stanu. */
  loadedProgram: string | null = null

  private frameHandle = 0
  private lastFrameTime = 0
  private programmingTimer: ReturnType<typeof setInterval> | null = null
  private readonly listeners = new Map<SimulatorEvent, Set<() => void>>()

  constructor() {
    this.board = new Board(this.mcu)
    // Zmiana polaczen albo zworki ma odswiezyc widok NATYCHMIAST, takze wtedy,
    // gdy symulacja stoi. Inaczej klikniecie w przewod nie robi nic widocznego.
    this.board.onWiringChange = () => this.emit('state')
    this.board.rs232.onByteFromBoard = (received) => {
      for (const listener of this.serialListeners) listener(received)
      this.serialFromBoard.push(received)
      if (this.serialFromBoard.length > 20_000) this.serialFromBoard.splice(0, 10_000)
      this.emit('serial')
    }
  }

  // -------------------------------------------------------------------------
  // Subskrypcje
  // -------------------------------------------------------------------------

  on(event: SimulatorEvent, listener: () => void): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(listener)
    return () => set.delete(listener)
  }

  private emit(event: SimulatorEvent): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const listener of set) listener()
  }

  // -------------------------------------------------------------------------
  // Sterowanie
  // -------------------------------------------------------------------------

  setPower(on: boolean): void {
    this.board.setPower(on)
    if (on) this.start()
    else this.stop()
    this.emit('state')
  }

  get powered(): boolean {
    return this.mcu.powered
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.lastFrameTime = performance.now()
    const loop = () => {
      if (!this.running) return
      const now = performance.now()
      // Ograniczenie kroku chroni przed "nadrabianiem" po przelaczeniu karty
      // przegladarki - inaczej po powrocie symulacja skoczylaby o wiele sekund.
      const delta = Math.min(0.05, (now - this.lastFrameTime) / 1000)
      this.lastFrameTime = now
      this.mcu.runSeconds(delta * this.speed)
      this.emit('tick')
      this.frameHandle = requestAnimationFrame(loop)
    }
    this.frameHandle = requestAnimationFrame(loop)
    this.emit('state')
  }

  stop(): void {
    this.running = false
    if (this.frameHandle) cancelAnimationFrame(this.frameHandle)
    this.frameHandle = 0
    this.emit('state')
  }

  /** Jedna instrukcja - do krokowania w debuggerze. */
  stepInstruction(): void {
    this.stop()
    this.mcu.step()
    this.emit('tick')
  }

  /** Symulacja przycisku RESET (S17 na plytce). */
  reset(): void {
    this.board.reset()
    this.emit('tick')
    this.emit('state')
  }

  setSpeed(speed: number): void {
    this.speed = speed
    this.emit('state')
  }

  // -------------------------------------------------------------------------
  // Programowanie
  // -------------------------------------------------------------------------

  /**
   * Wgranie programu przez wirtualny programator ISP.
   * Pasek postepu i mruganie diody D10 sa celowe - odwzorowuja to,
   * co student widzi w Microchip Studio.
   */
  program(hexText: string, name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.mcu.powered) {
        this.lastError = 'Plytka nie jest zasilona - wlacz zasilanie przed programowaniem'
        this.emit('state')
        reject(new Error(this.lastError))
        return
      }
      try {
        this.mcu.loadHex(hexText)
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error)
        this.emit('state')
        reject(error)
        return
      }

      this.lastError = null
      this.loadedProgram = name
      this.programming = { active: true, progress: 0 }
      this.stop()
      this.emit('state')

      if (this.programmingTimer) clearInterval(this.programmingTimer)
      this.programmingTimer = setInterval(() => {
        this.programming = { active: true, progress: Math.min(1, this.programming.progress + 0.08) }
        this.emit('state')
        if (this.programming.progress >= 1) {
          if (this.programmingTimer) clearInterval(this.programmingTimer)
          this.programmingTimer = null
          this.programming = { active: false, progress: 1 }
          this.board.reset()
          this.start()
          this.emit('state')
          resolve()
        }
      }, 40)
    })
  }

  /**
   * Wgranie programu BEZ animacji programatora.
   *
   * Pasek postepu i mruganie diody D10 maja sens, kiedy student sam naciska
   * „Zbuduj i wgraj” - odwzorowuja to, co widzi w Microchip Studio. Przy
   * odtwarzaniu zapisanego stanu albo otwieraniu linku bylyby tylko migotaniem
   * przy wejsciu na strone, a do tego opoznialyby gotowosc plytki o pol sekundy.
   *
   * Zwraca `false`, gdy pliku nie da sie odczytac - wywolujacy decyduje, czy to
   * powod do komunikatu, czy do cichego pominiecia.
   */
  restoreProgram(hexText: string, name: string): boolean {
    try {
      this.mcu.loadHex(hexText)
    } catch {
      return false
    }
    this.lastError = null
    this.loadedProgram = name
    this.board.reset()
    this.emit('state')
    return true
  }

  // -------------------------------------------------------------------------
  // Konfiguracja
  // -------------------------------------------------------------------------

  setFuses(fuses: FuseBytes): void {
    this.mcu.setFuses(fuses)
    this.emit('state')
  }

  resetFuses(): void {
    this.setFuses({ ...FACTORY_FUSES })
  }

  applyWiringPreset(id: string): void {
    applyPreset(this.board, id)
    this.emit('state')
  }

  /** Podpiecie sluchacza bajtow z plytki; zwraca funkcje odpinajaca. */
  onSerialByte(listener: (received: { byte: number; frameError: boolean }) => void): () => void {
    this.serialListeners.add(listener)
    return () => this.serialListeners.delete(listener)
  }

  sendToBoard(text: string): void {
    this.board.rs232.sendText(text)
  }

  clearSerial(): void {
    this.serialFromBoard.length = 0
    this.emit('serial')
  }
}
