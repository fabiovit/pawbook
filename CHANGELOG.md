## 6.0.0 - Multi-Pet Hub

- Introduced the new PawBook Family / Multi-Pet Hub.
- Added a dedicated family overview when more than one pet is configured.
- Added one card per pet with photo, breed, current weight, next vaccination and reminder count.
- Added global family reminders aggregated across all configured pets.
- Added a shared upcoming health agenda across all pets.
- Added direct navigation from family reminders/events to the correct pet and PawBook section.
- Added a clearer pet switcher while preserving fully separated data per config entry.
- Preserved all individual health centers, ENCI data, genealogy, heat forecasts, calendar and reminders.
- Updated visible version, manifest and frontend asset to 6.0.0 / v600.
- Preserved Ko-fi support information.

## 5.0.0 - Health Hub

- Introduced the PawBook 5 Health Hub refinement.
- Added a dedicated Automatic Reminders Center.
- Made it explicit that reminders are generated automatically from PawBook records and require no manual entry.
- Added automatic reminder rules for vaccination deadlines, treatment endings, annual veterinary visits, weight updates and the estimated heat window.
- Made the Smart Dashboard reminder strip fully clickable and linked it to the new Reminders Center.
- Fixed Heat Cycle Center edit/delete controls being positioned outside their rows.
- Added direct click-to-edit support on heat-cycle rows.
- Added robust record ID matching for heat-cycle editing.
- Added the selected heat-cycle dates to the edit dialog title and context panel.
- Added a specific deletion confirmation including the selected heat-cycle start date.
- Fixed stray Modify/Delete buttons appearing over unrelated dashboard cards.
- Preserved Health Calendar, Smart Dashboard, compact Health Timeline, ENCI Pro and genealogy.
- Preserved Ko-fi support information.
- Updated visible version, manifest and frontend asset to 5.0.0 / v500.

## 4.8.0 - Smart Reminders & Health Calendar

- Introduced the new in-panel Health Calendar.
- Added monthly navigation and upcoming health events.
- Added vaccination recall events.
- Added treatment start/end events.
- Added the estimated next heat date to the Health Calendar.
- Extended the native Home Assistant PawBook calendar with the estimated heat window.
- Added `sensor.prossimo_calore_stimato`-style PawBook entity for each configured pet.
- Added a days-to-next-heat sensor.
- Added a binary sensor that activates during the estimated heat window.
- Added a treatment-ending reminder binary sensor for therapies ending within three days.
- Added a Smart Reminder strip to the Smart Dashboard.
- Preserved the compact filterable Health Timeline.
- Updated the visible PawBook version badge to 4.8.0.
- Preserved Ko-fi support information.
- Added the v480 frontend asset.
- Updated PawBook to version 4.8.0.

## 4.7.0 - Smart Dashboard & Health Timeline

- Introduced the new Smart Dashboard with health, vaccination, visit, treatment, weight and heat-cycle summaries.
- Added the estimated next heat window directly to the dashboard.
- Redesigned the Health Timeline into a compact, filterable chronology.
- Added timeline filters for vaccinations, visits, treatments, weight and heat cycles.
- Limited the initial timeline view to eight events with an optional expand action.
- Added direct dashboard navigation to Treatments and Heat Cycle Center.
- Fixed the visible PawBook version badge, which was still showing 4.4.
- Updated the visible version badge to 4.7.0.
- Preserved the v4.5.1 frontend registration fix and all v4.6.0 Heat Cycle Center features.
- Preserved Ko-fi support information.
- Added the v470 frontend asset.
- Updated PawBook to version 4.7.0.

## 4.6.0 - Heat Cycle Center

- Introduced the new Heat Cycle Center.
- Added complete heat-cycle history with duration for completed cycles.
- Added average cycle duration and median interval statistics.
- Added an estimated next heat date based on the dog's own recorded history.
- Added a probable date window that adapts to observed cycle variability.
- Added an explicit confidence indicator and statistical-estimate disclaimer.
- Added responsive smartphone layouts.
- Preserved edit/delete support and all existing heat-cycle data.
- Preserved the v4.5.1 blank-panel frontend fix.
- Preserved Ko-fi support information.
- Added the v460 frontend asset.
- Updated PawBook to version 4.6.0.

## 4.5.1 - ENCI Pro frontend hotfix

- Fixed the PawBook panel custom-element registration mismatch introduced in v4.5.0.
- Aligned `panel.py` and the frontend custom element on `pawbook-panel-v451`.
- Added a new versioned frontend asset to bypass stale Home Assistant/browser cache.
- Preserved all ENCI Pro, genealogy, health and PawBook data features.

## 4.5.0 - ENCI Pro

