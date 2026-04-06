// Klucz dostępu do panelu admina
// Musi być identyczny z ADMIN_SECRET w zmiennych środowiskowych na Render.com
// Wygeneruj: openssl rand -hex 32
export const ADMIN_KEY = 'ZMIEN_NA_SWOJ_ADMIN_SECRET';

// Email właściciela platformy — tylko ten email widzi przycisk "Panel Admina"
export const ADMIN_EMAIL = 'TWOJ_EMAIL@EXAMPLE.COM';
