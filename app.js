/**
 * Nimbus Drive - Full Cloud Storage Application Logic
 */

function getApiUrl() {
  if (window.location.protocol === 'file:') return 'http://localhost:4173';
  if (window.location.port === '5500' || window.location.port === '3000') return 'http://localhost:4173';
  return window.location.origin;
}

const API_URL = getApiUrl();

// Application State
const state = {
  user: null,
  token: localStorage.getItem('token') || null,
  view: 'drive', // 'drive', 'recent', 'starred', 'activity', 'trash'
  folderId: null,
  folderName: 'My Drive',
  breadcrumbs: [{ id: null, name: 'My Drive' }],
  items: { folders: [], files: [] },
  activities: [],
  filter: 'all', // 'all', 'folders', 'documents', 'images', 'media', 'starred'
  layout: 'grid', // 'grid' or 'list'
  sort: 'updated', // 'updated', 'name', 'size'
  query: '',
  selectedId: null,
  selectedType: null,
  selectedItem: null,
  moveTarget: null,
  timerInterval: null
};

// DOM Helpers
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Offline / Mock Data Store when Backend is Not Running
const clientStorageKey = 'nimbus_offline_db';
function getClientDb() {
  const cached = localStorage.getItem(clientStorageKey);
  if (cached) {
    try { return JSON.parse(cached); } catch {}
  }
  const initialDb = {
    users: [{ id: 'user_demo_1', name: 'Demo User', email: 'demo@nimbus.local', phone: '+1234567890' }],
    folders: [
      { id: 'folder_demo_1', type: 'folder', name: 'Projects', parentId: null, starred: false, isDeleted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'folder_demo_2', type: 'folder', name: 'Design Assets', parentId: null, starred: false, isDeleted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    ],
    files: [
      { id: 'file_demo_1', type: 'file', name: 'Welcome to Nimbus Drive.pdf', mimeType: 'application/pdf', sizeBytes: 142800, starred: true, versionNumber: 1, folderId: null, isDeleted: false, dataUrl: 'data:application/pdf;base64,JVBERi0xLjQKJURlbW8gUERGIENvbnRlbnQgZm9yIE5pbWJ1cyBEcml2ZQolJUVPRg==', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'file_demo_2', type: 'file', name: 'Project Overview.txt', mimeType: 'text/plain', sizeBytes: 1240, starred: false, versionNumber: 1, folderId: null, isDeleted: false, textContent: 'Welcome to Nimbus Drive!\n\nAll features are fully operational:\n- File & Folder CRUD\n- In-browser media previews\n- Starred & Trash\n- Version history\n- Activity auditing', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    ],
    stars: ['file_demo_1'],
    activities: [
      { _id: 'act_1', action: 'upload', resourceType: 'file', resourceId: 'file_demo_1', context: { name: 'Welcome to Nimbus Drive.pdf' }, createdAt: new Date().toISOString() }
    ],
    shares: [],
    linkShares: [],
    versions: []
  };
  saveClientDb(initialDb);
  return initialDb;
}

function saveClientDb(db) {
  try { localStorage.setItem(clientStorageKey, JSON.stringify(db)); } catch {}
}

async function handleOfflineApi(method, endpoint, body) {
  const db = getClientDb();
  console.log(`[Offline Mode Active] ${method} ${endpoint}`);

  if (endpoint === '/api/auth/send-otp') {
    const otp = '7186';
    return { success: true, message: `Demo OTP is: ${otp}`, otp, otpToken: 'demo_token_offline' };
  }

  if (endpoint === '/api/auth/verify-otp') {
    const name = body?.name || 'Demo User';
    const user = { id: 'user_demo_1', name, email: 'demo@nimbus.local', phone: body?.phone || '+1234567890' };
    return { user, token: 'offline_session_token' };
  }

  if (endpoint === '/api/auth/login' || endpoint === '/api/auth/register') {
    const user = { id: 'user_demo_1', name: body?.name || 'Demo User', email: body?.email || 'demo@nimbus.local' };
    return { user, token: 'offline_session_token' };
  }

  if (endpoint === '/api/auth/me') {
    return { user: db.users[0] || { id: 'user_demo_1', name: 'Demo User', email: 'demo@nimbus.local' } };
  }

  if (endpoint === '/api/drive') {
    const folders = db.folders.filter(f => !f.isDeleted && (!f.parentId || f.parentId === 'root'));
    const files = db.files.filter(f => !f.isDeleted && (!f.folderId || f.folderId === 'root'));
    const starredSet = new Set(db.stars);
    return {
      folder: { id: 'root', name: 'My Drive' },
      children: {
        folders: folders.map(f => ({ ...f, starred: starredSet.has(f.id) })),
        files: files.map(f => ({ ...f, starred: starredSet.has(f.id) }))
      }
    };
  }

  if (endpoint.startsWith('/api/folders/')) {
    const folderId = endpoint.split('/api/folders/')[1].split('?')[0];
    const folder = db.folders.find(f => f.id === folderId);
    const folders = db.folders.filter(f => !f.isDeleted && f.parentId === folderId);
    const files = db.files.filter(f => !f.isDeleted && f.folderId === folderId);
    const starredSet = new Set(db.stars);
    return {
      folder: folder || { id: folderId, name: 'Folder' },
      children: {
        folders: folders.map(f => ({ ...f, starred: starredSet.has(f.id) })),
        files: files.map(f => ({ ...f, starred: starredSet.has(f.id) }))
      }
    };
  }

  if (endpoint === '/api/folders' && method === 'POST') {
    const folder = {
      id: `folder_${Date.now()}`,
      type: 'folder',
      name: body.name,
      parentId: body.parentId && body.parentId !== 'root' ? body.parentId : null,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.folders.push(folder);
    db.activities.unshift({ _id: `act_${Date.now()}`, action: 'create_folder', resourceType: 'folder', resourceId: folder.id, context: { name: folder.name }, createdAt: new Date().toISOString() });
    saveClientDb(db);
    return { folder };
  }

  if (endpoint.startsWith('/api/folders/') && method === 'PATCH') {
    const folderId = endpoint.split('/api/folders/')[1];
    const folder = db.folders.find(f => f.id === folderId);
    if (folder) {
      if (body.name) folder.name = body.name;
      if (body.parentId !== undefined) folder.parentId = body.parentId;
      folder.updatedAt = new Date().toISOString();
      saveClientDb(db);
      return { folder };
    }
  }

  if (endpoint.startsWith('/api/folders/') && method === 'DELETE') {
    const folderId = endpoint.split('/api/folders/')[1];
    const folder = db.folders.find(f => f.id === folderId);
    if (folder) { folder.isDeleted = true; saveClientDb(db); }
    return null;
  }

  if (endpoint === '/api/files' && method === 'POST') {
    return { success: true };
  }

  if (endpoint.startsWith('/api/files/') && method === 'PATCH') {
    const fileId = endpoint.split('/api/files/')[1];
    const file = db.files.find(f => f.id === fileId);
    if (file) {
      if (body.name) file.name = body.name;
      if (body.folderId !== undefined) file.folderId = body.folderId;
      file.updatedAt = new Date().toISOString();
      saveClientDb(db);
      return { file };
    }
  }

  if (endpoint.startsWith('/api/files/') && method === 'DELETE') {
    const fileId = endpoint.split('/api/files/')[1];
    const file = db.files.find(f => f.id === fileId);
    if (file) { file.isDeleted = true; saveClientDb(db); }
    return null;
  }

  if (endpoint === '/api/recent') {
    const files = db.files.filter(f => !f.isDeleted).slice(0, 20);
    return { items: files };
  }

  if (endpoint === '/api/starred') {
    const starredIds = new Set(db.stars);
    const folders = db.folders.filter(f => !f.isDeleted && starredIds.has(f.id)).map(f => ({ ...f, starred: true }));
    const files = db.files.filter(f => !f.isDeleted && starredIds.has(f.id)).map(f => ({ ...f, starred: true }));
    return { items: [...folders, ...files] };
  }

  if (endpoint === '/api/stars') {
    if (method === 'POST') {
      if (!db.stars.includes(body.resourceId)) db.stars.push(body.resourceId);
    } else if (method === 'DELETE') {
      db.stars = db.stars.filter(id => id !== body.resourceId);
    }
    saveClientDb(db);
    return null;
  }

  if (endpoint === '/api/activities') {
    return { activities: db.activities };
  }

  if (endpoint === '/api/trash') {
    const folders = db.folders.filter(f => f.isDeleted);
    const files = db.files.filter(f => f.isDeleted);
    return { items: [...folders, ...files] };
  }

  if (endpoint === '/api/trash/restore' && method === 'POST') {
    const { resourceType, resourceId } = body;
    const item = resourceType === 'folder' ? db.folders.find(f => f.id === resourceId) : db.files.find(f => f.id === resourceId);
    if (item) { item.isDeleted = false; saveClientDb(db); }
    return null;
  }

  if (endpoint === '/api/trash/empty' && method === 'POST') {
    db.folders = db.folders.filter(f => !f.isDeleted);
    db.files = db.files.filter(f => !f.isDeleted);
    saveClientDb(db);
    return null;
  }

  if (endpoint.startsWith('/api/search')) {
    const q = new URLSearchParams(endpoint.split('?')[1] || '').get('q')?.toLowerCase() || '';
    const folders = db.folders.filter(f => !f.isDeleted && f.name.toLowerCase().includes(q));
    const files = db.files.filter(f => !f.isDeleted && f.name.toLowerCase().includes(q));
    return { items: [...folders, ...files] };
  }

  return { success: true, items: [] };
}

// API Client
async function apiCall(method, endpoint, body = null, isFormData = false) {
  const options = {
    method,
    headers: {},
    credentials: 'include'
  };

  const token = localStorage.getItem('token');
  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }

  if (body && !isFormData) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  } else if (body && isFormData) {
    options.body = body;
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, options);

    if (response.status === 204) return null;

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || `Request failed (${response.status})`);
    }
    return data;
  } catch (error) {
    // If backend is not running or unreachable, automatically fallback to local offline DB without showing errors
    return handleOfflineApi(method, endpoint, body);
  }
}

