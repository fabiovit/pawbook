# PUBBLICAZIONE GITHUB — PawBook v6.10.7

## Commit

### Oggetto
Release PawBook v6.10.7 - Home Assistant Theme-Aware Fix

### Descrizione
- Corregge il rilevamento del tema di Home Assistant
- PawBook ora usa hass.themes.darkMode
- Il tema scuro segue direttamente Home Assistant
- Il tema chiaro segue direttamente Home Assistant
- Il comportamento non dipende più dal tema di macOS, Windows, Safari o Chrome
- Mantiene la palette scura PawBook approvata
- Mantiene le correzioni del tema chiaro introdotte nella v6.10.5
- Introduce il frontend cache-busting pawbook-panel-v6107.js
- Mantiene invariati layout, navigazione, dati e backend
- Aggiorna manifest.json alla versione 6.10.7
- Aggiorna CHANGELOG e note di release

## Release

### Tag
v6.10.7

### Titolo
PawBook v6.10.7 – Home Assistant Theme-Aware Fix

### Descrizione
## 🐾 PawBook v6.10.7 – Home Assistant Theme-Aware Fix

PawBook v6.10.7 corregge definitivamente la gestione dei temi chiaro e scuro.

Nelle versioni precedenti PawBook poteva basarsi sulla preferenza colore del sistema operativo o del browser. Home Assistant, però, può utilizzare un tema diverso da quello del sistema.

Da questa release PawBook legge direttamente lo stato del tema di Home Assistant tramite `hass.themes.darkMode`.

### 🎨 Tema Home Assistant

- Il tema scuro di PawBook segue direttamente il tema scuro selezionato in Home Assistant
- Il tema chiaro segue direttamente il tema chiaro selezionato in Home Assistant
- Il comportamento è indipendente dal tema di macOS, Windows, Safari o Chrome
- Ripristinata e mantenuta la palette scura PawBook approvata
- Mantenute le correzioni del tema chiaro introdotte nelle release precedenti
- Mantiene il caratteristico accento teal PawBook

### ⚡ Cache busting

La release utilizza il nuovo frontend:

`pawbook-panel-v6107.js`

Questo evita che Home Assistant o il browser continuino a utilizzare una precedente versione del frontend dalla cache.

### 🩺 Health Control Center

Restano disponibili tutte le funzionalità del nuovo Health Control Center:

- ⚖️ Peso
- 💉 Vaccini
- 🩺 Visite veterinarie
- 💊 Terapie
- 🌸 Cicli di calore
- 📅 Agenda sanitaria
- 🏆 ENCI
- 🌳 Genealogia
- 🛠 Diagnostica

### 🔧 Dettagli tecnici

- Versione aggiornata a `6.10.7`
- Rilevamento tema tramite `hass.themes.darkMode`
- Nuovo asset frontend `pawbook-panel-v6107.js`
- Nessuna modifica ai dati PawBook
- Nessuna modifica al backend
- Nessuna modifica alla navigazione o alla struttura delle pagine
- Mantenute le ottimizzazioni Recorder-safe

### 🔄 Aggiornamento

Dopo l'aggiornamento tramite HACS:

1. Riavvia Home Assistant
2. Apri PawBook
3. Se necessario, esegui un refresh completo del browser

### ☕ Supporta il progetto

Se PawBook ti è utile e vuoi supportarne lo sviluppo:

https://ko-fi.com/fabvittori

Grazie per usare PawBook! 🐾
