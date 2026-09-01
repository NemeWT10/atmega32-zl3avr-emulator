/**
 * Zlacza szpilkowe plytki ZL3AVR.
 *
 * Kluczowa wlasciwosc tej plytki: peryferia NIE SA na stale polaczone z portami
 * mikrokontrolera. Wszystko jest wyprowadzone na goldpiny, a student sam prowadzi
 * przewody - tasme 8-zylowa albo pojedyncze zyly. Dlatego zlacza sa tu pelnoprawnym
 * bytem modelu, a nie ozdoba interfejsu.
 *
 * Zrodlo: docs/plytka_zl3avr.md (opracowane ze schematu w docs/plytka-img/).
 */

export type ConnectorId =
  | 'JP16' | 'JP17' | 'JP18' | 'JP19'
  | 'JP22' | 'JP23' | 'JP24' | 'JP28' | 'JP29' | 'JP27'
  | 'JP9'

export interface ConnectorPin {
  /** Etykieta na plytce, np. "PD0", "LED7", "W1", "seg a". */
  label: string
  /** Krotki opis do dymka w interfejsie. */
  hint?: string
}

export interface Connector {
  id: ConnectorId
  /** Napis przy zlaczu na plytce. */
  name: string
  pins: ConnectorPin[]
}

/** Identyfikator pojedynczego pinu: zlacze + numer w zlaczu (liczony od zera). */
export interface PinRef {
  connector: ConnectorId
  index: number
}

export function pinKey(pin: PinRef): string {
  return `${pin.connector}:${pin.index}`
}

export function parsePinKey(key: string): PinRef {
  const [connector, index] = key.split(':')
  return { connector: connector as ConnectorId, index: Number(index) }
}

function portPins(port: string, extras: Record<number, string>): ConnectorPin[] {
  return Array.from({ length: 8 }, (_, i) => ({
    label: `P${port}${i}`,
    hint: extras[i],
  }))
}

export const CONNECTORS: Record<ConnectorId, Connector> = {
  JP17: {
    id: 'JP17',
    name: 'Port A',
    pins: portPins('A', {
      0: 'ADC0', 1: 'ADC1', 2: 'ADC2', 3: 'ADC3',
      4: 'ADC4', 5: 'ADC5', 6: 'ADC6', 7: 'ADC7',
    }),
  },
  JP16: {
    id: 'JP16',
    name: 'Port B',
    pins: portPins('B', {
      0: 'XCK/T0', 1: 'T1', 2: 'INT2/AIN0', 3: 'OC0/AIN1',
      4: 'SS', 5: 'MOSI', 6: 'MISO', 7: 'SCK',
    }),
  },
  JP18: {
    id: 'JP18',
    name: 'Port C',
    pins: portPins('C', {
      0: 'SCL', 1: 'SDA', 2: 'TCK (JTAG)', 3: 'TMS (JTAG)',
      4: 'TDO (JTAG)', 5: 'TDI (JTAG)', 6: 'TOSC1', 7: 'TOSC2',
    }),
  },
  JP19: {
    id: 'JP19',
    name: 'Port D',
    pins: portPins('D', {
      0: 'RXD', 1: 'TXD', 2: 'INT0', 3: 'INT1',
      4: 'OC1B', 5: 'OC1A', 6: 'ICP1', 7: 'OC2',
    }),
  },

  JP22: {
    id: 'JP22',
    name: 'Diody LED',
    // Anody na zlaczu, katody przez rezystory 680 om do masy:
    // stan WYSOKI zapala diode.
    pins: Array.from({ length: 8 }, (_, i) => ({
      label: `LED${i}`,
      hint: 'stan wysoki zapala diode',
    })),
  },

  JP23: {
    id: 'JP23',
    name: 'Klawiatura 4x4',
    pins: [
      { label: 'W1', hint: 'wiersz 1' },
      { label: 'W2', hint: 'wiersz 2' },
      { label: 'W3', hint: 'wiersz 3' },
      { label: 'W4', hint: 'wiersz 4' },
      { label: 'K1', hint: 'kolumna 1' },
      { label: 'K2', hint: 'kolumna 2' },
      { label: 'K3', hint: 'kolumna 3' },
      { label: 'K4', hint: 'kolumna 4' },
    ],
  },

  JP24: {
    id: 'JP24',
    name: 'Cyfra (segmenty)',
    // Wspolna anoda: stan NISKI zapala segment.
    pins: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'].map((s) => ({
      label: `seg ${s}`,
      hint: 'stan niski zapala segment',
    })),
  },

  JP28: {
    id: 'JP28',
    name: 'Kolumna (wybor cyfry)',
    // Tranzystory PNP na wspolnych anodach: stan NISKI uaktywnia cyfre.
    pins: Array.from({ length: 4 }, (_, i) => ({
      label: `C${i + 1}`,
      hint: 'stan niski uaktywnia cyfre',
    })),
  },

  JP29: {
    id: 'JP29',
    name: 'LCD 4bit',
    pins: [
      { label: 'RS', hint: '0 = instrukcja, 1 = dane' },
      { label: 'E', hint: 'zatrzask danych na zboczu opadajacym' },
      { label: 'D4' },
      { label: 'D5' },
      { label: 'D6' },
      { label: 'D7' },
    ],
  },

  JP27: {
    id: 'JP27',
    name: 'LCD (pelne)',
    pins: [
      { label: 'GND' },
      { label: 'VDD' },
      { label: 'VEE', hint: 'kontrast, potencjometr PR1' },
      { label: 'RS' },
      { label: 'R/W', hint: 'zwarte do masy na plytce - tylko zapis' },
      { label: 'E' },
      { label: 'D0' }, { label: 'D1' }, { label: 'D2' }, { label: 'D3' },
      { label: 'D4' }, { label: 'D5' }, { label: 'D6' }, { label: 'D7' },
      // Modul z podswietleniem ma dwa piny wiecej - zasilanie samego podswietlenia.
      { label: 'A', hint: 'anoda podswietlenia' },
      { label: 'K', hint: 'katoda podswietlenia' },
    ],
  },

  JP9: {
    id: 'JP9',
    name: 'Zasilanie',
    pins: [{ label: 'GND' }, { label: '+5V' }],
  },
}

/** Zlacza portow mikrokontrolera - z nich prowadzi sie przewody do peryferiow. */
export const PORT_CONNECTORS: Record<ConnectorId & ('JP16' | 'JP17' | 'JP18' | 'JP19'), 'A' | 'B' | 'C' | 'D'> = {
  JP17: 'A',
  JP16: 'B',
  JP18: 'C',
  JP19: 'D',
}

/** Odwrotnie: port MCU -> zlacze na plytce. */
export const CONNECTOR_FOR_PORT: Record<'A' | 'B' | 'C' | 'D', ConnectorId> = {
  A: 'JP17',
  B: 'JP16',
  C: 'JP18',
  D: 'JP19',
}

export function isPortConnector(id: ConnectorId): id is 'JP16' | 'JP17' | 'JP18' | 'JP19' {
  return id === 'JP16' || id === 'JP17' || id === 'JP18' || id === 'JP19'
}
