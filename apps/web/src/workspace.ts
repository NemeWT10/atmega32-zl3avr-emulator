/**
 * Stan pracy: pliki, przewody, zworki, fuse bity i program w ukladzie.
 *
 * Dwa zastosowania, jedna postac danych:
 *
 *   1. PRZETRWANIE ODSWIEZENIA. Do tej pory przegladarka pamietala wylacznie
 *      pliki. Ktos ukladal kwadrans przewodow, odswiezal strone i zostawal
 *      z pusta plytka. Utrata pracy jest najbardziej dotkliwym rodzajem bledu,
 *      bo nie da sie jej cofnac.
 *
 *   2. LINK. Ten sam stan spakowany do adresu pozwala wyslac prowadzacemu
 *      dokladnie to, co sie widzi - z kodem, przewodami i fuse bitami.
 *      „U mnie nie dziala” przestaje byc rozmowa w ciemno.
 *
 * ZASADA: LINK MA BYC KROTKI. Osobno zapisujemy tylko to, co odbiega od rzeczy
 * juz obecnych w aplikacji. Kiedy ktos wysyla nietkniety gotowy przyklad, adres
 * konczy sie na `#p=lab1` - kilkanascie znakow zamiast kilku tysiecy. Dopiero
 * wlasny kod i wlasne przewody trafiaja do adresu w calosci, spakowane.
 */

import { FACTORY_FUSES, type FuseBytes } from '@zl3avr/avr-core'
import {
  Board,
  CONNECTORS,
  PRESETS,
  applyPreset,
  type ConnectorId,
  type Jumpers,
  type Wire,
} from '@zl3avr/board'
import { EXAMPLES } from './examples'
import type { ProjectFile } from './ide/project'

export interface WorkspaceState {
  files: ProjectFile[]
  wires: Wire[]
  jumpers: Jumpers
  fuses: FuseBytes
  /** Program wgrany do ukladu - bez niego plytka po odswiezeniu stoi martwa. */
  hex: string | null
  /** Nazwa pokazywana w pasku stanu, np. „L1 — wąż świetlny”. */
  hexName: string | null
  /** Czy symulacja chodzila - zeby wrocic dokladnie do tego, co bylo na ekranie. */
  running: boolean
  /** Czy plytka byla zasilona. */
  powered: boolean
}

const DEFAULT_JUMPERS: Jumpers = { JP3: false, JP4: false, JP25: false }

// ---------------------------------------------------------------------------
// Zapis w przegladarce
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'zl3avr.workspace.v1'

/**
 * Zapis stanu plytki. Pliki maja wlasny magazyn (`Project`), wiec tutaj ich nie
 * dublujemy - inaczej dwa zapisy tego samego rozjezdzalyby sie przy kazdej
 * zmianie, ktora trafi tylko do jednego z nich.
 */
export function saveLocal(state: WorkspaceState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(withoutFiles(state)))
  } catch {
    // Brak miejsca albo tryb prywatny. Praca ma dzialac dalej, tylko bez pamieci.
  }
}

export function loadLocal(): Omit<WorkspaceState, 'files'> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Omit<WorkspaceState, 'files'>
    if (!Array.isArray(parsed.wires)) return null
    return {
      wires: parsed.wires,
      jumpers: { ...DEFAULT_JUMPERS, ...parsed.jumpers },
      fuses: parsed.fuses ?? { ...FACTORY_FUSES },
      hex: parsed.hex ?? null,
      hexName: parsed.hexName ?? null,
      running: Boolean(parsed.running),
      powered: parsed.powered !== false,
    }
  } catch {
    return null
  }
}

function withoutFiles(state: WorkspaceState): Omit<WorkspaceState, 'files'> {
  const { files: _files, ...rest } = state
  return rest
}

// ---------------------------------------------------------------------------
// Link
// ---------------------------------------------------------------------------

/**
 * Alfabet bezpieczny w adresie - te same znaki co w base64url.
 * Pozwala zapisac numer zlacza albo pinu jednym znakiem.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const CONNECTOR_IDS = Object.keys(CONNECTORS) as ConnectorId[]

/** Postac linku dla nietknietego gotowego przykladu: `#p=lab1`. */
const PLAIN_ID = /^[a-z0-9]+$/

