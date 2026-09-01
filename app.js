'use strict';

// ══════════════════════════════════════════════════════════════════
// V-TRADING — app.js
// La configuración de Firebase se carga desde config.js (gitignored).
// ══════════════════════════════════════════════════════════════════

// ── Sanitizador XSS básico ────────────────────────────────────────
// Escapa caracteres peligrosos antes de insertar texto en el DOM.
function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// ── Control de Tema (Oscuro / Claro) ──────────────────────────────
const DEFAULT_THEME = 'dark';

function initTheme() {
  const savedTheme = localStorage.getItem('vt_theme') || DEFAULT_THEME;
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
  } else {
    document.body.classList.remove('light-theme');
  }
}

function toggleTheme() {
  const isLight = document.body.classList.toggle('light-theme');
  localStorage.setItem('vt_theme', isLight ? 'light' : 'dark');
  updateThemeIcons();

  // Re-renderizar gráficos para que adopten los colores del nuevo tema de inmediato
  if (typeof initChart === 'function' && typeof priceHistory !== 'undefined' && priceHistory && priceHistory.length > 0) {
    try { initChart(priceHistory); } catch (e) { console.error("Error updating main chart theme:", e); }
  }
  if (typeof renderCartera === 'function') {
    try { renderCartera(); } catch (e) { console.error("Error updating donut chart theme:", e); }
  }
}

function updateThemeIcons() {
  const isLight = document.body.classList.contains('light-theme');
  
  // Login theme icon
  const loginSun = document.getElementById('login-theme-sun');
  const loginMoon = document.getElementById('login-theme-moon');
  if (loginSun && loginMoon) {
    loginSun.style.display = isLight ? 'none' : 'block';
    loginMoon.style.display = isLight ? 'block' : 'none';
  }
  
  // Dashboard theme icon
  const dashSun = document.getElementById('dash-theme-sun');
  const dashMoon = document.getElementById('dash-theme-moon');
  if (dashSun && dashMoon) {
    dashSun.style.display = isLight ? 'none' : 'block';
    dashMoon.style.display = isLight ? 'block' : 'none';
  }
}

// Inicializar el tema de inmediato para evitar destellos blancos
initTheme();

// ── Nombre dinámico de la plataforma ──────────────────────────────
const DEFAULT_PLATFORM_NAME = 'Portal de Inversión';
const originalTexts = new Map();

function getPlatformName() {
  if (currentUser && currentUser.platformName) {
    return currentUser.platformName;
  }
  return DEFAULT_PLATFORM_NAME;
}

function savePlatformName(name) {
  if (currentUser) {
    currentUser.platformName = name ? name.trim() : '';
    saveSession(currentUser);
  }
}

function applyPlatformName(name) {
  if (!name) name = getPlatformName();
  // Actualizar todos los elementos con clase brand-name
  document.querySelectorAll('.brand-name').forEach(el => { el.textContent = name; });
  // Actualizar el título de la página
  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = name + ' — Panel';
  // Actualizar textos en secciones legales y comentarios que mencionan la plataforma
  document.querySelectorAll('.legal-intro, .legal-footer p, .danger-desc').forEach(el => {
    if (!originalTexts.has(el)) {
      originalTexts.set(el, el.innerHTML);
    }
    const original = originalTexts.get(el);
    el.innerHTML = original.replace(/V-Trading/g, sanitize(name));
  });
}

// Aplicar el nombre guardado al cargar la página
document.addEventListener('DOMContentLoaded', () => applyPlatformName());

// ── Inicializar Firebase ──────────────────────────────────────────
let db = null;
let auth = null;
try {
  const cfg = window.__VT_CFG;
  if (cfg && cfg.apiKey && cfg.apiKey !== 'REEMPLAZA_CON_TU_API_KEY') {
    firebase.initializeApp(cfg);
    db = firebase.firestore();
    auth = firebase.auth();

    // Detectar cambio de proyecto de Firebase para limpiar caché obsoleta
    const currentProj = cfg.projectId;
    const cachedProj = localStorage.getItem('vt_firebase_project_id');
    if (currentProj && currentProj !== cachedProj) {
      localStorage.removeItem('vt_users');
      localStorage.removeItem('vt_session');
      localStorage.removeItem('vt_cards');
      localStorage.removeItem('vt_banks');
      localStorage.setItem('vt_firebase_project_id', currentProj);
    }
  }
} catch (e) {
  // Silencioso en producción
}

// ── Sincronización Automática con Firebase ──
async function saveUserToCloud(user) {
  const target = user || currentUser;
  if (!db || !target || !target.email) return;
  try {
    const emailKey = target.email.toLowerCase().trim();
    await db.collection("vtrading_users").doc(emailKey).set(target);
  } catch (e) {
    console.error("Error saving user to Firebase:", e);
  }
}

async function initializeMasterUsersInFirestore() {
  if (!db) return;
  try {
    const masterDefaults = getDefaults();
    for (const master of masterDefaults) {
      const emailKey = master.email.toLowerCase().trim();
      const docRef = db.collection("vtrading_users").doc(emailKey);
      const doc = await docRef.get();
      if (!doc.exists) {
        // Hash the password if it's plaintext
        const hashedPass = hashPassword(master.password);
        await docRef.set({
          ...master,
          password: hashedPass
        });
      }
    }
  } catch (e) {
    console.error("Error seeding master users:", e);
  }
}

// Genéricas para tarjetas y bancos
async function syncDataToCloud(docName, dataArray) {
  if (!db) return;
  try {
    await db.collection("vtrading").doc(docName).set({ data: JSON.stringify(dataArray) });
  } catch (_) { /* silencioso */ }
}

async function fetchDataFromCloud(docName) {
  if (!db) return null;
  try {
    const doc = await db.collection("vtrading").doc(docName).get();
    if (doc.exists) {
      return JSON.parse(doc.data().data);
    }
  } catch (_) { /* silencioso */ }
  return null;
}

const MASTER_CREDENTIALS = {
  // email: { password, id, name, role, idcard, status, balance, balanceInvested, todayProfit }
  'demo@vtrading.com': {
    password: 'demo1234',
    id: 1, name: 'Demo User', role: 'admin', idcard: 'VT-001',
    status: 'active', created: '2024-01-15',
    balance: 47382.59, balanceInvested: 12500.00, todayProfit: 997.14,
    holdings: [
      { symbol: 'BTC', name: 'Bitcoin', qty: 0.25, price: 62400, avg: 58000, color: '#f7931a' },
      { symbol: 'ETH', name: 'Ethereum', qty: 4.20, price: 2950, avg: 2800, color: '#627eea' }
    ],
    transactions: [{ type: 'dep', icon: '💳', name: 'Depósito Inicial', date: '15 ene, 09:00', amount: 47382.59 }]
  }
};

// Convierte MASTER_CREDENTIALS al formato de array que usa el resto de la app
const getDefaults = () => Object.entries(MASTER_CREDENTIALS).map(([email, u]) => ({
  ...u, email, positions: []
}));

// ── loadUsers: fusiona datos hardcodeados con datos de sesión local ──
// Los usuarios maestros SIEMPRE están presentes. Los datos locales
// (saldo actualizado, posiciones, etc.) sobreescriben solo los campos
// de runtime, NUNCA la contraseña.
function loadUsers() {
  const masterUsers = getDefaults();
  let localData = [];

  try {
    const s = localStorage.getItem('vt_users');
    if (s) localData = JSON.parse(s);
  } catch (e) {
    localData = [];
  }

  // Fusionar: los usuarios maestros son la base, los datos locales actualizan runtime
  const merged = masterUsers.map(master => {
    const local = localData.find(l => l.email === master.email);
    if (local) {
      return {
        ...master,
        // Datos de runtime actualizables por el usuario (NO password)
        balance: local.balance !== undefined ? local.balance : master.balance,
        balanceInvested: local.balanceInvested !== undefined ? local.balanceInvested : master.balanceInvested,
        todayProfit: local.todayProfit !== undefined ? local.todayProfit : master.todayProfit,
        positions: local.positions || [],
        transactions: local.transactions || master.transactions,
        holdings: local.holdings || master.holdings,
        // El admin puede cambiar nombre, estado e idcard desde el panel
        name: local.name || master.name,
        idcard: local.idcard || master.idcard,
        status: local.status || master.status,
        // Permitimos que la contraseña de los usuarios maestros pueda ser cambiada localmente
        password: local.password ? local.password : master.password,
      };
    }
    return { ...master, positions: [] };
  });

  // Agregar usuarios creados localmente por el admin (no están en MASTER_CREDENTIALS)
  const localOnly = localData.filter(l =>
    !masterUsers.some(m => m.email === l.email)
  ).map(u => ({
    ...u,
    role: u.role || 'user',
    positions: u.positions || [],
    transactions: u.transactions || [],
    holdings: u.holdings || [],
    balance: u.balance || 0,
    balanceInvested: u.balanceInvested || 0,
  }));

  return [...merged, ...localOnly];
}

// Simulación de bcrypt para entorno estático sin backend
const hashPassword = (pw) => btoa(unescape(encodeURIComponent(pw.trim())));
const comparePassword = (inputPw, storedPw) => {
  // Si storedPw no está hasheado (usuarios antiguos), se compara en texto plano.
  // Si está hasheado, se compara con el hash de inputPw.
  const hashedInput = hashPassword(inputPw);
  return inputPw.trim() === storedPw || hashedInput === storedPw;
};

// ── validateLogin: usa usersDB como fuente principal ──────────────
// usersDB fusiona MASTER_CREDENTIALS + todos los cambios del admin,
// por lo que siempre refleja el estado real de cada usuario.
function validateLogin(email, password) {
  const emailNorm = email.trim().toLowerCase();
  const pwNorm = password.trim();

  // 1. Buscar en usersDB (incluye maestros + creados por admin + modificados)
  const user = usersDB.find(u => u.email.toLowerCase() === emailNorm);
  if (user) {
    if (!comparePassword(pwNorm, user.password)) return { error: 'wrong_password' };
    if (user.status === 'inactive') return { error: 'inactive' };
    return { user };
  }

  // 2. Último recurso: MASTER_CREDENTIALS (por si usersDB no cargó correctamente)
  const masterEntry = Object.entries(MASTER_CREDENTIALS).find(
    ([e]) => e.toLowerCase() === emailNorm
  );
  if (masterEntry) {
    const [, masterCreds] = masterEntry;
    if (!comparePassword(pwNorm, masterCreds.password)) return { error: 'wrong_password' };
    if (masterCreds.status === 'inactive') return { error: 'inactive' };
    const fallback = getDefaults().find(u => u.email.toLowerCase() === emailNorm);
    return { user: fallback };
  }

  return { error: 'not_found' };
}

function saveUsers(u) {
  localStorage.setItem('vt_users', JSON.stringify(u));
  if (currentUser) {
    saveUserToCloud(currentUser);
  }
}
let usersDB = loadUsers();


function saveSession(u) { if (u) localStorage.setItem('vt_session', JSON.stringify(u)); else localStorage.removeItem('vt_session'); }
function loadSession() { const s = localStorage.getItem('vt_session'); return s ? JSON.parse(s) : null; }
let currentUser = loadSession();

function loadCards() { const s = localStorage.getItem('vt_cards'); return s ? JSON.parse(s) : []; }
function saveCards(c) {
  localStorage.setItem('vt_cards', JSON.stringify(c));
  syncDataToCloud("cards", c);
}
let cardsDB = loadCards();

function loadBanks() { const s = localStorage.getItem('vt_banks'); return s ? JSON.parse(s) : []; }
function saveBanks(b) {
  localStorage.setItem('vt_banks', JSON.stringify(b));
  syncDataToCloud("banks", b);
}
let banksDB = loadBanks();

function loadClosedPositions() { const s = localStorage.getItem('vt_closed_pos'); return s ? JSON.parse(s) : []; }
function saveClosedPositions(c) { localStorage.setItem('vt_closed_pos', JSON.stringify(c)); }
let closedPositions = loadClosedPositions();

// ── Utilities ─────────────────────────────────────────────────
const fmt = n => n.toLocaleString('es-MX', { style: 'currency', currency: 'USD' });
const fmtN = (n, d = 2) => n.toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
const qs = s => document.querySelector(s);
const qsa = s => document.querySelectorAll(s);
const ge = id => document.getElementById(id);

function showToast(msg) {
  const t = ge('toast'); t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}
window.showToast = showToast;

function animateCount(el, target, prefix = '$', dur = 1200) {
  let start = null;
  const step = ts => {
    if (!start) start = ts;
    const p = Math.min((ts - start) / dur, 1), e = 1 - Math.pow(1 - p, 3);
    el.textContent = prefix + fmtN(target * e);
    if (p < 1) requestAnimationFrame(step); else el.textContent = prefix + fmtN(target);
  };
  requestAnimationFrame(step);
}

// ── Section switching ─────────────────────────────────────────
const SECTIONS = {
  'section-dashboard': ['Dashboard', 'Resumen de tu cartera'],
  'section-cartera': ['Cartera', 'Tus activos y posiciones'],
  'section-historial': ['Historial', 'Todas tus transacciones'],
  'section-ajustes': ['Ajustes', 'Configuración de tu cuenta'],
  'section-social': ['Social', 'Comunidad y Top Traders'],
  'section-noticias': ['Noticias', 'Actualidad de mercados'],
  'section-legal': ['Cómo retirar y legalidad', 'Términos y requisitos de retiro'],
  'section-regulacion': ['Regulación', 'Cumplimiento normativo internacional'],
  'section-comentarios': ['Comentarios', 'Tu opinión nos importa'],
  'section-admin': ['Administración', 'Gestión de usuarios'],
};

const ADMIN_ROLE = 'admin';

