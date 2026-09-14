import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import axios from 'axios';
import './index.css';
import App from './App';

const ADMIN_PASSWORD_KEY = 'tt-league:adminPassword:v1';
const ADMIN_NAME_KEY = 'tt-league:adminName:v1';

axios.interceptors.request.use((config) => {
  try {
    const password = window.localStorage.getItem(ADMIN_PASSWORD_KEY);
    const name = window.localStorage.getItem(ADMIN_NAME_KEY);
    if (password || name) {
      config.headers = config.headers || {};
      if (password) config.headers['X-Admin-Password'] = password;
      if (name) config.headers['X-Admin-Name'] = name;
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
