// ============================================
// useTapToPayNotification.ts
// Wymaganie Apple 3.3 + 6.3: push notification o Tap to Pay na iPhonie
// Wysyłany raz do każdego zalogowanego użytkownika
// ============================================

import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const NOTIF_KEY = 'tapToPayNotificationSent';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function requestPermissionsAndSchedule() {
  // Tylko na fizycznym urządzeniu
  if (!Device.isDevice) return;
  if (Platform.OS !== 'ios') return;

  // Sprawdź czy już wysłano
  const sent = await AsyncStorage.getItem(NOTIF_KEY);
  if (sent === 'true') return;

  // Poproś o uprawnienia
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return;

  // Wyślij powiadomienie (wymaganie Apple 3.3 / 6.3)
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Tap to Pay na iPhonie',
      body: 'Zbieraj napiwki zbliżeniowo — klient przykłada kartę do Twojego iPhone\'a. Bez terminala.',
      sound: false,
    },
    trigger: { seconds: 3 }, // Po 3 sekundach od zalogowania
  });

  await AsyncStorage.setItem(NOTIF_KEY, 'true');
}

export function useTapToPayNotification(isLoggedIn: boolean) {
  useEffect(() => {
    if (!isLoggedIn) return;
    requestPermissionsAndSchedule().catch(() => {});
  }, [isLoggedIn]);
}
