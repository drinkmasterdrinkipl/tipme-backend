import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { WebView as WebViewType } from 'react-native-webview';
import type { WebViewNavigation, ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { C } from '../theme';
import type { StackScreenProps } from '../types';

export default function StripeWebViewScreen({ route, navigation }: StackScreenProps<'StripeWebView'>) {
  const { url, onDone, email } = route.params;
  const [loading, setLoading] = useState(true);
  const [webError, setWebError] = useState('');
  const [hintOpen, setHintOpen] = useState(true); // checklista rejestracji — zwijana
  const webviewRef = useRef<WebViewType>(null);
  const mountedRef = useRef(true);
  const completedRef = useRef(false); // zapobiega wielokrotnemu wywołaniu onDone

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Guard: brak url → wróć (w useEffect, nie podczas renderowania)
  useEffect(() => {
    if (!url) navigation.goBack();
  }, [url, navigation]);

  if (!url) return null;

  const handleNavigationChange = (navState: WebViewNavigation) => {
    if (!mountedRef.current || completedRef.current) return;
    // Stripe przekierowuje na refresh_url gdy sesja wygasła
    if (navState.url?.includes('/stripe/refresh')) {
      completedRef.current = true;
      navigation.goBack();
    }
  };

  // Przechwytuje URL zanim strona się załaduje — tylko podczas onboardingu (gdy onDone jest przekazane)
  const handleShouldStartLoad = (request: ShouldStartLoadRequest): boolean => {
    if (!mountedRef.current || completedRef.current) return true;
    if (typeof onDone === 'function' &&
      (request.url?.includes('/stripe/success') || request.url?.includes('return_url'))) {
      completedRef.current = true;
      setTimeout(() => {
        navigation.goBack();
        onDone();
      }, 0);
      return false;
    }
    return true;
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.closeBtn} onPress={() => navigation.goBack()}>
          <Text style={s.closeTxt}>✕</Text>
        </TouchableOpacity>
        <Text style={s.title}>Konfiguracja konta</Text>
        <View style={{ width: 36 }} />
      </View>

      {email ? (
        <TouchableOpacity activeOpacity={0.85} onPress={() => setHintOpen(o => !o)} style={s.hint}>
          <View style={s.hintHead}>
            <Text style={s.hintTitle}>💡 Podpowiedzi do rejestracji</Text>
            <Text style={s.hintToggle}>{hintOpen ? '▲ zwiń' : '▼ rozwiń'}</Text>
          </View>
          {hintOpen ? (
            <View style={s.hintBody}>
              <Text style={s.hintLine}>✉️  „email do konta Express" — podaj ten sam: <Text style={s.hintStrong}>{email}</Text></Text>
              <Text style={s.hintLine}>📱  telefon — kod SMS</Text>
              <Text style={s.hintLine}>🏠  adres — ulica, miasto, kod</Text>
              <Text style={s.hintLine}>🏦  numer konta bankowego — w Stripe „IBAN": „PL" z przodu (jeśli masz konto w Polsce) + Twój numer konta</Text>
              <Text style={s.hintLine}>🆔  PESEL — przyspiesza weryfikację konta</Text>
              <Text style={s.hintLine}>🪪  dokument + selfie — dla zagranicznych</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      ) : null}

      {webError ? (
        <View style={s.errorWrap}>
          <Text style={s.errorTxt}>Nie udało się załadować strony.</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => { setWebError(''); webviewRef.current?.reload(); }}>
            <Text style={s.retryTxt}>Spróbuj ponownie</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <WebView
            ref={webviewRef}
            source={{ uri: url }}
            onLoadStart={() => { if (mountedRef.current) setLoading(true); }}
            onLoadEnd={() => { if (mountedRef.current) setLoading(false); }}
            onNavigationStateChange={handleNavigationChange}
            onShouldStartLoadWithRequest={handleShouldStartLoad}
            onError={() => { if (mountedRef.current) { setLoading(false); setWebError('error'); } }}
            style={{ flex: 1, opacity: loading ? 0 : 1 }}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState={false}
            keyboardDisplayRequiresUserAction={false}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            mediaCapturePermissionGrantType="grant"
            allowsProtectedMedia
            allowFileAccess
            scrollEnabled
            automaticallyAdjustContentInsets={false}
            contentInsetAdjustmentBehavior="never"
          />
          {loading && (
            <View style={s.loader}>
              <ActivityIndicator size="large" color={C.primary} />
              <Text style={s.loaderTxt}>Ładowanie...</Text>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  closeTxt: { color: C.text3, fontSize: 14, fontWeight: '700' },
  title: { fontSize: 15, fontWeight: '800', color: C.text1 },
  hint: { backgroundColor: 'rgba(139,92,246,0.12)', borderBottomWidth: 1, borderBottomColor: C.cardBorder, paddingHorizontal: 16, paddingVertical: 10 },
  hintHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hintTitle: { color: '#b9a5f5', fontSize: 13, fontWeight: '800' },
  hintToggle: { color: '#9a95b5', fontSize: 12, fontWeight: '700' },
  hintBody: { marginTop: 8 },
  hintLine: { color: '#d5d0e8', fontSize: 12.5, lineHeight: 19, marginTop: 3 },
  hintStrong: { color: '#c4b5fd', fontWeight: '800' },
  loader: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.bg, zIndex: 10,
  },
  loaderTxt: { color: C.text3, marginTop: 12, fontSize: 14 },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  errorTxt: { color: C.error, fontSize: 14, textAlign: 'center', marginBottom: 16 },
  retryBtn: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder },
  retryTxt: { color: C.primaryLight, fontWeight: '700' },
});