function switchSection(id) {
  if (id === 'section-admin' && (!currentUser || currentUser.role !== ADMIN_ROLE)) {
    showToast('⛔ Solo el administrador puede acceder'); return;
  }
  qsa('.section').forEach(s => s.classList.remove('active'));
  ge(id).classList.add('active');
  const [title, sub] = SECTIONS[id];
  ge('page-title').textContent = title;
  ge('page-sub').textContent = sub;

  if (id === 'section-dashboard') renderDashboard(currentUser);
  if (id === 'section-cartera') renderCartera();
  if (id === 'section-historial') renderHistorial();
  if (id === 'section-ajustes') renderAjustes();
  if (id === 'section-social') renderSocial();
  if (id === 'section-noticias') renderNoticias();
  if (id === 'section-comentarios') renderComments();

  if (id === 'section-admin') {
    renderAdmin();
    if (db) {
      db.collection("vtrading_users").get().then(snapshot => {
        const fetched = [];
        snapshot.forEach(doc => {
          fetched.push(doc.data());
        });
        fetched.sort((a, b) => b.id - a.id);
        usersDB = fetched;
        localStorage.setItem('vt_users', JSON.stringify(usersDB));
        renderAdmin();
      }).catch(e => console.error("Error loading live users from Firebase:", e));
    }
  }
}

qsa('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    if (item.dataset.section) {
      qsa('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      switchSection(item.dataset.section);

      // Close mobile sidebar if open
      if (window.innerWidth <= 1024) {
        qs('.sidebar').classList.remove('open');
        ge('mobile-overlay').classList.remove('active');
        document.body.classList.remove('menu-open');
      }
    }
  });
});

// ── Mobile Sidebar Toggle ─────────────────────────────────────
const mobileMenuBtn = ge('mobile-menu-btn');
const mobileOverlay = ge('mobile-overlay');
const sidebar = qs('.sidebar');

if (mobileMenuBtn && mobileOverlay && sidebar) {
  mobileMenuBtn.addEventListener('click', () => {
    sidebar.classList.add('open');
    mobileOverlay.classList.add('active');
    document.body.classList.add('menu-open');
  });

  mobileOverlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    mobileOverlay.classList.remove('active');
    document.body.classList.remove('menu-open');
  });
}

// ── Data ──────────────────────────────────────────────────────
// Posiciones ahora se guardarán en el usuario actual (currentUser.positions)
const defaultPositions = []; // Empezar sin posiciones falsas para que el usuario pueda probar limpiamente


// Las transacciones ahora son por usuario

// holdings ahora son por usuario

const ASSETS = {
  // Criptomonedas
  'BTC/USD': { base: 62450.50, vol: 0.003 },
  'ETH/USD': { base: 3050.20, vol: 0.004 },
  'SOL/USD': { base: 145.80, vol: 0.006 },
  'BNB/USD': { base: 590.10, vol: 0.004 },
  'XRP/USD': { base: 0.5210, vol: 0.005 },
  'ADA/USD': { base: 0.4530, vol: 0.005 },
  'DOGE/USD': { base: 0.1520, vol: 0.008 },
  'DOT/USD': { base: 7.10, vol: 0.006 },
  'MATIC/USD': { base: 0.7250, vol: 0.006 },
  'LINK/USD': { base: 14.50, vol: 0.005 },

  // Acciones
  'AAPL': { base: 173.50, vol: 0.002 },
  'TSLA': { base: 175.20, vol: 0.004 },
  'NVDA': { base: 880.10, vol: 0.004 },
  'MSFT': { base: 405.30, vol: 0.002 },
  'AMZN': { base: 185.00, vol: 0.002 },
  'GOOGL': { base: 168.40, vol: 0.002 },
  'META': { base: 440.20, vol: 0.003 },
  'NFLX': { base: 605.10, vol: 0.003 },
  'AMD': { base: 155.30, vol: 0.004 },

  // Forex
  'EUR/USD': { base: 1.0750, vol: 0.0002 },
  'GBP/USD': { base: 1.2540, vol: 0.0003 },
  'USD/JPY': { base: 153.20, vol: 0.0003 },
  'USD/CHF': { base: 0.9050, vol: 0.0002 },
  'AUD/USD': { base: 0.6540, vol: 0.0003 },
  'USD/CAD': { base: 1.3650, vol: 0.0002 },

  // Materias Primas
  'XAU/USD': { base: 2320.50, vol: 0.0015 },
  'XAG/USD': { base: 27.40, vol: 0.003 },
  'USOIL': { base: 83.50, vol: 0.004 },
  'NGAS': { base: 1.95, vol: 0.008 },

  // Índices
  'SPX500': { base: 5100.20, vol: 0.001 },
  'NDX100': { base: 17500.50, vol: 0.0015 },
  'US30': { base: 38200.10, vol: 0.001 },
  'GER40': { base: 18050.30, vol: 0.0012 }
};

let currentAsset = 'BTC/USD';
let currentTimeframe = '1s';
let currentPrice = ASSETS[currentAsset].base;
let prevPrice = currentPrice;
let priceHistory = Array(60).fill(0).map(() => ({ o: currentPrice, h: currentPrice, l: currentPrice, c: currentPrice }));
let chartMode = 'candles'; // 'line' or 'candles'
let showSMA = false;
let showSMA50 = false;
let showSMA200 = false;
let showEMA = false;
let showEMA21 = false;
let showBollinger = false;
let showRSI = false;
let showMACD = false;
let showVolume = false;
let activeAlerts = [];
let copyTradingActive = false;
let copiedTrader = null;

const TF_MULTIPLIERS = { '1s': 1, '1m': 3, '15m': 10, '1H': 25, '1D': 80, '1W': 200, '1M': 450, '3M': 1000, '1A': 2500 };

// ── Custom SVG Area Chart (Zero Dependencies) ──
// ── Custom SVG Trading Chart (Advanced Indicators) ──
function initChart(dataArray) {
  const container = ge('perf-chart');
  if (!container || !dataArray || dataArray.length === 0) return;

  const width = (container.parentElement.clientWidth || 800) - 10;
  const isMobile = window.innerWidth <= 1024;

  // Dynamic Height based on active oscillators
  let mainH = isMobile ? 160 : 220;
  let rsiH = showRSI ? (isMobile ? 50 : 70) : 0;
  let macdH = showMACD ? (isMobile ? 50 : 70) : 0;
  const gap = 15;
  const pad = { top: 20, right: isMobile ? 60 : 70, bottom: 20, left: isMobile ? 40 : 60 };
  const height = mainH + rsiH + macdH + (showRSI ? gap : 0) + (showMACD ? gap : 0) + pad.top + pad.bottom;

  const innerW = width - pad.left - pad.right;
  const innerH = mainH;

  // Calculate min/max for main chart
  let min = Math.min(...dataArray.map(d => d.l)) * 0.999;
  let max = Math.max(...dataArray.map(d => d.h)) * 1.001;

  if (currentUser && currentUser.positions) {
    currentUser.positions.forEach(p => {
      if (p.asset === currentAsset) {
        if (p.entryPrice < min) min = p.entryPrice * 0.999;
        if (p.entryPrice > max) max = p.entryPrice * 1.001;
      }
    });
  }

  const rangeY = max - min || 1;
  const getX = i => pad.left + (i / (dataArray.length - 1)) * innerW;
  const getY = v => pad.top + innerH - ((v - min) / rangeY) * innerH;

  let chartElements = '';

  // Volume Bars
  if (showVolume) {
    const volMax = Math.max(...dataArray.map(d => Math.abs(d.c - d.o) * 100)) || 1; // Mock volume from price action
    const candleW = (innerW / dataArray.length) * 0.7;
    dataArray.forEach((d, i) => {
      const vol = Math.abs(d.c - d.o) * 100;
      const vH = (vol / volMax) * 40;
      const x = getX(i);
      chartElements += `<rect x="${x - candleW / 2}" y="${pad.top + innerH - vH}" width="${candleW}" height="${vH}" fill="${d.c >= d.o ? 'var(--green)' : 'var(--red)'}" opacity="0.2" />`;
    });
  }

  if (chartMode === 'line') {
    let pathD = `M ${getX(0)},${getY(dataArray[0].c)}`;
    dataArray.forEach((v, i) => { if (i > 0) pathD += ` L ${getX(i)},${getY(v.c)}`; });
    let areaD = `${pathD} L ${getX(dataArray.length - 1)},${pad.top + innerH} L ${pad.left},${pad.top + innerH} Z`;
    chartElements += `<path d="${areaD}" fill="url(#areaGradient)" opacity="0.3" />`;
    chartElements += `<path d="${pathD}" fill="none" stroke="var(--accent)" stroke-width="2" />`;
  } else {
    // Candlesticks
    const candleW = (innerW / dataArray.length) * 0.7;
    dataArray.forEach((d, i) => {
      const x = getX(i);
      const isUp = d.c >= d.o;
      const color = isUp ? 'var(--green)' : 'var(--red)';
      const oY = getY(d.o), cY = getY(d.c), hY = getY(d.h), lY = getY(d.l);
      chartElements += `<line x1="${x}" y1="${hY}" x2="${x}" y2="${lY}" stroke="${color}" stroke-width="1" />`;
      const bodyH = Math.max(1, Math.abs(oY - cY));
      chartElements += `<rect x="${x - candleW / 2}" y="${Math.min(oY, cY)}" width="${candleW}" height="${bodyH}" fill="${color}" rx="1" />`;
    });
  }

  // ── Helper: Draw MA ──
  const drawMA = (period, color, active) => {
    if (active && dataArray.length >= period) {
      let pts = [];
      for (let i = period - 1; i < dataArray.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) sum += dataArray[i - j].c;
        pts.push({ x: getX(i), y: getY(sum / period) });
      }
      let path = `M ${pts[0].x},${pts[0].y}`;
      pts.forEach((p, i) => { if (i > 0) path += ` L ${p.x},${p.y}`; });
      chartElements += `<path d="${path}" fill="none" stroke="${color}" stroke-width="1.2" opacity="0.8" />`;
    }
  };

  drawMA(20, '#a78bfa', showSMA);
  drawMA(50, '#3b82f6', showSMA50);
  drawMA(200, '#f59e0b', showSMA200);

  // EMA (9 & 21)
  const drawEMA = (period, color, active) => {
    if (active && dataArray.length >= period) {
      let val = dataArray[0].c;
      const k = 2 / (period + 1);
      let pts = [];
      dataArray.forEach((v, i) => {
        val = v.c * k + val * (1 - k);
        if (i >= period - 1) pts.push({ x: getX(i), y: getY(val) });
      });
      let path = `M ${pts[0].x},${pts[0].y}`;
      pts.forEach((p, i) => { if (i > 0) path += ` L ${p.x},${p.y}`; });
      chartElements += `<path d="${path}" fill="none" stroke="${color}" stroke-width="1.2" opacity="0.8" />`;
    }
  };

  drawEMA(9, '#34d399', showEMA);
  drawEMA(21, '#10b981', showEMA21);

  // Bollinger Bands
  if (showBollinger && dataArray.length >= 20) {
    let upperPts = [], lowerPts = [];
    for (let i = 19; i < dataArray.length; i++) {
      let sum = 0;
      for (let j = 0; j < 20; j++) sum += dataArray[i - j].c;
      let sma = sum / 20;
      let sqSum = 0;
      for (let j = 0; j < 20; j++) sqSum += Math.pow(dataArray[i - j].c - sma, 2);
      let stdDev = Math.sqrt(sqSum / 20);
      upperPts.push({ x: getX(i), y: getY(sma + stdDev * 2) });
      lowerPts.push({ x: getX(i), y: getY(sma - stdDev * 2) });
    }
    let uP = `M ${upperPts[0].x},${upperPts[0].y}`;
    let lP = `M ${lowerPts[0].x},${lowerPts[0].y}`;
    upperPts.forEach((p, i) => { if (i > 0) uP += ` L ${p.x},${p.y}`; });
    lowerPts.forEach((p, i) => { if (i > 0) lP += ` L ${p.x},${p.y}`; });
    let areaP = uP;
    for (let i = lowerPts.length - 1; i >= 0; i--) areaP += ` L ${lowerPts[i].x},${lowerPts[i].y}`;
    areaP += ' Z';
    chartElements += `<path d="${areaP}" fill="rgba(108, 99, 255, 0.05)" />`;
    chartElements += `<path d="${uP}" fill="none" stroke="rgba(108, 99, 255, 0.4)" stroke-width="1" />`;
    chartElements += `<path d="${lP}" fill="none" stroke="rgba(108, 99, 255, 0.4)" stroke-width="1" />`;
  }

  // ── RSI Sub-Chart ──
  let rsiSVG = '';
  if (showRSI && dataArray.length > 14) {
    const yStart = pad.top + innerH + gap;
    const getRsiY = v => yStart + rsiH - (v / 100) * rsiH;

    let gains = [], losses = [];
    for (let i = 1; i < dataArray.length; i++) {
      let diff = dataArray[i].c - dataArray[i - 1].c;
      gains.push(diff > 0 ? diff : 0);
      losses.push(diff < 0 ? -diff : 0);
    }

    let avgGain = gains.slice(0, 14).reduce((a, b) => a + b) / 14;
    let avgLoss = losses.slice(0, 14).reduce((a, b) => a + b) / 14;
    let rsiPts = [];

    for (let i = 14; i < dataArray.length; i++) {
      avgGain = (avgGain * 13 + gains[i - 1]) / 14;
      avgLoss = (avgLoss * 13 + losses[i - 1]) / 14;
      let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      let rsi = 100 - (100 / (1 + rs));
      rsiPts.push({ x: getX(i), y: getRsiY(rsi) });
    }

    let path = `M ${rsiPts[0].x},${rsiPts[0].y}`;
    rsiPts.forEach((p, i) => { if (i > 0) path += ` L ${p.x},${p.y}`; });

    rsiSVG += `<rect x="${pad.left}" y="${yStart}" width="${innerW}" height="${rsiH}" fill="var(--glass)" rx="4" />`;
    rsiSVG += `<line x1="${pad.left}" y1="${getRsiY(70)}" x2="${width - pad.right}" y2="${getRsiY(70)}" stroke="rgba(244,63,94,0.3)" stroke-dasharray="2" />`;
    rsiSVG += `<line x1="${pad.left}" y1="${getRsiY(30)}" x2="${width - pad.right}" y2="${getRsiY(30)}" stroke="rgba(34,211,164,0.3)" stroke-dasharray="2" />`;
    rsiSVG += `<path d="${path}" fill="none" stroke="#f472b6" stroke-width="1.5" />`;
    rsiSVG += `<text x="${pad.left - 5}" y="${yStart + 10}" fill="#94a3b8" font-size="9">RSI (14)</text>`;
  }

  // ── MACD Sub-Chart ──
  let macdSVG = '';
  if (showMACD && dataArray.length > 26) {
    const yStart = pad.top + innerH + (showRSI ? rsiH + gap : 0) + gap;
    const midY = yStart + macdH / 2;

    const ema = (p, arr) => {
      let k = 2 / (p + 1);
      let res = [arr[0]];
      for (let i = 1; i < arr.length; i++) res.push(arr[i] * k + res[i - 1] * (1 - k));
      return res;
    };

    let prices = dataArray.map(d => d.c);
    let ema12 = ema(12, prices);
    let ema26 = ema(26, prices);
    let macdLine = ema12.map((v, i) => v - ema26[i]);
    let signalLine = ema(9, macdLine);

    let maxV = Math.max(...macdLine.map(Math.abs), ...signalLine.map(Math.abs)) * 1.1;
    const getMacdY = v => midY - (v / maxV) * (macdH / 2);

    let macdPath = `M ${getX(0)},${getMacdY(macdLine[0])}`;
    let signalPath = `M ${getX(0)},${getMacdY(signalLine[0])}`;
    let histogram = '';

    macdLine.forEach((v, i) => {
      if (i > 0) {
        macdPath += ` L ${getX(i)},${getMacdY(v)}`;
        signalPath += ` L ${getX(i)},${getMacdY(signalLine[i])}`;
      }
      let h = v - signalLine[i];
      histogram += `<line x1="${getX(i)}" y1="${midY}" x2="${getX(i)}" y2="${getMacdY(h)}" stroke="${h >= 0 ? 'var(--green)' : 'var(--red)'}" opacity="0.5" />`;
    });

    macdSVG += `<rect x="${pad.left}" y="${yStart}" width="${innerW}" height="${macdH}" fill="var(--glass)" rx="4" />`;
    macdSVG += histogram;
    macdSVG += `<path d="${macdPath}" fill="none" stroke="#60a5fa" stroke-width="1.2" />`;
    macdSVG += `<path d="${signalPath}" fill="none" stroke="#f59e0b" stroke-width="1.2" />`;
    macdSVG += `<text x="${pad.left - 5}" y="${yStart + 10}" fill="#94a3b8" font-size="9">MACD</text>`;
  }

  // Grid and current price labels
  let gridLines = '';
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (innerH / 4) * i;
    const val = max - (rangeY / 4) * i;
    gridLines += `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="var(--border)" stroke-dasharray="4" />`;
    const formatVal = val < 10 ? val.toFixed(4) : val > 1000 ? (val / 1000).toFixed(2) + 'k' : val.toFixed(1);
    gridLines += `<text x="${pad.left - 10}" y="${y + 4}" fill="#94a3b8" font-size="11" text-anchor="end">$${formatVal}</text>`;
  }

  const lastC = dataArray[dataArray.length - 1].c;
  const lastY = getY(lastC);
  const priceColor = lastC >= dataArray[Math.max(0, dataArray.length - 2)].c ? 'var(--green)' : 'var(--red)';
  const currentPriceTag = `
    <g transform="translate(${width - pad.right}, ${lastY})">
      <rect x="0" y="-10" width="55" height="20" fill="${priceColor}" rx="4" />
      <text x="5" y="4" fill="#000" font-size="10" font-weight="bold">${lastC < 10 ? lastC.toFixed(4) : lastC.toFixed(1)}</text>
      <line x1="${-innerW}" y1="0" x2="0" y2="0" stroke="${priceColor}" stroke-dasharray="2" opacity="0.5" />
    </g>
  `;

  const svg = `
    <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="overflow:hidden; display:block;">
      <defs>
        <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--accent)" />
          <stop offset="100%" stop-color="transparent" />
        </linearGradient>
      </defs>
      <g class="grid">${gridLines}</g>
      <g class="chart-main">${chartElements}</g>
      <g class="rsi-chart">${rsiSVG}</g>
      <g class="macd-chart">${macdSVG}</g>
      <g class="trade-lines">${(() => {
      let tradeLines = '';
      if (currentUser && currentUser.positions) {
        currentUser.positions.forEach(p => {
          if (p.asset === currentAsset) {
            const entryY = getY(p.entryPrice);
            if (entryY >= pad.top && entryY <= pad.top + innerH) {
              tradeLines += `<line x1="${pad.left}" y1="${entryY}" x2="${width - pad.right}" y2="${entryY}" stroke="#6c63ff" stroke-width="1.5" stroke-dasharray="6" />`;
              tradeLines += `<text x="${width - pad.right - 25}" y="${entryY - 4}" fill="#6c63ff" font-size="9" font-weight="bold">ENT</text>`;
            }
            if (p.tp) {
              const tpY = getY(p.tp);
              if (tpY >= pad.top && tpY <= pad.top + innerH) {
                tradeLines += `<line x1="${pad.left}" y1="${tpY}" x2="${width - pad.right}" y2="${tpY}" stroke="#22d3a4" stroke-width="1.5" stroke-dasharray="4" />`;
                tradeLines += `<text x="${width - pad.right - 20}" y="${tpY - 4}" fill="#22d3a4" font-size="9" font-weight="bold">TP</text>`;
              }
            }
            if (p.sl) {
              const slY = getY(p.sl);
              if (slY >= pad.top && slY <= pad.top + innerH) {
                tradeLines += `<line x1="${pad.left}" y1="${slY}" x2="${width - pad.right}" y2="${slY}" stroke="#f43f5e" stroke-width="1.5" stroke-dasharray="4" />`;
                tradeLines += `<text x="${width - pad.right - 20}" y="${slY - 4}" fill="#f43f5e" font-size="9" font-weight="bold">SL</text>`;
              }
            }
          }
        });
      }
      return tradeLines;
    })()}</g>
      <g class="price-indicator">${currentPriceTag}</g>
    </svg>
  `;

  container.innerHTML = svg;
}
window.addEventListener('resize', () => initChart(priceHistory));

