# PawBook v6.10.6 – Cache Bust Build

This package uses a unique frontend asset name:

`pawbook-panel-v6106.js`

The UI and functionality are identical to PawBook v6.10.6.

The unique asset filename forces Home Assistant and the browser to load the new frontend instead of reusing a cached `pawbook-panel-v630.js`.

## After replacing the component

1. Restart Home Assistant.
2. Open PawBook.
3. Perform a forced refresh once if needed.

No GitHub publication is required for local testing.
