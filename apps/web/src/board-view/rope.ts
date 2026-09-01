/**
 * Fizyka przewodow - symulacja Verleta.
 *
 * Przewod nie jest krzywa rysowana od pinu do pinu, tylko lancuchem punktow
 * z masa, ktore ciagnie "w dol" i ktore trzymaja sie w stalych odstepach.
 * Dzieki temu zachowuje sie jak prawdziwa zyla: zwisa, kolysze sie przy
 * przepinaniu i ma dlugosc niezalezna od odleglosci miedzy pinami.
 *
 * Ostatnie ma znaczenie dydaktyczne: na laboratorium bierze sie gotowy przewod
 * o okreslonej dlugosci, wiec polaczenie dwoch sasiednich pinow daje sporą petle,
 * a nie krotka kreske. Model to odwzorowuje.
 */

export interface RopeNode {
  x: number
  y: number
  /** Poprzednia pozycja - w metodzie Verleta zastepuje predkosc. */
  px: number
  py: number
}

export interface Point {
  x: number
  y: number
}

/**
 * Parametry dobrane tak, zeby zyla ladnie opadala, ale POTEM STALA SPOKOJNIE.
 * Wczesniej lancuch drzal w nieskonczonosc, bo tlumienie bylo za slabe,
 * a krok calkowania zalezal od klatek ekranu.
 */
const GRAVITY = 1500
const DAMPING = 0.90
const CONSTRAINT_ITERATIONS = 12
/** Staly krok calkowania - zmienny krok rozhustywal symulacje przy zacieciach. */
const FIXED_STEP = 1 / 120
/** Ponizej tego ruchu (w jednostkach rysunku na krok) lancuch uznajemy za nieruchomy. */
const SLEEP_THRESHOLD = 0.05

/** Najkrotszy przewod dostepny na laboratorium - stad minimalny zwis. */
const MINIMUM_LENGTH = 230

export class Rope {
  readonly nodes: RopeNode[] = []
  private segmentLength: number
  /** Uspiony lancuch nie jest przeliczany - oszczedza moc i eliminuje drzenie. */
  private asleep = false
  private accumulator = 0
  private lastStart = { x: 0, y: 0 }
  private lastEnd = { x: 0, y: 0 }

  constructor(
    start: Point,
    end: Point,
    readonly segments = 18,
    slack = 1.18,
  ) {
    const distance = Math.hypot(end.x - start.x, end.y - start.y)
    const length = Math.max(distance * slack, MINIMUM_LENGTH)
    this.segmentLength = length / segments

    for (let i = 0; i <= segments; i++) this.nodes.push({ x: 0, y: 0, px: 0, py: 0 })
    this.reseed(start, end)
  }

  /**
   * Rozklada punkty wzdluz linii miedzy koncami, z lukiem wynikajacym z zapasu
   * dlugosci. Uzywane przy tworzeniu lancucha i w chwili, gdy zyla zostaje
   * oderwana od pinu.
   *
   * Bez tego przewod chwycony na pinie startuje ze wszystkimi punktami
   * w jednym miejscu i przez pierwsze ulamki sekundy „rozplatuje sie” z wezla,
   * zamiast po prostu zwisac. Wygladalo to na usterke animacji.
   */
  reseed(start: Point, end: Point): void {
    const distance = Math.hypot(end.x - start.x, end.y - start.y)
    const total = this.segmentLength * this.segments
    // Strzalka luku: tyle, ile wynika z nadmiaru dlugosci nad odlegloscia.
    const sag = Math.max(18, (total - distance) * 0.42)
    for (let i = 0; i < this.nodes.length; i++) {
      const t = i / this.segments
      const x = start.x + (end.x - start.x) * t
      const y = start.y + (end.y - start.y) * t + Math.sin(Math.PI * t) * sag
      const node = this.nodes[i]
      node.x = x
      node.y = y
      node.px = x
      node.py = y
    }
    this.lastStart = { x: start.x, y: start.y }
    this.lastEnd = { x: end.x, y: end.y }
    this.asleep = false
  }

  /** Zmiana dlugosci - uzywane, gdy przewod jest przepinany w locie. */
  setLength(length: number): void {
    this.segmentLength = Math.max(length, MINIMUM_LENGTH) / this.segments
  }

  /** Budzi lancuch - wolane, gdy zmieni sie polozenie koncow. */
  wake(): void {
    this.asleep = false
  }