interface Payload {
  v: 1
  /** Identyfikator przykladu, gdy pliki sa jego nietknieta kopia. */
  e?: string
  /** Wlasne pliki: pary [sciezka, tresc]. */
  f?: [string, string][]
  /** Zestaw polaczen po identyfikatorze albo wlasne zyly (patrz `encodeWires`). */
  w?: string
  /** Wlasne kolory zyl, indeksowane przez `w`. */
  c?: string[]
  /** Maska zworek: bit 0 = JP3, 1 = JP4, 2 = JP25. */
  j?: number
  /** Fuse bity, gdy inne niz fabryczne. */
  u?: [number, number]
  /** Program, gdy nie da sie go odtworzyc z zrodel (wgrany plik .hex). */
  h?: string
}

/**
 * Zyly w postaci pieciu znakow kazda: zlacze A, pin A, zlacze B, pin B, kolor.
 *
 * Przynaleznosc do tasmy wielozylowej pomijamy. Ma ona znaczenie wylacznie
 * przy usuwaniu calej tasmy jednym ruchem, a tasmy powstaja z gotowych zestawow,
 * ktore i tak zapisujemy samym identyfikatorem.
 */
function encodeWires(wires: Wire[]): { w: string; c: string[] } {
  const colours: string[] = []
  let out = ''
  for (const wire of wires) {
    let colour = colours.indexOf(wire.color)
    if (colour < 0) colour = colours.push(wire.color) - 1
    out +=
      ALPHABET[CONNECTOR_IDS.indexOf(wire.a.connector)] +
      ALPHABET[wire.a.index] +
      ALPHABET[CONNECTOR_IDS.indexOf(wire.b.connector)] +
      ALPHABET[wire.b.index] +
      ALPHABET[colour]
  }
  return { w: '*' + out, c: colours }
}

function decodeWires(packed: string, colours: string[]): Wire[] {
  const body = packed.slice(1)
  const wires: Wire[] = []
  for (let at = 0; at + 5 <= body.length; at += 5) {
    const connectorA = CONNECTOR_IDS[ALPHABET.indexOf(body[at])]
    const connectorB = CONNECTOR_IDS[ALPHABET.indexOf(body[at + 2])]
    if (!connectorA || !connectorB) continue
    wires.push({
      id: `link${wires.length}`,
      a: { connector: connectorA, index: ALPHABET.indexOf(body[at + 1]) },
      b: { connector: connectorB, index: ALPHABET.indexOf(body[at + 3]) },
      color: colours[ALPHABET.indexOf(body[at + 4])] ?? '#d0d0d0',
    })
  }
  return wires
}

/** Zyly opisane parami pinow, bez kolorow i kolejnosci - do porownan. */
function wireFingerprint(wires: Wire[]): string {
  return wires
    .map((wire) => {
      const a = `${wire.a.connector}:${wire.a.index}`
      const b = `${wire.b.connector}:${wire.b.index}`
      return a < b ? `${a}-${b}` : `${b}-${a}`
    })
    .sort()
    .join('|')
}

/**
 * Identyfikator gotowego zestawu polaczen dajacego dokladnie te zyly.
 *
 * `scratch` to plansza robocza - osobna plytka uzywana wylacznie do rozlozenia
 * zestawu i porownania. Nie tworzymy jej tutaj, bo modul opisu stanu nie powinien
 * powolywac do zycia mikrokontrolera; przekazuje ja ten, kto wola.
 */
function matchingPreset(wires: Wire[], scratch: Board, preferred?: string): string | null {
  const target = wireFingerprint(wires)
  if (target === '') return null
  // Rozne cwiczenia bywaja polaczone tak samo - L1 i L4 uzywaja identycznej
  // tasmy z portu D na diody. Bez tego pierwszenstwa link do L4 opisywalby
  // przewody zestawem L1; sam w sobie poprawny, ale przestawal byc krotka
  // postacia „to jest cwiczenie L4”.
  const order = preferred ? [preferred, ...PRESETS.map((item) => item.id)] : PRESETS.map((item) => item.id)
  for (const id of order) {
    if (!applyPreset(scratch, id)) continue
    if (wireFingerprint(scratch.wires) === target) return id
  }
  return null
}

function sameFiles(a: ProjectFile[], b: ProjectFile[]): boolean {
  if (a.length !== b.length) return false
  const byPath = new Map(b.map((file) => [file.path, file.content]))
  return a.every((file) => byPath.get(file.path) === file.content)
}

