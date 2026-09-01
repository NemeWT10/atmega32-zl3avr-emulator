/**
 * Podsumowanie polaczen na plytce - „co jest podpiete do ktorego portu”.
 *
 * Sluzy analizie kodu. Kompilator wie wszystko o skladni i nic o tym, ze zyla
 * z portu B nie zostala poprowadzona - a to najczestsza przyczyna zdania
 * „program jest dobry, a nic sie nie dzieje”. Zeby moc o tym powiedziec,
 * analiza musi dostac stan plytki w postaci, ktora da sie ubrac w zdanie:
 * nie liste par pinow, tylko „port B -> Diody LED, siedem zyl”.
 *
 * Zrodlo przyporzadkowania zlacz do portow: `connectors.ts`.
 */

import type { Wire } from './board'
import { CONNECTORS, type ConnectorId, type PinRef } from './connectors'

export type PortName = 'A' | 'B' | 'C' | 'D'

/** Zlacze szpilkowe, na ktore wyprowadzony jest kazdy z portow. */
export const PORT_CONNECTORS: Record<PortName, ConnectorId> = {
  A: 'JP17',
  B: 'JP16',
  C: 'JP18',
  D: 'JP19',
}

export interface PortWiring {
  /** Ile zyl wychodzi ze zlacza tego portu. */
  count: number
  /**
   * Nazwy zlacz po drugiej stronie zyl, bez powtorzen, np. „Diody LED”.
   * To jest to, co student zobaczy w komunikacie.
   */
  targets: string[]
  /**
   * Numery LINII portu (0–7), z ktorych wychodzi przewod, posortowane rosnaco.
   *
   * Potrzebne regulom, ktore pytaja o konkretny pin — np. „przerwanie INT0
   * nasluchuje na PD2, a PD2 nie ma przewodu”. Sama liczba zyl tego nie
   * rozstrzyga: port moze miec cztery przewody i zadnego z wlasciwej linii.
   */
  pins: number[]
}

export interface WiringSummary {
  /** Ile zyl jest w ogole na plytce - odroznia „pusta plytka” od „zle podlaczonej”. */
  total: number
  ports: Record<PortName, PortWiring>
}

const PORT_OF: Partial<Record<ConnectorId, PortName>> = Object.fromEntries(
  Object.entries(PORT_CONNECTORS).map(([port, connector]) => [connector, port as PortName]),
) as Partial<Record<ConnectorId, PortName>>

function connectorName(pin: PinRef): string {
  return CONNECTORS[pin.connector]?.name ?? pin.connector
}

/** Zestawienie polaczen w postaci uzywanej przez analize kodu. */
export function describeWiring(wires: Wire[]): WiringSummary {
  const ports: Record<PortName, PortWiring> = {
    A: { count: 0, targets: [], pins: [] },
    B: { count: 0, targets: [], pins: [] },
    C: { count: 0, targets: [], pins: [] },
    D: { count: 0, targets: [], pins: [] },
  }

  for (const wire of wires) {
    for (const [near, far] of [
      [wire.a, wire.b],
      [wire.b, wire.a],
    ] as const) {
      const port = PORT_OF[near.connector]
      if (!port) continue
      ports[port].count++
      // Zyla poprowadzona z portu do portu (np. przy zadaniach z „przepisywaniem”
      // stanu) opisuje sie nazwa drugiego zlacza - tak samo jak peryferium.
      const name = connectorName(far)
      if (!ports[port].targets.includes(name)) ports[port].targets.push(name)
      if (!ports[port].pins.includes(near.index)) ports[port].pins.push(near.index)
    }
  }

  for (const port of Object.values(ports)) port.pins.sort((a, b) => a - b)

  return { total: wires.length, ports }
}
