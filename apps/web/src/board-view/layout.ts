/**
 * Geometria plytki ZL3AVR - rozmieszczenie odwzorowane z rysunku 8
 * dokumentacji producenta (docs/plytka-img/zl3avr_str07.png).
 *
 * Wspolrzedne wyznaczono, mierzac polozenia elementow na tamtym rysunku
 * i przeliczajac je na uklad o szerokosci BOARD_WIDTH. Dlatego proporcje
 * elementow wzgledem laminatu i wzgledem siebie odpowiadaja prawdziwej
 * plytce: mikrokontroler jest waski i dlugi, klawiatura szersza niz wyzsza,
 * a diody siedza nizej niz wyswietlacz siedmiosegmentowy.
 *
 * Uklad: mikrokontroler posrodku, zlacza portow 2x8 po jego obu stronach,
 * pionowy pas zlaczy peryferyjnych na prawo od niego, a same peryferia
 * (wyswietlacze, diody, klawiatura) przy prawej krawedzi. Po lewej stronie
 * czesc analogowa: gniazda audio, potencjometry, wzmacniacze.
 *
 * Uwaga: zlacza portow maja PO SZESNASCIE pinow (2 kolumny x 8 wierszy),
 * przy czym obie kolumny tego samego wiersza to ta sama linia mikrokontrolera.
 * Zdublowanie sluzy rozgalezianiu polaczen i tak samo dziala tutaj -
 * klikniecie dowolnej kolumny odnosi sie do tej samej linii portu.
 */

import { CONNECTORS, type ConnectorId } from '@zl3avr/board'

/**
 * Proporcje laminatu wziete z rysunku: 1,337 szerokosci na wysokosc.
 * Wysokosc wyliczamy, zeby stosunek zostal zachowany takze wtedy,
 * gdyby ktos zmienil szerokosc.
 */
export const BOARD_WIDTH = 1700
export const BOARD_ASPECT = 1.337
export const BOARD_HEIGHT = Math.round(BOARD_WIDTH / BOARD_ASPECT)

export const PIN_PITCH = 28

export interface HeaderLayout {
  id: ConnectorId
  /** Wspolrzedne pierwszego pinu (srodek). */
  x: number
  y: number
  columns: 1 | 2
  rows: number
  orientation: 'vertical' | 'horizontal'
  /** Napis na plytce przy zlaczu. */
  silkscreen: string
  /** Opis funkcji - pokazywany w dymku. */
  caption: string
  /**
   * Gdzie umiescic napis wzgledem zlacza.
   *
   * `right` jest ryzykowne przy zlaczach pionowych: po prawej stronie biegna
   * juz napisy pinow (PA0, LED0...), wiec napis calego zlacza laduje na nich
   * i nie da sie odczytac ani jednego, ani drugiego. Dla takich zlaczy uzywamy
   * `below` - pod zlaczem miejsca jest az nadto.
   */
  labelSide: 'left' | 'right' | 'above' | 'below'
  /**
   * Zlacze zajete na stale przez zamontowany modul - nie da sie do niego
   * podpiac przewodu, tak jak na prawdziwej plytce.
   */
  occupied?: boolean
}

