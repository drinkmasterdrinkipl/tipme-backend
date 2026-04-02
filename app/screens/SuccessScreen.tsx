// ============================================
// SuccessScreen.tsx — Ekran sukcesu po płatności
// ============================================

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';

const THANKS_MESSAGES = [
  'Dziękuję! 🙏',
  'Jesteś wspaniały! ✨',
  'Super, dzięki! 🎉',
  'Wielkie dzięki! 💜',
  'Doceniam to! 🌟',
];

export default function SuccessScreen({ navigation, route }: any) {
  const { amount, paymentMethod, last4 } = route.params;
  const thankYou = THANKS_MESSAGES[Math.floor(Math.random() * THANKS_MESSAGES.length)];
  const time = new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Badge sukcesu */}
        <View style={styles.badge}>
          <Text style={styles.badgeIcon}>✓</Text>
        </View>

        {/* Podziękowanie */}
        <Text style={styles.thankYou}>{thankYou}</Text>

        {/* Kwota */}
        <Text style={styles.amount}>{amount} zł</Text>

        {/* Szczegóły */}
        <Text style={styles.detail}>
          {paymentMethod} ••{last4} • {time}
        </Text>

        {/* Info o Stripe */}
        <View style={styles.stripeNote}>
          <Text style={styles.stripeLabel}>⚡ STRIPE</Text>
          <Text style={styles.stripeText}>
            Napiwek został przelany na Twoje konto Stripe.{'\n'}
            Wypłata na konto bankowe zgodnie z harmonogramem.
          </Text>
        </View>

        {/* Nowa transakcja */}
        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => navigation.navigate('Main')}
        >
          <Text style={styles.newBtnText}>Kolejny napiwek →</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
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
  badge: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#34d399',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#34d399',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
  },
  badgeIcon: {
    fontSize: 42,
    color: '#fff',
    fontWeight: '800',
  },
  thankYou: {
    fontSize: 26,
    fontWeight: '900',
    color: '#f0eef5',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  amount: {
    fontSize: 52,
    fontWeight: '900',
    color: '#34d399',
    letterSpacing: -3,
  },
  detail: {
    fontSize: 14,
    color: '#666',
    marginTop: 6,
  },
  stripeNote: {
    marginTop: 28,
    padding: 18,
    borderRadius: 16,
    backgroundColor: 'rgba(52,211,153,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.12)',
    width: '100%',
  },
  stripeLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: '#34d399',
    marginBottom: 6,
  },
  stripeText: {
    fontSize: 13,
    color: '#777',
    lineHeight: 20,
  },
  newBtn: {
    marginTop: 28,
    width: '100%',
    paddingVertical: 18,
    borderRadius: 18,
    backgroundColor: '#a855f7',
    alignItems: 'center',
    shadowColor: '#a855f7',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
  },
  newBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
});
