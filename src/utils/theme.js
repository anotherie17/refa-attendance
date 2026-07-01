// ===== TEMA (TERANG / GELAP / OTOMATIS) =====
// Preferensi disimpan di localStorage (bukan data sensitif, aman disimpan
// di browser). 3 pilihan:
//   'light' -> selalu terang, paksa lewat <html data-theme="light">
//   'dark'  -> selalu gelap,  paksa lewat <html data-theme="dark">
//   'auto'  -> ikut setting sistem/HP, TIDAK ada atribut data-theme
//              (style.css yang menentukan lewat @media prefers-color-scheme)
//
// Catatan: penerapan tema saat HALAMAN PERTAMA KALI DIBUKA sudah dilakukan
// oleh script kecil inline di <head> index.html (supaya tidak kedip putih
// sebelum CSS sempat ke-load). File ini hanya menangani PERUBAHAN tema
// lewat toggle di halaman Profil, setelah aplikasi berjalan.

const STORAGE_KEY = 'refa-theme';

export function getStoredTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY) || 'auto';
  } catch (e) {
    // localStorage diblokir (mode privat ketat, dll) — anggap auto.
    return 'auto';
  }
}

export function setTheme(choice) {
  // choice: 'light' | 'dark' | 'auto'
  if (choice === 'light' || choice === 'dark') {
    document.documentElement.setAttribute('data-theme', choice);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }

  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch (e) {
    // Gagal simpan (mode privat dll) — tema tetap berlaku untuk sesi ini,
    // hanya tidak diingat setelah halaman ditutup. Tidak fatal.
  }

  updateThemeToggleUI(choice);
}

export function updateThemeToggleUI(choice) {
  const wrap = document.getElementById('themeToggle');
  if (!wrap) return;

  wrap.querySelectorAll('button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.themeChoice === choice);
  });
}

export function initThemeToggle() {
  const wrap = document.getElementById('themeToggle');
  if (!wrap) return;

  // Render status tombol aktif sesuai preferensi yang sudah tersimpan
  updateThemeToggleUI(getStoredTheme());

  wrap.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      setTheme(btn.dataset.themeChoice);
    });
  });
}
