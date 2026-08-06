# 🐾 PawBook v0.7.4

This maintenance release fixes ENCI TLS certificate validation on Home Assistant.

## Fixed

- Bundled the **Actalis Domain Validation Server CA G3** intermediate certificate required by `lg.enci.it`.
- Fixed OpenSSL verification error **20: unable to get local issuer certificate**.
- Kept certificate validation and hostname verification fully enabled.
- SSL context creation remains outside the Home Assistant event loop.
- Retained detailed, privacy-safe TLS diagnostics.

## After updating

Restart Home Assistant completely before trying the ENCI search again.
