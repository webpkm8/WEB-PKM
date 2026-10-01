document.addEventListener('DOMContentLoaded', async () => {
  try { await KasirAuth.ready; } catch (e) {}
  const user = KasirAuth.current();
  if (!user) { location.replace('login.html'); return; }

  const $ = s => document.querySelector(s);
  const meta = user.user_metadata || {};
  const business = KasirAuth.business() || {};
  const role = KasirAuth.role();
  const roleLabel = role === 'umkm' ? 'UMKM' : 'Owner Usaha';
  const status = $('#profile-status');

  const name = meta.name || user.email || 'Akun';
  const email = user.email || '-';

  $('[data-profile-name]').textContent = name;
  $('[data-profile-email]').textContent = email;
  $('[data-profile-role]').textContent = roleLabel;
  $('[data-info-name]').textContent = name;
  $('[data-info-email]').textContent = email;
  $('[data-form-email]').textContent = email;
  $('[data-info-role]').textContent = roleLabel;
  $('[data-info-business]').textContent = business.name || 'Belum terhubung';
  $('[data-info-code]').textContent = business.business_code || 'Belum terhubung';
  $('#profile-name-input').value = meta.name || '';

  function setAvatar(currentUser = KasirAuth.current() || user) {
    const box = $('[data-profile-avatar-large]');
    const currentMeta = currentUser?.user_metadata || {};
    const url = KasirAuth.avatarUrl ? KasirAuth.avatarUrl(currentUser) : currentMeta.avatar_url;
    box.innerHTML = '';
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = 'Foto profil';
      box.appendChild(img);
    } else {
      box.textContent = (currentMeta.name || currentUser?.email || 'U').trim().charAt(0).toUpperCase() || 'U';
    }
  }

  setAvatar();

  async function saveProfile() {
    const newName = $('#profile-name-input').value.trim();
    if (!newName) {
      status.textContent = 'Nama tidak boleh kosong.';
      return;
    }
    status.textContent = 'Menyimpan perubahan...';
    try {
      const currentMeta = KasirAuth.current()?.user_metadata || {};
      const { data, error } = await KasirAuth.client.auth.updateUser({
        data: { ...currentMeta, name: newName }
      });
      if (error) throw error;
      const fresh = data.user || KasirAuth.current();
      $('[data-profile-name]').textContent = newName;
      $('[data-info-name]').textContent = newName;
      setAvatar(fresh);
      status.textContent = '✓ Profil berhasil diperbarui.';
    } catch (e) {
      status.textContent = e.message || 'Gagal menyimpan profil.';
    }
  }

  async function choosePhoto() {
    $('#profile-photo-input').click();
  }

  $('#save-profile').addEventListener('click', saveProfile);
  $('#change-photo').addEventListener('click', choosePhoto);
  $('#change-photo-top').addEventListener('click', choosePhoto);

  $('#profile-photo-input').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      status.textContent = 'Ukuran foto maksimal 3 MB.';
      e.target.value = '';
      return;
    }
    status.textContent = 'Mengunggah foto profil...';
    try {
      await KasirAuth.uploadAvatar(file);
      const fresh = KasirAuth.current();
      setAvatar(fresh);
      status.textContent = '✓ Foto profil berhasil diperbarui.';
    } catch (e) {
      status.textContent = e.message || 'Gagal mengunggah foto.';
    }
    e.target.value = '';
  });

  $('#logout-profile').addEventListener('click', async () => {
    await KasirAuth.logout();
    location.replace('index.html');
  });
});
