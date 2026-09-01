/**
 * Prostokaty zajmowane przez elementy plytki.
 *
 * Sluza do jednego: pilnowania, zeby nic na nic nie nachodzilo. Rysunek ma
 * kilkadziesiat elementow i recznie tego nie da sie upilnowac, wiec kolizje
 * wykrywa test (board-layout.test.ts). Dzieki temu kazdy element da sie
 * osobno wskazac mysza i pokazac dla niego opis.
 *
 * Liczy sie takze NAPIS przy elemencie: opis "Klawiatura 4x4" wchodzacy
 * na sasiednie zlacze jest tak samo nieczytelny jak nachodzace na siebie
 * obudowy. Dlatego kazdy prostokat obejmuje element razem z jego napisem,
 * a szerokosc napisu szacujemy z liczby znakow (silkWidth).
 */

import { CONNECTORS } from '@zl3avr/board'
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  DECORATIONS,
  HEADERS,
  JUMPERS,
  KEYPAD,
  LCD_MODULE,
  LED_ROW,
  MCU_BODY,
  PIN_PITCH,
  RESET_BUTTON,
  PROGRAMMING_LED,
  SEGMENT_DISPLAY,
  PIN_LABEL_OFFSET,
  SILK_FONT_SIZE,
  SILK_TINY_FONT_SIZE,
  SMALL_PARTS,
  pinLabelBand,
  silkWidth,
} from './layout'

export interface Box {
  id: string
  x: number
  y: number
  width: number
  height: number
  /** Elementy tej samej grupy moga sie stykac (np. rezystor obok rezystora). */
  group?: string
}

const SEGMENT_DIGIT_HEIGHT = 132

/** Prostokat obejmujacy dwa inne. */
function union(a: Box, b: { x: number; y: number; width: number; height: number }): Box {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    ...a,
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  }
}

/**
 * Miejsce zajmowane przez napis zlacza. Napisy po bokach sa obrocone o 90 stopni,
 * wiec zajmuja pasek w PIONIE - przy opisie po lewej biegna w dol od srodka
 * zlacza, przy opisie po prawej w gore. Odwzorowuje to sposob rysowania
 * w BoardArtwork.
 */
function headerLabelBox(header: (typeof HEADERS)[number]): { x: number; y: number; width: number; height: number } {
  const vertical = header.orientation === 'vertical'
  const width = vertical ? header.columns * PIN_PITCH : header.rows * PIN_PITCH
  const height = vertical ? header.rows * PIN_PITCH : header.columns * PIN_PITCH
  const x = header.x - PIN_PITCH / 2
  const y = header.y - PIN_PITCH / 2
  const textWidth = silkWidth(header.silkscreen)
  const textHeight = SILK_FONT_SIZE + 4
  const centreX = x + width / 2

  if (header.labelSide === 'above') {
    return { x: centreX - textWidth / 2, y: y - 12 - textHeight, width: textWidth, height: textHeight }
  }
  if (header.labelSide === 'below') {
    return { x: centreX - textWidth / 2, y: y + height + 4, width: textWidth, height: textHeight }
  }

  // Napis po prawej omija pas napisow pinow - dokladnie tak, jak go rysujemy.
  const labelX = header.labelSide === 'left' ? x - 12 : x + width + 12 + pinLabelBand(header)
  const labelY = y + height / 2
  return header.labelSide === 'left'
    ? { x: labelX - textHeight, y: labelY, width: textHeight, height: textWidth }
    : { x: labelX, y: labelY - textWidth, width: textHeight, height: textWidth }
}

/**
 * Pasek zajety przez OPISY POSZCZEGOLNYCH PINOW (PA0, LED0, GND...).
 *
 * Wczesniej test kolizji ich nie widzial - prostokat zlacza obejmowal tylko
 * pady i napis calego zlacza. Dlatego mogl przepuscic pionowe „Port A” lezace
 * dokladnie na „PA2” albo podpis wyswietlacza wchodzacy na opisy pinow JP27.
 */
