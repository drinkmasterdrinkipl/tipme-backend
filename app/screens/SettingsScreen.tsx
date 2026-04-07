// ============================================
// SettingsScreen.tsx
// Wymaganie Apple: 3.6, 4.3
// Ustawienia + pomoc Tap to Pay
// ============================================

import React, { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Switch, Alert, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C } from '../theme';
import { useAppContext } from '../AppContext';

export default function SettingsScreen({ navigation }: any) {
  const { onLogout } = useAppContext();
  const [tapToPayEnabled, setTapToPayEnabled] = useState(false);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    const enabled = await AsyncStorage.getItem('tapToPayEnabled');
    const userEmail = await AsyncStorage.getItem('userEmail');
    setTapToPayEnabled(enabled === 'true');
    setEmail(userEmail || '');
    setLoading(false);
  };

  const toggleTapToPay = async (value: boolean) => {
    if (value) {
      navigation.navigate('TapToPayWelcome', {
        onComplete: async () => {
          navigation.goBack();
          setTapToPayEnabled(true);
        },
      });
    } else {
      Alert.alert(
        'Wyłącz Tap to Pay',
        'Czy na pewno chcesz wyłączyć Tap to Pay on iPhone? Nie będziesz mógł przyjmować płatności zbliżeniowych.',
        [
          { text: 'Anuluj', style: 'cancel' },
          {
            text: 'Wyłącz',
            style: 'destructive',
            onPress: async () => {
              await AsyncStorage.removeItem('tapToPayEnabled');
              setTapToPayEnabled(false);
            },
          },
        ]
      );
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Wyloguj się',
      'Czy na pewno chcesz się wylogować? Dane konta zostaną usunięte z urządzenia.',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Wyloguj',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.multiRemove([
              'stripeAccountId', 'userEmail', 'stripeLocationId',
              'tapToPayEnabled', 'tapToPayWelcomeShown', 'tapToPayEducationShown',
              'authToken',
            ]);
            onLogout();
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={s.root}>
        <ActivityIndicator color={C.primary} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>Ustawienia</Text>
        </View>

        {/* Konto */}
        <Text style={s.sectionLabel}>KONTO</Text>
        <View style={s.section}>
          <View style={s.row}>
            <Text style={s.rowLabel}>Email</Text>
            <Text style={s.rowValue}>{email || '—'}</Text>
          </View>
        </View>

        {/* Tap to Pay */}
        <Text style={s.sectionLabel}>TAP TO PAY ON IPHONE</Text>
        <View style={s.section}>
          <View style={s.row}>
            <View style={s.rowLeft}>
              <Text style={s.rowLabel}>Włącz Tap to Pay</Text>
              <Text style={s.rowDesc}>Przyjmuj płatności zbliżeniowe</Text>
            </View>
            <Switch
              value={tapToPayEnabled}
              onValueChange={toggleTapToPay}
              trackColor={{ false: C.text4, true: C.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Pomoc */}
        <Text style={s.sectionLabel}>POMOC — JAK UŻYWAĆ TAP TO PAY</Text>
        <View style={s.section}>
          {[
            {
              icon: '💳',
              title: 'Karty zbliżeniowe',
              desc: 'Klient przykłada kartę do tylnej części iPhone\'a i trzyma przez 1-2 sekundy.',
            },
            {
              icon: '📱',
              title: 'Apple Pay / portfele cyfrowe',
              desc: 'Klient przykłada telefon lub zegarek — działa tak samo jak karta.',
            },
            {
              icon: '⚡',
              title: 'Szybkość płatności',
              desc: 'Płatność powinna pojawić się w ciągu 1 sekundy po naciśnięciu przycisku.',
            },
            {
              icon: '🔒',
              title: 'Bezpieczeństwo',
              desc: 'Dane karty są szyfrowane przez Apple i Stripe. Nigdy nie masz dostępu do pełnego numeru karty.',
            },
            {
              icon: '❓',
              title: 'Problemy z płatnością',
              desc: 'Jeśli karta nie zostanie odczytana, poproś klienta żeby przykładał kartę wolniej lub sprawdź połączenie internetowe.',
            },
          ].map((item) => (
            <View key={item.title} style={s.helpRow}>
              <Text style={s.helpIcon}>{item.icon}</Text>
              <View style={s.helpText}>
                <Text style={s.helpTitle}>{item.title}</Text>
                <Text style={s.helpDesc}>{item.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Edukacja */}
        <Text style={s.sectionLabel}>SAMOUCZEK</Text>
        <View style={s.section}>
          <TouchableOpacity
            style={s.row}
            onPress={() => navigation.navigate('TapToPayEducation', { onComplete: () => navigation.goBack() })}
            activeOpacity={0.7}
          >
            <Text style={s.rowLabel}>Pokaż samouczek Tap to Pay</Text>
            <Text style={s.rowArrow}>→</Text>
          </TouchableOpacity>
        </View>


        {/* Wyloguj */}
        <Text style={s.sectionLabel}>WYLOGUJ SIĘ</Text>
        <View style={s.section}>
          <TouchableOpacity style={s.logoutRow} onPress={handleLogout} activeOpacity={0.7}>
            <Text style={s.logoutText}>Wyloguj się</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.version}>Tip For Me v1.0 · Napiwki online</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 },
  title: { fontSize: 28, fontWeight: '900', color: C.text1, letterSpacing: -0.5 },
  sectionLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 2.5,
    color: C.text3, paddingHorizontal: 24, marginBottom: 8, marginTop: 16,
  },
  section: {
    marginHorizontal: 16, borderRadius: 18,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: C.cardBorder,
  },
  rowLeft: { flex: 1, marginRight: 12 },
  rowLabel: { fontSize: 15, fontWeight: '600', color: C.text1 },
  rowDesc: { fontSize: 12, color: C.text3, marginTop: 2 },
  rowValue: { fontSize: 14, color: C.text3 },
  rowArrow: { fontSize: 16, color: C.text3 },
  helpRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.cardBorder,
  },
  helpIcon: { fontSize: 20, width: 32, marginTop: 1 },
  helpText: { flex: 1 },
  helpTitle: { fontSize: 14, fontWeight: '700', color: C.text1, marginBottom: 3 },
  helpDesc: { fontSize: 12, color: C.text3, lineHeight: 18 },
  logoutRow: { paddingHorizontal: 18, paddingVertical: 18 },
  logoutText: { fontSize: 15, fontWeight: '700', color: C.error, textAlign: 'center' },
  version: {
    textAlign: 'center', fontSize: 12, color: C.text4,
    marginTop: 24, marginBottom: 40,
  },
});
