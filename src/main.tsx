import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { SessionReportProvider } from './context/SessionReportContext.tsx';
import AppErrorBoundary from './components/AppErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionReportProvider>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </SessionReportProvider>
  </StrictMode>,
);
