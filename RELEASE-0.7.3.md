# 🐾 PawBook v0.7.3

This diagnostic maintenance release improves ENCI TLS error reporting.

## Changes

- Added detailed Home Assistant logging for ENCI certificate verification failures.
- Logs the affected host, endpoint, OpenSSL verification code and verification message.
- Keeps SSL certificate and hostname verification fully enabled.
- Does not log ENCI credentials, search values or dog data.
- Updated PawBook to version `0.7.3`.

## After updating

Restart Home Assistant, run an ENCI search, then open **Settings → System → Logs** and search for `ENCI TLS`.