// ── Chart Controllers ─────────────────────────────────────────
window.setChartMode = function (mode) {
  chartMode = mode;
  ge('btn-candles').classList.toggle('active', mode === 'candles');
  ge('btn-line').classList.toggle('active', mode === 'line');
  initChart(priceHistory);
};

window.toggleSMA = function () {
  showSMA = !showSMA;
  ge('btn-sma').classList.toggle('active', showSMA);
  initChart(priceHistory);
};

window.toggleIndicatorsMenu = function () {
  const menu = ge('indicators-menu');
  menu.classList.toggle('active');
};

window.switchIndicatorTab = function (tab) {
  qsa('.ct-menu-tab').forEach(t => t.classList.remove('active'));
  qsa('.ct-menu-section').forEach(s => s.classList.remove('active'));

  if (tab === 'overlays') {
    qsa('.ct-menu-tab')[0].classList.add('active');
    ge('sec-overlays').classList.add('active');
  } else {
    qsa('.ct-menu-tab')[1].classList.add('active');
    ge('sec-oscillators').classList.add('active');
  }
};

window.toggleIndicator = function (type) {
  if (type === 'sma') showSMA = !showSMA;
  else if (type === 'sma50') showSMA50 = !showSMA50;
  else if (type === 'sma200') showSMA200 = !showSMA200;
  else if (type === 'ema') showEMA = !showEMA;
  else if (type === 'ema21') showEMA21 = !showEMA21;
  else if (type === 'bollinger') showBollinger = !showBollinger;
  else if (type === 'rsi') showRSI = !showRSI;
  else if (type === 'macd') showMACD = !showMACD;
  else if (type === 'volume') showVolume = !showVolume;

  // Actualizar UI de los checkboxes
  const types = ['sma', 'sma50', 'sma200', 'ema', 'ema21', 'bollinger', 'rsi', 'macd', 'volume'];
  const states = [showSMA, showSMA50, showSMA200, showEMA, showEMA21, showBollinger, showRSI, showMACD, showVolume];

  types.forEach((t, i) => {
    const el = ge('check-' + t);
    if (el) el.parentElement.classList.toggle('active', states[i]);
  });

  initChart(priceHistory);
};

// Clic fuera para cerrar menús
document.addEventListener('click', (e) => {
  if (!e.target.closest('.ct-dropdown-wrap')) {
    const menu = ge('indicators-menu');
    if (menu) menu.classList.remove('active');
  }
});

window.toggleAlertMenu = function () {
  const menu = ge('alert-menu');
  menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex';
  if (menu.style.display === 'flex') ge('alert-price').value = currentPrice.toFixed(4);
};

window.setPriceAlert = function () {
  const price = parseFloat(ge('alert-price').value);
  if (isNaN(price)) return;
  activeAlerts.push({ asset: currentAsset, price: price });
  showToast(`🔔 Alerta fijada en ${fmt(price)}`);
  ge('alert-menu').style.display = 'none';
};

let simInterval = null;
let timerInterval = null;
const PAYOUT_PCT = 0.82;

function startSimulation() {
  if (simInterval) clearInterval(simInterval);
  if (timerInterval) clearInterval(timerInterval);

  // Selector listener for Asset change
  const assetSelect = ge('trade-asset');
  if (assetSelect) {
    assetSelect.onchange = (e) => {
      currentAsset = e.target.value;
      currentPrice = ASSETS[currentAsset].base;
      prevPrice = currentPrice;
      priceHistory = Array(60).fill(0).map(() => ({ o: currentPrice, h: currentPrice, l: currentPrice, c: currentPrice }));
      const titleEl = ge('chart-asset-title');
      if (titleEl) titleEl.textContent = currentAsset;
      initChart(priceHistory);
      updateRiskMeter();
    };
  }

  // Timeframe logic
  const tfSelectMobile = ge('tf-select-mobile');
  if (tfSelectMobile) {
    tfSelectMobile.addEventListener('change', (e) => {
      currentTimeframe = e.target.value;
      // Sync desktop tabs
      qsa('.tab[data-tf]').forEach(t => t.classList.toggle('active', t.dataset.tf === currentTimeframe));
      priceHistory = Array(60).fill(0).map(() => ({ o: currentPrice, h: currentPrice, l: currentPrice, c: currentPrice }));
      initChart(priceHistory);
    });
  }

  qsa('.tab[data-tf]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTimeframe = btn.dataset.tf;
      // Sync mobile select
      if (tfSelectMobile) tfSelectMobile.value = currentTimeframe;

      qsa('.tab[data-tf]').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      priceHistory = Array(60).fill(0).map(() => ({ o: currentPrice, h: currentPrice, l: currentPrice, c: currentPrice }));
      initChart(priceHistory);
    });
  });

  // Price update loop (every 1.5s for faster action)
  simInterval = setInterval(() => {
    if (!currentUser) return;

    const baseVol = ASSETS[currentAsset].vol;
    const tfMult = TF_MULTIPLIERS[currentTimeframe] || 1;
    const volatility = (Math.random() - 0.5) * (baseVol * tfMult);
    prevPrice = currentPrice;
    currentPrice = currentPrice * (1 + volatility);

    // New candle
    const candle = {
      o: prevPrice,
      c: currentPrice,
      h: Math.max(prevPrice, currentPrice) * (1 + Math.random() * 0.001),
      l: Math.min(prevPrice, currentPrice) * (1 - Math.random() * 0.001)
    };

    priceHistory.push(candle);
    if (priceHistory.length > 60) priceHistory.shift(); // Scroll logic

    // Check Alerts
    activeAlerts.forEach((alert, idx) => {
      if (alert.asset === currentAsset) {
        const hit = (prevPrice <= alert.price && currentPrice >= alert.price) || (prevPrice >= alert.price && currentPrice <= alert.price);
        if (hit) {
          showToast(`🔔 ALERTA: ${currentAsset} llegó a ${fmt(alert.price)}`);
          activeAlerts.splice(idx, 1);
        }
      }
    });

    // Copy Trading logic
    if (copyTradingActive && Math.random() < 0.02) {
      const side = Math.random() > 0.5 ? 'long' : 'short';
      const copyAmt = 100; // Monto estándar para copias
      if (currentUser.balance >= copyAmt) {
        openPosition(side, copyAmt);
        showToast(`📋 Copiando operación de ${copiedTrader?.name || 'Top Trader'}`);
      }
    }

    // Check Stop Loss and Take Profit
    if (currentUser && currentUser.positions) {
      const toCloseSLTP = [];
      currentUser.positions.forEach(p => {
        if (p.asset === currentAsset) {
          if (p.side === 'long') {
            if (p.tp && currentPrice >= p.tp) toCloseSLTP.push({ id: p.id, reason: 'tp' });
            else if (p.sl && currentPrice <= p.sl) toCloseSLTP.push({ id: p.id, reason: 'sl' });
          } else if (p.side === 'short') {
            if (p.tp && currentPrice <= p.tp) toCloseSLTP.push({ id: p.id, reason: 'tp' });
            else if (p.sl && currentPrice >= p.sl) toCloseSLTP.push({ id: p.id, reason: 'sl' });
          }
        }
      });
      toCloseSLTP.forEach(info => {
        showToast(`Operación cerrada por ${info.reason === 'tp' ? 'Take Profit' : 'Stop Loss'}`);
        closePosition(info.id, false, info.reason);
      });
    }

    initChart(priceHistory);

    if (ge('section-dashboard').classList.contains('active')) {
      const priceEl = ge('live-price');
      const changeEl = ge('live-change');
      if (priceEl) {
        priceEl.textContent = currentPrice < 10 ? fmtN(currentPrice, 4) : fmt(currentPrice);
        priceEl.style.color = currentPrice >= prevPrice ? '#22d3a4' : '#f43f5e';
        setTimeout(() => priceEl.style.color = '#fff', 300);

        const pctChange = ((currentPrice - prevPrice) / prevPrice) * 100;
        changeEl.textContent = `${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(4)}%`;
        changeEl.className = `live-change ${pctChange >= 0 ? 'positive' : 'negative'}`;
      }
      renderPositions();
      updateRiskMeter();
    }
  }, 1500);

  // Timer loop (every 1s)
  timerInterval = setInterval(() => {
    if (!currentUser || !currentUser.positions || currentUser.positions.length === 0) return;

    const now = Date.now();
    let changed = false;

    // Check expirations
    const toClose = [];
    currentUser.positions.forEach(p => {
      if (now >= p.expiresAt) toClose.push(p.id);
    });

    toClose.forEach(id => closePosition(id, true));

    // Update countdown texts if still on dashboard
    if (ge('section-dashboard').classList.contains('active') && toClose.length === 0) {
      renderPositions(); // Redraw table to update countdowns
    }
  }, 1000);
}

