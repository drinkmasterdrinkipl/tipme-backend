import { type ConfigPlugin, AndroidConfig } from '@expo/config-plugins';
type InnerManifest = AndroidConfig.Manifest.AndroidManifest['manifest'];
type ManifestPermission = InnerManifest['permission'];
type AndroidManifest = {
    manifest: InnerManifest & {
        'permission'?: ManifestPermission;
        'uses-permission'?: InnerManifest['uses-permission'];
        'uses-feature'?: InnerManifest['uses-feature'];
    };
};
type StripeTerminalPluginProps = {
    bluetoothBackgroundMode?: boolean;
    locationWhenInUsePermission?: string;
    bluetoothPeripheralPermission?: string;
    bluetoothAlwaysUsagePermission?: string;
    localNetworkUsagePermission?: string;
    tapToPayCheck?: boolean;
    appDelegate?: boolean;
};
export declare function addLocationPermissionToManifest(androidManifest: AndroidManifest): AndroidManifest;
export declare function addBTPermissionToManifest(androidManifest: AndroidManifest): AndroidManifest;
/**
 * Add a blank Swift file to the Xcode project for Swift compatibility.
 */
export declare const withNoopSwiftFile: ConfigPlugin;
declare const _default: ConfigPlugin<StripeTerminalPluginProps>;
export default _default;
