# 🐾 PawBook

🇬🇧 English | 🇮🇹 [Italiano](README.it.md)

[![HACS Validation](https://github.com/fabiovit/pawbook/actions/workflows/validate.yml/badge.svg)](https://github.com/fabiovit/pawbook/actions/workflows/validate.yml)
[![GitHub Release](https://img.shields.io/github/v/release/fabiovit/pawbook)](https://github.com/fabiovit/pawbook/releases)
[![License](https://img.shields.io/github/license/fabiovit/pawbook)](LICENSE)

**PawBook** is a modern digital health record for dogs built exclusively for **Home Assistant**.

It combines veterinary records, pedigree management, ENCI integration, Smart Health features and native Home Assistant entities into a single, elegant interface.

All data is stored locally inside your Home Assistant instance.

---

# ✨ Features

## 🐶 Pet Management

- Multiple dogs
- Dog profile with photo
- Automatic age calculation
- Breed and sex
- Microchip information
- Weight history
- Health timeline
- Local data storage

---

## ❤️ Health Records

Manage your dog's complete medical history.

- Vaccinations
- Veterinary visits
- Treatments
- Medications
- Heat cycles
- Weight tracking
- Attachments (PDF & Images)
- Printable health report

---

## 🧬 ENCI Integration

Import official ENCI information directly from PawBook.

Supported data:

- Dog profile
- Registered name
- ROI / LOI / RSR
- Breeder
- Parents
- Four-generation pedigree
- Official ENCI events
- Hip Dysplasia (HD)
- Elbow Dysplasia (ED)
- DNA / Biological sample information

Imported data is stored locally inside Home Assistant.

> PawBook is **not affiliated with ENCI**.

---

## 🌳 Interactive Pedigree

A modern genealogy viewer with dedicated desktop and mobile layouts.

Features include:

- Four generations
- Interactive ancestor cards
- Health badges
- HD / ED information
- DNA information
- Ancestor popup
- Desktop pedigree tree
- Mobile-friendly genealogy navigation

---

## ❤️ Smart Health

PawBook automatically summarizes your dog's health information.

Examples:

- Next vaccination
- Last veterinary visit
- Active treatments
- Current weight
- Smart reminders
- Health overview

---

## 🏠 Native Home Assistant Integration

PawBook integrates naturally with Home Assistant.

Includes:

- Sidebar panel
- Sensors
- Binary Sensors
- Calendar entities
- Actions
- Dashboard support

Perfect for dashboards and automations.

---

## 📊 Statistics

Monitor your dog's health over time.

- Weight history
- Vaccination summary
- Visit history
- Treatment overview
- Health timeline

---

## 📎 Attachments

Store documents together with each medical record.

Supported files:

- PDF
- Images
- Medical reports
- Laboratory results
- Radiographs

---

## 💾 Backup & Restore

Keep your data safe.

- JSON backup
- Restore from backup
- Local attachment support
- Existing data protection

---

# 📦 Installation

## HACS

1. Open **HACS**
2. Select **Custom repositories**
3. Add

```
https://github.com/fabiovit/pawbook
```

as an **Integration**.

Restart Home Assistant.

Go to:

**Settings → Devices & Services → Add Integration**

Search for **PawBook**.

---

# 🧬 Import from ENCI

Open the PawBook sidebar.

Select your dog.

Open the **ENCI** section and press **Import**.

You can search by:

- ROI / LOI / RSR
- Registered name
- Microchip

PawBook automatically imports all available official information.

---

# ⚙️ Available Actions

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
  date: "2026-08-09"
```

---

# 🔒 Privacy

Your data always remains yours.

- Local storage only
- No cloud services
- No external tracking
- ENCI credentials are only used during the import session and are never stored

---

# 🚀 Roadmap

Future improvements planned:

- Apple Health-style timeline
- Additional statistics
- PDF report improvements
- Optional cloud backup
- Multi-language interface
- Additional pedigree analytics

---

# 📄 License

Released under the MIT License.
