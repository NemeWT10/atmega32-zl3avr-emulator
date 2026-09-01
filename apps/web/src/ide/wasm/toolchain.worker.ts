/**
 * Kompilacja C -> AVR -> Intel HEX w calosci po stronie przegladarki.
 *
 * Uruchamiamy trzy narzedzia z projektu LLVM, skompilowane do WebAssembly
 * (budowa: `tools/wasm-toolchain`, uzasadnienie wyboru: `docs/spikes/spike-1-...`):
 *
 *   clang        - kompiluje kazdy plik .c do pliku obiektowego,
 *   lld          - laczy je z bibliotekami avr-libc w plik ELF,
 *   llvm-objcopy - przepisuje ELF na Intel HEX, czyli format wgrywany do ukladu.
 *
 * DLACZEGO WORKER: `new WebAssembly.Instance` w watku glownym jest zabronione
 * dla modulow powyzej 8 MB, a sam clang ma 36 MB. Poza tym kompilacja nie moze
 * zamrazac rysunku plytki ani edytora.
 *
 * DLACZEGO ZA KAZDYM RAZEM OD NOWA: Emscripten uruchamia `main()` raz na
 * instancje modulu i nie wystawia `callMain`, wiec kazde wywolanie narzedzia to
 * nowa instancja z pustym systemem plikow. Skompilowany `WebAssembly.Module`
 * i pobrane archiwa trzymamy w pamieci, wiec powtorne uruchomienie kosztuje
 * tylko przydzial pamieci - nie ponowne pobranie i kompilacje 36 MB.
 */

/// <reference lib="webworker" />

interface EmscriptenFs {
  mkdir(path: string): void
  writeFile(path: string, data: Uint8Array | string): void
  readFile(path: string): Uint8Array
}

interface EmscriptenModule {
  FS: EmscriptenFs
}

type EmscriptenFactory = (options: Record<string, unknown>) => Promise<EmscriptenModule>

type ToolName = 'clang' | 'lld' | 'llvm-objcopy'

interface CompileRequest {
  type: 'compile'
  id: number
  baseUrl: string
  files: { path: string; content: string }[]
}

interface WarmRequest {
  type: 'warm'
  baseUrl: string
}

export interface WorkerResult {
  type: 'result'
  id: number
  /** Czy powstal plik HEX. */
  ok: boolean
  hex?: string
  /** Polaczone wyjscie wszystkich narzedzi - trafia do parsera komunikatow. */
  log: string
  /** Rozmiary sekcji z pliku ELF; `null`, gdy linkowanie sie nie udalo. */
  sections: { text: number; data: number; bss: number } | null
  /** Ile milisekund zajela sama kompilacja (bez pobierania narzedzi). */
  ms: number
}

// --- wspolne flagi -----------------------------------------------------------

/**
 * Te same przelaczniki, ktorych uzywa serwer z prawdziwym avr-gcc
 * (`tools/compile-server/server.mjs`), zeby kod zachowywal sie tak samo
 * niezaleznie od tego, ktory kompilator akurat pracuje.
 *
 * Dochodza trzy wlasne:
 *   --target=avr        clang jest kompilatorem wielu architektur i trzeba
 *                       mu powiedziec, na ktora tlumaczy,
 *   -nostdlibinc        nie szukaj naglowkow tam, gdzie trzymalby je avr-gcc -
 *                       w przegladarce nie ma zadnego avr-gcc,
 *   __DELAY_BACKWARD_COMPATIBLE__  patrz nizej.
 */