function jumperMask(jumpers: Jumpers): number {
  return (jumpers.JP3 ? 1 : 0) | (jumpers.JP4 ? 2 : 0) | (jumpers.JP25 ? 4 : 0)
}

function jumpersFromMask(mask: number): Jumpers {
  return { JP3: (mask & 1) !== 0, JP4: (mask & 2) !== 0, JP25: (mask & 4) !== 0 }
}

/**
 * Opis stanu gotowy do zapisania w adresie.
 *
 * `scratch` to plansza robocza - osobna plytka, na ktorej rozkladamy gotowe
 * zestawy polaczen, zeby sprawdzic, czy ktorys odpowiada temu, co student ma
 * u siebie. Bez tego kazdy link niosl by pelna liste zyl.
 */
export function buildPayload(state: WorkspaceState, scratch: Board): Payload {
  const payload: Payload = { v: 1 }

  const example = EXAMPLES.find((item) => sameFiles(state.files, item.files))
  if (example) payload.e = example.id
  else payload.f = state.files.map((file) => [file.path, file.content])

  if (state.wires.length > 0) {
    const preset = matchingPreset(state.wires, scratch, example?.preset)
    if (preset) {
      payload.w = preset
    } else {
      const packed = encodeWires(state.wires)
      payload.w = packed.w
      payload.c = packed.c
    }
  }

  const mask = jumperMask(state.jumpers)
  if (mask !== jumperMask(DEFAULT_JUMPERS)) payload.j = mask
  if (state.fuses.low !== FACTORY_FUSES.low || state.fuses.high !== FACTORY_FUSES.high) {
    payload.u = [state.fuses.low, state.fuses.high]
  }

  // Program dokladamy tylko wtedy, gdy nie ma z czego go odtworzyc - czyli gdy
  // ktos wgral goly plik .hex. Przy zwyklym projekcie odbiorca buduje go u siebie,
  // a adres zostaje o kilka tysiecy znakow krotszy.
  const hasSources = state.files.some((file) => file.path.toLowerCase().endsWith('.c'))
  if (!hasSources && state.hex) payload.h = state.hex

  return payload
}

/**
 * Czy caly stan to nietkniety gotowy przyklad - z jego wlasnym zestawem polaczen,
 * jego zworkami i jego fuse bitami.
 *
 * Wtedy adres konczy sie na `#p=lab1`: kilkanascie znakow zamiast kilku tysiecy.
 * To najczestszy przypadek, bo najczesciej pokazuje sie cwiczenie, a nie wlasna
 * przerobke - i nie ma powodu, zeby placic za to dlugoscia adresu.
 *
 * Porownujemy z tym, co ROBI zestaw polaczen, a nie z jego opisem: presety
 * ustawiaja takze zworki i fuse bity, wiec jedynym pewnym zrodlem prawdy jest
 * rozlozenie ich na planszy roboczej.
 */
function shorthandOf(payload: Payload, scratch: Board): string | null {
  if (!payload.e || payload.f) return null
  const example = EXAMPLES.find((item) => item.id === payload.e)
  if (!example || !PLAIN_ID.test(example.id)) return null
  if (payload.h) return null
  if (payload.w !== example.preset) return null

  applyPreset(scratch, example.preset)
  const expectedMask = jumperMask(scratch.jumpers)
  const actualMask = payload.j ?? jumperMask(DEFAULT_JUMPERS)
  if (actualMask !== expectedMask) return null

  const expectedFuses = { low: scratch.mcu.fuses.low, high: scratch.mcu.fuses.high }
  const actualFuses = payload.u
    ? { low: payload.u[0], high: payload.u[1] }
    : { ...FACTORY_FUSES }
  if (actualFuses.low !== expectedFuses.low || actualFuses.high !== expectedFuses.high) return null

  return example.id
}

async function deflate(text: string): Promise<Uint8Array | null> {
  const stream = (globalThis as { CompressionStream?: typeof CompressionStream }).CompressionStream
  if (!stream) return null
  try {
    const compressed = new Blob([text]).stream().pipeThrough(new stream('deflate-raw'))
    return new Uint8Array(await new Response(compressed).arrayBuffer())
  } catch {
    return null
  }
}

