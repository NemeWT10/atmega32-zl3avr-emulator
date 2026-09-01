import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Simulator, type SimulatorEvent } from './Simulator'

const SimulatorContext = createContext<Simulator | null>(null)

export function SimulationProvider({ children }: { children: ReactNode }) {
  const simulator = useMemo(() => {
    const instance = new Simulator()
    // W trybie deweloperskim symulator jest dostepny z konsoli przegladarki -
    // bez tego diagnozowanie stanu rejestrow w dzialajacej aplikacji jest meczarnia.
    if (import.meta.env.DEV) (window as unknown as { sim: Simulator }).sim = instance
    return instance
  }, [])
  return <SimulatorContext.Provider value={simulator}>{children}</SimulatorContext.Provider>
}

export function useSimulator(): Simulator {
  const simulator = useContext(SimulatorContext)
  if (!simulator) throw new Error('useSimulator poza SimulationProvider')
  return simulator
}

/**
 * Odswieza komponent przy wybranych zdarzeniach symulatora.
 *
 * Zdarzenie `tick` leci co klatke, ale odrysowanie ograniczamy do `fps`,
 * zeby interfejs nie zjadal czasu potrzebnego samej symulacji.
 */
export function useSimulatorEvents(events: SimulatorEvent[], fps = 30): number {
  const simulator = useSimulator()
  const [version, setVersion] = useState(0)
  const lastRender = useRef(0)

  useEffect(() => {
    const minInterval = 1000 / fps
    const unsubscribes = events.map((event) =>
      simulator.on(event, () => {
        const now = performance.now()
        if (event === 'tick' && now - lastRender.current < minInterval) return
        lastRender.current = now
        setVersion((value) => value + 1)
      }),
    )
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulator, fps, events.join(',')])

  return version
}
