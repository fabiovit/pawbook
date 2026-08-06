# 🐾 PawBook v0.7.2

This maintenance release fixes the Home Assistant event-loop warning introduced while improving ENCI HTTPS certificate handling.

## Fixes

- Creates the ENCI SSL context outside the Home Assistant event loop.
- Removes the `load_verify_locations` blocking-call warning.
- Keeps certificate and hostname verification enabled.
- Keeps the dedicated CA bundle used for ENCI HTTPS requests.

## After updating

Restart Home Assistant, then try the ENCI search again.
