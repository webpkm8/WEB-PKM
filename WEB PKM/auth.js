/* Web PKM - Supabase Auth + cloud data per account */
(() => {
  const SUPABASE_URL = 'https://uxhojcovzajbfyufutcr.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_VqAL6sNI9-mgdpuJAifGsQ_6PeXbNQu';
  const DATA_NAMES = ['products','sales','cash','expenses'];
  const SESSION_KEY = 'kasirTokoSupabaseSession';
  const CURRENT_KEY = 'kasirTokoCurrentUser';
  const LOGIN_KEY = 'kasirTokoLoggedIn';
  const publicPages = ['index.html','login.html','register.html','panduan.html','tentang.html','kontak.html','reset-password.html',''];
  const protectedPages = ['dashboard.html','kasir.html','produk.html','storage.html','buku-kas.html','perbandingan.html','scan-ingredient.html'];
  const file = (location.pathname.split('/').pop() || '').toLowerCase();
  let hydrating = false;
  let session = null;
  let currentUser = null;
  let client = null;

  const jsonError = async response => {
    let body = null;
    try { body = await response.json(); } catch {}
    const message = body?.msg || body?.message || body?.error_description || body?.error || `HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.code = body?.code || body?.error_code || '';
    return error;
  };

  const loadSupabase = () => new Promise((resolve, reject) => {
    if (window.supabase?.createClient) return resolve(window.supabase);
    const existing = document.querySelector('script[data-supabase-client]');
    if (existing) {
      existing.addEventListener('load', () => window.supabase?.createClient ? resolve(window.supabase) : reject(new Error('Supabase JS gagal dimuat.')));
      existing.addEventListener('error', () => reject(new Error('Supabase JS gagal dimuat. Periksa koneksi internet.')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
    script.async = true;
    script.dataset.supabaseClient = 'true';
    script.onload = () => window.supabase?.createClient ? resolve(window.supabase) : reject(new Error('Supabase JS gagal dimuat.'));
    script.onerror = () => reject(new Error('Tidak dapat memuat Supabase JS. Pastikan internet aktif.'));
    document.head.appendChild(script);
  });

  const slug = value => String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
  const localKey = name => currentUser ? `kt_user_${slug(currentUser.id)}_${name}_v6` : `kt_guest_${name}_v6`;
  const readLocal = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } };
  const writeLocal = (key, value) => localStorage.setItem(key, JSON.stringify(value));

  async function saveCloud(name, value) {
    if (!client || !session?.access_token || !currentUser || hydrating) return;
    const { error } = await client.from('user_data').upsert({
      user_id: currentUser.id,
      key: name,
      value,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,key' });
    if (error) console.warn('Gagal sinkronisasi cloud:', error.message);
  }

  const originalSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function(key, value) {
    originalSetItem(key, value);
    if (!hydrating && currentUser && DATA_NAMES.some(n => key === localKey(n))) {
      let parsed = value;
      try { parsed = JSON.parse(value); } catch {}
      const name = DATA_NAMES.find(n => key === localKey(n));
      if (name) saveCloud(name, parsed);
    }
  };

  async function hydrateCloud() {
    if (!client || !currentUser || !session?.access_token) return;
    hydrating = true;
    try {
      const { data, error } = await client.from('user_data').select('key,value').eq('user_id', currentUser.id);
      if (error) throw error;
      for (const row of (data || [])) {
        if (DATA_NAMES.includes(row.key)) originalSetItem(localKey(row.key), JSON.stringify(row.value ?? []));
      }
    } finally { hydrating = false; }
  }

  async function restoreSession() {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    session = data.session;
    currentUser = session?.user || null;
    if (currentUser) {
      writeLocal(CURRENT_KEY, currentUser);
      originalSetItem(LOGIN_KEY, 'true');
      writeLocal(SESSION_KEY, session);
    } else {
      localStorage.removeItem(CURRENT_KEY);
      localStorage.removeItem(LOGIN_KEY);
      localStorage.removeItem(SESSION_KEY);
    }
    return session;
  }

  async function signUp(email, password, name) {
    const cleanEmail = email.trim().toLowerCase();
    const { data, error } = await client.auth.signUp({
      email: cleanEmail,
      password,
      options: { data: { name: name.trim() } }
    });
    if (error) throw error;
    session = data.session;
    currentUser = data.user;
    if (!session) {
      return { needsConfirmation: true, user: currentUser };
    }
    writeLocal(SESSION_KEY, session);
    writeLocal(CURRENT_KEY, currentUser);
    originalSetItem(LOGIN_KEY, 'true');
    await hydrateCloud();
    return { needsConfirmation: false, user: currentUser };
  }

  async function signIn(email, password) {
    const oldUser = readLocal(CURRENT_KEY, null);
    const oldData = {};
    if (oldUser?.id) {
      for (const name of DATA_NAMES) {
        const candidates = [
          `kt_user_${slug(oldUser.id)}_${name}_v6`,
          `kt_user_${slug(oldUser.id)}_${name}_v5`,
          `kt_user_${slug(oldUser.id)}_${name}_v4`
        ];
        for (const k of candidates) {
          const raw = localStorage.getItem(k);
          if (raw !== null) { try { oldData[name] = JSON.parse(raw); } catch {} break; }
        }
      }
    }
    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim().toLowerCase(), password
    });
    if (error) throw error;
    session = data.session;
    currentUser = data.user;
    writeLocal(SESSION_KEY, session);
    writeLocal(CURRENT_KEY, currentUser);
    originalSetItem(LOGIN_KEY, 'true');
    await hydrateCloud();
    for (const name of DATA_NAMES) {
      const cloudKey = localKey(name);
      if (localStorage.getItem(cloudKey) === null && Object.prototype.hasOwnProperty.call(oldData, name)) {
        originalSetItem(cloudKey, JSON.stringify(oldData[name]));
        await saveCloud(name, oldData[name]);
      }
    }
    return currentUser;
  }

  async function resetPassword(email) {
    const configuredBase = String(window.WEBPKM_PUBLIC_URL || '').trim();
    const base = configuredBase || `${location.origin}${location.pathname.replace(/[^/]*$/, '')}`;
    const redirectTo = `${base.replace(/\/$/, '')}/reset-password.html`;
    const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
    if (error) throw error;
  }



  async function uploadAvatar(file) {
    await ready;
    if (!currentUser || !client) throw new Error('Silakan login terlebih dahulu.');
    if (!file) return;
    if (!file.type.startsWith('image/')) throw new Error('File harus berupa gambar.');
    if (file.size > 3 * 1024 * 1024) throw new Error('Ukuran foto maksimal 3 MB.');

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${currentUser.id}/avatar.${ext}`;
    const bucket = client.storage.from('avatars');
    const { error: uploadError } = await bucket.upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: '3600'
    });
    if (uploadError) throw uploadError;
    const { data } = bucket.getPublicUrl(path);
    const avatarUrl = `${data.publicUrl}${data.publicUrl.includes('?') ? '&' : '?'}v=${Date.now()}`;
    const { error: updateError } = await client.auth.updateUser({
      data: { ...(currentUser.user_metadata || {}), avatar_url: avatarUrl }
    });
    if (updateError) throw updateError;
    currentUser = { ...currentUser, user_metadata: { ...(currentUser.user_metadata || {}), avatar_url: avatarUrl } };
    writeLocal(CURRENT_KEY, currentUser);
    renderAccountAvatars(currentUser);
    renderProfileMenu(currentUser);
    return avatarUrl;
  }

  function avatarUrl(user) {
    return String(user?.user_metadata?.avatar_url || '').trim();
  }

  function renderAccountAvatars(user) {
    const displayName = user?.user_metadata?.name || user?.email || 'Akun';
    if (user) ensureProfileMenu(user);
    const initial = String(displayName).trim().charAt(0).toUpperCase() || 'U';
    document.querySelectorAll('[data-account-avatar]').forEach(el => {
      const url = avatarUrl(user);
      el.classList.toggle('has-photo', !!url);
      if (url) {
        el.innerHTML = `<img src="${url}" alt="Foto profil ${escapeHtml(displayName)}">`;
      } else {
        el.textContent = user ? initial : 'U';
      }
    });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  function closeProfileMenu() {
    document.querySelector('.profile-menu')?.classList.remove('show');
    document.querySelector('.profile-menu-backdrop')?.classList.remove('show');
  }

  function renderProfileMenu(user) {
    const menu = document.querySelector('.profile-menu');
    if (!menu) return;
    const name = user?.user_metadata?.name || user?.email || 'Akun';
    const email = user?.email || '';
    const url = avatarUrl(user);
    const avatar = menu.querySelector('[data-profile-avatar]');
    if (avatar) avatar.innerHTML = url ? `<img src="${url}" alt="Foto profil">` : '<span aria-hidden="true">👤</span>';
    const nameEl = menu.querySelector('[data-profile-name]');
    const emailEl = menu.querySelector('[data-profile-email]');
    if (nameEl) nameEl.textContent = name;
    if (emailEl) emailEl.textContent = email;
  }

  function ensureProfileMenu(user) {
    if (document.querySelector('.profile-menu')) { renderProfileMenu(user); return; }
    const backdrop = document.createElement('div');
    backdrop.className = 'profile-menu-backdrop';
    backdrop.addEventListener('click', closeProfileMenu);
    const menu = document.createElement('aside');
    menu.className = 'profile-menu';
    menu.setAttribute('aria-label','Menu Profil');
    menu.innerHTML = `
      <div class="profile-menu-head">
        <div class="profile-menu-avatar" data-profile-avatar><span aria-hidden="true">👤</span></div>
        <div class="profile-menu-info">
          <div class="profile-menu-name" data-profile-name>Akun</div>
          <div class="profile-menu-email" data-profile-email></div>
        </div>
        <button type="button" class="profile-menu-close" aria-label="Tutup">×</button>
      </div>
      <div class="profile-menu-actions">
        <button type="button" class="profile-menu-btn primary" data-change-avatar>📷 Ganti Foto Profil</button>
        <input class="profile-menu-file" data-avatar-input type="file" accept="image/png,image/jpeg,image/webp,image/gif">
        <button type="button" class="profile-menu-btn logout" data-profile-logout>↪ Logout</button>
      </div>
      <div class="profile-menu-status" data-profile-status></div>
      <div class="profile-menu-note">PNG, JPG, WEBP, atau GIF · maksimal 3 MB</div>
    `;
    document.body.append(backdrop, menu);
    menu.querySelector('.profile-menu-close').addEventListener('click', closeProfileMenu);
    menu.querySelector('[data-change-avatar]').addEventListener('click', () => menu.querySelector('[data-avatar-input]').click());
    menu.querySelector('[data-avatar-input]').addEventListener('change', async e => {
      const file = e.target.files?.[0];
      if (!file) return;
      const status = menu.querySelector('[data-profile-status]');
      status.textContent = 'Mengunggah foto...';
      try {
        await uploadAvatar(file);
        status.textContent = 'Foto profil berhasil diperbarui.';
        setTimeout(() => { if (status) status.textContent = ''; }, 2500);
      } catch (error) {
        console.error('Upload avatar:', error);
        status.textContent = error?.message || 'Foto gagal diunggah.';
      } finally { e.target.value = ''; }
    });
    menu.querySelector('[data-profile-logout]').addEventListener('click', async () => {
      closeProfileMenu();
      await logout();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeProfileMenu(); });
    renderProfileMenu(user);
  }

  function openProfileMenu(user) {
    ensureProfileMenu(user);
    renderProfileMenu(user);
    document.querySelector('.profile-menu')?.classList.add('show');
    document.querySelector('.profile-menu-backdrop')?.classList.add('show');
  }

  function setSession(user) {
    currentUser = user;
    writeLocal(CURRENT_KEY, user);
    originalSetItem(LOGIN_KEY, 'true');
  }

  function current() { return currentUser || readLocal(CURRENT_KEY, null); }
  function key(name) { return localKey(name); }
  function accounts() { return currentUser ? [currentUser] : []; }
  function read(key, fallback) { return readLocal(key, fallback); }
  function write(key, value) { writeLocal(key, value); }

  async function logout() {
    try { if (client) await client.auth.signOut(); } catch {}
    session = null; currentUser = null;
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(CURRENT_KEY);
    localStorage.removeItem(LOGIN_KEY);
    location.href = 'login.html';
  }

  async function requireAuth() {
    await ready;
    if (!current()) { location.replace('login.html'); return false; }
    return true;
  }

  const ready = (async () => {
    const sdk = await loadSupabase();
    client = sdk.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    client.auth.onAuthStateChange((_event, newSession) => {
      session = newSession;
      currentUser = newSession?.user || null;
      if (currentUser) {
        writeLocal(SESSION_KEY, newSession);
        writeLocal(CURRENT_KEY, currentUser);
        originalSetItem(LOGIN_KEY, 'true');
      } else {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(CURRENT_KEY);
        localStorage.removeItem(LOGIN_KEY);
      }
    });
    await restoreSession();
    if (currentUser) await hydrateCloud();
    if (protectedPages.includes(file) && !currentUser) location.replace('login.html');
    return currentUser;
  })();

  window.KasirAuth = {
    SUPABASE_URL, SUPABASE_KEY, CURRENT_KEY, LOGIN_KEY,
    DATA_NAMES, accounts, current, read, write, key, setSession,
    logout, requireAuth, signUp, signIn, resetPassword, uploadAvatar, ready,
    get session() { return session; },
    get client() { return client; }
  };

  document.addEventListener('DOMContentLoaded', async () => {
    try { await ready; } catch (error) { console.error('Supabase:', error); }
    const user = current();
    document.querySelectorAll('[data-account-name]').forEach(el => el.textContent = user?.user_metadata?.name || user?.email || 'Akun');

    // Semua tombol/link "Masuk" di seluruh halaman publik berubah menjadi "Logout"
    // ketika ada session aktif. Link lain seperti "Mulai Sekarang" tetap menuju fitur.
    const displayName = user?.user_metadata?.name || user?.email || 'Akun';
    if (user) ensureProfileMenu(user);
    const initial = String(displayName).trim().charAt(0).toUpperCase() || 'U';

    document.querySelectorAll('a').forEach(link => {
      const labelEl = link.querySelector('.account-label');
      const avatarEl = link.querySelector('[data-account-avatar]');
      const text = (labelEl?.textContent || link.textContent).trim().replace(/\s+/g, ' ').toLowerCase();
      const isLoginLink = link.classList.contains('login-button') ||
                          link.classList.contains('login-btn') ||
                          link.classList.contains('site-account') ||
                          link.getAttribute('href') === 'login.html';
      const isMasukLink = isLoginLink && text.includes('masuk');
      if (avatarEl) {
        renderAccountAvatars(user);
        avatarEl.style.cursor = user ? 'pointer' : 'default';
        avatarEl.setAttribute('role', user ? 'button' : 'img');
        avatarEl.setAttribute('tabindex', user ? '0' : '-1');
        if (user) {
          avatarEl.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openProfileMenu(user); });
          avatarEl.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProfileMenu(user); } });
        }
      }

      if (user && isMasukLink) {
        if (labelEl) labelEl.textContent = 'Logout'; else link.textContent = 'Logout';
        link.href = '#logout';
        link.setAttribute('aria-label', `Logout dari akun ${displayName}`);
        link.onclick = async (e) => {
          if (e.target.closest('[data-account-avatar]')) { e.preventDefault(); return; }
          e.preventDefault(); await logout();
        };
      } else if (!user && (link.classList.contains('login-button') || link.classList.contains('login-btn') || link.classList.contains('site-account'))) {
        if (labelEl) labelEl.textContent = 'Masuk'; else link.textContent = 'Masuk';
        link.href = 'login.html';
        link.onclick = null;
        link.setAttribute('aria-label', 'Masuk ke akun');
      }
    });

    // Tombol ajakan "Mulai Sekarang" pada halaman publik: guest menuju login,
    // user yang sudah login langsung menuju daftar fitur.
    document.querySelectorAll('a[href="login.html"]').forEach(link => {
      const text = link.textContent.trim().toLowerCase();
      const isMasuk = text.includes('masuk');
      if (user && !isMasuk) {
        link.href = 'fitur.html';
        if (text.includes('mulai')) {
          link.innerHTML = 'Buka Fitur <span>→</span>';
        }
      }
    });

    // Jika user sudah login lalu membuka login/register, arahkan ke daftar fitur.
    if (user && (file === 'login.html' || file === 'register.html')) {
      location.replace('fitur.html');
    }
  });
})();
