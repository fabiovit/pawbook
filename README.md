# 🐾 PawBook

[![HACS Validation](https://github.com/fabiovit/pawbook/actions/workflows/validate.yml/badge.svg)](https://github.com/fabiovit/pawbook/actions/workflows/validate.yml)
[![GitHub Release](https://img.shields.io/github/v/release/fabiovit/pawbook)](https://github.com/fabiovit/pawbook/releases)
[![License](https://img.shields.io/github/license/fabiovit/pawbook)](LICENSE)

**PawBook** is a complete digital health record for dogs and pets designed for Home Assistant.

Manage your pet's health, genealogy, vaccinations, treatments and ENCI pedigree directly from a modern dashboard, with all data stored locally inside Home Assistant.

---

# ✨ Features

## 🐶 Pet management

- Multiple pets
- Dog profile with photo
- Automatic age calculation
- Breed, sex and microchip
- Weight history
- Health timeline
- Statistics dashboard

## 💉 Health

- Vaccinations
- Veterinary visits
- Treatments
- Heat cycles
- Weight history
- Medication management

## 🧬 ENCI Integration

PawBook integrates directly with the official ENCI pedigree service.

Available features:

- Search by ROI / LOI / RSR
- Search by registered name
- Search by microchip
- Automatic profile import
- Automatic pedigree import
- Up to 4 pedigree generations
- Official ENCI events
- HD / ED health information
- DNA / biological sample information
- Local pedigree storage

## 🌳 Interactive pedigree

- Four-generation pedigree tree
- Male / female color coding
- Ancestor popup
- Health badges
- HD / ED information
- DNA information
- Responsive layout

## 📊 Dashboard

- Modern Home Assistant interface
- Health summary
- Next vaccination
- Latest visit
- Current weight
- Responsive design
- Mobile support

## 💾 Backup

- Export complete pet data
- Restore from JSON backup
- Safe validation before importing

---

# 📸 Screenshots

(Add screenshots here)

---

# 📦 Installation

## HACS

1. Open **HACS**
2. Custom repositories
3. Add

```
https://github.com/fabiovit/pawbook
```

as **Integration**.

Restart Home Assistant and add **PawBook** from **Settings → Devices & Services**.

---

# 🧬 Import from ENCI

Open the PawBook panel and select your dog.

Choose **ENCI** → **Import**.

Search using:

- ROI / LOI / RSR
- Registered name
- Microchip

PawBook automatically imports:

- dog profile
- pedigree
- breeder
- parents
- ancestry
- official ENCI events
- HD / ED results
- DNA information (when available)

Imported data is stored locally inside Home Assistant.

> PawBook is **not affiliated with ENCI**.

---

# ❤️ Health records

PawBook supports:

- Vaccinations
- Veterinary visits
- Treatments
- Heat cycles
- Weight records

Everything is displayed inside a unified health timeline.

---

# 🌳 Genealogy

The pedigree viewer includes:

- Four generations
- Interactive ancestor cards
- Detailed popups
- Health information
- ENCI integration
- Visual editor
- Local storage

No JSON editing is required.

---

# ⚙️ Available actions

- pawbook.add_weight
- pawbook.add_vaccination
- pawbook.add_visit
- pawbook.add_treatment
- pawbook.add_heat_cycle
- pawbook.set_profile
- pawbook.delete_record

Example:

```yaml
action: pawbook.add_weight
data:
  dog_id: Evie
  weight: 15.2
  date: "2026-08-09"
```

---

# 🔒 Privacy

All PawBook data is stored locally in Home Assistant.

PawBook does **not** upload your pet information to third-party services.

ENCI credentials, when required for importing, are used only during the active import session and are **never stored** by PawBook.

---

# 🚀 Roadmap

Upcoming features:

- Better mobile interface
- Timeline improvements
- Health charts
- Multiple photo gallery
- PDF export
- Cloud backup
- Multi-language support

---

# 📄 License

MIT
