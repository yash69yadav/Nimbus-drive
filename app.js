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
    console.error(`[API Error] ${method} ${endpoint}:`, error.message);
    if (error.message.includes('Failed to fetch') || error.name === 'TypeError') {
      throw new Error(`Cannot connect to Nimbus API at ${API_URL}. Please ensure server is running.`);
    }
    throw error;
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
// Authentication
// -------------------------------------------------------------

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
    $('#tab-otp').classList.add('active');
    $('#tab-email').classList.remove('active');
    $('#otp-phone-view').style.display = 'block';
    $('#otp-verify-view').style.display = 'none';
    $('#email-auth-view').style.display = 'none';
    $('#auth-subtitle').textContent = 'Sign in with your phone number';
  } else {
    $('#tab-email').classList.add('active');
    $('#tab-otp').classList.remove('active');
    $('#otp-phone-view').style.display = 'none';
    $('#otp-verify-view').style.display = 'none';
    $('#email-auth-view').style.display = 'block';
    $('#auth-subtitle').textContent = 'Sign in with your email & password';
  }
}

async function handleSendOTP() {
  const phone = $('#otp-phone-input').value.trim();
  const name = $('#otp-name-input').value.trim();
  const btn = $('#btn-send-otp');

  if (!phone) {
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

    showAuthMessage(`OTP sent! Demo code: ${res.otp}`, 'success');

    $('#otp-phone-view').style.display = 'none';
    $('#otp-verify-view').style.display = 'block';
    $('#auth-subtitle').textContent = 'Enter the 4-digit code';

    if (res.otp) {
      $('#demo-pill').style.display = 'block';
      $('#demo-code-val').textContent = res.otp;
    }

    startOtpCountdown();
    setupOtpInputs();
    $('#otp-digit-0')?.focus();
  } catch (err) {
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
  $('#auth-subtitle').textContent = 'Sign in with your phone number';
  clearAuthMessage();
}

async function handleVerifyOTP() {
  const inputs = [$('#otp-digit-0'), $('#otp-digit-1'), $('#otp-digit-2'), $('#otp-digit-3')];
  const otp = inputs.map(i => i.value).join('');
  const phone = sessionStorage.getItem('otp_phone');
  const name = sessionStorage.getItem('otp_name');
  const btn = $('#btn-verify-otp');

  if (otp.length !== 4) {
    showAuthMessage('Please enter all 4 digits', 'error');
    return;
  }

  try {
    btn.disabled = true;
    btn.textContent = 'Verifying...';
    clearAuthMessage();

    const data = await apiCall('POST', '/api/auth/verify-otp', { phone, otp, name });
    clearInterval(state.timerInterval);

    localStorage.setItem('token', data.token);
    state.token = data.token;
    state.user = data.user;

    showAuthMessage('Verification successful!', 'success');
    setTimeout(() => enterWorkspace(data.user), 400);
  } catch (err) {
    showAuthMessage(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Verify & Sign In';
  }
}

let isEmailRegister = false;
function toggleRegisterMode() {
  isEmailRegister = !isEmailRegister;
  $('#register-name-field').style.display = isEmailRegister ? 'block' : 'none';
  $('#btn-email-auth').textContent = isEmailRegister ? 'Create Account' : 'Sign In';
  $('#btn-toggle-register').textContent = isEmailRegister ? 'Already have an account? Sign In' : 'Need an account? Register';
}

async function handleEmailAuth() {
  const email = $('#email-input').value.trim();
  const password = $('#password-input').value;
  const name = $('#register-name-input').value.trim();
  const btn = $('#btn-email-auth');

  if (!email || !password) {
    showAuthMessage('Email and password required', 'error');
    return;
  }

  try {
    btn.disabled = true;
    btn.textContent = isEmailRegister ? 'Creating...' : 'Signing in...';
    clearAuthMessage();

    let data;
    if (isEmailRegister) {
      if (password.length < 8) {
        showAuthMessage('Password must be at least 8 characters', 'error');
        btn.disabled = false;
        btn.textContent = 'Create Account';
        return;
      }
      data = await apiCall('POST', '/api/auth/register', { email, password, name: name || 'Demo User' });
    } else {
      data = await apiCall('POST', '/api/auth/login', { email, password });
    }

    localStorage.setItem('token', data.token);
    state.token = data.token;
    state.user = data.user;

    showAuthMessage('Login successful!', 'success');
    setTimeout(() => enterWorkspace(data.user), 400);
  } catch (err) {
    showAuthMessage(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = isEmailRegister ? 'Create Account' : 'Sign In';
  }
}

function handleLogout() {
  apiCall('POST', '/api/auth/logout').catch(() => {});
  localStorage.removeItem('token');
  state.token = null;
  state.user = null;
  $('#auth-overlay').style.display = 'flex';
  switchAuthTab('otp');
}

// -------------------------------------------------------------
// Workspace Views & Rendering
// -------------------------------------------------------------

function enterWorkspace(user) {
  $('#auth-overlay').style.display = 'none';

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
  try {
    const emptyTrashBtn = $('#btn-empty-trash');
    if (emptyTrashBtn) emptyTrashBtn.style.display = state.view === 'trash' ? 'inline-block' : 'none';

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

    sortItems();
    renderBreadcrumbs();
    renderContentGrid();
    updateStorageCalculator();
  } catch (err) {
    console.error('Failed to load items:', err);
    toast(err.message, 'error');
  }
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
      $('#auth-overlay').style.display = 'flex';
    }
  } else {
    $('#auth-overlay').style.display = 'flex';
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

// Auto Initialize on DOM load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
