/**
 * „Komputer PC” po drugiej stronie kabla szeregowego.
 *
 * Uruchamia skrypt studenta w prawdziwym CPythonie skompilowanym do WebAssembly
 * (Pyodide) - w watku roboczym, zeby rysunek plytki dzialal dalej.
 *
 * DLACZEGO TO NIE JEST ZWYKLE URUCHOMIENIE SKRYPTU
 *
 * Skrypt z laboratorium czeka. Czeka na ramke z plytki (`in_waiting`, `read`)
 * i czeka na liczbe wpisana przez czlowieka (`input`). Robi to w petli `while True`,
 * bez zadnego `await` - bo na prawdziwym komputerze nic takiego nie jest potrzebne.
 *
 * Zeby ten sam plik zadzialal tutaj BEZ ZMIAN, czekanie musi byc prawdziwe:
 * watek staje w miejscu, a budzi go watek glowny. Sluzy do tego `Atomics.wait`
 * na pamieci dzielonej. Stad wymog izolacji miedzy zrodlami - patrz
 * `public/coi-serviceworker.js`.
 *
 * Gdyby zamiast tego uzyc zwyklych obietnic, `input()` musialoby stac sie
 * `await input()`, a wtedy narzedzie wymagaloby przepisania cwiczenia -
 * czyli klamaloby o tym, jak wyglada praca z prawdziwa plytka.
 */

/// <reference lib="webworker" />

import { SERIAL, CONTROL, INTERRUPT_OFFSET, PAYLOAD_OFFSET, PAYLOAD_BYTES } from './protocol'
import { SERIAL_MODULE, HEXDUMP_MODULE } from './pymodules'

interface StartMessage {
  kind: 'start'
  shared: SharedArrayBuffer
  baseUrl: string
  /** Pliki projektu widziane przez Pythona - skrypt moze importowac wlasne moduly. */
  files: { path: string; content: string }[]
  /** Ktory z nich uruchomic. */
  entry: string
}

type Incoming = StartMessage

interface PyodideApi {
  runPython(code: string): unknown
  setInterruptBuffer(buffer: Uint8Array): void
  setStdout(options: { write: (buffer: Uint8Array) => number }): void
  setStderr(options: { write: (buffer: Uint8Array) => number }): void
  FS: {
    mkdirTree(path: string): void
    writeFile(path: string, data: string, options?: { encoding: string }): void
  }
}

let control: Int32Array
let payload: Uint8Array
/** Ustawiane, gdy uzytkownik nacisnal „Zatrzymaj” - stad wiemy, ze to nie awaria. */
let stopping = false

/**
 * Zadanie do watku glownego i CZEKANIE na odpowiedz.
 *
 * `Atomics.wait` jest w watku roboczym dozwolone (w glownym nie) i zatrzymuje go
 * naprawde - bez petli, bez zjadania procesora.
 */
function ask(request: unknown): { bytes: Uint8Array; value: number } {
  Atomics.store(control, CONTROL.GATE, 0)
  self.postMessage({ kind: 'ask', request })
  Atomics.wait(control, CONTROL.GATE, 0)

  if (Atomics.load(control, CONTROL.ABORT) === 1) {
    // Uzytkownik nacisnal „Zatrzymaj”. NIE rzucamy tu wyjatkiem: to wywolanie
    // siedzi w srodku obslugi wejscia Pythona, a wyjatek z JavaScriptu zamienia
    // sie tam w „OSError: I/O error” - komunikat, ktory wyglada jak usterka
    // narzedzia. Zamiast tego wracamy z pusta odpowiedzia; Python wznowi prace,
    // zajrzy do bajtu przerwania i podniesie zwykle `KeyboardInterrupt`.
    stopping = true
    return { bytes: new Uint8Array(0), value: 0 }
  }

  const length = Atomics.load(control, CONTROL.LENGTH)
  return { bytes: payload.slice(0, length), value: Atomics.load(control, CONTROL.VALUE) }
}

/**
 * Funkcje wystawione Pythonowi. Modul `serial` (patrz `pymodules.ts`) wola je
 * przez `from js import ...`, wiec musza siedziec w zasiegu globalnym watku.
 */
function exposeBridge(): void {
  const scope = self as unknown as Record<string, unknown>

  scope.zl3avrInWaiting = (waitMs: number): number =>
    ask({ op: SERIAL.IN_WAITING, waitMs }).value

  scope.zl3avrRead = (count: number, timeoutMs: number): Uint8Array =>
    ask({ op: SERIAL.READ, count, timeoutMs }).bytes

  scope.zl3avrWrite = (data: ArrayLike<number>): void => {
    // Wyslanie nie wymaga czekania, ale i tak idzie ta sama droga: dzieki temu
    // bajty docieraja do plytki w kolejnosci, w jakiej Python je oddal.
    ask({ op: SERIAL.WRITE, data: Array.from(data) })
  }

  scope.zl3avrInput = (): string => new TextDecoder().decode(ask({ op: SERIAL.INPUT }).bytes)

  scope.zl3avrSleep = (ms: number): void => {
    ask({ op: SERIAL.SLEEP, ms })
  }
}