async function inflate(bytes: Uint8Array): Promise<string | null> {
  const stream = (globalThis as { DecompressionStream?: typeof DecompressionStream })
    .DecompressionStream
  if (!stream) return null
  try {
    const expanded = new Blob([bytes as BlobPart]).stream().pipeThrough(new stream('deflate-raw'))
    return await new Response(expanded).text()
  } catch {
    return null
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

/**
 * Tresc po `#p=` - bez adresu strony, zeby dalo sie ja przetestowac.
 *
 * Trzy postacie, od najkrotszej:
 *   `lab1`   - nietkniety gotowy przyklad,
 *   `~z...`  - spakowany opis stanu,
 *   `~u...`  - ten sam opis niespakowany (pakowanie nie zawsze oplaca sie
 *              na krotkich danych, a bywa niedostepne w starszej przegladarce).
 */
export async function encodePayload(payload: Payload, scratch: Board): Promise<string> {
  const shorthand = shorthandOf(payload, scratch)
  if (shorthand) return shorthand

  const json = JSON.stringify(payload)
  const plain = toBase64Url(new TextEncoder().encode(json))
  const packed = await deflate(json)
  if (packed) {
    const encoded = toBase64Url(packed)
    if (encoded.length < plain.length) return '~z' + encoded
  }
  return '~u' + plain
}

export async function decodePayload(text: string): Promise<Payload | null> {
  if (text === '') return null
  if (!text.startsWith('~')) {
    const example = EXAMPLES.find((item) => item.id === text)
    if (!example) return null
    const payload: Payload = { v: 1, e: example.id, w: example.preset }
    const preset = PRESETS.find((item) => item.id === example.preset)
    if (preset?.fuses) payload.u = [preset.fuses.low, preset.fuses.high]
    return payload
  }

  try {
    const body = text.slice(2)
    const json =
      text[1] === 'z'
        ? await inflate(fromBase64Url(body))
        : new TextDecoder().decode(fromBase64Url(body))
    if (!json) return null
    const parsed = JSON.parse(json) as Payload
    return parsed.v === 1 ? parsed : null
  } catch {
    return null
  }
}

/** Stan opisany przez adres; `scratch` sluzy do rozlozenia gotowego zestawu. */
export function payloadToState(
  payload: Payload,
  scratch: Board,
): Omit<WorkspaceState, 'running' | 'powered'> {
  const example = payload.e ? EXAMPLES.find((item) => item.id === payload.e) : undefined
  const files: ProjectFile[] = example
    ? example.files.map((file) => ({ ...file }))
    : (payload.f ?? []).map(([path, content]) => ({ path, content }))

  // Gotowy zestaw ustawia nie tylko zyly, ale takze zworki i fuse bity. Rozkladamy
  // go na planszy roboczej i bierzemy z niej wszystkie trzy rzeczy naraz - dzieki
  // temu krotki link (`#p=lab3`) odtwarza cwiczenie w calosci.
  let wires: Wire[] = []
  let presetJumpers: Jumpers = { ...DEFAULT_JUMPERS }
  let presetFuses: FuseBytes = { ...FACTORY_FUSES }
  if (payload.w?.startsWith('*')) {
    wires = decodeWires(payload.w, payload.c ?? [])
  } else if (payload.w) {
    applyPreset(scratch, payload.w)
    wires = scratch.wires.map((wire) => ({ ...wire }))
    presetJumpers = { ...scratch.jumpers }
    presetFuses = { low: scratch.mcu.fuses.low, high: scratch.mcu.fuses.high }
  }

  return {
    files,
    wires,
    jumpers: payload.j === undefined ? presetJumpers : jumpersFromMask(payload.j),
    fuses:
      payload.u === undefined ? presetFuses : { low: payload.u[0], high: payload.u[1] },
    hex: payload.h ?? example?.hex ?? null,
    hexName: example?.label ?? (payload.h ? 'program z linku' : null),
  }
}

/** Adres do udostepnienia - biezaca strona z doklejonym opisem stanu. */
export async function shareUrl(
  state: WorkspaceState,
  scratch: Board,
  base = location.href,
): Promise<string> {
  const encoded = await encodePayload(buildPayload(state, scratch), scratch)
  return `${base.split('#')[0]}#p=${encoded}`
}

/** Tresc `#p=` z adresu, albo `null`, gdy go nie ma. */
export function payloadFromHash(hash: string): string | null {
  const match = /[#&]p=([^&]*)/.exec(hash)
  return match ? decodeURIComponent(match[1]) : null
}
