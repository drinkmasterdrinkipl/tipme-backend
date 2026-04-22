import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, ScrollView, Keyboard,
} from 'react-native';
import { API_URL, apiFetch } from '../config';

export default function ResetPasswordScreen({ route, navigation }: any) {
  const token: string = route?.params?.token ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const isValid = password.length >= 8 && password === confirm;

  const handleReset = async () => {
    if (!isValid) return;
    Keyboard.dismiss();
    setLoading(true);
    try {
      const res = await apiFetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Błąd serwera');
      setDone(true);
    } catch (e: any) {
      const msg: string = e.message || '';
      if (msg.includes('wygasł') || msg.includes('już użyty') || msg.includes('nieprawidłowy')) {
        Alert.alert(
          'Link nieważny',
          'Ten link wygasł lub został już użyty. Wróć do logowania i wybierz "Zapomniałem hasła" aby otrzymać nowy.',
          [
            { text: 'Wróć do logowania', onPress: () => navigation.navigate('Onboarding') },
          ]
        );
      } else {
        Alert.alert('Błąd', msg || 'Nie udało się zmienić hasła. Spróbuj ponownie.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.content}>
          <Text style={s.icon}>✅</Text>
          <Text style={s.title}>Hasło zmienione</Text>
          <Text style={s.desc}>
            Twoje nowe hasło zostało zapisane.{'\n'}
            Możesz się teraz zalogować.
          </Text>
          <TouchableOpacity
            style={s.primaryBtn}
            onPress={() => navigation.navigate('Onboarding')}
          >
            <Text style={s.primaryBtnText}>Przejdź do logowania →</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!token) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.content}>
          <Text style={s.icon}>⚠️</Text>
          <Text style={s.title}>Nieprawidłowy link</Text>
          <Text style={s.desc}>
            Link resetujący jest nieprawidłowy lub wygasł.{'\n'}
            Poproś o nowy link w aplikacji.
          </Text>
          <TouchableOpacity
            style={s.primaryBtn}
            onPress={() => navigation.goBack()}
          >
            <Text style={s.primaryBtnText}>Wróć</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={s.icon}>🔐</Text>
        <Text style={s.title}>Nowe hasło</Text>
        <Text style={s.desc}>
          Podaj nowe hasło do swojego konta Tip For Me.
        </Text>

        <TextInput
          style={s.input}
          placeholder="Nowe hasło (min. 8 znaków)"
          placeholderTextColor="#444"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          value={password}
          onChangeText={setPassword}
          accessibilityLabel="Nowe hasło"
        />
        <TextInput
          style={[s.input, confirm.length > 0 && password !== confirm && s.inputError]}
          placeholder="Powtórz hasło"
          placeholderTextColor="#444"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          value={confirm}
          onChangeText={setConfirm}
          accessibilityLabel="Powtórz hasło"
        />

        {confirm.length > 0 && password !== confirm && (
          <Text style={s.errorText}>Hasła nie są identyczne</Text>
        )}

        <TouchableOpacity
          style={[s.primaryBtn, (!isValid || loading) && s.btnDisabled]}
          onPress={handleReset}
          disabled={!isValid || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.primaryBtnText}>Zmień hasło →</Text>
          )}
        </TouchableOpacity>

        <View style={s.securityBox}>
          <Text style={s.securityText}>
            🔒 Nowe hasło zostanie od razu zaktualizowane na Twoim koncie Stripe.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0c0a13' },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, paddingVertical: 32 },
  icon: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '900', color: '#f0eef5', marginBottom: 10, letterSpacing: -0.5 },
  desc: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 24, marginBottom: 30 },
  input: {
    width: '100%', paddingVertical: 16, paddingHorizontal: 20,
    borderRadius: 16, borderWidth: 1.5, borderColor: 'rgba(168,85,247,0.2)',
    backgroundColor: 'rgba(255,255,255,0.03)', color: '#fff',
    fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 12,
  },
  inputError: { borderColor: 'rgba(239,68,68,0.5)' },
  errorText: { color: '#ef4444', fontSize: 13, marginBottom: 12 },
  primaryBtn: {
    width: '100%', paddingVertical: 18, borderRadius: 18,
    backgroundColor: '#a855f7', alignItems: 'center',
    shadowColor: '#a855f7', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3, shadowRadius: 20, marginBottom: 20,
  },
  btnDisabled: { opacity: 0.6 },
  primaryBtnText: { fontSize: 17, fontWeight: '800', color: '#fff' },
  securityBox: {
    width: '100%', backgroundColor: 'rgba(168,85,247,0.06)',
    borderWidth: 1, borderColor: 'rgba(168,85,247,0.12)',
    borderRadius: 12, padding: 14,
  },
  securityText: { fontSize: 13, color: '#555', lineHeight: 20, textAlign: 'center' },
});
