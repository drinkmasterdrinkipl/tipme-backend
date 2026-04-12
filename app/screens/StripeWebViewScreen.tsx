import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { C } from '../theme';

export default function StripeWebViewScreen({ route, navigation }: any) {
  const { url, onDone } = route.params ?? {};
  const [loading, setLoading] = useState(true);
  const [webError, setWebError] = useState('');
  const webviewRef = useRef<any>(null);
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

  const handleNavigationChange = (navState: any) => {
    if (!mountedRef.current || completedRef.current) return;
    // Stripe przekierowuje na return_url po ukończeniu onboardingu
    if (navState.url?.includes('/stripe/success') || navState.url?.includes('return_url')) {
      completedRef.current = true;
      navigation.goBack();
      if (typeof onDone === 'function') onDone();
    }
    // Stripe przekierowuje na refresh_url gdy sesja wygasła
    if (navState.url?.includes('/stripe/refresh')) {
      completedRef.current = true;
      navigation.goBack();
    }
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

      {loading && (
        <View style={s.loader}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={s.loaderTxt}>Ładowanie Stripe...</Text>
        </View>
      )}

      {webError ? (
        <View style={s.errorWrap}>
          <Text style={s.errorTxt}>Nie udało się załadować strony.</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => { setWebError(''); webviewRef.current?.reload(); }}>
            <Text style={s.retryTxt}>Spróbuj ponownie</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <WebView
          ref={webviewRef}
          source={{ uri: url }}
          onLoadStart={() => { if (mountedRef.current) setLoading(true); }}
          onLoadEnd={() => { if (mountedRef.current) setLoading(false); }}
          onNavigationStateChange={handleNavigationChange}
          onError={() => { if (mountedRef.current) { setLoading(false); setWebError('error'); } }}
          style={loading ? { opacity: 0 } : { flex: 1 }}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState={false}
          keyboardDisplayRequiresUserAction={false}
          allowsInlineMediaPlayback
          scrollEnabled
          automaticallyAdjustContentInsets={false}
          contentInsetAdjustmentBehavior="never"
        />
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
  loader: {
    position: 'absolute', top: 60, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.bg, zIndex: 10,
  },
  loaderTxt: { color: C.text3, marginTop: 12, fontSize: 14 },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  errorTxt: { color: C.error, fontSize: 14, textAlign: 'center', marginBottom: 16 },
  retryBtn: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder },
  retryTxt: { color: C.primaryLight, fontWeight: '700' },
});