export const HEADERS: HeaderLayout[] = [
  // --- zlacza portow mikrokontrolera (2 x 8), po obu stronach podstawki ---
  { id: 'JP16', x: 262, y: 620, columns: 2, rows: 8, orientation: 'vertical', silkscreen: 'Port B', caption: 'JP16 — Port B', labelSide: 'left' },
  { id: 'JP19', x: 262, y: 930, columns: 2, rows: 8, orientation: 'vertical', silkscreen: 'Port D', caption: 'JP19 — Port D', labelSide: 'left' },
  { id: 'JP17', x: 566, y: 620, columns: 2, rows: 8, orientation: 'vertical', silkscreen: 'Port A', caption: 'JP17 — Port A', labelSide: 'below' },
  { id: 'JP18', x: 566, y: 930, columns: 2, rows: 8, orientation: 'vertical', silkscreen: 'Port C', caption: 'JP18 — Port C', labelSide: 'above' },

  // --- pionowy pas zlaczy peryferyjnych ---
  { id: 'JP29', x: 830, y: 160, columns: 1, rows: 6, orientation: 'vertical', silkscreen: 'LCD 4bit', caption: 'JP29 — LCD w trybie 4-bitowym', labelSide: 'left' },
  { id: 'JP24', x: 830, y: 372, columns: 1, rows: 8, orientation: 'vertical', silkscreen: 'Cyfra', caption: 'JP24 — segmenty wyświetlacza (stan niski zapala)', labelSide: 'left' },
  { id: 'JP28', x: 830, y: 604, columns: 1, rows: 4, orientation: 'vertical', silkscreen: 'Kolumna', caption: 'JP28 — wybór cyfry (stan niski uaktywnia)', labelSide: 'left' },
  { id: 'JP22', x: 830, y: 754, columns: 1, rows: 8, orientation: 'vertical', silkscreen: 'LED', caption: 'JP22 — linijka diod (stan wysoki zapala)', labelSide: 'left' },
  { id: 'JP23', x: 830, y: 1020, columns: 1, rows: 8, orientation: 'vertical', silkscreen: 'Klaw. 4x4', caption: 'JP23 — klawiatura matrycowa', labelSide: 'below' },

  // --- zlacze LCD przy gornej krawedzi ---
  // W zlaczu JP27 siedzi na stale modul wyswietlacza, wiec nie prowadzi sie do niego przewodow.
  {
    id: 'JP27',
    x: 962,
    y: 58,
    columns: 1,
    rows: 16,
    orientation: 'horizontal',
    silkscreen: 'JP27 — wyświetlacz',
    caption: 'JP27 — pełne złącze LCD; wyświetlacz jest w nim osadzony na stałe',
    labelSide: 'above',
    occupied: true,
  },
]

export const HEADER_BY_ID = new Map(HEADERS.map((header) => [header.id, header]))

/** Srodek pinu o danym numerze. `column` wybiera kolumne w zlaczach 2 x 8. */
export function pinPosition(connector: ConnectorId, index: number, column = 0): { x: number; y: number } | null {
  const header = HEADER_BY_ID.get(connector)
  if (!header || index >= header.rows) return null
  if (header.orientation === 'horizontal') {
    return { x: header.x + index * PIN_PITCH, y: header.y + column * PIN_PITCH }
  }
  return { x: header.x + column * PIN_PITCH, y: header.y + index * PIN_PITCH }
}

/** Punkt, w ktorym przewod wychodzi ze zlacza - lekko odsuniety, jak wtyk. */
export function pinAnchor(connector: ConnectorId, index: number, column = 0): { x: number; y: number } | null {
  const position = pinPosition(connector, index, column)
  if (!position) return null
  return position
}

// ---------------------------------------------------------------------------
// Elementy nieinteraktywne - rysunek plytki
// ---------------------------------------------------------------------------

/**
 * Podstawka DIP40 z mikrokontrolerem. Prawdziwa obudowa jest waska i dluga
 * (15 mm na 52 mm), stad taki wlasnie stosunek bokow.
 */
export const MCU_BODY = { x: 376, y: 636, width: 130, height: 470 }

export const LCD_MODULE = { x: 900, y: 100, width: 760, height: 252 }
export const SEGMENT_DISPLAY = { x: 1000, y: 396, width: 500, height: 168 }
export const LED_ROW = { x: 1022, y: 786, pitch: 68 }

/**
 * Klawiatura matrycowa. Na plytce rozstaw poziomy jest wiekszy niz pionowy,
 * wiec pole klawiszy jest szersze niz wyzsze - nie jest kwadratem.
 */
export const KEYPAD = {
  x: 1046,
  y: 886,
  pitchX: 112,
  pitchY: 88,
  width: 96,
  height: 74,
}

/** Zworki: dwa piny i zdejmowany zwieracz. */
export interface JumperLayout {
  id: 'JP3' | 'JP4' | 'JP25'
  x: number
  y: number
  silkscreen: string
  caption: string
}