- Introduced the new ENCI Pro dashboard.
- Added at-a-glance HD, ED, DNA and pedigree summaries.
- Added a dedicated official health section for ENCI results.
- Added ENCI event counters and improved event presentation.
- Preserved the interactive desktop pedigree and mobile genealogy navigation.
- Preserved all existing PawBook data and ENCI import behavior.
- Added responsive ENCI Pro layouts for smartphone.
- Preserved Ko-fi support information.
- Added the v450 frontend asset.
- Updated PawBook to version 4.5.0.

# Changelog

## 4.4.0

### Weight Center
- Rebuilt the weight section as a complete Weight Center dashboard.
- Added current weight, last variation and total variation summaries.
- Added average, minimum and maximum weight statistics.
- Expanded the weight chart to show a longer history.
- Added the complete weight history grouped by year.
- Preserved edit and delete actions for every weight record.
- Added responsive layouts for desktop, tablet and smartphone.

## 4.3.0

- Introduced the new Treatments Center.
- Added active, scheduled and completed treatment summaries.
- Added dosage and frequency information directly to treatment cards.
- Added treatment duration progress for active therapies with start/end dates.
- Added PDF/image attachments linked directly to individual treatments.
- Added a responsive mobile layout for the Treatments Center.
- Added Ko-fi support information to the English and Italian README and release notes.
- Added the versioned v430 frontend asset.

## 4.2.0

- Introduced the new Veterinary Center.
- Added visit overview with last visit, days since last visit, veterinarian count and visit categories.
- Added a complete year-grouped veterinary timeline.
- Added automatic visual categories for controls, exams, diagnostics, specialist visits and surgery.
- Added full outcome and notes display directly in the visit timeline.
- Added per-visit PDF/image attachments linked to the veterinary record.
- Preserved edit/delete support and all existing PawBook records.
- Added the versioned v420 frontend asset.

# PawBook Changelog

## 4.1.0
- Introduced the Vaccination Center dashboard.
- Added vaccine status overview, latest dose and next recall summaries.
- Added dose counters and detailed status per vaccine.
- Added complete dose metadata (veterinarian, batch, recall date and notes) to history.
- Added one-tap new-dose action prefilled with the selected vaccine name.
- Preserved the complete vaccination history without filtering older records.
- Updated frontend asset to v410.

# Changelog

## 3.3.0 - Smart Health Edition

- Added Smart Health summary in the PawBook dashboard.
- Added native Home Assistant health calendar with vaccination reminders and treatment dates.
- Added Smart Health, days-to-vaccination and days-since-visit sensors.
- Added visit-overdue and weight-reminder binary sensors for automations and notifications.
- Added local document/image attachments with backup support.
- Added weight trend chart.
- Added printable health report with browser PDF export.
- Preserved ENCI, pedigree health, mobile genealogy and all existing PawBook data.

## 2.0.0

- Nuova dashboard PawBook 2.0 con navigazione estesa.
- Timeline sanitaria unificata per peso, vaccini, visite, terapie e calori.
- Età del cane calcolata automaticamente dalla data di nascita.
- Nuova sezione statistiche con andamento peso e riepiloghi sanitari.
- Backup e ripristino completo per singolo cane in formato JSON.
- Migliorata la gestione multi-cane mantenendo le schede esistenti.
- Conservate integrazione ENCI, genealogia, HD/ED/DNA e foto locali.
- Nuovo asset frontend v200 per evitare cache obsolete.

## 1.2.0

- Added ENCI HD/ED/DNA import for every ancestor in the pedigree.
- Added color-coded health badges to pedigree cards.
- Added complete ENCI health-event details to ancestor popups.
- Added concurrency-limited ancestor data retrieval and local persistence.
- Added a new versioned frontend asset to bypass stale cache.

## 1.1.3

- Corrected fourth-generation parent-child alignment.
- Grouped each trisnonno pair directly below the correct bisnonno.
- Added visual connectors for all eight fourth-generation pairs.
- Added a new versioned frontend asset to bypass stale cache.

## 1.1.2

- Fixed the black PawBook panel caused by a mismatch between the registered Home Assistant panel element and the JavaScript custom element.
- Added a new versioned frontend asset to bypass browser and Home Assistant cache.
- Preserved the pedigree improvements, ancestor popup, Italian date formatting and dog photo support.

## 1.0.1

- Migliorata la leggibilità della quarta generazione dell’albero genealogico.
- Aggiunto scorrimento orizzontale con schede di larghezza sufficiente per evitare nomi spezzati lettera per lettera.
- Uniformate tutte le date al formato italiano `GG/MM/AAAA`.
- Corrette anche le date ISO ENCI contenenti l’orario, ad esempio `2023-03-31T00:00:00`.
- Aggiornato il file frontend per evitare la cache della versione precedente.

