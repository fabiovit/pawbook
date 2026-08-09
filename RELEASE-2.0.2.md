# 🐾 PawBook v2.0.2 – Mobile Genealogy Navigation

This maintenance release introduces a dedicated genealogy experience for smartphones while leaving the desktop pedigree unchanged.

## 📱 Mobile genealogy

- Replaced the compressed desktop pedigree on smartphones with a touch-friendly drill-down view.
- Start from the selected dog and navigate through **Father** and **Mother** cards one generation at a time.
- Added breadcrumb navigation so the current ancestry path is always visible.
- Added Back and Return-to-root actions.
- Displays ROI/LOI, birth date and HD/ED/DNA badges directly on ancestor cards when available.
- Added direct access to the complete ENCI ancestor detail popup.
- No horizontal pedigree scrolling is required on smartphones.

## 💻 Desktop

- The existing graphical four-generation pedigree remains unchanged.

## Technical

- Added the new `v202` frontend asset to avoid stale Home Assistant and browser cache.
- Existing PawBook data, ENCI imports, genealogy, photos, health records and backups are preserved.

## Updating

1. Install the update.
2. Restart Home Assistant completely.
3. Refresh the Home Assistant app/browser if necessary.
