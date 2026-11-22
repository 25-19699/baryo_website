(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const state = {
    user: null,
    page: 'Home',
    role: 'RESIDENT',
    dashboard: null,
    residents: [],
    documents: [],
    requests: [],
    history: [],
    announcements: [],
    notifications: [],
    readKeys: new Set(),
    notificationEnabled: localStorage.getItem('bk-web-notifications') !== 'off',
    soundEnabled: localStorage.getItem('bk-web-sound') !== 'off',
    theme: localStorage.getItem('bk-web-theme') || 'dark',
    notificationBaselineLoaded: false,
    installPrompt: null,
    categoryFilter: 'All',
    actionSubmit: null
  };

  const PAGES = [
    ['Home', 'HOME', 'pageHome', 'Home'],
    ['Residents', 'PEOPLE', 'pageResidents', 'Residents'],
    ['Barangay Documents', 'DOC', 'pageDocuments', 'Documents'],
    ['Document Requests', 'REQUEST', 'pageRequests', 'Requests'],
    ['History', 'HISTORY', 'pageHistory', 'History'],
    ['Announcements', 'MEGAPHONE', 'pageAnnouncements', 'News'],
    ['Notifications', 'MEGAPHONE', 'pageNotifications', 'Alerts'],
    ['Settings', 'GEAR', 'pageSettings', 'Settings']
  ];

  const ICON_PATHS = {
    HOME: '<path d="M3 11 L12 3 L21 11"/><path d="M5 9.5 V21 H19 V9.5"/><path d="M10 21 V15 H14 V21"/>',
    PEOPLE: '<circle cx="12" cy="7" r="4"/><path d="M4 22 C4 17 7 14 12 14 C17 14 20 17 20 22"/>',
    DOC: '<rect x="5" y="2" width="14" height="20" rx="4"/><path d="M8.5 9 H15.5 M8.5 13 H15.5 M8.5 17 H12.5"/>',
    REQUEST: '<rect x="5" y="4" width="14" height="18" rx="4"/><rect x="9" y="2" width="6" height="4" rx="2"/><path d="M8.5 13.5 L11 16 L16 10.5"/>',
    HISTORY: '<circle cx="12" cy="12" r="9"/><path d="M12 6 V12 L16 14"/>',
    HEART: '<path d="M12 20 C3 14 2 7 7 5 C10 4 12 6 12 8 C12 6 14 4 17 5 C22 7 21 14 12 20 Z"/>',
    CAP: '<path d="M12 4 L23 9.5 L12 15 L1 9.5 Z"/><path d="M6 12.5 V17 Q12 22 18 17 V12.5"/>',
    MEGAPHONE: '<path d="M3 10 H8 L18 5 V19 L8 14 H3 Z"/><path d="M21 10 V14 M8 14 L9.5 20"/>',
    GEAR: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2 V5.5 M12 18.5 V22 M2 12 H5.5 M18.5 12 H22 M4.93 4.93 L7.4 7.4 M16.6 16.6 L19.07 19.07 M19.07 4.93 L16.6 7.4 M7.4 16.6 L4.93 19.07"/>',
    SUN: '<circle cx="12" cy="12" r="4"/><path d="M12 2 V4 M12 20 V22 M4.93 4.93 L6.34 6.34 M17.66 17.66 L19.07 19.07 M2 12 H4 M20 12 H22 M4.93 19.07 L6.34 17.66 M17.66 6.34 L19.07 4.93"/>',
    MOON: '<path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.6 8.6 0 1 0 20.5 15.5Z"/>',
    LOCK: '<path d="M7 10 V7 A5 5 0 0 1 17 7 V10"/><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M12 14 V17"/>',
    CHECK: '<path d="M4 12 L9 17 L20 6"/>',
    PIN: '<path d="M20 10 C20 15 12 22 12 22 S4 15 4 10 A8 8 0 1 1 20 10Z"/><circle cx="12" cy="10" r="2.5"/>',
    CALENDAR: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3 V7 M17 3 V7 M3 10 H21"/>',
    PLUS: '<path d="M12 5 V19 M5 12 H19"/>',
    EDIT: '<path d="M4 20 H8 L19 9 L15 5 L4 16 Z"/><path d="M13.5 6.5 L17.5 10.5"/>',
    TRASH: '<path d="M4 7 H20 M10 11 V17 M14 11 V17 M6 7 L7 20 H17 L18 7 M9 4 H15 L16 7 H8 Z"/>',
    REFRESH: '<path d="M20 7 V3 M20 7 H16 M4 17 V21 M4 17 H8"/><path d="M5.5 8 A7 7 0 0 1 19 7 M18.5 16 A7 7 0 0 1 5 17"/>',
    LOGOUT: '<path d="M10 4 H5 V20 H10 M14 8 L18 12 L14 16 M8 12 H18"/>',
    CHECKMARK: '<path d="M4 12 L9 17 L20 6"/>'
  };

  function esc(value = '') {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function iconSvg(name, extraClass = 'ui-icon') {
    const paths = ICON_PATHS[name] || ICON_PATHS.GEAR;
    return `<svg class="${extraClass}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
  }
  function renderStaticIcons() {
    $$('[data-icon]').forEach(node => { node.innerHTML = iconSvg(node.dataset.icon); });
  }
  function toast(message, actionText, action, isError = false) {
    const host = $('#toastHost');
    const item = document.createElement('div');
    item.className = 'toast' + (isError ? ' toast-error' : '');
    item.textContent = message;
    if (actionText && action) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'toast-action'; button.textContent = actionText;
      button.addEventListener('click', () => { action(); item.remove(); });
      item.appendChild(button);
    }
    host.appendChild(item);
    window.setTimeout(() => item.remove(), 5000);
  }
  async function api(path, options = {}) {
    const fetchOptions = {
      method: options.method || 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', ...(options.headers || {}) }
    };
    if (options.body !== undefined) {
      fetchOptions.headers['Content-Type'] = 'application/json';
      fetchOptions.body = JSON.stringify(options.body);
    }
    const response = await fetch(path, fetchOptions);
    let payload = {};
    try { payload = await response.json(); } catch (_) { /* Non-JSON response */ }
    if (!response.ok) {
      if (response.status === 401 && state.user) showAuth();
      throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
    }
    return payload;
  }
  function userKey() { return state.user?.username || 'guest'; }
  function readKey() { return `bk-web-read-${userKey()}`; }
  function loadReadKeys() {
    try { state.readKeys = new Set(JSON.parse(localStorage.getItem(readKey()) || '[]')); }
    catch (_) { state.readKeys = new Set(); }
  }
  function saveReadKeys() {
    localStorage.setItem(readKey(), JSON.stringify(Array.from(state.readKeys)));
    updateBadges();
  }
  function initials(name = 'BK') {
    return String(name).trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || 'BK';
  }
  function setTheme(theme) {
    state.theme = theme === 'light' ? 'light' : 'dark';
    document.body.dataset.theme = state.theme;
    localStorage.setItem('bk-web-theme', state.theme);
  }

  function showAuth() {
    state.user = null;
    state.role = 'RESIDENT';
    $('#appView').classList.add('hidden');
    $('#authView').classList.remove('hidden');
    $('#roleResident').click();
    $('#showLogin').click();
  }
  function showApp() {
    $('#authView').classList.add('hidden');
    $('#appView').classList.remove('hidden');
    const user = state.user || {};
    $('#navName').textContent = user.fullName || user.username || 'User';
    $('#navPurok').textContent = user.role === 'ADMIN' ? 'Barangay Staff · Admin' : `${user.purok || 'Resident'} · ${user.username || ''}`;
    $('#navAvatar').textContent = initials(user.fullName || user.username);
    $('#portalLabel').textContent = user.role === 'ADMIN' ? 'Staff Portal' : 'Resident Portal';
    buildNavigation();
    updateBadges();
    navigate('Home');
  }
  function buildNavigation() {
    const pages = PAGES.filter(([name]) => name !== 'Residents' || state.user?.role === 'ADMIN');
    $('#sideNav').innerHTML = pages.map(([name, icon]) => `<button type="button" data-page="${esc(name)}" class="nav-item ${state.page === name ? 'active' : ''}"><span class="nav-icon" data-icon="${icon}"></span><span>${esc(name)}</span>${name === 'Announcements' ? '<i id="announcementDot" class="red-dot hidden"></i>' : ''}${name === 'Notifications' ? '<span id="sideBadge" class="count-badge hidden">0</span>' : ''}</button>`).join('');
    $('#bottomNav').innerHTML = pages.map(([name, icon, , short]) => `<button type="button" data-page="${esc(name)}" class="bottom-item ${state.page === name ? 'active' : ''}"><span class="nav-icon" data-icon="${icon}"></span><small>${esc(short)}</small>${name === 'Announcements' ? '<i id="bottomAnnouncementDot" class="red-dot hidden"></i>' : ''}${name === 'Notifications' ? '<i id="bottomBadge" class="count-badge hidden">0</i>' : ''}</button>`).join('');
    $('#bottomNav').style.setProperty('--nav-count', String(pages.length));
    document.body.classList.toggle('admin-user', state.user?.role === 'ADMIN');
    renderStaticIcons();
    updateBadges();
  }
  function updateBadges() {
    const enabled = state.notificationEnabled;
    const unread = enabled ? state.notifications.filter(n => !state.readKeys.has(n.key)) : [];
    const count = unread.length;
    [['#topBadge', count], ['#sideBadge', count], ['#bottomBadge', count]].forEach(([selector, number]) => {
      const element = $(selector);
      if (!element) return;
      element.textContent = number > 99 ? '99+' : String(number);
      element.classList.toggle('hidden', number === 0);
    });
    const announcementUnread = enabled ? unread.filter(n => n.kind === 'announcement').length : 0;
    ['#announcementDot', '#bottomAnnouncementDot'].forEach(selector => {
      const element = $(selector);
      if (element) element.classList.toggle('hidden', announcementUnread === 0);
    });
  }

  async function navigate(page) {
    if (page === 'Residents' && state.user?.role !== 'ADMIN') return;
    state.page = page;
    const sections = Object.fromEntries(PAGES.map(([name, , id]) => [name, id]));
    Object.entries(sections).forEach(([name, id]) => {
      const section = $('#' + id);
      if (section) section.classList.toggle('hidden', name !== page);
    });
    $$('[data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === page));
    $('#desktop-nav-placeholder');
    renderCurrent();
    if (page === 'Notifications') markVisibleNotificationsRead();
    if (page === 'Announcements') markAnnouncementNotificationsRead();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function renderCurrent() {
    if (!state.user) return;
    const renderers = {
      Home: renderHome,
      Residents: renderResidents,
      'Barangay Documents': renderDocuments,
      'Document Requests': renderRequests,
      History: renderHistory,
      Announcements: renderAnnouncements,
      Notifications: renderNotifications,
      Settings: renderSettings
    };
    const render = renderers[state.page];
    if (render) Promise.resolve(render()).catch(error => {
      const section = $('#page' + ({ 'Barangay Documents': 'Documents', 'Document Requests': 'Requests' }[state.page] || state.page));
      if (section) section.innerHTML = `<div class="card"><div class="empty-state">${esc(error.message)}</div></div>`;
      toast(error.message, null, null, true);
    });
  }
  async function refreshAll() {
    const [dashboard, documents, requests, history, announcements, notifications, me] = await Promise.all([
      api('/api/dashboard'), api('/api/documents'), api('/api/requests'), api('/api/history'),
      api('/api/announcements'), api('/api/notifications'), api('/api/me')
    ]);
    state.dashboard = dashboard;
    state.documents = Array.isArray(documents) ? documents : [];
    state.requests = Array.isArray(requests) ? requests : [];
    state.history = Array.isArray(history) ? history : [];
    state.announcements = Array.isArray(announcements) ? announcements : [];
    state.notifications = Array.isArray(notifications) ? notifications : [];
    state.user = me;
    if (!state.notificationBaselineLoaded) state.notificationBaselineLoaded = true;
    updateBadges();
  }
  async function refreshNotifications(checkForNew = false) {
    const rows = await api('/api/notifications');
    const next = Array.isArray(rows) ? rows : [];
    const known = new Set(state.notifications.map(n => n.key));
    const newRows = next.filter(n => !known.has(n.key));
    state.notifications = next;
    if (checkForNew && newRows.length && state.notificationEnabled) {
      playNotificationSound();
      toast(newRows.length === 1 ? newRows[0].title : `${newRows.length} new notifications`, 'View', () => navigate('Notifications'));
      newRows.slice(0, 2).forEach(showSystemNotification);
    }
    updateBadges();
    if (state.page === 'Notifications') renderNotifications();
  }
  async function showSystemNotification(notification) {
    if (!state.notificationEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(notification.title || 'Baryo Konek', {
          body: notification.message || 'You have a new update.',
          icon: '/icon-192.png', badge: '/icon-192.png', tag: notification.key
        });
      } else new Notification(notification.title || 'Baryo Konek', { body: notification.message || 'You have a new update.' });
    } catch (_) { /* Browser notification permission may be unavailable. */ }
  }
  function playNotificationSound() {
    if (!state.notificationEnabled || !state.soundEnabled) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const start = context.currentTime + 0.02;
      [[784, 0], [988, 0.16]].forEach(([frequency, delay]) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start + delay);
        gain.gain.exponentialRampToValueAtTime(0.15, start + delay + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + delay + 0.22);
        oscillator.connect(gain); gain.connect(context.destination);
        oscillator.start(start + delay); oscillator.stop(start + delay + 0.24);
      });
      window.setTimeout(() => context.close().catch(() => {}), 700);
    } catch (_) { /* Optional sound */ }
  }

  function heading(title, subtitle = '', actions = '') {
    return `<div class="page-heading"><div><h1>${esc(title)}</h1>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>${actions ? `<div class="heading-actions">${actions}</div>` : ''}</div>`;
  }
  function statusPill(status) {
    const value = String(status || '');
    let cls = 'acceptance';
    const normalized = value.trim().toLowerCase();
    if (normalized === 'unavailable' || normalized === 'inactive') cls = 'unavailable';
    else if (normalized === 'completed' || normalized === 'available' || normalized === 'active') cls = 'completed';
    else if (normalized === 'processing') cls = 'processing';
    return `<span class="pill ${cls}">${esc(value || '—')}</span>`;
  }
  function emptyState(message) { return `<div class="empty-state">${esc(message)}</div>`; }
  function announcementCard(item, compact = false) {
    const homeAttrs = compact ? ' data-home-go="Announcements" role="button" tabindex="0" aria-label="Open announcements"' : '';
    return `<article class="record-card${compact ? ' home-announcement-link' : ''}"${homeAttrs}>
      <div class="record-top"><div class="record-title">${esc(item.title)}</div>${statusPill(item.status)}</div>
      <div class="record-meta"><span>${esc(item.category)}</span><span>${iconSvg('CALENDAR', 'tiny-icon')} ${esc(item.date || 'Date not set')}</span>${item.location ? `<span>${iconSvg('PIN', 'tiny-icon')} ${esc(item.location)}</span>` : ''}</div>
      ${compact ? '' : `<p class="record-description">${esc(item.status === 'Inactive' ? 'This announcement is currently inactive.' : 'Please review the details of this barangay announcement.')}</p>`}
      ${!compact && state.user?.role === 'ADMIN' ? `<div class="record-actions"><button type="button" class="btn secondary small" data-edit-announcement="${esc(item.id)}" data-store="${esc(item.store)}">${iconSvg('EDIT', 'button-icon')} Edit</button><button type="button" class="btn danger small" data-delete-announcement="${esc(item.id)}" data-store="${esc(item.store)}">${iconSvg('TRASH', 'button-icon')} Delete</button></div>` : ''}
    </article>`;
  }

  async function renderHome() {
    const dashboard = await api('/api/dashboard');
    state.dashboard = dashboard;
    const admin = state.user.role === 'ADMIN';
    const firstName = (state.user.fullName || state.user.username || 'Resident').split(' ')[0];
    const stats = admin ? [
      ['PEOPLE', dashboard.residentCount, 'Total Residents', 'Registered resident accounts', 'Residents'],
      ['DOC', dashboard.availableDocuments, 'Available Documents', 'Currently available in catalog', 'Barangay Documents'],
      ['REQUEST', dashboard.activeRequests, 'Active Requests', 'Requests awaiting action', 'Document Requests'],
      ['CHECK', dashboard.completedRequests, 'Completed Requests', 'Records in History', 'History']
    ] : [
      ['REQUEST', dashboard.activeRequests, 'My Active Requests', '', 'Document Requests'],
      ['DOC', dashboard.availableDocuments, 'Available Documents', '', 'Barangay Documents'],
      ['MEGAPHONE', dashboard.activeAnnouncements, 'Active Announcements', '', 'Announcements']
    ];
    const recent = dashboard.recentAnnouncements || state.announcements.slice(0, 5);
    const residentQuick = [
      ['Browse Documents', 'DOC', 'See requirements and availability', 'Barangay Documents'],
      ['Request Document', 'REQUEST', 'Submit a new request', 'new-request'],
      ['My Requests', 'REQUEST', 'Track request status', 'Document Requests'],
      ['Request History', 'HISTORY', 'View completed documents', 'History'],
      ['Announcements', 'MEGAPHONE', 'Barangay, health and education updates', 'Announcements'],
      ['Notifications', 'MEGAPHONE', 'View your alerts', 'Notifications']
    ];
    const staffQuick = [
      ['Residents', 'PEOPLE', 'Manage resident accounts', 'Residents'],
      ['Barangay Documents', 'DOC', 'Update document catalog', 'Barangay Documents'],
      ['Document Requests', 'REQUEST', 'Accept and complete requests', 'Document Requests'],
      ['Announcements', 'MEGAPHONE', 'Post community updates', 'Announcements']
    ];
    const quick = admin ? staffQuick : residentQuick;
    $('#pageHome').innerHTML = `
      <section class="hero"><div><h1>Welcome to Barangay Indangan, ${esc(firstName)}!</h1><p>${admin ? 'Manage barangay services, resident accounts, document requests, and community announcements.' : 'Fast, organized and accessible services for every resident.'}</p></div></section>
      <div class="stat-grid">${stats.map(([icon, value, label, sub, page], i) => `<div class="stat-card home-stat-link" data-home-go="${esc(page)}" role="button" tabindex="0" aria-label="Open ${esc(label)}"><div class="stat-icon ${i === 1 ? 'gold' : i === 2 ? 'purple' : ''}">${iconSvg(icon)}</div><div><div class="stat-value">${Number(value || 0)}</div><div class="stat-label">${esc(label)}</div>${admin && sub ? `<small class="stat-sub">${esc(sub)}</small>` : ''}</div></div>`).join('')}</div>
      <div class="two-column">
        <section class="card"><div class="card-head"><div><h2>Recent Announcements</h2><p>Latest updates from Barangay Indangan</p></div><button type="button" class="btn secondary small" data-home-go="Announcements">View all</button></div><div class="stack">${recent.length ? recent.map(a => announcementCard(a, true)).join('') : emptyState('No announcements are available yet.')}</div></section>
        <section class="card"><div class="card-head"><div><h2>${admin ? 'Staff Shortcuts' : 'Quick Actions'}</h2><p>${admin ? 'Common barangay management actions' : 'Common resident services'}</p></div></div><div class="quick-grid">${quick.map(([label, icon, description, target]) => `<button type="button" class="quick-link" ${target === 'new-request' ? 'data-home-action="new-request"' : `data-home-go="${esc(target)}"`}><span class="quick-action-icon">${iconSvg(icon)}</span><span class="quick-action-copy">${esc(label)}<small>${esc(description)}</small></span></button>`).join('')}</div></section>
      </div>`;
  }

  async function renderResidents() {
    if (state.user.role !== 'ADMIN') return navigate('Home');
    const rows = await api('/api/residents');
    state.residents = rows;
    const section = $('#pageResidents');
    section.innerHTML = `${heading('Residents Directory', 'View and manage registered resident accounts.', `<button type="button" class="btn primary" data-action="add-resident">${iconSvg('PLUS', 'button-icon')} Add Resident</button>`)}
      <section class="card"><div class="card-head"><div><h2>Registered Residents</h2><p>Search by name, purok, contact number, or username.</p></div><input class="search-box" id="residentSearch" placeholder="Search residents…" aria-label="Search residents"></div>
      <div id="residentList" class="stack">${rows.length ? rows.map(r => `<article class="record-card admin-record" data-searchable="${esc([r.fullName,r.address,r.purok,r.contact,r.username].join(' ').toLowerCase())}"><div class="record-top"><div><div class="record-title">${esc(r.fullName)}</div><div class="record-meta"><span>${esc(r.username)}</span><span>${esc(r.id)}</span></div></div>${statusPill('Active')}</div><div class="resident-details"><span><strong>Purok:</strong> ${esc(r.purok || '—')}</span><span><strong>Mobile:</strong> ${esc(r.contact || '—')}</span><span><strong>Address:</strong> ${esc(r.address || '—')}</span></div><div class="record-actions"><button type="button" class="btn danger small" data-delete-resident="${esc(r.username)}">Delete Resident</button></div></article>`).join('') : emptyState('No resident accounts found.')}</div></section>`;
    $('#residentSearch').addEventListener('input', event => {
      const query = event.target.value.trim().toLowerCase();
      $$('#residentList [data-searchable]').forEach(card => card.classList.toggle('hidden', !card.dataset.searchable.includes(query)));
    });
  }

  function renderDocuments() {
    const admin = state.user.role === 'ADMIN';
    const rows = state.documents;
    const section = $('#pageDocuments');
    section.innerHTML = `${heading('Barangay Documents', 'View available documents, descriptions, and requirements.', admin ? `<button type="button" class="btn primary" data-action="add-document">${iconSvg('PLUS', 'button-icon')} Add Document</button>` : '')}
      <section class="card"><div class="card-head"><div><h2>Barangay Documents Catalog</h2><p>${admin ? 'Add, update, and manage document availability.' : 'Search the list of documents and prepare your request.'}</p></div><input class="search-box" id="documentSearch" placeholder="Search documents…" aria-label="Search documents"></div><div id="documentList" class="stack">${documentCards(rows)}</div></section>`;
    $('#documentSearch').addEventListener('input', event => {
      const query = event.target.value.trim().toLowerCase();
      const filtered = rows.filter(d => [d.name, d.description, d.requirements, d.availability].join(' ').toLowerCase().includes(query));
      $('#documentList').innerHTML = documentCards(filtered);
    });
  }
  function documentCards(rows) {
    if (!rows.length) return emptyState('No barangay documents have been added yet.');
    const admin = state.user.role === 'ADMIN';
    return rows.map(d => `<article class="record-card"><div class="record-top"><div class="record-title">${esc(d.name)}</div>${statusPill(d.availability)}</div>
      ${d.description ? `<p class="record-description">${esc(d.description)}</p>` : ''}${d.requirements ? `<div class="record-meta"><strong>Requirements:</strong> ${esc(d.requirements)}</div>` : ''}
      <div class="record-actions">${admin ? `<button type="button" class="btn secondary small" data-edit-document="${esc(d.id)}">${iconSvg('EDIT', 'button-icon')} Edit</button><button type="button" class="btn danger small" data-delete-document="${esc(d.id)}">${iconSvg('TRASH', 'button-icon')} Delete</button>` : /available/i.test(d.availability) ? `<button type="button" class="btn primary small" data-request-document="${esc(d.name)}">Request this document</button>` : '<button type="button" class="btn secondary small" disabled>Currently Unavailable</button>'}</div></article>`).join('');
  }

  function requestCards(rows) {
    const admin = state.user.role === 'ADMIN';
    if (!rows.length) return emptyState(admin ? 'There are no active document requests.' : 'You have no active document requests.');
    return rows.map(r => {
      const actions = admin ? (r.status === 'For Acceptance' ? `<button type="button" class="btn primary small" data-accept-request="${esc(r.id)}">${iconSvg('CHECKMARK', 'button-icon')} Accept Request</button>` : r.status === 'Processing' ? `<button type="button" class="btn success small" data-complete-request="${esc(r.id)}">${iconSvg('CHECKMARK', 'button-icon')} Mark Complete</button>` : '') : (r.status === 'For Acceptance' ? `<button type="button" class="btn secondary small" data-edit-request="${esc(r.id)}">${iconSvg('EDIT', 'button-icon')} Edit Request</button>` : '');
      return `<article class="record-card ${admin ? 'admin-record' : ''}"><div class="record-top"><div><div class="record-title">${esc(r.documentType)}</div><div class="record-meta"><span>${esc(r.id)}</span><span>Requested ${esc(r.date || '')}</span>${admin ? `<span>Resident: ${esc(r.residentName || '')}</span>` : ''}</div></div>${statusPill(r.status)}</div><p class="record-description">Purpose: ${esc(r.purpose)}</p><div class="record-meta"><span>Quantity: ${Number(r.quantity || 1)} ${Number(r.quantity || 1) === 1 ? 'copy' : 'copies'}</span></div>${actions ? `<div class="record-actions">${actions}</div>` : ''}</article>`;
    }).join('');
  }
  function renderRequests() {
    const admin = state.user.role === 'ADMIN';
    $('#pageRequests').innerHTML = `${heading(admin ? 'Document Requests' : 'Document Requests', admin ? 'Review and process resident document requests.' : 'Track your submitted requests and update them before staff acceptance.', admin ? `<button type="button" class="btn secondary" data-action="refresh">${iconSvg('REFRESH', 'button-icon')} Refresh</button>` : `<button type="button" class="btn primary" data-action="new-request">${iconSvg('PLUS', 'button-icon')} New Request</button>`)}
      <section class="card"><div class="card-head"><div><h2>${admin ? 'Incoming Requests' : 'My Active Document Requests'}</h2><p>${admin ? 'Accept requests to move them into Processing, then mark them Complete.' : 'Requests move from For Acceptance to Processing, then Completed.'}</p></div></div><div class="stack">${requestCards(state.requests)}</div></section>`;
  }
  function renderHistory() {
    const rows = state.history;
    const admin = state.user.role === 'ADMIN';
    $('#pageHistory').innerHTML = `${heading('History', admin ? 'Completed document requests from residents.' : 'Your completed barangay document requests.')}<section class="card"><div class="card-head"><div><h2>${admin ? 'Completed Requests' : 'My Completed Request History'}</h2><p>Completed requests are kept here for reference.</p></div></div><div class="stack">${rows.length ? rows.map(r => `<article class="record-card"><div class="record-top"><div><div class="record-title">${esc(r.documentType)}</div><div class="record-meta"><span>${esc(r.id)}</span><span>${esc(r.date || '')}</span>${admin ? `<span>Resident: ${esc(r.residentName || '')}</span>` : ''}</div></div>${statusPill('Completed')}</div><p class="record-description">Purpose: ${esc(r.purpose)}</p><div class="record-meta"><span>Quantity: ${Number(r.quantity || 1)} ${Number(r.quantity || 1) === 1 ? 'copy' : 'copies'}</span></div></article>`).join('') : emptyState('No completed requests yet.')}</div></section>`;
  }
  function renderAnnouncements() {
    const admin = state.user.role === 'ADMIN';
    const categories = ['All', 'Barangay', 'Health', 'Education'];
    const list = state.announcements.filter(a => state.categoryFilter === 'All' || a.category === state.categoryFilter);
    $('#pageAnnouncements').innerHTML = `${heading('Announcements', 'Barangay, health, and education announcements in one place.', admin ? `<button type="button" class="btn primary" data-action="add-announcement">${iconSvg('PLUS', 'button-icon')} New Announcement</button>` : '')}
      <section class="card"><div class="card-head"><div><h2>All Announcements</h2><p>Updates posted by Barangay Indangan staff.</p></div></div><div class="filter-row">${categories.map(category => `<button type="button" class="filter-chip ${state.categoryFilter === category ? 'active' : ''}" data-category-filter="${category}">${category}</button>`).join('')}</div><div class="stack">${list.length ? list.map(a => announcementCard(a)).join('') : emptyState('No announcements found for this category.')}</div></section>`;
  }
  function renderNotifications() {
    const rows = state.notifications.map(n => ({ ...n, read: state.readKeys.has(n.key) }));
    $('#pageNotifications').innerHTML = `${heading('Notifications', 'Completion updates and new barangay announcements.', '<button type="button" class="btn secondary small" data-mark-all-read>Mark all as read</button>')}<section class="card"><div class="card-head"><div><h2>Your Notifications</h2><p>New announcements and completed document requests.</p></div></div><div class="stack">${rows.length ? rows.map(n => `<article class="record-card notification-card ${n.read ? '' : 'unread'}"><div class="record-top"><div class="record-title">${esc(n.title || 'Notification')}</div><div>${n.read ? '<span class="pill">Read</span>' : '<span class="pill unavailable">New</span>'}</div></div><div class="record-meta"><span>${esc(n.kind === 'announcement' ? 'Announcement' : 'Document Request')}</span><span>${esc(n.date || '')}</span></div><p class="record-description">${esc(n.message || '')}</p>${!n.read ? `<div class="record-actions"><button type="button" class="btn secondary small" data-read-notification="${esc(n.key)}">Mark as read</button></div>` : ''}</article>`).join('') : emptyState('You do not have any notifications yet.')}</div></section>`;
  }
  function renderSettings() {
    const user = state.user;
    const admin = user.role === 'ADMIN';
    const profile = admin ? `<section class="card"><div class="card-head"><div><h2>Staff Account</h2><p>Your staff profile information.</p></div></div><div class="resident-details"><span><strong>Name:</strong> ${esc(user.fullName)}</span><span><strong>Username:</strong> ${esc(user.username)}</span><span><strong>Account type:</strong> Barangay Staff</span></div><p class="form-note">Staff profile details are managed by the database administrator.</p></section>` : `<section class="card"><div class="card-head"><div><h2>Personal Information</h2><p>Update the contact details linked to your resident account.</p></div></div><form id="profileForm" class="settings-form"><label>Full Name<input name="fullName" required minlength="3" value="${esc(user.fullName)}"></label><label>Username<input value="${esc(user.username)}" disabled></label><label>Purok<select name="purok"><option value="">Select Purok</option>${Array.from({ length: 8 }, (_, i) => `<option ${user.purok === `Purok ${i + 1}` ? 'selected' : ''}>Purok ${i + 1}</option>`).join('')}</select></label><label>Mobile Number<input name="contact" required value="${esc(user.contact)}" inputmode="tel"></label><label class="span-2">Address<input name="address" required value="${esc(user.address)}"></label><div class="span-2 form-actions"><button class="btn primary" type="submit">Save Information</button></div><p class="inline-message span-2" id="profileMessage"></p></form></section>`;
    $('#pageSettings').innerHTML = `${heading('Settings', 'Manage your account security and app preferences.')}${profile}
      <section class="card"><div class="card-head"><div><h2>Password &amp; Security</h2><p>Keep your account secure.</p></div><button id="openPassword" type="button" class="btn secondary small">Change Password</button></div></section>
      <section class="card"><div class="card-head"><div><h2>Notifications</h2><p>Choose whether this device shows alert popups and sounds.</p></div></div><div class="setting-row"><div class="setting-copy"><strong>Enable notifications</strong><small>Show in-app popups, unread badges, and browser alerts.</small></div><label class="switch"><input id="notificationToggle" type="checkbox" ${state.notificationEnabled ? 'checked' : ''}><span class="switch-track"></span></label></div><div class="setting-row"><div class="setting-copy"><strong>Notification sound</strong><small>Play a short sound when a new alert arrives.</small></div><label class="switch"><input id="soundToggle" type="checkbox" ${state.soundEnabled ? 'checked' : ''}><span class="switch-track"></span></label></div></section>
      <section class="card"><div class="card-head"><div><h2>Appearance</h2><p>Choose the appearance for this device.</p></div><button id="themeToggle" type="button" class="btn secondary small">Switch to ${state.theme === 'dark' ? 'Light' : 'Dark'} Mode</button></div></section>`;
    const profileForm = $('#profileForm');
    if (profileForm) profileForm.addEventListener('submit', async event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(profileForm).entries());
      try {
        const result = await api('/api/profile', { method: 'PUT', body: data });
        state.user = await api('/api/me');
        $('#navName').textContent = state.user.fullName;
        $('#navPurok').textContent = `${state.user.purok || 'Resident'} · ${state.user.username}`;
        toast(result.message || 'Profile updated.');
        renderSettings();
      } catch (error) { $('#profileMessage').textContent = error.message; }
    });
    $('#openPassword').addEventListener('click', () => $('#passwordDialog').showModal());
    $('#notificationToggle').addEventListener('change', async event => {
      state.notificationEnabled = event.target.checked;
      localStorage.setItem(`bk-web-notifications-${userKey()}`, state.notificationEnabled ? 'on' : 'off');
      if (state.notificationEnabled && 'Notification' in window && Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch (_) { /* Optional */ }
      }
      updateBadges();
      toast(state.notificationEnabled ? 'Notifications enabled on this device.' : 'Notifications disabled on this device.');
    });
    $('#soundToggle').addEventListener('change', event => {
      state.soundEnabled = event.target.checked;
      localStorage.setItem(`bk-web-sound-${userKey()}`, state.soundEnabled ? 'on' : 'off');
      if (state.soundEnabled) playNotificationSound();
      toast(state.soundEnabled ? 'Notification sound enabled.' : 'Notification sound disabled.');
    });
    $('#themeToggle').addEventListener('click', () => { setTheme(state.theme === 'dark' ? 'light' : 'dark'); renderSettings(); });
  }

  async function markVisibleNotificationsRead() {
    const unread = state.notifications.filter(n => !state.readKeys.has(n.key));
    if (!unread.length) return;
    unread.forEach(n => state.readKeys.add(n.key));
    saveReadKeys();
    renderNotifications();
  }
  function markAnnouncementNotificationsRead() {
    state.notifications.filter(n => n.kind === 'announcement' && !state.readKeys.has(n.key)).forEach(n => state.readKeys.add(n.key));
    saveReadKeys();
  }
  function markNotificationRead(key) {
    state.readKeys.add(key); saveReadKeys(); renderNotifications();
  }
  function markAllNotificationsRead() {
    state.notifications.forEach(n => state.readKeys.add(n.key));
    saveReadKeys(); renderNotifications();
    toast('All notifications marked as read.');
  }

  function openRequestDialog(documentName = '', request = null) {
    const select = $('#requestDocumentType');
    const available = state.documents.filter(d => String(d.availability).toLowerCase() === 'available').map(d => d.name);
    const options = [...available];
    if (request && !options.includes(request.documentType)) options.unshift(request.documentType);
    if (!request && !available.length) { toast('There are currently no available documents to request.'); return; }
    if (request && !options.length) { toast('No document is available to select.'); return; }
    select.innerHTML = options.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
    if (documentName && options.includes(documentName)) select.value = documentName;
    else if (request) select.value = request.documentType;
    const form = $('#requestForm');
    form.elements.requestId.value = request ? request.id : '';
    form.elements.quantity.value = request ? request.quantity : 1;
    form.elements.purpose.value = request ? request.purpose : '';
    $('#requestDialogTitle').textContent = request ? 'Edit Your Request' : 'Request a Document';
    $('#requestDialog').showModal();
  }
  async function submitRequest(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const id = data.requestId;
    delete data.requestId;
    data.quantity = Number(data.quantity || 1);
    const ok = await confirmAction(id ? 'Confirm request changes' : 'Confirm document request', id ? 'Are you sure you want to save these changes to your document request?' : 'Are you sure you want to submit this document request?', id ? 'Save Changes' : 'Submit Request');
    if (!ok) return;
    try {
      const result = id ? await api(`/api/requests/${encodeURIComponent(id)}`, { method: 'PUT', body: data }) : await api('/api/requests', { method: 'POST', body: data });
      $('#requestDialog').close();
      toast(result.message || (id ? 'Request updated.' : 'Request submitted.'));
      await refreshAll();
      navigate('Document Requests');
    } catch (error) { toast(error.message, null, null, true); }
  }

  function confirmAction(title, message, confirmText = 'Confirm', danger = false) {
    const dialog = $('#confirmDialog');
    const accept = $('#confirmAccept');
    const cancel = $('#confirmCancel');
    const close = $('#confirmClose');
    $('#confirmTitle').textContent = title;
    $('#confirmMessage').textContent = message;
    accept.textContent = confirmText;
    accept.classList.toggle('danger', danger);
    accept.classList.toggle('primary', !danger);
    return new Promise(resolve => {
      let settled = false;
      const finish = result => {
        if (settled) return;
        settled = true;
        accept.removeEventListener('click', onAccept);
        cancel.removeEventListener('click', onCancel);
        close.removeEventListener('click', onCancel);
        dialog.removeEventListener('cancel', onDialogCancel);
        dialog.close(); resolve(result);
      };
      const onAccept = () => finish(true);
      const onCancel = () => finish(false);
      const onDialogCancel = event => { event.preventDefault(); finish(false); };
      accept.addEventListener('click', onAccept);
      cancel.addEventListener('click', onCancel);
      close.addEventListener('click', onCancel);
      dialog.addEventListener('cancel', onDialogCancel);
      dialog.showModal();
    });
  }
  function openActionDialog(title, kicker, formHtml, submitLabel, onSubmit) {
    $('#actionTitle').textContent = title;
    $('#actionKicker').textContent = kicker;
    $('#actionBody').innerHTML = formHtml;
    $('#actionSubmit').textContent = submitLabel;
    state.actionSubmit = onSubmit;
    $('#actionDialog').showModal();
  }
  async function saveActionForm(event) {
    event.preventDefault();
    if (!state.actionSubmit) return;
    const formData = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const outcome = await state.actionSubmit(formData);
      if (outcome?.keepOpen) return;
      $('#actionDialog').close();
    } catch (error) { toast(error.message, null, null, true); }
  }
  function documentDialog(document = null) {
    const item = document || {};
    openActionDialog(document ? 'Edit Document' : 'Add Barangay Document', 'BARANGAY DOCUMENTS', `
      <label>Document Name<input name="name" required value="${esc(item.name || '')}"></label>
      <label>Description<textarea name="description" rows="2">${esc(item.description || '')}</textarea></label>
      <label>Requirements<textarea name="requirements" rows="3">${esc(item.requirements || '')}</textarea></label>
      <label>Availability<select name="availability"><option ${item.availability === 'Available' ? 'selected' : ''}>Available</option><option ${item.availability === 'Unavailable' ? 'selected' : ''}>Unavailable</option></select></label>`, document ? 'Save Changes' : 'Add Document', async data => {
      await api(document ? `/api/documents/${document.id}` : '/api/documents', { method: document ? 'PUT' : 'POST', body: data });
      toast(document ? 'Document updated.' : 'Document added.');
      await refreshAll(); renderDocuments();
    });
  }
  function announcementDialog(announcement = null) {
    const item = announcement || {};
    openActionDialog(announcement ? 'Edit Announcement' : 'New Announcement', 'COMMUNITY UPDATES', `
      <label>Category<select name="category"><option ${item.category === 'Barangay' ? 'selected' : ''}>Barangay</option><option ${item.category === 'Health' ? 'selected' : ''}>Health</option><option ${item.category === 'Education' ? 'selected' : ''}>Education</option></select></label>
      <label>Title<input name="title" required value="${esc(item.title || '')}"></label>
      <label>Date<input name="date" value="${esc(item.date || new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }))}"></label>
      <label>Location<input name="location" value="${esc(item.location || '')}"></label>
      <label>Status<select name="status"><option ${item.status === 'Inactive' ? '' : 'selected'}>Active</option><option ${item.status === 'Inactive' ? 'selected' : ''}>Inactive</option></select></label>`, announcement ? 'Save Changes' : 'Post Announcement', async data => {
      if (announcement) { data.store = announcement.store; await api(`/api/announcements/${announcement.id}`, { method: 'PUT', body: data }); }
      else await api('/api/announcements', { method: 'POST', body: data });
      toast(announcement ? 'Announcement updated.' : 'Announcement posted.');
      state.announcements = await api('/api/announcements'); renderAnnouncements();
    });
  }
  function residentDialog() {
    openActionDialog('Add Resident', 'RESIDENT DIRECTORY', `
      <label>Full Name<input name="fullName" required minlength="3"></label>
      <div class="form-grid"><label>Purok<select name="purok"><option>Purok 1</option><option>Purok 2</option><option>Purok 3</option><option>Purok 4</option><option>Purok 5</option><option>Purok 6</option><option>Purok 7</option><option>Purok 8</option></select></label><label>Mobile Number<input name="contact" required inputmode="tel" placeholder="09XXXXXXXXX"></label></div>
      <label>Address<input name="address" required></label>
      <label>Username<input name="username" required minlength="4" maxlength="20"></label>`, 'Create Account', async data => {
      const result = await api('/api/residents', { method: 'POST', body: data });
      toast(`Resident account created. Temporary password: ${result.temporaryPassword}`);
      state.residents = await api('/api/residents'); renderResidents();
    });
  }
  async function changeRequestStatus(id, action) {
    const accepting = action === 'accept';
    const ok = await confirmAction(accepting ? 'Accept this request?' : 'Complete this request?', accepting ? 'The request will move to Processing.' : 'The request will move to History and the resident will receive a completion notification.', accepting ? 'Accept Request' : 'Mark Complete', !accepting);
    if (!ok) return;
    try {
      await api(`/api/requests/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: {} });
      toast(accepting ? 'Request accepted and moved to Processing.' : 'Request completed and moved to History.');
      await refreshAll();
      navigate(accepting ? 'Document Requests' : 'Document Requests');
    } catch (error) { toast(error.message, null, null, true); }
  }
  async function deleteResident(username) {
    const ok = await confirmAction('Delete resident account?', `Delete resident account “${username}”? This action cannot be undone.`, 'Delete Resident', true);
    if (!ok) return;
    try { await api(`/api/residents/${encodeURIComponent(username)}`, { method: 'DELETE' }); toast('Resident account deleted.'); state.residents = await api('/api/residents'); renderResidents(); }
    catch (error) { toast(error.message, null, null, true); }
  }
  async function deleteDocument(id) {
    const ok = await confirmAction('Delete document?', 'Delete this document from the barangay catalog?', 'Delete Document', true);
    if (!ok) return;
    try { await api(`/api/documents/${id}`, { method: 'DELETE' }); toast('Document deleted.'); state.documents = await api('/api/documents'); renderDocuments(); }
    catch (error) { toast(error.message, null, null, true); }
  }
  async function deleteAnnouncement(id, store) {
    const ok = await confirmAction('Delete announcement?', 'Delete this announcement? This action cannot be undone.', 'Delete Announcement', true);
    if (!ok) return;
    try { await api(`/api/announcements/${id}?store=${encodeURIComponent(store)}`, { method: 'DELETE' }); toast('Announcement deleted.'); state.announcements = await api('/api/announcements'); renderAnnouncements(); }
    catch (error) { toast(error.message, null, null, true); }
  }

  function installHandlers() {
    $('#roleResident').addEventListener('click', () => setRole('RESIDENT'));
    $('#roleAdmin').addEventListener('click', () => setRole('ADMIN'));
    $('#showLogin').addEventListener('click', () => {
      $('#showLogin').classList.add('active'); $('#showRegister').classList.remove('active');
      $('#loginForm').classList.remove('hidden'); $('#registerForm').classList.add('hidden');
      $('#authHeading').textContent = state.role === 'ADMIN' ? 'Staff Sign In' : 'Welcome Back!';
      $('#authDescription').textContent = state.role === 'ADMIN' ? 'Sign in to manage Barangay Indangan services.' : 'Sign in to access barangay announcements, documents, and your requests.';
    });
    $('#showRegister').addEventListener('click', () => {
      if (state.role === 'ADMIN') return;
      $('#showRegister').classList.add('active'); $('#showLogin').classList.remove('active');
      $('#registerForm').classList.remove('hidden'); $('#loginForm').classList.add('hidden');
      $('#authHeading').textContent = 'Create Resident Account';
      $('#authDescription').textContent = 'Register to use Baryo Konek and access barangay services.';
    });
    $('#loginShowPassword').addEventListener('change', event => { $('#loginForm').elements.password.type = event.target.checked ? 'text' : 'password'; });
    $('#forgotPasswordButton').addEventListener('click', () => toast('For account recovery, please visit Barangay Indangan Hall with a valid ID so staff can verify your identity and assist with your password reset.'));
    $('#loginForm').addEventListener('submit', async event => {
      event.preventDefault(); $('#loginError').textContent = '';
      const data = Object.fromEntries(new FormData(event.currentTarget).entries()); data.role = state.role;
      try { state.user = await api('/api/login', { method: 'POST', body: data }); await afterLogin(); }
      catch (error) { $('#loginError').textContent = error.message; }
    });
    $('#registerForm').addEventListener('submit', async event => {
      event.preventDefault(); $('#registerError').textContent = '';
      const data = Object.fromEntries(new FormData(event.currentTarget).entries());
      const ok = await confirmAction('Create your resident account?', `Please confirm that your registration details are correct.\n\nName: ${data.fullName}\nUsername: ${data.username}\nPurok: ${data.purok}`, 'Create Account');
      if (!ok) return;
      try { const result = await api('/api/register', { method: 'POST', body: data }); toast(result.message || 'Account created. You can now sign in.'); event.currentTarget.reset(); $('#showLogin').click(); }
      catch (error) { $('#registerError').textContent = error.message; }
    });
    $('#requestForm').addEventListener('submit', submitRequest);
    $('#passwordForm').addEventListener('submit', async event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget).entries());
      const ok = await confirmAction('Change your password?', 'Are you sure you want to update your account password?', 'Change Password');
      if (!ok) return;
      try { const result = await api('/api/password', { method: 'PUT', body: data }); $('#passwordDialog').close(); event.currentTarget.reset(); toast(result.message || 'Password updated successfully.'); }
      catch (error) { toast(error.message, null, null, true); }
    });
    $('#actionForm').addEventListener('submit', saveActionForm);
    $$('[data-close-dialog]').forEach(button => button.addEventListener('click', () => $('#' + button.dataset.closeDialog).close()));
    $('#confirmClose').addEventListener('click', () => $('#confirmDialog').close());
    $('#confirmCancel').addEventListener('click', () => $('#confirmDialog').close());
    $('#logoutButton').addEventListener('click', async () => {
      const ok = await confirmAction('Log out of your account?', 'Are you sure you want to log out of your Baryo Konek account?', 'Log Out', true);
      if (!ok) return;
      try { await api('/api/logout', { method: 'POST', body: {} }); } catch (_) { /* End local view regardless */ }
      showAuth();
    });
    $('#topNotifications').addEventListener('click', () => navigate('Notifications'));
    $('#installButton').addEventListener('click', async () => {
      if (!state.installPrompt) return;
      state.installPrompt.prompt(); await state.installPrompt.userChoice;
      state.installPrompt = null; $('#installButton').classList.add('hidden');
    });
    window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); state.installPrompt = event; $('#installButton').classList.remove('hidden'); });

    document.addEventListener('click', event => {
      const pageButton = event.target.closest('[data-page]');
      if (pageButton) { navigate(pageButton.dataset.page); return; }
      const homeGo = event.target.closest('[data-home-go]');
      if (homeGo) { navigate(homeGo.dataset.homeGo); return; }
      const homeAction = event.target.closest('[data-home-action="new-request"]');
      if (homeAction) { openRequestDialog(); return; }
      const action = event.target.closest('[data-action]');
      if (action) {
        if (action.dataset.action === 'new-request') openRequestDialog();
        else if (action.dataset.action === 'add-document') documentDialog();
        else if (action.dataset.action === 'add-announcement') announcementDialog();
        else if (action.dataset.action === 'add-resident') residentDialog();
        else if (action.dataset.action === 'refresh') refreshAll().then(() => renderRequests()).catch(error => toast(error.message, null, null, true));
        return;
      }
      const requestDocument = event.target.closest('[data-request-document]');
      if (requestDocument) { openRequestDialog(requestDocument.dataset.requestDocument); return; }
      const editRequest = event.target.closest('[data-edit-request]');
      if (editRequest) { const request = state.requests.find(r => r.id === editRequest.dataset.editRequest); if (request) openRequestDialog('', request); return; }
      const editDocument = event.target.closest('[data-edit-document]');
      if (editDocument) { const item = state.documents.find(d => String(d.id) === editDocument.dataset.editDocument); if (item) documentDialog(item); return; }
      const deleteDoc = event.target.closest('[data-delete-document]');
      if (deleteDoc) { deleteDocument(deleteDoc.dataset.deleteDocument); return; }
      const editAnnouncement = event.target.closest('[data-edit-announcement]');
      if (editAnnouncement) { const item = state.announcements.find(a => String(a.id) === editAnnouncement.dataset.editAnnouncement && String(a.store) === String(editAnnouncement.dataset.store)); if (item) announcementDialog(item); return; }
      const deleteAnn = event.target.closest('[data-delete-announcement]');
      if (deleteAnn) { deleteAnnouncement(deleteAnn.dataset.deleteAnnouncement, deleteAnn.dataset.store); return; }
      const deletePerson = event.target.closest('[data-delete-resident]');
      if (deletePerson) { deleteResident(deletePerson.dataset.deleteResident); return; }
      const accept = event.target.closest('[data-accept-request]');
      if (accept) { changeRequestStatus(accept.dataset.acceptRequest, 'accept'); return; }
      const complete = event.target.closest('[data-complete-request]');
      if (complete) { changeRequestStatus(complete.dataset.completeRequest, 'complete'); return; }
      const category = event.target.closest('[data-category-filter]');
      if (category) { state.categoryFilter = category.dataset.categoryFilter; renderAnnouncements(); return; }
      const read = event.target.closest('[data-read-notification]');
      if (read) { markNotificationRead(read.dataset.readNotification); return; }
      const markAll = event.target.closest('[data-mark-all-read]');
      if (markAll) { markAllNotificationsRead(); return; }
    });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const homeCard = event.target.closest('[data-home-go][role="button"]');
      if (!homeCard || event.target.tagName === 'BUTTON') return;
      event.preventDefault();
      navigate(homeCard.dataset.homeGo);
    });
  }
  function setRole(role) {
    state.role = role === 'ADMIN' ? 'ADMIN' : 'RESIDENT';
    $('#roleResident').classList.toggle('active', state.role === 'RESIDENT');
    $('#roleAdmin').classList.toggle('active', state.role === 'ADMIN');
    $('#showRegister').classList.toggle('hidden', state.role === 'ADMIN');
    $('#loginNote').textContent = state.role === 'ADMIN' ? 'Barangay staff accounts only. Use your authorized staff credentials.' : 'This portal is for residents. Barangay staff can select the staff sign-in option above.';
    $('#loginSubmit').textContent = state.role === 'ADMIN' ? 'Sign In as Staff' : 'Sign In';
    $('#loginError').textContent = '';
    $('#showLogin').click();
  }
  async function afterLogin() {
    state.notificationEnabled = localStorage.getItem(`bk-web-notifications-${userKey()}`) !== 'off';
    state.soundEnabled = localStorage.getItem(`bk-web-sound-${userKey()}`) !== 'off';
    loadReadKeys();
    try { await refreshAll(); showApp(); toast(`Welcome, ${state.user.fullName || state.user.username}!`); }
    catch (error) { toast(error.message, null, null, true); showAuth(); }
  }
  async function boot() {
    setTheme(state.theme);
    renderStaticIcons();
    installHandlers();
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('/sw.js?v=bk-web-shell-05', { updateViaCache: 'none' }).then(registration => registration.update()).catch(() => {});
    }
    try {
      state.user = await api('/api/me');
      state.notificationEnabled = localStorage.getItem(`bk-web-notifications-${userKey()}`) !== 'off';
      state.soundEnabled = localStorage.getItem(`bk-web-sound-${userKey()}`) !== 'off';
      loadReadKeys();
      await refreshAll();
      showApp();
    } catch (_) { showAuth(); }
    window.setInterval(async () => {
      if (!state.user || document.visibilityState === 'hidden') return;
      try {
        await refreshNotifications(true);
        if (state.page === 'Home') renderHome();
        if (state.page === 'Barangay Documents') { state.documents = await api('/api/documents'); renderDocuments(); }
        if (state.page === 'Announcements') { state.announcements = await api('/api/announcements'); renderAnnouncements(); }
        if (state.page === 'Document Requests') { state.requests = await api('/api/requests'); renderRequests(); }
        if (state.page === 'History') { state.history = await api('/api/history'); renderHistory(); }
      } catch (_) { /* A temporary network issue should not discard the session. */ }
    }, 20000);
  }

  boot();
})();
