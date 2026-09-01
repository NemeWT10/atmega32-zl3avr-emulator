import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './monacoSetup'
import { App } from './App'
import { SimulationProvider } from './sim/SimulationContext'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SimulationProvider>
      <App />
    </SimulationProvider>
  </StrictMode>,
)
