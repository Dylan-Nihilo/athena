// Local `npm run package` remains ad-hoc; Developer ID builds must never fall back to it.
const { build } = require('../package.json');
const { identity: _localIdentity, ...mac } = build.mac;

module.exports = {
  ...build,
  forceCodeSigning: true,
  directories: { ...build.directories, output: 'release/v${version}/signed' },
  mac: {
    ...mac,
    type: 'distribution',
    hardenedRuntime: true,
    entitlements: 'resources/entitlements.mac.plist',
    entitlementsInherit: 'resources/entitlements.mac.plist',
    notarize: false,
  },
};
