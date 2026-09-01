import { useEffect, useState } from 'react'
import {
  CLOCK_OPTIONS,
  HFUSE_BIT,
  isFuseProgrammed,
  setFuseProgrammed,
  type FuseBytes,
} from '@zl3avr/avr-core'
import { useSimulator } from '../sim/SimulationContext'

/**
 * Okno fuse bitow wzorowane na "Device Programming -> Fuses" z Microchip Studio.
 *
 * Uklad jest celowo taki sam jak na zajeciach: lista pojedynczych bitow,
 * a na dole rozwijana lista SUT_CKSEL, w ktorej wybiera sie zrodlo i czestotliwosc
 * zegara. To wlasnie tutaj student przestawia uklad z fabrycznego 1 MHz na 4 MHz
 * przed cwiczeniem z USART - i tutaj wylacza JTAGEN, zeby odzyskac port C.
 *
 * W AVR fuse ZAPROGRAMOWANY to bit rowny zero, dlatego zaznaczony checkbox
 * oznacza wartosc 0 - dokladnie jak w oryginalnym oknie.
 */

interface Props {
  onClose: () => void
}

const HIGH_FUSE_ROWS: { bit: number; name: string; hint: string }[] = [
  { bit: HFUSE_BIT.OCDEN, name: 'OCDEN', hint: 'debugowanie sprzetowe' },
  { bit: HFUSE_BIT.JTAGEN, name: 'JTAGEN', hint: 'interfejs JTAG zajmuje PC2–PC5' },
  { bit: HFUSE_BIT.SPIEN, name: 'SPIEN', hint: 'programowanie przez ISP' },
  { bit: HFUSE_BIT.CKOPT, name: 'CKOPT', hint: 'wzmocniony oscylator' },
  { bit: HFUSE_BIT.EESAVE, name: 'EESAVE', hint: 'zachowaj EEPROM przy kasowaniu' },
  { bit: HFUSE_BIT.BOOTRST, name: 'BOOTRST', hint: 'start od sekcji bootloadera' },
]

export function FuseDialog({ onClose }: Props) {
  const simulator = useSimulator()
  const [draft, setDraft] = useState<FuseBytes>({ ...simulator.mcu.fuses })

  // Esc zamyka okno bez zapisu - tak samo jak klikniecie obok albo "Anuluj".
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const currentClockId =
    CLOCK_OPTIONS.find(
      (option) => (draft.low & 0x0f) === option.cksel && ((draft.low >> 4) & 0x03) === option.sut,
    )?.id ??
    CLOCK_OPTIONS.find((option) => (draft.low & 0x0f) === option.cksel)?.id ??
    ''

  const setClock = (id: string) => {
    const option = CLOCK_OPTIONS.find((item) => item.id === id)
    if (!option) return
    setDraft((previous) => ({
      ...previous,
      low: ((previous.low & 0xc0) | (option.sut << 4) | option.cksel) & 0xff,
    }))
  }

  const apply = () => {
    simulator.setFuses(draft)
    onClose()
  }

  const selectedOption = CLOCK_OPTIONS.find((option) => option.id === currentClockId)
  const usesCrystal = selectedOption?.external ?? false

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <strong>Device Programming — Fuses</strong>
          <span className="modal-device">ATmega32</span>
        </div>

        <div className="modal-body">
          <table className="fuse-table">
            <thead>
              <tr>
                <th>Fuse Name</th>
                <th>Value</th>
                <th>Opis</th>
              </tr>
            </thead>
            <tbody>
              {HIGH_FUSE_ROWS.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={isFuseProgrammed(draft.high, row.bit)}
                      onChange={(event) =>
                        setDraft((previous) => ({
                          ...previous,
                          high: setFuseProgrammed(previous.high, row.bit, event.target.checked),
                        }))
                      }
                    />
                  </td>
                  <td className="fuse-hint">{row.hint}</td>
                </tr>
              ))}
              <tr>
                <td>SUT_CKSEL</td>
                <td colSpan={2}>
                  <select value={currentClockId} onChange={(event) => setClock(event.target.value)}>
                    {CLOCK_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            </tbody>
          </table>

          <div className="fuse-values">
            <span>
              HIGH <code>0x{draft.high.toString(16).toUpperCase().padStart(2, '0')}</code>
            </span>
            <span>
              LOW <code>0x{draft.low.toString(16).toUpperCase().padStart(2, '0')}</code>
            </span>
          </div>

          <p className="fuse-note">
            Zaznaczony checkbox oznacza fuse <strong>zaprogramowany</strong>, czyli bit równy zero —
            tak samo jak w Microchip Studio.
          </p>

          {isFuseProgrammed(draft.high, HFUSE_BIT.JTAGEN) && (
            <p className="fuse-warning">
              JTAGEN jest włączony: linie PC2–PC5 należą do interfejsu JTAG i nie działają jako
              zwykłe wejścia/wyjścia.
            </p>
          )}

          {usesCrystal && !simulator.board.jumpers.JP25 && (
            <p className="fuse-warning">
              Wybrano zewnętrzne źródło zegara, ale zworka JP25 jest rozwarta — mikrokontroler nie
              będzie miał czym się taktować.
            </p>
          )}
        </div>

        <div className="modal-footer">
          <button onClick={() => setDraft({ ...simulator.mcu.fuses })}>Przywróć bieżące</button>
          <span className="spacer" />
          <button onClick={onClose}>Anuluj</button>
          <button className="primary" onClick={apply}>
            Program
          </button>
        </div>
      </div>
    </div>
  )
}