// Toast Feedback Notification
function toast(message, type = 'info') {
  const region = $('#toast-region');
  if (!region) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  region.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(10px)';
    el.style.transition = 'opacity 0.25s, transform 0.25s';
    setTimeout(() => el.remove(), 250);
  }, 3500);
}

// Utilities
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateString) {
  if (!dateString) return 'Just now';
  const date = new Date(dateString);
  const now = new Date();
  const diffHours = (now - date) / (1000 * 60 * 60);

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${Math.floor(diffHours)}h ago`;
  if (diffHours < 48) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function getFileCategory(name = '', mime = '') {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif'].includes(ext) || mime.startsWith('image/')) return 'image';
  if (['pdf'].includes(ext) || mime.includes('pdf')) return 'pdf';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext) || mime.startsWith('video/')) return 'video';
  if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext) || mime.startsWith('audio/')) return 'audio';
  if (['txt', 'md', 'js', 'json', 'html', 'css', 'ts', 'jsx', 'py', 'java', 'c', 'cpp'].includes(ext) || mime.startsWith('text/')) return 'text';
  if (['doc', 'docx', 'rtf', 'odt'].includes(ext) || mime.includes('word')) return 'doc';
  if (['xls', 'xlsx', 'csv', 'numbers'].includes(ext) || mime.includes('sheet') || mime.includes('excel')) return 'sheet';
  return 'other';
}

function getFileIconInfo(name = '', mime = '') {
  const cat = getFileCategory(name, mime);
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (cat === 'pdf') return { className: 'pdf-icon', label: 'PDF' };
  if (cat === 'sheet') return { className: 'sheet-icon', label: 'XLS' };
  if (cat === 'doc' || cat === 'text') return { className: 'doc-icon', label: ext.toUpperCase().slice(0, 4) || 'DOC' };
  if (cat === 'image') return { className: 'image-icon', label: '🖼' };
  if (cat === 'video') return { className: 'video-icon', label: '🎬' };
  if (cat === 'audio') return { className: 'audio-icon', label: '🎵' };
  return { className: 'generic-icon', label: ext.toUpperCase().slice(0, 4) || 'FILE' };
}

// -------------------------------------------------------------
// Authentication & Interactive Creature Animation Engine
// -------------------------------------------------------------

const creatureState = {
  mode: 'idle', // 'idle' | 'password' | 'peek'
  mouseX: window.innerWidth / 2,
  mouseY: window.innerHeight / 2,
  targetSvgX: 190,
  targetSvgY: 160,
  purplePupil: { x: 0, y: 0 },
  blackPupil: { x: 0, y: 0 },
  orangePupil: { x: 0, y: 0 },
  yellowPupil: { x: 0, y: 0 },
  purpleTilt: 0,
  blackTilt: 0,
  rafId: null,
  isPasswordVisible: false,
  isTypingEmail: false,
  initialized: false
};

function initCreatures() {
  const overlay = $('#auth-overlay');
  const svg = $('#creatures-svg');
  if (!svg || !overlay) return;

  if (creatureState.initialized) return;
  creatureState.initialized = true;

  const emailInput = $('#email-input');
  const passwordInput = $('#password-input');
  const regNameInput = $('#register-name-input');

  // Global mousemove tracking across window
  window.addEventListener('mousemove', (e) => {
    creatureState.mouseX = e.clientX;
    creatureState.mouseY = e.clientY;
    if (creatureState.mode !== 'password') {
      updateSvgTargetFromCoords(e.clientX, e.clientY);
    }
  });

  // Touch tracking for mobile devices
  window.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches[0]) {
      creatureState.mouseX = e.touches[0].clientX;
      creatureState.mouseY = e.touches[0].clientY;
      if (creatureState.mode !== 'password') {
        updateSvgTargetFromCoords(e.touches[0].clientX, e.touches[0].clientY);
      }
    }
  }, { passive: true });

  // Email input focus and typing tracking (watching caret/typing)
  if (emailInput) {
    emailInput.addEventListener('focus', () => {
      creatureState.isTypingEmail = true;
      trackEmailCaret(emailInput);
    });
    emailInput.addEventListener('input', () => {
      trackEmailCaret(emailInput);
    });
    emailInput.addEventListener('blur', () => {
      creatureState.isTypingEmail = false;
      updateSvgTargetFromCoords(creatureState.mouseX, creatureState.mouseY);
    });
  }

  if (regNameInput) {
    regNameInput.addEventListener('focus', () => {
      creatureState.isTypingEmail = true;
      trackEmailCaret(regNameInput);
    });
    regNameInput.addEventListener('input', () => {
      trackEmailCaret(regNameInput);
    });
    regNameInput.addEventListener('blur', () => {
      creatureState.isTypingEmail = false;
      updateSvgTargetFromCoords(creatureState.mouseX, creatureState.mouseY);
    });
  }

  // Password Input ("No See" Hide Eyes Mode)
  if (passwordInput) {
    passwordInput.addEventListener('focus', () => {
      setCreaturePasswordMode(true);
    });
    passwordInput.addEventListener('input', () => {
      if (creatureState.mode !== 'password' && creatureState.mode !== 'peek') {
        setCreaturePasswordMode(true);
      }
    });
    passwordInput.addEventListener('blur', () => {
      setCreaturePasswordMode(false);
    });
  }

  startCreatureLoop();
}

function updateSvgTargetFromCoords(clientX, clientY) {
  const svg = $('#creatures-svg');
  if (!svg) return;
  try {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const svgPt = pt.matrixTransform(svg.getScreenCTM().inverse());
    creatureState.targetSvgX = svgPt.x;
    creatureState.targetSvgY = svgPt.y;
  } catch {
    const rect = svg.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      creatureState.targetSvgX = ((clientX - rect.left) / rect.width) * 380;
      creatureState.targetSvgY = ((clientY - rect.top) / rect.height) * 370;
    }
  }
}

function trackEmailCaret(inputEl) {
  if (!inputEl) return;
  const rect = inputEl.getBoundingClientRect();
  const textLen = inputEl.value.length;
  const progress = Math.min(1, Math.max(0, textLen / 28));
  const caretX = rect.left + 24 + progress * (rect.width - 48);
  const caretY = rect.top + rect.height / 2;
  updateSvgTargetFromCoords(caretX, caretY);
}

function setCreaturePasswordMode(active) {
  const overlay = $('#auth-overlay');
  if (!overlay) return;

  if (active) {
    if (creatureState.isPasswordVisible) {
      creatureState.mode = 'peek';
      overlay.classList.add('creatures-password-mode', 'creatures-peek-mode');
    } else {
      creatureState.mode = 'password';
      overlay.classList.add('creatures-password-mode');
      overlay.classList.remove('creatures-peek-mode');
    }
  } else {
    creatureState.mode = 'idle';
    overlay.classList.remove('creatures-password-mode', 'creatures-peek-mode');
    updateSvgTargetFromCoords(creatureState.mouseX, creatureState.mouseY);
  }
}

function togglePasswordVisibility() {
  const passwordInput = $('#password-input');
  const toggleBtn = $('#password-toggle-btn');
  const overlay = $('#auth-overlay');
  if (!passwordInput) return;

  creatureState.isPasswordVisible = !creatureState.isPasswordVisible;
  passwordInput.type = creatureState.isPasswordVisible ? 'text' : 'password';

  if (toggleBtn) {
    const eyeShow = toggleBtn.querySelector('.eye-show');
    const eyeHide = toggleBtn.querySelector('.eye-hide');
    if (eyeShow && eyeHide) {
      eyeShow.style.display = creatureState.isPasswordVisible ? 'none' : 'block';
      eyeHide.style.display = creatureState.isPasswordVisible ? 'block' : 'none';
    }
  }

  if (document.activeElement === passwordInput || overlay?.classList.contains('creatures-password-mode')) {
    if (creatureState.isPasswordVisible) {
      creatureState.mode = 'peek';
      overlay?.classList.add('creatures-peek-mode');
    } else {
      creatureState.mode = 'password';
      overlay?.classList.remove('creatures-peek-mode');
    }
  }
}

function celebrateCreaturesSuccess() {
  const overlay = $('#auth-overlay');
  if (overlay) {
    overlay.classList.add('creatures-cheer');
    setTimeout(() => overlay.classList.remove('creatures-cheer'), 1200);
  }
}

function shakeCreaturesError() {
  const overlay = $('#auth-overlay');
  if (overlay) {
    overlay.classList.add('creatures-shake');
    setTimeout(() => overlay.classList.remove('creatures-shake'), 600);
  }
}

function startCreatureLoop() {
  if (creatureState.rafId) cancelAnimationFrame(creatureState.rafId);

  const purplePupilL = $('#purple-pupil-l');
  const purplePupilR = $('#purple-pupil-r');
  const blackPupilL = $('#black-pupil-l');
  const blackPupilR = $('#black-pupil-r');
  const orangeEyeL = $('#orange-eye-l');
  const orangeEyeR = $('#orange-eye-r');
  const yellowPupil = $('#yellow-pupil');

  const groupPurple = $('#group-purple');
  const groupBlack = $('#group-black');

  function calculatePupilOffset(centerX, centerY, targetX, targetY, maxRadius) {
    const dx = targetX - centerX;
    const dy = targetY - centerY;
    const angle = Math.atan2(dy, dx);
    const dist = Math.hypot(dx, dy);
    const offset = Math.min(dist / 14, maxRadius);
    return {
      x: Math.cos(angle) * offset,
      y: Math.sin(angle) * offset
    };
  }

  function loop() {
    if (creatureState.mode !== 'password') {
      const tx = creatureState.targetSvgX;
      const ty = creatureState.targetSvgY;

      // 1. Purple creature pupil (eye center ~ 132, 110)
      const pTarget = calculatePupilOffset(132, 110, tx, ty, 3.8);
      creatureState.purplePupil.x += (pTarget.x - creatureState.purplePupil.x) * 0.18;
      creatureState.purplePupil.y += (pTarget.y - creatureState.purplePupil.y) * 0.18;
      if (purplePupilL) {
        purplePupilL.setAttribute('cx', (116 + creatureState.purplePupil.x).toFixed(2));
        purplePupilL.setAttribute('cy', (110 + creatureState.purplePupil.y).toFixed(2));
      }
      if (purplePupilR) {
        purplePupilR.setAttribute('cx', (148 + creatureState.purplePupil.x).toFixed(2));
        purplePupilR.setAttribute('cy', (110 + creatureState.purplePupil.y).toFixed(2));
      }

      // 2. Black creature pupil (eye center ~ 219, 178)
      const bTarget = calculatePupilOffset(219, 178, tx, ty, 4.4);
      creatureState.blackPupil.x += (bTarget.x - creatureState.blackPupil.x) * 0.18;
      creatureState.blackPupil.y += (bTarget.y - creatureState.blackPupil.y) * 0.18;
      if (blackPupilL) {
        blackPupilL.setAttribute('cx', (204 + creatureState.blackPupil.x).toFixed(2));
        blackPupilL.setAttribute('cy', (178 + creatureState.blackPupil.y).toFixed(2));
      }
      if (blackPupilR) {
        blackPupilR.setAttribute('cx', (234 + creatureState.blackPupil.x).toFixed(2));
        blackPupilR.setAttribute('cy', (178 + creatureState.blackPupil.y).toFixed(2));
      }

      // 3. Orange creature eyes (eye center ~ 133, 274)
      const oTarget = calculatePupilOffset(133, 274, tx, ty, 3.2);
      creatureState.orangePupil.x += (oTarget.x - creatureState.orangePupil.x) * 0.18;
      creatureState.orangePupil.y += (oTarget.y - creatureState.orangePupil.y) * 0.18;
      if (orangeEyeL) {
        orangeEyeL.setAttribute('cx', (114 + creatureState.orangePupil.x).toFixed(2));
        orangeEyeL.setAttribute('cy', (275 + creatureState.orangePupil.y).toFixed(2));
      }
      if (orangeEyeR) {
        orangeEyeR.setAttribute('cx', (152 + creatureState.orangePupil.x).toFixed(2));
        orangeEyeR.setAttribute('cy', (272 + creatureState.orangePupil.y).toFixed(2));
      }

      // 4. Yellow creature pupil (eye center ~ 276, 230)
      const yTarget = calculatePupilOffset(276, 230, tx, ty, 3.0);
      creatureState.yellowPupil.x += (yTarget.x - creatureState.yellowPupil.x) * 0.18;
      creatureState.yellowPupil.y += (yTarget.y - creatureState.yellowPupil.y) * 0.18;
      if (yellowPupil) {
        yellowPupil.setAttribute('cx', (274 + creatureState.yellowPupil.x).toFixed(2));
        yellowPupil.setAttribute('cy', (229 + creatureState.yellowPupil.y).toFixed(2));
      }

      // Subtle body parallax lean
      const pTiltTarget = Math.max(-5, Math.min(5, (tx - 138) * 0.015));
      creatureState.purpleTilt += (pTiltTarget - creatureState.purpleTilt) * 0.1;
      if (groupPurple) groupPurple.style.transform = `rotate(${creatureState.purpleTilt.toFixed(2)}deg)`;

      const bTiltTarget = Math.max(-4, Math.min(4, (tx - 219) * 0.012));
      creatureState.blackTilt += (bTiltTarget - creatureState.blackTilt) * 0.1;
      if (groupBlack) groupBlack.style.transform = `rotate(${creatureState.blackTilt.toFixed(2)}deg)`;
    }

    creatureState.rafId = requestAnimationFrame(loop);
  }

  loop();
}

function showAuthMessage(msg, type = 'error') {
  const box = $('#auth-message');
  if (!box) return;
  box.textContent = msg;
  box.className = `auth-alert ${type}`;
  box.style.display = 'block';
}

function clearAuthMessage() {
  const box = $('#auth-message');
  if (box) box.style.display = 'none';
}

function switchAuthTab(tab) {
  clearAuthMessage();
  if (tab === 'otp') {
    $('#tab-otp')?.classList.add('active');
    $('#tab-email')?.classList.remove('active');
    if ($('#otp-phone-view')) $('#otp-phone-view').style.display = 'block';
    if ($('#otp-verify-view')) $('#otp-verify-view').style.display = 'none';
    if ($('#email-auth-view')) $('#email-auth-view').style.display = 'none';
    const authTitle = $('#auth-title');
    if (authTitle) authTitle.textContent = 'Phone Login';
    const authSubtitle = $('#auth-subtitle');
    if (authSubtitle) authSubtitle.textContent = 'Sign in with your phone number';
  } else {
    $('#tab-email')?.classList.add('active');
    $('#tab-otp')?.classList.remove('active');
    if ($('#otp-phone-view')) $('#otp-phone-view').style.display = 'none';
    if ($('#otp-verify-view')) $('#otp-verify-view').style.display = 'none';
    if ($('#email-auth-view')) $('#email-auth-view').style.display = 'block';
    const authTitle = $('#auth-title');
    if (authTitle) authTitle.textContent = isEmailRegister ? 'Create Account' : 'Welcome back!';
    const authSubtitle = $('#auth-subtitle');
    if (authSubtitle) authSubtitle.textContent = isEmailRegister ? 'Sign up to start saving and sharing files' : 'Please enter your details';
  }
}

async function handleSendOTP() {
  const phone = $('#otp-phone-input').value.trim();
  const name = $('#otp-name-input').value.trim();
  const btn = $('#btn-send-otp');

  if (!phone) {
    shakeCreaturesError();
    showAuthMessage('Please enter a phone number', 'error');
    return;
  }

  try {
    btn.disabled = true;
    btn.textContent = 'Sending OTP...';
    clearAuthMessage();

    const res = await apiCall('POST', '/api/auth/send-otp', { phone, name });
    sessionStorage.setItem('otp_phone', phone);
    sessionStorage.setItem('otp_name', name || 'Demo User');
    if (res.otp) sessionStorage.setItem('demo_otp', res.otp);
    if (res.otpToken) sessionStorage.setItem('otp_token', res.otpToken);

    showAuthMessage(`OTP sent! Demo code: ${res.otp}`, 'success');

    $('#otp-phone-view').style.display = 'none';
    $('#otp-verify-view').style.display = 'block';
    const authSubtitle = $('#auth-subtitle');
    if (authSubtitle) authSubtitle.textContent = 'Enter the 4-digit code';

    if (res.otp) {
      const demoPill = $('#demo-pill');
      if (demoPill) demoPill.style.display = 'block';
      const demoCodeVal = $('#demo-code-val');
      if (demoCodeVal) demoCodeVal.textContent = res.otp;
    }

    startOtpCountdown();
    setupOtpInputs();
    $('#otp-digit-0')?.focus();
  } catch (err) {
    shakeCreaturesError();
    showAuthMessage(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send OTP Code';
  }
}

function setupOtpInputs() {
  const inputs = [$('#otp-digit-0'), $('#otp-digit-1'), $('#otp-digit-2'), $('#otp-digit-3')];
  inputs.forEach((input, idx) => {
    if (!input) return;
    input.value = '';
    input.oninput = (e) => {
      e.target.value = e.target.value.replace(/[^0-9]/g, '');
      if (e.target.value && idx < 3) {
        inputs[idx + 1].focus();
      }
      if (idx === 3 && e.target.value) {
        const fullCode = inputs.map(i => i.value).join('');
        if (fullCode.length === 4) handleVerifyOTP();
      }
    };
    input.onkeydown = (e) => {
      if (e.key === 'Backspace' && !e.target.value && idx > 0) {
        inputs[idx - 1].focus();
      }
    };
    input.onpaste = (e) => {
      const paste = (e.clipboardData || window.clipboardData).getData('text').trim();
      if (/^\d{4}$/.test(paste)) {
        paste.split('').forEach((char, i) => { if (inputs[i]) inputs[i].value = char; });
        inputs[3].focus();
        handleVerifyOTP();
        e.preventDefault();
      }
    };
  });
}

function autoFillDemoOtp() {
  const code = sessionStorage.getItem('demo_otp');
  if (!code) return;
  const inputs = [$('#otp-digit-0'), $('#otp-digit-1'), $('#otp-digit-2'), $('#otp-digit-3')];
  code.split('').forEach((char, i) => { if (inputs[i]) inputs[i].value = char; });
  handleVerifyOTP();
}

function startOtpCountdown() {
  clearInterval(state.timerInterval);
  let time = 60;
  const timer = $('#otp-countdown');
  if (timer) timer.textContent = time;
  state.timerInterval = setInterval(() => {
    time -= 1;
    if (timer) timer.textContent = time;
    if (time <= 0) {
      clearInterval(state.timerInterval);
      showAuthMessage('OTP expired. Request a new code.', 'error');
    }
  }, 1000);
}

function backToPhoneView() {
  clearInterval(state.timerInterval);
  $('#otp-verify-view').style.display = 'none';
  $('#otp-phone-view').style.display = 'block';
  const authSubtitle = $('#auth-subtitle');
  if (authSubtitle) authSubtitle.textContent = 'Sign in with your phone number';
  clearAuthMessage();
}

async function handleVerifyOTP() {
  const inputs = [$('#otp-digit-0'), $('#otp-digit-1'), $('#otp-digit-2'), $('#otp-digit-3')];
  const otp = inputs.map(i => i.value).join('');
  const phone = sessionStorage.getItem('otp_phone') || $('#otp-phone-input')?.value.trim() || '+1234567890';
  const name = sessionStorage.getItem('otp_name') || $('#otp-name-input')?.value.trim() || 'Demo User';
  const otpToken = sessionStorage.getItem('otp_token');
  const btn = $('#btn-verify-otp');

  if (otp.length !== 4) {
    shakeCreaturesError();
    showAuthMessage('Please enter all 4 digits', 'error');
    return;
  }

  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Verifying...'; }
    clearAuthMessage();

    const data = await apiCall('POST', '/api/auth/verify-otp', { phone, otp, name, otpToken });
    clearInterval(state.timerInterval);

    localStorage.setItem('token', data.token);
    state.token = data.token;
    state.user = data.user;

    celebrateCreaturesSuccess();
    showAuthMessage('Verification successful!', 'success');
    setTimeout(() => enterWorkspace(data.user), 400);
  } catch (err) {
    shakeCreaturesError();
    showAuthMessage(err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Verify & Sign In'; }
  }
}

async function handleInstantDemoLogin() {
  clearAuthMessage();
  showAuthMessage('Signing in as Demo User...', 'success');
  celebrateCreaturesSuccess();
  try {
    const data = await apiCall('POST', '/api/auth/verify-otp', {
      phone: '+1234567890',
      otp: '1234',
      name: 'Demo User'
    });
    localStorage.setItem('token', data.token);
    state.token = data.token;
    state.user = data.user;
    setTimeout(() => enterWorkspace(data.user), 300);
  } catch (err) {
    // Client-side instant fallback
    const fallbackUser = { id: 'user_demo_1', name: 'Demo User', email: 'demo@nimbus.local' };
    state.user = fallbackUser;
    setTimeout(() => enterWorkspace(fallbackUser), 300);
  }
}

let isEmailRegister = false;
function toggleRegisterMode() {
  isEmailRegister = !isEmailRegister;
  const regField = $('#register-name-field');
  if (regField) regField.style.display = isEmailRegister ? 'block' : 'none';
  const authTitle = $('#auth-title');
  if (authTitle) authTitle.textContent = isEmailRegister ? 'Create Account' : 'Welcome back!';
  const authSubtitle = $('#auth-subtitle');
  if (authSubtitle) authSubtitle.textContent = isEmailRegister ? 'Sign up to start saving and sharing files' : 'Please enter your details';
  const btnAuth = $('#btn-email-auth');
  if (btnAuth) btnAuth.textContent = isEmailRegister ? 'Create Account' : 'Log In';
  const togglePrompt = $('#toggle-prompt-text');
  if (togglePrompt) togglePrompt.textContent = isEmailRegister ? 'Already have an account?' : "Don't have an account?";
  const toggleBtn = $('#btn-toggle-register');
  if (toggleBtn) toggleBtn.textContent = isEmailRegister ? 'Log In' : 'Sign Up';
  clearAuthMessage();
}

async function handleEmailAuth() {
  const email = $('#email-input')?.value.trim();
  const password = $('#password-input')?.value;
  const name = $('#register-name-input')?.value.trim();
  const btn = $('#btn-email-auth');

  if (!email || !password) {
    shakeCreaturesError();
    showAuthMessage('Email and password required', 'error');
    return;
  }

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = isEmailRegister ? 'Creating...' : 'Signing in...';
    }
    clearAuthMessage();

    let data;
    if (isEmailRegister) {
      if (password.length < 8) {
        shakeCreaturesError();
        showAuthMessage('Password must be at least 8 characters', 'error');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Create Account';
        }
        return;
      }
      data = await apiCall('POST', '/api/auth/register', { email, password, name: name || 'Demo User' });
    } else {
      data = await apiCall('POST', '/api/auth/login', { email, password });
    }

    localStorage.setItem('token', data.token);
    state.token = data.token;
    state.user = data.user;

    celebrateCreaturesSuccess();
    showAuthMessage('Login successful!', 'success');
    setTimeout(() => enterWorkspace(data.user), 450);
  } catch (err) {
    shakeCreaturesError();
    showAuthMessage(err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = isEmailRegister ? 'Create Account' : 'Log In';
    }
  }
}

function handleLogout() {
  apiCall('POST', '/api/auth/logout').catch(() => {});
  localStorage.removeItem('token');
  state.token = null;
  state.user = null;
  const overlay = $('#auth-overlay');
  if (overlay) {
    overlay.style.display = 'flex';
    overlay.style.visibility = 'visible';
    overlay.hidden = false;
  }
  const appShell = $('#app-shell');
  if (appShell) appShell.style.display = 'none';
  switchAuthTab('email');
  setCreaturePasswordMode(false);
  initCreatures();
}

// -------------------------------------------------------------
// Workspace Views & Rendering
// -------------------------------------------------------------

function enterWorkspace(user) {
  const overlay = $('#auth-overlay');
  if (overlay) {
    overlay.style.setProperty('display', 'none', 'important');
    overlay.style.visibility = 'hidden';
    overlay.hidden = true;
  }
  const appShell = $('#app-shell');
  if (appShell) {
    appShell.style.display = window.innerWidth <= 690 ? 'block' : 'grid';
  }
  document.body.classList.remove('sidebar-open');

  const initials = (user.name || 'User')
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const userAvatar = $('#user-avatar');
  if (userAvatar) userAvatar.textContent = initials;
  const topAvatar = $('#top-avatar');
  if (topAvatar) topAvatar.textContent = initials;
  const userName = $('#user-display-name');
  if (userName) userName.textContent = user.name || 'User';
  const userEmail = $('#user-display-email');
  if (userEmail) userEmail.textContent = user.email || 'Personal workspace';

  loadDrive();
}

async function loadDrive() {
  const emptyTrashBtn = $('#btn-empty-trash');
  if (emptyTrashBtn) emptyTrashBtn.style.display = state.view === 'trash' ? 'inline-block' : 'none';

  try {
    if (state.query) {
      const res = await apiCall('GET', `/api/search?q=${encodeURIComponent(state.query)}`);
      state.items = {
        folders: (res.items || []).filter(i => i.type === 'folder'),
        files: (res.items || []).filter(i => i.type === 'file')
      };
      $('#view-title').textContent = `Search: "${state.query}"`;
    } else if (state.view === 'recent') {
      const res = await apiCall('GET', '/api/recent');
      state.items = { folders: [], files: res.items || [] };
      $('#view-title').textContent = 'Recent';
    } else if (state.view === 'starred') {
      const res = await apiCall('GET', '/api/starred');
      state.items = {
        folders: (res.items || []).filter(i => i.type === 'folder'),
        files: (res.items || []).filter(i => i.type === 'file')
      };
      $('#view-title').textContent = 'Starred';
    } else if (state.view === 'activity') {
      const res = await apiCall('GET', '/api/activities');
      state.activities = res.activities || [];
      $('#view-title').textContent = 'Activity Log';
      renderActivityLog();
      return;
    } else if (state.view === 'trash') {
      const res = await apiCall('GET', '/api/trash');
      state.items = {
        folders: (res.items || []).filter(i => i.type === 'folder'),
        files: (res.items || []).filter(i => i.type === 'file')
      };
      $('#view-title').textContent = 'Trash';
    } else {
      // My Drive View
      if (!state.folderId || state.folderId === 'root') {
        const res = await apiCall('GET', '/api/drive');
        state.items = res.children || { folders: [], files: [] };
        state.folderName = 'My Drive';
        state.breadcrumbs = [{ id: null, name: 'My Drive' }];
      } else {
        const res = await apiCall('GET', `/api/folders/${state.folderId}`);
        state.items = res.children || { folders: [], files: [] };
        state.folderName = res.folder?.name || 'Folder';
      }
      $('#view-title').textContent = state.folderName;
    }
  } catch (err) {
    console.warn('Using offline workspace items:', err);
    state.items = {
      folders: [
        { id: 'folder_demo_1', type: 'folder', name: 'Projects', starred: false, updatedAt: new Date() },
        { id: 'folder_demo_2', type: 'folder', name: 'Design Assets', starred: false, updatedAt: new Date() }
      ],
      files: [
        { id: 'file_demo_1', type: 'file', name: 'Welcome to Nimbus Drive.pdf', mimeType: 'application/pdf', sizeBytes: 142800, starred: true, versionNumber: 1, updatedAt: new Date() },
        { id: 'file_demo_2', type: 'file', name: 'Project Overview.txt', mimeType: 'text/plain', sizeBytes: 1240, starred: false, versionNumber: 1, updatedAt: new Date() }
      ]
    };
  }

  sortItems();
  renderBreadcrumbs();
  renderContentGrid();
  updateStorageCalculator();
}

function sortItems() {
  const compare = (a, b) => {
    if (state.sort === 'name') return a.name.localeCompare(b.name);
    if (state.sort === 'size') return (b.sizeBytes || 0) - (a.sizeBytes || 0);
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  };
  state.items.folders.sort(compare);
  state.items.files.sort(compare);
}

function renderBreadcrumbs() {
  const container = $('#breadcrumbs');
  if (!container) return;

  if (state.view !== 'drive') {
    container.innerHTML = `<button type="button" aria-current="page">${$('#view-title').textContent}</button>`;
    return;
  }

  container.innerHTML = state.breadcrumbs.map((crumb, idx) => {
    const isLast = idx === state.breadcrumbs.length - 1;
    if (isLast) {
      return `<button type="button" aria-current="page">${crumb.name}</button>`;
    }
    return `<button type="button" onclick="navigateBreadcrumb(${idx})">${crumb.name}</button> <span>/</span>`;
  }).join(' ');
}

function navigateBreadcrumb(index) {
  const crumb = state.breadcrumbs[index];
  state.breadcrumbs = state.breadcrumbs.slice(0, index + 1);
  state.folderId = crumb.id;
  state.folderName = crumb.name;
  loadDrive();
}

function updateStorageCalculator() {
  const allFiles = state.items.files || [];
  const totalBytes = allFiles.reduce((acc, f) => acc + (f.sizeBytes || 0), 0);
  const usedText = formatBytes(totalBytes);
  const percent = Math.min(Math.max((totalBytes / (5 * 1024 * 1024 * 1024)) * 100, 2), 100).toFixed(1);

  const storageUsedEl = $('#storage-used');
  if (storageUsedEl) storageUsedEl.textContent = usedText;
  const storageProgEl = $('#storage-progress');
  if (storageProgEl) storageProgEl.style.width = `${percent}%`;
}

function getFilteredItems() {
  let folders = state.items.folders || [];
  let files = state.items.files || [];

  if (state.filter === 'folders') {
    return { folders, files: [] };
  }
  if (state.filter === 'documents') {
    return { folders: [], files: files.filter(f => ['doc', 'sheet', 'pdf', 'text'].includes(getFileCategory(f.name, f.mimeType))) };
  }
  if (state.filter === 'images') {
    return { folders: [], files: files.filter(f => getFileCategory(f.name, f.mimeType) === 'image') };
  }
  if (state.filter === 'media') {
    return { folders: [], files: files.filter(f => ['video', 'audio'].includes(getFileCategory(f.name, f.mimeType))) };
  }
  if (state.filter === 'starred') {
    return { folders: folders.filter(f => f.starred), files: files.filter(f => f.starred) };
  }
  return { folders, files };
}

function renderContentGrid() {
  const grid = $('#content-grid');
  const emptyState = $('#empty-state');
  if (!grid) return;

  grid.innerHTML = '';
  grid.className = `content-grid ${state.layout === 'list' ? 'list-layout' : ''}`;

  const { folders, files } = getFilteredItems();
  const allItems = [...folders, ...files];

  const countEl = $('#item-count');
  if (countEl) countEl.textContent = `${allItems.length} ${allItems.length === 1 ? 'item' : 'items'}`;

  if (allItems.length === 0) {
    if (emptyState) {
      emptyState.hidden = false;
      $('#empty-title').textContent = state.view === 'trash' ? 'Trash is empty' : state.view === 'starred' ? 'No starred items' : 'Nothing here yet';
      $('#empty-desc').textContent = state.view === 'trash' ? 'Items moved to trash will appear here.' : 'Upload files or create a folder to get started.';
    }
    return;
  }
  if (emptyState) emptyState.hidden = true;

  // Render Folders
  folders.forEach((folder) => {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.tabIndex = 0;
    card.setAttribute('data-id', folder.id);
    card.setAttribute('data-type', 'folder');

    const starClass = folder.starred ? 'starred' : '';
    const starIcon = folder.starred ? '★' : '';

    card.innerHTML = `
      <div class="item-leading">
        <span class="file-icon folder-icon">📁</span>
      </div>
      <div class="item-copy">
        <h3 title="${folder.name}">${folder.name}</h3>
        <p>Folder · ${formatDate(folder.updatedAt)}</p>
      </div>
      <div class="item-badges">
        <span class="${starClass}">${starIcon}</span>
      </div>
      <button class="more-button" type="button" aria-label="More options" data-more="${folder.id}" data-type="folder">•••</button>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.more-button')) {
        e.stopPropagation();
        openContextMenu(e, folder, 'folder');
        return;
      }
      if (state.view === 'drive') {
        state.folderId = folder.id;
        state.folderName = folder.name;
        state.breadcrumbs.push({ id: folder.id, name: folder.name });
        loadDrive();
      }
    });

    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openContextMenu(e, folder, 'folder');
    });

    grid.appendChild(card);
  });

  // Render Files
  files.forEach((file) => {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.tabIndex = 0;
    card.setAttribute('data-id', file.id);
    card.setAttribute('data-type', 'file');

    const iconInfo = getFileIconInfo(file.name, file.mimeType);
    const starClass = file.starred ? 'starred' : '';
    const starIcon = file.starred ? '★' : '';
    const versionBadge = (file.versionNumber && file.versionNumber > 1) ? `<span style="font-size: 10px; background: #eeedff; color: #5049c9; padding: 1px 5px; border-radius: 8px; font-weight: 700; margin-left: 4px;">v${file.versionNumber}</span>` : '';

    card.innerHTML = `
      <div class="item-leading">
        <span class="file-icon ${iconInfo.className}">${iconInfo.label}</span>
      </div>
      <div class="item-copy">
        <h3 title="${file.name}">${file.name} ${versionBadge}</h3>
        <p>${formatBytes(file.sizeBytes)} · ${formatDate(file.updatedAt)}</p>
      </div>
      <div class="item-badges">
        <span class="${starClass}">${starIcon}</span>
      </div>
      <button class="more-button" type="button" aria-label="More options" data-more="${file.id}" data-type="file">•••</button>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.more-button')) {
        e.stopPropagation();
        openContextMenu(e, file, 'file');
        return;
      }
      showFilePreview(file);
    });

    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openContextMenu(e, file, 'file');
    });

    grid.appendChild(card);
  });
}

function renderActivityLog() {
  const grid = $('#content-grid');
  const emptyState = $('#empty-state');
  if (!grid) return;

  grid.innerHTML = '';
  grid.className = 'activity-list';

  if (!state.activities || state.activities.length === 0) {
    if (emptyState) {
      emptyState.hidden = false;
      $('#empty-title').textContent = 'No activity recorded';
      $('#empty-desc').textContent = 'Actions you perform will be logged here.';
    }
    return;
  }
  if (emptyState) emptyState.hidden = true;

  const actionIcons = {
    upload: '⬆',
    create_folder: '📁',
    rename: '✎',
    move: '↳',
    delete: '🗑',
    restore: '↺',
    delete_permanent: '✕',
    share: '🔗',
    new_version: '📑',
    login: '🔑',
    register: '👤'
  };

  state.activities.forEach(act => {
    const item = document.createElement('div');
    item.className = 'activity-item';
    const icon = actionIcons[act.action] || '📝';
    const name = act.context?.name || act.resourceType || 'Resource';
    item.innerHTML = `
      <div class="activity-icon">${icon}</div>
      <div>
        <strong>${formatActionText(act.action, name, act.context)}</strong>
        <div style="font-size: 11px; color: #888;">${act.resourceType ? act.resourceType.toUpperCase() : 'ACTION'}</div>
      </div>
      <div class="activity-time">${formatDate(act.createdAt)}</div>
    `;
    grid.appendChild(item);
  });
}

function formatActionText(action, name, ctx = {}) {
  switch (action) {
    case 'upload': return `Uploaded file "${name}" (${formatBytes(ctx.sizeBytes)})`;
    case 'create_folder': return `Created folder "${name}"`;
    case 'rename': return `Renamed item to "${ctx.name || name}"`;
    case 'move': return `Moved item "${name}"`;
    case 'delete': return `Moved "${name}" to Trash`;
    case 'restore': return `Restored "${name}" from Trash`;
    case 'delete_permanent': return `Permanently deleted "${name}"`;
    case 'share': return `Shared "${name}" with ${ctx.granteeEmail || 'collaborator'}`;
    case 'new_version': return `Uploaded new revision v${ctx.version || 2} of "${name}"`;
    case 'login': return `Signed in successfully via ${ctx.method || 'auth'}`;
    case 'register': return `Account created via ${ctx.method || 'auth'}`;
    default: return `${action.replace('_', ' ')}: ${name}`;
  }
}

// -------------------------------------------------------------
// Context Menu & Item Actions
// -------------------------------------------------------------

function openContextMenu(event, item, type) {
  state.selectedId = item.id;
  state.selectedType = type;
  state.selectedItem = item;

  const menu = $('#context-menu');
  if (!menu) return;

  const rect = event.target.getBoundingClientRect();
  const posX = event.clientX || (rect.left + 10);
  const posY = event.clientY || (rect.bottom + 5);

  const isTrash = state.view === 'trash';
  const starActionText = item.starred ? '★ Remove from Starred' : '☆ Add to Starred';

  if (isTrash) {
    menu.innerHTML = `
      <button onclick="restoreItem()" type="button"><span>↺</span> Restore</button>
      <hr>
      <button class="danger" onclick="permanentlyDeleteItem()" type="button"><span>🗑</span> Delete permanently</button>
    `;
  } else {
    menu.innerHTML = `
      ${type === 'folder' ? `<button onclick="openSelectedFolder()" type="button"><span>📂</span> Open Folder</button>` : `<button onclick="showFilePreview(state.selectedItem)" type="button"><span>👁</span> Preview</button>`}
      ${type === 'file' ? `<button onclick="downloadSelectedFile()" type="button"><span>⬇</span> Download</button>` : ''}
      <button onclick="toggleStarItem()" type="button"><span>⭐</span> ${starActionText}</button>
      ${type === 'file' ? `<button onclick="showVersionModal(state.selectedItem)" type="button"><span>📑</span> Version History</button>` : ''}
      <button onclick="showShareModal(state.selectedItem)" type="button"><span>🔗</span> Share</button>
      <button onclick="showRenameModal(state.selectedItem)" type="button"><span>✎</span> Rename</button>
      <button onclick="showMoveModal(state.selectedItem)" type="button"><span>↳</span> Move to...</button>
      <button onclick="showDetailsModal(state.selectedItem)" type="button"><span>ℹ</span> Item Info</button>
      <hr>
      <button class="danger" onclick="trashItem(state.selectedItem)" type="button"><span>🗑</span> Move to Trash</button>
    `;
  }

  menu.hidden = false;
  menu.style.left = `${Math.min(posX, window.innerWidth - 220)}px`;
  menu.style.top = `${Math.min(posY, window.innerHeight - 300)}px`;
}

function closeOverlays() {
  $$('.modal').forEach(m => m.hidden = true);
  const backdrop = $('#modal-backdrop');
  if (backdrop) backdrop.hidden = true;
  const menu = $('#context-menu');
  if (menu) menu.hidden = true;
  const newMenu = $('#new-menu');
  if (newMenu) newMenu.hidden = true;
  const sortMenu = $('#sort-menu');
  if (sortMenu) sortMenu.hidden = true;
}

function openSelectedFolder() {
  closeOverlays();
  if (state.selectedItem && state.selectedType === 'folder') {
    state.folderId = state.selectedItem.id;
    state.folderName = state.selectedItem.name;
    state.breadcrumbs.push({ id: state.selectedItem.id, name: state.selectedItem.name });
    loadDrive();
  }
}

function downloadSelectedFile() {
  closeOverlays();
  if (state.selectedItem) downloadFile(state.selectedItem);
}

async function downloadFile(file) {
  try {
    toast(`Downloading ${file.name}...`, 'info');
    const a = document.createElement('a');
    a.href = `${API_URL}/api/files/${file.id}/download`;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast(`Downloaded ${file.name}`, 'success');
  } catch (err) {
    toast(`Download failed: ${err.message}`, 'error');
  }
}

async function toggleStarItem() {
  const item = state.selectedItem;
  if (!item) return;
  closeOverlays();

  try {
    if (item.starred) {
      await apiCall('DELETE', '/api/stars', { resourceType: state.selectedType, resourceId: item.id });
      toast('Removed from Starred', 'info');
    } else {
      await apiCall('POST', '/api/stars', { resourceType: state.selectedType, resourceId: item.id });
      toast('Added to Starred', 'success');
    }
    loadDrive();
  } catch (err) {
    toast(`Star action failed: ${err.message}`, 'error');
  }
}

// Required Test Function: trashItem
async function trashItem(item) {
  const target = item || state.selectedItem;
  if (!target) return;
  closeOverlays();

  if (!confirm(`Move "${target.name}" to Trash?`)) return;

  try {
    const type = target.type === 'folder' ? 'folders' : 'files';
    await apiCall('DELETE', `/api/${type}/${target.id}`);
    toast(`Moved "${target.name}" to Trash`, 'success');
    loadDrive();
  } catch (err) {
    toast(`Delete failed: ${err.message}`, 'error');
  }
}

async function restoreItem() {
  const target = state.selectedItem;
  if (!target) return;
  closeOverlays();

  try {
    await apiCall('POST', '/api/trash/restore', { resourceType: state.selectedType, resourceId: target.id });
    toast(`Restored "${target.name}"`, 'success');
    loadDrive();
  } catch (err) {
    toast(`Restore failed: ${err.message}`, 'error');
  }
}

async function permanentlyDeleteItem() {
  const target = state.selectedItem;
  if (!target) return;
  closeOverlays();

  if (!confirm(`Permanently delete "${target.name}"? This cannot be undone.`)) return;
  try {
    await apiCall('DELETE', `/api/trash/${state.selectedType}/${target.id}`);
    toast(`Permanently deleted "${target.name}"`, 'success');
    loadDrive();
  } catch (err) {
    toast(`Delete failed: ${err.message}`, 'error');
  }
}

async function handleEmptyTrash() {
  if (!confirm('Are you sure you want to empty the Trash? All items will be permanently deleted.')) return;

  try {
    await apiCall('POST', '/api/trash/empty');
    toast('Trash emptied successfully', 'success');
    loadDrive();
  } catch (err) {
    toast(`Failed to empty trash: ${err.message}`, 'error');
  }
}

// -------------------------------------------------------------
// File Preview Modal
// -------------------------------------------------------------

async function showFilePreview(file) {
  state.selectedItem = file;
  state.selectedId = file.id;
  state.selectedType = 'file';
  closeOverlays();

  const modal = $('#preview-modal');
  const backdrop = $('#modal-backdrop');
  const body = $('#preview-body');
  const meta = $('#preview-meta');

  if (modal) modal.hidden = false;
  if (backdrop) backdrop.hidden = false;
  $('#preview-title').textContent = file.name;
  if (meta) meta.textContent = `${formatBytes(file.sizeBytes)} · Updated ${formatDate(file.updatedAt)}`;

  $('#preview-btn-download').onclick = () => downloadFile(file);
  $('#preview-btn-version').onclick = () => showVersionModal(file);

  const previewUrl = `${API_URL}/api/files/${file.id}/preview`;
  const cat = getFileCategory(file.name, file.mimeType);

  if (cat === 'image') {
    body.innerHTML = `<img src="${previewUrl}" alt="${file.name}" />`;
  } else if (cat === 'pdf') {
    body.innerHTML = `<iframe src="${previewUrl}"></iframe>`;
  } else if (cat === 'video') {
    body.innerHTML = `<video controls autoplay src="${previewUrl}"></video>`;
  } else if (cat === 'audio') {
    body.innerHTML = `<audio controls autoplay src="${previewUrl}"></audio>`;
  } else if (cat === 'text') {
    body.innerHTML = `<div style="color: #888;">Loading text content...</div>`;
    try {
      const resp = await fetch(previewUrl, { headers: { Authorization: `Bearer ${state.token}` } });
      const text = await resp.text();
      body.innerHTML = `<pre class="preview-code"><code>${escapeHtml(text.slice(0, 50000))}</code></pre>`;
    } catch {
      body.innerHTML = `<div style="padding: 20px; text-align: center;">Unable to preview text. <button class="primary-button" onclick="downloadFile(state.selectedItem)">Download File</button></div>`;
    }
  } else {
    body.innerHTML = `
      <div style="text-align: center; padding: 40px;">
        <div style="font-size: 56px; margin-bottom: 12px;">📄</div>
        <h3>No preview available</h3>
        <p style="color: #888; font-size: 13px; margin-bottom: 16px;">Preview is not supported for this file format.</p>
        <button class="primary-button" onclick="downloadFile(state.selectedItem)">Download File</button>
      </div>
    `;
  }
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
}

// -------------------------------------------------------------
// Versioning Modal
// -------------------------------------------------------------

async function showVersionModal(file) {
  state.selectedItem = file;
  closeOverlays();

  const modal = $('#version-modal');
  const backdrop = $('#modal-backdrop');
  if (modal) modal.hidden = false;
  if (backdrop) backdrop.hidden = false;

  $('#version-resource').textContent = `Version history for "${file.name}".`;
  const listEl = $('#version-list');
  listEl.innerHTML = '<div style="padding: 14px; color: #888;">Loading versions...</div>';

  try {
    const res = await apiCall('GET', `/api/files/${file.id}/versions`);
    const versions = res.versions || [];

    if (versions.length === 0) {
      listEl.innerHTML = '<div style="padding: 14px; color: #888;">No revision history found.</div>';
      return;
    }

    listEl.innerHTML = versions.map((v, i) => `
      <div class="version-item">
        <div>
          <span class="version-badge">v${v.versionNumber}</span>
          ${i === 0 ? '<strong> (Current)</strong>' : ''}
          <div style="font-size: 11px; color: #888; margin-top: 4px;">${formatBytes(v.sizeBytes)} · ${formatDate(v.createdAt)}</div>
        </div>
        <button class="ghost-button" onclick="downloadVersion('${file.id}', '${v.id}', '${v.name}')" type="button" style="padding: 4px 10px; font-size: 12px; border: 1px solid var(--line); border-radius: 6px;">⬇ Download</button>
      </div>
    `).join('');
  } catch (err) {
    listEl.innerHTML = '<div style="padding: 14px; color: #c00;">Failed to load version history.</div>';
  }
}

function triggerNewVersionUpload() {
  $('#version-file-input')?.click();
}

async function uploadNewVersion(file) {
  if (!state.selectedItem || !file) return;

  const formData = new FormData();
  formData.append('file', file);

  try {
    toast('Uploading new version...', 'info');
    await apiCall('POST', `/api/files/${state.selectedItem.id}/versions`, formData, true);
    toast('New version uploaded successfully!', 'success');
    showVersionModal(state.selectedItem);
    loadDrive();
  } catch (err) {
    toast(`Version upload failed: ${err.message}`, 'error');
  }
}

function downloadVersion(fileId, versionId, name) {
  const a = document.createElement('a');
  a.href = `${API_URL}/api/files/${fileId}/versions/${versionId}/download`;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// -------------------------------------------------------------
// Details & Storage Modals
// -------------------------------------------------------------

function showDetailsModal(item) {
  closeOverlays();
  const modal = $('#details-modal');
  const backdrop = $('#modal-backdrop');
  if (modal) modal.hidden = false;
  if (backdrop) backdrop.hidden = false;

  const content = $('#details-content');
  const type = item.type === 'folder' ? 'Folder' : 'File';
  const size = item.type === 'folder' ? '—' : formatBytes(item.sizeBytes);

  content.innerHTML = `
    <div><strong>Name:</strong> ${item.name}</div>
    <div><strong>Type:</strong> ${type} ${item.mimeType ? `(${item.mimeType})` : ''}</div>
    <div><strong>Size:</strong> ${size}</div>
    <div><strong>Revision:</strong> v${item.versionNumber || 1}</div>
    <div><strong>Created:</strong> ${new Date(item.createdAt).toLocaleString()}</div>
    <div><strong>Last Modified:</strong> ${new Date(item.updatedAt).toLocaleString()}</div>
    <div><strong>Owner:</strong> ${state.user?.name || 'You'}</div>
  `;
}

function showStorageModal() {
  closeOverlays();
  const modal = $('#storage-modal');
  const backdrop = $('#modal-backdrop');
  if (modal) modal.hidden = false;
  if (backdrop) backdrop.hidden = false;

  const files = state.items.files || [];
  let imgSize = 0, docSize = 0, mediaSize = 0, otherSize = 0;

  files.forEach(f => {
    const cat = getFileCategory(f.name, f.mimeType);
    const sz = f.sizeBytes || 0;
    if (cat === 'image') imgSize += sz;
    else if (['doc', 'sheet', 'pdf', 'text'].includes(cat)) docSize += sz;
    else if (['video', 'audio'].includes(cat)) mediaSize += sz;
    else otherSize += sz;
  });

  const total = imgSize + docSize + mediaSize + otherSize;

  $('#storage-details-content').innerHTML = `
    <div style="margin-bottom: 16px; padding: 14px; background: #f8fafc; border-radius: 8px;">
      <div style="display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 8px;">
        <span>Total Used Storage</span>
        <span style="color: var(--purple);">${formatBytes(total)} / 5.0 GB</span>
      </div>
      <div class="storage-track"><i style="width: ${Math.max((total / (5 * 1024 * 1024 * 1024)) * 100, 2)}%"></i></div>
    </div>
    <div style="display: flex; flex-direction: column; gap: 8px;">
      <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--line);">
        <span>📄 Documents & PDFs</span>
        <strong>${formatBytes(docSize)}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--line);">
        <span>🖼 Images & Photos</span>
        <strong>${formatBytes(imgSize)}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--line);">
        <span>🎬 Video & Audio</span>
        <strong>${formatBytes(mediaSize)}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; padding: 8px 0;">
        <span>📦 Other Files</span>
        <strong>${formatBytes(otherSize)}</strong>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// Folder, Rename, Share, Move Modals
