import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// The service worker used to keep a 'posters' runtime cache; delete what earlier versions left.
if (typeof caches !== 'undefined') caches.delete('posters').catch(() => {})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