  step(dt: number, start: Point, end: Point): void {
    // Ruch konca (przepiecie przewodu, przeciaganie) zawsze budzi symulacje.
    if (start.x !== this.lastStart.x || start.y !== this.lastStart.y ||
        end.x !== this.lastEnd.x || end.y !== this.lastEnd.y) {
      this.asleep = false
      this.lastStart = { x: start.x, y: start.y }
      this.lastEnd = { x: end.x, y: end.y }
    }
    if (this.asleep) return

    // Staly krok calkowania niezalezny od wydajnosci przegladarki.
    this.accumulator = Math.min(this.accumulator + dt, 0.1)
    let movement = 0
    while (this.accumulator >= FIXED_STEP) {
      this.accumulator -= FIXED_STEP
      movement = this.integrate(FIXED_STEP, start, end)
    }
    if (movement < SLEEP_THRESHOLD) this.asleep = true
  }

  /** Jeden krok calkowania. Zwraca laczny ruch punktow - stad wiadomo, kiedy uspic. */
  private integrate(dt: number, start: Point, end: Point): number {
    const nodes = this.nodes
    const gravityStep = GRAVITY * dt * dt
    let movement = 0

    for (let i = 1; i < nodes.length - 1; i++) {
      const node = nodes[i]
      const vx = (node.x - node.px) * DAMPING
      const vy = (node.y - node.py) * DAMPING
      node.px = node.x
      node.py = node.y
      node.x += vx
      node.y += vy + gravityStep
      movement += Math.abs(vx) + Math.abs(vy)
    }

    for (let iteration = 0; iteration < CONSTRAINT_ITERATIONS; iteration++) {
      // Konce sa przypiete do pinow - to one narzucaja ksztalt reszcie.
      nodes[0].x = start.x
      nodes[0].y = start.y
      nodes[nodes.length - 1].x = end.x
      nodes[nodes.length - 1].y = end.y

      for (let i = 0; i < nodes.length - 1; i++) {
        const a = nodes[i]
        const b = nodes[i + 1]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const distance = Math.hypot(dx, dy) || 0.0001
        const correction = (distance - this.segmentLength) / distance / 2
        const offsetX = dx * correction
        const offsetY = dy * correction
        if (i !== 0) {
          a.x += offsetX
          a.y += offsetY
        }
        if (i + 1 !== nodes.length - 1) {
          b.x -= offsetX
          b.y -= offsetY
        }
      }
    }

    return movement / nodes.length
  }

  /** Wygladzona sciezka SVG przechodzaca przez punkty lancucha. */
  toPath(): string {
    const nodes = this.nodes
    if (nodes.length < 2) return ''
    let path = `M ${nodes[0].x.toFixed(1)} ${nodes[0].y.toFixed(1)}`
    for (let i = 1; i < nodes.length - 1; i++) {
      const current = nodes[i]
      const next = nodes[i + 1]
      const midX = (current.x + next.x) / 2
      const midY = (current.y + next.y) / 2
      path += ` Q ${current.x.toFixed(1)} ${current.y.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`
    }
    const last = nodes[nodes.length - 1]
    path += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`
    return path
  }

  /** Najnizej polozony punkt - uzywany do sortowania przewodow w glab sceny. */
  lowestY(): number {
    let lowest = -Infinity
    for (const node of this.nodes) if (node.y > lowest) lowest = node.y
    return lowest
  }

  /**
   * Przejmuje ksztalt innego lancucha.
   *
   * Uzywane w chwili, gdy przewod trzymany w reku staje sie gotowym polaczeniem:
   * nowa zyla zaczyna dokladnie tam, gdzie skonczyl podglad, wiec nie ma
   * przeskoku ksztaltu. Bez tego przewod „mrugal” w inne polozenie w tej samej
   * klatce, w ktorej uzytkownik puszczal przycisk myszy.
   */
  copyShapeFrom(other: Rope): boolean {
    if (other.nodes.length !== this.nodes.length) return false
    for (let i = 0; i < this.nodes.length; i++) {
      const source = other.nodes[i]
      const target = this.nodes[i]
      target.x = source.x
      target.y = source.y
      target.px = source.px
      target.py = source.py
    }
    this.asleep = false
    return true
  }

  /** Uspokaja lancuch bez animacji - przy wczytywaniu gotowego zestawu polaczen. */
  settle(start: Point, end: Point, iterations = 400): void {
    this.lastStart = { x: start.x, y: start.y }
    this.lastEnd = { x: end.x, y: end.y }
    for (let i = 0; i < iterations; i++) this.integrate(FIXED_STEP, start, end)
    this.asleep = true
  }

  get sleeping(): boolean {
    return this.asleep
  }
}
