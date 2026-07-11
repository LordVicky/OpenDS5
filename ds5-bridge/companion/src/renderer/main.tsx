import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { SetupWizard } from './SetupWizard';
import './styles.css';

const isSetup = new URLSearchParams(window.location.search).has('setup');

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isSetup ? <SetupWizard /> : <App />}</React.StrictMode>
);