function pinLabelsBox(header: (typeof HEADERS)[number]): { x: number; y: number; width: number; height: number } {
  const connector = CONNECTORS[header.id]
  const widest = connector.pins.reduce(
    (max, pin) => Math.max(max, silkWidth(pin.label.replace('seg ', ''), SILK_TINY_FONT_SIZE)),
    0,
  )

  if (header.orientation === 'vertical') {
    // Napisy biegna na prawo od ostatniej kolumny, na wysokosci swoich pinow.
    const lastColumn = header.x + (header.columns - 1) * PIN_PITCH
    return {
      x: lastColumn + PIN_LABEL_OFFSET,
      y: header.y - SILK_TINY_FONT_SIZE,
      width: widest,
      height: (header.rows - 1) * PIN_PITCH + 2 * SILK_TINY_FONT_SIZE,
    }
  }

  // Zlacze poziome: napisy stoja POD pinami, wysrodkowane na kazdym z nich.
  return {
    x: header.x - widest / 2,
    y: header.y + 20,
    width: (header.rows - 1) * PIN_PITCH + widest,
    height: SILK_TINY_FONT_SIZE + 2,
  }
}

/** Napis nad (albo pod) elementem dekoracyjnym - wysrodkowany, poziomy. */
function decorationLabelBox(part: (typeof DECORATIONS)[number]): { x: number; y: number; width: number; height: number } {
  const textWidth = silkWidth(part.silkscreen ?? '')
  const centreX = part.x + part.width / 2
  const textHeight = SILK_FONT_SIZE + 5
  return part.labelBelow
    ? { x: centreX - textWidth / 2, y: part.y + part.height + 2, width: textWidth, height: textHeight }
    : { x: centreX - textWidth / 2, y: part.y - textHeight - 2, width: textWidth, height: textHeight }
}

