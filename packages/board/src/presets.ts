/**
 * Gotowe zestawy polaczen dla poszczegolnych cwiczen.
 *
 * Na laboratorium student prowadzi te przewody recznie i to jest czesc zadania -
 * presety sluza do szybkiego startu, porownania "jak powinno byc" oraz jako
 * konfiguracja golden testow.
 *
 * Zrodlo: tabela "Kanoniczne polaczenia" w docs/plytka_zl3avr.md
 * skonfrontowana z kodami z ZASOBY/.
 */

import type { Board } from './board'
import type { ConnectorId } from './connectors'
import { FACTORY_FUSES } from '@zl3avr/avr-core'

export interface WiringPreset {
  id: string
  label: string
  description: string
  apply: (board: Board) => void
  /** Fuse bity wymagane, zeby cwiczenie zadzialalo (jesli inne niz fabryczne). */
  fuses?: { low: number; high: number }
}

/** Wewnetrzny RC 4 MHz - ustawienie z cwiczen z USART. */
const FUSES_4MHZ = { low: (FACTORY_FUSES.low & 0xf0) | 0b0011, high: FACTORY_FUSES.high }

/** Wewnetrzny RC 8 MHz. */
const FUSES_8MHZ = { low: (FACTORY_FUSES.low & 0xf0) | 0b0100, high: FACTORY_FUSES.high }

function wireRange(
  board: Board,
  from: ConnectorId,
  fromStart: number,
  to: ConnectorId,
  toStart: number,
  count: number,
): void {
  const colors = ['#8b5a2b', '#e11d48', '#f97316', '#eab308', '#22c55e', '#0ea5e9', '#8b5cf6', '#94a3b8']
  const ribbon = `${from}-${to}-${fromStart}`
  for (let i = 0; i < count; i++) {
    board.connect(
      { connector: from, index: fromStart + i },
      { connector: to, index: toStart + i },
      colors[i % colors.length],
      ribbon,
    )
  }
}

/**
 * Laczy wyswietlacz w trybie 4-bitowym z portem B.
 *
 * JP29 ma piny w kolejnosci: 0=RS, 1=E, 2..5 = D4..D7. Sterowniki roznych
 * cwiczen sadzaja te linie na roznych bitach portu, wiec podajemy je jawnie.
 */
function wireLcd4bit(
  board: Board,
  rsBit: number,
  enBit: number,
  firstDataBit: number,
): void {
  board.connect({ connector: 'JP16', index: rsBit }, { connector: 'JP29', index: 0 }, '#e11d48', 'lcd')
  board.connect({ connector: 'JP16', index: enBit }, { connector: 'JP29', index: 1 }, '#f97316', 'lcd')
  for (let i = 0; i < 4; i++) {
    board.connect(
      { connector: 'JP16', index: firstDataBit + i },
      { connector: 'JP29', index: 2 + i },
      ['#eab308', '#22c55e', '#0ea5e9', '#8b5cf6'][i],
      'lcd',
    )
  }
}

