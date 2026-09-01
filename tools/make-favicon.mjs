/**
 * Sklada `apps/web/public/favicon.ico` z tych samych ksztaltow, co `favicon.svg`.
 *
 * PO CO ICO, SKORO JEST SVG: przegladarki od kilku lat przyjmuja ikone w SVG,
 * ale nie wszystkie - starsze Safari pokazuje wtedy pustke, a Windows siega
 * po `.ico`, gdy ktos przypnie strone do paska zadan. Do tego przegladarki
 * i tak pytaja o `/favicon.ico` z korzenia serwera, wiec bez tego pliku
 * w dzienniku wdrozenia lezy stale 404.
 *
 * DLACZEGO SKRYPT, A NIE GOTOWY PLIK: ikona ma dwa rozmiary i musi zgadzac sie
 * z wersja SVG. Wpisany na stale plik dwojkowy rozjedzie sie z nia przy pierwszej
 * poprawce znaku i nikt tego nie zauwazy.
 *
 * Uzycie:  node tools/make-favicon.mjs
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'apps',
  'web',
  'public',
  'favicon.ico',
)

/** Rozmiary w jednym pliku: 16 px do zakladki, 32 px do paska zadan i skrotow. */
const SIZES = [16, 32]

/** Ile probek na piksel w kazdej osi - wygladza krawedzie okregow i zaokraglen. */
const SUPERSAMPLE = 4

// --- ksztalty w ukladzie 32 x 32, dokladnie jak w favicon.svg ---------------

const GREEN = [0x1f, 0x6f, 0x43]
const BORDER = [0x0d, 0x3b, 0x25]
const GOLD = [0xd9, 0xa4, 0x41]
const BODY = [0x17, 0x17, 0x1a]
const NOTCH = [0x2e, 0x2e, 0x33]
const LED = [0xff, 0x3b, 0x30]

function inRoundedRect(x, y, left, top, width, height, radius) {
  const right = left + width
  const bottom = top + height
  if (x < left || x > right || y < top || y > bottom) return false
  const cornerX = x < left + radius ? left + radius : x > right - radius ? right - radius : x
  const cornerY = y < top + radius ? top + radius : y > bottom - radius ? bottom - radius : y
  if (cornerX === x || cornerY === y) return true
  const dx = x - cornerX
  const dy = y - cornerY
  return dx * dx + dy * dy <= radius * radius
}

function inCircle(x, y, centerX, centerY, radius) {
  const dx = x - centerX
  const dy = y - centerY
  return dx * dx + dy * dy <= radius * radius
}

const PINS = [10.5, 14.5, 18.5]
const LEDS = [9.5, 16, 22.5]

/** Kolor punktu rysunku albo `null`, gdy punkt jest poza ikona. */
function colorAt(x, y) {
  if (!inRoundedRect(x, y, 0, 0, 32, 32, 6)) return null

  for (const cx of LEDS) {
    if (inCircle(x, y, cx, 26.5, 2.1)) return LED
  }

  if (inCircle(x, y, 16, 9.2, 1.7)) return NOTCH
  if (inRoundedRect(x, y, 8, 7, 16, 15, 1.2)) return BODY

  for (const top of PINS) {
    if (inRoundedRect(x, y, 4.5, top, 3.5, 2, 0.5)) return GOLD
    if (inRoundedRect(x, y, 24, top, 3.5, 2, 0.5)) return GOLD
  }

  // Obwodka: pas o szerokosci 1,5 przy krawedzi laminatu.
  if (!inRoundedRect(x, y, 1.5, 1.5, 29, 29, 4.7)) return BORDER
  return GREEN
}

/** Piksele ikony w postaci BGRA, wierszami od dolu - tak wymaga format BMP. */
function renderIcon(size) {
  const scale = 32 / size
  const step = 1 / SUPERSAMPLE
  const pixels = Buffer.alloc(size * size * 4)

  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      let red = 0
      let green = 0
      let blue = 0
      let covered = 0
      let samples = 0

      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const x = (column + (sx + 0.5) * step) * scale
          const y = (row + (sy + 0.5) * step) * scale
          samples++
          const color = colorAt(x, y)
          if (!color) continue
          covered++
          red += color[0]
          green += color[1]
          blue += color[2]
        }
      }

      // Wiersze w BMP ida od dolu do gory.
      const offset = ((size - 1 - row) * size + column) * 4
      if (covered === 0) continue
      pixels[offset] = Math.round(blue / covered)
      pixels[offset + 1] = Math.round(green / covered)
      pixels[offset + 2] = Math.round(red / covered)
      pixels[offset + 3] = Math.round((covered / samples) * 255)
    }
  }
  return pixels
}

/** Jeden obrazek w formacie BMP: naglowek + piksele + pusta maska przezroczystosci. */
function bmpImage(size, pixels) {
  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0) // rozmiar naglowka
  header.writeInt32LE(size, 4)
  header.writeInt32LE(size * 2, 8) // wysokosc liczy sie podwojnie: obraz + maska
  header.writeUInt16LE(1, 12) // liczba warstw
  header.writeUInt16LE(32, 14) // bitow na piksel
  header.writeUInt32LE(0, 16) // bez kompresji

  // Maska AND jest nieuzywana przy 32 bitach (przezroczystosc niesie kanal alfa),
  // ale format jej wymaga: 1 bit na piksel, wiersze dopelniane do 4 bajtow.
  const maskRow = Math.ceil(size / 32) * 4
  const mask = Buffer.alloc(maskRow * size)

  header.writeUInt32LE(pixels.length + mask.length, 20)
  return Buffer.concat([header, pixels, mask])
}

const images = SIZES.map((size) => ({ size, data: bmpImage(size, renderIcon(size)) }))

const directory = Buffer.alloc(6 + images.length * 16)
directory.writeUInt16LE(0, 0)
directory.writeUInt16LE(1, 2) // typ: ikona
directory.writeUInt16LE(images.length, 4)

let offset = directory.length
images.forEach((image, index) => {
  const entry = 6 + index * 16
  directory.writeUInt8(image.size === 256 ? 0 : image.size, entry)
  directory.writeUInt8(image.size === 256 ? 0 : image.size, entry + 1)
  directory.writeUInt8(0, entry + 2) // paleta: brak
  directory.writeUInt8(0, entry + 3)
  directory.writeUInt16LE(1, entry + 4)
  directory.writeUInt16LE(32, entry + 6)
  directory.writeUInt32LE(image.data.length, entry + 8)
  directory.writeUInt32LE(offset, entry + 12)
  offset += image.data.length
})

writeFileSync(OUT, Buffer.concat([directory, ...images.map((image) => image.data)]))
console.log(`Zapisano ${OUT} (${SIZES.join(' + ')} px, ${offset} B)`)
