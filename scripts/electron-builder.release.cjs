const signed = require('./electron-builder.signed.cjs');

// electron-builder otherwise silently skips notarization when credentials are missing.
// Keep credentials in Keychain; only the profile name belongs in the environment.
if (!process.env.APPLE_KEYCHAIN_PROFILE) {
  throw new Error(
    'Set APPLE_KEYCHAIN_PROFILE to a notarytool Keychain profile before packaging a release.',
  );
}

module.exports = {
  ...signed,
  directories: { ...signed.directories, output: 'release/v${version}/notarized' },
  mac: { ...signed.mac, notarize: true },
  dmg: { sign: true },
};
