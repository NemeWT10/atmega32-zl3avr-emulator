/**
 * Lokalny serwer kompilacji.
 *
 * Uruchamia PRAWDZIWY avr-gcc i zwraca gotowy plik HEX razem z komunikatami
 * kompilatora. Dzieki temu kod studenta dziala dokladnie tak, jak dzialalby
 * po zbudowaniu w Microchip Studio - to ten sam kompilator.
 *
 * Dlaczego serwer, skoro caly emulator ma dzialac w przegladarce:
 * kompilator w WebAssembly (SPIKE-1) jest w budowie i to on docelowo zastapi
 * ten serwer. Do tego czasu ktos musi umiec skompilowac kod - bez tego
 * narzedzie pozwala tylko ogladac gotowe przyklady.
 *
 * Serwer szuka kompilatora w dwoch miejscach, w tej kolejnosci:
 *   1. avr-gcc zainstalowany w systemie (np. razem z Microchip Studio),
 *   2. obraz kontenera zl3avr-toolchain (tools/avr-docker).
 *
 * Uruchomienie:  node tools/compile-server/server.mjs
 */

import { createServer } from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const PORT = Number(process.env.ZL3AVR_COMPILER_PORT ?? 5174)
const DOCKER_IMAGE = 'zl3avr-toolchain'

/** Flagi dobrane tak, jak ustawia je Microchip Studio w konfiguracji Release. */
const CFLAGS = [
  '-mmcu=atmega32',
  '-Os',
  '-std=gnu99',
  '-funsigned-char',
  '-funsigned-bitfields',
  '-fpack-struct',
  '-fshort-enums',
  '-Wall',
  '-I.',
]

/**
 * Biblioteka matematyczna. Microchip Studio dolacza ja domyslnie, wiec kod
 * z sin/cos/sqrt buduje sie tam bez zadnych ustawien - u nas ma byc tak samo.
 */
const LDFLAGS = ['-lm']

/** Czas, po ktorym przerywamy budowanie (ms). Zawieszony kontener blokowalby serwer. */
const BUILD_TIMEOUT = 60_000

/**
 * Nazwy plikow, ktore wolno przekazac do powloki.
 *
 * Polecenie budowania sklada sie w powloce, wiec nazwa ze spacja, apostrofem
 * albo srednikiem albo zepsulaby polecenie, albo pozwolila dopisac do niego
 * wlasne. Zamiast zgadywac cudzyslowy dla dwoch roznych powlok (sh i cmd)
 * po prostu nie wpuszczamy takich nazw i mowimy o tym wprost.
 */
const SAFE_PATH = /^[A-Za-z0-9_][A-Za-z0-9_.-]*(\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$/

// ---------------------------------------------------------------------------
// Wykrywanie kompilatora
// ---------------------------------------------------------------------------

function commandExists(command) {
  const probe = spawnSync(command, ['--version'], { shell: true })
  return probe.status === 0
}

function dockerImageExists() {
  const probe = spawnSync('docker', ['image', 'inspect', DOCKER_IMAGE], { shell: true })
  return probe.status === 0
}

function detectToolchain() {
  if (commandExists('avr-gcc')) return { kind: 'local', label: 'avr-gcc zainstalowany w systemie' }
  if (dockerImageExists()) return { kind: 'docker', label: `avr-gcc w kontenerze ${DOCKER_IMAGE}` }
  return { kind: 'none', label: 'nie znaleziono kompilatora' }
}

let toolchain = detectToolchain()

// ---------------------------------------------------------------------------
// Kompilacja
// ---------------------------------------------------------------------------

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: true, timeout: BUILD_TIMEOUT, ...options })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    child.stdout?.on('data', (chunk) => (stdout += chunk))
    child.stderr?.on('data', (chunk) => (stderr += chunk))
    child.on('close', (code, signal) => {
      // Zabity limitem czasu proces zwraca sygnal zamiast kodu wyjscia.
      if (signal && code === null) timedOut = true
      resolve({ code: timedOut ? 1 : code, stdout, stderr, timedOut })
    })
    child.on('error', (error) => resolve({ code: 1, stdout, stderr: String(error) }))
  })
}

/** Buduje polecenie uruchamiane w katalogu roboczym - lokalnie albo w kontenerze. */
function shellIn(directory, script) {
  if (toolchain.kind === 'docker') {
    return run('docker', ['run', '--rm', '-v', `${directory}:/src`, '-w', '/src', DOCKER_IMAGE, 'sh', '-c', `"${script}"`])
  }
  return run('sh', ['-c', `"${script}"`], { cwd: directory })
}

/**
 * Linie, ktore nic nie wnosza do zrozumienia bledu.
 *
 * `collect2: error: ld returned 1 exit status` znaczy tyle, ze konsolidator
 * zakonczyl sie bledem - o czym uzytkownik juz wie z komunikatu wyzej.
 * Dla kogos, kto widzi to pierwszy raz, taka linia jest tylko kolejnym
 * niezrozumialym „bledem” do przestraszenia sie.
 */
const NOISE = [/^collect2:\s*error:\s*ld returned/i, /^compilation terminated\.$/i]

