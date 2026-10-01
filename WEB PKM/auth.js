/* Web PKM - Supabase Auth + cloud data per account */
(() => {
  const SUPABASE_URL = 'https://uxhojcovzajbfyufutcr.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_VqAL6sNI9-mgdpuJAifGsQ_6PeXbNQu';
  const DATA_NAMES = ['products','sales','cash','expenses'];
  const ROLE_KEY = 'kasirTokoRole';
  const BUSINESS_KEY = 'kasirTokoBusiness';
  const SESSION_KEY = 'kasirTokoSupabaseSession';
  const CURRENT_KEY = 'kasirTokoCurrentUser';
  const LOGIN_KEY = 'kasirTokoLoggedIn';
  const publicPages = ['index.html','login.html','register.html','panduan.html','tentang.html','kontak.html','reset-password.html',''];
  const protectedPages = ['dashboard.html','kasir.html','produk.html','storage.html','buku-kas.html','perbandingan.html','scan-ingredient.html'];
  const umkmAllowedPages = ['storage.html'];
  const file = (location.pathname.split('/').pop() || '').toLowerCase();
  let hydrating = false;
  let session = null;
  let currentUser = null;
  let currentBusiness = null;
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
    script.crossOrigin = 'anonymous';
    script.dataset.supabaseClient = 'true';
    let settled = false;
    const finish = (fn, value) => { if (settled) return; settled = true; fn(value); };
    script.onload = () => window.supabase?.createClient ? finish(resolve, window.supabase) : finish(reject, new Error('Supabase JS gagal dimuat.'));
    script.onerror = () => finish(reject, new Error('Tidak dapat memuat Supabase JS. Pastikan internet aktif.'));
    setTimeout(() => finish(reject, new Error('Supabase JS terlalu lama dimuat.')), 12000);
    document.head.appendChild(script);
  });

  const slug = value => String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
  const localKey = name => {
    const businessId = currentBusiness?.business_id;
    return businessId ? `kt_business_${slug(businessId)}_${name}_v7` : (currentUser ? `kt_user_${slug(currentUser.id)}_${name}_v6` : `kt_guest_${name}_v7`);
  };
  const readLocal = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } };
  const writeLocal = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const writeLocalOnly = (key, value) => originalSetItem(key, JSON.stringify(value));
  currentBusiness = readLocal(BUSINESS_KEY, null);

  async function saveCloud(name, value) {
    if (!client || !session?.access_token || !currentUser || !currentBusiness?.business_id || hydrating) return;
    const businessId = currentBusiness.business_id;
    const payload = {
      user_id: currentUser.id,
      business_id: businessId,
      key: name,
      value,
      updated_at: new Date().toISOString()
    };
    // Satu baris untuk satu data per usaha. Upsert mencegah konflik saat
    // Owner/UMKM menyimpan perubahan hampir bersamaan.
    const { error } = await client
      .from('user_data')
      .upsert(payload, { onConflict: 'business_id,key' });
    if (error) console.warn('Gagal sinkronisasi cloud:', error.message);
  }

  async function hydrateCloud() {
    if (!client || !currentUser || !session?.access_token || !currentBusiness?.business_id) return;
    hydrating = true;
    try {
      const { data, error } = await client
        .from('user_data')
        .select('key,value')
        .eq('business_id', currentBusiness.business_id);
      if (error) throw error;
      for (const row of (data || [])) {
        if (DATA_NAMES.includes(row.key)) {
          originalSetItem(localKey(row.key), JSON.stringify(row.value ?? []));
        }
      }
    } catch (error) {
      console.warn('Gagal memuat data usaha dari cloud:', error.message);
    } finally {
      hydrating = false;
    }
  }

  async function connectBusiness(code) {
    const clean = String(code || '').trim().toUpperCase();
    if (!clean) throw new Error('Kode usaha wajib diisi.');
    const { data, error } = await client.rpc('connect_business', { p_code: clean });
    if (error) throw error;
    currentBusiness = data;
    writeLocal(BUSINESS_KEY, currentBusiness);
    writeLocal(ROLE_KEY, currentBusiness.role);
    return currentBusiness;
  }

  async function connectOwnerBusiness() {
    if (!currentUser?.id) throw new Error('Akun belum siap.');
    const { data: profile, error: profileError } = await client.from('profiles').select('role,business_id').eq('user_id', currentUser.id).maybeSingle();
    if (profileError) throw profileError;
    const userRole = profile?.role || currentUser?.user_metadata?.role || 'owner';
    if (userRole !== 'owner') throw new Error('Akun UMKM wajib memasukkan kode usaha Owner.');
    let business = null;
    if (profile?.business_id) {
      const { data, error } = await client.from('businesses').select('id,owner_id,business_code,name').eq('id', profile.business_id).maybeSingle();
      if (error) throw error;
      business = data;
    } else {
      const { data, error } = await client.from('businesses').select('id,owner_id,business_code,name').eq('owner_id', currentUser.id).maybeSingle();
      if (error) throw error;
      business = data;
    }
    if (!business) throw new Error('Data usaha Owner belum ditemukan. Jalankan SQL sistem Owner/UMKM terlebih dahulu.');
    currentBusiness = { role: 'owner', business_id: business.id, business_code: business.business_code, owner_id: business.owner_id, name: business.name };
    writeLocal(BUSINESS_KEY, currentBusiness);
    writeLocal(ROLE_KEY, 'owner');
    return currentBusiness;
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

  async function restoreSession() {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    session = data.session;
    currentUser = session?.user || null;

    if (!currentUser) {
      currentUser = null;
      currentBusiness = null;
      localStorage.removeItem(CURRENT_KEY);
      localStorage.removeItem(LOGIN_KEY);
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(BUSINESS_KEY);
      localStorage.removeItem(ROLE_KEY);
      return session;
    }

    writeLocal(CURRENT_KEY, currentUser);
    originalSetItem(LOGIN_KEY, 'true');
    writeLocal(SESSION_KEY, session);

    // Jangan percaya business_id yang tersimpan di localStorage sebagai sumber
    // kebenaran. Ambil role + business terbaru dari database setiap kali sesi
    // dipulihkan, sehingga pindah perangkat/browser tetap konsisten.
    try {
      const { data: profile, error: profileError } = await client
        .from('profiles')
        .select('role,business_id')
        .eq('user_id', currentUser.id)
        .maybeSingle();
      if (profileError) throw profileError;

      if (profile?.role === 'owner') {
        await connectOwnerBusiness();
      } else if (profile?.role === 'umkm' && profile.business_id) {
        const { data: b, error: bError } = await client
          .from('businesses')
          .select('id,owner_id,business_code,name')
          .eq('id', profile.business_id)
          .maybeSingle();
        if (bError) throw bError;
        if (!b) throw new Error('Usaha yang terhubung tidak ditemukan.');
        currentBusiness = {
          role: 'umkm',
          business_id: b.id,
          business_code: b.business_code,
          owner_id: b.owner_id,
          name: b.name
        };
        writeLocal(BUSINESS_KEY, currentBusiness);
        writeLocal(ROLE_KEY, 'umkm');
      } else {
        currentBusiness = null;
        localStorage.removeItem(BUSINESS_KEY);
        localStorage.removeItem(ROLE_KEY);
      }
    } catch (e) {
      console.warn('Gagal memulihkan data usaha:', e.message);
      // Jangan memakai business lama dari browser jika database tidak
      // mengonfirmasi hubungan akun tersebut.
      currentBusiness = null;
      localStorage.removeItem(BUSINESS_KEY);
      localStorage.removeItem(ROLE_KEY);
    }

    return session;
  }

  async function signUp(email, password, name, role = 'owner', businessName = '', businessCode = '') {
    const cleanEmail = email.trim().toLowerCase();
    const safeRole = role === 'umkm' ? 'umkm' : 'owner';
    const meta = { name: name.trim(), role: safeRole };
    if (safeRole === 'owner') {
      meta.business_name = businessName.trim() || `${name.trim()} - Usaha`;
      meta.business_code = String(businessCode || '').trim().toUpperCase();
    }
    const { data, error } = await client.auth.signUp({ email: cleanEmail, password, options: { data: meta } });
    if (error) throw error;
    session = data.session; currentUser = data.user;
    if (!session) {
      return { needsConfirmation: true, user: currentUser, role: safeRole, businessCode: meta.business_code || '' };
    }
    writeLocal(SESSION_KEY, session); writeLocal(CURRENT_KEY, currentUser); originalSetItem(LOGIN_KEY, 'true');
    if (safeRole === 'owner') await connectBusiness(meta.business_code);
    else { currentBusiness = null; localStorage.removeItem(BUSINESS_KEY); localStorage.removeItem(ROLE_KEY); }
    await hydrateCloud();
    return { needsConfirmation: false, user: currentUser, role: safeRole, businessCode: meta.business_code || '' };
  }

  async function signIn(email, password, businessCode, loginRole = '') {
    const { data, error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) throw error;
    session = data.session; currentUser = data.user;
    writeLocal(SESSION_KEY, session); writeLocal(CURRENT_KEY, currentUser); originalSetItem(LOGIN_KEY, 'true');
    try {
      const metaRole = currentUser?.user_metadata?.role;
      let detectedRole = metaRole;
      if (!detectedRole) {
        const { data: profile, error: profileError } = await client.from('profiles').select('role').eq('user_id', currentUser.id).maybeSingle();
        if (profileError) throw profileError;
        detectedRole = profile?.role || 'owner';
      }
      const requestedRole = loginRole === 'umkm' ? 'umkm' : (loginRole === 'owner' ? 'owner' : '');
      if (requestedRole && detectedRole !== requestedRole) {
        throw new Error(requestedRole === 'owner'
          ? 'Akun ini terdaftar sebagai UMKM. Pilih login UMKM.'
          : 'Akun ini terdaftar sebagai Owner Usaha. Pilih login Owner Usaha.');
      }
      if (detectedRole === 'owner') {
        await connectOwnerBusiness();
      } else {
        if (!String(businessCode || '').trim()) throw new Error('Akun UMKM wajib memasukkan kode usaha dari Owner.');
        await connectBusiness(businessCode);
      }
    } catch (e) {
      try { await client.auth.signOut(); } catch {}
      session = null; currentUser = null; currentBusiness = null;
      localStorage.removeItem(SESSION_KEY); localStorage.removeItem(CURRENT_KEY); localStorage.removeItem(LOGIN_KEY); localStorage.removeItem(BUSINESS_KEY); localStorage.removeItem(ROLE_KEY);
      throw e;
    }
    await hydrateCloud();
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
        el.textContent = '';
        const img = document.createElement('img');
        img.src = url;
        img.alt = `Foto profil ${displayName}`;
        img.loading = 'lazy';
        img.decoding = 'async';
        img.style.cssText = 'position:absolute!important;inset:0!important;width:100%!important;height:100%!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important;display:block!important;object-fit:cover!important;border-radius:50%!important;margin:0!important;padding:0!important;';
        el.appendChild(img);
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
    const businessEl = menu.querySelector('[data-profile-business]');
    if (businessEl) businessEl.textContent = currentBusiness?.business_code ? `Kode Usaha: ${currentBusiness.business_code}` : 'Belum terhubung ke usaha';
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
          <div class="profile-menu-business" data-profile-business></div>
        </div>
        <button type="button" class="profile-menu-close" aria-label="Tutup">×</button>
      </div>
      <div class="profile-menu-actions">
        <a class="profile-menu-btn primary" href="profile.html" data-profile-link>👤 Profil Saya</a><button type="button" class="profile-menu-btn primary" data-change-avatar>📷 Ganti Foto Profil</button>
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
  function role() { return currentBusiness?.role || readLocal(ROLE_KEY, currentUser?.user_metadata?.role || 'owner'); }
  function business() { return currentBusiness || readLocal(BUSINESS_KEY, null); }
  function isUmkm() { return role() === 'umkm'; }
  function read(key, fallback) { return readLocal(key, fallback); }
  function write(key, value) { writeLocal(key, value); }

  async function logout() {
    try { if (client) await client.auth.signOut(); } catch {}
    session = null; currentUser = null; currentBusiness = null;
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(CURRENT_KEY);
    localStorage.removeItem(LOGIN_KEY);
    localStorage.removeItem(BUSINESS_KEY);
    localStorage.removeItem(ROLE_KEY);
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
    if (currentUser && isUmkm() && protectedPages.includes(file) && !umkmAllowedPages.includes(file)) location.replace('storage.html');
    return currentUser;
  })();

  window.KasirAuth = {
    SUPABASE_URL, SUPABASE_KEY, CURRENT_KEY, LOGIN_KEY,
    DATA_NAMES, accounts, current, read, write, writeLocalOnly, key, setSession, role, business, isUmkm, connectBusiness, connectOwnerBusiness,
    logout, requireAuth, signUp, signIn, resetPassword, uploadAvatar, avatarUrl, openProfileMenu, ready,
    get session() { return session; },
    get client() { return client; }
  };

  document.addEventListener('DOMContentLoaded', async () => {
    try { await ready; } catch (error) { console.error('Supabase:', error); }
    const user = current();
    document.querySelectorAll('[data-account-name]').forEach(el => el.textContent = user?.user_metadata?.name || user?.email || 'Akun');

    // Akun terpisah dari tombol Masuk/Logout.
    // Guest: hanya tombol Masuk. User login: tombol Profil + tombol Logout.
    const displayName = user?.user_metadata?.name || user?.email || 'Akun';
    document.querySelectorAll('a.site-account').forEach(link => {
      const isAppLogin = link.classList.contains('login-button') || link.classList.contains('login-btn');
      if (!isAppLogin) return;
      if (!user) {
        link.innerHTML = '<span class="account-label">Masuk</span>';
        link.href = 'login.html';
        link.classList.remove('site-logout');
        link.onclick = null;
        return;
      }
      // Build separate profile button once.
      let profileLink = link.previousElementSibling;
      if (!profileLink || !profileLink.classList.contains('site-profile')) {
        profileLink = document.createElement('a');
        profileLink.className = 'site-profile';
        profileLink.href = 'profile.html';
        profileLink.setAttribute('aria-label', 'Profil Saya');
        profileLink.innerHTML = '<span class="account-avatar" data-account-avatar>U</span><span class="profile-label">Profil</span>';
        link.parentNode.insertBefore(profileLink, link);
      }
      const avatar = profileLink.querySelector('[data-account-avatar]');
      if (avatar) {
        renderAccountAvatars(user);
        avatar.style.cursor = 'pointer';
        avatar.onclick = e => { e.preventDefault(); e.stopPropagation(); openProfileMenu(user); };
        avatar.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProfileMenu(user); } };
      }
      link.innerHTML = '<span class="account-label">Keluar</span>';
      link.href = '#logout';
      link.classList.add('site-logout');
      link.setAttribute('aria-label', `Keluar dari akun ${displayName}`);
      link.onclick = async e => { e.preventDefault(); await logout(); };
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
