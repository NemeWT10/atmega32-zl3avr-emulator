import { describe, expect, it } from 'vitest'
import { Rope, type Point } from '../src/board-view/rope'

/**
 * Zachowanie zyly przy prowadzeniu przewodu.
 *
 * Trzy rzeczy, ktore byly widoczne jako usterka i ktore ten test pilnuje:
 * lancuch ma ZWISAC zaraz po oderwaniu od pinu (a nie rozplatywac sie z wezla),
 * ma trzymac sie kursora dokladnie, i ma dac sie przekazac gotowemu przewodowi
 * bez przeskoku ksztaltu.
 */

/** Najwieksze odchylenie lancucha od linii prostej miedzy koncami. */
function sag(rope: Rope): number {
  const first = rope.nodes[0]
  const last = rope.nodes[rope.nodes.length - 1]
  const dx = last.x - first.x
  const dy = last.y - first.y
  const lengthSquared = dx * dx + dy * dy || 1
  let worst = 0
  for (const node of rope.nodes) {
    const t = ((node.x - first.x) * dx + (node.y - first.y) * dy) / lengthSquared
    const nearestX = first.x + dx * t
    const nearestY = first.y + dy * t
    worst = Math.max(worst, Math.hypot(node.x - nearestX, node.y - nearestY))
  }
  return worst
}

function run(rope: Rope, start: Point, end: Point, frames: number): void {
  for (let i = 0; i < frames; i++) rope.step(1 / 60, start, end)
}

describe('zyla trzymana w reku', () => {
  it('po oderwaniu od pinu od razu zwisa, zamiast tkwic w jednym punkcie', () => {
    const pin = { x: 100, y: 100 }
    const rope = new Rope(pin, pin)
    // Wszystkie punkty startuja na pinie - lancuch jest zwiniety.
    expect(sag(rope)).toBeLessThan(30)

    const cursor = { x: 500, y: 200 }
    rope.setLength(Math.hypot(400, 100) * 1.18)
    rope.reseed(pin, cursor)

    expect(sag(rope)).toBeGreaterThan(20)
    expect(rope.nodes[rope.nodes.length - 1].x).toBeCloseTo(cursor.x, 6)
    expect(rope.nodes[rope.nodes.length - 1].y).toBeCloseTo(cursor.y, 6)
  })

  it('koniec trzyma sie kursora co do jednostki', () => {
    const pin = { x: 100, y: 100 }
    const rope = new Rope(pin, pin)
    for (const cursor of [
      { x: 200, y: 150 },
      { x: 420, y: 320 },
      { x: 260, y: 640 },
    ]) {
      rope.setLength(Math.hypot(cursor.x - pin.x, cursor.y - pin.y) * 1.18)
      run(rope, pin, cursor, 10)
      const last = rope.nodes[rope.nodes.length - 1]
      expect(last.x).toBeCloseTo(cursor.x, 6)
      expect(last.y).toBeCloseTo(cursor.y, 6)
    }
  })

  it('nie napina sie w prosta linie - zapas dlugosci zostaje zwisem', () => {
    const start = { x: 100, y: 100 }
    const end = { x: 600, y: 140 }
    const rope = new Rope(start, end)
    run(rope, start, end, 120)
    expect(sag(rope)).toBeGreaterThan(30)
  })
})

describe('przekazanie ksztaltu gotowemu przewodowi', () => {
  const start = { x: 120, y: 200 }
  const end = { x: 620, y: 260 }

  it('kopiuje polozenia punktow jeden do jednego', () => {
    const preview = new Rope(start, end)
    run(preview, start, end, 40)

    const wire = new Rope(start, end)
    expect(wire.copyShapeFrom(preview)).toBe(true)
    for (let i = 0; i < wire.nodes.length; i++) {
      expect(wire.nodes[i].x).toBeCloseTo(preview.nodes[i].x, 9)
      expect(wire.nodes[i].y).toBeCloseTo(preview.nodes[i].y, 9)
    }
  })

  it('odmawia, gdy lancuchy maja rozna liczbe punktow', () => {
    const preview = new Rope(start, end, 8)
    const wire = new Rope(start, end, 18)
    expect(wire.copyShapeFrom(preview)).toBe(false)
  })

  it('przejety lancuch nie jest uspiony - dokonczy opadanie', () => {
    const preview = new Rope(start, end)
    const wire = new Rope(start, end)
    wire.settle(start, end)
    expect(wire.sleeping).toBe(true)
    wire.copyShapeFrom(preview)
    expect(wire.sleeping).toBe(false)
  })
})
