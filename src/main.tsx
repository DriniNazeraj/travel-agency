import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

const el = document.getElementById('root')
if (!el) throw new Error('root element missing')

const tree = (
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)

if (el.hasChildNodes()) {
  hydrateRoot(el, tree)
} else {
  createRoot(el).render(tree)
}
