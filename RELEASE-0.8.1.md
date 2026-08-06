# 🐾 PawBook v0.8.1

This release fixes ENCI pedigree parsing using the real response structure returned by `GetPedigreeCane`.

## Fixed

- Parses the flat ENCI fields from `NOME_PADRE_1` and `NOME_MADRE_2` through ancestor slot 30.
- Reconstructs the complete binary family tree up to four ancestor generations.
- Imports ROI/LOI identifiers and ENCI internal IDs for every available ancestor.
- Converts ENCI birth dates from `YYYYMMDD` to `YYYY-MM-DD`.
- Keeps full TLS certificate and hostname verification enabled.

## After updating

Restart Home Assistant, run a new ENCI search and press **Importa** again.
