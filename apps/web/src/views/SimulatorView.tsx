import { useState } from 'react'
import { IO } from '@zl3avr/avr-core'
import {
  REGISTER_BITS,
  SREG_BIT_DOCS,
  findSymbol,
  type SymbolDoc,
} from '../knowledge/avr-symbols'
import { useSimulator, useSimulatorEvents } from '../sim/SimulationContext'
import { chapterLabel, openKompendium } from '../kompendium/navigation'

/**
 * Podglad wnetrza mikrokontrolera.
 *
 * Sam podglad rejestrow niewiele daje komus, kto nie wie, co te nazwy znacza.
 * Dlatego kazdy rejestr jest rozlozony na NAZWANE BITY, a najechanie na rejestr
 * albo pojedynczy bit pokazuje w panelu obok, czym jest, po co sluzy, jak sie
 * go ustawia i na co uwazac.
 */

const HEX = (value: number, digits = 2) => value.toString(16).toUpperCase().padStart(digits, '0')

interface RegisterGroup {
  title: string
  hint: string
  /** Rozdzial kompendium rozwijajacy temat tej grupy rejestrow. */
  chapter?: string
  registers: { name: string; address: number }[]
}

const GROUPS: RegisterGroup[] = [
  {
    title: 'Porty wejścia/wyjścia',
    chapter: 'porty',
    hint: 'DDR ustala kierunek, PORT wystawia wartość albo włącza pull-upy, PIN pokazuje rzeczywisty stan wyprowadzeń.',
    registers: [
      { name: 'DDRA', address: IO.DDRA }, { name: 'PORTA', address: IO.PORTA }, { name: 'PINA', address: IO.PINA },
      { name: 'DDRB', address: IO.DDRB }, { name: 'PORTB', address: IO.PORTB }, { name: 'PINB', address: IO.PINB },
      { name: 'DDRC', address: IO.DDRC }, { name: 'PORTC', address: IO.PORTC }, { name: 'PINC', address: IO.PINC },
      { name: 'DDRD', address: IO.DDRD }, { name: 'PORTD', address: IO.PORTD }, { name: 'PIND', address: IO.PIND },
    ],
  },
  {
    title: 'Liczniki czasu',
    chapter: 'timery',
    hint: 'TCCR konfiguruje licznik, TCNT to jego bieżąca wartość, OCR wartość porównania, TIMSK włącza przerwania, TIFR trzyma flagi.',
    registers: [
      { name: 'TCCR0', address: IO.TCCR0 }, { name: 'TCNT0', address: IO.TCNT0 }, { name: 'OCR0', address: IO.OCR0 },
      { name: 'TCCR1A', address: IO.TCCR1A }, { name: 'TCCR1B', address: IO.TCCR1B },
      { name: 'TCNT1L', address: IO.TCNT1L }, { name: 'TCNT1H', address: IO.TCNT1H },
      { name: 'OCR1AL', address: IO.OCR1AL }, { name: 'OCR1AH', address: IO.OCR1AH },
      { name: 'TIMSK', address: IO.TIMSK }, { name: 'TIFR', address: IO.TIFR },
    ],
  },
  {
    title: 'Transmisja szeregowa',
    chapter: 'usart',
    hint: 'UCSRA pokazuje stan, UCSRB włącza nadajnik i odbiornik, UBRRL ustala prędkość, UDR przenosi bajty.',
    registers: [
      { name: 'UDR', address: IO.UDR }, { name: 'UCSRA', address: IO.UCSRA },
      { name: 'UCSRB', address: IO.UCSRB }, { name: 'UBRRL', address: IO.UBRRL },
    ],
  },
  {
    title: 'Przerwania zewnętrzne i sterowanie',
    chapter: 'przerwania',
    hint: 'GICR włącza przerwania zewnętrzne, MCUCR wybiera sposób ich wyzwalania, MCUCSR trzyma bit wyłączający JTAG.',
    registers: [
      { name: 'GICR', address: IO.GICR }, { name: 'GIFR', address: IO.GIFR },
      { name: 'MCUCR', address: IO.MCUCR }, { name: 'MCUCSR', address: IO.MCUCSR },
    ],
  },
]

