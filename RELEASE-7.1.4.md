# PawBook v7.1.4

## Automatic weight tracking

PawBook can now use a Home Assistant sensor as the automatic weight source for each pet.

### New
- Select an automatic weight sensor directly from PawBook options.
- New valid measurements are stored automatically in the pet weight history.
- kg values are supported directly and lb/lbs values are converted to kg.
- Invalid, unavailable and non-positive values are ignored.
- Duplicate automatic entries are prevented.
- Manual weight entry remains available.

### Fixed
- Updated PawBook OptionsFlow to the current Home Assistant API.
- Fixed the 500 Internal Server Error when opening Configure.
- Fixed Safari frontend class collisions with a unique v7.1.4 frontend asset.
