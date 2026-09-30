WEB PKM - SUPABASE EMAIL/PASSWORD (PERBAIKAN)

1. Jalankan supabase_schema.sql SEKALI di Supabase Dashboard -> SQL Editor.
2. Supabase -> Authentication -> Providers -> Email: pastikan Email aktif.
3. Jika ingin langsung masuk setelah daftar, matikan Confirm email. Jika tetap aktif, pengguna harus mengklik email konfirmasi.
4. Website memakai Supabase JS Client resmi dari CDN dan Publishable key di auth.js.
5. Login dan daftar menggunakan EMAIL + PASSWORD. Tidak menggunakan Google.
6. Data aplikasi disimpan per user_id pada public.user_data dengan Row Level Security.
7. Jalankan website lewat Live Server atau hosting HTTPS, bukan file://.
8. Jika pendaftaran gagal, halaman sekarang menampilkan pesan error Supabase yang lebih spesifik.

PENTING:
- Publishable key boleh berada di frontend.
- Jangan pernah memasukkan service_role key / secret key ke file website.

JIKA MASIH GAGAL:
- Buka browser dengan http://127.0.0.1:5500/ (atau port Live Server kamu).
- Pastikan Email provider aktif.
- Pastikan supabase_schema.sql sudah dijalankan.
- Lihat pesan merah yang muncul di halaman daftar; pesan tersebut adalah error sebenarnya dari Supabase.

RESET / GANTI PASSWORD:
- login.html -> Lupa password -> Supabase mengirim email reset.
- reset-password.html menerima link reset dan menyimpan password baru dengan Supabase Auth.
- Untuk GitHub Pages, isi WEBPKM_PUBLIC_URL di site-config.js dengan URL publik website.
- Tambahkan URL reset-password.html tersebut ke Supabase Authentication -> URL Configuration -> Redirect URLs.
- Jangan memakai localhost jika link email akan dibuka dari HP.
