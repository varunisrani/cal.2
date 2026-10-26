import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { applyTheme, DEFAULT_THEME } from './ui/theme';
import './ui/tokens.css';

// The defaults until the theme provider (P04-06) reads the stored choice and applies it.
applyTheme(DEFAULT_THEME);

const container = document.getElementById('root');
if (!container) throw new Error('Platewise: #root element missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
