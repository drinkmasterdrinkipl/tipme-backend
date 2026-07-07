const { withXcodeProject } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

const SWIFT_CODE = `import Foundation
import UIKit
#if canImport(ProximityReader)
import ProximityReader
#endif

@objc(ProximityReaderDiscoveryModule)
class ProximityReaderDiscoveryModule: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { return false }

  @objc
  func presentEducation(_ resolve: @escaping (Any?) -> Void,
                        reject: @escaping (String?, String?, NSError?) -> Void) {
    if #available(iOS 18.0, *) {
      Task {
        do {
          let discovery = ProximityReaderDiscovery()
          let content = try await discovery.content(for: .payment(.howToTap))
          await MainActor.run {
            guard
              let scene = UIApplication.shared.connectedScenes
                .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene,
              let rootVC = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController
            else { reject("NO_VC", "No active view controller", nil); return }
            var topVC = rootVC
            while let presented = topVC.presentedViewController { topVC = presented }
            Task {
              do {
                try await discovery.presentContent(content, from: topVC)
                resolve(nil)
              } catch { reject("PRESENT_ERROR", error.localizedDescription, error as NSError) }
            }
          }
        } catch { reject("CONTENT_ERROR", error.localizedDescription, error as NSError) }
      }
    } else {
      reject("UNSUPPORTED", "Requires iOS 18+", nil)
    }
  }
}`;

const OBJC_CODE = `#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ProximityReaderDiscoveryModule, NSObject)
RCT_EXTERN_METHOD(presentEducation:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
@end`;

function stripQuotes(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/^"(.*)"$/, '$1');
}

function findMainGroupKey(xcodeProject, projectName) {
  const groups = xcodeProject.hash.project.objects['PBXGroup'];
  if (!groups) return null;

  // Try exact match first (no quotes), then stripped-quote match
  for (const key of Object.keys(groups)) {
    const group = groups[key];
    if (!group || typeof group !== 'object') continue;
    const groupPath = stripQuotes(String(group.path || ''));
    const groupName = stripQuotes(String(group.name || ''));
    if (groupPath === projectName || groupName === projectName) {
      return key;
    }
  }
  return null;
}

module.exports = function withProximityReaderModule(config) {
  return withXcodeProject(config, (config) => {
    const { projectName, platformProjectRoot } = config.modRequest;
    const xcodeProject = config.modResults;

    fs.writeFileSync(
      path.join(platformProjectRoot, 'ProximityReaderDiscoveryModule.swift'),
      SWIFT_CODE
    );
    fs.writeFileSync(
      path.join(platformProjectRoot, 'ProximityReaderDiscoveryModule.m'),
      OBJC_CODE
    );

    const allRefs = xcodeProject.pbxFileReferenceSection();
    const alreadyAdded = Object.values(allRefs).some(
      f => f && typeof f === 'object' && f.path &&
        String(f.path).includes('ProximityReaderDiscoveryModule.swift')
    );

    if (!alreadyAdded) {
      const targetUuid = xcodeProject.getFirstTarget().uuid;
      const groupKey = findMainGroupKey(xcodeProject, projectName);

      if (!groupKey) {
        throw new Error(
          `[add-proximity-reader-module] Could not find PBXGroup for "${projectName}". ` +
          `Available groups: ${JSON.stringify(
            Object.values(xcodeProject.hash.project.objects['PBXGroup'] || {})
              .filter(g => g && typeof g === 'object')
              .map(g => ({ name: g.name, path: g.path }))
          )}`
        );
      }

      xcodeProject.addSourceFile(
        'ProximityReaderDiscoveryModule.swift',
        { target: targetUuid },
        groupKey
      );
      xcodeProject.addSourceFile(
        'ProximityReaderDiscoveryModule.m',
        { target: targetUuid },
        groupKey
      );
    }

    return config;
  });
};
