# Lead Analyzer

Tool per la ricerca e analisi di aziende sul territorio, con lead scoring AI.

## Funzionalità

- **Ricerca aziende** tramite Google Places API (Nearby Search)
- **Dati reali** da Google Business Profile: nome, indirizzo, telefono, sito, rating, orari
- **Analisi sito web** con AI (Anthropic Claude): design, cookie banner, social, SEO, velocità, tecnologia
- **Lead score** 0-100 per ogni azienda
- **Export CSV** con tutti i dati
- **Filtri e ordinamento** per qualsiasi colonna

## Setup

### 1. Google Places API Key

1. Vai su [Google Cloud Console](https://console.cloud.google.com)
2. Crea un nuovo progetto (o usa uno esistente)
3. Vai su **API & Services → Library**
4. Abilita:
   - **Places API**
   - **Geocoding API**
5. Vai su **API & Services → Credentials**
6. Crea una **API Key**
7. (Consigliato) Limita la chiave a: Places API + Geocoding API + il tuo dominio GitHub Pages

> **Costi**: Google offre $200/mese di crediti gratuiti (~5.000 ricerche Nearby + dettagli).

### 2. Anthropic API Key (opzionale, per analisi AI)

1. Vai su [console.anthropic.com](https://console.anthropic.com)
2. Crea una API Key
3. La chiave viene richiesta al primo click su "Analizza con AI" e salvata solo in sessionStorage

### 3. Deploy su GitHub Pages

1. Crea un repository su GitHub (es. `lead-analyzer`)
2. Carica i file: `index.html`, `style.css`, `app.js`, `README.md`
3. Vai su **Settings → Pages**
4. Source: **Deploy from a branch → main → / (root)**
5. Il sito sarà disponibile su `https://tuousername.github.io/lead-analyzer`

### 4. Uso locale (senza deploy)

Apri semplicemente `index.html` nel browser. Nota: alcune API potrebbero richiedere HTTPS — in quel caso usa GitHub Pages.

## Come si usa

1. Inserisci la **Google Places API Key** nella sidebar
2. Inserisci l'**indirizzo di partenza** e clicca 📍 per geocodificarlo
3. Scegli **categoria** (es: ristoranti, officine, studi legali) e **raggio**
4. Clicca **🔍 Cerca aziende** — recupera automaticamente i dettagli da Google Business Profile
5. Clicca su una riga per vedere il dettaglio
6. Clicca **🤖 Analizza con AI** per il lead scoring completo (richiede chiave Anthropic)
7. Esporta con **⬇ CSV**

## Struttura file

```
lead-analyzer/
├── index.html    # Struttura HTML
├── style.css     # Stile (dark theme)
├── app.js        # Logica: Places API + Anthropic AI
└── README.md     # Questo file
```

## Note sulla privacy

- Le chiavi API vengono salvate solo in `sessionStorage` (si cancellano alla chiusura del browser)
- Nessun dato viene inviato a server terzi oltre a Google Maps API e Anthropic API
- Il tool funziona interamente nel browser

## Limiti noti

- Google Places Nearby Search restituisce max 60 risultati per query (3 pagine da 20)
- L'analisi AI funziona meglio per siti con contenuti indicizzati da Claude
- Per siti molto nuovi o poco conosciuti, l'analisi sarà basata solo sui dati anagrafici
