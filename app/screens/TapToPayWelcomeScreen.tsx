// ============================================
// TapToPayWelcomeScreen.tsx
// Wymaganie Apple: 3.1, 3.2, 3.4, 3.5
// Full-screen modal o Tap to Pay — pokazywany raz
// ============================================

import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function TapToPayWelcomeScreen({ navigation, route }: any) {
  const { onComplete } = route.params ?? {};
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleEnable = async () => {
    setLoading(true);
    try {
      await AsyncStorage.setItem('tapToPayEnabled', 'true');
      await AsyncStorage.setItem('tapToPayWelcomeShown', 'true');
    } finally {
      setLoading(false);
      navigation.navigate('TapToPayEducation', { onComplete });
    }
  };

  const handleSkip = async () => {
    await AsyncStorage.setItem('tapToPayWelcomeShown', 'true');
    onComplete ? onComplete() : navigation.navigate('Main');
  };

  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={s.hero}>
          <View style={s.iconWrap}>
            <Text style={s.icon}>⬡</Text>
          </View>
          <Text style={s.title}>Tap to Pay{'\n'}on iPhone</Text>
          <Text style={s.sub}>
            Przyjmuj płatności zbliżeniowe bezpośrednio swoim iPhonem — bez dodatkowego terminala.
          </Text>
        </View>

        {/* Funkcje */}
        {[
          ['💳', 'Karty zbliżeniowe', 'Visa, Mastercard i inne karty płatnicze'],
          ['📱', 'Apple Pay i Google Pay', 'Portfele cyfrowe i zegarki'],
          ['⚡', 'Natychmiastowa płatność', 'Klient przykłada telefon — gotowe'],
          ['🔒', 'Bezpieczne', 'Szyfrowanie Apple + certyfikacja Stripe'],
        ].map(([icon, title, desc]) => (
          <View key={title} style={s.featureRow}>
            <Text style={s.featureIcon}>{icon}</Text>
            <View style={s.featureText}>
              <Text style={s.featureTitle}>{title}</Text>
              <Text style={s.featureDesc}>{desc}</Text>
            </View>
          </View>
        ))}

        {/* Warunki */}
        <View style={s.termsBox}>
          <Text style={s.termsTitle}>Warunki korzystania z Tap to Pay</Text>
          <Text style={s.termsText}>
            Korzystanie z funkcji Tap to Pay on iPhone podlega Warunkom korzystania z usług Apple
            oraz Stripe. Akceptując, potwierdzasz że masz prawo do przyjmowania płatności w ramach
            działalności gospodarczej i zgadzasz się na przetwarzanie danych transakcji przez Apple
            i Stripe zgodnie z ich politykami prywatności.
          </Text>

          <TouchableOpacity
            style={s.checkRow}
            onPress={() => setAccepted(!accepted)}
            activeOpacity={0.7}
          >
            <View style={[s.checkbox, accepted && s.checkboxChecked]}>
              {accepted && <Text style={s.checkmark}>✓</Text>}
            </View>
            <Text style={s.checkLabel}>
              Akceptuję Warunki korzystania z Tap to Pay on iPhone
            </Text>
          </TouchableOpacity>
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={[s.btn, !accepted && s.btnDisabled]}
          onPress={handleEnable}
          disabled={!accepted || loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnText}>Włącz Tap to Pay →</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity style={s.skipBtn} onPress={handleSkip}>
          <Text style={s.skipText}>Pomiń — włączę później</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#070511' },
  scroll: { paddingHorizontal: 28, paddingBottom: 40 },
  hero: { alignItems: 'center', paddingTop: 32, paddingBottom: 36 },
  iconWrap: {
    width: 100, height: 100, borderRadius: 28,
    backgroundColor: 'rgba(147,51,234,0.12)',
    borderWidth: 1, borderColor: 'rgba(147,51,234,0.3)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  icon: { fontSize: 48, color: '#C084FC' },
  title: {
    fontSize: 34, fontWeight: '900', color: '#F3F0FF',
    textAlign: 'center', letterSpacing: -1, lineHeight: 38, marginBottom: 14,
  },
  sub: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 24 },
  featureRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1, borderColor: 'rgba(149,76,233,0.18)',
    borderRadius: 18, padding: 16, marginBottom: 10,
  },
  featureIcon: { fontSize: 28, width: 44, textAlign: 'center' },
  featureText: { flex: 1, marginLeft: 12 },
  featureTitle: { fontSize: 15, fontWeight: '700', color: '#F3F0FF', marginBottom: 2 },
  featureDesc: { fontSize: 13, color: '#6B7280' },
  termsBox: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(149,76,233,0.15)',
    borderRadius: 18, padding: 18, marginTop: 16, marginBottom: 20,
  },
  termsTitle: { fontSize: 13, fontWeight: '700', color: '#A78BFA', marginBottom: 10 },
  termsText: { fontSize: 12, color: '#4B5563', lineHeight: 20, marginBottom: 16 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start' },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 1.5, borderColor: 'rgba(149,76,233,0.4)',
    backgroundColor: 'rgba(147,51,234,0.06)',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12, marginTop: 1, flexShrink: 0,
  },
  checkboxChecked: { backgroundColor: '#9333EA', borderColor: '#9333EA' },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '800' },
  checkLabel: { flex: 1, fontSize: 13, color: '#9CA3AF', lineHeight: 20 },
  btn: {
    paddingVertical: 20, borderRadius: 22, backgroundColor: '#9333EA',
    alignItems: 'center', marginBottom: 14,
    shadowColor: '#9333EA', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4, shadowRadius: 28,
  },
  btnDisabled: { backgroundColor: '#2D2640', shadowOpacity: 0 },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  skipBtn: { alignItems: 'center', paddingVertical: 14 },
  skipText: { color: '#4B5563', fontSize: 14, fontWeight: '500' },
});