const CFLAGS = [
  '--target=avr',
  '-mmcu=atmega32',
  '-Os',
  '-std=gnu99',
  '-funsigned-char',
  '-funsigned-bitfields',
  '-fpack-struct',
  '-fshort-enums',
  '-Wall',
  '-nostdlibinc',
  // Kolejnosc ma znaczenie. Najpierw naglowki wlasne kompilatora (stdbool.h,
  // stddef.h, stdarg.h), potem avr-libc - dokladnie tak, jak ustawia to avr-gcc.
  // Clangowy `stdint.h` sam siega po wersje avr-libc przez `#include_next`,
  // wiec typy pozostaja te, ktore zna prawdziwy toolchain AVR.
  '-isystem',
  '/clang/include',
  '-isystem',
  '/avr/include',
  '-I/src',
  // --- zgodnosc z avr-gcc w kwestii tego, co jest bledem, a co ostrzezeniem ---
  //
  // Clang od wersji 15 traktuje wywolanie niezadeklarowanej funkcji jako BLAD.
  // avr-gcc daje w tym miejscu ostrzezenie i buduje program dalej - i tak samo
  // zachowa sie Microchip Studio na zajeciach. Gdybysmy zostawili blad, kod,
  // ktory na prawdziwej plytce dziala, u nas nie dalby sie zbudowac; narzedzie
  // klamaloby o rzeczywistosci. Ostrzezenie zostaje, bo problem jest prawdziwy.
  '-Wno-error=implicit-function-declaration',
  // `ISR()` z avr-libc rozwija sie do `__attribute__((signal, used,
  // externally_visible))`. Ostatniego z nich clang nie zna i przy KAZDYM
  // przerwaniu wypisuje ostrzezenie o niczym. Falszywy alarm przy poprawnym
  // kodzie uczy ignorowania komunikatow - a wtedy przestaje dzialac takze
  // ostrzeganie o rzeczach istotnych.
  '-Wno-unknown-attributes',
  // `_delay_ms()` wola `__builtin_avr_delay_cycles()` - funkcje wbudowana w GCC,
  // ktorej clang nie ma. Bez tego przelacznika linkowanie konczy sie komunikatem
  // „undefined symbol: __builtin_avr_delay_cycles”. avr-libc ma na tę sytuację
  // wlasna, starsza sciezke: opoznienie odmierza petla `_delay_loop_2`, ta sama,
  // ktorej avr-gcc uzywal przed wersja 4.7. Ziarno robi sie wtedy 4-taktowe
  // zamiast 1-taktowego - przy opoznieniach rzedu milisekund to roznica bez
  // znaczenia, a pulapka „F_CPU nie zgadza sie z fuse” dziala tak samo.
  '-D__DELAY_BACKWARD_COMPATIBLE__',
]

const LDFLAGS = [
  '-flavor',
  'gnu',
  '-T',
  '/avr/lib/avr5.x',
  // Skrypt linkera avr-libc ustala rozmiary pamieci idiomem
  // `X = DEFINED(X) ? X : wartosc`. lld rejestruje symbol, ZANIM policzy prawa
  // strone, wiec `DEFINED(X)` wychodzi prawda i region dostaje dlugosc 0 -
  // kazdy, nawet pusty program „nie miesci sie w pamieci”. Podajemy rozmiary
  // wprost i od razu prawdziwe dla ATmega32.
  //
  // Dotyczy to tak samo POCZATKOW regionow. Bez tego `.data` ladowalo pod adresem
  // 0 zamiast 0x800060 i linker slusznie protestowal, ze nachodzi na `.text` -
  // wiec kazdy program z jakakolwiek zainicjowana zmienna globalna sie nie linkowal.
  '--defsym=__TEXT_REGION_ORIGIN__=0',
  '--defsym=__DATA_REGION_ORIGIN__=0x800060',
  '--defsym=__TEXT_REGION_LENGTH__=32768',
  '--defsym=__DATA_REGION_LENGTH__=2048',
  '--defsym=__EEPROM_REGION_LENGTH__=1024',
  // Na AVR uklad zawsze startuje spod adresu 0 (wektor RESET), wiec punkt
  // wejscia nie jest osobnym symbolem. Bez tego lld ostrzega o braku `_start`,
  // a student dostaje niepokojacy komunikat o niczym.
  '--entry=__vectors',
]

