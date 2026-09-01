import { describe, expect, it } from 'vitest'
import { Atmega32, FACTORY_FUSES } from '@zl3avr/avr-core'
import { Board, applyPreset } from '@zl3avr/board'
import { EXAMPLES } from '../src/examples'
import {
  buildPayload,
  decodePayload,
  encodePayload,
  payloadFromHash,
  payloadToState,
  type WorkspaceState,
} from '../src/workspace'

/**
 * Link ma niesc caly stan pracy i BYC KROTKI.
 *
 * Krotkosc nie jest tu kosmetyka. Adres wkleja sie do wiadomosci, a te bywaja
 * obcinane; poza tym link dlugi na trzy tysiace znakow wyglada na awarie i nikt
 * go nie wysyla. Dlatego nietkniete gotowe cwiczenie zapisujemy identyfikatorem,
 * a nie trescia wszystkich plikow.
 */

function scratch(): Board {
  return new Board(new Atmega32())
}

function stateOf(overrides: Partial<WorkspaceState> = {}): WorkspaceState {
  return {
    files: [{ path: 'main.c', content: 'int main(void){return 0;}' }],
    wires: [],
    jumpers: { JP3: false, JP4: false, JP25: false },
    fuses: { ...FACTORY_FUSES },
    hex: null,
    hexName: null,
    running: false,
    powered: true,
    ...overrides,
  }
}

/** Stan odpowiadajacy nietknietemu przykladowi razem z jego zestawem polaczen. */
function exampleState(id: string): WorkspaceState {
  const example = EXAMPLES.find((item) => item.id === id)!
  const board = scratch()
  applyPreset(board, example.preset)
  return stateOf({
    files: example.files.map((file) => ({ ...file })),
    wires: board.wires.map((wire) => ({ ...wire })),
    jumpers: { ...board.jumpers },
    fuses: { ...board.mcu.fuses },
    hex: example.hex,
    hexName: example.label,
  })
}

describe('link ze stanem pracy', () => {
  it('nietkniety przyklad zapisuje sie samym identyfikatorem', async () => {
    for (const example of EXAMPLES) {
      const encoded = await encodePayload(
        buildPayload(exampleState(example.id), scratch()),
        scratch(),
      )
      expect(encoded).toBe(example.id)
    }
  })

  it('krotki link odtwarza kod, przewody, zworki i fuse bity', async () => {
    // L3 jest najostrzejszym sprawdzianem: jego zestaw zamyka zworke JP3.
    const before = exampleState('lab3')
    const payload = await decodePayload('lab3')
    expect(payload).not.toBeNull()
    const after = payloadToState(payload!, scratch())

    expect(after.files).toEqual(before.files)
    expect(after.wires.length).toBe(before.wires.length)
    expect(after.jumpers).toEqual(before.jumpers)
    expect(after.fuses).toEqual(before.fuses)
    expect(after.hex).toBe(before.hex)
  })

  it('wlasny kod i wlasne przewody przechodza tam i z powrotem', async () => {
    const state = stateOf({
      files: [
        { path: 'main.c', content: '#include <avr/io.h>\nint main(void){ PORTB = 1; }' },
        { path: 'moj.h', content: '#define X 1' },
      ],
      wires: [
        {
          id: 'w1',
          a: { connector: 'JP16', index: 0 },
          b: { connector: 'JP22', index: 7 },
          color: '#e11d48',
        },
        {
          id: 'w2',
          a: { connector: 'JP16', index: 1 },
          b: { connector: 'JP22', index: 6 },
          color: '#e11d48',
        },
      ],
      jumpers: { JP3: true, JP4: true, JP25: false },
      fuses: { low: 0xe4, high: 0xd9 },
    })

    const encoded = await encodePayload(buildPayload(state, scratch()), scratch())
    expect(encoded.startsWith('~')).toBe(true)

    const back = payloadToState((await decodePayload(encoded))!, scratch())
    expect(back.files).toEqual(state.files)
    expect(back.jumpers).toEqual(state.jumpers)
    expect(back.fuses).toEqual(state.fuses)
    expect(back.wires.map((wire) => [wire.a, wire.b, wire.color])).toEqual(
      state.wires.map((wire) => [wire.a, wire.b, wire.color]),
    )
  })

  it('zmieniony kod przy gotowych przewodach nie ciagnie za soba pliku HEX', async () => {
    const state = exampleState('lab1')
    state.files = [{ path: 'main.c', content: '// moja wersja\nint main(void){}' }]
    const payload = buildPayload(state, scratch())
    expect(payload.h).toBeUndefined()
    // Zestaw polaczen zapisany identyfikatorem, nie lista dwudziestu kilku zyl.
    expect(payload.w).toBe('l1')
  })

  it('goly plik .hex bez zrodel jedzie w linku, bo nie ma z czego go odtworzyc', async () => {
    const payload = buildPayload(
      stateOf({ files: [], hex: ':00000001FF\n', hexName: 'moj.hex' }),
      scratch(),
    )
    expect(payload.h).toBe(':00000001FF\n')
  })

  it('uszkodzony link nie wywraca aplikacji', async () => {
    expect(await decodePayload('~zNIEPOPRAWNE!!')).toBeNull()
    expect(await decodePayload('nie-ma-takiego-przykladu')).toBeNull()
    expect(await decodePayload('')).toBeNull()
  })

  it('czytanie tresci z adresu', () => {
    expect(payloadFromHash('#p=lab1')).toBe('lab1')
    expect(payloadFromHash('#widok=board&p=lab2')).toBe('lab2')
    expect(payloadFromHash('#bez-stanu')).toBeNull()
  })
})
