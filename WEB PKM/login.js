(() => {
  const $ = id => document.getElementById(id);
  const form = $('loginForm'), email = $('email'), password = $('password'), businessCode = $('businessCode');
  const businessCodeGroup = $('businessCodeGroup');
  const roleHelper = $('loginRoleHelper');
  const roleButtons = [...document.querySelectorAll('[data-login-role]')];
  let loginRole = 'owner';
  const toggle = $('passwordToggle'), button = $('loginButton'), forgot = $('forgotPassword');
  const emailError = $('emailError'), passError = $('passwordError'), businessCodeError = $('businessCodeError'), status = $('authStatus');
  if (!form || !email || !password) return;
  const setLoginRole = role => {
    loginRole = role === 'umkm' ? 'umkm' : 'owner';
    roleButtons.forEach(btn => {
      const active = btn.dataset.loginRole === loginRole;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    const isUmkm = loginRole === 'umkm';
    if (businessCodeGroup) businessCodeGroup.hidden = !isUmkm;
    if (businessCode) {
      businessCode.required = isUmkm;
      if (!isUmkm) businessCode.value = '';
    }
    if (roleHelper) roleHelper.textContent = isUmkm
      ? 'UMKM wajib memasukkan kode usaha dari Owner yang ingin dihubungkan.'
      : 'Owner cukup menggunakan email dan password. Tidak perlu kode usaha.';
    if (businessCodeError) businessCodeError.textContent = '';
  };
  roleButtons.forEach(btn => btn.addEventListener('click', () => setLoginRole(btn.dataset.loginRole)));
  setLoginRole('owner');
  const showStatus = (msg, ok = false) => { if (status) { status.textContent = msg; status.classList.toggle('success', ok); } };
  const validate = () => {
    let valid = true;
    if (!email.value.trim()) { emailError.textContent = 'Email wajib diisi.'; valid = false; }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) { emailError.textContent = 'Format email tidak valid.'; valid = false; }
    else emailError.textContent = '';
    businessCodeError.textContent = '';
    if (loginRole === 'umkm' && !businessCode.value.trim()) { businessCodeError.textContent = 'Kode usaha wajib diisi untuk akun UMKM.'; valid = false; }
    if (businessCode.value.trim()) businessCode.value = businessCode.value.trim().toUpperCase();
    if (!password.value) { passError.textContent = 'Password wajib diisi.'; valid = false; }
    else if (password.value.length < 6) { passError.textContent = 'Password minimal 6 karakter.'; valid = false; }
    else passError.textContent = '';
    return valid;
  };
  const friendlyError = err => {
    const raw = String(err?.message || err || '').trim();
    const low = raw.toLowerCase();
    if (low.includes('kode usaha') || low.includes('kode tidak') || low.includes('bukan milik') || low.includes('profil akun')) return raw;
    if (low.includes('invalid login credentials')) return 'Email atau password salah.';
    if (low.includes('email not confirmed')) return 'Email belum dikonfirmasi. Cek inbox email kamu.';
    if (low.includes('failed to fetch') || low.includes('network')) return 'Tidak dapat terhubung ke Supabase. Periksa internet dan jalankan lewat Live Server.';
    if (low.includes('invalid api key') || low.includes('apikey')) return 'Kunci Supabase tidak valid. Periksa konfigurasi auth.js.';
    return raw || 'Login gagal.';
  };
  toggle?.addEventListener('click', () => { const visible = password.type === 'text'; password.type = visible ? 'password' : 'text'; });
  form.addEventListener('submit', async e => {
    e.preventDefault(); showStatus(''); emailError.textContent = ''; passError.textContent = ''; if (!validate()) return;
    button.disabled = true; button.textContent = 'Memproses...';
    try {
      await KasirAuth.ready;
      await KasirAuth.signIn(email.value, password.value, businessCode.value, loginRole);
      const target = sessionStorage.getItem('kasirTokoAfterLogin') || 'fitur.html';
      sessionStorage.removeItem('kasirTokoAfterLogin');
      location.href = target;
    }
    catch (err) { showStatus(friendlyError(err)); button.disabled = false; button.textContent = 'Login'; }
  });
  forgot?.addEventListener('click', async e => {
    e.preventDefault(); emailError.textContent = '';
    const value = email.value.trim();
    if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { emailError.textContent = 'Masukkan email terlebih dahulu untuk reset password.'; email.focus(); return; }
    try { await KasirAuth.ready; await KasirAuth.resetPassword(value); showStatus('Link reset password sudah dikirim ke email kamu.', true); }
    catch (err) { showStatus(friendlyError(err)); }
  });
  const remembered = localStorage.getItem('kasirTokoRememberEmail'); if (remembered) { email.value = remembered; $('remember').checked = true; }
  email.addEventListener('input', () => emailError.textContent = ''); businessCode.addEventListener('input', () => businessCodeError.textContent = ''); password.addEventListener('input', () => passError.textContent = '');
  $('remember')?.addEventListener('change', e => { if (!e.target.checked) localStorage.removeItem('kasirTokoRememberEmail'); });
  form.addEventListener('submit', () => { if ($('remember')?.checked) localStorage.setItem('kasirTokoRememberEmail', email.value.trim()); });
})();
