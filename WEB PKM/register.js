(() => {
  const $ = id => document.getElementById(id), form = $('registerForm');
  if (!form) return;
  const fields = { name: $('fullName'), email: $('email'), password: $('password'), confirm: $('confirmPassword'), businessName: $('businessName') };
  const ownerFields = $('ownerFields');
  const accountTypes = [...document.querySelectorAll('input[name=accountType]')];
  const ownerCodeBox = $('ownerCodeBox');
  const makeBusinessCode = () => 'OWN-' + Math.random().toString(36).slice(2, 10).toUpperCase();
  const refreshType = () => { const owner = (document.querySelector('input[name=accountType]:checked')?.value || 'owner') === 'owner'; ownerFields.style.display = owner ? '' : 'none'; ownerCodeBox.innerHTML = owner ? '<b>Kode usaha dibuat otomatis saat pendaftaran.</b><span>Simpan kode ini. Kode tersebut diperlukan saat login dan saat menghubungkan akun UMKM.</span>' : '<b>Akun UMKM tidak membuat kode usaha.</b><span>Saat login, masukkan kode usaha milik Owner agar akun UMKM terhubung.</span>'; };
  accountTypes.forEach(r => r.addEventListener('change', refreshType)); refreshType();
  const errors = { name: $('nameError'), email: $('emailError'), password: $('passwordError'), confirm: $('confirmError') };
  const status = $('registerStatus');
  const button = $('registerButton');
  const friendlyError = err => {
    const raw = String(err?.message || err || '').trim();
    const low = raw.toLowerCase();
    if (low.includes('already registered') || low.includes('already been registered') || low.includes('user already exists')) return 'Email ini sudah terdaftar. Silakan login.';
    if (low.includes('password') && (low.includes('at least') || low.includes('characters'))) return 'Password terlalu pendek. Gunakan minimal 6 karakter.';
    if (low.includes('rate limit') || low.includes('email rate limit')) return 'Terlalu banyak percobaan. Tunggu beberapa saat lalu coba lagi.';
    if (low.includes('invalid api key') || low.includes('apikey')) return 'Kunci Supabase tidak valid. Periksa konfigurasi auth.js.';
    if (low.includes('failed to fetch') || low.includes('network')) return 'Tidak dapat terhubung ke Supabase. Periksa internet dan jalankan lewat Live Server.';
    if (low.includes('email provider') || low.includes('email signups are disabled')) return 'Pendaftaran email belum diaktifkan di Supabase Authentication → Providers → Email.';
    if (low.includes('confirm email')) return 'Akun dibuat, tetapi email konfirmasi masih diperlukan.';
    return raw || 'Pendaftaran gagal. Periksa konfigurasi Supabase.';
  };
  form.addEventListener('submit', async e => {
    e.preventDefault();
    Object.values(errors).forEach(x => x.textContent = '');
    status.textContent = ''; status.classList.remove('success');
    let valid = true; const email = fields.email.value.trim().toLowerCase();
    const role = document.querySelector('input[name=accountType]:checked')?.value || 'owner';
    if (!fields.name.value.trim()) { errors.name.textContent = 'Nama lengkap wajib diisi.'; valid = false; }
    if (role === 'owner' && !fields.businessName.value.trim()) { $('businessNameError').textContent = 'Nama usaha wajib diisi.'; valid = false; } else $('businessNameError').textContent = '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errors.email.textContent = 'Masukkan email yang valid.'; valid = false; }
    if (fields.password.value.length < 6) { errors.password.textContent = 'Password minimal 6 karakter.'; valid = false; }
    if (fields.confirm.value !== fields.password.value) { errors.confirm.textContent = 'Konfirmasi password tidak sama.'; valid = false; }
    if (!valid) return;
    button.disabled = true; button.textContent = 'Menyimpan...';
    try {
      await KasirAuth.ready;
      const role = document.querySelector('input[name=accountType]:checked')?.value || 'owner';
      const businessCode = role === 'owner' ? makeBusinessCode() : '';
      const result = await KasirAuth.signUp(email, fields.password.value, fields.name.value, role, fields.businessName?.value || '', businessCode);
      if (result?.needsConfirmation) {
        status.innerHTML = role === 'owner' ? `Akun Owner berhasil dibuat. Kode usaha kamu: <b>${result.businessCode}</b>. Simpan kode ini, lalu cek email untuk konfirmasi.` : 'Akun UMKM berhasil dibuat. Cek email untuk konfirmasi, lalu saat login masukkan kode usaha milik Owner.';
        status.classList.add('success');
        button.disabled = false; button.textContent = 'Buat Akun';
      } else {
        if (role === 'owner') { status.innerHTML = `Akun Owner aktif. <b>Kode usaha: ${result.businessCode}</b>. Simpan kode ini.`; status.classList.add('success'); }
        location.href = role === 'owner' ? 'fitur.html' : 'login.html';
      }
    } catch (err) {
      const message = friendlyError(err);
      if (message.toLowerCase().includes('email ini sudah terdaftar')) errors.email.textContent = message;
      else status.textContent = message;
      button.disabled = false; button.textContent = 'Buat Akun';
    }
  });
})();
