# 🐾 PawBook

[![HACS Validation](https://github.com/fabiovit/pawbook/actions/workflows/validate.yml/badge.svg)](https://github.com/fabiovit/pawbook/actions/workflows/validate.yml)
[![GitHub Release](https://img.shields.io/github/v/release/fabiovit/pawbook)](https://github.com/fabiovit/pawbook/releases)
[![License](https://img.shields.io/github/license/fabiovit/pawbook)](LICENSE)

A complete digital health record for pets in Home Assistant. All data is stored locally and exposed through native entities and actions.

## Features

- Multiple pets
- Age and weight history
- Vaccinations and reminders
- Veterinary visits
- Treatments and medications
- Heat cycle history
- Microchip and breed data
- ENCI data: registered name, ROI/RSR, pedigree number, breeder, parents and official lookup link
- Sensors and binary sensors for dashboards and automations

> PawBook is not affiliated with ENCI. It does not use private APIs, credentials or scraping. ENCI information is stored locally and the official portal is linked for consultation.

## Installation with HACS

1. Open HACS → Custom repositories.
2. Add `https://github.com/fabiovit/pawbook` as **Integration**.
3. Download PawBook and restart Home Assistant.
4. Go to **Settings → Devices & services → Add integration** and search for **PawBook**.

## Actions

- `pawbook.add_weight`
- `pawbook.add_vaccination`
- `pawbook.add_visit`
- `pawbook.add_treatment`
- `pawbook.add_heat_cycle`
- `pawbook.set_profile`
- `pawbook.delete_record`

### Add a weight

```yaml
action: pawbook.add_weight
data:
  dog_id: Evie
  weight: 12.4
  date: "2026-07-31"
```

### Add ENCI information

```yaml
action: pawbook.set_profile
data:
  dog_id: Evie
  enci_name: "Registered name"
  enci_registry: "ROI 00/000000"
  pedigree_number: "000000"
  father: "Father registered name"
  mother: "Mother registered name"
  breeder: "Breeder name"
  enci_url: "https://www.enci.it/libro-genealogico/libro-genealogico-on-line"
```

## License

MIT
