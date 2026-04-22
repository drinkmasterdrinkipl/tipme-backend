import { NativeModules, Platform } from 'react-native';

const { ProximityReaderDiscoveryModule } = NativeModules;

const isIOS18Plus =
  Platform.OS === 'ios' && parseInt(Platform.Version as string, 10) >= 18;

export const isProximityReaderDiscoveryAvailable =
  isIOS18Plus && !!ProximityReaderDiscoveryModule;

export async function presentProximityReaderEducation(): Promise<void> {
  if (!isProximityReaderDiscoveryAvailable) {
    throw new Error('ProximityReaderDiscovery not available');
  }
  return ProximityReaderDiscoveryModule.presentEducation();
}