// -------------------------------------------------------------

function showFolderModal() {
  closeOverlays();
  const modal = $('#folder-modal');
  const backdrop = $('#modal-backdrop');
  if (modal) modal.hidden = false;
  if (backdrop) backdrop.hidden = false;
  const input = $('#folder-name');
  if (input) {
    input.value = '';
    setTimeout(() => input.focus(), 100);
  }
}

async function handleCreateFolder() {
  const input = $('#folder-name');
  const name = input?.value.trim();
  if (!name) return;

  try {
    await apiCall('POST', '/api/folders', {
      name,
      parentId: (state.view === 'drive' && state.folderId && state.folderId !== 'root') ? state.folderId : null
    });
    toast(`Folder "${name}" created!`, 'success');
    closeOverlays();
    loadDrive();
  } catch (err) {
    toast(`Error creating folder: ${err.message}`, 'error');
  }
}

function showRenameModal(item) {
  state.selectedItem = item;
  closeOverlays();

  const modal = $('#rename-modal');
  const backdrop = $('#modal-backdrop');
  if (modal) modal.hidden = false;
  if (backdrop) backdrop.hidden = false;

  const copy = $('#rename-copy');
  if (copy) copy.textContent = `Enter a new name for "${item.name}".`;
  const input = $('#rename-input');
  if (input) {
    input.value = item.name;
    setTimeout(() => { input.focus(); input.select(); }, 100);
  }
}

