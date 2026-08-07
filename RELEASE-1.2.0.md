# 🐾 PawBook v1.2.0

This release introduces ENCI hereditary health information directly inside the pedigree tree.

## New

- Retrieves official ENCI events for every ancestor that has an ENCI dog ID.
- Detects hip dysplasia grades (HD A–E).
- Detects elbow dysplasia grades (ED 0–3).
- Detects biological sample and DNA deposit information.
- Displays compact, color-coded HD/ED/DNA badges on pedigree cards.
- Shows complete official ENCI health events in the ancestor detail popup.
- Stores imported ancestor health information locally with the pedigree.

## Badge colors

- Green: HD A / ED 0
- Yellow: HD B / ED 1
- Orange: HD C / ED 2
- Red: HD D–E / ED 3
- Purple: DNA or biological sample available

## Technical

- Ancestor event requests use a conservative concurrency limit.
- Existing PawBook records, genealogy, photos and manual health data are preserved.
- Added a versioned v1.2.0 frontend asset to bypass stale Home Assistant cache.

## Updating

After installing the update:

1. Restart Home Assistant completely.
2. Open PawBook.
3. Run a new ENCI search and press **Importa** to retrieve health information for the pedigree.

ENCI may not hold HD/ED or DNA data for every ancestor. Missing badges mean that no matching official event was returned, not necessarily that the examination was never performed.
