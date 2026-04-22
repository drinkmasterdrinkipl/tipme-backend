// ============================================
// SettingsScreen.tsx
// Wymaganie Apple: 3.6, 4.3
// Ustawienia + pomoc Tap to Pay
// ============================================

import React, { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Switch, Alert, ActivityIndicator, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStripeTerminal } from '@stripe/stripe-terminal-react-native';
import { C } from '../theme';
import { useAppContext } from '../AppContext';
import { API_URL, apiFetch } from '../config';
import { isProximityReaderDiscoveryAvailable, presentProximityReaderEducation } from '../hooks/useProximityReaderDiscovery';

const isIOS18Plus = Platform.OS === 'ios' && parseInt(Platform.Version as string, 10) >= 18;

export default function SettingsScreen({ navigation }: any) {
  const { onLogout } = useAppContext();
  const { disconnectReader, discoverReaders } = useStripeTerminal();
  const [tapToPayEnabled, setTapToPayEnabled] = useState(false);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const enabled = await AsyncStorage.getItem('tapToPayEnabled');
      const userEmail = await AsyncStorage.getItem('userEmail');
      setTapToPayEnabled(enabled === 'true');
      setEmail(userEmail || '');
    } catch { /* ignoruj błąd odczytu */ } finally {
      setLoading(false);
    }
  };

  const toggleTapToPay = async (value: boolean) => {
    if (value) {
      navigation.navigate('TapToPayWelcome', {
        onComplete: () => {
          setTapToPayEnabled(true);
        },
      });
    } else {
      Alert.alert(
        'Wyłącz Tap to Pay',
        'Czy na pewno chcesz wyłączyć Tap to Pay na iPhonie? Nie będziesz mógł przyjmować płatności zbliżeniowych.',
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

  const handleShowTutorial = async () => {
    await presentProximityReaderEducation().catch(() => {});
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Usuń konto',
      'Czy na pewno chcesz trwale usunąć konto? Wszystkie dane zostaną usunięte i nie będzie możliwości ich odzyskania.',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń konto',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Ostatnie potwierdzenie',
              'To działanie jest nieodwracalne. Twoje konto Stripe zostanie trwale usunięte.',
              [
                { text: 'Anuluj', style: 'cancel' },
                {
                  text: 'Tak, usuń',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      const res = await apiFetch(`${API_URL}/api/delete-account`, { method: 'DELETE' });
                      const data = await res.json();
                      if (!res.ok) {
                        Alert.alert('Błąd', data.error || 'Nie można usunąć konta');
                        return;
                      }
                      await disconnectReader().catch(() => {});
                      await AsyncStorage.multiRemove([
                        'stripeAccountId', 'userEmail', 'stripeLocationId',
                        'tapToPayEnabled', 'tapToPayWelcomeShown', 'tapToPayEducationShown',
                        'authToken',
                      ]).catch(() => {});
                      onLogout();
                    } catch {
                      Alert.alert('Błąd', 'Brak połączenia — spróbuj ponownie');
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert(
      'Czy na pewno chcesz się wylogować?',
      null,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Wyloguj',
          style: 'destructive',
          onPress: async () => {
            await disconnectReader().catch(() => {});
            await AsyncStorage.multiRemove([
              'stripeAccountId', 'userEmail', 'stripeLocationId',
              'tapToPayEnabled', 'tapToPayWelcomeShown', 'tapToPayEducationShown',
              'authToken',
            ]).catch(() => {});
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
        <Text style={s.sectionLabel}>TAP TO PAY NA IPHONE</Text>
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

        {/* Edukacja */}
        <Text style={s.sectionLabel}>SAMOUCZEK</Text>
        <View style={s.section}>
          <TouchableOpacity
            style={s.row}
            onPress={handleShowTutorial}
            activeOpacity={0.7}
          >
            <Text style={s.rowLabel}>Pokaż samouczek Tap to Pay</Text>
            <Text style={s.rowArrow}>→</Text>
          </TouchableOpacity>
        </View>


        {/* Prawne */}
        <Text style={s.sectionLabel}>PRAWNE</Text>
        <View style={s.section}>
          <TouchableOpacity
            style={s.row}
            onPress={() => navigation.navigate('StripeWebView', { url: 'https://tipforme.app/regulamin.html' })}
            activeOpacity={0.7}
          >
            <Text style={s.rowLabel}>Regulamin i warunki</Text>
            <Text style={s.rowArrow}>→</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.row, { borderBottomWidth: 0 }]}
            onPress={() => navigation.navigate('StripeWebView', { url: 'https://tipforme.app/polityka-prywatnosci.html' })}
            activeOpacity={0.7}
          >
            <Text style={s.rowLabel}>Polityka prywatności</Text>
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

        {/* Usuń konto — wymaganie Apple 5.1.1 */}
        <Text style={s.sectionLabel}>ZARZĄDZANIE KONTEM</Text>
        <View style={s.section}>
          <TouchableOpacity style={s.deleteRow} onPress={handleDeleteAccount} activeOpacity={0.7}>
            <Text style={s.deleteText}>Usuń konto</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.version}>Tip For Me v1.0 · Autor: Adrian Chwaściński</Text>
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
  logoutRow: { paddingHorizontal: 18, paddingVertical: 18 },
  logoutText: { fontSize: 15, fontWeight: '700', color: C.error, textAlign: 'center' },
  deleteRow: { paddingHorizontal: 18, paddingVertical: 18 },
  deleteText: { fontSize: 14, fontWeight: '600', color: C.error, textAlign: 'center', opacity: 0.7 },
  version: {
    textAlign: 'center', fontSize: 12, color: C.text4,
    marginTop: 24, marginBottom: 40,
  },
});
