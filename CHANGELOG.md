# Changelog

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