async function start(message: StartMessage): Promise<void> {
  control = new Int32Array(message.shared, 0, CONTROL.WORDS)
  payload = new Uint8Array(message.shared, PAYLOAD_OFFSET, PAYLOAD_BYTES)
  exposeBridge()

  const { loadPyodide } = (await import(
    /* @vite-ignore */ `${message.baseUrl}pyodide.mjs`
  )) as { loadPyodide: (options: Record<string, unknown>) => Promise<PyodideApi> }

  const pyodide = await loadPyodide({
    indexURL: message.baseUrl,
    // `input()` w Pythonie wypisuje zachete przez stdout, a potem czyta wiersz
    // ze stdin - wiec wystarczy podstawic czytanie. Sama zacheta pojawi sie
    // w oknie wyjscia bez zadnej dodatkowej obslugi.
    stdin: () => (self as unknown as { zl3avrInput: () => string }).zl3avrInput(),
  })

  /*
    Wyjscie przekazujemy BAJT W BAJT, a nie wierszami.

    Zacheta z `input("Co zapalic na diodach? ")` nie konczy sie znakiem nowej
    linii, wiec przy przekazywaniu wierszami czekalaby w buforze az do nastepnego
    `print` - czyli pojawialaby sie DOPIERO PO tym, co uzytkownik wpisal.
    Pytanie wyswietlone po odpowiedzi to nie drobiazg: przy pierwszym uruchomieniu
    nie widac wtedy, na co program w ogole czeka.
  */
  // Ctrl+C dla Pythona bez konsoli. Bez tego skrypt z `while True` daloby sie
  // zatrzymac wylacznie przez zamkniecie calego watku - czyli tracac to,
  // co wypisal, i bez szansy na wlasna obsluge przerwania w kodzie studenta.
  pyodide.setInterruptBuffer(new Uint8Array(message.shared, INTERRUPT_OFFSET, 1))

  const decoder = new TextDecoder()
  pyodide.setStdout({
    write: (buffer: Uint8Array) => {
      self.postMessage({ kind: 'out', text: decoder.decode(buffer) })
      return buffer.length
    },
  })
  pyodide.setStderr({
    write: (buffer: Uint8Array) => {
      // Po nacisnieciu „Zatrzymaj” slad wyjatku nie jest zadna wiadomoscia
      // dla uzytkownika - to on przerwal skrypt i wie o tym.
      if (!stopping) self.postMessage({ kind: 'err', text: decoder.decode(buffer) })
      return buffer.length
    },
  })

  // Wlasne moduly kladziemy w katalogu doklejonym do sciezki wyszukiwania.
  pyodide.FS.mkdirTree('/zl3avr')
  pyodide.FS.writeFile('/zl3avr/serial.py', SERIAL_MODULE, { encoding: 'utf8' })
  pyodide.FS.writeFile('/zl3avr/hexdump.py', HEXDUMP_MODULE, { encoding: 'utf8' })

  // Pliki projektu - zeby dzialal `import` wlasnego modulu obok skryptu.
  pyodide.FS.mkdirTree('/projekt')
  for (const file of message.files) {
    pyodide.FS.writeFile(`/projekt/${file.path}`, file.content, { encoding: 'utf8' })
  }

  pyodide.runPython(`
import sys
sys.path.insert(0, '/zl3avr')
sys.path.insert(0, '/projekt')
`)

  self.postMessage({ kind: 'ready' })

  const entry = message.files.find((file) => file.path === message.entry)
  if (!entry) {
    self.postMessage({ kind: 'err', text: `Nie ma pliku ${message.entry}.\n` })
    self.postMessage({ kind: 'done', stopped: false })
    return
  }

  try {
    // `__name__` ustawiamy na `__main__`, bo skrypty z laboratorium konczy
    // warunek `if __name__ == "__main__":` - bez tego nic by sie nie wykonalo.
    pyodide.runPython(`
import runpy
runpy.run_path('/projekt/${message.entry}', run_name='__main__')
`)
    self.postMessage({ kind: 'done', stopped: false })
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error)
    if (stopping || text.includes('KeyboardInterrupt')) {
      self.postMessage({ kind: 'done', stopped: true })
    } else {
      self.postMessage({ kind: 'err', text: text + '\n' })
      self.postMessage({ kind: 'done', stopped: false })
    }
  }
}

self.onmessage = (event: MessageEvent<Incoming>) => {
  if (event.data.kind === 'start') void start(event.data)
}
