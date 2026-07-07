import { NativeModules, Platform } from 'react-native';

const { ProximityReaderDiscoveryModule } = NativeModules;

export async function presentProximityReaderEducation(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  if (!ProximityReaderDiscoveryModule) return;
  try {
    await ProximityReaderDiscoveryModule.presentEducation();
  } catch {
    // ignoruj — ekran edukacyjny nie jest krytyczny
  }
}
