import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_URL = 'https://tipme-backend-2rcv.onrender.com';

// Musi być identyczny z API_SECRET w zmiennych środowiskowych na Render.com
export const API_KEY = '4e741ee70c6febb1b52a6b116f945b04';

export const apiFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const token = await AsyncStorage.getItem('authToken');
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': API_KEY,
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string>),
    },
  });
};
