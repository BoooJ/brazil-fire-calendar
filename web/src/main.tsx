import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import App from './App';

// Each page brings its own stylesheet (pages/Tool.tsx -> styles.css, pages/Landing.tsx -> landing/landing.css).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
