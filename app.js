// ============================================================
// LEAD ANALYZER — app.js
// Google Places API (Nearby Search + Place Details)
// + Anthropic AI per analisi siti
// ============================================================

const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';

// Coordinate default: Cascina Valdarenne, Vanzago
let currentLat = 45.5248;
let currentLng = 8.9989;
let aziende = [];
let selectedId = null;
let sortKey = 'dist';
let sortDir = 1;

// ── INIT ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  updateRaggioLabel();

  // Ripristina API key dalla sessionStorage (non localStorage — più sicuro)
  const savedKey = sessionStorage.getItem('gmaps_key');
  if (savedKey) document.getElementById('apiKey').value = savedKey;

  const savedAnthropicKey = sessionStorage.getItem('anthropic_key');
  if (savedAnthropicKey) {
    // La chiave Anthropic viene inserita al momento dell'analisi
  }
});

// ── UTILITÀ UI ────────────────────────────────────────────
function updateRaggioLabel() {
  const v = document.getElementById('raggio').value;
  document.getElementById('raggioLabel').textContent = v >= 1000 ? `${v / 1000} km` : `${v} m`;
}

function toggleKeyVisibility() {
  const inp = document.getElementById('apiKey');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

function setStatus(msg, show = true, pct = '') {
  const bar = document.getElementById('statusBar');
  bar.style.display = show ? 'flex' : 'none';
  document.getElementById('statusMsg').textContent = msg;
  document.getElementById('statusPct').textContent = pct;
}

function apiKey() {
  const k = document.getElementById('apiKey').value.trim();
  if (k) sessionStorage.setItem('gmaps_key', k);
  return k;
}

function scoreClass(s) {
  return s >= 70 ? 'tag-ok' : s >= 40 ? 'tag-med' : 'tag-no';
}

function ratingColor(r) {
  if (!r) return 'var(--text-3)';
  if (r >= 4.5) return 'var(--green)';
  if (r >= 3.5) return 'var(--yellow)';
  return 'var(--red)';
}

// ── GEOCODING ─────────────────────────────────────────────
async function geocodeStart() {
  const address = document.getElementById('startAddress').value.trim();
  const key = apiKey();
  if (!key) { alert('Inserisci prima la chiave API Google.'); return; }
  if (!address) return;

  document.getElementById('geocodeStatus').textContent = '⏳ localizzazione...';

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status === 'OK') {
      const loc = data.results[0].geometry.location;
      currentLat = loc.lat;
      currentLng = loc.lng;
      const formatted = data.results[0].formatted_address;
      document.getElementById('geocodeStatus').textContent = `✓ ${formatted}`;
    } else {
      document.getElementById('geocodeStatus').textContent = `✗ ${data.status}`;
    }
  } catch (e) {
    document.getElementById('geocodeStatus').textContent = '✗ Errore di rete';
  }
}

// ── CALCOLO DISTANZA (Haversine) ──────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return +(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1);
}