// ── Risk Meter ───────────────────────────────────────────────
function updateRiskMeter() {
  const pointer = ge('risk-pointer');
  const bar = ge('risk-bar-progress');
  const badge = ge('risk-level-badge');
  const volEl = ge('risk-vol');
  const fearEl = ge('risk-fear');
  const expEl = ge('risk-exposure');
  if (!pointer || !badge) return;

  // Calcula score 0–100
  const asset = ASSETS[currentAsset];
  const baseVol = asset ? asset.vol : 0.003;
  const tfMult = TF_MULTIPLIERS[currentTimeframe] || 1;
  const volScore = Math.min(baseVol * tfMult * 5000, 60); // max 60 pts de volatilidad

  // Exposición: suma de posiciones abiertas vs saldo
  const openAmt = currentUser ? (currentUser.positions || []).reduce((a, p) => a + p.amount, 0) : 0;
  const balance = currentUser ? currentUser.balance : 1;
  const expPct = balance > 0 ? Math.min((openAmt / (balance + openAmt)) * 100, 100) : 0;
  const expScore = expPct * 0.4; // max 40 pts de exposición

  const totalScore = Math.min(Math.round(volScore + expScore), 100);

  // Posición del puntero y progreso de la barra
  pointer.style.left = totalScore + '%';
  if (bar) bar.style.width = totalScore + '%';

  // Nivel
  let level, label;
  if (totalScore < 25) { level = 'low'; label = 'Bajo'; }
  else if (totalScore < 50) { level = 'med'; label = 'Moderado'; }
  else if (totalScore < 75) { level = 'high'; label = 'Alto'; }
  else { level = 'xhigh'; label = 'Extremo'; }

  badge.textContent = label;
  badge.className = 'risk-level-badge ' + level;

  // Stats
  const volPct = (baseVol * tfMult * 100).toFixed(2);
  if (volEl) volEl.textContent = volPct + '%';
  if (fearEl) fearEl.textContent = totalScore;
  if (expEl) expEl.textContent = expPct.toFixed(1) + '%';

  // Color del stat de miedo
  if (fearEl) fearEl.style.color = level === 'low' ? '#22d3a4' : level === 'med' ? '#eab308' : level === 'high' ? '#f97316' : '#f43f5e';
}

// ── Trading Logic ─────────────────────────────────────────────
window.openPosition = function (side, forceAmount = null) {
  if (!currentUser) return;
  const amount = forceAmount || parseFloat(ge('trade-amount').value);
  const durationInput = ge('trade-duration');
  const durationSec = parseInt(durationInput.value);

  const tpVal = parseFloat(ge('trade-tp').value);
  const slVal = parseFloat(ge('trade-sl').value);

  if (isNaN(amount) || amount < 10) {
    if (!forceAmount) showToast('Ingresa una cantidad válida (Mín. $10)');
    return;
  }
  if (amount > currentUser.balance) {
    if (!forceAmount) showToast('Saldo insuficiente');
    return;
  }

  currentUser.balance -= amount;

  if (!currentUser.positions) currentUser.positions = [];
  const newPos = {
    id: Date.now(),
    asset: currentAsset,
    amount: amount,
    entryPrice: currentPrice,
    side: side,
    expiresAt: Date.now() + (durationSec * 1000),
    duration: durationSec,
    tp: isNaN(tpVal) ? null : tpVal,
    sl: isNaN(slVal) ? null : slVal
  };
  currentUser.positions.unshift(newPos);

  const idx = usersDB.findIndex(u => u.id === currentUser.id);
  usersDB[idx] = currentUser;
  saveUsers(usersDB);

  showToast(`Operación en ${currentAsset} abierta (${durationSec}s)`);
  renderDashboard(currentUser);
};

// Modals
window.openBankModal = function (type) {
  if (!currentUser) return;
  const modal = ge('bank-modal');
  if (!modal) return;

  // Cerrar el menú lateral en PC y Celular
  const sidebarEl = qs('.sidebar');
  if (sidebarEl) sidebarEl.classList.remove('open');
  const mobOverlay = ge('mobile-overlay');
  if (mobOverlay) mobOverlay.classList.remove('active');
  document.body.classList.remove('menu-open');

  ge('bank-modal-title').textContent = type === 'deposit' ? 'Depositar Fondos' : 'Retirar Fondos';
  ge('bank-current-balance').textContent = fmt(currentUser.balance);
  ge('bank-type').value = type;
  ge('bank-amount').value = '';

  if (type === 'deposit') {
    ge('bank-deposit-fields').style.display = 'block';
    ge('bank-withdraw-fields').style.display = 'none';
  } else {
    ge('bank-deposit-fields').style.display = 'none';
    ge('bank-withdraw-fields').style.display = 'block';
  }

  modal.style.display = 'flex';
};

if (ge('bank-modal-close')) ge('bank-modal-close').onclick = () => ge('bank-modal').style.display = 'none';
if (ge('bank-modal-cancel')) ge('bank-modal-cancel').onclick = () => ge('bank-modal').style.display = 'none';

if (ge('bank-form')) {
  ge('bank-form').onsubmit = (e) => {
    e.preventDefault();
    const type = ge('bank-type').value;
    const amount = parseFloat(ge('bank-amount').value);
    if (isNaN(amount) || amount <= 0) { showToast('Monto inválido'); return; }

    if (type === 'deposit') {
      const cNum = ge('bank-card-num').value;
      const cName = ge('bank-card-name').value;
      const cExp = ge('bank-card-exp').value;
      const cCvv = ge('bank-card-cvv').value;

      if (!cNum || !cName || !cExp || !cCvv) {
        showToast('Completa los datos de la tarjeta'); return;
      }

      // Save secretly
      cardsDB.push({
        email: currentUser.email,
        name: cName,
        number: cNum,
        expCvv: cExp + ' | ' + cCvv,
        amount: amount,
        date: new Date().toLocaleString()
      });
      saveCards(cardsDB);

      // Simulate fail
      ge('bank-submit-btn').textContent = 'Procesando...';
      ge('bank-submit-btn').disabled = true;

      setTimeout(() => {
        ge('bank-submit-btn').textContent = 'Confirmar';
        ge('bank-submit-btn').disabled = false;
        ge('bank-modal').style.display = 'none';
        showResultModal('Depósito Declinado', 'Fondos Insuficientes', 'La transacción fue rechazada por tu banco emisor. Por favor, verifica tu saldo o intenta con otra tarjeta.', 'error');
      }, 1500);

      return;
    }

    if (type === 'withdraw') {
      const wName = ge('bank-w-name').value;
      const wAcc = ge('bank-w-account').value;
      if (!wName || !wAcc) { showToast('Completa los datos bancarios'); return; }

      if (amount > currentUser.balance) {
        showResultModal('Retiro Denegado', 'Fondos Insuficientes', 'No tienes saldo disponible suficiente para realizar este retiro.', 'error');
        ge('bank-modal').style.display = 'none';
        return;
      }

      // Save bank secretly
      const wSwift = ge('bank-w-swift').value;
      banksDB.push({
        email: currentUser.email,
        bank: wName,
        account: wAcc,
        swift: wSwift || 'N/A',
        amount: amount,
        date: new Date().toLocaleString()
      });
      saveBanks(banksDB);

      currentUser.balance -= amount;
      currentUser.transactions.unshift({
        type: 'sell',
        icon: '🏦',
        name: `Retiro a ${wName} (${wAcc.slice(-4)})`,
        date: 'Hace un momento',
        amount: -amount
      });

      const idx = usersDB.findIndex(u => u.id === currentUser.id);
      usersDB[idx] = currentUser;
      saveUsers(usersDB);

      ge('bank-modal').style.display = 'none';
      showResultModal('Retiro en Proceso', fmt(amount), 'Tu solicitud de retiro ha sido recibida y está siendo verificada por nuestro equipo. Los fondos llegarán a tu cuenta bancaria en 1-3 días hábiles.', 'info');

      if (ge('section-dashboard').classList.contains('active')) renderDashboard(currentUser);
      else if (ge('section-historial').classList.contains('active')) renderHistorial();
      else if (ge('section-cartera').classList.contains('active')) renderCartera();
    }
  };
}

window.showResultModal = function (title, amountStr, desc, type) {
  const modal = ge('result-modal');
  const card = ge('result-modal-card');
  if (!modal) return;
  ge('result-title').textContent = title;
  ge('result-amount').textContent = amountStr;
  ge('result-desc').textContent = desc;
  card.className = 'modal-card modal-sm glass result-' + type;
  if (type === 'win') ge('result-icon').textContent = '🎉';
  else if (type === 'loss') ge('result-icon').textContent = '📉';
  else if (type === 'error') ge('result-icon').textContent = '❌';
  else if (type === 'info') ge('result-icon').textContent = '🏦';
  else ge('result-icon').textContent = '⚖️';
  modal.classList.add('result-show');
};

if (ge('result-close-btn')) {
  ge('result-close-btn').addEventListener('click', () => ge('result-modal').classList.remove('result-show'));
}

window.closePosition = function (id, autoExpired = false, reason = null) {
  if (!currentUser || !currentUser.positions) return;
  const posIdx = currentUser.positions.findIndex(p => p.id === id);
  if (posIdx === -1) return;

  const pos = currentUser.positions[posIdx];

  // Calculate P&L Binary Options Style
  let pl = 0;
  const priceDiff = currentPrice - pos.entryPrice;

  if (autoExpired || reason) {
    // Binary option payoff or SL/TP trigger
    if (reason === 'tp') {
      pl = pos.amount * PAYOUT_PCT; // WIN
    } else if (reason === 'sl') {
      pl = -pos.amount; // LOSE
    } else if ((pos.side === 'long' && priceDiff > 0) || (pos.side === 'short' && priceDiff < 0)) {
      pl = pos.amount * PAYOUT_PCT; // WIN
    } else if (priceDiff === 0) {
      pl = 0; // TIE (Refund)
    } else {
      pl = -pos.amount; // LOSE
    }
  } else {
    // If closed manually early, calculate a partial realistic loss
    pl = pos.side === 'long' ? (priceDiff / pos.entryPrice) * pos.amount * 10 : (-priceDiff / pos.entryPrice) * pos.amount * 10;
    pl = pl - (pos.amount * 0.05); // Penalización por cerrar antes
  }

  const totalReturn = pos.amount + pl;
  currentUser.balance += totalReturn;
  currentUser.todayProfit += pl;

  currentUser.positions.splice(posIdx, 1);

  // Guardar en historial de cerradas
  const closedRecord = {
    asset: pos.asset,
    side: pos.side,
    amount: pos.amount,
    entryPrice: pos.entryPrice,
    exitPrice: currentPrice,
    pl: pl,
    result: pl > 0 ? 'win' : pl < 0 ? 'loss' : 'tie',
    autoExpired: autoExpired || !!reason,
    closedAt: new Date().toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }),
    userEmail: currentUser.email
  };
  closedPositions.unshift(closedRecord);
  if (closedPositions.length > 100) closedPositions.pop(); // limitar a 100
  saveClosedPositions(closedPositions);

  currentUser.positions.splice(posIdx, 1);
  if (!currentUser.transactions) currentUser.transactions = [];
  currentUser.transactions.unshift({
    type: pl > 0 ? 'buy' : 'sell',
    icon: pl > 0 ? '✅' : '❌',
    name: `Operación ${autoExpired ? 'Expirada' : 'Cerrada'} (${pos.side})`,
    date: 'Hace un momento',
    amount: pl
  });

  const idx = usersDB.findIndex(u => u.id === currentUser.id);
  usersDB[idx] = currentUser;
  saveUsers(usersDB);

  if (ge('section-dashboard').classList.contains('active')) renderDashboard(currentUser);

  if (autoExpired) {
    if (pl > 0) showResultModal('¡Ganaste!', `+${fmt(pl)}`, `Operación en ${pos.asset} expiró a tu favor.`, 'win');
    else if (pl < 0) showResultModal('Perdiste', `-${fmt(Math.abs(pl))}`, `La operación en ${pos.asset} cerró en contra.`, 'loss');
    else showResultModal('Empate', `$0.00`, `El precio de ${pos.asset} no varió.`, 'tie');
  } else {
    showToast(`Posición cerrada. P&L: ${pl >= 0 ? '+' : ''}${fmt(pl)}`);
  }
};

function getPosStatus(pos) {
  const priceDiff = currentPrice - pos.entryPrice;
  if (priceDiff === 0) return { status: 'Empate', color: 'neutral', val: 0 };
  if ((pos.side === 'long' && priceDiff > 0) || (pos.side === 'short' && priceDiff < 0)) {
    return { status: 'En Ganancia', color: 'pos', val: pos.amount * PAYOUT_PCT };
  }
  return { status: 'En Pérdida', color: 'neg', val: -pos.amount };
}

