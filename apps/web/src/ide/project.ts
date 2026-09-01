/**
 * Projekt studenta: pliki, operacje na nich i zapis miedzy sesjami.
 *
 * Pliki trzymamy w pamieci przegladarki (localStorage), zeby po odswiezeniu
 * strony praca nie znikala. Nie ma tu zadnego serwera - to swiadoma decyzja,
 * bo caly emulator ma dzialac po otwarciu jednego adresu.
 */

export type FileLanguage = 'c' | 'cpp' | 'python' | 'plaintext'

export interface ProjectFile {
  path: string
  content: string
}

const STORAGE_KEY = 'zl3avr.projekt'

export function languageOf(path: string): FileLanguage {
  if (path.endsWith('.c') || path.endsWith('.h')) return 'c'
  if (path.endsWith('.cpp') || path.endsWith('.hpp')) return 'cpp'
  if (path.endsWith('.py')) return 'python'
  return 'plaintext'
}

/**
 * Czy nazwa pliku nadaje sie do uzycia.
 *
 * Zakres znakow jest zawezony celowo i musi zgadzac sie z tym, co przyjmuje
 * serwer kompilacji (tools/compile-server): nazwa trafia do polecenia powloki,
 * wiec spacja albo polska litera konczy sie bledem kompilacji, ktorego student
 * nie ma szans powiazac z nazwa pliku. Lepiej powiedziec o tym od razu.
 */
export function validateName(name: string, existing: string[]): string | null {
  const trimmed = name.trim()
  if (trimmed === '') return 'Nazwa nie może być pusta.'
  if (/\s/.test(trimmed)) {
    return 'Nazwa nie może zawierać spacji — kompilator jej nie przyjmie. Użyj podkreślenia, np. moj_plik.c'
  }
  if (!/^[A-Za-z0-9_.\-/]+$/.test(trimmed)) {
    return (
      'Nazwa może zawierać tylko litery bez polskich znaków, cyfry oraz . _ - / ' +
      '— tak wymaga kompilator.'
    )
  }
  if (trimmed.startsWith('/') || trimmed.endsWith('/')) return 'Nazwa nie może zaczynać się ani kończyć ukośnikiem.'
  if (existing.includes(trimmed)) return `Plik „${trimmed}” już istnieje.`
  if (!/\.[A-Za-z0-9]+$/.test(trimmed)) return 'Dodaj rozszerzenie, na przykład .c albo .h'
  return null
}

export class Project {
  private files: ProjectFile[]
  private readonly listeners = new Set<() => void>()

  /**
   * Licznik PODMIAN calego projektu (wczytanie gotowego przykladu).
   *
   * Edytor dostaje tresc raz, przez `defaultValue`, zeby nie resetowac kursora
   * przy kazdym nacisnieciu klawisza. Gdy jednak podmieniamy caly projekt,
   * a nowy plik nazywa sie tak samo jak stary, edytor nie ma skad wiedziec,
   * ze tresc sie zmienila - i pokazuje POPRZEDNI kod. Ten licznik jest dla
   * niego sygnalem: „przeladuj tresc z magazynu”.
   */
  revision = 0

  constructor(initial: ProjectFile[]) {
    this.files = loadFromStorage() ?? initial.map((file) => ({ ...file }))
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private changed(): void {
    saveToStorage(this.files)
    for (const listener of this.listeners) listener()
  }

  list(): ProjectFile[] {
    return [...this.files].sort((a, b) => a.path.localeCompare(b.path, 'pl'))
  }

  paths(): string[] {
    return this.files.map((file) => file.path)
  }

  read(path: string): ProjectFile | undefined {
    return this.files.find((file) => file.path === path)
  }

  write(path: string, content: string): void {
    const file = this.files.find((item) => item.path === path)
    if (!file) return
    file.content = content
    this.changed()
  }

  create(path: string, content = ''): void {
    if (this.files.some((file) => file.path === path)) return
    this.files.push({ path, content })
    this.changed()
  }

  rename(oldPath: string, newPath: string): void {
    const file = this.files.find((item) => item.path === oldPath)
    if (!file) return
    file.path = newPath
    this.changed()
  }

  remove(path: string): void {
    this.files = this.files.filter((file) => file.path !== path)
    this.changed()
  }

  /** Zastepuje caly projekt - uzywane przy wczytywaniu przykladu. */
  replaceAll(files: ProjectFile[]): void {
    this.files = files.map((file) => ({ ...file }))
    this.revision++
    this.changed()
  }

  /** Szablon nowego pliku - zeby student nie zaczynal od pustej kartki. */
  static template(path: string): string {
    if (path.endsWith('.h')) {
      const guard = path.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()
      return `#ifndef ${guard}\n#define ${guard}\n\n\n\n#endif // ${guard}\n`
    }
    if (path.endsWith('.py')) {
      return '# Skrypt uruchamiany po stronie komputera\n\n'
    }
    if (path.endsWith('.c')) {
      return (
        '// Nowy plik\n' +
        '#define F_CPU 1000000UL   // musi zgadzać się z zegarem z fuse bitów\n' +
        '#include <avr/io.h>\n' +
        '#include <util/delay.h>\n\n' +
        'int main(void)\n' +
        '{\n' +
        '    while (1)\n' +
        '    {\n' +
        '    }\n' +
        '}\n'
      )
    }
    return ''
  }
}

// ---------------------------------------------------------------------------
// Zapis miedzy sesjami
// ---------------------------------------------------------------------------

function loadFromStorage(): ProjectFile[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed.filter((item) => typeof item?.path === 'string' && typeof item?.content === 'string')
  } catch {
    // Prywatne okno albo zablokowane dane witryny - trudno, startujemy od szablonu.
    return null
  }
}