/**
 * Komunikaty avr-gcc maja postac `plik:linia:kolumna: rodzaj: tresc`.
 * Zamieniamy je na strukture, ktora edytor pokaze przy odpowiedniej linii.
 *
 * Dwa przypadki wymagaja osobnej obslugi, bo inaczej komunikat gubi sie
 * albo trafia w miejsce, do ktorego uzytkownik nie ma dostepu:
 *
 *   NAGLOWKI SYSTEMOWE - ostrzezenie o braku F_CPU wskazuje na plik
 *   `/usr/lib/avr/include/util/delay.h`, ktorego student nie otworzy.
 *   Poprzedza je linia `In file included from moj.c:2:0:` i to ona mowi,
 *   gdzie naprawde jest przyczyna.
 *
 *   KONSOLIDATOR - `undefined reference` nie ma numeru linii w zwyklym
 *   formacie, wiec bez osobnej reguly trafialby na poczatek pliku
 *   z pelna, nieczytelna trescia linii.
 */
function parseDiagnostics(text) {
  const diagnostics = []
  let lastReal = null
  /** Ostatnie „In file included from X:LINE” - miejsce w KODZIE UZYTKOWNIKA. */
  let includedFrom = null

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd()
    if (line === '' || NOISE.some((pattern) => pattern.test(line))) continue

    const included = /^(?:In file included from|\s+from)\s+(.+?):(\d+)[:,]/.exec(line)
    if (included) {
      includedFrom = { file: included[1], line: Number(included[2]) }
      continue
    }

    const match = /^(.+?):(\d+):(?:(\d+):)?\s*(error|warning|note|fatal error):\s*(.*)$/.exec(line)
    if (match) {
      const [, file, lineNumber, column, kind, message] = match
      const entry = {
        file,
        line: Number(lineNumber),
        column: Number(column ?? 1),
        severity: kind === 'warning' ? 'warning' : kind === 'note' ? 'info' : 'error',
        message,
      }

      // Komunikat z naglowka systemowego przenosimy na linie z #include -
      // tylko tam uzytkownik moze cokolwiek zmienic.
      if (includedFrom && /^[/\\](usr|opt|mingw)/i.test(file)) {
        entry.note = `Komunikat pochodzi z nagłówka ${file.split(/[/\\]/).pop()} dołączonego w tej linii.`
        entry.file = includedFrom.file
        entry.line = includedFrom.line
        entry.column = 1
      }

      // Uwagi ("note") sa doprecyzowaniem poprzedniego komunikatu, nie osobnym problemem.
      if (kind === 'note' && lastReal) {
        lastReal.note = lastReal.note ? `${lastReal.note}\n${message}` : message
      } else {
        diagnostics.push(entry)
        lastReal = entry
      }
      continue
    }

    // Konsolidator: "plik.c:(.text+0x4): undefined reference to `nazwa'"
    const linker = /undefined reference to [`'"]([^`'"]+)['"]/.exec(line)
    if (linker) {
      const place = /^(.+?):\(/.exec(line)
      diagnostics.push({
        file: place ? place[1] : null,
        line: 1,
        column: 1,
        severity: 'error',
        message: `Nie znaleziono definicji „${linker[1]}” (undefined reference).`,
      })
      lastReal = null
      continue
    }

    // Pozostale komunikaty bez lokalizacji.
    const plain = /^(?:.*?:\s*)?(error|fatal error)[:\s](.*)$/i.exec(line)
    if (plain) {
      diagnostics.push({ file: null, line: 1, column: 1, severity: 'error', message: line })
      lastReal = null
    }
  }

  return diagnostics
}

function parseSize(text) {
  const lines = text.trim().split(/\r?\n/)
  const last = lines[lines.length - 1]?.trim().split(/\s+/)
  if (!last || last.length < 3) return null
  return { text: Number(last[0]), data: Number(last[1]), bss: Number(last[2]) }
}

async function compile(files) {
  if (toolchain.kind === 'none') {
    return {
      ok: false,
      diagnostics: [
        {
          file: null,
          line: 1,
          column: 1,
          severity: 'error',
          message:
            'Nie znaleziono kompilatora avr-gcc. Zainstaluj go w systemie albo zbuduj obraz ' +
            'kontenera poleceniem: docker build -t zl3avr-toolchain tools/avr-docker',
        },
      ],
      log: '',
    }
  }

  // Nazwy trafiaja do polecenia powloki - te niebezpieczne odrzucamy z wyjasnieniem.
  const rejected = files
    .map((file) => file.path.replace(/\\/g, '/'))
    .filter((path) => !SAFE_PATH.test(path))
  if (rejected.length > 0) {
    return {
      ok: false,
      diagnostics: rejected.map((path) => ({
        file: null,
        line: 1,
        column: 1,
        severity: 'error',
        message:
          `Nie mogę zbudować pliku „${path}”. Nazwa pliku może zawierać tylko litery ` +
          'bez polskich znaków, cyfry oraz kropkę, podkreślenie i myślnik — bez spacji. ' +
          'Zmień nazwę w drzewie plików i spróbuj ponownie.',
      })),
      log: '',
    }
  }

  const workspace = await mkdtemp(join(tmpdir(), 'zl3avr-'))
  try {
    const sources = []
    for (const file of files) {
      const safe = file.path.replace(/\\/g, '/')
      const target = join(workspace, safe)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, file.content, 'utf8')
      if (safe.endsWith('.c')) sources.push(safe)
    }

    if (sources.length === 0) {
      const onlyHeaders = files.some((file) => file.path.endsWith('.h'))
      return {
        ok: false,
        diagnostics: [
          {
            file: null,
            line: 1,
            column: 1,
            severity: 'error',
            message:
              'W projekcie nie ma żadnego pliku z rozszerzeniem .c, a to w nich pisze się program. ' +
              (onlyHeaders
                ? 'Pliki .h to tylko nagłówki — same z siebie nic nie robią. Dodaj plik main.c z funkcją main().'
                : 'Dodaj plik main.c przyciskiem „+ Plik”.'),
          },
        ],
        log: '',
      }
    }

    const quoted = sources.map((name) => `'${name}'`).join(' ')
    const build = await shellIn(
      workspace,
      `avr-gcc ${CFLAGS.join(' ')} -o out.elf ${quoted} ${LDFLAGS.join(' ')} 2>&1`,
    )

    if (build.timedOut) {
      return {
        ok: false,
        diagnostics: [
          {
            file: null,
            line: 1,
            column: 1,
            severity: 'error',
            message:
              `Kompilacja trwała dłużej niż ${BUILD_TIMEOUT / 1000} s i została przerwana. ` +
              'Sprawdź, czy w kodzie nie ma pętli w makrach preprocesora, i spróbuj ponownie.',
          },
        ],
        log: build.stdout + build.stderr,
      }
    }

    const diagnostics = parseDiagnostics(build.stdout + build.stderr)
    if (build.code !== 0) {
      if (diagnostics.length === 0) {
        diagnostics.push({
          file: null,
          line: 1,
          column: 1,
          severity: 'error',
          message: (build.stdout + build.stderr).trim() || 'Kompilacja nie powiodła się.',
        })
      }
      return { ok: false, diagnostics, log: build.stdout + build.stderr }
    }

    const objcopy = await shellIn(workspace, 'avr-objcopy -O ihex -R .eeprom out.elf out.hex 2>&1')
    if (objcopy.code !== 0) {
      return {
        ok: false,
        diagnostics: [
          { file: null, line: 1, column: 1, severity: 'error', message: objcopy.stdout + objcopy.stderr },
        ],
        log: objcopy.stdout + objcopy.stderr,
      }
    }

    const sizeResult = await shellIn(workspace, 'avr-size out.elf 2>&1')
    const hex = await readFile(join(workspace, 'out.hex'), 'utf8')

    return {
      ok: true,
      hex,
      diagnostics,
      size: parseSize(sizeResult.stdout + sizeResult.stderr),
      log: build.stdout + build.stderr,
    }
  } catch (error) {
    return {
      ok: false,
      diagnostics: [{ file: null, line: 1, column: 1, severity: 'error', message: String(error) }],
      log: String(error),
    }
  } finally {
    await rm(workspace, { recursive: true, force: true }).catch(() => {})
  }
}

