/* SastaScan frontend - vanilla JS PWA */
const API = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  ? 'http://localhost:4000/api'
  : 'https://sastascan-api.onrender.com/api';

const $ = id => document.getElementById(id);
let token = localStorage.getItem('ss_token') || null;
let user = JSON.parse(localStorage.getItem('ss_user') || 'null');
let scanner = null;
let authMode = 'login';
let categories = [];

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(opts.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { logout(); throw new Error(data.error || 'Login karo'); }
  if (!res.ok) throw new Error(data.error || 'Kuch gadbad ho gayi');
  return data;
}

/* ---------- navigation ---------- */
function show(id) { ['authScreen','scanTab','salesTab'].forEach(s => $(s).classList.toggle('hidden', s !== id)); }
function showTab(tab) {
  $('navScan').classList.toggle('active', tab === 'scan');
  $('navSales').classList.toggle('active', tab === 'sales');
  show(tab === 'scan' ? 'scanTab' : 'salesTab');
  stopScanner();
  if (tab === 'sales') loadSales();
}
function logout() {
  localStorage.removeItem('ss_token'); localStorage.removeItem('ss_user');
  token = null; user = null;
  $('tabbar').classList.add('hidden');
  show('authScreen');
}

/* ---------- auth ---------- */
function setAuthMode(m) {
  authMode = m;
  $('tabLogin').classList.toggle('active', m === 'login');
  $('tabSignup').classList.toggle('active', m === 'signup');
  $('authName').classList.toggle('hidden', m === 'login');
  $('authBtn').textContent = m === 'login' ? 'Login' : 'Account banao';
  $('authMsg').textContent = '';
}
async function doAuth() {
  $('authMsg').textContent = '';
  try {
    const body = { email: $('authEmail').value.trim(), password: $('authPass').value };
    if (authMode === 'signup') body.name = $('authName').value.trim();
    const data = await api('/auth/' + (authMode === 'signup' ? 'signup' : 'login'), { method: 'POST', body: JSON.stringify(body) });
    token = data.token; user = data.user;
    localStorage.setItem('ss_token', token);
    localStorage.setItem('ss_user', JSON.stringify(user));
    enter();
  } catch (e) { $('authMsg').textContent = e.message; }
}
function enter() {
  $('tabbar').classList.remove('hidden');
  showTab('scan');
}

/* ---------- barcode / QR scanning ---------- */
async function startScanner() {
  $('scanHome').classList.add('hidden');
  $('results').classList.add('hidden');
  $('photoView').classList.add('hidden');
  $('scannerView').classList.remove('hidden');
  $('scanMsg').textContent = '';
  try {
    const formats = [
      Html5QrcodeSupportedFormats.QR_CODE,
      Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.ITF
    ];
    scanner = new Html5Qrcode('qrReader', { formatsToSupport: formats, verbose: false });
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: (w, h) => ({ width: Math.floor(w * 0.8), height: Math.floor(h * 0.5) }) },
      (text) => { stopScanner(); runBarcode(text); },
      () => {}
    );
  } catch (e) {
    $('scanMsg').textContent = 'Camera nahi khula: ' + (e.message || e);
    $('scannerView').classList.add('hidden');
    $('scanHome').classList.remove('hidden');
  }
}
function stopScanner() {
  if (scanner) { scanner.stop().catch(() => {}); scanner = null; }
  $('scannerView').classList.add('hidden');
}

/* ---------- photo scan (approximate by design) ---------- */
async function onPhotoPicked(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  $('scanHome').classList.add('hidden');
  $('photoView').classList.remove('hidden');
  $('ocrLines').innerHTML = '';
  $('photoText').value = '';
  $('ocrStatus').textContent = 'Photo padh raha hai...';
  $('photoPreview').src = URL.createObjectURL(file);
  try {
    const result = await Tesseract.recognize(file, 'eng');
    const lines = (result.data.text || '').split('\n')
      .map(l => l.trim()).filter(l => l.length >= 3 && /[a-zA-Z]/.test(l)).slice(0, 12);
    $('ocrStatus').textContent = lines.length ? 'Ek line chuno ya naam theek karo:' : 'Text saaf nahi aaya - naam type kar do:';
    lines.forEach(l => {
      const b = document.createElement('button');
      b.className = 'ocr-chip'; b.type = 'button'; b.textContent = l;
      b.onclick = () => { $('photoText').value = l; };
      $('ocrLines').appendChild(b);
    });
    if (lines[0]) $('photoText').value = lines[0];
  } catch (err) {
    $('ocrStatus').textContent = 'Photo nahi padha ja saka - naam type kar do:';
  }
}
async function runPhotoSearch() {
  const q = $('photoText').value.trim();
  if (q.length < 2) { $('ocrStatus').textContent = 'Naam to likho'; return; }
  await runSearch(q);
}