/** Wszystkie elementy razem z marginesem na napisy sitodruku. */
export function collectBoxes(): Box[] {
  const boxes: Box[] = []

  for (const header of HEADERS) {
    const vertical = header.orientation === 'vertical'
    const width = vertical ? header.columns * PIN_PITCH : header.rows * PIN_PITCH
    const height = vertical ? header.rows * PIN_PITCH : header.columns * PIN_PITCH
    // Trzy OSOBNE prostokaty zamiast jednego wspolnego: pady, napis zlacza
    // i pasek opisow pinow leza obok siebie w ksztalt litery L, a wspolny
    // prostokat obejmowalby takze puste miejsce miedzy nimi i zglaszal kolizje
    // tam, gdzie zadnej nie ma.
    boxes.push({
      id: `złącze ${header.id}`,
      x: header.x - PIN_PITCH / 2 - 4,
      y: header.y - PIN_PITCH / 2 - 4,
      width: width + 8,
      height: height + 8,
    })
    boxes.push({ id: `napis złącza ${header.id}`, ...headerLabelBox(header) })
    boxes.push({ id: `opisy pinów ${header.id}`, ...pinLabelsBox(header) })
  }

  for (const part of DECORATIONS) {
    const body: Box = {
      id: `element ${part.silkscreen ?? '?'}`,
      x: part.x,
      y: part.y,
      width: part.width,
      height: part.height,
    }
    boxes.push(part.silkscreen ? union(body, decorationLabelBox(part)) : body)
  }

  for (const jumper of JUMPERS) {
    const body: Box = {
      id: `zworka ${jumper.id}`,
      x: jumper.x - 16,
      y: jumper.y - 16,
      width: 32 + PIN_PITCH,
      height: 32,
    }
    const textWidth = silkWidth(jumper.silkscreen)
    boxes.push(
      union(body, {
        x: jumper.x + PIN_PITCH / 2 - textWidth / 2,
        y: jumper.y - 16 - SILK_FONT_SIZE - 6,
        width: textWidth,
        height: SILK_FONT_SIZE + 6,
      }),
    )
  }

  for (const part of SMALL_PARTS) {
    if (part.kind === 'resistor') {
      const long = 40
      const short = 12
      boxes.push({
        id: `rezystor ${part.label}`,
        x: part.x - (part.vertical ? short : long) / 2,
        y: part.y - (part.vertical ? long : short) / 2,
        width: part.vertical ? short : long,
        height: part.vertical ? long : short,
        group: 'rezystory',
      })
    } else if (part.kind === 'diode') {
      boxes.push({ id: `dioda ${part.label}`, x: part.x - 18, y: part.y - 6, width: 36, height: 12, group: 'diody' })
    } else if (part.kind === 'transistor') {
      boxes.push({ id: `tranzystor ${part.label}`, x: part.x - 16, y: part.y - 24, width: 32, height: 52, group: 'tranzystory' })
    } else {
      boxes.push({ id: `kondensator ${part.label}`, x: part.x - 15, y: part.y - 15, width: 30, height: 30, group: 'kondensatory' })
    }
  }

  boxes.push({
    id: 'mikrokontroler U5',
    x: MCU_BODY.x - 36,
    y: MCU_BODY.y - 30,
    width: MCU_BODY.width + 72,
    height: MCU_BODY.height + 44,
  })

  boxes.push({
    id: 'wyświetlacz LCD',
    x: LCD_MODULE.x,
    y: LCD_MODULE.y,
    width: LCD_MODULE.width,
    height: LCD_MODULE.height,
  })

  boxes.push({
    id: 'wyświetlacz 7-segmentowy',
    x: SEGMENT_DISPLAY.x - 22,
    y: SEGMENT_DISPLAY.y - 22,
    width: SEGMENT_DISPLAY.width + 44,
    height: SEGMENT_DIGIT_HEIGHT + 60,
  })

  boxes.push({
    id: 'linijka diod',
    x: LED_ROW.x - 30,
    y: LED_ROW.y - 34,
    width: 7 * LED_ROW.pitch + 60,
    height: 68,
  })

  boxes.push({
    id: 'klawiatura 4x4',
    x: KEYPAD.x - 24,
    y: KEYPAD.y - 24,
    width: 3 * KEYPAD.pitchX + KEYPAD.width + 48,
    height: 3 * KEYPAD.pitchY + KEYPAD.height + 48,
  })

  boxes.push({
    id: 'przycisk Reset',
    x: RESET_BUTTON.x - 42,
    y: RESET_BUTTON.y - 62,
    width: 84,
    height: 104,
  })

  boxes.push({
    id: 'dioda D10',
    x: PROGRAMMING_LED.x - PROGRAMMING_LED.radius,
    y: PROGRAMMING_LED.y - PROGRAMMING_LED.radius - 18,
    width: PROGRAMMING_LED.radius * 2,
    height: PROGRAMMING_LED.radius * 2 + 18,
  })

  return boxes
}

export interface Overlap {
  a: string
  b: string
  area: number
}

function intersects(a: Box, b: Box): number {
  const dx = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const dy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return dx > 0 && dy > 0 ? dx * dy : 0
}

/** Pary elementow, ktore na siebie nachodza. Pusta lista = rysunek czytelny. */
export function findOverlaps(boxes = collectBoxes()): Overlap[] {
  const overlaps: Overlap[] = []
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      if (a.group && a.group === b.group) continue
      const area = intersects(a, b)
      if (area > 0) overlaps.push({ a: a.id, b: b.id, area: Math.round(area) })
    }
  }
  return overlaps.sort((x, y) => y.area - x.area)
}

/** Elementy wystajace poza laminat. */
export function findOutsideBoard(boxes = collectBoxes()): string[] {
  return boxes
    .filter((box) => box.x < 0 || box.y < 0 || box.x + box.width > BOARD_WIDTH || box.y + box.height > BOARD_HEIGHT)
    .map((box) => box.id)
}

/** Prostokaty po identyfikatorze - uzywane do podswietlania elementu pod kursorem. */
let cache: Map<string, Box> | null = null

export function getBox(id: string): Box | undefined {
  if (!cache) cache = new Map(collectBoxes().map((box) => [box.id, box]))
  return cache.get(id)
}
