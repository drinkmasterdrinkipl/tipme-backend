import { SafeAreaView } from 'react-native-safe-area-context';
// ============================================
// OnboardingScreen.tsx — Rejestracja + Stripe Connect
// Pierwszy ekran który widzi nowy użytkownik
// ============================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  const [step, setStep] = useState<'welcome' | 'prepare' | 'register' | 'login' | 'set-password' | 'stripe' | 'done'>('welcome');
  const [migrationAccountId, setMigrationAccountId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [onboardingUrl, setOnboardingUrl] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const ensureLocationRef = useRef(false);
  const MAX_POLLS = 240; // 240 × 30s = 2 godziny

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ============================================
  // Rejestracja + tworzenie konta Stripe Connect
  // ============================================
  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

  const connectStripe = async () => {
    if (!isValidEmail(email)) {
      Alert.alert('Błąd', 'Podaj poprawny adres email');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Błąd', 'Hasło musi mieć minimum 8 znaków');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch(`${API_URL}/api/create-connected-account`, {
        method: 'POST',
        body: JSON.stringify({ email, firstName, lastName, password }),
      });

      const { accountId, onboardingUrl, error } = await res.json();
      if (res.status === 409) {
        Alert.alert(
          'Masz już konto',
          'Konto z tym emailem już istnieje. Zaloguj się zamiast rejestrować.',
          [{ text: 'Zaloguj się', onPress: () => setStep('login') }, { text: 'Anuluj', style: 'cancel' }]
        );
        return;
      }
      if (!res.ok || error) throw new Error(error || `Błąd serwera (${res.status})`);

      // Zapisz ID konta lokalnie
      await AsyncStorage.setItem('stripeAccountId', accountId);
      await AsyncStorage.setItem('userEmail', email);

      // Otwórz onboarding Stripe wewnątrz aplikacji (WebView)
      // Po powrocie automatycznie sprawdź status konta
      setOnboardingUrl(onboardingUrl);
      navigation.navigate('StripeWebView', {
        url: onboardingUrl,
        onDone: () => checkStripeStatus(),
      });
      setStep('stripe');
    } catch (error: any) {
      if (mountedRef.current) Alert.alert('Błąd', error.message || 'Nie udało się połączyć ze Stripe');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  // ============================================
  // Logowanie istniejącym kontem Stripe
  // ============================================
  const loginWithEmail = async () => {
    if (!isValidEmail(email)) {
      Alert.alert('Błąd', 'Podaj poprawny adres email');
      return;
    }
    if (!password) {
      Alert.alert('Błąd', 'Podaj hasło');
      return;
    }
    setLoading(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000); // 60s na cold start
      let res: Response;
      try {
        res = await apiFetch(`${API_URL}/api/auth/login`, {
          method: 'POST',
          body: JSON.stringify({ email, password }),
          signal: controller.signal,
        });
      } catch (e: any) {
        if (e.name === 'AbortError') throw new Error('Serwer się budzi — spróbuj ponownie za chwilę');
        throw new Error('Brak połączenia z internetem');
      } finally {
        clearTimeout(timeout);
      }
      const data = await res.json();

      // Konto bez hasła — przekieruj do ustawienia hasła
      if (res.status === 403 && data.needsPassword) {
        setMigrationAccountId(data.accountId);
        await AsyncStorage.setItem('stripeAccountId', data.accountId);
        await AsyncStorage.setItem('userEmail', email);
        setPassword('');
        setStep('set-password');
        return;
      }

      if (!res.ok) throw new Error(data.error || 'Błąd serwera');

      await AsyncStorage.setItem('stripeAccountId', data.accountId);
      await AsyncStorage.setItem('userEmail', email);
      if (data.token) await AsyncStorage.setItem('authToken', data.token);

      if (data.chargesEnabled) {
        await ensureLocationId(data.accountId);
        if (onComplete) onComplete();
        else navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      } else {
        setStep('stripe');
      }
    } catch (error: any) {
      if (mountedRef.current) Alert.alert('Błąd', error.message || 'Nieprawidłowy email lub hasło');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const setPasswordForMigration = async () => {
    if (password.length < 8) {
      Alert.alert('Błąd', 'Hasło musi mieć minimum 8 znaków');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch(`${API_URL}/api/auth/set-password`, {
        method: 'POST',
        body: JSON.stringify({ accountId: migrationAccountId, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Błąd serwera');

      if (data.token) await AsyncStorage.setItem('authToken', data.token);
      await ensureLocationId(migrationAccountId);

      if (data.chargesEnabled) {
        if (onComplete) onComplete();
        else navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      } else {
        setStep('stripe');
      }
    } catch (error: any) {
      if (mountedRef.current) Alert.alert('Błąd', error.message || 'Nie udało się ustawić hasła');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  // ============================================
  // Helper — tworzy lokalizację Stripe Terminal jeśli brak
  // Mutex ref zapobiega równoległym wywołaniom (np. z pollingu i checkStripeStatus)
  // ============================================
  const ensureLocationId = async (accountId: string) => {
    const existing = await AsyncStorage.getItem('stripeLocationId');
    if (existing) return;
    if (ensureLocationRef.current) return; // już trwa tworzenie
    ensureLocationRef.current = true;
    try {
      const locRes = await apiFetch(`${API_URL}/api/create-location`, {
        method: 'POST',
        body: JSON.stringify({ stripeAccountId: accountId, displayName: 'Tip For Me' }),
      });
      const locData = await locRes.json();
      if (!locRes.ok) throw new Error(`Błąd lokalizacji: ${locData.error}`);
      if (locData.locationId) await AsyncStorage.setItem('stripeLocationId', locData.locationId);
    } finally {
      ensureLocationRef.current = false;
    }
  };

  // ============================================
  // Sprawdź czy użytkownik dokończył onboarding
  // useCallback — żeby interval zawsze miał aktualną referencję
  // WAŻNE: musi być zadeklarowany PRZED useEffect który go używa w deps
  // ============================================
  const checkStripeStatus = useCallback(async (silent = false) => {
    if (!silent && mountedRef.current) setLoading(true);
    try {
      const accountId = await AsyncStorage.getItem('stripeAccountId');
      if (!accountId) {
        if (!silent && mountedRef.current) Alert.alert('Błąd', 'Brak ID konta. Zacznij rejestrację od nowa.');
        return;
      }
      const res = await apiFetch(`${API_URL}/api/account-status/${accountId}`);
      if (!res.ok) throw new Error(`Błąd serwera (${res.status})`);
      const data = await res.json();
      if (!mountedRef.current) return;

      if (data.chargesEnabled) {
        if (pollRef.current) clearInterval(pollRef.current);
        if (data.token) await AsyncStorage.setItem('authToken', data.token);
        await ensureLocationId(accountId);
        if (!mountedRef.current) return;
        if (onComplete) onComplete();
        else navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      } else if (!data.detailsSubmitted) {
        // Zapisane ID wskazuje na złe konto — wyczyść i wróć do logowania
        await AsyncStorage.multiRemove([
          'stripeAccountId', 'authToken', 'stripeLocationId', 'userEmail',
          'tapToPayEnabled', 'tapToPayWelcomeShown', 'tapToPayEducationShown',
        ]).catch(() => {});
        if (!mountedRef.current) return;
        setStatusMsg('');
        setStep('login');
      } else {
        if (mountedRef.current) setStatusMsg('Konto jeszcze niezweryfikowane. Stripe może potrzebować do 24h.');
      }
    } catch (error) {
      if (!silent && mountedRef.current) setStatusMsg('Błąd połączenia — sprawdź internet i spróbuj ponownie.');
    } finally {
      if (!silent && mountedRef.current) setLoading(false);
    }
  }, [onComplete, navigation]);

  // Automatyczne sprawdzanie statusu co 30s gdy jesteśmy na ekranie 'stripe'
  useEffect(() => {
    if (step === 'stripe') {
      pollRef.current = setInterval(() => {
        setPollCount(c => {
          const next = c + 1;
          if (next >= MAX_POLLS) {
            if (pollRef.current) clearInterval(pollRef.current);
            Alert.alert(
              'Weryfikacja trwa długo',
              'Stripe nadal weryfikuje Twoje dane. Dostaniesz email gdy konto będzie gotowe — możesz zamknąć aplikację.',
            );
          }
          return next;
        });
        checkStripeStatus(true);
      }, 30000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [step, checkStripeStatus]);

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
              ['⚡', 'Automatyczna wypłata na konto'],
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

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => setStep('login')}
          >
            <Text style={styles.secondaryBtnText}>Mam już konto — zaloguj się</Text>
          </TouchableOpacity>

          <Text style={styles.taxNote}>
            Napiwki stanowią Twój przychód i podlegają opodatkowaniu PIT. Korzystając z aplikacji akceptujesz{' '}
            <Text style={styles.taxNoteLink}>Regulamin</Text>.
          </Text>
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
          <Text style={styles.stepTitle}>Twoje dane</Text>
          <Text style={styles.stepDesc}>
            Podaj dane które Stripe wstępnie wypełni za Ciebie
          </Text>

          <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginBottom: 10 }}>
            <TextInput
              style={[styles.emailInput, { flex: 1, marginBottom: 0 }]}
              placeholder="Imię"
              placeholderTextColor="#444"
              autoCapitalize="words"
              autoCorrect={false}
              value={firstName}
              onChangeText={setFirstName}
              accessibilityLabel="Imię"
            />
            <TextInput
              style={[styles.emailInput, { flex: 1, marginBottom: 0 }]}
              placeholder="Nazwisko"
              placeholderTextColor="#444"
              autoCapitalize="words"
              autoCorrect={false}
              value={lastName}
              onChangeText={setLastName}
              accessibilityLabel="Nazwisko"
            />
          </View>

          <TextInput
            style={styles.emailInput}
            placeholder="jan@example.com"
            placeholderTextColor="#444"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
            accessibilityLabel="Adres email"
          />
          <TextInput
            style={styles.emailInput}
            placeholder="Hasło (min. 8 znaków)"
            placeholderTextColor="#444"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            value={password}
            onChangeText={setPassword}
            accessibilityLabel="Hasło"
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

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => setStep('login')}
          >
            <Text style={styles.secondaryBtnText}>Mam już konto — zaloguj się</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ============================================
  // EKRAN LOGOWANIA (istniejące konto)
  // ============================================
  if (step === 'login') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.stepIcon}>🔑</Text>
          <Text style={styles.stepTitle}>Zaloguj się</Text>
          <Text style={styles.stepDesc}>
            Podaj email i hasło użyte przy rejestracji
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
            accessibilityLabel="Adres email"
          />
          <TextInput
            style={styles.emailInput}
            placeholder="Hasło"
            placeholderTextColor="#444"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            value={password}
            onChangeText={setPassword}
            accessibilityLabel="Hasło"
          />

          <TouchableOpacity
            style={[styles.primaryBtn, (loading || !isValidEmail(email) || !password) && styles.btnDisabled]}
            onPress={loginWithEmail}
            disabled={loading || !isValidEmail(email) || !password}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Zaloguj się →</Text>
            )}
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
  // EKRAN OCZEKIWANIA NA STRIPE
  // ============================================
  if (step === 'stripe') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.stepIcon}>⚡</Text>
          <Text style={styles.stepTitle}>Oczekiwanie na weryfikację</Text>
          <Text style={styles.stepDesc}>
            Stripe weryfikuje Twoje dane.{'\n'}
            Sprawdzamy automatycznie co 30 sekund.{'\n'}
            Dostaniesz też email gdy konto będzie gotowe.
          </Text>
          {statusMsg ? (
            <Text style={{ color: '#f87171', fontSize: 13, marginBottom: 16, textAlign: 'center' }}>
              {statusMsg}
            </Text>
          ) : pollCount > 0 ? (
            <Text style={{ color: '#555', fontSize: 12, marginBottom: 16 }}>
              Sprawdzono: {pollCount}x — weryfikacja w toku...
            </Text>
          ) : null}

          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.btnDisabled]}
            onPress={() => { setStatusMsg(''); checkStripeStatus(); }}
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
            onPress={() => {
              if (onboardingUrl) {
                navigation.navigate('StripeWebView', { url: onboardingUrl, onDone: () => checkStripeStatus() });
              }
            }}
          >
            <Text style={styles.secondaryBtnText}>Otwórz Stripe ponownie</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ============================================
  // EKRAN USTAWIENIA HASŁA (migracja starych kont)
  // ============================================
  if (step === 'set-password') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.stepIcon}>🔐</Text>
          <Text style={styles.stepTitle}>Ustaw hasło</Text>
          <Text style={styles.stepDesc}>
            Twoje konto wymaga ustawienia hasła aby się zalogować.
          </Text>

          <TextInput
            style={styles.emailInput}
            placeholder="Nowe hasło (min. 8 znaków)"
            placeholderTextColor="#444"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            value={password}
            onChangeText={setPassword}
            accessibilityLabel="Nowe hasło"
          />

          <TouchableOpacity
            style={[styles.primaryBtn, (loading || password.length < 8) && styles.btnDisabled]}
            onPress={setPasswordForMigration}
            disabled={loading || password.length < 8}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.primaryBtnText}>Ustaw hasło i zaloguj →</Text>
            }
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
  taxNote: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 16,
    paddingHorizontal: 16,
  },
  taxNoteLink: {
    color: 'rgba(192,132,252,0.6)',
    textDecorationLine: 'underline',
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
