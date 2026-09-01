/**
 * Parser formatu Intel HEX - tego samego, ktory produkuje avr-gcc/avr-objcopy
 * i ktory wgrywa sie programatorem.
 */

export interface HexParseResult {
  /** Bajty pamieci FLASH w kolejnosci adresow (little-endian slowa AVR). */
  bytes: Uint8Array
  /** Najwyzszy zapisany adres + 1 - czyli rozmiar wgrywanego programu. */
  size: number
}

export class HexParseError extends Error {
  constructor(message: string, readonly line: number) {
    super(`Błąd pliku HEX w linii ${line}: ${message}`)
    this.name = 'HexParseError'
  }
}

/**
 * Parsuje plik Intel HEX do ciaglego obrazu pamieci.
 *
 * Obslugiwane typy rekordow: 00 (dane), 01 (koniec), 02/04 (rozszerzenie adresu),
 * 03/05 (adres startowy - ignorowane, AVR i tak startuje od 0).
 */
export function parseIntelHex(text: string, maxBytes = 32 * 1024): HexParseResult {
  const buffer = new Uint8Array(maxBytes)
  let highest = 0
  let addressBase = 0

  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line === '') continue
    if (!line.startsWith(':')) {
      // Najczestsza przyczyna: wybrano plik z kodem zrodlowym albo out.elf
      // zamiast wyniku konsolidacji w formacie Intel HEX.
      throw new HexParseError(
        'rekord nie zaczyna się od „:”. To chyba nie jest plik Intel HEX — ' +
          'sprawdź, czy nie wybrano przez pomyłkę pliku .c albo .elf',
        i + 1,
      )
    }

    const raw = line.slice(1)
    if (raw.length % 2 !== 0) throw new HexParseError('nieparzysta liczba znaków', i + 1)

    const values: number[] = []
    for (let j = 0; j < raw.length; j += 2) {
      const byte = Number.parseInt(raw.slice(j, j + 2), 16)
      if (Number.isNaN(byte)) throw new HexParseError('znak spoza zakresu szesnastkowego', i + 1)
      values.push(byte)
    }

    const length = values[0]
    if (values.length !== length + 5) throw new HexParseError('niezgodna długość rekordu', i + 1)

    const checksum = values.reduce((sum, byte) => (sum + byte) & 0xff, 0)
    if (checksum !== 0) throw new HexParseError('błędna suma kontrolna — plik jest uszkodzony', i + 1)

    const offset = (values[1] << 8) | values[2]
    const type = values[3]

    switch (type) {
      case 0x00: {
        const address = addressBase + offset
        if (address + length > maxBytes) {
          throw new HexParseError(
            `adres 0x${address.toString(16)} wykracza poza ${maxBytes / 1024} kB pamięci programu ` +
              'ATmega32 — ten plik zbudowano dla innego układu',
            i + 1,
          )
        }
        for (let j = 0; j < length; j++) buffer[address + j] = values[4 + j]
        highest = Math.max(highest, address + length)
        break
      }
      case 0x01:
        // Pusty plik HEX „wgralby sie” bez bledu, a plytka nie robilaby nic -
        // i wygladaloby to na usterke emulatora.
        if (highest === 0) throw new HexParseError('plik nie zawiera żadnego programu', i + 1)
        return { bytes: buffer.subarray(0, highest), size: highest }
      case 0x02:
        addressBase = ((values[4] << 8) | values[5]) << 4
        break
      case 0x04:
        addressBase = ((values[4] << 8) | values[5]) << 16
        break
      case 0x03:
      case 0x05:
        break
      default:
        throw new HexParseError(`nieznany typ rekordu 0x${type.toString(16)}`, i + 1)
    }
  }

  if (highest === 0) throw new HexParseError('plik nie zawiera żadnego programu', lines.length)
  return { bytes: buffer.subarray(0, highest), size: highest }
}

/** Zamienia obraz bajtowy na tablice slow 16-bitowych (AVR jest little-endian). */
export function bytesToWords(bytes: Uint8Array, words: Uint16Array): void {
  words.fill(0)
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    words[i >> 1] = bytes[i] | (bytes[i + 1] << 8)
  }
  if (bytes.length % 2 === 1) {
    words[(bytes.length - 1) >> 1] = bytes[bytes.length - 1]
  }
}
