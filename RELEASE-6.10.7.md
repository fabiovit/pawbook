# PawBook v6.10.7 – Home Assistant Theme-Aware Fix

PawBook v6.10.7 fixes theme detection by reading the active Home Assistant theme directly instead of relying on the operating system or browser color preference.

## What's new

- PawBook now reads `hass.themes.darkMode`.
- Dark mode follows the theme selected inside Home Assistant.
- Light mode follows the theme selected inside Home Assistant.
- Theme behavior is now independent from macOS, Windows, Safari or Chrome preferences.
- Preserves the approved dark PawBook palette.
- Preserves the light-theme fixes introduced in v6.10.5.
- Uses the new cache-busting frontend asset `pawbook-panel-v6107.js`.
- No changes to PawBook data, layout, navigation or backend logic.
- Keeps all Health Control Center features intact.

## Existing features preserved

- Health Control Center
- Multi-page navigation
- Weight Center
- Vaccination Center
- Veterinary Center
- Treatments Center
- Heat Cycle Center
- Agenda
- ENCI
- Genealogy
- Diagnostics
- Large typography
- Responsive desktop/mobile layout
- Recorder-safe sensor attributes

## Update notes

After updating through HACS:

1. Restart Home Assistant.
2. Open PawBook.
3. If needed, perform one forced browser refresh.

## Support

https://ko-fi.com/fabvittori

Thank you for using PawBook! 🐾
