import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import axios from 'axios';
import './index.css';
import App from './App';

const ADMIN_PASSWORD_KEY = 'tt-league:adminPassword:v1';

axios.interceptors.request.use((config) => {
  try {
    const password = window.localStorage.getItem(ADMIN_PASSWORD_KEY);
    if (password) {
      config.headers = config.headers || {};
      config.headers['X-Admin-Password'] = password;
    }
  } catch (e) {
    // ignore
  }
  return config;
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
