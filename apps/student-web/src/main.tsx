import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/globals.css';
// W16.4 — apply the stored font-size preference BEFORE first paint (the
// rem-based UI scales off <html>); the server value reconciles after login
// via useFontSizeSync in AppShell.
import { applyFontSizeStep, readStoredFontSizeStep } from './features/settings/font-size';

applyFontSizeStep(readStoredFontSizeStep());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