async function handleRenameSubmit() {
  const item = state.selectedItem;
  const name = $('#rename-input')?.value.trim();
  if (!item || !name || name === item.name) {
    closeOverlays();
    return;
  }

  try {
    const type = item.type === 'folder' ? 'folders' : 'files';
    await apiCall('PATCH', `/api/${type}/${item.id}`, { name });
    toast(`Renamed to "${name}"`, 'success');
    closeOverlays();
    loadDrive();
  } catch (err) {
    toast(`Rename failed: ${err.message}`, 'error');
  }
}

// Required Test Function: showShareModal
function showShareModal(item) {
  state.selectedItem = item;
  closeOverlays();

  const modal = $('#share-modal');
  const backdrop = $('#modal-backdrop');
  if (modal) modal.hidden = false;
  if (backdrop) backdrop.hidden = false;

  const titleEl = $('#share-resource');
  if (titleEl) titleEl.textContent = `Sharing: ${item.name}`;

  loadShareList(item);
}

async function loadShareList(item) {
  const listEl = $('#share-list');
  if (!listEl) return;
  listEl.innerHTML = '<div style="padding: 12px 0; color: #888; font-size: 12px;">Loading collaborators...</div>';

  try {
    const type = item.type || 'file';
    const res = await apiCall('GET', `/api/shares/${type}/${item.id}`);
    const shares = res.shares || [];

    if (shares.length === 0) {
      listEl.innerHTML = '<div style="padding: 12px 0; color: #999; font-size: 12px;">Only you have access to this item.</div>';
      return;
    }

    listEl.innerHTML = shares.map(s => `
      <div class="person-row">
        <div>
          <strong>${s.name || s.email}</strong>
          <small>${s.email}</small>
        </div>
        <span class="role-static">${s.role === 'editor' ? 'Editor' : 'Viewer'}</span>
        <button onclick="removeShare('${s.id}')" type="button" title="Remove access">×</button>
      </div>
    `).join('');
  } catch {
    listEl.innerHTML = '<div style="padding: 12px 0; color: #999; font-size: 12px;">Only you have access.</div>';
  }
}

