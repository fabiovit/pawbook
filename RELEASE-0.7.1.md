# PawBook v0.7.1 – ENCI SSL Fix

Questa versione corregge l'errore di verifica del certificato HTTPS durante il collegamento al servizio ENCI.

## Modifiche

- Utilizzato un bundle CA aggiornato tramite `certifi`.
- Verifica SSL e controllo del nome host mantenuti attivi.
- Nessun utilizzo di `ssl=False`.
- Messaggio di errore più chiaro quando il certificato ENCI non può essere verificato.
- Rimossi file `.pyc` e cartelle `__pycache__`.
- Aggiunto `.gitignore`.

Dopo l'aggiornamento, riavviare completamente Home Assistant prima di provare nuovamente la ricerca ENCI.
