import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// The tokens first, so component styles imported after them can build on them.
import './ui/tokens.css';
import { App } from './app/App';
import { temporaryPorts } from './app/ports';
import { createRouter, windowHost } from './app/router';

const container = document.getElementById('root');
if (!container) throw new Error('Platewise: #root element missing from index.html');

// The theme comes from the ThemeProvider inside App. Until the repositories are adapted to the
// shell's ports, the app reads the default settings and has no completed profile.
const router = createRouter(windowHost());

createRoot(container).render(
  <StrictMode>
    <App ports={temporaryPorts()} router={router} />
  </StrictMode>,
);