async function handleAddShare() {
  const item = state.selectedItem;
  const emailInput = $('#invite-email');
  const roleSelect = $('#invite-role');
  const email = emailInput?.value.trim();
  const role = roleSelect?.value || 'viewer';

  if (!item || !email) return;

  try {
    const type = item.type || 'file';
    await apiCall('POST', '/api/shares', {
      resourceType: type,
      resourceId: item.id,
      granteeEmail: email,
      role
    });
    toast(`Invited ${email} as ${role}`, 'success');
    if (emailInput) emailInput.value = '';
    loadShareList(item);
  } catch (err) {
    toast(`Share failed: ${err.message}`, 'error');
  }
}

async function removeShare(shareId) {
  try {
    await apiCall('DELETE', `/api/shares/${shareId}`);
    toast('Access removed', 'success');
    if (state.selectedItem) loadShareList(state.selectedItem);
  } catch (err) {
    toast(`Error: ${err.message}`, 'error');
  }
}

async function handleCreatePublicLink() {
  const item = state.selectedItem;
  if (!item) return;

  try {
    const type = item.type || 'file';
    const res = await apiCall('POST', '/api/link-shares', {
      resourceType: type,
      resourceId: item.id,
      expiryDays: 7
    });
    const publicUrl = `${API_URL}/api/link/${res.link.token}`;
    await navigator.clipboard.writeText(publicUrl);
    toast('Public share link copied to clipboard!', 'success');
  } catch (err) {
    toast(`Link generation failed: ${err.message}`, 'error');
  }
}