interface HelpTarget {
  title: string
  subtitle?: string
  summary: string
  detail?: string
  example?: string
  trap?: string
  origin?: string
}

const DEFAULT_HELP: HelpTarget = {
  title: 'Podgląd rejestrów',
  summary:
    'Rejestr to jedna komórka pamięci wewnątrz mikrokontrolera, przez którą program steruje sprzętem. ' +
    'Zapisanie w niej wartości włącza wyjście, uruchamia licznik albo wysyła znak.',
  detail:
    'Każdy rejestr ma osiem bitów, a każdy bit odpowiada za coś innego. Dlatego pokazujemy je tu z nazwami, ' +
    'a nie jako ciąg zer i jedynek.\n\nNajedź kursorem na nazwę rejestru albo na pojedynczy bit, żeby ' +
    'dowiedzieć się, co robi i jak go ustawić.',
}

export function SimulatorView() {
  const simulator = useSimulator()
  useSimulatorEvents(['tick', 'state'], 12)

  const [help, setHelp] = useState<HelpTarget | null>(null)
  const { mcu } = simulator
  const shown = help ?? DEFAULT_HELP

  const describeRegister = (name: string): HelpTarget => {
    const symbol = findSymbol(name)
    if (symbol) return fromSymbol(symbol)
    return { title: name, summary: 'Rejestr mikrokontrolera ATmega32.' }
  }

  const describeBit = (registerName: string, bitName: string, bit: number): HelpTarget => {
    if (registerName === 'SREG' && SREG_BIT_DOCS[bitName]) {
      return {
        title: bitName,
        subtitle: `${registerName}, bit ${bit}`,
        summary: SREG_BIT_DOCS[bitName],
      }
    }
    const symbol = findSymbol(bitName)
    if (symbol) {
      return { ...fromSymbol(symbol), subtitle: `${registerName}, bit ${bit}` }
    }
    return {
      title: bitName,
      subtitle: `${registerName}, bit ${bit}`,
      summary: `Bit ${bit} rejestru ${registerName}.`,
    }
  }

  return (
    <div className="sim-view">
      <div className="sim-toolbar">
        <button onClick={() => simulator.stepInstruction()} disabled={!simulator.powered}>
          Wykonaj jedną instrukcję
        </button>
        <button onClick={() => (simulator.running ? simulator.stop() : simulator.start())} disabled={!simulator.powered}>
          {simulator.running ? 'Pauza' : 'Wznów'}
        </button>
        <span className="spacer" />
        <span title="Adres instrukcji, która wykona się jako następna">PC = 0x{HEX(mcu.cpu.pc, 4)}</span>
        <span title="Wskaźnik stosu — adres, pod którym zapisywane są dane przy wywołaniu funkcji">
          SP = 0x{HEX(mcu.cpu.getSP(), 4)}
        </span>
        <span title="Liczba taktów zegara od uruchomienia">taktów: {mcu.cpu.cycles.toLocaleString('pl-PL')}</span>
        <span>czas: {mcu.elapsedSeconds.toFixed(4)} s</span>
      </div>

      <div className="sim-body">
        <div className="sim-registers">
          <section>
            <h3>Rejestr stanu (SREG)</h3>
            <p className="group-hint">
              Osiem znaczników opisujących wynik ostatniego działania oraz zezwolenie na przerwania.
            </p>
            <RegisterRow
              name="SREG"
              value={mcu.cpu.sreg}
              onHoverRegister={() => setHelp(describeRegister('SREG'))}
              onHoverBit={(bitName, bit) => setHelp(describeBit('SREG', bitName, bit))}
              onLeave={() => setHelp(null)}
            />
          </section>

          {GROUPS.map((group) => (
            <section key={group.title}>
              <h3>
                {group.title}
                {group.chapter && (
                  <button
                    className="kompendium-link"
                    onClick={() => openKompendium(group.chapter)}
                    title={`Otwiera zakładkę Kompendium na rozdziale „${chapterLabel(group.chapter)}”`}
                  >
                    📖 Kompendium
                  </button>
                )}
              </h3>
              <p className="group-hint">{group.hint}</p>
              {group.registers.map((register) => (
                <RegisterRow
                  key={register.name}
                  name={register.name}
                  value={mcu.cpu.getIoDirect(register.address)}
                  onHoverRegister={() => setHelp(describeRegister(register.name))}
                  onHoverBit={(bitName, bit) => setHelp(describeBit(register.name, bitName, bit))}
                  onLeave={() => setHelp(null)}
                />
              ))}
            </section>
          ))}

          <section>
            <h3>Rejestry robocze</h3>
            <p className="group-hint">
              Trzydzieści dwa miejsca, w których procesor trzyma liczby, na których właśnie pracuje.
              To na nich wykonują się dodawania, porównania i przesunięcia.
            </p>
            <div className="working-registers">
              {Array.from({ length: 32 }, (_, index) => (
                <div key={index} className="register">
                  <span className="reg-name">R{index}</span>
                  <span className="reg-value">{HEX(mcu.cpu.data[index])}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="sim-help">
          <div className="help-card">
            <h3>{shown.title}</h3>
            {shown.subtitle && <p className="help-subtitle">{shown.subtitle}</p>}
            <p className="help-what">{shown.summary}</p>
            {shown.detail && (
              <>
                <h4>Szczegóły</h4>
                <p style={{ whiteSpace: 'pre-line' }}>{shown.detail}</p>
              </>
            )}
            {shown.example && (
              <>
                <h4>Przykład</h4>
                <pre className="help-example">{shown.example}</pre>
              </>
            )}
            {shown.trap && (
              <div className="help-trap">
                <strong>Uwaga na to</strong>
                <p>{shown.trap}</p>
              </div>
            )}
            {shown.origin && <p className="help-labs">Pochodzenie: {shown.origin}</p>}
          </div>
        </aside>
      </div>
    </div>
  )
}

function fromSymbol(symbol: SymbolDoc): HelpTarget {
  return {
    title: symbol.name,
    summary: symbol.summary,
    detail: symbol.detail,
    example: symbol.example,
    trap: symbol.trap,
    origin: symbol.origin,
  }
}

interface RowProps {
  name: string
  value: number
  onHoverRegister: () => void
  onHoverBit: (bitName: string, bit: number) => void
  onLeave: () => void
}

/** Rejestr rozlozony na osiem nazwanych bitow. */
function RegisterRow({ name, value, onHoverRegister, onHoverBit, onLeave }: RowProps) {
  const bitNames = REGISTER_BITS[name]

  return (
    <div className="register-row">
      <span className="register-label" onMouseEnter={onHoverRegister} onMouseLeave={onLeave}>
        {name}
      </span>
      <span className="register-hex" onMouseEnter={onHoverRegister} onMouseLeave={onLeave}>
        0x{HEX(value)}
      </span>
      <span className="register-bits">
        {Array.from({ length: 8 }, (_, index) => {
          const bit = 7 - index
          const set = ((value >> bit) & 1) === 1
          const bitName = bitNames?.[index] ?? null
          return (
            <span
              key={bit}
              className={'bit' + (set ? ' set' : '') + (bitName ? '' : ' unused')}
              onMouseEnter={() => (bitName ? onHoverBit(bitName, bit) : onHoverRegister())}
              onMouseLeave={onLeave}
            >
              <span className="bit-value">{set ? '1' : '0'}</span>
              <span className="bit-name">{bitName ?? '–'}</span>
            </span>
          )
        })}
      </span>
    </div>
  )
}