/* ---------- result rendering ---------- */
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function inr(n) { return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }

function offerRow(o, isMaybe) {
  const div = document.createElement('div');
  div.className = 'price-row';
  div.innerHTML = `
    <div class="amt">${esc(o.priceText || inr(o.price))}${o.originalPrice ? `<small>${esc(o.originalPrice)}</small>` : ''}</div>
    <div class="info">
      <div class="shop">${esc(o.merchant || 'Online store')}${isMaybe ? '<span class="maybe-badge">shayad same</span>' : ''}</div>
      <div class="sub">${esc(o.title)}</div>
      <div class="sub">${[o.shipping, o.rating ? '★ ' + o.rating : null].filter(Boolean).map(esc).join(' · ')}</div>
    </div>
    <button class="open-btn" type="button">Kholo</button>`;
  div.querySelector('.open-btn').onclick = async (ev) => {
    const btn = ev.target;
    btn.disabled = true; btn.textContent = '...';
    try {
      const q = new URLSearchParams({ merchant: o.merchant || '', title: o.title || '', storeUrl: o.storeUrl || '', googleLink: o.googleLink || '' });
      const r = await api('/go?' + q.toString());
      window.open(r.url, '_blank', 'noopener');
    } catch (e) {
      const fallback = o.storeUrl || o.googleLink;
      if (fallback) window.open(fallback, '_blank', 'noopener');
      else alert(e.message);
    }
    btn.disabled = false; btn.textContent = 'Kholo';
  };
  return div;
}

function renderResults(data, opts = {}) {
  $('scanHome').classList.add('hidden');
  $('photoView').classList.add('hidden');
  $('results').classList.remove('hidden');
  $('scanMsg').textContent = '';
  const pc = $('productCard'), pl = $('priceList'), ml = $('maybeList');
  pc.innerHTML = ''; pl.innerHTML = ''; ml.innerHTML = '';

  if (!data.found) {
    $('scanMsg').textContent = data.message || 'Kuch nahi mila';
    $('results').classList.add('hidden');
    $('scanHome').classList.remove('hidden');
    return;
  }
  if (data.identity) {
    const idn = data.identity;
    pc.innerHTML = `
      ${idn.image ? `<img src="${esc(idn.image)}" alt="">` : ''}
      <div>
        <div class="pname">${esc(idn.title)}</div>
        <div class="pmeta">${[idn.brand, idn.size, idn.category].filter(Boolean).map(esc).join(' · ')}</div>
        <div class="pmeta">Pehchan: ${esc(idn.source)}${idn.lowConfidence ? ' (kam pakki)' : ''}</div>
      </div>`;
  } else if (opts.query) {
    pc.innerHTML = `<div><div class="pname">"${esc(opts.query)}" ke liye online prices</div>
      <div class="pmeta">Photo/naam se search - ye similar products hain, exact model nahi</div></div>`;
  }
  const exactLabel = document.createElement('div');
  exactLabel.className = 'list-label';
  if (data.exact && data.exact.length) {
    exactLabel.textContent = data.approximate ? 'Sabse sasta upar (similar products)' : 'Same product - sabse sasta upar';
    pl.appendChild(exactLabel);
    data.exact.forEach(o => pl.appendChild(offerRow(o, false)));
  }
  if (data.maybe && data.maybe.length) {
    const lab = document.createElement('div');
    lab.className = 'list-label';
    lab.textContent = data.approximate ? 'Aur similar results' : 'Shayad same / similar - pakka nahi';
    ml.appendChild(lab);
    data.maybe.forEach(o => ml.appendChild(offerRow(o, true)));
  }
  if ((!data.exact || !data.exact.length) && (!data.maybe || !data.maybe.length)) {
    pl.innerHTML = '<div class="empty">Is product ke live online price free source se nahi mile abhi.<br>' +
      (data.error === 'quota' ? 'Aaj ka free quota khatam, kal try karo.' : 'Thodi der baad try karo.') + '</div>';
  }
}

