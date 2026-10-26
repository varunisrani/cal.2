import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// The tokens first, so component styles imported after them can build on them.
import './ui/tokens.css';
import { App } from './app/App';
import { applyTheme, DEFAULT_THEME } from './ui/theme';

const container = document.getElementById('root');
if (!container) throw new Error('Platewise: #root element missing from index.html');

// The stored default until settings exist: follow the device, Basil accent.
applyTheme(DEFAULT_THEME);

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