// ---------------------------------------------------------------------------
// Serwer
// ---------------------------------------------------------------------------

function sendJson(response, status, body) {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    // Strona wlacza izolacje miedzy zrodlami (COOP/COEP), bez ktorej nie da sie
    // uruchomic Pythona w przegladarce. Przy takiej izolacji przegladarka
    // odrzuca odpowiedzi z innego portu, dopoki te same nie potwierdza, ze
    // godza sie na uzycie. Serwer kompilacji stoi na porcie 5174, wiec musi to
    // powiedziec wprost - inaczej samo wlaczenie Pythona zepsuloby kompilacje.
    'Cross-Origin-Resource-Policy': 'cross-origin',
  })
  response.end(payload)
}

const server = createServer((request, response) => {
  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {})
    return
  }

  if (request.url === '/status') {
    toolchain = detectToolchain()
    sendJson(response, 200, { ok: toolchain.kind !== 'none', kind: toolchain.kind, label: toolchain.label })
    return
  }

  if (request.method === 'POST' && request.url === '/compile') {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
      if (body.length > 4_000_000) request.destroy()
    })
    request.on('end', async () => {
      try {
        const { files } = JSON.parse(body)
        const result = await compile(Array.isArray(files) ? files : [])
        sendJson(response, 200, result)
      } catch (error) {
        sendJson(response, 400, { ok: false, diagnostics: [], log: String(error) })
      }
    })
    return
  }

  sendJson(response, 404, { ok: false, message: 'Nieznany adres' })
})

server.listen(PORT, () => {
  console.log(`[kompilator] nasłuchuje na http://localhost:${PORT}`)
  console.log(`[kompilator] ${toolchain.label}`)
  if (toolchain.kind === 'none') {
    console.log('[kompilator] zbuduj obraz: docker build -t zl3avr-toolchain tools/avr-docker')
  }
})
