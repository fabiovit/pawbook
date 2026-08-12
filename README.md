# 🐾 PawBook

🇬🇧 English | 🇮🇹 [Italiano](README.it.md)

[![release](https://img.shields.io/github/v/release/fabiovit/pawbook?label=release)](https://github.com/fabiovit/pawbook/releases)
![HACS Custom](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)
[![Validate](https://github.com/fabiovit/pawbook/actions/workflows/validate.yml/badge.svg)](https://github.com/fabiovit/pawbook/actions/workflows/validate.yml)
[![Hassfest](https://github.com/fabiovit/pawbook/actions/workflows/hassfest.yml/badge.svg)](https://github.com/fabiovit/pawbook/actions/workflows/hassfest.yml)
[![license](https://img.shields.io/github/license/fabiovit/pawbook?label=license)](LICENSE)


**PawBook** is a modern digital health record for dogs built for **Home Assistant**.

It combines veterinary records, vaccinations, treatments, weight tracking, Smart Health, ENCI pedigree integration and native Home Assistant entities in a single local-first interface.

> PawBook is not affiliated with ENCI. Imported information is stored locally in Home Assistant.

## ✨ Features

### 🐶 Pet management
- Multiple pets
- Profile photo
- Automatic age calculation
- Breed, sex and microchip
- Weight history and health timeline

### 💉 Vaccination Center
- Vaccinations grouped by vaccine type
- Full dose history
- Next recall and latest dose
- Status indicators
- Veterinarian, batch, notes and recall details

### 🩺 Veterinary Center
- Complete veterinary timeline grouped by year
- Visit categories
- Veterinarian, outcome and notes
- PDF/image attachments linked to individual visits

### 💊 Treatments Center
- Active, scheduled and completed treatments
- Dosage and frequency
- Treatment duration and progress
- PDF/image attachments linked to individual treatments

### ❤️ Smart Health
- Health overview
- Next vaccination
- Last veterinary visit
- Active treatments
- Weight reminders and statistics

### 🧬 ENCI & pedigree
- Search by ROI / LOI / RSR, registered name or microchip
- Profile and pedigree import
- Four-generation genealogy
- HD / ED / DNA information when available
- Official ENCI events
- Desktop pedigree and mobile drill-down navigation

### 🏠 Home Assistant
- Sidebar panel
- Sensors and binary sensors
- Calendar entities
- Actions for automations
- Local JSON backup and restore
- Printable health report

## 📦 Installation with HACS

1. Open **HACS → Custom repositories**.
2. Add `https://github.com/fabiovit/pawbook` as **Integration**.
3. Download PawBook and restart Home Assistant.
4. Go to **Settings → Devices & services → Add integration** and search for **PawBook**.

No Lovelace resources or `configuration.yaml` changes are required.

## 🧬 Import from ENCI

Open the PawBook sidebar panel, select the pet and open **ENCI**. Search by ROI/LOI/RSR, registered name or microchip, select the matching subject and import the available profile, pedigree and official health information.

## ⚙️ Available actions

- `pawbook.add_weight`
- `pawbook.add_vaccination`
- `pawbook.add_visit`
- `pawbook.add_treatment`
- `pawbook.add_heat_cycle`
- `pawbook.set_profile`
- `pawbook.delete_record`

Example:

```yaml
action: pawbook.add_weight
data:
  dog_id: Evie
  weight: 15.2
  date: "2026-08-10"
```

## 🔒 Privacy

PawBook is local-first. Pet data, health records, genealogy, photos and attachments are stored inside your Home Assistant installation. PawBook does not require a PawBook cloud account.


## 🔔 Automatic reminders

PawBook automatically derives reminders from vaccination dates, treatments, veterinary visits, weight records and the estimated heat-cycle window. No manual reminder entry is required.


## 🐾 Multi-Pet Hub

When more than one pet is configured, PawBook automatically enables the **PawBook Family** dashboard.

It provides pet cards, family-wide reminders and a shared upcoming health agenda while keeping every pet's data completely separate.

## ☕ Support PawBook

If you enjoy PawBook and want to support its development, you can buy me a coffee on Ko-fi:

**https://ko-fi.com/fabvittori**

## 📄 License

MIT