// --- pamiec podreczna --------------------------------------------------------

/*
  W pamieci podrecznej trzymamy OBIETNICE, nie gotowe wyniki.

  Pobranie z wyprzedzeniem i pierwsze budowanie potrafia zejsc sie w czasie.
  Gdyby zapisywac dopiero wynik, oba wywolania zastalyby pusty wpis i pobralyby
  te same 36 MB dwa razy - a potem dwa razy je skompilowaly. Zapis obietnicy
  sprawia, ze drugi chetny dolacza sie do pierwszego pobrania.
*/
const modules = new Map<ToolName, Promise<WebAssembly.Module>>()
const factories = new Map<ToolName, Promise<EmscriptenFactory>>()
const archives = new Map<string, Promise<ArrayBuffer>>()
let base = ''

function fetchArchive(name: string): Promise<ArrayBuffer> {
  const cached = archives.get(name)
  if (cached) return cached
  const started = (async () => {
    const response = await fetch(base + name)
    if (!response.ok) throw new Error(`nie udało się pobrać ${name} (HTTP ${response.status})`)
    return response.arrayBuffer()
  })()
  archives.set(name, started)
  return started
}

function toolModule(tool: ToolName): Promise<WebAssembly.Module> {
  const cached = modules.get(tool)
  if (cached) return cached
  const started = (async () => {
    const response = await fetch(`${base}${tool}.wasm`)
    if (!response.ok) throw new Error(`nie udało się pobrać ${tool}.wasm (HTTP ${response.status})`)
    return WebAssembly.compile(await response.arrayBuffer())
  })()
  modules.set(tool, started)
  return started
}

function toolFactory(tool: ToolName): Promise<EmscriptenFactory> {
  const cached = factories.get(tool)
  if (cached) return cached
  const started = import(/* @vite-ignore */ `${base}${tool}.js`).then(
    (loaded: { default: EmscriptenFactory }) => loaded.default,
  )
  factories.set(tool, started)
  return started
}

// --- wirtualny system plikow -------------------------------------------------

function mkdirp(fs: EmscriptenFs, path: string): void {
  let current = ''
  for (const part of path.split('/').filter(Boolean)) {
    current += '/' + part
    try {
      fs.mkdir(current)
    } catch {
      /* katalog juz jest */
    }
  }
}

/**
 * Rozpakowanie archiwum `tar` do wirtualnego systemu plikow.
 *
 * Format jest prosty: kazdy plik poprzedza naglowek dlugosci 512 bajtow,
 * a tresc dopelniana jest do wielokrotnosci 512. Wystarczy nam wariant ustar
 * (zwykle pliki i katalogi) - archiwa robimy sami w `extract.sh`.
 */
function untar(buffer: ArrayBuffer, fs: EmscriptenFs): number {
  const view = new Uint8Array(buffer)
  const decoder = new TextDecoder()
  const text = (offset: number, length: number) =>
    decoder.decode(view.subarray(offset, offset + length)).replace(/\0[\s\S]*$/, '')

  let offset = 0
  let files = 0
  while (offset + 512 <= view.length) {
    const name = text(offset, 100)
    if (!name) {
      offset += 512
      continue
    }
    const size = parseInt(text(offset + 124, 12).trim() || '0', 8)
    const kind = String.fromCharCode(view[offset + 156]) || '0'
    const prefix = text(offset + 345, 155)
    const path = '/' + (prefix ? `${prefix}/${name}` : name)
    offset += 512

    if (kind === '5') {
      mkdirp(fs, path)
    } else if (kind === '0' || kind === '\0') {
      mkdirp(fs, path.replace(/\/[^/]*$/, ''))
      fs.writeFile(path, view.subarray(offset, offset + size))
      files++
    } else {
      throw new Error(`nieobsługiwany wpis archiwum: „${kind}” przy ${path}`)
    }
    offset += Math.ceil(size / 512) * 512
  }
  return files
}

