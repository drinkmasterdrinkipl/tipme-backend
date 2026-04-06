export const API_URL = 'https://tipme-backend-2rcv.onrender.com';

// Musi być identyczny z API_SECRET w zmiennych środowiskowych na Render.com
// Wygeneruj silny sekret: np. openssl rand -hex 32
export const API_KEY = '4e741ee70c6febb1b52a6b116f945b04';

export const apiFetch = (url: string, options: RequestInit = {}) =>
  fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': API_KEY,
      ...(options.headers as Record<string, string>),
    },
  });