export const PRESETS: WiringPreset[] = [
  {
    id: 'start',
    label: 'Pusty projekt - diody na porcie A',
    description:
      'Port A na linijke diod, w kolejnosci prostej: PA0 na LED0. Punkt wyjscia do wlasnego programu.',
    apply: (board) => {
      board.connectRibbon('JP17', 'JP22')
    },
  },
  {
    id: 'l1',
    label: 'L1 - GPIO i diody LED',
    description: 'Port D na linijke diod, w odwrotnej kolejnosci: PD0 na LED7.',
    apply: (board) => {
      board.connectRibbon('JP19', 'JP22', { reverse: true })
    },
  },
  {
    id: 'l2',
    label: 'L2 - klawiatura matrycowa',
    description: 'Port D na diody, port A na klawiature 4x4 (PA0..3 wiersze, PA4..7 kolumny).',
    apply: (board) => {
      board.connectRibbon('JP19', 'JP22', { reverse: true })
      board.connectRibbon('JP17', 'JP23')
    },
  },
  {
    id: 'l3',
    label: 'L3 - wyswietlacz 7-segmentowy',
    description: 'Port A (mlodsze 4 bity) na wybor cyfry, port B na segmenty, PD0..PD2 na przyciski.',
    apply: (board) => {
      wireRange(board, 'JP17', 0, 'JP28', 0, 4)
      board.connectRibbon('JP16', 'JP24')
      wireRange(board, 'JP19', 0, 'JP23', 0, 3)
      board.setJumper('JP3', true)
    },
  },
  {
    id: 'l4',
    label: 'L4 - timery',
    description: 'Jak L1: port D na linijke diod.',
    apply: (board) => {
      board.connectRibbon('JP19', 'JP22', { reverse: true })
    },
  },
  {
    id: 'l5',
    label: 'L5 - przerwania',
    description:
      'Port C na diody (uwaga na fuse JTAGEN!), port D na wybor cyfry, port B na segmenty, port A na mala klawiature.',
    apply: (board) => {
      board.connectRibbon('JP18', 'JP22')
      wireRange(board, 'JP19', 0, 'JP28', 0, 4)
      board.connectRibbon('JP16', 'JP24')
      wireRange(board, 'JP17', 0, 'JP23', 0, 4)
      board.setJumper('JP3', true)
    },
  },
  {
    id: 'l6',
    label: 'L6 - USART',
    description: 'Port A na diody. RS232 idzie sciezkami na plytce - potrzebna zworka JP4.',
    apply: (board) => {
      board.connectRibbon('JP17', 'JP22')
      board.setJumper('JP4', true)
    },
    fuses: FUSES_4MHZ,
  },
  {
    id: 'l7',
    label: 'L7 - ramki binarne i Python',
    description: 'Port A na diody, port B na klawiature 4x4, zworka JP4.',
    apply: (board) => {
      board.connectRibbon('JP17', 'JP22')
      board.connectRibbon('JP16', 'JP23')
      board.setJumper('JP4', true)
    },
    fuses: FUSES_4MHZ,
  },
  {
    id: 'l8',
    label: 'L8-9 - wyswietlacz LCD',
    description: 'Port B na LCD w trybie 4-bitowym (E=PB0, RS=PB1, D4..D7=PB4..PB7), port A na klawiature.',
    apply: (board) => {
      wireLcd4bit(board, 1, 0, 4) // RS=PB1, E=PB0, D4..D7=PB4..PB7
      board.connectRibbon('JP17', 'JP23')
    },
    fuses: FUSES_4MHZ,
  },

  {
    id: 'sw1',
    label: 'SW1 - klawiatura z wyborem portu',
    description: 'Port A na klawiature 4x4, port B na linijke diod (numer klawisza dwojkowo).',
    apply: (board) => {
      board.connectRibbon('JP17', 'JP23')
      board.connectRibbon('JP16', 'JP22')
    },
  },
  {
    id: 'sw2',
    label: 'SW2 - LCD sterowany wskaznikami',
    description: 'Port B na LCD (RS=PB0, E=PB1, D4..D7=PB4..PB7), port A na klawiature.',
    apply: (board) => {
      wireLcd4bit(board, 0, 1, 4)
      board.connectRibbon('JP17', 'JP23')
    },
    fuses: FUSES_8MHZ,
  },
  {
    id: 'sw3',
    label: 'SW3 - LCD na innych liniach portu',
    description: 'Port B na LCD, ale dane na PB2..PB5 zamiast PB4..PB7 (RS=PB0, E=PB1).',
    apply: (board) => {
      wireLcd4bit(board, 0, 1, 2)
    },
  },
  {
    id: 'sw4',
    label: 'SW4 - USART i licznik naraz',
    description: 'Port A na diody. Transmisja idzie sciezkami plytki - potrzebna zworka JP4.',
    apply: (board) => {
      board.connectRibbon('JP17', 'JP22')
      board.setJumper('JP4', true)
    },
    fuses: FUSES_4MHZ,
  },
]

export function findPreset(id: string): WiringPreset | undefined {
  return PRESETS.find((preset) => preset.id === id)
}

/** Czysci plytke i nakłada wybrany preset (razem z fuse bitami, jesli sa wymagane). */
export function applyPreset(board: Board, id: string): WiringPreset | undefined {
  const preset = findPreset(id)
  if (!preset) return undefined
  board.clearWires()
  board.setJumper('JP3', false)
  board.setJumper('JP4', false)
  preset.apply(board)
  if (preset.fuses) board.mcu.setFuses(preset.fuses)
  return preset
}
