/**
 * Strona „komputera PC”: obsluga watku, w ktorym chodzi Python.
 *
 * Watek Pythona zatrzymuje sie na kazdym czekaniu (ramka z plytki, wpisana
 * liczba) i budzi go stad. Ta klasa jest wlasnie tym budzikiem: trzyma bufor
 * bajtow przyslanych przez plytke, przyjmuje wiersze wpisane przez uzytkownika
 * i odpowiada na pytania watku.
 *
 * Umowa miedzy watkami: `protocol.ts`.
 */

import {
  CONTROL,
  INTERRUPT_OFFSET,
  PAYLOAD_BYTES,
  PAYLOAD_OFFSET,
  SERIAL,
  SHARED_BYTES,
  type SerialRequest,
  type WorkerMessage,
} from './protocol'
import type { Simulator } from '../sim/Simulator'

export type PythonState = 'stopped' | 'starting' | 'running' | 'waiting-input'

export interface PythonEvents {
  onOutput: (text: string, kind: 'out' | 'err') => void
  onState: (state: PythonState) => void
  /** Zacheta z `input()`; `null`, gdy skrypt juz nie czeka na wpis. */
  onPrompt: (prompt: string | null) => void
}

/** Czy przegladarka daje pamiec dzielona - bez niej Python nie ma jak czekac. */
export function sharedMemoryAvailable(): boolean {
  return typeof SharedArrayBuffer !== 'undefined' && self.crossOriginIsolated === true
}

export class PythonHost {
  private worker: Worker | null = null
  private shared: SharedArrayBuffer | null = null
  private control: Int32Array | null = null
  private payload: Uint8Array | null = null

  /** Bajty przyslane przez plytke, jeszcze nieodczytane przez skrypt. */
  private inbox: number[] = []
  private detach: (() => void) | null = null

  /** Odlozone pytanie watku - czekamy na bajty albo na wpisany wiersz. */
  private pending: { request: SerialRequest; deadline: number } | null = null
  private pendingTimer: ReturnType<typeof setTimeout> | null = null
  private typedLine: string | null = null

  private state: PythonState = 'stopped'

  constructor(
    private readonly simulator: Simulator,
    private readonly events: PythonEvents,
  ) {}

  get current(): PythonState {
    return this.state
  }

  private setState(state: PythonState): void {
    this.state = state
    this.events.onState(state)
  }

  // -------------------------------------------------------------------------
  // Uruchamianie
  // -------------------------------------------------------------------------

