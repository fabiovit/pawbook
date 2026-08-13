# PawBook v6.6.0 – Recorder Optimization

PawBook 6.6.0 reduces oversized Home Assistant sensor attributes to keep Recorder healthy and avoid the 16 KB state-attribute limit.

## Recorder optimization

- Removed the pet photo payload from `sensor.*_stato_sanitario` attributes.
- Removed the complete genealogy tree from `sensor.*_genealogia` attributes.
- Kept compact, useful summary attributes such as pet identity, ENCI references, parent names and total ancestor count.
- Full photos and genealogy data remain available inside PawBook itself.

This prevents warnings such as `State attributes ... exceed maximum size of 16384 bytes` and avoids unnecessary database growth.

## Data safety

No PawBook records are deleted. This release only stops duplicating large payloads into Home Assistant entity state attributes.

## Support PawBook

https://ko-fi.com/fabvittori