// ── CERCA AZIENDE (Places Nearby Search + Details) ────────
async function cercaAziende() {
  const key = apiKey();
  if (!key) { alert('Inserisci la chiave API Google nella sidebar.'); return; }

  const categoria = document.getElementById('categoria').value.trim() || 'establishment';
  const raggio = document.getElementById('raggio').value;
  const maxResults = parseInt(document.getElementById('maxResults').value);

  document.getElementById('btnCerca').disabled = true;
  document.getElementById('btnAnalizza').disabled = true;
  document.getElementById('detailPanel').style.display = 'none';
  aziende = [];
  selectedId = null;
  renderTable();
  setStatus(`Ricerca "${categoria}" entro ${raggio / 1000} km...`);

  try {
    const allPlaces = await nearbySearch(key, currentLat, currentLng, raggio, categoria, maxResults);

    setStatus(`Trovate ${allPlaces.length} attività — recupero dettagli...`);

    // Recupera dettagli per ogni place (sito, telefono, opening_hours)
    const details = [];
    for (let i = 0; i < allPlaces.length; i++) {
      const p = allPlaces[i];
      setStatus(`Dettagli ${i + 1}/${allPlaces.length} — ${p.name}`, true, `${Math.round(i / allPlaces.length * 100)}%`);
      try {
        const d = await getPlaceDetails(key, p.place_id);
        const dist = haversine(currentLat, currentLng, p.geometry.location.lat, p.geometry.location.lng);
        details.push({
          id: i,
          place_id: p.place_id,
          name: p.name,
          tipo: (p.types || []).filter(t => !['point_of_interest', 'establishment'].includes(t)).join(', ') || '—',
          indirizzo: d.formatted_address || p.vicinity || '—',
          telefono: d.formatted_phone_number || '',
          sito: d.website || '',
          rating: p.rating || null,
          n_recensioni: p.user_ratings_total || 0,
          aperto: p.opening_hours?.open_now ?? null,
          lat: p.geometry.location.lat,
          lng: p.geometry.location.lng,
          dist,
          score: null,
          analisi: null,
        });
      } catch (e) {
        // Skip place details error, add basic info
        const dist = haversine(currentLat, currentLng, p.geometry.location.lat, p.geometry.location.lng);
        details.push({
          id: i, place_id: p.place_id, name: p.name,
          tipo: (p.types || []).filter(t => !['point_of_interest', 'establishment'].includes(t)).join(', ') || '—',
          indirizzo: p.vicinity || '—', telefono: '', sito: '',
          rating: p.rating || null, n_recensioni: p.user_ratings_total || 0,
          aperto: null, lat: p.geometry.location.lat, lng: p.geometry.location.lng,
          dist, score: null, analisi: null,
        });
      }
    }

    aziende = details;
    renderTable();
    updateMetrics();
    setStatus('', false);
    document.getElementById('btnCerca').disabled = false;
    if (aziende.length > 0) document.getElementById('btnAnalizza').disabled = false;

  } catch (err) {
    setStatus('', false);
    document.getElementById('btnCerca').disabled = false;
    alert(`Errore: ${err.message}\n\nVerifica che la chiave API sia valida e che Places API sia abilitata su Google Cloud Console.`);
  }
}

// ── PLACES NEARBY SEARCH ──────────────────────────────────
async function nearbySearch(key, lat, lng, radius, keyword, maxResults) {
  let places = [];
  let pageToken = null;

  do {
    let url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&keyword=${encodeURIComponent(keyword)}&language=it&key=${key}`;
    if (pageToken) url += `&pagetoken=${pageToken}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.status === 'REQUEST_DENIED') throw new Error(data.error_message || 'Chiave API non valida o Places API non abilitata');
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') throw new Error(`Google API: ${data.status}`);

    places = places.concat(data.results || []);
    pageToken = data.next_page_token || null;

    if (places.length >= maxResults) break;
    if (pageToken) await new Promise(r => setTimeout(r, 2000)); // Google richiede delay tra pagine

  } while (pageToken && places.length < maxResults);

  return places.slice(0, maxResults);
}

// ── PLACE DETAILS ─────────────────────────────────────────
async function getPlaceDetails(key, placeId) {
  const fields = 'formatted_address,formatted_phone_number,website,opening_hours';
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&language=it&key=${key}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK') return {};
  return data.result || {};
}

// ── SORT ──────────────────────────────────────────────────
function sort(key) {
  if (sortKey === key) sortDir *= -1;
  else { sortKey = key; sortDir = 1; }
  document.querySelectorAll('.sa').forEach(el => el.textContent = '');
  const el = document.getElementById('sa-' + key);
  if (el) el.textContent = sortDir === 1 ? '▲' : '▼';
  renderTable();
}

// ── FILTRO ────────────────────────────────────────────────
function filtered() {
  const q = document.getElementById('fSearch').value.toLowerCase();
  const fSito = document.getElementById('fSito').value;
  return aziende.filter(a => {
    if (q && !`${a.name} ${a.tipo} ${a.indirizzo}`.toLowerCase().includes(q)) return false;
    if (fSito === 'si' && !a.sito) return false;
    if (fSito === 'no' && a.sito) return false;
    return true;
  });
}

