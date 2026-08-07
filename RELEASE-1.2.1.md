# 🐾 PawBook v1.2.1

This maintenance release fixes the broken/question-mark icon shown next to the PawBook title.

## Fixed

- Replaced the header icon loaded through Home Assistant's Brands endpoint with a built-in PawBook paw SVG.
- The PawBook logo now renders reliably for custom installations without depending on external brand assets.
- Added a new versioned frontend asset to avoid stale browser and Home Assistant cache.

## Preserved

- ENCI pedigree import and health data (HD, ED and DNA).
- Dog photo support.
- Italian `DD/MM/YYYY` date formatting.
- Pedigree ancestor detail popups and fourth-generation layout.
- Existing PawBook health records and locally stored data.

## Updating

Restart Home Assistant completely after installing the update. If the old icon is still visible, refresh the browser once with `Cmd+Shift+R` or `Ctrl+F5`.