// --- uruchamianie narzedzia --------------------------------------------------

interface Run {
  output: string
  fs: EmscriptenFs
}

async function run(tool: ToolName, argv: string[], setup: (fs: EmscriptenFs) => void): Promise<Run> {
  const [wasm, factory] = await Promise.all([toolModule(tool), toolFactory(tool)])
  let output = ''
  const collect = (line: string) => {
    output += line + '\n'
  }

  // Obiekt przekazany fabryce JEST obiektem `Module` wewnatrz modulu, wiec
  // doszyty w `extract.sh` przypis `Module["FS"]=FS` pojawi sie tutaj.
  const options: Record<string, unknown> = {
    arguments: argv,
    thisProgram: tool,
    instantiateWasm(imports: WebAssembly.Imports, done: (instance: WebAssembly.Instance) => void) {
      const instance = new WebAssembly.Instance(wasm, imports)
      done(instance)
      return instance.exports
    },
    print: collect,
    printErr: collect,
  }
  options.preRun = [() => setup(options.FS as EmscriptenFs)]

  const module = await factory(options)
  return { output, fs: module.FS }
}

/** Odczyt pliku z wirtualnego systemu plikow; `null`, gdy narzedzie go nie utworzylo. */
function readOrNull(fs: EmscriptenFs, path: string): Uint8Array | null {
  try {
    return fs.readFile(path)
  } catch {
    return null
  }
}

// --- rozmiary sekcji ---------------------------------------------------------

/**
 * Rozmiary `.text`, `.data` i `.bss` prosto z naglowkow sekcji pliku ELF.
 *
 * Robimy to sami zamiast dowozic czwarte narzedzie (`llvm-size`): to kilkanascie
 * linii odczytu naglowkow, a kazde kolejne narzedzie to kolejne megabajty
 * do pobrania przez studenta.
 */
function sectionSizes(elf: Uint8Array): { text: number; data: number; bss: number } | null {
  if (elf.length < 52 || elf[0] !== 0x7f || elf[1] !== 0x45) return null
  const view = new DataView(elf.buffer, elf.byteOffset, elf.byteLength)
  const little = elf[5] === 1
  const shoff = view.getUint32(32, little)
  const shentsize = view.getUint16(46, little)
  const shnum = view.getUint16(48, little)
  const shstrndx = view.getUint16(50, little)
  if (shoff === 0 || shnum === 0) return null

  const stringTableOffset = view.getUint32(shoff + shstrndx * shentsize + 16, little)
  const decoder = new TextDecoder()
  const nameAt = (index: number) => {
    const start = stringTableOffset + index
    let end = start
    while (end < elf.length && elf[end] !== 0) end++
    return decoder.decode(elf.subarray(start, end))
  }

  const sizes: Record<string, number> = {}
  for (let i = 0; i < shnum; i++) {
    const header = shoff + i * shentsize
    sizes[nameAt(view.getUint32(header, little))] = view.getUint32(header + 20, little)
  }
  return {
    text: sizes['.text'] ?? 0,
    data: sizes['.data'] ?? 0,
    bss: (sizes['.bss'] ?? 0) + (sizes['.noinit'] ?? 0),
  }
}

// --- caly przebieg -----------------------------------------------------------

