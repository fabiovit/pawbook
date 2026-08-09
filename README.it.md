# 🐾 PawBook

🇬🇧 [English](README.md) | 🇮🇹 Italiano

[![HACS Validation](https://github.com/fabiovit/pawbook/actions/workflows/validate.yml/badge.svg)](https://github.com/fabiovit/pawbook/actions/workflows/validate.yml)
[![GitHub Release](https://img.shields.io/github/v/release/fabiovit/pawbook)](https://github.com/fabiovit/pawbook/releases)
[![License](https://img.shields.io/github/license/fabiovit/pawbook)](LICENSE)

**PawBook** è un moderno libretto sanitario digitale per cani, progettato esclusivamente per **Home Assistant**.

Riunisce in un'unica interfaccia elegante la gestione sanitaria, la genealogia, l'integrazione ENCI, le funzionalità Smart Health e l'integrazione nativa con Home Assistant.

Tutti i dati vengono salvati esclusivamente all'interno della tua installazione di Home Assistant.

---

# ✨ Funzionalità

## 🐶 Gestione del cane

- Gestione di più cani
- Profilo completo con fotografia
- Calcolo automatico dell'età
- Razza e sesso
- Microchip
- Storico del peso
- Cronologia sanitaria
- Archiviazione locale dei dati

---

## ❤️ Cartella sanitaria

Gestisci tutta la storia clinica del tuo cane.

- Vaccinazioni
- Visite veterinarie
- Terapie
- Farmaci
- Cicli di calore
- Controllo del peso
- Allegati (PDF e immagini)
- Report sanitario stampabile

---

## 🧬 Integrazione ENCI

Importa automaticamente i dati ufficiali del Libro Genealogico ENCI.

Sono disponibili:

- Anagrafica del cane
- Nome registrato
- ROI / LOI / RSR
- Allevatore
- Padre e madre
- Pedigree fino a quattro generazioni
- Avvenimenti ufficiali ENCI
- Displasia dell'anca (HD)
- Displasia del gomito (ED)
- Informazioni DNA e deposito biologico

Tutti i dati importati vengono memorizzati localmente all'interno di Home Assistant.

> PawBook **non è affiliato ad ENCI**.

---

# 🌳 Genealogia interattiva

Visualizza il pedigree in modo moderno e intuitivo.

Caratteristiche:

- Albero genealogico fino a quattro generazioni
- Schede interattive degli antenati
- Badge sanitari
- Informazioni HD / ED
- Informazioni DNA
- Popup con i dettagli dell'antenato
- Layout dedicato per desktop
- Navigazione ottimizzata per smartphone

---

# ❤️ Smart Health

PawBook riassume automaticamente lo stato sanitario del cane.

Ad esempio:

- Prossimo vaccino
- Ultima visita veterinaria
- Terapie attive
- Peso attuale
- Promemoria intelligenti
- Riepilogo sanitario

---

# 🏠 Integrazione nativa con Home Assistant

PawBook si integra completamente con Home Assistant.

Include:

- Pannello laterale dedicato
- Sensori
- Binary Sensor
- Entità Calendario
- Azioni
- Supporto per dashboard

Perfetto per creare automazioni e plance personalizzate.

---

# 📊 Statistiche

Monitora facilmente lo stato di salute nel tempo.

Disponibili:

- Andamento del peso
- Storico delle vaccinazioni
- Storico delle visite
- Riepilogo delle terapie
- Timeline sanitaria

---

# 📎 Allegati

Ogni evento sanitario può contenere documentazione.

Supporta:

- PDF
- Immagini
- Referti veterinari
- Esami di laboratorio
- Radiografie

---

# 💾 Backup e Ripristino

Proteggi facilmente tutti i tuoi dati.

Funzionalità disponibili:

- Esportazione completa in JSON
- Ripristino da backup
- Supporto agli allegati
- Protezione dei dati esistenti

---

# 📦 Installazione

## Tramite HACS

1. Apri **HACS**
2. Seleziona **Repository personalizzati**
3. Aggiungi

```
https://github.com/fabiovit/pawbook
```

come **Integrazione**.

Riavvia Home Assistant.

Vai in:

**Impostazioni → Dispositivi e Servizi → Aggiungi Integrazione**

e cerca **PawBook**.

---

# 🧬 Importazione ENCI

Apri il pannello laterale di PawBook.

Seleziona il cane.

Apri la sezione **ENCI** e premi **Importa**.

Puoi cercare utilizzando:

- ROI / LOI / RSR
- Nome registrato
- Microchip

PawBook importerà automaticamente tutte le informazioni ufficiali disponibili.

---

# ⚙️ Azioni disponibili

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
  date: "2026-08-09"
```

---

# 🔒 Privacy

I tuoi dati rimangono sempre sotto il tuo controllo.

- Salvataggio esclusivamente locale
- Nessun servizio cloud obbligatorio
- Nessun tracciamento esterno
- Le credenziali ENCI vengono utilizzate esclusivamente durante l'importazione e non vengono mai memorizzate

---

# 🚀 Roadmap

Le prossime evoluzioni previste includono:

- Timeline sanitaria in stile Apple Health
- Nuove statistiche
- Report PDF avanzati
- Backup cloud opzionale
- Interfaccia multilingua
- Analisi genealogiche avanzate

---

# 📄 Licenza

Distribuito con licenza **MIT**.
