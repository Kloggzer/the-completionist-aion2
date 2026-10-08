import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { startHost } from './core/host'
// Feature modules register their host message handlers on import.
import './core/session'
import './core/data'
import './features/pets'
import './features/map'
import './features/events'
import './features/progress'

createRoot(document.getElementById('root')!).render(<App />)
startHost()
