// ============================================
// Tip For Me — App.tsx
// Główna aplikacja React Native
// ============================================

import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { C } from './theme';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StripeTerminalProvider } from '@stripe/stripe-terminal-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from './config';

import HomeScreen from './screens/HomeScreen';
import TapScreen from './screens/TapScreen';
import SuccessScreen from './screens/SuccessScreen';
import HistoryScreen from './screens/HistoryScreen';
import StatsScreen from './screens/StatsScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import WalletScreen from './screens/WalletScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Pobieranie tokena z backendu dla Stripe Terminal
const fetchTokenProvider = async () => {
  const accountId = await AsyncStorage.getItem('stripeAccountId');
  const response = await fetch(`${API_URL}/api/connection-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stripeAccountId: accountId }),
  });
  const { secret } = await response.json();
  return secret;
};

// Tabs — główna nawigacja
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: C.surface,
          borderTopColor: C.cardBorder,
          paddingBottom: 8,
          paddingTop: 8,
          height: 85,
        },
        tabBarActiveTintColor: C.primaryLight,
        tabBarInactiveTintColor: C.text3,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Napiwek',
          tabBarIcon: ({ color }) => (
            <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: color === C.primaryLight ? C.primaryFaint : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, color }}>⬡</Text>
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          tabBarLabel: 'Historia',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 18, color }}>≡</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Stats"
        component={StatsScreen}
        options={{
          tabBarLabel: 'Statystyki',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 16, color }}>◈</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Wallet"
        component={WalletScreen}
        options={{
          tabBarLabel: 'Portfel',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 16, color }}>◎</Text>
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const [isOnboarded, setIsOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    checkOnboarding();
  }, []);

  const checkOnboarding = async () => {
    try {
      const accountId = await AsyncStorage.getItem('stripeAccountId');
      setIsOnboarded(!!accountId);
    } catch {
      setIsOnboarded(false);
    }
  };

  if (isOnboarded === null) return <View style={{ flex: 1, backgroundColor: '#0c0a13' }} />;

  return (
    <SafeAreaProvider>
    <StripeTerminalProvider tokenProvider={fetchTokenProvider} logLevel="verbose">
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isOnboarded ? (
          <Stack.Screen name="Onboarding">
            {(props) => <OnboardingScreen {...props} onComplete={() => setIsOnboarded(true)} />}
          </Stack.Screen>
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="Tap" component={TapScreen} />
            <Stack.Screen name="Success" component={SuccessScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
    </StripeTerminalProvider>
    </SafeAreaProvider>
  );
}
