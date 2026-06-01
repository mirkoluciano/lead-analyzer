// ============================================================
// LEAD ANALYZER — app.js
// Usa Google Maps JavaScript API (PlacesService) — no CORS
// + Anthropic Claude per analisi siti
// ============================================================

const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';

let currentLat = 45.5248;
let currentLng = 8.9989;
let aziende = [];
let selectedId = null;
let sortKey = 'dist';
let sortDir = 1;
let geocoder = null;
let placesService = null;
let mapsLoaded = false;

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  updateRaggioLabel();
  const saved = sessionStorage.getItem('gmaps_key');
  if (saved) document.getElementById('apiKey').value = saved;
});

// ── UI HELPERS ───────────────────────────────────────────────
function updateRaggioLabel() {
  const v = +document.getElementById('raggio').value;
  document.getElementById('raggioLabel').textContent = v >= 1000 ? `${v / 1000} km` : `${v} m`;
}

function toggleKeyVisibility() {
  const inp = document.getElementById('apiKey');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

function setStatus(msg, show = true, pct = '') {
  document.getElementById('statusBar').style.display = show ? 'flex' : 'none';
  document.getElementById('statusMsg').textContent = msg;
  document.getElementById('statusPct').textContent = pct;
}

function apiKey() {
  const k = document.getElementById('apiKey').value.trim();
  if (k) sessionStorage.setItem('gmaps_key', k);
  return k;
}

// ── CARICA GOOGLE MAPS SDK ───────────────────────────────────
function loadGoogleMaps() {
  const key = apiKey();
  if (!key) { alert('Inserisci prima la chiave API Google.'); return; }
  if (mapsLoaded) { setMapsReady(); return; }

  document.getElementById('mapsStatus').textContent = '⏳ caricamento SDK...';

  // Rimuovi script precedente se esiste
  const old = document.getElementById('gmaps-script');
  if (old) old.remove();

  window.initMapsCallback = function () {
    mapsLoaded = true;
    // PlacesService richiede un elemento map o un div
    const mapDiv = document.createElement('div');
    mapDiv.style.display = 'none';
    document.body.appendChild(mapDiv);
    const map = new google.maps.Map(mapDiv, { center: { lat: currentLat, lng: currentLng }, zoom: 12 });
    placesService = new google.maps.places.PlacesService(map);
    geocoder = new google.maps.Geocoder();
    setMapsReady();
  };

  const script = document.createElement('script');
  script.id = 'gmaps-script';
  script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&callback=initMapsCallback&language=it`;
  script.async = true;
  script.onerror = () => {
    document.getElementById('mapsStatus').textContent = '✗ Chiave non valida o API non abilitate';
  };
  document.head.appendChild(script);
}

function setMapsReady() {
  document.getElementById('mapsStatus').textContent = '✓ Maps SDK pronto';
  document.getElementById('btnGeocode').disabled = false;
  document.getElementById('btnCerca').disabled = false;
}

// ── GEOCODING ────────────────────────────────────────────────
function geocodeStart() {
  if (!geocoder) { alert('Carica prima il Maps SDK.'); return; }
  const address = document.getElementById('startAddress').value.trim();
  document.getElementById('geocodeStatus').textContent = '⏳ localizzazione...';

  geocoder.geocode({ address }, (results, status) => {
    if (status === 'OK') {
      currentLat = results[0].geometry.location.lat();
      currentLng = results[0].geometry.location.lng();
      document.getElementById('geocodeStatus').textContent = `✓ ${results[0].formatted_address}`;
    } else {
      document.getElementById('geocodeStatus').textContent = `✗ ${status}`;
    }
  });
}

// ── DISTANZA (Haversine) ─────────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return +(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1);
}

// ── CERCA AZIENDE ────────────────────────────────────────────
function cercaAziende() {
  if (!placesService) { alert('Carica prima il Maps SDK.'); return; }

  const keyword = document.getElementById('categoria').value.trim() || 'aziende';
  const radius = +document.getElementById('raggio').value;
  const maxResults = +document.getElementById('maxResults').value;

  document.getElementById('btnCerca').disabled = true;
  document.getElementById('btnAnalizza').disabled = true;
  document.getElementById('detailPanel').style.display = 'none';
  aziende = [];
  selectedId = null;
  renderTable();
  setStatus(`Ricerca "${keyword}" entro ${radius / 1000} km...`);

  const request = {
    location: new google.maps.LatLng(currentLat, currentLng),
    radius,
    keyword,
    language: 'it',
  };

  let allResults = [];

  function handlePage(results, status, pagination) {
    if (status === google.maps.places.PlacesServiceStatus.OK) {
      allResults = allResults.concat(results);
      setStatus(`Trovati ${allResults.length} risultati...`);
      if (pagination && pagination.hasNextPage && allResults.length < maxResults) {
        setTimeout(() => pagination.nextPage(), 2000);
      } else {
        fetchDetails(allResults.slice(0, maxResults));
      }
    } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
      setStatus('', false);
      document.getElementById('btnCerca').disabled = false;
      renderTable();
    } else {
      setStatus('', false);
      document.getElementById('btnCerca').disabled = false;
      alert(`Errore Places: ${status}`);
    }
  }

  placesService.nearbySearch(request, handlePage);
}

// ── FETCH DETAILS per ogni place ─────────────────────────────
async function fetchDetails(places) {
  const fields = ['name', 'formatted_address', 'formatted_phone_number', 'website',
    'rating', 'user_ratings_total', 'opening_hours', 'geometry', 'types', 'place_id'];

  for (let i = 0; i < places.length; i++) {
    const p = places[i];
    setStatus(`Dettagli ${i + 1}/${places.length} — ${p.name}`, true, `${Math.round(i / places.length * 100)}%`);

    await new Promise(resolve => {
      placesService.getDetails({ placeId: p.place_id, fields, language: 'it' }, (detail, status) => {
        const d = (status === 'OK' && detail) ? detail : p;
        const lat = (d.geometry?.location?.lat?.() || p.geometry?.location?.lat?.()) ?? currentLat;
        const lng = (d.geometry?.location?.lng?.() || p.geometry?.location?.lng?.()) ?? currentLng;
        const dist = haversine(currentLat, currentLng, lat, lng);
        const types = (d.types || []).filter(t => !['point_of_interest', 'establishment'].includes(t));

        aziende.push({
          id: aziende.length,
          place_id: p.place_id,
          name: d.name || p.name,
          tipo: types.join(', ') || '—',
          indirizzo: d.formatted_address || p.vicinity || '—',
          telefono: d.formatted_phone_number || '',
          sito: d.website || '',
          rating: d.rating || null,
          n_recensioni: d.user_ratings_total || 0,
          aperto: d.opening_hours?.isOpen?.() ?? null,
          lat, lng, dist,
          score: null, analisi: null,
        });

        renderTable();
        updateMetrics();
        resolve();
      });
    });

    // Piccolo delay per non superare rate limit
    await new Promise(r => setTimeout(r, 100));
  }

  setStatus('', false);
  document.getElementById('btnCerca').disabled = false;
  if (aziende.length > 0) document.getElementById('btnAnalizza').disabled = false;
}

// ── SORT ─────────────────────────────────────────────────────
function sort(key) {
  if (sortKey === key) sortDir *= -1;
  else { sortKey = key; sortDir = 1; }
  document.querySelectorAll('.sa').forEach(el => el.textContent = '');
  const el = document.getElementById('sa-' + key);
  if (el) el.textContent = sortDir === 1 ? '▲' : '▼';
  renderTable();
}

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

// ── RENDER TABLE ─────────────────────────────────────────────
function scoreClass(s) { return s >= 70 ? 'tag-ok' : s >= 40 ? 'tag-med' : 'tag-no'; }
function ratingColor(r) {
  if (!r) return 'var(--text-3)';
  return r >= 4.5 ? 'var(--green)' : r >= 3.5 ? 'var(--yellow)' : 'var(--red)';
}

function renderTable() {
  const tbody = document.getElementById('tableBody');
  const data = filtered().sort((a, b) => {
    let va = a[sortKey] ?? (typeof a[sortKey] === 'number' ? -Infinity : '');
    let vb = b[sortKey] ?? (typeof b[sortKey] === 'number' ? -Infinity : '');
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    return va < vb ? -sortDir : va > vb ? sortDir : 0;
  });

  if (!data.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="9"><div class="empty-state">
      <div class="empty-icon">◈</div>
      <p>${aziende.length ? 'Nessun risultato per i filtri.' : 'Carica il SDK, localizza e cerca.'}</p>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(a => {
    const ratingHtml = a.rating
      ? `<span style="color:${ratingColor(a.rating)};font-family:var(--font-mono)">${a.rating.toFixed(1)} <span style="color:var(--text-3);font-size:10px">(${a.n_recensioni})</span></span>`
      : '<span style="color:var(--text-3)">—</span>';

    const siteHtml = a.sito
      ? `<a href="${a.sito}" target="_blank" onclick="event.stopPropagation()">${a.sito.replace(/^https?:\/\//, '').replace(/\/$/, '').substring(0, 28)}</a>`
      : '<span style="color:var(--text-3)">nessun sito</span>';

    const an = a.analisi;
    let segnali = '';
    if (an) {
      if (an.design_moderno === true) segnali += '<span class="tag tag-ok">design✓</span>';
      else if (an.design_moderno === false) segnali += '<span class="tag tag-no">vecchio</span>';
      if (an.cookie_banner === false) segnali += '<span class="tag tag-no">no cookie</span>';
      if (an.social_links === true) segnali += '<span class="tag tag-ok">social</span>';
      if (an.seo_score != null) segnali += `<span class="tag ${an.seo_score >= 7 ? 'tag-ok' : an.seo_score >= 4 ? 'tag-med' : 'tag-no'}">SEO${an.seo_score}</span>`;
      if (an.velocita === 'lenta') segnali += '<span class="tag tag-no">lenta</span>';
    } else if (!a.sito) {
      segnali = '<span class="tag tag-na">no sito</span>';
    }

    const scoreHtml = a.score !== null
      ? `<span class="score-pill ${scoreClass(a.score)}">${a.score}</span>`
      : '<span style="color:var(--text-3)">—</span>';

    return `<tr class="${selectedId === a.id ? 'selected' : ''}" onclick="showDetail(${a.id})">
      <td class="cell-name" title="${a.name}">${a.name}</td>
      <td style="color:var(--text-2)" title="${a.tipo}">${a.tipo.split(',')[0] || '—'}</td>
      <td>${ratingHtml}</td>
      <td style="text-align:right;color:var(--text-2);font-family:var(--font-mono)">${a.dist}</td>
      <td style="color:var(--text-2)" title="${a.indirizzo}">${a.indirizzo}</td>
      <td style="color:var(--text-2);font-family:var(--font-mono)">${a.telefono || '—'}</td>
      <td class="cell-url">${siteHtml}</td>
      <td>${segnali}</td>
      <td style="text-align:center">${scoreHtml}</td>
    </tr>`;
  }).join('');
}

function updateMetrics() {
  document.getElementById('mTot').textContent = aziende.length;
  document.getElementById('mSito').textContent = aziende.filter(a => a.sito).length;
  const ratings = aziende.filter(a => a.rating).map(a => a.rating);
  document.getElementById('mRating').textContent = ratings.length
    ? (ratings.reduce((s, v) => s + v, 0) / ratings.length).toFixed(1) : '—';
  document.getElementById('mOpen').textContent = aziende.filter(a => a.aperto === true).length;
}

// ── DETAIL ───────────────────────────────────────────────────
function showDetail(id) {
  selectedId = id;
  const a = aziende.find(x => x.id === id);
  if (!a) return;

  document.getElementById('dNome').textContent = a.name;
  document.getElementById('dTipo').textContent = a.tipo;

  const sc = a.score ?? 0;
  document.getElementById('dGrid').innerHTML = `
    <div class="detail-item"><div class="dk">Distanza</div><div class="dv">${a.dist} km</div></div>
    <div class="detail-item"><div class="dk">Rating Google</div><div class="dv" style="color:${ratingColor(a.rating)}">${a.rating ? `${a.rating} ★ (${a.n_recensioni})` : '—'}</div></div>
    <div class="detail-item"><div class="dk">Stato</div><div class="dv">${a.aperto === true ? '🟢 Aperto' : a.aperto === false ? '🔴 Chiuso' : '—'}</div></div>
    <div class="detail-item"><div class="dk">Telefono</div><div class="dv">${a.telefono || '—'}</div></div>
    <div class="detail-item"><div class="dk">Indirizzo</div><div class="dv">${a.indirizzo}</div></div>
    <div class="detail-item"><div class="dk">Sito web</div><div class="dv">${a.sito
      ? `<a href="${a.sito}" target="_blank">${a.sito.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>`
      : '<em style="color:var(--text-3)">non disponibile</em>'}</div></div>
    ${a.score !== null ? `<div class="detail-item" style="grid-column:1/-1">
      <div class="dk">Lead Score</div>
      <div class="dv" style="font-size:22px;font-weight:600;font-family:var(--font-mono)">${sc}/100</div>
      <div class="bar"><div class="bar-fill" style="width:${sc}%"></div></div>
    </div>` : ''}
  `;

  const an = a.analisi;
  let sig = '';
  if (an) {
    sig += an.design_moderno === true ? '<span class="tag tag-ok">Design moderno ✓</span>' : an.design_moderno === false ? '<span class="tag tag-no">Design datato ✗</span>' : '';
    sig += an.cookie_banner === true ? '<span class="tag tag-ok">Cookie banner ✓</span>' : an.cookie_banner === false ? '<span class="tag tag-no">No cookie banner ✗</span>' : '';
    sig += an.social_links === true ? '<span class="tag tag-ok">Social collegati ✓</span>' : an.social_links === false ? '<span class="tag tag-no">Nessun social ✗</span>' : '';
    sig += an.ecommerce ? '<span class="tag tag-ok">E-commerce ✓</span>' : '';
    sig += an.seo_score != null ? `<span class="tag ${an.seo_score >= 7 ? 'tag-ok' : an.seo_score >= 4 ? 'tag-med' : 'tag-no'}">SEO ${an.seo_score}/10</span>` : '';
    sig += an.velocita ? `<span class="tag ${an.velocita === 'veloce' ? 'tag-ok' : an.velocita === 'media' ? 'tag-med' : 'tag-no'}">Velocità: ${an.velocita}</span>` : '';
    sig += an.tecnologia ? `<span class="tag tag-na">${an.tecnologia}</span>` : '';
  } else {
    sig = `<span style="color:var(--text-3);font-size:12px">${a.sito ? 'Clicca "Analizza questo sito" per ottenere i segnali' : 'Nessun sito web — analisi non disponibile'}</span>`;
  }
  document.getElementById('dSignals').innerHTML = sig;

  const analysisEl = document.getElementById('dAnalysis');
  if (an) {
    analysisEl.style.display = 'block';
    document.getElementById('dAnalysisContent').innerHTML = `
      <div class="analysis-grid">
        <div><strong>Punti di forza:</strong><br>${an.punti_forza || '—'}</div>
        <div><strong>Punti deboli:</strong><br>${an.punti_deboli || '—'}</div>
        <div><strong>Opportunità commerciale:</strong><br>${an.opportunita_commerciale || '—'}</div>
        <div><strong>Perché questo score:</strong><br>${an.motivazione_score || '—'}</div>
      </div>`;
  } else {
    analysisEl.style.display = 'none';
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
  if (a) window.open(`https://www.google.com/maps/place/?q=place_id:${a.place_id}`, '_blank');
}

// ── ANALISI AI ───────────────────────────────────────────────
async function getAnthropicKey() {
  let key = sessionStorage.getItem('anthropic_key');
  if (!key) {
    key = prompt('Inserisci la tua Anthropic API key:\n(salvata solo in sessionStorage per questa sessione)');
    if (!key) return null;
    sessionStorage.setItem('anthropic_key', key.trim());
  }
  return key.trim();
}

async function analizzaSingola() {
  const a = aziende.find(x => x.id === selectedId);
  if (!a) return;
  const key = await getAnthropicKey();
  if (!key) return;
  document.getElementById('dBtnAnalizza').disabled = true;
  setStatus(`Analisi AI: ${a.name}...`);
  try {
    a.analisi = await analizzaAzienda(a, key);
    a.score = a.analisi.score;
    showDetail(a.id);
    renderTable();
    updateMetrics();
  } catch (e) { alert('Errore: ' + e.message); }
  setStatus('', false);
  document.getElementById('dBtnAnalizza').disabled = false;
}

async function analizzaTutte() {
  const key = await getAnthropicKey();
  if (!key) return;
  document.getElementById('btnAnalizza').disabled = true;
  for (let i = 0; i < aziende.length; i++) {
    const a = aziende[i];
    setStatus(`Analisi AI ${i + 1}/${aziende.length} — ${a.name}`, true, `${Math.round(i / aziende.length * 100)}%`);
    try {
      a.analisi = await analizzaAzienda(a, key);
      a.score = a.analisi.score;
      if (selectedId === a.id) showDetail(a.id);
      renderTable();
    } catch (e) { console.warn('Analisi fallita:', a.name, e); }
  }
  updateMetrics();
  setStatus('', false);
  document.getElementById('btnAnalizza').disabled = false;
}

async function analizzaAzienda(a, anthropicKey) {
  const hasSite = !!a.sito;
  const prompt = `Analizza questa attività italiana per lead scoring B2B.

Nome: ${a.name}
Tipo: ${a.tipo}
Indirizzo: ${a.indirizzo}
Telefono: ${a.telefono || 'n/d'}
Rating Google: ${a.rating ? `${a.rating}/5 (${a.n_recensioni} rec.)` : 'n/d'}
${hasSite ? `Sito web: ${a.sito}
Analizza: design_moderno (true=flat/responsive, false=datato), cookie_banner (GDPR), social_links, seo_score (1-10), velocita (veloce/media/lenta), ecommerce, tecnologia CMS.`
: `Sito: non disponibile. Imposta design_moderno=null, cookie_banner=null, velocita=null, seo_score=null, tecnologia="n/d"`}

Rispondi SOLO con JSON valido:
{"score":0-100,"design_moderno":true|false|null,"cookie_banner":true|false|null,"social_links":true|false,"seo_score":1-10|null,"velocita":"veloce"|"media"|"lenta"|null,"ecommerce":true|false,"tecnologia":"...","punti_forza":"...","punti_deboli":"...","opportunita_commerciale":"...","motivazione_score":"..."}`;

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
      max_tokens: 600,
      system: 'Rispondi SOLO con JSON valido. Nessun markdown, nessun testo fuori dal JSON.',
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
  if (s === -1 || e === -1) throw new Error('JSON non valido');
  return JSON.parse(raw.slice(s, e + 1));
}

// ── EXPORT CSV ───────────────────────────────────────────────
function exportCSV() {
  if (!aziende.length) return;
  const headers = ['Nome','Tipo','Indirizzo','Telefono','Sito','Rating','Recensioni','Km','Score','Design','Cookie','Social','SEO','Velocità','Ecommerce','Tecnologia','Punti forza','Punti deboli','Opportunità'];
  const rows = filtered().map(a => {
    const an = a.analisi;
    return [a.name,a.tipo,a.indirizzo,a.telefono,a.sito,a.rating||'',a.n_recensioni,a.dist,a.score||'',
      an?.design_moderno??'',an?.cookie_banner??'',an?.social_links??'',an?.seo_score??'',
      an?.velocita??'',an?.ecommerce??'',an?.tecnologia??'',an?.punti_forza??'',
      an?.punti_deboli??'',an?.opportunita_commerciale??'']
      .map(v => `"${String(v).replace(/"/g,'""')}"`);
  });
  const csv = [headers,...rows].map(r=>r.join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `lead-analyzer-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}
