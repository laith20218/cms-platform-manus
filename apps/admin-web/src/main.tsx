/** Style reminder — غرفة القيادة السريرية: functional bilingual administration with deliberate, calm clinical feedback. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/globals.css';

// W14.3 Phase A (D4): the academic context lives in the URL query string —
// the Router provider makes it readable/writable via useSearchParams.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
