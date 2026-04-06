import { SafeAreaView } from 'react-native-safe-area-context';
// ============================================
// OnboardingScreen.tsx — Rejestracja + Stripe Connect
// Pierwszy ekran który widzi nowy użytkownik
// ============================================

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Linking,
  Alert,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, apiFetch } from '../config';

export default function OnboardingScreen({ navigation, onComplete }: any) {
  const [step, setStep] = useState<'welcome' | 'prepare' | 'register' | 'stripe' | 'done'>('welcome');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  // ============================================
  // Rejestracja + tworzenie konta Stripe Connect
  // ============================================
  const connectStripe = async () => {
    if (!email.includes('@')) {
      Alert.alert('Błąd', 'Podaj poprawny adres email');
      return;
    }

    setLoading(true);
    try {
      // Utwórz konto Stripe Connect na serwerze
      const res = await apiFetch(`${API_URL}/api/create-connected-account`, {
        method: 'POST',
        body: JSON.stringify({ email }),
      });

      const { accountId, onboardingUrl, error } = await res.json();
      if (error) throw new Error(error);

      // Zapisz ID konta lokalnie
      await AsyncStorage.setItem('stripeAccountId', accountId);
      await AsyncStorage.setItem('userEmail', email);

      // Otwórz onboarding Stripe wewnątrz aplikacji (WebView)
      navigation.navigate('StripeWebView', {
        url: onboardingUrl,
        onDone: () => setStep('stripe'),
      });
      setStep('stripe');
    } catch (error: any) {
      Alert.alert('Błąd', error.message || 'Nie udało się połączyć ze Stripe');
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // Sprawdź czy użytkownik dokończył onboarding
  // ============================================
  const checkStripeStatus = async () => {
    setLoading(true);
    try {
      const accountId = await AsyncStorage.getItem('stripeAccountId');
      if (!accountId) { Alert.alert('Błąd', 'Brak ID konta. Zacznij rejestrację od nowa.'); return; }
      const res = await apiFetch(`${API_URL}/api/account-status/${accountId}`);
      const { chargesEnabled } = await res.json();

      if (chargesEnabled) {
        // Utwórz lokalizację Terminal jeśli jeszcze nie ma
        const existingLocationId = await AsyncStorage.getItem('stripeLocationId');
        if (!existingLocationId) {
          try {
            const locRes = await apiFetch(`${API_URL}/api/create-location`, {
              method: 'POST',
              body: JSON.stringify({ stripeAccountId: accountId, displayName: 'Tip For Me' }),
            });
            const locData = await locRes.json();
            if (locData.locationId) {
              await AsyncStorage.setItem('stripeLocationId', locData.locationId);
            }
          } catch {}
        }
        // Konto gotowe — przejdź do aplikacji
        if (onComplete) {
          onComplete();
        } else {
          navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
        }
      } else {
        Alert.alert(
          'Jeszcze nie gotowe',
          'Dokończ konfigurację konta Stripe. Możesz to zrobić teraz lub później.'
        );
      }
    } catch (error) {
      Alert.alert('Błąd', 'Nie udało się sprawdzić statusu konta');
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // EKRAN POWITALNY
  // ============================================
  if (step === 'welcome') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.logoIcon}>💜</Text>
          <Text style={styles.logoText}>Tip For Me</Text>
          <Text style={styles.tagline}>
            Zbieraj napiwki kartą.{'\n'}Bez terminala, bez gotówki.
          </Text>

          <View style={styles.features}>
            {[
              ['📱', 'Twój telefon = terminal'],
              ['💳', 'Klient przykłada kartę'],
              ['⚡', 'Pieniądze od razu na koncie'],
              ['📊', 'Statystyki w czasie rzeczywistym'],
            ].map(([icon, text], i) => (
              <View key={i} style={styles.featureRow}>
                <Text style={styles.featureIcon}>{icon}</Text>
                <Text style={styles.featureText}>{text}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => setStep('prepare')}
          >
            <Text style={styles.primaryBtnText}>Zacznij zbierać napiwki →</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ============================================
  // EKRAN PRZYGOTOWANIA
  // ============================================
  if (step === 'prepare') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.stepIcon}>📋</Text>
          <Text style={styles.stepTitle}>Przygotuj się</Text>
          <Text style={styles.stepDesc}>
            Rejestracja konta płatności zajmie około{'\n'}
            <Text style={{ color: '#a855f7', fontWeight: '800' }}>10 minut</Text>
            . Zrobisz to tylko raz.
          </Text>

          <View style={styles.prepareList}>
            {[
              ['📧', 'Adres email', 'Do założenia konta Stripe'],
              ['🪪', 'Dowód osobisty lub paszport', 'Weryfikacja tożsamości'],
              ['🏦', 'Numer konta bankowego (IBAN)', 'Na które trafią napiwki'],
              ['📱', 'Telefon przy sobie', 'SMS z kodem weryfikacyjnym'],
            ].map(([icon, title, desc], i) => (
              <View key={i} style={styles.prepareRow}>
                <Text style={styles.prepareIcon}>{icon}</Text>
                <View style={styles.prepareTextWrap}>
                  <Text style={styles.prepareTitle}>{title}</Text>
                  <Text style={styles.prepareDesc}>{desc}</Text>
                </View>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => setStep('register')}
          >
            <Text style={styles.primaryBtnText}>Mam wszystko, dalej →</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => setStep('welcome')}
          >
            <Text style={styles.secondaryBtnText}>Wróć</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ============================================
  // EKRAN REJESTRACJI
  // ============================================
  if (step === 'register') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.stepTitle}>Twój email</Text>
          <Text style={styles.stepDesc}>
            Użyjemy go do utworzenia Twojego konta płatności
          </Text>

          <TextInput
            style={styles.emailInput}
            placeholder="jan@example.com"
            placeholderTextColor="#444"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
          />

          {/* Zgoda na regulamin — wymóg RODO */}
          <TouchableOpacity
            style={styles.termsRow}
            onPress={() => setTermsAccepted(!termsAccepted)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
              {termsAccepted && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.termsText}>
              Akceptuję{' '}
              <Text style={styles.termsLink} onPress={() => Linking.openURL('https://tipme.drinki.pl/regulamin')}>
                Regulamin
              </Text>
              {' '}i{' '}
              <Text style={styles.termsLink} onPress={() => Linking.openURL('https://tipme.drinki.pl/polityka-prywatnosci')}>
                Politykę Prywatności
              </Text>
              {' '}Tip For Me oraz przetwarzanie danych osobowych.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryBtn, (loading || !termsAccepted) && styles.btnDisabled]}
            onPress={connectStripe}
            disabled={loading || !termsAccepted}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Połącz ze Stripe →</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.infoText}>
            Stripe to bezpieczna platforma płatności.{'\n'}
            Twoje dane są chronione przez Stripe (licencja EMI UE).
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ============================================
  // EKRAN OCZEKIWANIA NA STRIPE
  // ============================================
  if (step === 'stripe') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.stepIcon}>⚡</Text>
          <Text style={styles.stepTitle}>Konfiguracja Stripe</Text>
          <Text style={styles.stepDesc}>
            Dokończ konfigurację w przeglądarce,{'\n'}
            a potem wróć tutaj i kliknij przycisk poniżej.
          </Text>

          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.btnDisabled]}
            onPress={checkStripeStatus}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Gotowe — sprawdź status</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={connectStripe}
          >
            <Text style={styles.secondaryBtnText}>Otwórz Stripe ponownie</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c0a13',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  logoIcon: {
    fontSize: 64,
    marginBottom: 10,
  },
  logoText: {
    fontSize: 40,
    fontWeight: '900',
    color: '#a855f7',
    letterSpacing: -1,
    marginBottom: 12,
  },
  tagline: {
    fontSize: 18,
    color: '#888',
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 40,
  },
  features: {
    width: '100%',
    marginBottom: 40,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(168,85,247,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.1)',
  },
  featureIcon: {
    fontSize: 22,
    marginRight: 14,
  },
  featureText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ccc',
  },
  primaryBtn: {
    width: '100%',
    paddingVertical: 18,
    borderRadius: 18,
    backgroundColor: '#a855f7',
    alignItems: 'center',
    shadowColor: '#a855f7',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
  },
  stepIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#f0eef5',
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  stepDesc: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30,
  },
  emailInput: {
    width: '100%',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(168,85,247,0.2)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
  },
  infoText: {
    marginTop: 20,
    fontSize: 12,
    color: '#555',
    textAlign: 'center',
    lineHeight: 20,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
    width: '100%',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(168,85,247,0.4)',
    backgroundColor: 'rgba(168,85,247,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: '#a855f7',
    borderColor: '#a855f7',
  },
  checkmark: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  termsText: {
    flex: 1,
    fontSize: 12,
    color: '#666',
    lineHeight: 20,
  },
  termsLink: {
    color: '#c084fc',
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  secondaryBtn: {
    marginTop: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(168,85,247,0.2)',
  },
  secondaryBtnText: {
    color: '#c084fc',
    fontSize: 14,
    fontWeight: '700',
  },
  prepareList: {
    width: '100%',
    marginBottom: 32,
  },
  prepareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(168,85,247,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.1)',
  },
  prepareIcon: {
    fontSize: 24,
    marginRight: 14,
    width: 32,
    textAlign: 'center',
  },
  prepareTextWrap: {
    flex: 1,
  },
  prepareTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#e0d4f7',
    marginBottom: 2,
  },
  prepareDesc: {
    fontSize: 12,
    color: '#555',
  },
});
