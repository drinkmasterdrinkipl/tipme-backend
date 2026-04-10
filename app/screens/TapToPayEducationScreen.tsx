// ============================================
// TapToPayEducationScreen.tsx
// Wymaganie Apple: 4.1, 4.2, 4.5, 4.6, 4.7
// Edukacja merchanta — jak używać Tap to Pay
// ============================================

import React, { useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    icon: '⬡',
    title: 'Gotowy do płatności',
    desc: 'Twój iPhone staje się terminalem płatniczym. Klient przykłada kartę lub telefon — płatność zostaje pobrana.',
    tip: 'Nie potrzebujesz żadnego dodatkowego sprzętu.',
  },
  {
    icon: '💳',
    title: 'Karty zbliżeniowe',
    desc: 'Klient przykłada kartę do tylnej części Twojego iPhone\'a. Trzymaj kartę nieruchomo przez 1-2 sekundy.',
    tip: 'Działa z kartami Visa, Mastercard, Maestro i innymi kartami zbliżeniowymi.',
  },
  {
    icon: '📱',
    title: 'Apple Pay i portfele cyfrowe',
    desc: 'Klient może zapłacić telefonem, zegarkiem lub innym urządzeniem z Apple Pay lub Google Pay.',
    tip: 'Przykładaj urządzenie w to samo miejsce co kartę — do tylnej części Twojego iPhone\'a.',
  },
  {
    icon: '✓',
    title: 'Potwierdzenie płatności',
    desc: 'Po udanej płatności zobaczysz ekran sukcesu z kwotą i metodą płatności. Możesz wysłać potwierdzenie na email klienta.',
    tip: 'Środki trafiają na Twoje konto Stripe i są wypłacane w ciągu 1–2 dni roboczych.',
  },
  {
    icon: '🔢',
    title: 'Wprowadzanie PIN',
    desc: 'Przy niektórych transakcjach klient zostanie poproszony o wprowadzenie PIN-u bezpośrednio na ekranie Twojego iPhone\'a. Jest to bezpieczne i szyfrowane przez Apple.',
    tip: 'Nie dotykaj ekranu podczas gdy klient wpisuje PIN — zapewnia to prywatność klienta.',
  },
  {
    icon: '⚙️',
    title: 'Ustawienia i pomoc',
    desc: 'W zakładce Ustawienia znajdziesz opcje konta, historię i pomoc dotyczącą Tap to Pay.',
    tip: 'Możesz w każdej chwili włączyć lub wyłączyć Tap to Pay z poziomu ustawień.',
  },
];

export default function TapToPayEducationScreen({ navigation, route }: any) {
  const { onComplete } = route.params ?? {};
  const [currentSlide, setCurrentSlide] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const goToSlide = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
    setCurrentSlide(index);
  };

  const handleNext = () => {
    if (currentSlide < SLIDES.length - 1) {
      goToSlide(currentSlide + 1);
    } else {
      handleFinish();
    }
  };

  const handleFinish = async () => {
    await AsyncStorage.setItem('tapToPayEnabled', 'true');
    await AsyncStorage.setItem('tapToPayEducationShown', 'true');
    typeof onComplete === 'function' ? onComplete() : navigation.navigate('Main');
  };

  const handleSkip = () => {
    navigation.goBack();
  };

  return (
    <SafeAreaView style={s.root}>
      {/* Slajdy */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        style={s.slides}
      >
        {SLIDES.map((slide, i) => (
          <View key={i} style={s.slide}>
            <View style={s.slideIconWrap}>
              <Text style={s.slideIcon}>{slide.icon}</Text>
            </View>
            <Text style={s.slideTitle}>{slide.title}</Text>
            <Text style={s.slideDesc}>{slide.desc}</Text>
            <View style={s.tipBox}>
              <Text style={s.tipLabel}>💡 Wskazówka</Text>
              <Text style={s.tipText}>{slide.tip}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Dots */}
      <View style={s.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[s.dot, i === currentSlide && s.dotActive]} />
        ))}
      </View>

      {/* Nawigacja */}
      <View style={s.nav}>
        {currentSlide > 0 ? (
          <TouchableOpacity style={s.prevBtn} onPress={() => goToSlide(currentSlide - 1)}>
            <Text style={s.prevText}>← Wstecz</Text>
          </TouchableOpacity>
        ) : (
          <View style={s.prevBtn} />
        )}

        <TouchableOpacity style={s.nextBtn} onPress={handleNext} activeOpacity={0.85}>
          <Text style={s.nextText}>
            {currentSlide === SLIDES.length - 1 ? 'Zacznij używać →' : 'Dalej →'}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={s.skipBtn} onPress={handleSkip}>
        <Text style={s.skipText}>Pomiń</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#070511' },
  slides: { flex: 1 },
  slide: {
    width,
    flex: 1,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 20,
  },
  slideIconWrap: {
    width: 120, height: 120, borderRadius: 36,
    backgroundColor: 'rgba(147,51,234,0.1)',
    borderWidth: 1, borderColor: 'rgba(147,51,234,0.25)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 28,
  },
  slideIcon: { fontSize: 56, color: '#C084FC' },
  slideTitle: {
    fontSize: 28, fontWeight: '900', color: '#F3F0FF',
    textAlign: 'center', letterSpacing: -0.5, marginBottom: 14,
  },
  slideDesc: {
    fontSize: 16, color: '#9CA3AF', textAlign: 'center',
    lineHeight: 26, marginBottom: 28,
  },
  tipBox: {
    width: '100%', backgroundColor: 'rgba(147,51,234,0.06)',
    borderWidth: 1, borderColor: 'rgba(147,51,234,0.2)',
    borderRadius: 16, padding: 16,
  },
  tipLabel: { fontSize: 12, fontWeight: '700', color: '#A78BFA', marginBottom: 6 },
  tipText: { fontSize: 13, color: '#6B7280', lineHeight: 20 },
  dots: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2D2640' },
  dotActive: { width: 24, backgroundColor: '#9333EA' },
  nav: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 28, paddingBottom: 8,
  },
  prevBtn: { paddingVertical: 12, paddingHorizontal: 16, minWidth: 80 },
  prevText: { color: '#6B7280', fontSize: 15, fontWeight: '600' },
  nextBtn: {
    paddingVertical: 16, paddingHorizontal: 28, borderRadius: 18,
    backgroundColor: '#9333EA',
    shadowColor: '#9333EA', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35, shadowRadius: 20,
  },
  nextText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  skipBtn: { alignItems: 'center', paddingVertical: 14, paddingBottom: 20 },
  skipText: { color: '#4B5563', fontSize: 13 },
});