## 1.0.0

- Prima release stabile di PawBook.
- Nuovo albero genealogico ENCI orizzontale, suddiviso chiaramente per generazioni.
- Distinzione visiva tra antenati maschi e femmine.
- Importazione completa dell’anagrafica ENCI disponibile: razza, mantello, sesso, data di nascita, microchip, allevatore, proprietario, padre e madre.
- Visualizzazione separata degli avvenimenti ufficiali ENCI.
- Stato dei documenti sanitari e della carta dentaria ENCI.
- Richieste agli endpoint ENCI allineate al portale ufficiale con `GET` e parametro `ID_CANE`.
- Mantenuta la verifica TLS completa con il certificato intermedio Actalis.
- Nuovo asset frontend versionato per evitare problemi di cache dopo l’aggiornamento.

## 0.8.1

- Fixed parsing of the real flat ENCI pedigree response.
- Builds the full family tree from `PADRE_1` / `MADRE_2` through ancestor slot 30.
- Imports ENCI birth dates and converts `YYYYMMDD` to ISO format.
- Keeps the verified Actalis TLS certificate-chain workaround.

## 0.7.4

- Included the Actalis Domain Validation Server CA G3 intermediate certificate for ENCI.
- Fixed TLS verification error 20 (`unable to get local issuer certificate`).
- Kept SSL certificate and hostname verification enabled.

## 0.7.3

- Added detailed diagnostic logging for ENCI TLS certificate verification failures.
- Logs OpenSSL verification code and message without exposing credentials or search data.
- Kept certificate and hostname verification enabled.

## 0.7.2

- Fixed Home Assistant blocking-call warning caused by loading the ENCI CA bundle inside the event loop.
- SSL context creation now runs safely in Home Assistant's executor.
- HTTPS certificate and hostname verification remain enabled.
- Retained the dedicated `certifi` CA bundle for ENCI requests.

## 0.7.1

### Correzioni

- Corretta la verifica del certificato HTTPS durante le richieste al servizio ENCI.
- Aggiunto un contesto SSL dedicato basato sul bundle CA di `certifi`.
- La verifica SSL e il controllo del nome host restano attivi.
- Migliorato il messaggio di errore in caso di certificato ENCI non verificabile.
- Rimossi dal repository i file Python compilati e le cartelle `__pycache__`.
- Aggiunto `.gitignore` per evitare nuovi file generati nei commit futuri.

## 0.7.0

- Added ENCI search by ROI/LOI/RSR, registered name and microchip.
- Added one-click import and update from the PawBook panel.
- Added automatic import of profile, pedigree and available ENCI datasets.
- ENCI data remains stored locally in Home Assistant.
- Existing vaccination, visit, treatment and heat-cycle editing remains unchanged.

## 0.6.3

- Rinominato il Web Component del pannello per impedire il riuso della vecchia interfaccia in cache.
- Rinominato il file JavaScript frontend con una versione univoca.
- Resi visibili i pulsanti **Modifica** ed **Elimina** per peso, vaccini, visite, terapie e calori.
- Conservata la migrazione automatica degli ID dei record esistenti.



## 0.6.2

- Aggiunta migrazione automatica dei record creati con le prime versioni.
- I record privi di identificatore ricevono automaticamente un ID al riavvio.
- Ripristinata la modifica e l'eliminazione di vecchi pesi, vaccini, visite,
  terapie e cicli di calore.
- Forzato nuovamente l'aggiornamento del pannello frontend.
- Nessun dato sanitario esistente viene eliminato o riscritto.



## 0.6.1

- Aggiunti pulsanti visibili **Modifica** ed **Elimina** su ogni registrazione.
- Eliminazione disponibile direttamente dalla scheda con conferma.
- Forzato l'aggiornamento del frontend tramite cache busting.
- Migliorata la disposizione dei comandi su desktop e dispositivi mobili.



## 0.6.0

- Rimosso il campo JSON dalla gestione genealogica.
- Aggiunto editor genealogico visuale e guidato.
- Inserimento separato di animale, genitori e quattro nonni.
- Campi per nome, ROI/RSR, microchip, titoli e informazioni sanitarie.
- Modifica dell'albero con dati già compilati.
- Eliminazione completa dell'albero con conferma.
- L'integrazione continua a salvare internamente la genealogia in formato strutturato.



## 0.5.0

- Aggiunta modifica dei record direttamente dal pannello.
- Aggiunta eliminazione con conferma.
- Supporto a peso, vaccini, visite, terapie e cicli di calore.
- Nuova azione `pawbook.update_record`.
- Le righe modificabili mostrano i comandi modifica/elimina.
- I moduli di modifica vengono aperti con i valori già compilati.



