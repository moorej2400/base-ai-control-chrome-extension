import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './style.css';

// Side-panel React entry. (Editing this file forces a full Vite reload, which
// is the clean way to bootstrap dev-bridge/transport changes that HMR otherwise
// absorbs into a Fast Refresh boundary without re-running the install effect.)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