export const JUMPERS: JumperLayout[] = [
  { id: 'JP4', x: 524, y: 186, silkscreen: 'RxD Enable', caption: 'Rozwarta odcina odbiór z RS232 (nadawanie działa dalej)' },
  { id: 'JP25', x: 250, y: 872, silkscreen: 'Zegar', caption: 'Dołącza kwarc 16 MHz do wyprowadzeń XTAL' },
  { id: 'JP3', x: 916, y: 1170, silkscreen: 'Mała klaw.', caption: 'Redukuje matrycę do czterech przycisków' },
]

/** Elementy czysto graficzne, ale opisane tak jak na plytce. */
export interface DecorationLayout {
  kind: 'connector' | 'chip' | 'jack' | 'button' | 'crystal' | 'led' | 'socket' | 'pot'
  x: number
  y: number
  width: number
  height: number
  silkscreen?: string
  caption?: string
  /** Napis pod elementem zamiast nad nim - gdy nad nim nie ma miejsca. */
  labelBelow?: boolean
}

export const DECORATIONS: DecorationLayout[] = [
  // --- gorna krawedz: zlacza do swiata zewnetrznego ---
  { kind: 'connector', x: 105, y: 24, width: 102, height: 88, silkscreen: 'PS/2', caption: 'J5 — złącze klawiatury PS/2' },
  { kind: 'connector', x: 143, y: 152, width: 64, height: 38, silkscreen: 'JP8', caption: 'JP8 — linie CLOCK i DATA złącza PS/2' },
  { kind: 'connector', x: 250, y: 24, width: 196, height: 88, silkscreen: 'RS232', caption: 'J6 — gniazdo DB9 do komputera' },
  { kind: 'chip', x: 298, y: 168, width: 186, height: 50, silkscreen: 'U6', caption: 'MAX232 — konwerter poziomów RS232' },
  { kind: 'jack', x: 620, y: 24, width: 104, height: 88, silkscreen: 'AC/DC', caption: 'J1 — gniazdo zasilania 9–12 V' },
  { kind: 'pot', x: 782, y: 26, width: 68, height: 68, silkscreen: 'PR1', caption: 'PR1 — potencjometr kontrastu wyświetlacza LCD' },

  // --- lewa krawedz: tor analogowy ---
  { kind: 'jack', x: 14, y: 252, width: 78, height: 62, silkscreen: 'L.In(AC)', caption: 'J3 — wejście analogowe AC' },
  { kind: 'jack', x: 14, y: 360, width: 78, height: 62, silkscreen: 'L.Out', caption: 'J2 — wyjście analogowe (DAC)' },
  { kind: 'jack', x: 14, y: 480, width: 78, height: 62, silkscreen: 'L.In(DC)', caption: 'J4 — wejście analogowe DC' },
  { kind: 'chip', x: 222, y: 300, width: 62, height: 92, silkscreen: 'U3', caption: 'LM358 — wzmacniacz toru analogowego' },
  { kind: 'chip', x: 252, y: 528, width: 66, height: 60, silkscreen: 'U4', caption: 'Wzmacniacz toru wejściowego' },
  { kind: 'pot', x: 338, y: 316, width: 64, height: 58, silkscreen: 'PR2', caption: 'PR2 — regulacja toru analogowego' },
  { kind: 'pot', x: 338, y: 500, width: 64, height: 58, silkscreen: 'PR3', caption: 'PR3 — regulacja toru analogowego' },
  { kind: 'pot', x: 140, y: 424, width: 64, height: 58, silkscreen: 'PR4', caption: 'PR4 — regulacja toru analogowego' },
  { kind: 'connector', x: 388, y: 400, width: 42, height: 30, silkscreen: 'DAC En', caption: 'JP1 — włącza tor wyjściowy przetwornika' },
  { kind: 'connector', x: 422, y: 456, width: 46, height: 30, silkscreen: 'ADC(AC)', caption: 'JP14 — wejście analogowe AC' },
  { kind: 'connector', x: 128, y: 590, width: 74, height: 30, silkscreen: 'Tłum/Wzm', caption: 'JP7 — tłumienie albo wzmocnienie sygnału wejściowego' },

  // --- programowanie i zasilanie ---
  { kind: 'connector', x: 88, y: 726, width: 60, height: 74, silkscreen: 'Atmel ISP', caption: 'JP15 — programowanie ISP (6 pinów)' },
  { kind: 'crystal', x: 164, y: 706, width: 44, height: 74, silkscreen: 'X1', caption: 'X1 — rezonator kwarcowy 16 MHz' },
  { kind: 'connector', x: 574, y: 476, width: 54, height: 112, silkscreen: 'Kanda ISP', caption: 'JP20 — programowanie ISP (10 pinów)' },
  { kind: 'socket', x: 656, y: 452, width: 76, height: 178, silkscreen: 'ZL11PRG-M', caption: 'JP30 — gniazdo programatora' },
  { kind: 'chip', x: 570, y: 300, width: 100, height: 40, silkscreen: 'U1', caption: '7805 — stabilizator 5 V' },
  { kind: 'connector', x: 700, y: 360, width: 44, height: 62, silkscreen: 'Zasilanie', caption: 'JP9 — GND / +5 V dla układów zewnętrznych' },

  // --- dolna czesc: JTAG, TWI, podczerwien ---
  { kind: 'connector', x: 672, y: 976, width: 46, height: 104, silkscreen: 'JTAG', caption: 'JP21 — interfejs JTAG (zajmuje PC2–PC5)' },
  { kind: 'connector', x: 680, y: 834, width: 44, height: 30, silkscreen: 'Vref', caption: 'JP12 — napięcie odniesienia przetwornika ADC' },
  { kind: 'connector', x: 560, y: 1178, width: 48, height: 40, silkscreen: 'I2C', caption: 'JP26 — magistrala TWI' },
  { kind: 'connector', x: 412, y: 1200, width: 50, height: 32, silkscreen: 'Pullup', caption: 'JP5/JP6 — rezystory podciągające magistrali TWI' },
  { kind: 'connector', x: 718, y: 1136, width: 40, height: 30, silkscreen: 'IR IN', caption: 'JP10 — odbiornik podczerwieni TFMS5360' },
  { kind: 'chip', x: 646, y: 1196, width: 92, height: 36, silkscreen: 'U2', caption: 'TFMS5360 — odbiornik podczerwieni 36 kHz' },
  { kind: 'connector', x: 242, y: 1216, width: 44, height: 30, silkscreen: 'IR OUT', caption: 'JP11 — nadajnik podczerwieni' },
  { kind: 'led', x: 76, y: 1150, width: 30, height: 30, silkscreen: 'D1', caption: 'D1 — dioda nadawcza podczerwieni' },

  // --- zlacze sygnalu "klawisz wcisniety" ---
  { kind: 'connector', x: 890, y: 930, width: 44, height: 30, silkscreen: 'Kl. wc.', caption: 'JP13 — stan niski przy dowolnym wciśniętym klawiszu' },
]

