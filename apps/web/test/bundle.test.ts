import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Atmega32 } from '@zl3avr/avr-core'
import { Board, type PinRef } from '@zl3avr/board'
import {
  MAX_BUNDLE,
  bundleColours,
  bundleTargets,
  describeSelection,
} from '../src/board-view/bundle'

/**
 * Wiazka przewodow: zaznaczenie kilku szpilek naraz i wpiecie ich jednym
 * kliknieciem - pierwsza zyla we wskazana linie, kazda nastepna o linie nizej.
 * Testy pilnuja logiki celow (to ona rozstrzyga, czy wiazka sie zmiesci)
 * oraz tego, ze polozona wiazka naprawde przewodzi w symulatorze.
 */

const pin = (connector: PinRef['connector'], index: number): PinRef => ({ connector, index })

describe('cele wiazki', () => {
  it('ida od wskazanej szpilki w dol, po kolei', () => {
    expect(bundleTargets(3, pin('JP22', 2))).toEqual([
      pin('JP22', 2),
      pin('JP22', 3),
      pin('JP22', 4),
    ])
  })

  it('odmawiaja, gdy wiazka wystaje poza zlacze', () => {
    expect(bundleTargets(3, pin('JP22', 6))).toBeNull()
    expect(bundleTargets(9, pin('JP22', 0))).toBeNull()
  })

  it('pojedynczy przewod to wiazka o jednej zyle - te same reguly', () => {
    expect(bundleTargets(1, pin('JP23', 7))).toEqual([pin('JP23', 7)])
    expect(bundleTargets(1, pin('JP23', 8))).toBeNull()
  })

  it('najwieksza dopuszczalna wiazka odpowiada najwiekszemu zlaczu', () => {
    expect(MAX_BUNDLE).toBe(8)
    expect(bundleTargets(MAX_BUNDLE, pin('JP17', 0))).toHaveLength(8)
  })
})

describe('opis zaznaczenia w pasku nad plytka', () => {
  it('ciagly zakres jednego zlacza opisuje sie zakresem', () => {
    expect(describeSelection([pin('JP17', 0), pin('JP17', 1), pin('JP17', 2)])).toBe(
      'Port A · PA0–PA2',
    )
  })

  it('jedna szpilka - jak pojedynczy przewod', () => {
    expect(describeSelection([pin('JP19', 5)])).toBe('Port D · PD5')
  })

  it('zaznaczenie z dziurami podaje liczbe szpilek, z poprawna odmiana', () => {
    expect(describeSelection([pin('JP17', 0), pin('JP17', 2)])).toBe('2 szpilki złącza Port A')
    expect(
      describeSelection([0, 1, 2, 3, 5].map((index) => pin('JP17', index))),
    ).toBe('5 szpilek złącza Port A')
  })

  it('kazda zyla wiazki dostaje kolor', () => {
    expect(bundleColours(8)).toHaveLength(8)
    expect(new Set(bundleColours(8)).size).toBe(8)
  })
})

/**
 * Program startowy (DDRA = 0xFF, PORTA = 0xFF) + wiazka czterech zyl polozona
 * dokladnie tymi wywolaniami, ktore wykonuje klikniecie konczace zaznaczenie.
 */
const HEX = readFileSync(
  fileURLToPath(new URL('../src/examples/start/start_leds.hex', import.meta.url)),
  'utf8',
)

describe('wiazka polozona z zaznaczenia dziala w symulatorze', () => {
  it('PA0-PA3 wpiete od LED4 w dol zapalaja diody 4-7 i zadnej innej', () => {
    const mcu = new Atmega32()
    const board = new Board(mcu)
    const sources = [0, 1, 2, 3].map((index) => pin('JP17', index))
    const targets = bundleTargets(sources.length, pin('JP22', 4))!
    const colours = bundleColours(sources.length)
    sources.forEach((source, i) => board.connect(source, targets[i], colours[i], 'u0_test'))

    mcu.loadHex(HEX)
    board.setPower(true)
    mcu.runSeconds(0.01)

    expect(board.getState().leds.map((led) => led.on)).toEqual([
      false, false, false, false, true, true, true, true,
    ])
  })
})