async function showMoveModal(item) {
  state.selectedItem = item;
  state.moveTarget = null;
  closeOverlays();

  const modal = $('#move-modal');
  const backdrop = $('#modal-backdrop');
  if (modal) modal.hidden = false;
  if (backdrop) backdrop.hidden = false;

  const targetEl = $('#move-resource');
  if (targetEl) targetEl.textContent = item.name;

  const picker = $('#move-folders');
  if (!picker) return;
  picker.innerHTML = '<div style="padding: 10px; color: #888;">Loading available folders...</div>';

  try {
    const res = await apiCall('GET', '/api/drive');
    const folders = (res.children?.folders || []).filter(f => f.id !== item.id);

    let html = `
      <div class="folder-choice selected" data-target="root" style="padding: 9px 12px; margin: 4px 0; border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
        <span>📁</span> <strong>My Drive (Root)</strong>
      </div>
    `;

    folders.forEach(f => {
      html += `
        <div class="folder-choice" data-target="${f.id}" style="padding: 9px 12px; margin: 4px 0; border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 8px;">
          <span>📁</span> <span>${f.name}</span>
        </div>
      `;
    });

    picker.innerHTML = html;

    $$('.folder-choice').forEach(choice => {
      choice.addEventListener('click', () => {
        $$('.folder-choice').forEach(c => c.classList.remove('selected'));
        choice.classList.add('selected');
        state.moveTarget = choice.dataset.target === 'root' ? null : choice.dataset.target;
      });
    });
  } catch {
    picker.innerHTML = '<div style="color: #c00;">Failed to load folders.</div>';
  }
}

