/* Web PKM - Supabase Auth + cloud data per account */
(() => {
  const SUPABASE_URL = 'https://uxhojcovzajbfyufutcr.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_VqAL6sNI9-mgdpuJAifGsQ_6PeXbNQu';
  const DATA_NAMES = ['products','sales','cash','expenses'];
  const SESSION_KEY = 'kasirTokoSupabaseSession';
  const CURRENT_KEY = 'kasirTokoCurrentUser';
  const LOGIN_KEY = 'kasirTokoLoggedIn';
  const publicPages = ['index.html','login.html','register.html','panduan.html','tentang.html','kontak.html',''];
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
    const redirectTo = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}login.html`;
    const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
    if (error) throw error;
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
    logout, requireAuth, signUp, signIn, resetPassword, ready,
    get session() { return session; },
    get client() { return client; }
  };

  document.addEventListener('DOMContentLoaded', async () => {
    try { await ready; } catch (error) { console.error('Supabase:', error); }
    const user = current();
    document.querySelectorAll('[data-account-name]').forEach(el => el.textContent = user?.user_metadata?.name || user?.email || 'Akun');

    // Semua tombol/link "Masuk" di seluruh halaman publik berubah menjadi "Logout"
    // ketika ada session aktif. Link lain seperti "Mulai Sekarang" tetap menuju fitur.
    document.querySelectorAll('a').forEach(link => {
      const text = link.textContent.trim().replace(/\\s+/g, ' ').toLowerCase();
      const isLoginLink = link.classList.contains('login-button') ||
                          link.classList.contains('login-btn') ||
                          link.getAttribute('href') === 'login.html';
      const isMasukLink = isLoginLink && text.includes('masuk');

      if (user && isMasukLink) {
        link.textContent = 'Logout';
        link.href = '#logout';
        link.setAttribute('aria-label', 'Logout dari akun');
        link.onclick = async (e) => {
          e.preventDefault();
          await logout();
        };
      } else if (!user && (link.classList.contains('login-button') || link.classList.contains('login-btn'))) {
        link.textContent = 'Masuk';
        link.href = 'login.html';
        link.onclick = null;
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
