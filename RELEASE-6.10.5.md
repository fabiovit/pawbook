# PawBook v6.10.5 – Light Theme Fix

PawBook v6.10.5 is a visual hotfix focused exclusively on light-theme compatibility.

## What changed

- Removes dark hardcoded surfaces that looked wrong with Home Assistant light themes.
- Replaces fixed black backgrounds with Home Assistant theme-aware colors.
- Keeps the dark-theme appearance unchanged.
- Improves contrast and readability in light mode.
- Preserves the teal PawBook accent color.
- No layout, navigation or functionality changes.
- Keeps the stable `pawbook-panel-v630.js` frontend base.

## Notes

This release is intentionally minimal and only addresses theme rendering.

After updating, restart Home Assistant once and perform a forced browser refresh if the old frontend is still cached.

## Support

https://ko-fi.com/fabvittori
