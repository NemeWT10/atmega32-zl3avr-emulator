import { useMemo, useRef } from 'react'
import { collectBoxes } from './bounds'
import { BOARD_HEIGHT, BOARD_WIDTH } from './layout'
import { FULL_VIEW, centreOn, type Viewport } from './viewport'

/**
 * Mapka calej plytki z zaznaczonym wycinkiem, ktory widac w oknie.
 *
 * Pojawia sie dopiero po przyblizeniu, bo przy 100% niczego nie wnosi.
 * Rozwiazuje jedyny prawdziwy problem powiekszenia: „widze osiem pinow,
 * ale nie wiem, w ktorym miejscu plytki jestem”. Klikniecie albo przeciagniecie
 * po mapce przenosi widok - szybciej niz przesuwanie obrazu na oslep.
 *
 * Rysunek jest celowo uproszczony (same prostokaty elementow): ma pokazywac
 * uklad, a nie konkurowac o uwage z plytka obok.
 */

interface Props {
  view: Viewport
  onView: (next: Viewport) => void
}

export function Minimap({ view, onView }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)

  // Prostokaty elementow sa stale przez cale zycie aplikacji.
  const boxes = useMemo(() => collectBoxes(), [])

  const goTo = (event: React.PointerEvent) => {
    const svg = svgRef.current
    if (!svg) return
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const matrix = svg.getScreenCTM()
    if (!matrix) return
    const inBoard = point.matrixTransform(matrix.inverse())
    onView(centreOn(view, inBoard))
  }

  return (
    <div className="board-minimap" title="Mapka płytki — kliknij, żeby tam przejść">
      <svg
        ref={svgRef}
        viewBox={`${FULL_VIEW.x} ${FULL_VIEW.y} ${FULL_VIEW.width} ${FULL_VIEW.height}`}
        onPointerDown={(event) => {
          dragging.current = true
          event.currentTarget.setPointerCapture(event.pointerId)
          goTo(event)
        }}
        onPointerMove={(event) => {
          if (dragging.current) goTo(event)
        }}
        onPointerUp={(event) => {
          dragging.current = false
          event.currentTarget.releasePointerCapture(event.pointerId)
        }}
      >
        <rect x={0} y={0} width={BOARD_WIDTH} height={BOARD_HEIGHT} rx={22} fill="#1c5c3c" />
        {boxes.map((box) => (
          <rect
            key={box.id}
            x={box.x}
            y={box.y}
            width={box.width}
            height={box.height}
            fill="#0b2f1e"
            opacity={0.75}
          />
        ))}
        <rect
          x={view.x}
          y={view.y}
          width={view.width}
          height={view.height}
          fill="#fbbf24"
          opacity={0.16}
          stroke="#fbbf24"
          strokeWidth={14}
        />
      </svg>
    </div>
  )
}