  start(files: { path: string; content: string }[], entry: string): void {
    this.stop()
    if (!sharedMemoryAvailable()) {
      this.events.onOutput(
        'Przeglądarka nie udostępnia pamięci dzielonej, więc skrypt nie mógłby ' +
          'poczekać na ramkę ani na wpisaną liczbę. Odśwież stronę — jeśli to nie ' +
          'pomoże, otwórz aplikację przez http://, a nie z pliku na dysku.\n',
        'err',
      )
      return
    }

    this.inbox = []
    this.typedLine = null
    this.shared = new SharedArrayBuffer(SHARED_BYTES)
    this.control = new Int32Array(this.shared, 0, CONTROL.WORDS)
    this.payload = new Uint8Array(this.shared, PAYLOAD_OFFSET, PAYLOAD_BYTES)

    // Bajty z plytki zbieramy niezaleznie od terminala USART - skrypt i terminal
    // to dwa osobne okna na to samo lacze i kazde ma wlasny bufor.
    this.detach = this.simulator.onSerialByte((received) => {
      this.inbox.push(received.byte)
      this.servePending()
    })

    const worker = new Worker(new URL('./python.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => this.handle(event.data)
    worker.onerror = (event) => {
      this.events.onOutput(`Błąd wątku Pythona: ${event.message}\n`, 'err')
      this.stop()
    }
    this.worker = worker
    this.setState('starting')

    worker.postMessage({
      kind: 'start',
      shared: this.shared,
      baseUrl: new URL('pyodide/', document.baseURI).href,
      files,
      entry,
    })
  }

  stop(): void {
    if (this.control && this.shared) {
      // Dwa sygnaly naraz, bo dzialaja w innych momentach.
      //
      // Bajt przerwania to Ctrl+C Pythona: dziala, gdy skrypt LICZY.
      // Chorągiewka `ABORT` plus otwarta bramka budza watek, gdy skrypt CZEKA
      // (spi na `Atomics.wait` i sam z siebie nigdy by sie nie ocknal).
      new Uint8Array(this.shared, INTERRUPT_OFFSET, 1)[0] = 2
      Atomics.store(this.control, CONTROL.ABORT, 1)
      Atomics.store(this.control, CONTROL.GATE, 1)
      Atomics.notify(this.control, CONTROL.GATE)
    }
    if (this.pendingTimer) clearTimeout(this.pendingTimer)
    this.pendingTimer = null
    this.pending = null
    this.detach?.()
    this.detach = null

    const worker = this.worker
    this.worker = null
    if (worker) {
      // Chwila na zwiniecie stosu; potem zamykamy watek bezwarunkowo, bo skrypt
      // z `while True` sam z siebie nigdy sie nie skonczy.
      setTimeout(() => worker.terminate(), 250)
    }
    this.control = null
    this.payload = null
    this.shared = null
    if (this.state !== 'stopped') this.setState('stopped')
    this.events.onPrompt(null)
  }

  // -------------------------------------------------------------------------
  // Wpis od uzytkownika
  // -------------------------------------------------------------------------

  /** Wiersz wpisany w oknie „komputera” - odpowiedz na `input()`. */
  submitLine(line: string): void {
    this.typedLine = line
    this.servePending()
  }

  // -------------------------------------------------------------------------
  // Odpowiadanie watkowi
  // -------------------------------------------------------------------------

  private handle(message: WorkerMessage): void {
    switch (message.kind) {
      case 'ask':
        this.pending = { request: message.request, deadline: 0 }
        this.beginRequest(message.request)
        break
      case 'out':
      case 'err':
        this.events.onOutput(message.text, message.kind)
        break
      case 'ready':
        this.setState('running')
        break
      case 'done':
        this.events.onOutput(
          message.stopped ? '\n— zatrzymano —\n' : '\n— skrypt zakończył pracę —\n',
          'out',
        )
        this.stop()
        break
    }
  }

  private beginRequest(request: SerialRequest): void {
    switch (request.op) {
      case SERIAL.WRITE:
        for (const byte of request.data) this.simulator.board.rs232.send(byte)
        this.reply(new Uint8Array(0), request.data.length)
        return
      case SERIAL.INPUT:
        this.setState('waiting-input')
        this.events.onPrompt('')
        this.servePending()
        return
      case SERIAL.SLEEP:
        this.pendingTimer = setTimeout(() => this.reply(new Uint8Array(0), 0), request.ms)
        return
      case SERIAL.IN_WAITING:
      case SERIAL.READ: {
        const waitMs = request.op === SERIAL.IN_WAITING ? request.waitMs : request.timeoutMs
        if (!this.servePending() && waitMs !== 0) {
          // `timeout = None` w pyserial znaczy „czekaj bez konca”; wtedy nie
          // stawiamy zegara i odpowiadamy dopiero, gdy przyjda bajty.
          if (waitMs > 0) {
            this.pendingTimer = setTimeout(() => this.serveNow(true), waitMs)
          }
        }
        return
      }
    }
  }

  /** Odpowiada, jesli warunek jest juz spelniony. Zwraca `true`, gdy odpowiedziano. */
  private servePending(): boolean {
    return this.serveNow(false)
  }

  private serveNow(expired: boolean): boolean {
    const pending = this.pending
    if (!pending || !this.control) return false
    const request = pending.request

    if (request.op === SERIAL.INPUT) {
      if (this.typedLine === null) return false
      const line = this.typedLine
      this.typedLine = null
      this.events.onPrompt(null)
      this.setState('running')
      this.reply(new TextEncoder().encode(line), line.length)
      return true
    }

    if (request.op === SERIAL.IN_WAITING) {
      // Odpowiadamy od razu, gdy cokolwiek juz czeka; inaczej dopiero po czasie.
      // Dzieki temu petla `while True` w skrypcie nie zjada procesora, a i tak
      // reaguje natychmiast na pierwszy bajt.
      if (this.inbox.length === 0 && !expired && request.waitMs !== 0) return false
      this.reply(new Uint8Array(0), this.inbox.length)
      return true
    }

    if (request.op === SERIAL.READ) {
      if (this.inbox.length < request.count && !expired && request.timeoutMs !== 0) return false
      const taken = this.inbox.splice(0, Math.min(request.count, this.inbox.length))
      this.reply(Uint8Array.from(taken), taken.length)
      return true
    }

    return false
  }

  private reply(bytes: Uint8Array, value: number): void {
    if (!this.control || !this.payload) return
    if (this.pendingTimer) clearTimeout(this.pendingTimer)
    this.pendingTimer = null
    this.pending = null

    this.payload.set(bytes.subarray(0, PAYLOAD_BYTES), 0)
    Atomics.store(this.control, CONTROL.LENGTH, Math.min(bytes.length, PAYLOAD_BYTES))
    Atomics.store(this.control, CONTROL.VALUE, value)
    Atomics.store(this.control, CONTROL.GATE, 1)
    Atomics.notify(this.control, CONTROL.GATE)
  }
}