async function runBarcode(code) {
  code = String(code).trim();
  $('scanMsg').textContent = 'Dhundh raha hai...';
  try {
    if (/^\d{8,14}$/.test(code)) {
      renderResults(await api('/scan/' + encodeURIComponent(code)));
    } else if (/^https?:\/\//i.test(code)) {
      $('scanMsg').textContent = 'Ye QR ek link hai, product barcode nahi.';
      $('scanHome').classList.remove('hidden');
    } else {
      renderResults(await api('/search', { method: 'POST', body: JSON.stringify({ query: code }) }));
    }
  } catch (e) {
    $('scanMsg').textContent = e.message;
    $('scanHome').classList.remove('hidden');
  }
}
async function runSearch(q) {
  $('scanMsg').textContent = 'Dhundh raha hai...';
  try {
    renderResults(await api('/search', { method: 'POST', body: JSON.stringify({ query: q }) }), { query: q });
  } catch (e) {
    $('scanMsg').textContent = e.message;
    $('scanHome').classList.remove('hidden');
  }
}

/* ---------- city sales ---------- */
function renderChips() {
  const box = $('catChips');
  box.innerHTML = '';
  const all = ['Sab', ...categories];
  all.forEach(c => {
    const b = document.createElement('button');
    b.className = 'chip'; b.type = 'button'; b.textContent = c;
    b.dataset.cat = c;
    b.onclick = () => {
      box.querySelectorAll('.chip').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      loadSales();
    };
    box.appendChild(b);
  });
  box.firstChild && box.firstChild.classList.add('active');
}
async function loadSales() {
  const list = $('salesList');
  list.innerHTML = '<div class="empty">Load ho raha hai...</div>';
  try {
    const city = $('cityInput').value.trim();
    const active = document.querySelector('#catChips .chip.active');
    const cat = active && active.dataset.cat !== 'Sab' ? active.dataset.cat : '';
    if (!city) {
      list.innerHTML = '<div class="empty">Apna sheher likho ya 📍 location dabao</div>';
      return;
    }
    const rows = await api('/sales?city=' + encodeURIComponent(city) + (cat ? '&category=' + encodeURIComponent(cat) : ''));
    if (!rows.length) {
      list.innerHTML = '<div class="empty">Is sheher mein abhi koi sale listing nahi hai.<br>Dukaandaar neeche button se apni sale daal sakte hain - seedha unka likha hua data dikhta hai.</div>';
      return;
    }
    list.innerHTML = '';
    rows.forEach(s => {
      const div = document.createElement('div');
      div.className = 'sale-card';
      const items = (s.items || []).map(i =>
        `<tr><td>${esc(i.name)}</td><td>${i.mrp ? `<span class="s-mrp">${inr(i.mrp)}</span>` : ''}${inr(i.price)}</td></tr>`).join('');
      div.innerHTML = `
        <div class="s-name">${esc(s.shopName)}
          ${user && s.createdBy && user.email && String(s.createdBy) === String(user._id || '') ? '<button class="s-del">hatao</button>' : ''}
        </div>
        <div class="s-addr">📍 ${esc(s.address)}, ${esc(s.city)}</div>
        <span class="s-cat">${esc(s.category)}</span>
        <table>${items}</table>
        ${s.description ? `<div class="s-addr">${esc(s.description)}</div>` : ''}
        ${s.validTill ? `<div class="s-valid">Valid till: ${esc(new Date(s.validTill).toLocaleDateString('en-IN'))}</div>` : ''}`;
      list.appendChild(div);
    });
  } catch (e) { list.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; }
}
function addItemRow() {
  const row = document.createElement('div');
  row.className = 'item-row';
  row.innerHTML = '<input class="input s-item-name" placeholder="Item (e.g. Samsung M34)">' +
    '<input class="input s-item-price" type="number" min="0" placeholder="Sale ₹">' +
    '<input class="input s-item-mrp" type="number" min="0" placeholder="MRP ₹">' +
    '<button class="rm" type="button">×</button>';
  row.querySelector('.rm').onclick = () => row.remove();
  $('sItems').appendChild(row);
}
async function submitSale() {
  $('saleMsg').textContent = '';
  try {
    const items = [...document.querySelectorAll('#sItems .item-row')].map(r => ({
      name: r.querySelector('.s-item-name').value.trim(),
      price: r.querySelector('.s-item-price').value,
      mrp: r.querySelector('.s-item-mrp').value || undefined
    }));
    await api('/sales', {
      method: 'POST',
      body: JSON.stringify({
        shopName: $('sShop').value.trim(), address: $('sAddr').value.trim(),
        city: $('sCity').value.trim(), category: $('sCat').value,
        items, description: $('sDesc').value.trim(), validTill: $('sValid').value || undefined
      })
    });
    $('saleForm').classList.add('hidden');
    $('cityInput').value = $('sCity').value.trim();
    ['sShop','sAddr','sDesc'].forEach(i => $(i).value = '');
    $('sItems').innerHTML = '';
    loadSales();
  } catch (e) { $('saleMsg').textContent = e.message; }
}
function locate() {
  if (!navigator.geolocation) { alert('Location supported nahi hai'); return; }
  $('locBtn').textContent = '...';
  navigator.geolocation.getCurrentPosition(async pos => {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`);
      const d = await r.json();
      const city = d.address && (d.address.city || d.address.town || d.address.state_district || d.address.county);
      if (city) { $('cityInput').value = city.replace(/^District\s*/i, ''); loadSales(); }
      else alert('Sheher nahi mila, likh do');
    } catch (e) { alert('Location se sheher nahi mila'); }
    $('locBtn').textContent = '📍 Meri location';
  }, () => { alert('Location permission nahi mili'); $('locBtn').textContent = '📍 Meri location'; }, { timeout: 10000 });
}

/* ---------- wire up ---------- */
$('tabLogin').onclick = () => setAuthMode('login');
$('tabSignup').onclick = () => setAuthMode('signup');
$('authBtn').onclick = doAuth;
$('logoutBtn').onclick = logout;
$('logoutBtn2').onclick = logout;
$('navScan').onclick = () => showTab('scan');
$('navSales').onclick = () => showTab('sales');
$('bigScanBtn').onclick = startScanner;
$('closeScanner').onclick = () => { stopScanner(); $('scanHome').classList.remove('hidden'); };
$('photoScanBtn').onclick = () => $('photoInput').click();
$('photoInput').onchange = onPhotoPicked;
$('photoSearchBtn').onclick = runPhotoSearch;
$('photoCancel').onclick = () => { $('photoView').classList.add('hidden'); $('scanHome').classList.remove('hidden'); };
$('backBtn').onclick = () => { $('results').classList.add('hidden'); $('scanHome').classList.remove('hidden'); $('scanMsg').textContent = ''; };
$('manualBtn').onclick = () => { const v = $('manualInput').value.trim(); if (v) runBarcode(v); };
$('locBtn').onclick = locate;
$('cityInput').onchange = loadSales;
$('addSaleBtn').onclick = () => { $('saleForm').classList.toggle('hidden'); if (!$('sItems').children.length) addItemRow(); };
$('sAddItem').onclick = addItemRow;
$('sSubmit').onclick = submitSale;
$('sCancel').onclick = () => $('saleForm').classList.add('hidden');

(async function init() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  try { categories = await api('/sales/categories'); } catch (e) { categories = ['Phones & Electronics','Kitchen & Utensils','Grocery & Daily Needs','Fashion & Footwear','Furniture','Beauty & Personal Care','Books & Stationery','Other']; }
  $('sCat').innerHTML = categories.map(c => `<option>${esc(c)}</option>`).join('');
  renderChips();
  if (token) enter(); else show('authScreen');
})();
