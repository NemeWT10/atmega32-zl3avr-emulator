/**
 * Umowa miedzy watkiem Pythona a watkiem glownym.
 *
 * Wspolna pamiec ma dwie czesci:
 *
 *   - cztery liczby sterujace (`Int32Array`), na ktorych dziala `Atomics`,
 *   - obszar na dane odpowiedzi.
 *
 * Watek Pythona ustawia bramke na 0, wysyla pytanie i zasypia na `Atomics.wait`.
 * Watek glowny wpisuje odpowiedz, ustawia bramke na 1 i budzi go `Atomics.notify`.
 */

export const CONTROL = {
  /** 0 - watek Pythona spi i czeka; 1 - odpowiedz gotowa. */
  GATE: 0,
  /** Ile bajtow odpowiedzi lezy w obszarze danych. */
  LENGTH: 1,
  /** Odpowiedz liczbowa (np. ile bajtow czeka w buforze). */
  VALUE: 2,
  /** 1 - uzytkownik przerwal skrypt; watek ma sie zwinac. */
  ABORT: 3,
  WORDS: 4,
} as const

/**
 * Jeden bajt, ktorym Pyodide sprawdza, czy przerwac prace Pythona.
 *
 * To wlasny mechanizm Pyodide (`setInterruptBuffer`): wpisana dwojka zamienia sie
 * po stronie Pythona w `KeyboardInterrupt` - dokladnie tak, jakby ktos nacisnal
 * Ctrl+C w konsoli. Dzieki temu zatrzymanie skryptu wyglada jak zatrzymanie,
 * a nie jak awaria z bledem wejscia-wyjscia.
 */
export const INTERRUPT_OFFSET = CONTROL.WORDS * 4

/** Dane zaczynaja sie za czescia sterujaca i bajtem przerwania. */
export const PAYLOAD_OFFSET = INTERRUPT_OFFSET + 4

/**
 * 64 kB na odpowiedz. Ramki z cwiczen maja kilkanascie bajtow, ale wpisany
 * wiersz albo wiekszy odczyt zmieszcza sie tu z ogromnym zapasem.
 */
export const PAYLOAD_BYTES = 64 * 1024

export const SHARED_BYTES = PAYLOAD_OFFSET + PAYLOAD_BYTES

/** Rodzaje pytan zadawanych przez watek Pythona. */
export const SERIAL = {
  IN_WAITING: 'in_waiting',
  READ: 'read',
  WRITE: 'write',
  INPUT: 'input',
  SLEEP: 'sleep',
} as const

export type SerialRequest =
  | { op: typeof SERIAL.IN_WAITING; waitMs: number }
  | { op: typeof SERIAL.READ; count: number; timeoutMs: number }
  | { op: typeof SERIAL.WRITE; data: number[] }
  | { op: typeof SERIAL.INPUT }
  | { op: typeof SERIAL.SLEEP; ms: number }

export type WorkerMessage =
  | { kind: 'ask'; request: SerialRequest }
  | { kind: 'out'; text: string }
  | { kind: 'err'; text: string }
  | { kind: 'ready' }
  | { kind: 'done'; stopped: boolean }
