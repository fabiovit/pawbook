# PawBook v4.8.0 – Smart Reminders & Health Calendar

PawBook 4.8.0 makes the health record proactive by combining reminders and upcoming health events in one place.

## Health Calendar

A new calendar is available directly inside the PawBook panel.

It includes:

- vaccination recalls;
- treatment start dates;
- treatment end dates;
- estimated next heat date;
- upcoming event summary;
- previous / next month navigation;
- smartphone-friendly layout.

The native Home Assistant PawBook calendar is also extended with the estimated heat-cycle window.

## Smart Reminders

New Home Assistant entities provide more useful automation triggers:

- estimated next heat date;
- days until estimated next heat;
- estimated heat-window binary sensor;
- treatment-ending binary sensor for therapies ending within three days.

The Smart Dashboard also includes a reminder strip showing the most relevant current reminder.

## Important

The estimated heat date and window are statistical projections based on the recorded PawBook history. They are not veterinary predictions.

## Compatibility

- Existing PawBook data is preserved.
- ENCI, pedigree, Smart Dashboard, Health Timeline and all previous Centers remain compatible.
- Frontend and panel registration are aligned on `pawbook-panel-v480`.

## Support PawBook

If PawBook is useful to you, you can support its development on Ko-fi:

https://ko-fi.com/fabvittori