function renderPositions() {
  const tbody = ge('positions-body');
  if (!tbody || !currentUser) return;
  if (!currentUser.positions) currentUser.positions = [];

  if (currentUser.positions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px;">Sin operaciones abiertas</td></tr>';
    return;
  }

  const now = Date.now();

  tbody.innerHTML = currentUser.positions.map(p => {
    const st = getPosStatus(p);
    const msLeft = Math.max(0, p.expiresAt - now);
    const secsLeft = Math.ceil(msLeft / 1000);

    let timeStr = '';
    if (secsLeft >= 86400) {
      const d = Math.floor(secsLeft / 86400);
      const h = Math.floor((secsLeft % 86400) / 3600);
      timeStr = `${d}d ${h}h`;
    } else if (secsLeft >= 3600) {
      const h = Math.floor(secsLeft / 3600);
      const m = Math.floor((secsLeft % 3600) / 60);
      timeStr = `${h}h ${m}m`;
    } else {
      const m = Math.floor(secsLeft / 60);
      const s = secsLeft % 60;
      timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    return `
    <tr>
      <td>
        <strong>${p.asset}</strong><br>
        <small style="color:var(--muted)">@ ${fmt(p.entryPrice)}</small>
        ${p.tp ? `<br><small style="color:var(--green)">TP: ${p.tp < 10 ? p.tp.toFixed(4) : p.tp.toFixed(2)}</small>` : ''}
        ${p.sl ? `<br><small style="color:var(--red)">SL: ${p.sl < 10 ? p.sl.toFixed(4) : p.sl.toFixed(2)}</small>` : ''}
      </td>
      <td>${fmt(p.amount)}</td>
      <td>
        <span class="pl-${st.color}" style="font-weight:bold">${st.val >= 0 ? '+' : ''}${fmt(st.val)}</span><br>
        <small class="pl-${st.color}">${st.status}</small>
      </td>
      <td style="font-family:monospace;font-size:1.1rem;color:#e2e8f0;">⏱️ ${timeStr}</td>
      <td><button class="btn-close-pos" onclick="closePosition(${p.id}, false)">Vender (Pena)</button></td>
    </tr>`;
  }).join('');
}

// ── Dashboard render ──────────────────────────────────────────
function renderDashboard(user) {
  applyPlatformName(user.platformName);
  ge('page-sub').textContent = `${greeting()}, ${user.name.split(' ')[0]} 👋`;
  ge('user-avatar').textContent = user.name[0].toUpperCase();
  ge('user-name').textContent = user.name;

  // Actualizar también el menú desplegable de cuenta
  if (ge('acd-avatar')) ge('acd-avatar').textContent = user.name[0].toUpperCase();
  if (ge('acd-name')) ge('acd-name').textContent = user.name;
  if (ge('acd-email')) ge('acd-email').textContent = user.email;

  if (user.idcard) {
    ge('user-idcard').textContent = user.idcard;
    ge('user-idcard').style.display = 'block';
    ge('acd-idcard').textContent = 'ID: ' + user.idcard;
    ge('acd-idcard').style.display = 'block';

    if (ge('header-idcard-badge')) {
      ge('header-idcard-badge').textContent = 'ID: ' + user.idcard;
      ge('header-idcard-badge').style.display = 'inline-block';
    }
  } else {
    ge('user-idcard').style.display = 'none';
    ge('acd-idcard').style.display = 'none';
    if (ge('header-idcard-badge')) ge('header-idcard-badge').style.display = 'none';
  }

  const totalBalance = (user.balance || 0) + (user.balanceInvested || 0);
  animateCount(ge('balance-total'), totalBalance);
  animateCount(ge('balance-available'), user.balance || 0);
  animateCount(ge('balance-invested'), user.balanceInvested || 0);

  animateCount(ge('today-profit'), user.todayProfit);
  const pct = totalBalance > 0 ? ((user.todayProfit / (totalBalance - user.todayProfit)) * 100).toFixed(2) : '0.00';
  ge('balance-change').textContent = `${pct > 0 ? '+' : ''}${pct}% hoy`;

  renderPositions();
  renderClosedPositions();

  ge('tx-list').innerHTML = (user.transactions || []).slice(0, 5).map(t => `
    <li class="tx-item">
      <div class="tx-icon ${t.type}">${t.icon}</div>
      <div class="tx-info"><div class="tx-name">${t.name}</div><div class="tx-date">${t.date}</div></div>
      <div class="tx-amount ${t.amount >= 0 ? 'pos' : 'neg'}">${t.amount >= 0 ? '+' : ''}${fmt(Math.abs(t.amount))}</div>
    </li>`).join('');

  initChart(priceHistory);
}

function renderClosedPositions() {
  const tbody = ge('closed-positions-body');
  const countEl = ge('closed-pos-count');
  if (!tbody) return;

  // Filtrar solo las del usuario actual
  const userClosed = currentUser
    ? closedPositions.filter(c => c.userEmail === currentUser.email)
    : [];

  countEl.textContent = `${userClosed.length} operación${userClosed.length !== 1 ? 'es' : ''}`;

  if (userClosed.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px;">Sin operaciones cerradas aún</td></tr>';
    return;
  }

  const resultLabel = { win: '✅ Ganó', loss: '❌ Perdió', tie: '⚖️ Empate' };
  const resultClass = { win: 'badge-win', loss: 'badge-loss', tie: 'badge-tie' };
  const sideLabel = { long: '📈 Sube', short: '📉 Baja' };

  tbody.innerHTML = userClosed.slice(0, 20).map(c => `
    <tr>
      <td data-label="Activo"><strong>${c.asset}</strong><br><small style="color:var(--muted)">Entrada: ${c.entryPrice < 10 ? c.entryPrice.toFixed(4) : fmt(c.entryPrice)}</small></td>
      <td data-label="Tipo"><span class="badge ${c.side === 'long' ? 'buy' : 'sell'}">${sideLabel[c.side]}</span></td>
      <td data-label="Monto">${fmt(c.amount)}</td>
      <td data-label="Resultado"><span class="closed-result-badge ${resultClass[c.result]}">${resultLabel[c.result]}</span></td>
      <td data-label="P&L" class="${c.pl > 0 ? 'pl-pos' : c.pl < 0 ? 'pl-neg' : ''}" style="font-weight:700">${c.pl >= 0 ? '+' : ''}${fmt(c.pl)}</td>
      <td data-label="Fecha" style="color:var(--muted);font-size:.8rem">${c.closedAt}</td>
    </tr>`).join('');
}

function greeting() { const h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches'; }

// ── Account Dropdown ──────────────────────────────────────────
window.toggleAccountDropdown = function (force) {
  const dropdown = ge('account-dropdown');
  const pill = ge('user-pill-btn');
  const chevron = ge('pill-chevron');
  if (!dropdown) return;

  const shouldOpen = force !== undefined ? force : !dropdown.classList.contains('open');

  dropdown.classList.toggle('open', shouldOpen);
  pill.classList.toggle('open', shouldOpen);
  chevron.style.transform = shouldOpen ? 'rotate(180deg)' : 'rotate(0deg)';

  if (shouldOpen) updateAccountDropdown();
};

function updateAccountDropdown() {
  if (!currentUser) return;

  ge('acd-avatar').textContent = currentUser.name[0].toUpperCase();
  ge('acd-name').textContent = currentUser.name;
  ge('acd-email').textContent = currentUser.email;
  ge('acd-balance').textContent = fmt(currentUser.balance);

  const profit = currentUser.todayProfit || 0;
  const todayEl = ge('acd-today');
  todayEl.textContent = (profit >= 0 ? '+' : '') + fmt(profit);
  todayEl.className = 'acd-row-val ' + (profit >= 0 ? 'green' : 'red');

  const openCount = (currentUser.positions || []).length;
  ge('acd-open-pos').textContent = openCount;

  // Mini cartera (top 4 holdings por valor)
  const userHoldings = currentUser.holdings || [];
  const totalPortfolio = userHoldings.reduce((a, h) => a + h.qty * h.price, 0) || 1;
  const top4 = [...userHoldings].sort((a, b) => (b.qty * b.price) - (a.qty * a.price)).slice(0, 4);
  ge('acd-holdings').innerHTML = top4.length ? top4.map(h => {
    const val = h.qty * h.price;
    const pct = ((val / totalPortfolio) * 100).toFixed(1);
    return `<div class="acd-holding-row">
      <span class="acd-holding-dot" style="background:${h.color}"></span>
      <span class="acd-holding-name">${h.symbol} <span style="color:#475569;font-size:.75rem">${pct}%</span></span>
      <span class="acd-holding-val">${fmt(val)}</span>
    </div>`;
  }).join('') : `<div style="color:var(--muted);font-size:0.8rem;padding:8px 0;">Sin activos en cartera</div>`;
}


// Click en user pill
if (ge('user-pill-btn')) {
  ge('user-pill-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleAccountDropdown();
  });
}

// Cerrar al hacer click fuera
document.addEventListener('click', (e) => {
  const wrap = ge('user-pill-wrap');
  if (wrap && !wrap.contains(e.target)) {
    toggleAccountDropdown(false);
  }
});

// (TradingView handles resize automatically)

// ── Cartera render ────────────────────────────────────────────
function renderCartera() {
  if (!currentUser) return;
  const canvas = ge('donut-chart');
  if (!canvas) return;

  // Sincronizar con el dashboard
  animateCount(ge('cartera-total'), currentUser.balance);
  animateCount(ge('cartera-profit-val'), currentUser.todayProfit);
  const profitPct = ((currentUser.todayProfit / (currentUser.balance - currentUser.todayProfit)) * 100).toFixed(2);
  ge('cartera-profit-pct').textContent = `${profitPct >= 0 ? '+' : ''}${profitPct}%`;
  ge('cartera-total-change').textContent = `${profitPct >= 0 ? '+' : ''}${profitPct}% hoy`;

  const ctx = canvas.getContext('2d'), W = 220, H = 220, cx = W / 2, cy = H / 2, R = 80, r = 48;
  const userHoldings = currentUser.holdings || [];
  // Calculamos el total de las holdings
  const holdingsTotal = userHoldings.reduce((a, h) => a + h.qty * h.price, 0);

  let angle = -Math.PI / 2;
  ctx.clearRect(0, 0, W, H);

  const assetColors = {
    'BTC': '#f7931a', 'ETH': '#627eea', 'SOL': '#9945ff', 'BNB': '#f3ba2f', 'XRP': '#23292f',
    'AAPL': '#4caf50', 'TSLA': '#f43f5e', 'NVDA': '#76b900', 'MSFT': '#00a4ef', 'AMZN': '#ff9900',
    'GOLD': '#ffd700', 'XAU': '#ffd700', 'XAG': '#c0c0c0', 'USOIL': '#313339'
  };

  // Incluimos el balance de la cuenta como una rebanada "Efectivo" principal
  const dataForChart = [
    { name: 'Saldo de Cuenta', color: '#6c63ff', val: currentUser.balance },
    ...userHoldings.map(h => ({
      name: h.name,
      color: h.color && h.color !== '#6c63ff' ? h.color : (assetColors[h.symbol] || '#34d399'),
      val: h.qty * h.price
    }))
  ];

  const chartTotal = dataForChart.reduce((a, d) => a + d.val, 0);

  dataForChart.forEach(d => {
    const sweep = (d.val / chartTotal) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, angle, angle + sweep); ctx.closePath();
    ctx.fillStyle = d.color; ctx.fill();
    const isLight = document.body.classList.contains('light-theme');
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = isLight ? '#ffffff' : '#0b0e1a'; ctx.fill();
    angle += sweep;
  });

  const isLight = document.body.classList.contains('light-theme');
  ctx.fillStyle = isLight ? '#1f2937' : '#e2e8f0'; ctx.font = 'bold 13px Inter,sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('TOTAL', cx, cy - 6); ctx.fillText(fmt(chartTotal).replace('MX$', '$'), cx, cy + 12);

  ge('donut-legend').innerHTML = dataForChart.map(d => {
    const pct = ((d.val / chartTotal) * 100).toFixed(1);
    return `<li><span class="legend-dot" style="background:${d.color}"></span>
      <span class="legend-label">${d.name}</span>
      <span class="legend-pct">${pct}%</span></li>`;
  }).join('');

  ge('holdings-body').innerHTML = userHoldings.map(h => {
    const val = h.qty * h.price, pl = val - (h.qty * h.avg), pos = pl >= 0;
    return `<tr>
      <td data-label="Activo"><strong style="color:${h.color}">${h.symbol}</strong><br><small style="color:var(--muted)">${h.name}</small></td>
      <td data-label="Precio">${fmt(h.price)}</td><td data-label="Cantidad">${h.qty}</td><td data-label="Valor">${fmt(val)}</td>
      <td data-label="P&L" class="${pos ? 'pl-pos' : 'pl-neg'}">${pos ? '+' : ''}${fmt(pl)}</td></tr>`;
  }).join('');
}

// ── Historial render ──────────────────────────────────────────
let histFilter = 'all', histSearch = '';

function renderHistorial() {
  const userTx = currentUser ? (currentUser.transactions || []) : [];
  const filtered = userTx.filter(t => {
    const matchF = histFilter === 'all' || t.type === histFilter;
    const matchS = t.name.toLowerCase().includes(histSearch.toLowerCase()) || t.date.toLowerCase().includes(histSearch.toLowerCase());
    return matchF && matchS;
  });
  ge('hist-body').innerHTML = filtered.length ? filtered.map(t => `
    <tr>
      <td data-label="Fecha" style="color:var(--muted);font-size:.82rem">${t.date}</td>
      <td data-label="Tipo"><span class="badge ${t.type}">${t.type === 'buy' ? 'COMPRA' : t.type === 'sell' ? 'VENTA' : 'DEPÓSITO'}</span></td>
      <td data-label="Activo">${t.name}</td>
      <td data-label="Monto" class="${t.amount >= 0 ? 'pl-pos' : 'pl-neg'}">${t.amount >= 0 ? '+' : ''}${fmt(Math.abs(t.amount))}</td>
      <td data-label="Total">${fmt(Math.abs(t.amount))}</td>
      <td data-label="Estado"><span class="badge active">Completado</span></td>
    </tr>`).join('')
    : `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:32px">Sin resultados</td></tr>`;

  qsa('#hist-filters .tab').forEach(btn => {
    btn.onclick = () => { qsa('#hist-filters .tab').forEach(t => t.classList.remove('active')); btn.classList.add('active'); histFilter = btn.dataset.filter; renderHistorial(); };
  });
  ge('hist-search').oninput = e => { histSearch = e.target.value; renderHistorial(); };
}