/** Drobnica: rezystory, tranzystory, kondensatory, diody sygnalowe. */
export interface SmallPart {
  kind: 'resistor' | 'transistor' | 'capacitor' | 'diode'
  x: number
  y: number
  label: string
  /** Rezystory i diody moga stac pionowo. */
  vertical?: boolean
}

export const SMALL_PARTS: SmallPart[] = [
  // rezystory szeregowe segmentow wyswietlacza (R20..R27) - kolumna przy JP24
  ...Array.from({ length: 8 }, (_, i) => ({
    kind: 'resistor' as const,
    x: 920,
    y: 372 + i * PIN_PITCH,
    label: `R${20 + i}`,
  })),
  // rezystory kluczujace cyfry (R16..R19) - kolumna przy JP28
  ...Array.from({ length: 4 }, (_, i) => ({
    kind: 'resistor' as const,
    x: 920,
    y: 604 + i * PIN_PITCH,
    label: `R${16 + i}`,
  })),
  // tranzystory kluczujace wspolne anody cyfr (T2..T5)
  ...Array.from({ length: 4 }, (_, i) => ({
    kind: 'transistor' as const,
    x: 1050 + i * 130,
    y: 604,
    label: `T${i + 2}`,
  })),
  // rezystory szeregowe diod LED (R6..R13) - rzad nad linijka diod
  ...Array.from({ length: 8 }, (_, i) => ({
    kind: 'resistor' as const,
    x: 1022 + i * 68,
    y: 706,
    label: `R${6 + i}`,
    vertical: true,
  })),
  // diody sumujace sygnal "klawisz wcisniety" (D11..D14)
  ...Array.from({ length: 4 }, (_, i) => ({
    kind: 'diode' as const,
    x: 920,
    y: 1020 + i * 30,
    label: `D${14 - i}`,
  })),
  { kind: 'capacitor', x: 690, y: 188, label: 'C1' },
  { kind: 'capacitor', x: 764, y: 160, label: 'C10' },
  { kind: 'capacitor', x: 520, y: 262, label: 'C4' },
  { kind: 'capacitor', x: 576, y: 262, label: 'C7' },
  { kind: 'capacitor', x: 130, y: 858, label: 'C16' },
  { kind: 'capacitor', x: 130, y: 894, label: 'C17' },
  { kind: 'resistor', x: 120, y: 828, label: 'R15' },
  { kind: 'resistor', x: 196, y: 1150, label: 'R3' },
  { kind: 'resistor', x: 196, y: 1190, label: 'R2' },
  { kind: 'transistor', x: 152, y: 1216, label: 'T1' },
]

