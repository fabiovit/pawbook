# 🐾 PawBook v0.8.0

This release rebuilds the ENCI detail import flow after the certificate-chain fix introduced in v0.7.4.

## ENCI import improvements

- Passes the complete selected ENCI search result to the detail importer.
- Uses ROI and microchip as fallbacks when the ENCI dog ID is missing or uses an unexpected field name.
- Supports multiple request variants used by different ENCI API revisions (GET/POST and alternate identifier names).
- No longer hides failed detail endpoints silently: Home Assistant logs now show which ENCI endpoint and request variant failed.
- Adds broader parsing for anagraphic data and pedigree structures.
- Preserves raw ENCI profile and pedigree responses inside `enci_data` for future parser improvements.
- Keeps full TLS certificate and hostname verification enabled.

## After updating

Restart Home Assistant completely, search for the dog again and press **Importa**.

If a detail endpoint still fails, open **Settings → System → Logs** and search for `ENCI endpoint`.