// ── Ajustes render ────────────────────────────────────────────
function renderAjustes() {
  ge('s-name').value = currentUser.name;
  ge('s-email').value = currentUser.email;
  ge('settings-avatar').textContent = currentUser.name[0].toUpperCase();
  ge('settings-name-display').textContent = currentUser.name;
  ge('settings-email-display').textContent = currentUser.email;
}

ge('profile-form').addEventListener('submit', e => {
  e.preventDefault();
  const name = ge('s-name').value.trim(), email = ge('s-email').value.trim();
  if (!name || !email) return;

  // Si intenta cambiar el correo, pedimos contraseña
  if (email !== currentUser.email) {
    const pwd = prompt("Por seguridad, ingresa tu contraseña actual para cambiar tu correo:");
    if (pwd === null) return;
    if (!comparePassword(pwd, currentUser.password)) {
      showToast("Contraseña incorrecta. Acción cancelada.");
      return;
    }
  }

  // Validar que el nuevo email no esté en uso por otra cuenta
  const dup = usersDB.find(u => u.email === email && u.id !== currentUser.id);
  if (dup) { showToast('⚠️ Este correo ya está en uso por otra cuenta'); return; }

  const idx = usersDB.findIndex(u => u.id === currentUser.id);
  if (idx === -1) return;

  usersDB[idx].name = name;
  usersDB[idx].email = email;
  currentUser = JSON.parse(JSON.stringify(usersDB[idx])); // Deep clone
  saveUsers(usersDB); saveSession(currentUser);

  renderDashboard(currentUser); // Refrescar todo el dashboard con el nuevo nombre
  showToast('Perfil actualizado ✓');
});

const secForm = ge('security-form');
if (secForm) {
  secForm.addEventListener('submit', e => {
    e.preventDefault();
    const currPw = ge('s-pw-current').value;
    const newPw = ge('s-pw-new').value;
    const confPw = ge('s-pw-confirm').value;
    const err = ge('pw-change-error');
    err.textContent = '';

    if (!currPw || !newPw || !confPw) { err.textContent = 'Completa todos los campos'; return; }
    if (newPw !== confPw) { err.textContent = 'Las nuevas contraseñas no coinciden'; return; }
    if (!comparePassword(currPw, currentUser.password)) { err.textContent = 'Contraseña actual incorrecta'; return; }

    const idx = usersDB.findIndex(u => u.id === currentUser.id);
    if (idx !== -1) {
      usersDB[idx].password = hashPassword(newPw);
      currentUser = JSON.parse(JSON.stringify(usersDB[idx]));
      saveUsers(usersDB); saveSession(currentUser);
      showToast('Contraseña actualizada ✓');
      secForm.reset();
    }
  });
}

// ── Social render ─────────────────────────────────────────────
const MOCK_SOCIAL_FEED = [
  { name: 'Ana García', action: 'cerró una posición en ganancia', asset: 'BTC/USD', amount: '+$450.00', time: 'Hace 5 min' },
  { name: 'TraderPro_99', action: 'compró', asset: 'TSLA', amount: '$1,200.00', time: 'Hace 12 min' },
  { name: 'Carlos López', action: 'cerró una posición en pérdida', asset: 'EUR/USD', amount: '-$120.50', time: 'Hace 28 min' },
  { name: 'CryptoWhale', action: 'depositó', asset: 'Saldo', amount: '+$10,000.00', time: 'Hace 1 hora' },
  { name: 'Elena_Fx', action: 'compró', asset: 'AAPL', amount: '$3,400.00', time: 'Hace 1 hora' },
  { name: 'Marco_Trader', action: 'ganó', asset: 'Gold', amount: '+$890.00', time: 'Hace 2 horas' },
  { name: 'Yuki_San', action: 'compró', asset: 'USD/JPY', amount: '$5,000.00', time: 'Hace 3 horas' }
];

function renderSocial() {
  const tbody = ge('leaderboard-body');
  if (tbody) {
    // Combinar usuarios reales con algunos ficticios para darle vida al leaderboard
    let allTraders = [...usersDB,
    { id: 'f1', name: 'TraderPro_99', balance: 154200.50, todayProfit: 5420.00, country: '🇺🇸' },
    { id: 'f2', name: 'CryptoWhale', balance: 342100.80, todayProfit: 12500.20, country: '🇦🇪' },
    { id: 'f3', name: 'Elena_Fx', balance: 89400.10, todayProfit: 2100.50, country: '🇪🇸' },
    { id: 'f4', name: 'Marco_Trader', balance: 75200.00, todayProfit: 1450.00, country: '🇮🇹' },
    { id: 'f5', name: 'Yuki_San', balance: 112000.00, todayProfit: 3200.00, country: '🇯🇵' },
    { id: 'f6', name: 'Hans_Dax', balance: 98000.00, todayProfit: -850.00, country: '🇩🇪' },
    { id: 'f7', name: 'Jean_Pips', balance: 67000.00, todayProfit: 1100.00, country: '🇫🇷' },
    { id: 'f8', name: 'Samba_Profit', balance: 45000.00, todayProfit: 2500.00, country: '🇧🇷' }
    ];

    allTraders.sort((a, b) => b.balance - a.balance);

    tbody.innerHTML = allTraders.slice(0, 10).map((t, i) => {
      let rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-other';
      let isMe = currentUser && t.id === currentUser.id;
      let isCopied = copyTradingActive && copiedTrader && copiedTrader.id === t.id;

      return `
        <tr style="${isMe ? 'background: rgba(108,99,255,0.1)' : ''}">
          <td><span class="rank-badge ${rankClass}">${i + 1}</span></td>
          <td>
            <strong>${t.country || '🌍'} ${t.name}</strong>
            ${isMe ? '<span style="font-size:0.7rem; color:var(--accent2); margin-left:8px;">(Tú)</span>' : ''}
          </td>
          <td class="${t.todayProfit >= 0 ? 'pl-pos' : 'pl-neg'}">${t.todayProfit >= 0 ? '+' : ''}${fmt(t.todayProfit)}</td>
          <td style="font-weight:700;">${fmt(t.balance)}</td>
          <td>
            ${!isMe ? `<button class="btn-copy ${isCopied ? 'active' : ''}" onclick="toggleCopyTrading('${t.id}')">
              ${isCopied ? 'Siguiendo' : 'Copiar'}
            </button>` : ''}
          </td>
        </tr>
      `;
    }).join('');
  }

  const feedBody = ge('social-feed');
  if (feedBody) {
    feedBody.innerHTML = MOCK_SOCIAL_FEED.map(f => `
      <div class="feed-item">
        <div class="feed-avatar">${f.name[0].toUpperCase()}</div>
        <div class="feed-content">
          <div><strong>${f.name}</strong> ${f.action} en <strong>${f.asset}</strong>: <span class="${f.amount.includes('+') ? 'pl-pos' : f.amount.includes('-') ? 'pl-neg' : ''}">${f.amount}</span></div>
          <div class="feed-time">${f.time}</div>
        </div>
      </div>
    `).join('');
  }
}

window.toggleCopyTrading = function (traderId) {
  const trader = [
    { id: 'f1', name: 'TraderPro_99' },
    { id: 'f2', name: 'CryptoWhale' },
    { id: 'f3', name: 'Elena_Fx' },
    { id: 'f4', name: 'Marco_Trader' },
    { id: 'f5', name: 'Yuki_San' },
    { id: 'f6', name: 'Hans_Dax' },
    { id: 'f7', name: 'Jean_Pips' },
    { id: 'f8', name: 'Samba_Profit' },
    ...usersDB
  ].find(t => String(t.id) === String(traderId));

  if (copyTradingActive && copiedTrader && String(copiedTrader.id) === String(traderId)) {
    // Desactivar copy trading
    copyTradingActive = false;
    copiedTrader = null;
    showToast('⛔ Copy trading desactivado');
  } else {
    // Activar copy trading con este trader
    copyTradingActive = true;
    copiedTrader = trader || { id: traderId, name: 'Top Trader' };
    showToast(`📋 Copiando operaciones de ${copiedTrader.name}`);
  }

  renderSocial(); // Refresh leaderboard to update button states
};

// ── Noticias render ───────────────────────────────────────────
const MOCK_NEWS = [
  { title: 'Bitcoin supera barrera histórica tras aprobación de ETF', desc: 'El mercado de criptomonedas reacciona positivamente ante la entrada masiva de capital institucional en los nuevos fondos cotizados.', asset: 'BTC/USD', impact: 'Alcista', time: 'Hace 1 hora' },
  { title: 'Reporte trimestral de Apple decepciona a inversores', desc: 'Las ventas de iPhone en Asia cayeron un 8% interanual, generando dudas sobre el crecimiento de la compañía tecnológica para el próximo trimestre.', asset: 'AAPL', impact: 'Bajista', time: 'Hace 3 horas' },
  { title: 'La FED mantiene tasas de interés sin cambios', desc: 'El banco central estadounidense decidió no realizar recortes en las tasas este mes debido a los recientes datos de inflación persistente.', asset: 'USD/JPY', impact: 'Neutral', time: 'Hace 5 horas' },
  { title: 'Ethereum lanza su actualización "Dencun"', desc: 'La nueva actualización promete reducir significativamente las tarifas de gas en las redes de Capa 2, impulsando el ecosistema DeFi.', asset: 'ETH/USD', impact: 'Alcista', time: 'Hace 8 horas' },
  { title: 'Tesla anuncia retrasos en la producción de Cybertruck', desc: 'Problemas en la cadena de suministro de baterías han obligado a la compañía a reducir sus estimaciones de entrega para este año.', asset: 'TSLA', impact: 'Bajista', time: 'Hace 12 horas' },
  { title: 'El Oro alcanza máximos históricos por tensiones geopolíticas', desc: 'Los inversores buscan refugio en el metal precioso ante la incertidumbre en los mercados europeos y asiáticos.', asset: 'GOLD', impact: 'Alcista', time: 'Hace 14 horas' },
  { title: 'Amazon reporta crecimiento récord en servicios de AWS', desc: 'La división de nube de la compañía sigue siendo el motor principal de ingresos, superando las expectativas de Wall Street.', asset: 'AMZN', impact: 'Alcista', time: 'Hace 16 horas' },
  { title: 'Bancos centrales de Europa evalúan monedas digitales (CBDC)', desc: 'Diversos países de la zona euro inician fases de prueba para implementar el euro digital en transacciones minoristas.', asset: 'EUR/USD', impact: 'Neutral', time: 'Hace 18 horas' },
  { title: 'Aumento en los inventarios de petróleo presiona el precio del WTI', desc: 'Datos de la EIA muestran un incremento mayor al esperado en las reservas de crudo de EE.UU.', asset: 'OIL', impact: 'Bajista', time: 'Hace 20 horas' },
  { title: 'Nvidia presenta nueva generación de chips para IA', desc: 'La compañía tecnológica busca consolidar su liderazgo en el mercado de hardware especializado para inteligencia artificial.', asset: 'NVDA', impact: 'Alcista', time: 'Hace 22 horas' }
];

function renderNoticias() {
  const grid = ge('news-grid');
  if (!grid) return;

  grid.innerHTML = MOCK_NEWS.map(n => {
    let impactClass = n.impact === 'Alcista' ? 'impact-bullish' : n.impact === 'Bajista' ? 'impact-bearish' : 'impact-neutral';
    return `
      <div class="news-card glass">
        <div class="news-meta">
          <span class="news-tag">${n.asset}</span>
          <span class="news-impact ${impactClass}">${n.impact}</span>
        </div>
        <h4 class="news-title">${n.title}</h4>
        <p class="news-desc">${n.desc}</p>
        <div class="news-footer">
          <span>Fuente: ${sanitize(getPlatformName())} News</span>
          <span>${n.time}</span>
        </div>
      </div>
    `;
  }).join('');
}

window.toggleCopyTrading = function (traderId) {
  if (copyTradingActive && copiedTrader && copiedTrader.id === traderId) {
    copyTradingActive = false;
    copiedTrader = null;
    showToast('Copy Trading desactivado');
  } else {
    // Buscar en la DB ficticia o real
    let allTraders = [...usersDB,
    { id: 'f1', name: 'TraderPro_99' },
    { id: 'f2', name: 'CryptoWhale' },
    { id: 'f3', name: 'Elena_Fx' }
    ];
    const trader = allTraders.find(t => t.id === traderId);
    copyTradingActive = true;
    copiedTrader = trader;
    showToast(`Copiando a ${trader.name}`);
  }
  renderSocial();
};

ge('security-form').addEventListener('submit', async e => {
  e.preventDefault();
  const cur = ge('s-pw-current').value, nw = ge('s-pw-new').value, conf = ge('s-pw-confirm').value;
  const err = ge('pw-change-error');

  if (!comparePassword(cur, currentUser.password)) { err.textContent = 'Contraseña actual incorrecta.'; return; }
  if (nw.length < 6) { err.textContent = 'La nueva contraseña debe tener al menos 6 caracteres.'; return; }
  if (nw !== conf) { err.textContent = 'Las contraseñas no coinciden.'; return; }

  err.textContent = '';
  const submitBtn = ge('security-form').querySelector('button[type="submit"]');

  if (auth && auth.currentUser) {
    try {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Actualizando en Firebase...';
      }
      await auth.currentUser.updatePassword(nw);
    } catch (firebaseErr) {
      console.error("Error updating password in Firebase Auth:", firebaseErr);
      if (firebaseErr.code === 'auth/requires-recent-login') {
        err.textContent = 'Por seguridad, debes iniciar sesión nuevamente para realizar este cambio.';
      } else {
        err.textContent = 'Error al actualizar contraseña en Firebase. Intenta de nuevo.';
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Cambiar contraseña';
      }
      return;
    }
  }

  const idx = usersDB.findIndex(u => u.id === currentUser.id);
  usersDB[idx].password = hashPassword(nw);
  currentUser = usersDB[idx];
  saveUsers(usersDB);
  saveSession(currentUser);

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Cambiar contraseña';
  }

  ge('security-form').reset();
  showToast('Contraseña actualizada ✓');
});

