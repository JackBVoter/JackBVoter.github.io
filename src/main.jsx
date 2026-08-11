import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

// React-Bootstrap uses Bootstrap's stylesheet; import it once here.
import 'bootstrap/dist/css/bootstrap.min.css'
import './index.css'
// Trapinch theme — must come after Bootstrap so its overrides win. Delete this
// line and src/theme.css to return to stock Bootstrap.
import './theme.css'

import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
