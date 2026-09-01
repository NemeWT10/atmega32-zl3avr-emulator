import { memo } from 'react'
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  DECORATIONS,
  HEADERS,
  MCU_BODY,
  MCU_PINS_LEFT,
  MCU_PINS_RIGHT,
  PIN_PITCH,
  SMALL_PARTS,
  pinLabelBand,
} from './layout'

/**
 * Nieruchoma czesc plytki: laminat, opisy sitodrukiem, obudowa mikrokontrolera
 * i elementy, ktorych nie da sie klikac. Wydzielone i zapamietane, bo rysunek
 * ma kilkaset elementow, a przerysowywanie go 60 razy na sekunde razem
 * z fizyka przewodow byloby marnotrawstwem.
 */

export const BoardArtwork = memo(function BoardArtwork() {
  return (
    <g>
      <defs>
        <linearGradient id="pcb" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#1f6b45" />
          <stop offset="55%" stopColor="#17593a" />
          <stop offset="100%" stopColor="#124a30" />
        </linearGradient>
        <linearGradient id="chip" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#3a3a3d" />
          <stop offset="45%" stopColor="#212124" />
          <stop offset="100%" stopColor="#141416" />
        </linearGradient>
        <linearGradient id="gold" x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#f0d27a" />
          <stop offset="50%" stopColor="#c9a227" />
          <stop offset="100%" stopColor="#8a6d18" />
        </linearGradient>
        <linearGradient id="metal" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#c8ccd2" />
          <stop offset="50%" stopColor="#8d939b" />
          <stop offset="100%" stopColor="#5e646c" />
        </linearGradient>
        <radialGradient id="solder" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0%" stopColor="#e8e4d8" />
          <stop offset="60%" stopColor="#b9b3a3" />
          <stop offset="100%" stopColor="#7c776a" />
        </radialGradient>
        <filter id="wire-blur" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <filter id="part-shadow" x="-30%" y="-30%" width="180%" height="200%">
          <feDropShadow dx="2" dy="5" stdDeviation="4" floodOpacity="0.45" />
        </filter>
      </defs>

      {/* --- laminat --- */}
      <rect x={0} y={0} width={BOARD_WIDTH} height={BOARD_HEIGHT} rx={22} fill="url(#pcb)" />
      <rect
        x={6}
        y={6}
        width={BOARD_WIDTH - 12}
        height={BOARD_HEIGHT - 12}
        rx={18}
        fill="none"
        stroke="#0d3a24"
        strokeWidth={3}
      />

      {/* otwory montazowe: cztery narozne oraz cztery pod modulem wyswietlacza */}
      {[
        [40, 40], [BOARD_WIDTH - 40, 40],
        [40, BOARD_HEIGHT - 40], [BOARD_WIDTH - 40, BOARD_HEIGHT - 40],
      ].map(([x, y]) => (
        <g key={`hole-${x}-${y}`}>
          <circle cx={x} cy={y} r={16} fill="#0b2f1e" />
          <circle cx={x} cy={y} r={9} fill="#08130d" />
        </g>
      ))}

      {/* nadruki producenta */}
      <text x={BOARD_WIDTH - 60} y={BOARD_HEIGHT - 96} textAnchor="end" className="silk silk-big">
        AVR
      </text>
      <text x={BOARD_WIDTH - 60} y={BOARD_HEIGHT - 62} textAnchor="end" className="silk">
        ATmega
      </text>
      <text x={BOARD_WIDTH - 60} y={BOARD_HEIGHT - 32} textAnchor="end" className="silk silk-dim">
        ZL3AVR · btc.pl
      </text>

      {/* --- elementy dekoracyjne --- */}
      {DECORATIONS.map((part) => (
        <g key={`${part.silkscreen}-${part.x}`} filter="url(#part-shadow)">
          {part.kind === 'button' ? (
            <>
              <rect x={part.x} y={part.y} width={part.width} height={part.height} rx={6} fill="#1b1b1d" />
              <circle
                cx={part.x + part.width / 2}
                cy={part.y + part.height / 2}
                r={part.width * 0.32}
                fill="url(#metal)"
              />
            </>
          ) : part.kind === 'led' ? (
            <circle cx={part.x + 13} cy={part.y + 13} r={13} fill="#7a1f1f" stroke="#4a1414" />
          ) : part.kind === 'pot' ? (
            <>
              <rect x={part.x} y={part.y} width={part.width} height={part.height} rx={4} fill="#1d3a6b" />
              <circle
                cx={part.x + part.width / 2}
                cy={part.y + part.height / 2}
                r={Math.min(part.width, part.height) * 0.3}
                fill="#e8e2d0"
              />
              <rect
                x={part.x + part.width / 2 - 2}
                y={part.y + part.height / 2 - Math.min(part.width, part.height) * 0.3}
                width={4}
                height={Math.min(part.width, part.height) * 0.6}
                fill="#5c5443"
              />
            </>
          ) : part.kind === 'crystal' ? (
            <rect x={part.x} y={part.y} width={part.width} height={part.height} rx={20} fill="url(#metal)" />
          ) : part.kind === 'jack' ? (
            <>
              <rect x={part.x} y={part.y} width={part.width} height={part.height} rx={7} fill="#191919" />
              <circle
                cx={part.x + part.width / 2}
                cy={part.y + part.height / 2}
                r={part.width * 0.22}
                fill="#0a0a0a"
              />
            </>
          ) : part.kind === 'chip' ? (
            <rect x={part.x} y={part.y} width={part.width} height={part.height} rx={4} fill="url(#chip)" />
          ) : (
            <rect x={part.x} y={part.y} width={part.width} height={part.height} rx={5} fill="#17171a" />
          )}
          {part.silkscreen && (
            <text
              x={part.x + part.width / 2}
              y={part.labelBelow ? part.y + part.height + 16 : part.y - 8}
              textAnchor="middle"
              className="silk"
            >
              {part.silkscreen}
            </text>
          )}
          {part.caption && <title>{part.caption}</title>}
        </g>
      ))}

      {/* --- drobnica: rezystory, tranzystory, kondensatory --- */}
      {SMALL_PARTS.map((part) => (
        <g key={`${part.label}-${part.x}-${part.y}`}>
          {part.kind === 'resistor' && !part.vertical && (
            <>
              <rect x={part.x - 20} y={part.y - 6} width={40} height={12} rx={3} fill="#d8c9a3" />
              <rect x={part.x - 10} y={part.y - 6} width={4} height={12} fill="#5b3a1a" />
              <rect x={part.x - 2} y={part.y - 6} width={4} height={12} fill="#111827" />
              <rect x={part.x + 6} y={part.y - 6} width={4} height={12} fill="#b45309" />
            </>
          )}
          {part.kind === 'resistor' && part.vertical && (
            <>
              <rect x={part.x - 6} y={part.y - 20} width={12} height={40} rx={3} fill="#d8c9a3" />
              <rect x={part.x - 6} y={part.y - 10} width={12} height={4} fill="#5b3a1a" />
              <rect x={part.x - 6} y={part.y - 2} width={12} height={4} fill="#111827" />
              <rect x={part.x - 6} y={part.y + 6} width={12} height={4} fill="#b45309" />
            </>
          )}
          {part.kind === 'diode' && (
            <>
              <rect x={part.x - 18} y={part.y - 6} width={36} height={12} rx={2} fill="#2b2b30" />
              <rect x={part.x + 10} y={part.y - 6} width={5} height={12} fill="#d8d8dc" />
            </>
          )}
          {part.kind === 'transistor' && (
            <>
              <path
                d={`M ${part.x - 16} ${part.y + 14} L ${part.x + 16} ${part.y + 14}
                    L ${part.x + 16} ${part.y - 8} A 16 16 0 0 0 ${part.x - 16} ${part.y - 8} Z`}
                fill="#1a1a1c"
              />
              <text x={part.x} y={part.y + 30} textAnchor="middle" className="silk silk-tiny">
                {part.label}
              </text>
            </>
          )}
          {part.kind === 'capacitor' && (
            <>
              <circle cx={part.x} cy={part.y} r={15} fill="#1f2f52" stroke="#0f1b33" strokeWidth={2} />
              <path d={`M ${part.x - 15} ${part.y} A 15 15 0 0 1 ${part.x} ${part.y - 15} L ${part.x} ${part.y} Z`} fill="#dbe4f0" opacity={0.6} />
            </>
          )}
          <title>{part.label}</title>
        </g>
      ))}

      {/* --- mikrokontroler w podstawce DIP40 --- */}
      <g filter="url(#part-shadow)">
        <rect
          x={MCU_BODY.x - 16}
          y={MCU_BODY.y - 14}
          width={MCU_BODY.width + 32}
          height={MCU_BODY.height + 28}
          rx={6}
          fill="#101012"
        />
        {MCU_PINS_LEFT.map((name, index) => {
          const y = MCU_BODY.y + 12 + index * ((MCU_BODY.height - 24) / 19)
          return (
            <g key={`mcu-l-${name}`}>
              <rect x={MCU_BODY.x - 34} y={y - 4} width={26} height={8} rx={2} fill="url(#metal)" />
              <text x={MCU_BODY.x + 10} y={y + 4} className="silk silk-tiny">
                {name}
              </text>
            </g>
          )
        })}
        {MCU_PINS_RIGHT.map((name, index) => {
          const y = MCU_BODY.y + 12 + index * ((MCU_BODY.height - 24) / 19)
          return (
            <g key={`mcu-r-${name}`}>
              <rect x={MCU_BODY.x + MCU_BODY.width + 8} y={y - 4} width={26} height={8} rx={2} fill="url(#metal)" />
              <text x={MCU_BODY.x + MCU_BODY.width - 10} y={y + 4} textAnchor="end" className="silk silk-tiny">
                {name}
              </text>
            </g>
          )
        })}
        <rect
          x={MCU_BODY.x}
          y={MCU_BODY.y}
          width={MCU_BODY.width}
          height={MCU_BODY.height}
          rx={5}
          fill="url(#chip)"
        />
        {/* wciecie oznaczajace pin 1 */}
        <path
          d={`M ${MCU_BODY.x + MCU_BODY.width / 2 - 16} ${MCU_BODY.y}
              A 16 16 0 0 0 ${MCU_BODY.x + MCU_BODY.width / 2 + 16} ${MCU_BODY.y} Z`}
          fill="#0a0a0b"
        />
        <text
          x={MCU_BODY.x + MCU_BODY.width / 2}
          y={MCU_BODY.y + MCU_BODY.height / 2 - 8}
          textAnchor="middle"
          className="chip-label"
        >
          ATMEGA32
        </text>
        <text
          x={MCU_BODY.x + MCU_BODY.width / 2}
          y={MCU_BODY.y + MCU_BODY.height / 2 + 16}
          textAnchor="middle"
          className="chip-label chip-label-small"
        >
          16PU
        </text>
        <text x={MCU_BODY.x - 20} y={MCU_BODY.y - 26} className="silk">
          U5
        </text>
      </g>

      {/* --- obrysy i opisy zlaczy --- */}
      {HEADERS.map((header) => {
        const isVertical = header.orientation === 'vertical'
        const width = isVertical ? header.columns * PIN_PITCH : header.rows * PIN_PITCH
        const height = isVertical ? header.rows * PIN_PITCH : header.columns * PIN_PITCH
        const x = header.x - PIN_PITCH / 2
        const y = header.y - PIN_PITCH / 2
        // Po prawej stronie zlacza pionowego stoja juz napisy pinow, wiec napis
        // calego zlacza musi je ominac - inaczej „Port A” lezy na „PA2”.
        const rotated = header.labelSide === 'left' || header.labelSide === 'right'
        const labelX =
          header.labelSide === 'left'
            ? x - 12
            : header.labelSide === 'right'
              ? x + width + 12 + pinLabelBand(header)
              : x + width / 2
        const labelY =
          header.labelSide === 'above'
            ? y - 12
            : header.labelSide === 'below'
              ? y + height + 16
              : y + height / 2
        return (
          <g key={`silk-${header.id}`}>
            <rect x={x - 4} y={y - 4} width={width + 8} height={height + 8} rx={4} fill="#0f4530" opacity={0.55} />
            <text
              x={labelX}
              y={labelY}
              textAnchor={header.labelSide === 'left' ? 'end' : header.labelSide === 'right' ? 'start' : 'middle'}
              className="silk"
              transform={rotated ? `rotate(-90, ${labelX}, ${labelY})` : undefined}
            >
              {header.silkscreen}
            </text>
          </g>
        )
      })}
    </g>
  )
})