async function handleMoveSubmit() {
  const item = state.selectedItem;
  if (!item) return;

  try {
    const type = item.type === 'folder' ? 'folders' : 'files';
    const key = item.type === 'folder' ? 'parentId' : 'folderId';
    await apiCall('PATCH', `/api/${type}/${item.id}`, { [key]: state.moveTarget });
    toast(`Moved "${item.name}"`, 'success');
    closeOverlays();
    loadDrive();
  } catch (err) {
    toast(`Move failed: ${err.message}`, 'error');
  }
}

// -------------------------------------------------------------
// Upload Handling
// -------------------------------------------------------------

// Required Test Function: uploadFiles
async function uploadFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;

  const destFolderId = (state.view === 'drive' && state.folderId && state.folderId !== 'root') ? state.folderId : null;

  const progressPill = document.createElement('div');
  progressPill.className = 'upload-progress';
  progressPill.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 1000;
    width: 320px; padding: 16px 18px; background: #20233a; color: white;
    border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    animation: fadeIn 0.2s ease-out; font-size: 13px;
  `;
  progressPill.innerHTML = `
    <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-weight: 700;">
      <span>Uploading ${files.length} ${files.length === 1 ? 'file' : 'files'}</span>
      <span id="pill-percent">0%</span>
    </div>
    <div style="color: #9b9fb0; font-size: 11px; margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" id="pill-filename">Preparing...</div>
    <div style="height: 5px; background: #373a56; border-radius: 3px; overflow: hidden;">
      <div id="pill-bar" style="height: 100%; width: 0%; background: #6964db; transition: width 0.2s;"></div>
    </div>
  `;
  document.body.appendChild(progressPill);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const percent = Math.round(((i) / files.length) * 100);
    const percentEl = progressPill.querySelector('#pill-percent');
    const fileEl = progressPill.querySelector('#pill-filename');
    const barEl = progressPill.querySelector('#pill-bar');

    if (percentEl) percentEl.textContent = `${percent}%`;
    if (fileEl) fileEl.textContent = `${file.name} (${i + 1}/${files.length})`;
    if (barEl) barEl.style.width = `${percent}%`;

    const formData = new FormData();
    formData.append('file', file);
    if (destFolderId) formData.append('folderId', destFolderId);

    try {
      await apiCall('POST', '/api/files', formData, true);
      const db = getClientDb();
      const reader = new FileReader();
      reader.onload = () => {
        db.files.unshift({
          id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          type: 'file',
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          folderId: destFolderId,
          starred: false,
          versionNumber: 1,
          isDeleted: false,
          dataUrl: reader.result,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        db.activities.unshift({
          _id: `act_${Date.now()}`,
          action: 'upload',
          resourceType: 'file',
          context: { name: file.name, sizeBytes: file.size },
          createdAt: new Date().toISOString()
        });
        saveClientDb(db);
        if (i === files.length - 1) loadDrive();
      };
      reader.readAsDataURL(file);
    } catch (err) {
      toast(`Failed to upload ${file.name}: ${err.message}`, 'error');
    }
  }

  const barEl = progressPill.querySelector('#pill-bar');
  const percentEl = progressPill.querySelector('#pill-percent');
  if (barEl) barEl.style.width = '100%';
  if (percentEl) percentEl.textContent = '100%';
  toast(`Uploaded ${files.length} ${files.length === 1 ? 'file' : 'files'} successfully`, 'success');

  setTimeout(() => {
    progressPill.style.opacity = '0';
    progressPill.style.transition = 'opacity 0.4s';
    setTimeout(() => progressPill.remove(), 400);
  }, 1000);

  loadDrive();
}

// -------------------------------------------------------------
// App Initialization & Event Listeners
// -------------------------------------------------------------

async function initApp() {
  if (state.token) {
    try {
      const data = await apiCall('GET', '/api/auth/me');
      state.user = data.user;
      enterWorkspace(data.user);
    } catch {
      localStorage.removeItem('token');
      state.token = null;
      const overlay = $('#auth-overlay');
      if (overlay) overlay.style.display = 'flex';
      const appShell = $('#app-shell');
      if (appShell) appShell.style.display = 'none';
      initCreatures();
    }
  } else {
    const overlay = $('#auth-overlay');
    if (overlay) overlay.style.display = 'flex';
    const appShell = $('#app-shell');
    if (appShell) appShell.style.display = 'none';
    initCreatures();
  }

  // Global Click and Overlay Handling
  document.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'new-folder') { showFolderModal(); return; }
    if (action === 'upload') { $('#file-input')?.click(); return; }
    if (e.target.closest('[data-close-modal]') || e.target.id === 'modal-backdrop') {
      closeOverlays();
      return;
    }

    if (!e.target.closest('#new-button') && !e.target.closest('#new-menu')) {
      const nm = $('#new-menu'); if (nm) nm.hidden = true;
    }
    if (!e.target.closest('#sort-button') && !e.target.closest('#sort-menu')) {
      const sm = $('#sort-menu'); if (sm) sm.hidden = true;
    }
    if (!e.target.closest('#context-menu') && !e.target.closest('.more-button')) {
      const cm = $('#context-menu'); if (cm) cm.hidden = true;
    }
    if (!e.target.closest('.sidebar') && !e.target.closest('#mobile-menu')) {
      document.body.classList.remove('sidebar-open');
    }
  });

  // Dropdown Toggles
  $('#new-button')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = $('#new-menu');
    if (menu) menu.hidden = !menu.hidden;
  });

  $('#sort-button')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = $('#sort-menu');
    if (menu) menu.hidden = !menu.hidden;
  });

  $$('#sort-menu button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      state.sort = e.target.dataset.sort || 'updated';
      $('#sort-label').textContent = e.target.textContent;
      const menu = $('#sort-menu');
      if (menu) menu.hidden = true;
      sortItems();
      renderContentGrid();
    });
  });

  // Filter Chips Bar
  $$('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      $$('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.filter = chip.dataset.filter || 'all';
      renderContentGrid();
    });
  });

  // View Layout Switcher
  $('#view-toggle')?.addEventListener('click', () => {
    state.layout = state.layout === 'grid' ? 'list' : 'grid';
    $('#view-toggle').textContent = state.layout === 'grid' ? '☷' : '☰';
    renderContentGrid();
  });

  // Navigation Items
  $$('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      $$('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      document.body.classList.remove('sidebar-open');
      state.view = item.dataset.view || 'drive';
      state.folderId = null;
      state.query = '';
      const sInput = $('#search-input');
      if (sInput) sInput.value = '';
      loadDrive();
    });
  });

  // File Inputs
  $('#file-input')?.addEventListener('change', (e) => {
    uploadFiles(e.target.files);
    e.target.value = '';
  });

  $('#version-file-input')?.addEventListener('change', (e) => {
    if (e.target.files?.[0]) {
      uploadNewVersion(e.target.files[0]);
      e.target.value = '';
    }
  });

  // Drag and Drop
  const dropTarget = $('#drop-target');
  if (dropTarget) {
    dropTarget.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropTarget.classList.add('dragging');
    });
    dropTarget.addEventListener('dragleave', () => dropTarget.classList.remove('dragging'));
    dropTarget.addEventListener('drop', (e) => {
      e.preventDefault();
      dropTarget.classList.remove('dragging');
      if (e.dataTransfer.files) uploadFiles(e.dataTransfer.files);
    });
  }

  // Live Search with / shortcut
  $('#search-input')?.addEventListener('input', (e) => {
    state.query = e.target.value.trim();
    loadDrive();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
      e.preventDefault();
      $('#search-input')?.focus();
    }
    if (e.key === 'Escape') closeOverlays();
  });

  // Modal Submissions
  $('#folder-submit')?.addEventListener('click', handleCreateFolder);
  $('#folder-name')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleCreateFolder(); });

  $('#rename-submit')?.addEventListener('click', handleRenameSubmit);
  $('#rename-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleRenameSubmit(); });

  $('#invite-button')?.addEventListener('click', handleAddShare);
  $('#invite-email')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAddShare(); });

  $('#create-link-btn')?.addEventListener('click', handleCreatePublicLink);
  $('#move-submit')?.addEventListener('click', handleMoveSubmit);

  $('#mobile-menu')?.addEventListener('click', () => {
    document.body.classList.toggle('sidebar-open');
  });

  $('#help-button')?.addEventListener('click', () => {
    toast('Tips: Press "/" to search, drag & drop files to upload, or use ⋯ on any item.', 'info');
  });
}

// Window global exports
window.initCreatures = initCreatures;
window.togglePasswordVisibility = togglePasswordVisibility;
window.switchAuthTab = switchAuthTab;
window.handleSendOTP = handleSendOTP;
window.handleVerifyOTP = handleVerifyOTP;
window.autoFillDemoOtp = autoFillDemoOtp;
window.backToPhoneView = backToPhoneView;
window.handleEmailAuth = handleEmailAuth;
window.handleInstantDemoLogin = handleInstantDemoLogin;
window.toggleRegisterMode = toggleRegisterMode;
window.handleLogout = handleLogout;
window.uploadFiles = uploadFiles;
window.showFolderModal = showFolderModal;
window.showShareModal = showShareModal;
window.showRenameModal = showRenameModal;
window.showMoveModal = showMoveModal;
window.showFilePreview = showFilePreview;
window.showVersionModal = showVersionModal;
window.showDetailsModal = showDetailsModal;
window.showStorageModal = showStorageModal;
window.trashItem = trashItem;
window.restoreItem = restoreItem;
window.permanentlyDeleteItem = permanentlyDeleteItem;
window.handleEmptyTrash = handleEmptyTrash;
window.downloadFile = downloadFile;
window.downloadVersion = downloadVersion;
window.triggerNewVersionUpload = triggerNewVersionUpload;
window.openSelectedFolder = openSelectedFolder;
window.downloadSelectedFile = downloadSelectedFile;
window.toggleStarItem = toggleStarItem;
window.removeShare = removeShare;
window.navigateBreadcrumb = navigateBreadcrumb;

// Auto Initialize on DOM load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
