/**
 * Okno, przez ktore ogladamy plytke: przesuwanie (pan) i powiekszanie (zoom).
 *
 * Wszystko sprowadza sie do jednego prostokata `viewBox` rysunku SVG. Zmiana
 * tego prostokata przesuwa i skaluje CALY rysunek naraz, wiec przewody, piny
 * i pomoc kontekstowa dzialaja bez zmian - przeliczanie wspolrzednych kursora
 * robi za nas przegladarka (`getScreenCTM`).
 *
 * Dlaczego nie rozciaganie elementu i paski przewijania (tak bylo wczesniej):
 * paski przewijaja tylko w pionie i poziomie, nie da sie zblizyc do wskazanego
 * miejsca, a przy 300% caly rysunek trzeba przewijac dwoma paskami naraz.
 * Prostokat widoku daje to, co student zna z map: kolko przybliza tam, gdzie
 * stoi kursor, a przeciagniecie tla przesuwa obraz razem z reka.
 *
 * Wszystkie funkcje sa czyste - stan trzyma widok, a testy moga sprawdzic
 * sama matematyke bez uruchamiania przegladarki.
 */

import { BOARD_HEIGHT, BOARD_WIDTH } from './layout'

export interface Viewport {
  x: number
  y: number
  width: number
  height: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Margines wokol laminatu - zeby plytka nie dotykala krawedzi okna. */
const MARGIN = 40

/** Widok "cala plytka" - punkt odniesienia dla powiekszenia 100%. */
export const FULL_VIEW: Viewport = {
  x: -MARGIN,
  y: -MARGIN,
  width: BOARD_WIDTH + 2 * MARGIN,
  height: BOARD_HEIGHT + 2 * MARGIN,
}

/** 100% = cala plytka w oknie. Ponizej nie schodzimy - dalej nie ma czego ogladac. */
export const MIN_ZOOM = 1
/**
 * Przy 600% pojedynczy pin ma na ekranie kilkadziesiat pikseli. Wyzej rysunek
 * nie niesie juz wiecej informacji, a latwo sie zgubic.
 */
export const MAX_ZOOM = 6

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value
}

/** Powiekszenie wynikajace z rozmiaru prostokata widoku. */
export function zoomOf(view: Viewport): number {
  return FULL_VIEW.width / view.width
}

/**
 * Sprowadza widok do dozwolonego zakresu.
 *
 * Powiekszenie ograniczamy zachowujac SRODEK obrazu - inaczej dojscie do
 * krancowej wartosci przeskakiwaloby obraz w bok. Przesuniecie ograniczamy tak,
 * zeby widok nie wyjechal poza laminat; bez tego mozna wypchnac plytke poza
 * ekran i zostac ze sciana tla, nie wiedzac, gdzie kliknac.
 */
export function clampView(view: Viewport): Viewport {
  const zoom = clamp(zoomOf(view), MIN_ZOOM, MAX_ZOOM)
  const width = FULL_VIEW.width / zoom
  const height = FULL_VIEW.height / zoom
  const centreX = view.x + view.width / 2
  const centreY = view.y + view.height / 2
  return {
    x: clamp(centreX - width / 2, FULL_VIEW.x, FULL_VIEW.x + FULL_VIEW.width - width),
    y: clamp(centreY - height / 2, FULL_VIEW.y, FULL_VIEW.y + FULL_VIEW.height - height),
    width,
    height,
  }
}

/**
 * Powiekszenie wokol wskazanego punktu: to, co jest pod kursorem, zostaje pod
 * kursorem. Tak zachowuje sie kazda mapa i to jedyny sposob, przy ktorym
 * przybliżanie nie wymaga poprawiania przesunięcia po kazdym ruchu kolka.
 */
export function zoomAt(view: Viewport, point: { x: number; y: number }, factor: number): Viewport {
  const current = zoomOf(view)
  const applied = clamp(current * factor, MIN_ZOOM, MAX_ZOOM) / current
  return clampView({
    x: point.x - (point.x - view.x) / applied,
    y: point.y - (point.y - view.y) / applied,
    width: view.width / applied,
    height: view.height / applied,
  })
}

/** Powiekszenie o zadany krok, liczone od srodka widoku (dla przyciskow w pasku). */
export function zoomBy(view: Viewport, factor: number): Viewport {
  return zoomAt(view, { x: view.x + view.width / 2, y: view.y + view.height / 2 }, factor)
}

/** Ustawienie konkretnego powiekszenia z zachowaniem srodka. */
export function setZoom(view: Viewport, zoom: number): Viewport {
  return zoomBy(view, clamp(zoom, MIN_ZOOM, MAX_ZOOM) / zoomOf(view))
}

/** Przesuniecie widoku o wektor podany w jednostkach rysunku. */
export function panBy(view: Viewport, dx: number, dy: number): Viewport {
  return clampView({ ...view, x: view.x + dx, y: view.y + dy })
}

/** Przesuniecie widoku tak, zeby wskazany punkt wypadl na srodku. */
export function centreOn(view: Viewport, point: { x: number; y: number }): Viewport {
  return clampView({ ...view, x: point.x - view.width / 2, y: point.y - view.height / 2 })
}

/**
 * Dojazd do wskazanego elementu: powieksza tyle, zeby zmiescil sie z zapasem,
 * i ustawia go na srodku. Uzywane przez przycisk „pokaz na plytce” w panelu
 * opisu - przy powiekszeniu 400% szukanie elementu wzrokiem jest beznadziejne.
 */
export function focusOn(box: Rect, padding = 90): Viewport {
  const zoom = clamp(
    Math.min(
      FULL_VIEW.width / (box.width + 2 * padding),
      FULL_VIEW.height / (box.height + 2 * padding),
    ),
    MIN_ZOOM,
    MAX_ZOOM,
  )
  const width = FULL_VIEW.width / zoom
  const height = FULL_VIEW.height / zoom
  return clampView({
    x: box.x + box.width / 2 - width / 2,
    y: box.y + box.height / 2 - height / 2,
    width,
    height,
  })
}

/** Napis dla paska narzedzi, np. „150%”. */
export function describeZoom(view: Viewport): string {
  return `${Math.round(zoomOf(view) * 100)}%`
}

/** Czy widok jest w stanie wyjsciowym (cala plytka, bez przesuniecia). */
export function isFullView(view: Viewport): boolean {
  return Math.abs(zoomOf(view) - 1) < 0.005
}