function saveToStorage(files: ProjectFile[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files))
  } catch {
    // Brak miejsca albo zablokowany zapis - praca dziala dalej, tylko bez zapamietania.
  }
}

// ---------------------------------------------------------------------------
// Pobieranie plikow
// ---------------------------------------------------------------------------

export function downloadFile(name: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  triggerDownload(name, blob)
}

export function downloadProject(files: ProjectFile[], archiveName = 'projekt-zl3avr.zip'): void {
  triggerDownload(archiveName, createZip(files))
}

function triggerDownload(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/**
 * Minimalny zapis archiwum ZIP (bez kompresji).
 *
 * Wlasna implementacja zamiast biblioteki: format przechowywania bez kompresji
 * to kilkadziesiat linii, a kazda zewnetrzna zaleznosc to kolejne megabajty
 * do pobrania przez studenta.
 */
function createZip(files: ProjectFile[]): Blob {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const file of files) {
    const nameBytes = encoder.encode(file.path)
    const dataBytes = encoder.encode(file.content)
    const crc = crc32(dataBytes)

    const localHeader = new Uint8Array(30 + nameBytes.length)
    const localView = new DataView(localHeader.buffer)
    localView.setUint32(0, 0x04034b50, true) // sygnatura naglowka lokalnego
    localView.setUint16(4, 20, true) // wymagana wersja
    localView.setUint16(6, 0x0800, true) // flaga: nazwy w UTF-8
    localView.setUint16(8, 0, true) // metoda: przechowywanie
    localView.setUint16(10, 0, true) // czas
    localView.setUint16(12, 0, true) // data
    localView.setUint32(14, crc, true)
    localView.setUint32(18, dataBytes.length, true)
    localView.setUint32(22, dataBytes.length, true)
    localView.setUint16(26, nameBytes.length, true)
    localView.setUint16(28, 0, true)
    localHeader.set(nameBytes, 30)

    chunks.push(localHeader, dataBytes)

    const centralHeader = new Uint8Array(46 + nameBytes.length)
    const centralView = new DataView(centralHeader.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint16(4, 20, true)
    centralView.setUint16(6, 20, true)
    centralView.setUint16(8, 0x0800, true)
    centralView.setUint16(10, 0, true)
    centralView.setUint16(12, 0, true)
    centralView.setUint16(14, 0, true)
    centralView.setUint32(16, crc, true)
    centralView.setUint32(20, dataBytes.length, true)
    centralView.setUint32(24, dataBytes.length, true)
    centralView.setUint16(28, nameBytes.length, true)
    centralView.setUint32(42, offset, true)
    centralHeader.set(nameBytes, 46)
    central.push(centralHeader)

    offset += localHeader.length + dataBytes.length
  }

  const centralSize = central.reduce((sum, item) => sum + item.length, 0)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(8, files.length, true)
  endView.setUint16(10, files.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, offset, true)

  // Sklejamy wszystko w jeden bufor - prostsze do otypowania niz lista fragmentow.
  const parts = [...chunks, ...central, end]
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const archive = new Uint8Array(total)
  let cursor = 0
  for (const part of parts) {
    archive.set(part, cursor)
    cursor += part.length
  }
  return new Blob([archive.buffer], { type: 'application/zip' })
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let value = i
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[i] = value >>> 0
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}
