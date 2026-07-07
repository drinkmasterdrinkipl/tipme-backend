import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

// ─── Navigation param lists ───────────────────────────────

export type RootStackParamList = {
  Onboarding: undefined;
  Main: undefined;
  Tap: { amount: number };
  Success: { amount: string; paymentMethod: string; last4: string };
  TapToPayWelcome: Record<string, never>;
  TapToPayEducation: undefined;
  Settings: undefined;
  StripeWebView: { url: string; onDone?: () => void };
  AccountDetails: undefined;
  ResetPassword: { token: string };
};

export type TabParamList = {
  Home: undefined;
  History: undefined;
  Stats: undefined;
  Wallet: undefined;
  SettingsTab: undefined;
};

// ─── Per-screen prop helpers ──────────────────────────────

export type StackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

export type OnboardingScreenProps = StackScreenProps<'Onboarding'> & {
  onComplete: () => void;
};

// Tab screens that also need to push onto the parent stack
export type TabScreenProps<T extends keyof TabParamList> = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, T>,
  NativeStackScreenProps<RootStackParamList>
>;

// ─── API response types ───────────────────────────────────

export interface AccountStatusResponse {
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
  onboardingUrl?: string;
  token?: string;
}

export interface LoginResponse {
  accountId: string;
  token?: string;
  authToken?: string;
  access_token?: string;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  onboardingUrl?: string;
  error?: string;
  needsPasswordReset?: boolean;
}

export interface CreateAccountResponse {
  accountId: string;
  onboardingUrl: string;
  error?: string;
  incompleteRegistration?: boolean;
}

export interface Transaction {
  id: string;
  amount: number;
  currency: string;
  status: string;
  refunded: boolean;
  created: string;
  paymentMethod: string;
}

export interface TransactionsResponse {
  transactions: Transaction[];
}

export interface PayoutItem {
  id: string;
  amount: number;
  status: 'paid' | 'pending' | 'in_transit' | 'canceled' | 'failed';
  arrivalDate?: number;
  arrival_date?: number;
}

export interface PayoutsResponse {
  payouts: PayoutItem[];
}

export interface BalanceResponse {
  available: number;
  pending: number;
  error?: string;
}

export interface StatsDay {
  total: number | string;
  count: number | string;
  average?: number | string;
  stripeFee?: number;
  platformFee?: number;
  net?: number;
}

export interface StatsResponse {
  today: StatsDay | null;
}

export interface AccountDetailsResponse {
  email?: string;
  firstName?: string;
  lastName?: string;
  businessName?: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  bankLast4?: string;
  currency?: string;
  country?: string;
}
