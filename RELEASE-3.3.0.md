# 🐾 PawBook v3.3.0 – Smart Health Edition

PawBook 3.3 turns the digital health record into a more proactive Home Assistant companion while keeping health decisions with the owner and veterinarian.

## ❤️ Smart Health

- New Smart Health dashboard summary based only on data stored in PawBook.
- Highlights upcoming or expired vaccination dates.
- Shows time since the latest veterinary visit and weight record.
- Shows currently active treatments.
- No diagnosis or clinical prediction is performed.

## 🏠 Home Assistant entities

New entities make PawBook data easier to use in dashboards and automations:

- Smart Health sensor.
- Days to next vaccination sensor.
- Days since last visit sensor.
- Visit overdue binary sensor.
- Weight reminder binary sensor.
- Native PawBook health calendar.

The existing PawBook entities remain available.

## 📅 Health calendar

A native Home Assistant calendar now exposes:

- vaccination recall/expiry dates;
- treatment start dates;
- treatment end dates.

Calendar events can be used by Home Assistant automations and notifications.

## 📊 Weight chart

The statistics section now includes a responsive weight trend chart using the latest stored measurements.

## 📎 Attachments

- Store small PDF reports and images locally in PawBook.
- Download or delete attachments directly from the panel.
- Attachments are included in PawBook JSON backups.
- A conservative per-file size limit protects Home Assistant storage.

## 📄 Health report

PawBook can generate a clean printable health report containing profile data, vaccinations, visits, treatments and weights. Use the browser print dialog to print it or save it as PDF.

## 🧬 Preserved features

- ENCI search and import.
- Four-generation pedigree.
- ENCI HD / ED / DNA data.
- Desktop pedigree and dedicated mobile genealogy navigation.
- Dog photo support.
- Health timeline.
- JSON backup and restore.
- Existing PawBook 2.x stored data.

## Updating

1. Install PawBook v3.3.0.
2. Restart Home Assistant completely.
3. Refresh the browser/app if the old frontend remains cached.

Existing records are migrated in place. PawBook Smart Health summarizes recorded information and is not a diagnostic or veterinary decision-support tool.
