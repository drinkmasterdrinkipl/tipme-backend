import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { C } from '../theme';
import { API_URL, apiFetch } from '../config';

const MESSAGES = ['Dziękuję!', 'Jesteś wspaniały!', 'Super, dzięki!', 'Wielkie dzięki!', 'Doceniam to!'];

export default function SuccessScreen({ navigation, route }: any) {
  const { amount = '0', paymentMethod = 'Karta', last4 = '****' } = route.params ?? {};
  const [msg] = useState(() => MESSAGES[Math.floor(Math.random() * MESSAGES.length)]);
  const now = new Date();
  const time = now.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ', ' + time;

  const [modalVisible, setModalVisible] = useState(false);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState('');
  const mountedRef = useRef(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const sendReceipt = async () => {
    if (!email.includes('@')) return;
    setSending(true);
    setSendError('');
    try {
      const res = await apiFetch(`${API_URL}/api/send-receipt`, {
        method: 'POST',
        body: JSON.stringify({ email, amount, last4, paymentMethod, date }),
      });
      if (!res.ok) throw new Error('Błąd serwera — spróbuj ponownie');
      if (!mountedRef.current) return;
      setSent(true);
      timeoutRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        setModalVisible(false);
        setSent(false);
        setEmail('');
        setSendError('');
      }, 1500);
    } catch (e: any) {
      if (mountedRef.current) setSendError(e.message || 'Nie udało się wysłać');
    } finally {
      if (mountedRef.current) setSending(false);
    }
  };

  return (
    <SafeAreaView style={s.root}>
      <View style={s.content}>
        <View style={s.checkWrap}>
          <View style={s.checkRing}>
            <Text style={s.checkMark}>✓</Text>
          </View>
        </View>

        <Text style={s.msg}>{msg}</Text>
        <Text style={s.amount}>{amount}<Text style={s.amountCurr}> zł</Text></Text>
        <Text style={s.detail}>{paymentMethod} ••{last4} · {time}</Text>

        <View style={s.infoCard}>
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>STATUS</Text>
            <Text style={s.infoValueGreen}>Zaakceptowano</Text>
          </View>
          <View style={s.infoDivider} />
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>WYPŁATA</Text>
            <Text style={s.infoValue}>Następny dzień roboczy</Text>
          </View>
          <View style={s.infoDivider} />
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>PLATFORMA</Text>
            <Text style={s.infoValue}>Stripe Connect</Text>
          </View>
        </View>

        {/* Paragon emailem */}
        <TouchableOpacity style={s.receiptBtn} onPress={() => setModalVisible(true)} activeOpacity={0.8}>
          <Text style={s.receiptBtnText}>Wyślij potwierdzenie na email</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.btn} onPress={() => navigation.navigate('Main')} activeOpacity={0.85}>
          <Text style={s.btnText}>Kolejny napiwek</Text>
        </TouchableOpacity>
      </View>

      {/* Modal z emailem */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.modalCard}>
            {sent ? (
              <View style={s.sentWrap}>
                <Text style={s.sentCheck}>✓</Text>
                <Text style={s.sentText}>Wysłano!</Text>
              </View>
            ) : (
              <>
                <Text style={s.modalTitle}>Potwierdzenie płatności</Text>
                <Text style={s.modalSub}>Podaj email klienta — wyślemy potwierdzenie napiwku {amount} zł</Text>
                <TextInput
                  style={s.emailInput}
                  placeholder="email@klienta.pl"
                  placeholderTextColor={C.text3}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={email}
                  onChangeText={setEmail}
                  autoFocus
                />
                {sendError ? <Text style={s.sendErrorText}>{sendError}</Text> : null}
                <TouchableOpacity
                  style={[s.sendBtn, (!email.includes('@') || sending) && s.sendBtnDisabled]}
                  onPress={sendReceipt}
                  disabled={!email.includes('@') || sending}
                  activeOpacity={0.85}
                >
                  {sending
                    ? <ActivityIndicator color={C.white} />
                    : <Text style={s.sendBtnText}>Wyślij</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setModalVisible(false)}>
                  <Text style={s.cancelBtnText}>Pomiń</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  checkWrap: { marginBottom: 24 },
  checkRing: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: C.successFaint,
    borderWidth: 1.5, borderColor: 'rgba(16,185,129,0.3)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.success, shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25, shadowRadius: 32,
  },
  checkMark: { fontSize: 36, color: C.success, fontWeight: '900' },
  msg: { fontSize: 22, fontWeight: '800', color: C.text1, letterSpacing: -0.5, marginBottom: 4 },
  amount: { fontSize: 64, fontWeight: '900', color: C.success, letterSpacing: -4, lineHeight: 68 },
  amountCurr: { fontSize: 28, fontWeight: '700', color: C.success },
  detail: { fontSize: 13, color: C.text3, marginTop: 8, marginBottom: 32 },
  infoCard: {
    width: '100%', borderRadius: 22,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
    marginBottom: 16, overflow: 'hidden',
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  infoDivider: { height: 1, backgroundColor: C.cardBorder, marginHorizontal: 20 },
  infoLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: C.text3 },
  infoValue: { fontSize: 13, fontWeight: '600', color: C.text2 },
  infoValueGreen: { fontSize: 13, fontWeight: '700', color: C.success },
  receiptBtn: {
    width: '100%', paddingVertical: 15, borderRadius: 18, marginBottom: 10,
    borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.card,
    alignItems: 'center',
  },
  receiptBtnText: { fontSize: 14, fontWeight: '700', color: C.primaryLight },
  btn: {
    width: '100%', paddingVertical: 20, borderRadius: 22,
    backgroundColor: C.primary, alignItems: 'center',
    shadowColor: C.primary, shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35, shadowRadius: 28,
  },
  btnText: { fontSize: 16, fontWeight: '800', color: C.white },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 32,
  },
  modalCard: {
    width: '100%', backgroundColor: '#13102a',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 28, borderWidth: 1,
    borderColor: C.cardBorder,
  },
  modalTitle: { fontSize: 20, fontWeight: '900', color: C.text1, marginBottom: 8, letterSpacing: -0.5 },
  modalSub: { fontSize: 13, color: C.text3, marginBottom: 20, lineHeight: 20 },
  emailInput: {
    borderWidth: 1.5, borderColor: C.cardBorder,
    borderRadius: 16, paddingVertical: 16, paddingHorizontal: 18,
    color: C.text1, fontSize: 16, fontWeight: '600',
    backgroundColor: C.card, marginBottom: 14,
  },
  sendBtn: {
    paddingVertical: 18, borderRadius: 18,
    backgroundColor: C.primary, alignItems: 'center', marginBottom: 10,
  },
  sendBtnDisabled: { backgroundColor: C.text4 },
  sendBtnText: { color: C.white, fontSize: 16, fontWeight: '800' },
  cancelBtn: { alignItems: 'center', paddingVertical: 12 },
  cancelBtnText: { color: C.text3, fontSize: 14, fontWeight: '600' },
  sendErrorText: { fontSize: 12, color: C.error ?? '#f87171', textAlign: 'center', marginBottom: 8 },
  sentWrap: { alignItems: 'center', paddingVertical: 24 },
  sentCheck: { fontSize: 48, color: C.success, marginBottom: 8 },
  sentText: { fontSize: 22, fontWeight: '900', color: C.success },
});