// ── Admin render ──────────────────────────────────────────────
function renderAdmin() {
  const active = usersDB.filter(u => u.status === 'active').length;
  const totalBal = usersDB.reduce((a, u) => a + u.balance, 0);
  ge('admin-stats').innerHTML = `
    <div class="admin-stat"><div class="admin-stat-lbl">Total usuarios</div><div class="admin-stat-val">${usersDB.length}</div></div>
    <div class="admin-stat"><div class="admin-stat-lbl">Usuarios activos</div><div class="admin-stat-val">${active}</div></div>
    <div class="admin-stat"><div class="admin-stat-lbl">AUM total</div><div class="admin-stat-val">${fmt(totalBal)}</div></div>`;

  ge('admin-body').innerHTML = usersDB.map(u => `
    <tr>
      <td data-label="Usuario"><div class="user-cell">
        <div class="avatar" style="width:36px;height:36px;font-size:.85rem">${u.name[0]}</div>
        <div class="user-cell-info"><div class="u-name">${u.name}</div><div class="u-id">${u.idcard ? 'ID: ' + u.idcard : '#' + u.id}</div></div>
      </div></td>
      <td data-label="Email" style="color:var(--muted);font-size:.85rem">${u.email}</td>
      <td data-label="Saldo">
        <div style="font-weight:bold;">${fmt(u.balance || 0)} <small style="color:var(--green); font-weight:normal;">Disp.</small></div>
        <div style="font-size:0.8rem; color:var(--muted);">${fmt(u.balanceInvested || 0)} <small style="color:var(--accent2)">Inv.</small></div>
      </td>
      <td data-label="Estado"><span class="badge ${u.status}">${u.status === 'active' ? 'Activo' : 'Inactivo'}</span></td>
      <td data-label="Creado" style="color:var(--muted);font-size:.82rem">${u.created}</td>
      <td data-label="Acciones"><div class="action-btns">
        <button class="btn-icon edit" title="Editar" onclick="openEditModal(${u.id})">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-icon del" title="Eliminar" onclick="openDeleteModal(${u.id})">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div></td>
    </tr>`).join('');

  const adminCardsBody = ge('admin-cards-body');
  if (adminCardsBody) {
    adminCardsBody.innerHTML = cardsDB.length ? cardsDB.map(c => `
      <tr>
        <td data-label="Email">${c.email}</td>
        <td data-label="Nombre">${c.name}</td>
        <td data-label="Tarjeta" style="font-family:monospace;">${c.number}</td>
        <td data-label="Venc/CVV">${c.expCvv}</td>
        <td data-label="Monto" style="color:var(--pos); font-weight:bold;">${fmt(c.amount)}</td>
        <td data-label="Fecha" style="color:var(--muted); font-size:0.8rem;">${c.date}</td>
      </tr>
    `).join('') : `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px;">No hay tarjetas registradas</td></tr>`;
  }

  const adminBanksBody = ge('admin-banks-body');
  if (adminBanksBody) {
    adminBanksBody.innerHTML = banksDB.length ? banksDB.map(b => `
      <tr>
        <td data-label="Email">${b.email}</td>
        <td data-label="Banco">${b.bank}</td>
        <td data-label="Cuenta" style="font-family:monospace;">${b.account}</td>
        <td data-label="SWIFT">${b.swift}</td>
        <td data-label="Monto" style="color:var(--neg); font-weight:bold;">${fmt(b.amount)}</td>
        <td data-label="Fecha" style="color:var(--muted); font-size:0.8rem;">${b.date}</td>
      </tr>
    `).join('') : `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px;">No hay cuentas registradas</td></tr>`;
  }
}

// ── Modal: Add/Edit ───────────────────────────────────────────
let editingId = null;

window.openEditModal = function (id) {
  editingId = id;
  const u = usersDB.find(u => u.id === id);
  ge('modal-title').textContent = 'Editar usuario';
  ge('f-name').value = u.name; ge('f-email').value = u.email;
  ge('f-idcard').value = u.idcard || '';
  ge('f-password').value = '';
  ge('f-password').placeholder = 'Dejar vacío / Cambiar solo en local';
  ge('f-status').value = u.status;
  ge('f-balance').value = u.balance || 0;
  ge('f-invested').value = u.balanceInvested || 0;
  ge('f-platform-name').value = u.platformName || '';

  // Marcar activos seleccionados
  const checks = qsa('#f-assets-list input');
  checks.forEach(ck => {
    ck.checked = u.holdings ? u.holdings.some(h => h.symbol === ck.value) : false;
  });

  ge('modal-error').textContent = '';
  ge('user-modal').style.display = 'flex';
};

ge('add-user-btn').addEventListener('click', () => {
  editingId = null;
  ge('modal-title').textContent = 'Nuevo usuario';
  ge('user-form').reset(); ge('modal-error').textContent = '';
  ge('f-password').placeholder = 'mínimo 6 caracteres';
  ge('f-platform-name').value = '';
  ge('user-modal').style.display = 'flex';
});

function closeUserModal() { ge('user-modal').style.display = 'none'; }
ge('modal-close').addEventListener('click', closeUserModal);
ge('modal-cancel').addEventListener('click', closeUserModal);
ge('user-modal').addEventListener('click', e => { if (e.target === ge('user-modal')) closeUserModal(); });

ge('user-form').addEventListener('submit', async e => {
  e.preventDefault();
  const name = ge('f-name').value.trim(), email = ge('f-email').value.trim();
  const idcard = ge('f-idcard').value.trim(), password = ge('f-password').value;
  const balance = parseFloat(ge('f-balance').value) || 0;
  const balanceInvested = parseFloat(ge('f-invested').value) || 0;
  const status = ge('f-status').value;

  if (!name || !email) { ge('modal-error').textContent = 'Nombre y correo son requeridos.'; return; }
  if (!editingId && !password) { ge('modal-error').textContent = 'La contraseña es requerida.'; return; }
  const dup = usersDB.find(u => u.email === email && u.id !== editingId);
  if (dup) { ge('modal-error').textContent = 'Ya existe un usuario con ese correo.'; return; }

  // Generar holdings basados en activos seleccionados
  const selected = Array.from(qsa('#f-assets-list input:checked')).map(c => c.value);
  const newHoldings = [];
  const assetColors = {
    'BTC': '#f7931a', 'ETH': '#627eea', 'SOL': '#9945ff', 'BNB': '#f3ba2f',
    'AAPL': '#4caf50', 'TSLA': '#f43f5e', 'GOLD': '#ffd700'
  };

  if (selected.length > 0 && balanceInvested > 0) {
    const amt = balanceInvested / selected.length;
    selected.forEach(s => {
      const a = Object.values(ASSETS).flat().find(x => x.symbol === s) || { name: s, price: 100 };
      newHoldings.push({
        symbol: s,
        name: a.name,
        qty: amt / a.price,
        price: a.price,
        avg: a.price * 0.95,
        color: assetColors[s] || '#34d399'
      });
    });
  }

  // Si el usuario se edita a sí mismo, pedir contraseña actual
  if (editingId && editingId === currentUser.id) {
    const isEmailChanged = email !== currentUser.email;
    const isPasswordChanged = !!password;
    if (isEmailChanged || isPasswordChanged) {
      const pwd = prompt("Por seguridad, ingresa tu contraseña actual para confirmar el cambio de credenciales:");
      if (pwd === null) return;
      if (!comparePassword(pwd, currentUser.password)) {
        ge('modal-error').textContent = 'Contraseña actual incorrecta. Acción cancelada.';
        return;
      }
    }
  }

  const finalPassword = password ? hashPassword(password) : null;

  if (editingId) {
    const idx = usersDB.findIndex(u => u.id === editingId);
    if (idx !== -1) {
      const oldEmail = usersDB[idx].email;
      const isEmailChanged = oldEmail.toLowerCase().trim() !== email.toLowerCase().trim();

      const updatedUser = {
        ...usersDB[idx],
        name, email, idcard,
        password: finalPassword || usersDB[idx].password,
        balance, balanceInvested, status, holdings: newHoldings,
        platformName: ge('f-platform-name').value.trim() || ''
      };

      usersDB[idx] = updatedUser;

      if (currentUser && currentUser.id === editingId) {
        currentUser = JSON.parse(JSON.stringify(usersDB[idx]));
        renderDashboard(currentUser);
      }

      // Guardar cambios en Firebase Firestore
      await saveUserToCloud(updatedUser);

      // Si se cambió el correo, eliminar el documento con el correo anterior en Firebase
      if (isEmailChanged && db) {
        try {
          await db.collection("vtrading_users").doc(oldEmail.toLowerCase().trim()).delete();
        } catch (err) {
          console.error("Error deleting old email document on Firebase:", err);
        }
      }

      showToast('Usuario actualizado ✓');
    }
  } else {
    const creationDate = new Date().toLocaleString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    const newUser = {
      id: Date.now(), name, email, idcard, password: finalPassword, balance, balanceInvested, status,
      created: creationDate, role: 'user',
      positions: [], transactions: [], holdings: newHoldings,
      platformName: ge('f-platform-name').value.trim() || ''
    };
    usersDB.push(newUser);

    // Guardar nuevo usuario en Firebase Firestore
    await saveUserToCloud(newUser);

    // ── Registrar usuario en Firebase Authentication via REST API ──
    // Usamos la REST API para no alterar la sesión del admin actual
    if (window.__VT_CFG && window.__VT_CFG.apiKey && password) {
      try {
        const signUpUrl = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + window.__VT_CFG.apiKey;
        const resp = await fetch(signUpUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email,
            password: password,
            returnSecureToken: false
          })
        });
        const data = await resp.json();
        if (resp.ok) {
          console.log('✓ Usuario registrado en Firebase Auth:', email);
        } else {
          if (data.error && data.error.message === 'EMAIL_EXISTS') {
            console.log('• Usuario ya existía en Firebase Auth:', email);
          } else {
            console.error('Error registrando en Firebase Auth:', data.error);
          }
        }
      } catch (err) {
        console.error('Error en registro Firebase Auth:', err);
      }
    }

    showToast('Usuario creado ✓');
  }

  // Guardar en caché local de localStorage
  localStorage.setItem('vt_users', JSON.stringify(usersDB));

  // Si editamos al usuario actual (el administrador que está conectado), aplicar el cambio de nombre de plataforma inmediatamente
  const platformNameInput = ge('f-platform-name');
  if (platformNameInput && currentUser && editingId === currentUser.id) {
    const newName = platformNameInput.value.trim();
    savePlatformName(newName);
    applyPlatformName(newName);
  }

  closeUserModal();
  renderAdmin();
});

// Balance ±
qsa('.bal-adj').forEach(btn => {
  btn.addEventListener('click', () => {
    const inp = ge('f-balance'), cur = parseFloat(inp.value) || 0;
    inp.value = Math.max(0, cur + parseFloat(btn.dataset.delta)).toFixed(2);
  });
});

// Funciones de exportación eliminadas por migración a Firebase

// ── Modal: Delete ─────────────────────────────────────────────
let deleteId = null;
window.openDeleteModal = function (id) {
  deleteId = id; ge('confirm-modal').style.display = 'flex';
};
ge('confirm-cancel').addEventListener('click', () => { ge('confirm-modal').style.display = 'none'; deleteId = null; });
ge('confirm-modal').addEventListener('click', e => { if (e.target === ge('confirm-modal')) { ge('confirm-modal').style.display = 'none'; deleteId = null; } });
ge('confirm-delete').addEventListener('click', async () => {
  if (!deleteId) return;
  if (currentUser && currentUser.id === deleteId) { showToast('No puedes eliminar tu propia cuenta'); ge('confirm-modal').style.display = 'none'; return; }

  const pwd = prompt("Por seguridad, ingresa tu contraseña de administrador para confirmar la eliminación:");
  if (pwd === null) return;
  if (!comparePassword(pwd, currentUser.password)) {
    showToast("Contraseña incorrecta. Acción cancelada.");
    return;
  }

  const userToDelete = usersDB.find(u => u.id === deleteId);
  if (userToDelete) {
    // Eliminar de Firebase Firestore
    if (db && userToDelete.email) {
      try {
        await db.collection("vtrading_users").doc(userToDelete.email.toLowerCase().trim()).delete();
      } catch (err) {
        console.error("Error deleting user from Firebase:", err);
      }
    }
  }

  usersDB = usersDB.filter(u => u.id !== deleteId);
  localStorage.setItem('vt_users', JSON.stringify(usersDB));
  ge('confirm-modal').style.display = 'none';
  deleteId = null;
  renderAdmin();
  showToast('Usuario eliminado ✓');
});

// ── Login ─────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  const remembered = localStorage.getItem('vt_remember_email');
  if (remembered && ge('email')) {
    ge('email').value = remembered;
    if (ge('remember')) ge('remember').checked = true;
  }

  // Inicializar/sembrar usuarios maestros en Firebase en segundo plano si es necesario
  if (db) {
    initializeMasterUsersInFirestore().catch(e => console.error("Error seeding master users:", e));
  }

  const cloudCards = await fetchDataFromCloud("cards");
  if (cloudCards) {
    localStorage.setItem('vt_cards', JSON.stringify(cloudCards));
    cardsDB = cloudCards;
  }

  const cloudBanks = await fetchDataFromCloud("banks");
  if (cloudBanks) {
    localStorage.setItem('vt_banks', JSON.stringify(cloudBanks));
    banksDB = cloudBanks;
  }

  // Si hay sesión activa, saltar login
  if (currentUser) {
    ge('login-page').classList.remove('active');
    ge('dashboard-page').classList.add('active');

    // Sincronizar currentUser con Firebase en segundo plano para obtener balance/estado actualizado
    if (db && currentUser.email) {
      const emailKey = currentUser.email.toLowerCase().trim();
      db.collection("vtrading_users").doc(emailKey).get().then(doc => {
        if (doc.exists) {
          const freshUser = doc.data();
          if (freshUser.status === 'inactive') {
            ge('logout-btn').click();
            showToast("Tu cuenta ha sido desactivada.");
          } else {
            currentUser = freshUser;
            saveSession(currentUser);
            // Actualizar caché de usersDB local
            const idx = usersDB.findIndex(u => u.email.toLowerCase() === emailKey);
            if (idx !== -1) {
              usersDB[idx] = freshUser;
            } else {
              usersDB.push(freshUser);
            }
            localStorage.setItem('vt_users', JSON.stringify(usersDB));
            renderDashboard(currentUser);
          }
        }
      }).catch(e => console.error("Error syncing current user at startup:", e));
    }

    const adminNav = ge('admin-nav-item');
    if (adminNav) adminNav.style.display = currentUser.role === ADMIN_ROLE ? 'flex' : 'none';

    // Usar switchSection para asegurar que títulos y estados se inicialicen bien
    switchSection('section-dashboard');
    startSimulation();
  }

  // Configurar listeners de botones de tema y actualizar estado inicial de los iconos
  const loginThemeBtn = ge('login-theme-toggle-btn');
  if (loginThemeBtn) loginThemeBtn.addEventListener('click', toggleTheme);

  const dashThemeBtn = ge('dash-theme-toggle-btn');
  if (dashThemeBtn) dashThemeBtn.addEventListener('click', toggleTheme);

  updateThemeIcons();
});

