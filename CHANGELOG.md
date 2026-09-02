# Changelog

## 7.1.1
- Fixed HTTP 500 when opening PawBook options.
- Corrected automatic weight sensor selector schema.

## 7.1.0 - Automatic Weight Sensor

- Adds an optional Home Assistant sensor as an automatic weight source for each pet.
- Records valid sensor changes directly in PawBook weight history.
- Ignores unknown, unavailable, empty and non-positive values.
- Prevents duplicate automatic records with the same value on the same day.
- Converts pounds to kilograms when the source sensor reports lb/lbs.
- Keeps manual weight entry fully available.
- Uses a new cache-bust frontend asset: `pawbook-panel-v710.js`.

## 7.0.0 - Clean Major Release

- Major cleanup and consolidation of PawBook.
