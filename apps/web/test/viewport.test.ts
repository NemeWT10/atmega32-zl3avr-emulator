import { describe, expect, it } from 'vitest'
import {
  FULL_VIEW,
  MAX_ZOOM,
  MIN_ZOOM,
  centreOn,
  clampView,
  describeZoom,
  focusOn,
  isFullView,
  panBy,
  setZoom,
  zoomAt,
  zoomBy,
  zoomOf,
} from '../src/board-view/viewport'

/**
 * Matematyka przesuwania i powiekszania rysunku plytki.
 *
 * Sprawdzamy ja osobno, bo to ona decyduje, czy narzedzie da sie obslugiwac:
 * zle liczone powiekszenie „ucieka” spod kursora, a brak ograniczen pozwala
 * wypchnac plytke poza ekran i zostac ze sciana tla.
 */

describe('powiekszenie wokol kursora', () => {
  it('zostawia wskazany punkt w tym samym miejscu', () => {
    const point = { x: 700, y: 400 }
    const zoomed = zoomAt(FULL_VIEW, point, 2)

    // Ulamek szerokosci widoku, w ktorym lezy punkt, ma sie nie zmienic.
    const before = (point.x - FULL_VIEW.x) / FULL_VIEW.width
    const after = (point.x - zoomed.x) / zoomed.width
    expect(after).toBeCloseTo(before, 6)

    const beforeY = (point.y - FULL_VIEW.y) / FULL_VIEW.height
    const afterY = (point.y - zoomed.y) / zoomed.height
    expect(afterY).toBeCloseTo(beforeY, 6)
  })

  it('podwojenie daje dwa razy wieksze powiekszenie', () => {
    expect(zoomOf(zoomAt(FULL_VIEW, { x: 700, y: 400 }, 2))).toBeCloseTo(2, 6)
  })

  it('zachowuje proporcje rysunku', () => {
    const zoomed = zoomAt(FULL_VIEW, { x: 300, y: 900 }, 3.3)
    expect(zoomed.width / zoomed.height).toBeCloseTo(FULL_VIEW.width / FULL_VIEW.height, 6)
  })
})

describe('granice powiekszenia', () => {
  it('nie schodzi ponizej widoku calej plytki', () => {
    expect(zoomOf(zoomBy(FULL_VIEW, 0.2))).toBeCloseTo(MIN_ZOOM, 6)
  })

  it('nie przekracza gornej granicy', () => {
    expect(zoomOf(zoomBy(FULL_VIEW, 100))).toBeCloseTo(MAX_ZOOM, 6)
  })

  it('ustawia zadana wartosc', () => {
    expect(zoomOf(setZoom(FULL_VIEW, 2.5))).toBeCloseTo(2.5, 6)
  })

  it('opisuje powiekszenie w procentach', () => {
    expect(describeZoom(FULL_VIEW)).toBe('100%')
    expect(describeZoom(setZoom(FULL_VIEW, 2))).toBe('200%')
  })
})

describe('ograniczenie przesuwania', () => {
  const zoomed = setZoom(FULL_VIEW, 3)

  it('nie pozwala wyjechac poza laminat w lewo i w gore', () => {
    const moved = panBy(zoomed, -10_000, -10_000)
    expect(moved.x).toBeCloseTo(FULL_VIEW.x, 6)
    expect(moved.y).toBeCloseTo(FULL_VIEW.y, 6)
  })

  it('nie pozwala wyjechac poza laminat w prawo i w dol', () => {
    const moved = panBy(zoomed, 10_000, 10_000)
    expect(moved.x + moved.width).toBeCloseTo(FULL_VIEW.x + FULL_VIEW.width, 6)
    expect(moved.y + moved.height).toBeCloseTo(FULL_VIEW.y + FULL_VIEW.height, 6)
  })

  it('przy widoku calej plytki nie da sie niczego przesunac', () => {
    const moved = panBy(FULL_VIEW, 500, 500)
    expect(moved.x).toBeCloseTo(FULL_VIEW.x, 6)
    expect(moved.y).toBeCloseTo(FULL_VIEW.y, 6)
  })

  it('ustawia wskazany punkt na srodku', () => {
    const centred = centreOn(setZoom(FULL_VIEW, 4), { x: 800, y: 600 })
    expect(centred.x + centred.width / 2).toBeCloseTo(800, 6)
    expect(centred.y + centred.height / 2).toBeCloseTo(600, 6)
  })
})

describe('dojazd do elementu', () => {
  it('mieści element w widoku razem z zapasem', () => {
    const box = { x: 900, y: 100, width: 760, height: 252 }
    const view = focusOn(box)
    expect(view.width).toBeGreaterThan(box.width)
    expect(view.height).toBeGreaterThan(box.height)
    expect(zoomOf(view)).toBeGreaterThan(1)
  })

  it('nie przybliza bardziej, niz wolno', () => {
    const view = focusOn({ x: 500, y: 500, width: 8, height: 8 })
    expect(zoomOf(view)).toBeLessThanOrEqual(MAX_ZOOM + 1e-9)
  })

  it('element z rogu plytki nadal miesci sie w granicach widoku', () => {
    const view = focusOn({ x: 20, y: 20, width: 60, height: 60 })
    expect(view.x).toBeGreaterThanOrEqual(FULL_VIEW.x - 1e-9)
    expect(view.y).toBeGreaterThanOrEqual(FULL_VIEW.y - 1e-9)
  })
})

describe('rozpoznanie widoku wyjsciowego', () => {
  it('cala plytka to widok wyjsciowy', () => {
    expect(isFullView(FULL_VIEW)).toBe(true)
    expect(isFullView(clampView(FULL_VIEW))).toBe(true)
  })

  it('po przyblizeniu juz nie', () => {
    expect(isFullView(setZoom(FULL_VIEW, 1.5))).toBe(false)
  })
})