## 0.4.1

- Corretto l'errore `'bool' object has no attribute 'data'` durante
  l'inserimento di peso, vaccini, visite, terapie, calori e genealogia
  dal pannello.
- Il resolver dei servizi ora ignora correttamente i metadati interni
  del pannello e considera soltanto i coordinatori PawBook.



## 0.4.0

- Aggiunto pannello PawBook nel menu laterale di Home Assistant.
- Interfaccia dedicata e responsive.
- Gestione di più animali dal pannello.
- Inserimento diretto di peso, vaccini, visite, terapie e calori.
- Scheda ENCI con collegamento ufficiale.
- Visualizzazione grafica ricorsiva dell'albero genealogico.
- Importazione/modifica della genealogia dal pannello.
- Nuova WebSocket API locale `pawbook/get_books`.
- Nessuna risorsa Lovelace o configurazione YAML richiesta.



## 0.3.0

- Aggiunto archivio genealogico persistente.
- Nuova azione `pawbook.import_genealogy`.
- Nuova azione `pawbook.clear_genealogy`.
- Nuovo sensore `Genealogia`.
- Supporto ad albero genealogico ricorsivo con padre e madre.
- Supporto a ROI, microchip, titoli e informazioni sanitarie per ogni antenato.
- Aggiunto `genealogy-example.json`.
- Nessuna credenziale ENCI richiesta o memorizzata.


## 0.2.0

- Aggiunto il pulsante **Configura** nelle opzioni dell'integrazione.
- Modifica di razza, colore, microchip, veterinario e foto.
- Gestione ENCI ampliata: nome registrato, ROI/RSR, pedigree, allevatore,
  padre, madre e collegamento ufficiale.
- Aggiunto il collegamento all'accesso ENCI negli attributi dello stato sanitario.
- PawBook non memorizza credenziali ENCI e non effettua scraping.

## 0.1.0

- Prima versione pubblica.

## 0.8.0

- Reworked ENCI detail import with ID, ROI and microchip fallbacks.
- Added compatible GET/POST request variants for ENCI detail endpoints.
- Added endpoint-level diagnostics instead of silently discarding errors.
- Expanded anagraphic and pedigree normalization.
- Preserved raw ENCI detail responses for future parsing improvements.

## 1.1.1

- Ripristinato l'indicatore verde accanto allo stato **Vivo**.
- Compattata la quarta generazione dell'albero genealogico.
- Ridotti soltanto i caratteri dei trisnonni per mantenere leggibili nomi e dati.
- Aggiunta l'indicazione Padre/Madre su tutte le schede degli antenati.
- Tutte le schede dell'albero sono ora cliccabili.
- Aggiunto popup con nome, ROI/RSR, data di nascita, microchip, ID ENCI, titoli e dati sanitari.
- Conservato il formato italiano delle date `GG/MM/AAAA`.

## v1.2.1

- Replaced the broken header brand image with an inline PawBook paw SVG.
- Removed the frontend dependency on Home Assistant's integration brand-image endpoint for the PawBook header.
- Added a new versioned frontend asset (`pawbook-panel-v121.js`) to bypass stale browser/Home Assistant cache.
- Preserved all v1.2.0 ENCI pedigree-health features and existing PawBook data.


## v1.2.2

- Redesigned the PawBook overview dashboard.
- Enlarged the dog profile card and photo.
- Added three prominent health summary tiles.
- Added section navigation for overview, health, vaccines, visits, genealogy, ENCI and settings.
- Added a new versioned frontend asset (`pawbook-panel-v122.js`) to prevent stale cache.

## v2.0.2

- Added a smartphone-only drill-down genealogy view.
- Desktop pedigree remains unchanged.
- Mobile genealogy now navigates one ancestor at a time through Father and Mother cards.
- Added breadcrumb navigation and back-to-root controls on mobile.
- Added health badges and direct ENCI detail access to the mobile ancestor view.
- Removed the horizontally compressed desktop pedigree from smartphone layouts.
- Updated the frontend asset to v202 to avoid stale Home Assistant/browser cache.

## 4.0.0

- Introduced the first PawBook 4.0 dashboard redesign.
- Added a new Home health overview with direct access to Smart Health, vaccines, visits and genealogy.
- Rebuilt the Vaccinations section as a complete vaccine dashboard.
- Vaccinations are now grouped by vaccine name instead of being truncated to the latest five records.
- Added full expandable vaccination history for every vaccine group.
- Added status indicators for vaccines that are in order, near expiry or expired.
- Added vaccination summary counters.
- Preserved all existing PawBook data, ENCI integration, genealogy, attachments, calendar and Smart Health features.