// ── RENDER TABLE ──────────────────────────────────────────
function renderTable() {
  const tbody = document.getElementById('tableBody');
  const data = filtered().sort((a, b) => {
    let va = a[sortKey] ?? (sortKey === 'rating' ? -1 : sortKey === 'score' ? -1 : '');
    let vb = b[sortKey] ?? (sortKey === 'rating' ? -1 : sortKey === 'score' ? -1 : '');
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    return va < vb ? -sortDir : va > vb ? sortDir : 0;
  });

  if (!data.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="9"><div class="empty-state">
      <div class="empty-icon">◈</div>
      <p>${aziende.length ? 'Nessun risultato per i filtri selezionati.' : 'Configura la chiave API e clicca <strong>Cerca aziende</strong>'}</p>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(a => {
    const ratingHtml = a.rating
      ? `<span style="color:${ratingColor(a.rating)};font-family:var(--font-mono)">${a.rating.toFixed(1)} <span style="color:var(--text-3);font-size:10px">(${a.n_recensioni})</span></span>`
      : '<span style="color:var(--text-3)">—</span>';

    const siteHtml = a.sito
      ? `<a href="${a.sito}" target="_blank" onclick="event.stopPropagation()">${a.sito.replace(/^https?:\/\//, '').replace(/\/$/, '').substring(0, 30)}</a>`
      : '<span style="color:var(--text-3)">nessun sito</span>';

    const an = a.analisi;
    let segnali = '';
    if (an) {
      if (an.design_moderno === true)  segnali += '<span class="tag tag-ok">design✓</span>';
      else if (an.design_moderno === false) segnali += '<span class="tag tag-no">vecchio</span>';
      if (an.cookie_banner === false)  segnali += '<span class="tag tag-no">no cookie</span>';
      if (an.social_links === true)    segnali += '<span class="tag tag-ok">social</span>';
      if (an.seo_score != null)        segnali += `<span class="tag ${an.seo_score >= 7 ? 'tag-ok' : an.seo_score >= 4 ? 'tag-med' : 'tag-no'}">SEO${an.seo_score}</span>`;
      if (an.velocita === 'lenta')     segnali += '<span class="tag tag-no">lenta</span>';
    } else if (!a.sito) {
      segnali = '<span class="tag tag-na">no sito</span>';
    }

    const scoreHtml = a.score !== null
      ? `<span class="score-pill ${scoreClass(a.score)}">${a.score}</span>`
      : '<span style="color:var(--text-3)">—</span>';

    const isSelected = selectedId === a.id ? 'selected' : '';

    return `<tr class="${isSelected}" onclick="showDetail(${a.id})">
      <td class="cell-name" title="${a.name}">${a.name}</td>
      <td title="${a.tipo}" style="color:var(--text-2)">${a.tipo.split(',')[0] || '—'}</td>
      <td>${ratingHtml}</td>
      <td style="text-align:right;color:var(--text-2);font-family:var(--font-mono)">${a.dist}</td>
      <td title="${a.indirizzo}" style="color:var(--text-2)">${a.indirizzo}</td>
      <td style="color:var(--text-2);font-family:var(--font-mono)">${a.telefono || '—'}</td>
      <td class="cell-url">${siteHtml}</td>
      <td>${segnali}</td>
      <td style="text-align:center">${scoreHtml}</td>
    </tr>`;
  }).join('');
}

// ── METRICS ───────────────────────────────────────────────
function updateMetrics() {
  document.getElementById('mTot').textContent = aziende.length;
  document.getElementById('mSito').textContent = aziende.filter(a => a.sito).length;
  const ratings = aziende.filter(a => a.rating).map(a => a.rating);
  document.getElementById('mRating').textContent = ratings.length
    ? (ratings.reduce((s, v) => s + v, 0) / ratings.length).toFixed(1)
    : '—';
  document.getElementById('mOpen').textContent = aziende.filter(a => a.aperto === true).length;
}

// ── DETAIL PANEL ──────────────────────────────────────────
function showDetail(id) {
  selectedId = id;
  const a = aziende.find(x => x.id === id);
  if (!a) return;

  document.getElementById('dNome').textContent = a.name;
  document.getElementById('dTipo').textContent = a.tipo;

  // Grid info
  const sc = a.score ?? 0;
  document.getElementById('dGrid').innerHTML = `
    <div class="detail-item"><div class="dk">Distanza</div><div class="dv">${a.dist} km</div></div>
    <div class="detail-item"><div class="dk">Rating Google</div><div class="dv" style="color:${ratingColor(a.rating)}">${a.rating ? `${a.rating} ★ (${a.n_recensioni} rec.)` : '—'}</div></div>
    <div class="detail-item"><div class="dk">Stato</div><div class="dv">${a.aperto === true ? '🟢 Aperto ora' : a.aperto === false ? '🔴 Chiuso ora' : '—'}</div></div>
    <div class="detail-item"><div class="dk">Telefono</div><div class="dv">${a.telefono || '—'}</div></div>
    <div class="detail-item"><div class="dk">Indirizzo</div><div class="dv">${a.indirizzo}</div></div>
    <div class="detail-item"><div class="dk">Sito web</div><div class="dv">${a.sito ? `<a href="${a.sito}" target="_blank">${a.sito.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>` : '<em style="color:var(--text-3)">non disponibile</em>'}</div></div>
    ${a.score !== null ? `
    <div class="detail-item" style="grid-column:1/-1">
      <div class="dk">Lead Score</div>
      <div class="dv" style="font-size:22px;font-weight:600;font-family:var(--font-mono)">${sc}/100</div>
      <div class="bar"><div class="bar-fill" style="width:${sc}%"></div></div>
    </div>` : ''}
  `;

  // Segnali
  const an = a.analisi;
  let signalsHtml = '';
  if (an) {
    signalsHtml += an.design_moderno === true ? '<span class="tag tag-ok">Design moderno ✓</span>' : an.design_moderno === false ? '<span class="tag tag-no">Design datato ✗</span>' : '';
    signalsHtml += an.cookie_banner === true ? '<span class="tag tag-ok">Cookie banner ✓</span>' : an.cookie_banner === false ? '<span class="tag tag-no">Nessun cookie banner ✗</span>' : '';
    signalsHtml += an.social_links === true ? '<span class="tag tag-ok">Social collegati ✓</span>' : an.social_links === false ? '<span class="tag tag-no">Nessun social ✗</span>' : '';
    signalsHtml += an.ecommerce ? '<span class="tag tag-ok">E-commerce ✓</span>' : '';
    signalsHtml += an.seo_score != null ? `<span class="tag ${an.seo_score >= 7 ? 'tag-ok' : an.seo_score >= 4 ? 'tag-med' : 'tag-no'}">SEO ${an.seo_score}/10</span>` : '';
    signalsHtml += an.velocita ? `<span class="tag ${an.velocita === 'veloce' ? 'tag-ok' : an.velocita === 'media' ? 'tag-med' : 'tag-no'}">Velocità: ${an.velocita}</span>` : '';
    signalsHtml += an.tecnologia ? `<span class="tag tag-na">${an.tecnologia}</span>` : '';
  } else if (!a.sito) {
    signalsHtml = '<span style="color:var(--text-3);font-size:12px">Nessun sito web — analisi non disponibile</span>';
  } else {
    signalsHtml = '<span style="color:var(--text-3);font-size:12px">Clicca "Analizza questo sito" per ottenere i segnali</span>';
  }
  document.getElementById('dSignals').innerHTML = signalsHtml;

  // Analisi AI
  const analysisPanel = document.getElementById('dAnalysis');
  if (an) {
    analysisPanel.style.display = 'block';
    document.getElementById('dAnalysisContent').innerHTML = `
      <div class="analysis-grid">
        <div><strong>Punti di forza:</strong><br>${an.punti_forza || '—'}</div>
        <div><strong>Punti deboli:</strong><br>${an.punti_deboli || '—'}</div>
        <div><strong>Opportunità commerciale:</strong><br>${an.opportunita_commerciale || '—'}</div>
        <div><strong>Perché questo score:</strong><br>${an.motivazione_score || '—'}</div>
      </div>`;
  } else {
    analysisPanel.style.display = 'none';
  }

  document.getElementById('detailPanel').style.display = 'block';
  renderTable();
}

function closeDetail() {
  selectedId = null;
  document.getElementById('detailPanel').style.display = 'none';
  renderTable();
}

function openMaps() {
  const a = aziende.find(x => x.id === selectedId);
  if (!a) return;
  window.open(`https://www.google.com/maps/place/?q=place_id:${a.place_id}`, '_blank');
}

// ── ANALISI AI (singola) ──────────────────────────────────
async function analizzaSingola() {
  const a = aziende.find(x => x.id === selectedId);
  if (!a) return;

  const anthropicKey = await getAnthropicKey();
  if (!anthropicKey) return;

  document.getElementById('dBtnAnalizza').disabled = true;
  setStatus(`Analisi AI: ${a.name}...`);

  try {
    a.analisi = await analizzaAzienda(a, anthropicKey);
    a.score = a.analisi.score;
    showDetail(a.id);
    renderTable();
    updateMetrics();
  } catch (e) {
    alert('Errore analisi: ' + e.message);
  }

  setStatus('', false);
  document.getElementById('dBtnAnalizza').disabled = false;
}

// ── ANALISI AI (tutte) ────────────────────────────────────
async function analizzaTutte() {
  const anthropicKey = await getAnthropicKey();
  if (!anthropicKey) return;

  document.getElementById('btnAnalizza').disabled = true;

  for (let i = 0; i < aziende.length; i++) {
    const a = aziende[i];
    setStatus(`Analisi AI ${i + 1}/${aziende.length} — ${a.name}`, true, `${Math.round(i / aziende.length * 100)}%`);
    try {
      a.analisi = await analizzaAzienda(a, anthropicKey);
      a.score = a.analisi.score;
      if (selectedId === a.id) showDetail(a.id);
      renderTable();
    } catch (e) {
      console.warn('Analisi fallita per', a.name, e);
    }
  }

  updateMetrics();
  setStatus('', false);
  document.getElementById('btnAnalizza').disabled = false;
}

// ── CHIAVE ANTHROPIC ──────────────────────────────────────
async function getAnthropicKey() {
  let key = sessionStorage.getItem('anthropic_key');
  if (!key) {
    key = prompt('Inserisci la tua Anthropic API key per l\'analisi AI:\n(viene salvata solo per questa sessione del browser)');
    if (!key) return null;
    sessionStorage.setItem('anthropic_key', key.trim());
  }
  return key.trim();
}

// ── CHIAMATA ANTHROPIC ────────────────────────────────────
async function analizzaAzienda(a, anthropicKey) {
  const hasSite = !!a.sito;

  const prompt = `Analizza questa attività italiana per un lead scoring commerciale B2B.

Nome: ${a.name}
Tipo: ${a.tipo}
Indirizzo: ${a.indirizzo}
Telefono: ${a.telefono || 'non disponibile'}
Rating Google: ${a.rating ? `${a.rating}/5 (${a.n_recensioni} recensioni)` : 'non disponibile'}
${hasSite ? `Sito web: ${a.sito}

Analizza il sito e valuta:
- design_moderno: true se design flat/responsive, false se datato (anni 2000-2010)
- cookie_banner: true se presente banner GDPR
- social_links: true se ci sono link a social media
- seo_score: 1-10 (title, meta, heading, contenuto)
- velocita: "veloce"/"media"/"lenta"
- ecommerce: true se vende online
- tecnologia: CMS/tech rilevata` : `Sito web: non disponibile
Imposta design_moderno=null, cookie_banner=null, velocita=null, seo_score=null, tecnologia="n/d"`}

Produci SOLO questo JSON (nessun testo fuori):
{
  "score": numero 0-100,
  "design_moderno": true|false|null,
  "cookie_banner": true|false|null,
  "social_links": true|false,
  "seo_score": numero 1-10 o null,
  "velocita": "veloce"|"media"|"lenta"|null,
  "ecommerce": true|false,
  "tecnologia": "stringa",
  "punti_forza": "max 2 righe",
  "punti_deboli": "max 2 righe",
  "opportunita_commerciale": "max 2 righe: cosa proporre a questa attività",
  "motivazione_score": "1 riga"
}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 800,
      system: 'Rispondi SOLO con JSON valido. Nessun markdown, nessun backtick.',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }

  const data = await res.json();
  let raw = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  raw = raw.replace(/```json|```/g, '').trim();
  const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('JSON non valido dalla risposta AI');
  return JSON.parse(raw.slice(s, e + 1));
}

// ── EXPORT CSV ────────────────────────────────────────────
function exportCSV() {
  if (!aziende.length) return;

  const headers = ['Nome', 'Tipo', 'Indirizzo', 'Telefono', 'Sito web', 'Rating', 'Recensioni', 'Km', 'Score', 'Design', 'Cookie', 'Social', 'SEO', 'Velocità', 'Ecommerce', 'Tecnologia', 'Punti forza', 'Punti deboli', 'Opportunità'];

  const rows = filtered().map(a => {
    const an = a.analisi;
    return [
      a.name, a.tipo, a.indirizzo, a.telefono, a.sito,
      a.rating || '', a.n_recensioni, a.dist, a.score || '',
      an?.design_moderno ?? '', an?.cookie_banner ?? '', an?.social_links ?? '',
      an?.seo_score ?? '', an?.velocita ?? '', an?.ecommerce ?? '', an?.tecnologia ?? '',
      an?.punti_forza ?? '', an?.punti_deboli ?? '', an?.opportunita_commerciale ?? '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`);
  });

  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `lead-analyzer-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}
