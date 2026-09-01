/**
 * Rysunek plytki musi byc czytelny: kazdy element osobno, nic poza laminatem.
 * Bez tego testu nie da sie upilnowac kilkudziesieciu recznie ustawionych
 * wspolrzednych, a nachodzace elementy uniemozliwiaja wskazanie ich mysza.
 */

import { describe, expect, it } from 'vitest'
import { collectBoxes, findOutsideBoard, findOverlaps } from '../src/board-view/bounds'

describe('geometria plytki', () => {
  it('zaden element nie nachodzi na inny', () => {
    const overlaps = findOverlaps()
    const report = overlaps.map((o) => `${o.a} × ${o.b} (${o.area} jednostek)`).join('\n')
    expect(report).toBe('')
  })

  it('wszystkie elementy miesza sie na laminacie', () => {
    expect(findOutsideBoard().join('\n')).toBe('')
  })

  it('elementy maja sensowne rozmiary', () => {
    for (const box of collectBoxes()) {
      expect(box.width, box.id).toBeGreaterThan(0)
      expect(box.height, box.id).toBeGreaterThan(0)
    }
  })
})
