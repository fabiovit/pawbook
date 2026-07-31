# Changelog


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