/** Przycisk zerowania S17 i dioda programowania D10 - obsluguje je BoardCanvas. */
export const RESET_BUTTON = { x: 133, y: 976, radius: 38 }
export const PROGRAMMING_LED = { x: 495, y: 516, radius: 13 }

/** Legendy klawiszy klawiatury 4x4 w kolejnosci numeracji wierszami. */
export const KEY_LABELS = ['1', '2', '3', 'A', '4', '5', '6', 'B', '7', '8', '9', 'C', '*', '0', '#', 'D']

/** Nazwy wyprowadzen mikrokontrolera - lewa i prawa strona obudowy DIP40. */
export const MCU_PINS_LEFT = [
  'PB0', 'PB1', 'PB2', 'PB3', 'PB4', 'PB5', 'PB6', 'PB7', 'RESET', 'VCC',
  'GND', 'XTAL2', 'XTAL1', 'PD0', 'PD1', 'PD2', 'PD3', 'PD4', 'PD5', 'PD6',
]

export const MCU_PINS_RIGHT = [
  'PA0', 'PA1', 'PA2', 'PA3', 'PA4', 'PA5', 'PA6', 'PA7', 'AREF', 'GND',
  'AVCC', 'PC7', 'PC6', 'PC5', 'PC4', 'PC3', 'PC2', 'PC1', 'PC0', 'PD7',
]

/**
 * Przyblizona szerokosc napisu sitodruku. Sluzy do sprawdzania, czy opisy
 * nie nachodza na sasiednie elementy - napis jest tak samo czescia rysunku
 * jak sam element i tak samo musi byc czytelny.
 */
export const SILK_FONT_SIZE = 15

/** Rozmiar drobnego napisu (klasa `silk-tiny`) - takim opisane sa piny. */
export const SILK_TINY_FONT_SIZE = 11

/** O tyle napis pinu jest odsuniety od jego srodka - tak rysuje go BoardCanvas. */
export const PIN_LABEL_OFFSET = 18
/**
 * Szerokosc pasa zajetego przez napisy pinow (PA0, LED0, W1...).
 *
 * Napisy pinow zawsze biegna NA PRAWO od ostatniej kolumny zlacza. Napis calego
 * zlacza umieszczony po tej samej stronie musi wiec ten pas ominac - inaczej
 * pionowe „Port A” lezy dokladnie na „PA2” i nie da sie odczytac ani jednego,
 * ani drugiego.
 */
export function pinLabelBand(header: HeaderLayout): number {
  if (header.orientation !== 'vertical') return 0
  const pins = CONNECTORS[header.id]?.pins ?? []
  const widest = pins.reduce(
    (max, pin) => Math.max(max, silkWidth(pin.label.replace('seg ', ''), SILK_TINY_FONT_SIZE)),
    0,
  )
  return PIN_LABEL_OFFSET + widest
}

export function silkWidth(text: string, fontSize = SILK_FONT_SIZE): number {
  return text.length * fontSize * 0.58
}
