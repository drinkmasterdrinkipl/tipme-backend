// ============================================
// TapScreen.tsx — Ekran Tap to Pay (NFC)
// Tutaj klient przykłada kartę do telefonu
// ============================================

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  useStripeTerminal,
  CommonError,
} from '@stripe/stripe-terminal-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../App';

export default function TapScreen({ navigation, route }: any) {
  const { amount } = route.params; // kwota w groszach
  const amountZl = (amount / 100).toFixed(0);

  const [status, setStatus] = useState<'connecting' | 'ready' | 'processing' | 'error'>('connecting');
  const [errorMsg, setErrorMsg] = useState('');

  const {
    discoverReaders,
    connectLocalMobileReader,
    createPaymentIntent,
    collectPaymentMethod,
    confirmPaymentIntent,
  } = useStripeTerminal();

  useEffect(() => {
    initializeReader();
  }, []);

  // ============================================
  // KROK 1: Połącz z czytnikiem Tap to Pay
  // (wbudowany NFC w iPhone)
  // ============================================
  const initializeReader = async () => {
    try {
      setStatus('connecting');

      // Odkryj lokalny czytnik (NFC w telefonie)
      const { readerDiscoveries, error: discoverError } = await discoverReaders({
        discoveryMethod: 'localMobile',
        simulated: false, // zmień na true do testowania
      });

      if (discoverError) {
        throw new Error(discoverError.message);
      }

      if (!readerDiscoveries || readerDiscoveries.length === 0) {
        throw new Error('Nie znaleziono czytnika NFC');
      }

      // Połącz z pierwszym dostępnym czytnikiem
      const { reader, error: connectError } = await connectLocalMobileReader({
        reader: readerDiscoveries[0],
        locationId: 'tml_xxx', // ID lokalizacji z Stripe Terminal
      });

      if (connectError) {
        throw new Error(connectError.message);
      }

      setStatus('ready');
    } catch (error: any) {
      setStatus('error');
      setErrorMsg(error.message || 'Błąd połączenia');
    }
  };

  // ============================================
  // KROK 2: Procesuj płatność
  // ============================================
  const processPayment = async () => {
    try {
      setStatus('processing');

      const accountId = await AsyncStorage.getItem('stripeAccountId');

      // 2a. Utwórz Payment Intent na serwerze
      const res = await fetch(`${API_URL}/api/create-payment-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amount,
          stripeAccountId: accountId,
        }),
      });

      const { clientSecret, error: serverError } = await res.json();
      if (serverError) throw new Error(serverError);

      // 2b. Zbierz metodę płatności (klient przykłada kartę)
      // Tu Stripe Terminal przejmuje ekran i pokazuje animację NFC
      const { paymentIntent: collectedPI, error: collectError } =
        await collectPaymentMethod({ clientSecret });

      if (collectError) {
        if (collectError.code === CommonError.Canceled) {
          setStatus('ready');
          return;
        }
        throw new Error(collectError.message);
      }

      // 2c. Potwierdź płatność
      const { paymentIntent: confirmedPI, error: confirmError } =
        await confirmPaymentIntent({ clientSecret });

      if (confirmError) {
        throw new Error(confirmError.message);
      }

      // Sukces! Przejdź do ekranu sukcesu
      navigation.replace('Success', {
        amount: amountZl,
        paymentMethod: confirmedPI?.charges?.[0]?.paymentMethodDetails?.cardPresent?.brand || 'Karta',
        last4: confirmedPI?.charges?.[0]?.paymentMethodDetails?.cardPresent?.last4 || '****',
      });

    } catch (error: any) {
      setStatus('error');
      setErrorMsg(error.message || 'Błąd płatności');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Przycisk powrotu */}
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.backText}>←</Text>
      </TouchableOpacity>

      <View style={styles.content}>
        {/* Kwota */}
        <Text style={styles.amount}>{amountZl} zł</Text>
        <Text style={styles.label}>napiwek</Text>

        {/* Status */}
        {status === 'connecting' && (
          <>
            <ActivityIndicator size="large" color="#a855f7" style={{ marginTop: 40 }} />
            <Text style={styles.statusText}>Łączenie z NFC...</Text>
          </>
        )}

        {status === 'ready' && (
          <>
            {/* Strefa NFC */}
            <View style={styles.nfcZone}>
              <Text style={styles.nfcIcon}>💳</Text>
            </View>
            <Text style={styles.tapTitle}>Przyłóż kartę</Text>
            <Text style={styles.tapDesc}>
              Klient przykłada kartę lub telefon{'\n'}do tylnej części urządzenia
            </Text>
            <TouchableOpacity style={styles.tapBtn} onPress={processPayment}>
              <Text style={styles.tapBtnText}>Rozpocznij płatność</Text>
            </TouchableOpacity>
          </>
        )}

        {status === 'processing' && (
          <>
            <ActivityIndicator size="large" color="#a855f7" style={{ marginTop: 40 }} />
            <Text style={styles.statusText}>Przetwarzanie płatności...</Text>
            <Text style={styles.statusSub}>Klient niech trzyma kartę przy telefonie</Text>
          </>
        )}

        {status === 'error' && (
          <>
            <View style={styles.errorBadge}>
              <Text style={styles.errorIcon}>⚠️</Text>
            </View>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={initializeReader}>
              <Text style={styles.retryText}>Spróbuj ponownie</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c0a13',
  },
  backBtn: {
    position: 'absolute',
    top: 60,
    left: 20,
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  backText: {
    color: '#888',
    fontSize: 18,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  amount: {
    fontSize: 56,
    fontWeight: '900',
    color: '#c084fc',
    letterSpacing: -3,
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginBottom: 30,
  },
  nfcZone: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 2,
    borderColor: 'rgba(168,85,247,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: 30,
  },
  nfcIcon: {
    fontSize: 56,
  },
  tapTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#f0eef5',
    marginBottom: 6,
  },
  tapDesc: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
    lineHeight: 22,
  },
  tapBtn: {
    marginTop: 36,
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 16,
    backgroundColor: '#a855f7',
    shadowColor: '#a855f7',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  tapBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  statusText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#c084fc',
    marginTop: 20,
  },
  statusSub: {
    fontSize: 13,
    color: '#555',
    marginTop: 8,
  },
  errorBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(239,68,68,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 30,
    marginBottom: 16,
  },
  errorIcon: {
    fontSize: 36,
  },
  errorText: {
    fontSize: 14,
    color: '#ef4444',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(168,85,247,0.25)',
    backgroundColor: 'rgba(168,85,247,0.1)',
  },
  retryText: {
    color: '#c084fc',
    fontSize: 15,
    fontWeight: '700',
  },
});