async function compile(request: CompileRequest): Promise<WorkerResult> {
  const started = performance.now()
  const sources = request.files.filter((file) => file.path.toLowerCase().endsWith('.c'))
  const headers = await fetchArchive('avr-include.tar')
  const libraries = await fetchArchive('avr-lib.tar')
  let log = ''

  /** Wszystkie pliki projektu trafiaja do /src - takze naglowki wlasne studenta. */
  const layProject = (fs: EmscriptenFs) => {
    mkdirp(fs, '/src')
    for (const file of request.files) {
      const path = '/src/' + file.path.replace(/\\/g, '/')
      mkdirp(fs, path.replace(/\/[^/]*$/, ''))
      fs.writeFile(path, file.content)
    }
  }

  // 1. kazdy plik .c osobno do pliku obiektowego
  const objects: { name: string; data: Uint8Array }[] = []
  for (const [index, source] of sources.entries()) {
    const name = `o${index}.o`
    const result = await run(
      'clang',
      [...CFLAGS, '-c', '/src/' + source.path.replace(/\\/g, '/'), '-o', '/' + name],
      (fs) => {
        untar(headers, fs)
        layProject(fs)
      },
    )
    log += result.output
    const object = readOrNull(result.fs, '/' + name)
    if (!object) {
      return { type: 'result', id: request.id, ok: false, log, sections: null, ms: elapsed(started) }
    }
    objects.push({ name, data: object })
  }

  // 2. linkowanie
  // Kolejnosc bibliotek ma znaczenie: `libgcc` pojawia sie dwa razy, bo funkcje
  // pomocnicze (mnozenie, dzielenie) wolane sa i z kodu, i z wnetrza `libc`.
  const link = await run(
    'lld',
    [
      ...LDFLAGS,
      '/avr/lib/crtatmega32.o',
      ...objects.map((object) => '/' + object.name),
      '-L/avr/lib',
      '-latmega32',
      '-lgcc',
      '-lc',
      '-lgcc',
      '-lm',
      '-o',
      '/out.elf',
    ],
    (fs) => {
      untar(libraries, fs)
      for (const object of objects) fs.writeFile('/' + object.name, object.data)
    },
  )
  log += link.output
  const elf = readOrNull(link.fs, '/out.elf')
  if (!elf) {
    return { type: 'result', id: request.id, ok: false, log, sections: null, ms: elapsed(started) }
  }

  // 3. ELF -> Intel HEX. `-R .eeprom` odcina sekcje z zawartoscia pamieci EEPROM:
  //    programator wgrywa ja osobno, a doklejona do HEX-a wygladalaby jak kod
  //    pod adresem, ktorego uklad nie ma.
  const objcopy = await run(
    'llvm-objcopy',
    ['-O', 'ihex', '-R', '.eeprom', '/out.elf', '/out.hex'],
    (fs) => {
      fs.writeFile('/out.elf', elf)
    },
  )
  log += objcopy.output
  const hex = readOrNull(objcopy.fs, '/out.hex')
  if (!hex) {
    return { type: 'result', id: request.id, ok: false, log, sections: null, ms: elapsed(started) }
  }

  return {
    type: 'result',
    id: request.id,
    ok: true,
    hex: new TextDecoder().decode(hex),
    log,
    sections: sectionSizes(elf),
    ms: elapsed(started),
  }
}

const elapsed = (from: number) => Math.round(performance.now() - from)

self.onmessage = async (event: MessageEvent<CompileRequest | WarmRequest>) => {
  base = event.data.baseUrl

  if (event.data.type === 'warm') {
    // Pobranie i skompilowanie modulow z wyprzedzeniem, zeby pierwsze
    // „Zbuduj i wgraj” nie czekalo na 60 MB.
    try {
      await Promise.all([
        toolModule('clang'),
        toolModule('lld'),
        toolModule('llvm-objcopy'),
        fetchArchive('avr-include.tar'),
        fetchArchive('avr-lib.tar'),
      ])
      self.postMessage({ type: 'warm', ok: true })
    } catch (error) {
      self.postMessage({ type: 'warm', ok: false, error: String(error) })
    }
    return
  }

  const request = event.data
  try {
    self.postMessage(await compile(request))
  } catch (error) {
    self.postMessage({
      type: 'result',
      id: request.id,
      ok: false,
      log: `zl3avr: ${error instanceof Error ? error.message : String(error)}`,
      sections: null,
      ms: 0,
    } satisfies WorkerResult)
  }
}
