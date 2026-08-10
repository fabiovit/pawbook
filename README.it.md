# 🐾 PawBook

🇬🇧 [English](README.md) | 🇮🇹 Italiano

[![HACS Validation](https://github.com/fabiovit/pawbook/actions/workflows/validate.yml/badge.svg)](https://github.com/fabiovit/pawbook/actions/workflows/validate.yml)
[![GitHub Release](https://img.shields.io/github/v/release/fabiovit/pawbook)](https://github.com/fabiovit/pawbook/releases)
[![License](https://img.shields.io/github/license/fabiovit/pawbook)](LICENSE)

**PawBook** è un moderno libretto sanitario digitale per cani progettato per **Home Assistant**.

Riunisce cartella sanitaria, vaccinazioni, terapie, andamento del peso, Smart Health, integrazione ENCI e genealogia in un'unica interfaccia, con archiviazione locale dei dati.

> PawBook non è affiliato ad ENCI. Le informazioni importate vengono salvate localmente in Home Assistant.

## ✨ Funzionalità

### 🐶 Gestione del cane
- Gestione di più animali
- Foto del profilo
- Calcolo automatico dell'età
- Razza, sesso e microchip
- Storico del peso e timeline sanitaria

### 💉 Centro Vaccinazioni
- Vaccinazioni raggruppate per tipologia
- Cronologia completa delle dosi
- Ultima dose e prossimo richiamo
- Indicatori di stato
- Veterinario, lotto, note e scadenza/richiamo

### 🩺 Centro Veterinario
- Timeline completa delle visite raggruppata per anno
- Categorie delle visite
- Veterinario, esito e note
- Allegati PDF/immagini associati alla singola visita

### 💊 Centro Terapie
- Terapie in corso, programmate e terminate
- Dosaggio e frequenza
- Durata e avanzamento della terapia
- Allegati PDF/immagini associati alla singola terapia

### ❤️ Smart Health
- Riepilogo dello stato sanitario
- Prossimo vaccino
- Ultima visita veterinaria
- Terapie attive
- Promemoria peso e statistiche

### 🧬 ENCI e genealogia
- Ricerca per ROI / LOI / RSR, nome registrato o microchip
- Importazione anagrafica e pedigree
- Genealogia fino a quattro generazioni
- Informazioni HD / ED / DNA quando disponibili
- Avvenimenti ufficiali ENCI
- Albero desktop e navigazione genealogica dedicata su smartphone

### 🏠 Home Assistant
- Pannello laterale dedicato
- Sensori e binary sensor
- Entità calendario
- Azioni per automazioni
- Backup e ripristino locale in JSON
- Report sanitario stampabile

## 📦 Installazione tramite HACS

1. Apri **HACS → Repository personalizzati**.
2. Aggiungi `https://github.com/fabiovit/pawbook` come **Integrazione**.
3. Scarica PawBook e riavvia Home Assistant.
4. Vai in **Impostazioni → Dispositivi e servizi → Aggiungi integrazione** e cerca **PawBook**.

Non è necessario aggiungere risorse Lovelace o modificare `configuration.yaml`.

## 🧬 Importazione ENCI

Apri PawBook dal menu laterale, seleziona il cane e apri la sezione **ENCI**. Puoi cercare per ROI/LOI/RSR, nome registrato o microchip e importare l'anagrafica, il pedigree e le informazioni sanitarie ufficiali disponibili.

## ⚙️ Azioni disponibili

- `pawbook.add_weight`
- `pawbook.add_vaccination`
- `pawbook.add_visit`
- `pawbook.add_treatment`
- `pawbook.add_heat_cycle`
- `pawbook.set_profile`
- `pawbook.delete_record`

Esempio:

```yaml
action: pawbook.add_weight
data:
  dog_id: Evie
  weight: 15.2
  date: "2026-08-10"
```

## 🔒 Privacy

PawBook è progettato con un approccio local-first. Dati del cane, cartella sanitaria, genealogia, fotografie e allegati vengono salvati all'interno della tua installazione di Home Assistant. Non è richiesto alcun account cloud PawBook.



## 🔔 Promemoria automatici

PawBook genera automaticamente i promemoria utilizzando date dei vaccini, terapie, visite veterinarie, pesate e finestra stimata del prossimo calore. Non è necessario inserire manualmente i promemoria.

## ☕ Sostieni PawBook

Se PawBook ti è utile e vuoi sostenere lo sviluppo del progetto, puoi offrirmi un caffè su Ko-fi:

**https://ko-fi.com/fabvittori**

## 📄 Licenza

MIT