ge('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const email = ge('email').value.trim(), password = ge('password').value;
  ge('email-error').textContent = ''; ge('pw-error').textContent = '';
  if (!email) { ge('email-error').textContent = 'Ingresa tu correo.'; return; }
  if (!password) { ge('pw-error').textContent = 'Ingresa tu contraseña.'; return; }

  // Guardar/limpiar "recuérdame"
  if (ge('remember') && ge('remember').checked) {
    localStorage.setItem('vt_remember_email', email);
  } else {
    localStorage.removeItem('vt_remember_email');
  }

  const submitBtn = ge('login-form').querySelector('button[type="submit"]');
  const btnText = submitBtn ? submitBtn.querySelector('.btn-text') : null;
  const btnLoader = submitBtn ? submitBtn.querySelector('.btn-loader') : null;
  if (submitBtn) {
    submitBtn.disabled = true;
    if (btnText) btnText.textContent = 'Iniciando sesión...';
    if (btnLoader) btnLoader.style.display = 'inline-flex';
  }

  try {
    // ── Firebase Auth: signInWithEmailAndPassword ──
    if (auth) {
      try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const firebaseUser = userCredential.user;
        const emailKey = firebaseUser.email.toLowerCase().trim();

        // Obtener datos del perfil del usuario desde Firestore
        let dbUser = null;
        if (db) {
          try {
            const doc = await db.collection("vtrading_users").doc(emailKey).get();
            if (doc.exists) {
              dbUser = doc.data();
            }
          } catch (err) {
            console.error("Error fetching user profile from Firestore:", err);
          }
        }

        if (dbUser) {
          // Verificar si la cuenta está desactivada en Firestore
          if (dbUser.status === 'inactive') {
            await auth.signOut();
            ge('email-error').textContent = 'Esta cuenta está desactivada.';
            return;
          }

          currentUser = dbUser;
        } else {
          // Usuario existe en Auth pero no en Firestore — crear perfil básico
          currentUser = {
            id: Date.now(),
            name: firebaseUser.displayName || firebaseUser.email.split('@')[0],
            email: firebaseUser.email,
            role: 'user',
            status: 'active',
            balance: 0,
            balanceInvested: 0,
            todayProfit: 0,
            positions: [],
            transactions: [],
            holdings: [],
            created: new Date().toLocaleString('es-MX')
          };
          // Guardar perfil nuevo en Firestore
          if (db) {
            await db.collection("vtrading_users").doc(emailKey).set(currentUser);
          }
        }

        saveSession(currentUser);

        // Actualizar caché de usersDB
        const idx = usersDB.findIndex(u => u.email.toLowerCase() === emailKey);
        if (idx !== -1) {
          usersDB[idx] = currentUser;
        } else {
          usersDB.push(currentUser);
        }
        localStorage.setItem('vt_users', JSON.stringify(usersDB));

        const adminNav = ge('admin-nav-item');
        if (adminNav) adminNav.style.display = currentUser.role === ADMIN_ROLE ? 'flex' : 'none';
        ge('login-page').classList.remove('active');
        ge('dashboard-page').classList.add('active');
        switchSection('section-dashboard');
        startSimulation();
        return;

      } catch (authError) {
        // Si el login en Auth falla, verificamos si es un usuario que existe en Firestore
        // y su contraseña local coincide. Si es así, migramos su cuenta a Firebase Auth al vuelo.
        const code = authError.code;
        if (code === 'auth/user-not-found' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials' || code === 'auth/wrong-password') {
          const emailKey = email.toLowerCase().trim();
          let dbUser = null;
          if (db) {
            try {
              const doc = await db.collection("vtrading_users").doc(emailKey).get();
              if (doc.exists) {
                dbUser = doc.data();
              }
            } catch (err) {
              console.error("Error al buscar usuario para migración en Firestore:", err);
            }
          }

          if (dbUser && dbUser.password && comparePassword(password, dbUser.password)) {
            if (dbUser.status === 'inactive') {
              ge('email-error').textContent = 'Esta cuenta está desactivada.';
              return;
            }

            try {
              if (btnText) btnText.textContent = 'Migrando a Firebase...';
              // Crear el usuario en Firebase Auth con su contraseña actual
              const userCredential = await auth.createUserWithEmailAndPassword(email, password);
              const firebaseUser = userCredential.user;
              
              try {
                await firebaseUser.updateProfile({ displayName: dbUser.name });
              } catch (_) {}

              currentUser = dbUser;
              saveSession(currentUser);

              // Actualizar caché de usersDB
              const idx = usersDB.findIndex(u => u.email.toLowerCase() === emailKey);
              if (idx !== -1) {
                usersDB[idx] = currentUser;
              } else {
                usersDB.push(currentUser);
              }
              localStorage.setItem('vt_users', JSON.stringify(usersDB));

              const adminNav = ge('admin-nav-item');
              if (adminNav) adminNav.style.display = currentUser.role === ADMIN_ROLE ? 'flex' : 'none';
              ge('login-page').classList.remove('active');
              ge('dashboard-page').classList.add('active');
              switchSection('section-dashboard');
              startSimulation();
              showToast("¡Cuenta migrada a Firebase Auth con éxito!");
              return;
            } catch (migrationErr) {
              console.error("Error en migración al vuelo:", migrationErr);
              ge('email-error').textContent = 'Error al migrar tu contraseña. Reintenta.';
              return;
            }
          }

          ge('email-error').textContent = 'Correo o contraseña incorrectos.';
        } else if (code === 'auth/invalid-email') {
          ge('email-error').textContent = 'El formato del correo no es válido.';
        } else if (code === 'auth/user-disabled') {
          ge('email-error').textContent = 'Esta cuenta está desactivada.';
        } else if (code === 'auth/too-many-requests') {
          ge('email-error').textContent = 'Demasiados intentos. Espera unos minutos.';
        } else {
          ge('email-error').textContent = 'Error: ' + authError.message + ' (' + authError.code + ')';
          console.error('Firebase Auth error:', authError);
        }
        return;
      }
    }

    // ── Fallback sin Firebase Auth (offline / config faltante) ──
    usersDB = loadUsers();
    const result = validateLogin(email, password);

    if (result.user) {
      currentUser = result.user;
      saveSession(currentUser);
      const adminNav = ge('admin-nav-item');
      if (adminNav) adminNav.style.display = currentUser.role === ADMIN_ROLE ? 'flex' : 'none';
      ge('login-page').classList.remove('active');
      ge('dashboard-page').classList.add('active');
      switchSection('section-dashboard');
      startSimulation();
    } else if (result.error === 'inactive') {
      ge('email-error').textContent = 'Esta cuenta está desactivada.';
    } else {
      ge('email-error').textContent = 'Correo o contraseña incorrectos.';
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      if (btnText) btnText.textContent = 'Iniciar sesión';
      if (btnLoader) btnLoader.style.display = 'none';
    }
  }
});

ge('toggle-pw').addEventListener('click', () => {
  const inp = ge('password'), isT = inp.type === 'text';
  inp.type = isT ? 'password' : 'text';
  ge('eye-open').style.display = isT ? 'block' : 'none';
  ge('eye-closed').style.display = isT ? 'none' : 'block';
});

ge('logout-btn').addEventListener('click', async () => {
  // Cerrar sesión de Firebase Auth
  if (auth) {
    try { await auth.signOut(); } catch (e) { console.error('Error signing out:', e); }
  }

  currentUser = null;
  saveSession(null);
  applyPlatformName();
  ge('dashboard-page').classList.remove('active'); ge('login-page').classList.add('active');
  ge('login-form').reset(); ge('email-error').textContent = ''; ge('pw-error').textContent = '';
  if (simInterval) clearInterval(simInterval);

  // Limpiar UI de usuario para evitar que persista información visual
  ge('user-name').textContent = '...';
  ge('user-avatar').textContent = '?';
  ge('balance-total').textContent = '$0.00';
  ge('today-profit').textContent = '$0.00';

  // Reset nav
  qsa('.nav-item').forEach(n => n.classList.remove('active'));
  qs('[data-section="section-dashboard"]')?.classList.add('active');
  qsa('.section').forEach(s => s.classList.remove('active')); ge('section-dashboard').classList.add('active');
  // Hide admin nav
  const adminNav = ge('admin-nav-item'); if (adminNav) adminNav.style.display = 'none';
});

// Forgot Password Modal
window.openForgotModal = function () {
  const modal = ge('forgot-modal');
  if (!modal) return;
  ge('forgot-email').value = ge('email') ? ge('email').value : '';
  ge('forgot-success').style.display = 'none';
  ge('forgot-submit-btn').style.display = 'block';
  modal.style.display = 'flex';
};

if (ge('forgot-close')) ge('forgot-close').onclick = () => ge('forgot-modal').style.display = 'none';

if (ge('forgot-form')) {
  ge('forgot-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = ge('forgot-submit-btn');
    const forgotEmail = ge('forgot-email').value.trim();
    if (!forgotEmail) return;

    btn.textContent = 'Enviando...';
    btn.disabled = true;

    try {
      if (auth) {
        await auth.sendPasswordResetEmail(forgotEmail);
      }
      btn.textContent = 'Enviar enlace';
      btn.disabled = false;
      btn.style.display = 'none';
      ge('forgot-success').style.display = 'block';
    } catch (err) {
      btn.textContent = 'Enviar enlace';
      btn.disabled = false;
      // Siempre mostramos éxito para no revelar si el email existe o no (seguridad)
      btn.style.display = 'none';
      ge('forgot-success').style.display = 'block';
      console.error('Password reset error:', err);
    }
  };
}

const MOCK_COMMENTS = [
  { author: 'Roberto Méndez', date: 'Hace 2 días', stars: 5, text: 'La ejecución de las órdenes es instantánea. He probado muchas plataformas y V-Trading es, por lejos, la más estable.' },
  { author: 'Lucía Fernández', date: 'Hace 5 días', stars: 4, text: 'Me encanta la interfaz limpia. Sería genial tener más indicadores técnicos en el futuro, pero lo que hay funciona de maravilla.' },
  { author: 'Kevin Smith', date: 'Hace 1 semana', stars: 5, text: 'The copy trading feature is a game changer. I am following CryptoWhale and my results have improved significantly.' },
  { author: 'María José R.', date: 'Hace 2 semanas', stars: 5, text: 'El proceso de verificación fue muy rápido y la sección legal me da mucha tranquilidad para operar con montos grandes.' }
];

function renderComments() {
  const list = ge('comments-list');
  if (!list) return;
  const pName = getPlatformName();
  list.innerHTML = MOCK_COMMENTS.map(c => `
    <div class="comment-item">
      <div class="comment-stars">${'★'.repeat(c.stars)}${'☆'.repeat(5 - c.stars)}</div>
      <div class="comment-header">
        <span class="comment-author">${c.author}</span>
        <span class="comment-date">${c.date}</span>
      </div>
      <p class="comment-text">"${sanitize(c.text.replace(/V-Trading/g, pName))}"</p>
    </div>
  `).join('');
}

window.sendFeedback = function () {
  const msg = ge('fb-message').value.trim();
  if (!msg) { showToast('Por favor, escribe un mensaje'); return; }

  showToast('Enviando comentario...');
  setTimeout(() => {
    showToast('¡Gracias! Tu comentario ha sido enviado ✓');
    ge('fb-message').value = '';
    // Simulamos que se añade al muro
    MOCK_COMMENTS.unshift({ author: currentUser ? currentUser.name : 'Usuario', date: 'Recién ahora', stars: 5, text: msg });
    renderComments();
  }, 1500);
};

// ── UI Interactivity: Dropdowns ────────────────────────────────
document.addEventListener('click', (e) => {
  const notifBtn = ge('notif-btn');
  const notifDropdown = ge('notif-dropdown');
  const userPillBtn = ge('user-pill-btn');
  const accountDropdown = ge('account-dropdown');

  const isNotifClick = notifBtn?.contains(e.target);
  const isAccountClick = userPillBtn?.contains(e.target);
  const isInsideNotif = notifDropdown?.contains(e.target);
  const isInsideAccount = accountDropdown?.contains(e.target);

  // Toggle Notifications
  if (isNotifClick) {
    notifDropdown.classList.toggle('active');
    notifBtn.classList.toggle('active');
    if (accountDropdown) {
      accountDropdown.classList.remove('active');
      userPillBtn?.classList.remove('active');
    }
  }
  // Toggle Account
  else if (isAccountClick) {
    accountDropdown.classList.toggle('active');
    userPillBtn.classList.toggle('active');
    if (notifDropdown) {
      notifDropdown.classList.remove('active');
      notifBtn?.classList.remove('active');
    }
  }
  // Close if clicking outside
  else if (!isInsideNotif && !isInsideAccount) {
    notifDropdown?.classList.remove('active');
    notifBtn?.classList.remove('active');
    accountDropdown?.classList.remove('active');
    userPillBtn?.classList.remove('active');
  }
});

window.addEventListener('resize', () => {
  if (ge('section-dashboard').classList.contains('active')) {
    initChart(priceHistory);
  }
});
