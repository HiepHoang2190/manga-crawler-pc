import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import { ThemeProvider } from './context/ThemeContext';
import { I18nProvider } from './context/I18nContext';
import { BrandingProvider } from './context/BrandingContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <BrandingProvider>
          <App />
        </BrandingProvider>
      </ThemeProvider>
    </I18nProvider>
  </React.StrictMode>
);
