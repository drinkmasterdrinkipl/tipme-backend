import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_URL = 'https://tipme-backend-2rcv.onrender.com';

// UWAGA BEZPIECZEŃSTWO: Ten klucz jest widoczny w skompilowanej apce.
// Jeśli zostanie wykradziony, atakujący może wysyłać żądania do backendu.
// Docelowo: zastąp weryfikacją po stronie backendu (np. JWT + rate limiting).
// Musi być identyczny z API_SECRET w zmiennych środowiskowych na Render.com.
export const API_KEY = '4e741ee70c6febb1b52a6b116f945b04';

export const apiFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const token = await AsyncStorage.getItem('authToken');

  // Globalny timeout 15s — tylko gdy caller nie przekazał własnego sygnału
  let controller: AbortController | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  if (!options.signal) {
    controller = new AbortController();
    timeout = setTimeout(() => controller!.abort(), 15000);
  }

  try {
    const response = await fetch(url, {
      ...options,
      signal: options.signal ?? controller?.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': API_KEY,
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(options.headers as Record<string, string>),
      },
    });
    if (response.status === 401) {
      await AsyncStorage.removeItem('authToken');
    }
    return response;
  } finally {
    if (timeout !== null) clearTimeout(timeout);
  }
};
