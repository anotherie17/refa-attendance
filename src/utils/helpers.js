// ===== HELPER MURNI =====

export function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

// "Hari ini" SELALU dalam WITA (Asia/Makassar), bukan timezone device.
// Dipakai di semua tempat yang butuh acuan "hari ini" (kalender, week-start dayoff, jam header)
// supaya konsisten dengan tanggal yang dihitung server (checkin/checkout_attendance RPC).
export function getTodayWITA() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Makassar' });
}

// Geser tanggal 'YYYY-MM-DD' sebanyak n hari (boleh negatif), hasil string juga.
export function addDaysStr(dateStr, n) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const dt = new Date(y, m - 1, d + n, 12);
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}

export function getWeekStart(dateInput) {
  const dateStr = dateInput
    ? (typeof dateInput === 'string' ? dateInput.slice(0, 10) :
        dateInput.getFullYear() + '-' + String(dateInput.getMonth() + 1).padStart(2, '0') + '-' + String(dateInput.getDate()).padStart(2, '0'))
    : getTodayWITA();
  const [y, m, dNum] = dateStr.split('-').map(Number);
  const d = new Date(y, m - 1, dNum, 12); // jam 12 siang -> aman dari pergeseran DST/timezone
  d.setDate(d.getDate() - d.getDay());
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Kelompokkan baris per employee_id dengan satu kali lewat (O(n)),
// pengganti pola (rows).filter(...) di dalam .map() yang O(n*m).
// Escape teks isian user sebelum masuk innerHTML (anti stored-XSS).
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function groupRowsByEmployee(rows) {
  const map = new Map();
  (rows || []).forEach(r => {
    const arr = map.get(r.employee_id);
    if (arr) arr.push(r);
    else map.set(r.employee_id, [r]);
  });
  return map;
}

export function formatDateLabel(value) {
  if (!value) return '-';
  const dateValue = String(value).slice(0, 10);
  if (!dateValue || dateValue === 'null') return '-';
  const [year, month, day] = dateValue.split('-').map(Number);
  if (!year || !month || !day) return '-';
  return new Date(year, month - 1, day).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}

export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export function formatShiftLabel(shift) {
  if (!shift) return 'Pilih shift';
  const jamMulai = shift.jam_mulai ? shift.jam_mulai.slice(0, 5) : '--:--';
  const jamSelesai = shift.jam_selesai ? shift.jam_selesai.slice(0, 5) : '--:--';
  return shift.nama + ' • ' + jamMulai + ' - ' + jamSelesai;
}

// Format jam SELALU dalam WITA (Asia/Makassar), tidak tergantung timezone perangkat.
export function formatWITATime(value, withSeconds = true) {
  if (!value) return '-';
  const opts = { timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit', hour12: false };
  if (withSeconds) opts.second = '2-digit';
  return new Date(value).toLocaleTimeString('id-ID', opts);
}

export function formatAttendanceTime(value) {
  if (!value) return '-';
  return formatWITATime(value, true);
}

// Nama hari (index 0 = Minggu, cocok dengan Date.getDay()). Dipakai di banyak
// tempat (dayoff, admin dayoff, export rekap/PDF) — satu sumber biar konsisten.
export const HARI_LABELS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

// Label status absensi mentah ('tepat_waktu' / 'telat_15' / dst) -> teks tampilan.
export function formatStatusLabel(status) {
  if (!status) return '-';
  if (status === 'tepat_waktu') return 'Tepat Waktu';
  if (status.startsWith('telat_')) return 'Telat ' + status.split('_')[1] + ' menit';
  return status;
}

// Durasi antara jam masuk & keluar (timestamptz), format "1j 30m".
export function formatDurasiJam(masuk, keluar) {
  if (!masuk || !keluar) return '-';
  const ms = new Date(keluar) - new Date(masuk);
  if (ms <= 0) return '< 1m';
  return Math.floor(ms / 3600000) + 'j ' + Math.floor((ms % 3600000) / 60000) + 'm';
}

export function getAttendanceStatusLabel(todayAttendance) {
  if (!todayAttendance || !todayAttendance.status) return 'Belum absen';
  if (todayAttendance.status.startsWith('telat_')) {
    return 'Telat ' + todayAttendance.status.split('_')[1] + ' menit';
  }
  if (todayAttendance.status === 'tepat_waktu') {
    return 'Tepat waktu';
  }
  return todayAttendance.status;
}

export function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export function addPhotoWatermark(ctx, canvas, employeeName, lat, lng) {
  if (!canvas.width || !canvas.height) return;

  const nama = employeeName || 'Karyawan';
  const now = new Date();
  const dateText = now.toLocaleDateString('id-ID', {
    timeZone: 'Asia/Makassar',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
  const timeText = now.toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Makassar',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }) + ' WITA';
  const locationText = lat && lng
    ? lat.toFixed(6) + ', ' + lng.toFixed(6)
    : 'Koordinat tidak tersedia';

  const scale = Math.max(1, canvas.width / 640);
  const padding = Math.round(12 * scale);
  const lineHeight = Math.round(17 * scale);
  const radius = Math.round(14 * scale);
  const maxOverlayWidth = canvas.width - (padding * 2);
  const overlayWidth = Math.min(Math.round(280 * scale), maxOverlayWidth);
  const overlayHeight = padding * 2 + lineHeight * 4 + 5;
  const x = padding;
  const y = canvas.height - overlayHeight - padding;
  const textX = x + padding;
  const maxTextWidth = overlayWidth - padding * 2;

  ctx.save();
  ctx.fillStyle = 'rgba(17, 24, 39, 0.58)';
  drawRoundedRect(ctx, x, y, overlayWidth, overlayHeight, radius);
  ctx.fill();

  ctx.fillStyle = '#ff8a2a';
  drawRoundedRect(ctx, textX, y + padding, Math.round(34 * scale), Math.max(3, Math.round(3 * scale)), Math.round(2 * scale));
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 ' + Math.round(13 * scale) + 'px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
  ctx.fillText('Refa Printing', textX, y + padding + lineHeight, maxTextWidth);

  ctx.font = '600 ' + Math.round(12 * scale) + 'px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
  ctx.fillText(nama, textX, y + padding + lineHeight * 2, maxTextWidth);
  ctx.fillText(dateText + ' • ' + timeText, textX, y + padding + lineHeight * 3, maxTextWidth);
  ctx.fillText(locationText, textX, y + padding + lineHeight * 4, maxTextWidth);
  ctx.restore();
}

export function getMonthRange(monthValue) {
  if (!monthValue) return null;

  const [yearRaw, monthRaw] = String(monthValue).split('-');
  const year = parseInt(yearRaw, 10);
  const month = parseInt(monthRaw, 10);

  if (!year || !month || month < 1 || month > 12) return null;

  const startDateStr = String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0') + '-01';
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endDateStr = String(nextYear).padStart(4, '0') + '-' + String(nextMonth).padStart(2, '0') + '-01';

  return { startDateStr, endDateStr };
}

export function filterItemsByMonth(items, monthValue, field) {
  const range = getMonthRange(monthValue);
  if (!range) return items || [];

  return (items || []).filter(item => {
    const value = item?.[field];
    if (!value) return false;
    const dateValue = String(value).slice(0, 10);
    return dateValue >= range.startDateStr && dateValue < range.endDateStr;
  });
}

export function getErrorMessage(err, context) {
  const raw = (err && err.message) ? err.message : String(err || '');
  const lower = raw.toLowerCase();

  if (lower.includes('invalid login credentials')) {
    return 'Email atau password salah. Silakan periksa kembali.';
  }
  if (lower.includes('banned')) {
    return 'Akun Anda telah dinonaktifkan. Hubungi admin untuk informasi lebih lanjut.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Email belum terverifikasi. Hubungi admin untuk bantuan.';
  }
  if (lower.includes('duplicate key') || lower.includes('unique constraint')) {
    if (context === 'attendance') {
      return 'Anda sudah memiliki data absensi untuk hari ini. Silakan muat ulang halaman untuk melihat status absen terbaru.';
    }
    return 'Data ini sudah ada sebelumnya, tidak bisa ditambahkan lagi.';
  }
  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('network request failed')) {
    return 'Koneksi internet terputus. Periksa jaringan Anda dan coba lagi.';
  }
  if (lower.includes('timeout')) {
    return 'Permintaan terlalu lama merespons. Coba lagi dalam beberapa saat.';
  }
  if (lower.includes('user denied geolocation') || lower.includes('permission denied')) {
    return 'Izin lokasi ditolak. Aktifkan izin lokasi di pengaturan browser untuk melanjutkan.';
  }
  if (lower.includes('position unavailable')) {
    return 'Lokasi tidak dapat dideteksi. Pastikan GPS aktif dan coba lagi.';
  }
  if (lower.includes('row-level security') || lower.includes('permission denied for')) {
    return 'Anda tidak memiliki akses untuk melakukan tindakan ini.';
  }
  if (lower.includes('violates foreign key constraint')) {
    return 'Data ini masih dipakai di tempat lain, tidak bisa dihapus.';
  }
  if (lower.includes('no rows') || lower.includes('not found') || lower.includes('pgrst116')) {
    return 'Data tidak ditemukan.';
  }

  const looksIndonesian = /[\u00e9]|tidak|sudah|harus|gagal|berhasil|silakan|mohon/i.test(raw);
  if (looksIndonesian && raw.length < 150) {
    return raw;
  }

  console.error('Pesan error asli (untuk debugging):', raw);
  return 'Terjadi kesalahan saat memproses permintaan. Silakan coba lagi atau hubungi admin jika berlanjut.';
}

// ===== STATISTIK KEHADIRAN (libur mingguan & cuti DIPISAH) =====
// Catatan: 'libur mingguan' (day_off_requests) != 'cuti' (leave_requests).
// - Libur mingguan: jatah istirahat rutin 1x/minggu -> mengurangi hari kerja.
// - Cuti: izin formal (motong saldo), dihitung per-hari, hari yang dimaafkan (bukan alpa).
function _eachDateStr(startStr, endStr, fn) {
  let d = new Date(startStr + 'T12:00:00');
  const end = new Date(endStr + 'T12:00:00');
  while (d <= end) {
    const ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    fn(ds);
    d.setDate(d.getDate() + 1);
  }
}

function _weekStartStr(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() - d.getDay()); // mundur ke hari Minggu
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function computeMonthlyAttendance(opts) {
  const startDateStr = opts.startDateStr;       // 'YYYY-MM-01'
  const endDateStr = opts.endDateStr;           // tgl 1 bulan berikutnya (eksklusif)
  const todayStr = opts.todayStr;
  const joinDateStr = opts.joinDateStr || null; // tanggal_masuk / created_at
  const attRows = opts.attRows || [];           // [{tanggal, status}]
  const leaveRows = opts.leaveRows || [];       // [{start_date, end_date}] approved
  const dayOffRows = opts.dayOffRows || [];     // [{week_start, off_date}] approved

  // hari terakhir dihitung = min(hari ini, hari terakhir bulan)
  const endObj = new Date(endDateStr + 'T12:00:00');
  endObj.setDate(endObj.getDate() - 1);
  const lastDayOfMonthStr = endObj.getFullYear() + '-' + String(endObj.getMonth() + 1).padStart(2, '0') + '-' + String(endObj.getDate()).padStart(2, '0');
  const lastCounted = todayStr < lastDayOfMonthStr ? todayStr : lastDayOfMonthStr;

  // awal efektif = max(awal bulan, tanggal masuk)
  let effStart = startDateStr;
  if (joinDateStr && joinDateStr > effStart) effStart = joinDateStr;

  const empty = { countedDays: 0, weeklyOff: 0, workingDays: 0, cutiDays: 0, hadir: 0, telat: 0, wajibMasuk: 0, alpa: 0, persen: null };
  if (effStart > lastCounted) return empty;

  // Kehadiran dalam window
  const attInWindow = attRows.filter(a => a.tanggal >= effStart && a.tanggal <= lastCounted);
  const hadir = attInWindow.length;
  const telat = attInWindow.filter(a => a.status && a.status.startsWith('telat_')).length;

  // Cuti -> set tanggal UNIK dalam window (range diekspansi per hari, dedup otomatis)
  const cutiSet = new Set();
  leaveRows.forEach(l => {
    if (!l.start_date) return;
    const endD = l.end_date || l.start_date;
    _eachDateStr(l.start_date, endD, ds => {
      if (ds >= effStart && ds <= lastCounted) cutiSet.add(ds);
    });
  });
  const cutiDays = cutiSet.size;

  // Libur mingguan tercatat: week_start -> off_date
  const offByWeek = {};
  dayOffRows.forEach(o => { if (o.week_start) offByWeek[o.week_start] = o.off_date; });

  // Kumpulkan hari per minggu dalam window
  let countedDays = 0;
  const daysByWeek = {};
  _eachDateStr(effStart, lastCounted, ds => {
    countedDays++;
    const ws = _weekStartStr(ds);
    if (!daysByWeek[ws]) daysByWeek[ws] = [];
    daysByWeek[ws].push(ds);
  });

  // Hitung libur mingguan (1/minggu): pakai yang tercatat jika off_date di dalam window,
  // kalau minggu itu tak ada ajuan libur -> tetap diasumsikan ambil 1 (sesuai keputusan owner).
  let weeklyOff = 0;
  Object.keys(daysByWeek).forEach(ws => {
    const arr = daysByWeek[ws];
    const recordedOff = offByWeek[ws];
    if (recordedOff) {
      if (arr.indexOf(recordedOff) !== -1) weeklyOff += 1;
    } else if (arr.length >= 1) {
      weeklyOff += 1;
    }
  });

  const workingDays = Math.max(0, countedDays - weeklyOff); // hari kerja (sesudah libur mingguan)
  const wajibMasuk = Math.max(0, workingDays - cutiDays);   // hari wajib masuk (sesudah cuti)
  const alpa = Math.max(0, wajibMasuk - hadir);             // Tidak Hadir
  const persen = wajibMasuk > 0 ? Math.round((hadir / wajibMasuk) * 100) : null;

  return { countedDays, weeklyOff, workingDays, cutiDays, hadir, telat, wajibMasuk, alpa, persen };
}

// ===== SKELETON LOADING (placeholder shimmer saat memuat) =====
export function skeletonList(rows) {
  rows = rows || 3;
  let html = '';
  for (let i = 0; i < rows; i++) {
    html += '<div class="skel-card skeleton"></div>';
  }
  return html;
}

// ===== ROLE: siapa yang WAJIB ABSEN =====
// Admin & superadmin tidak wajib absen, jadi tidak ikut dihitung
// dalam statistik/laporan kehadiran (persentase, rekap, ranking, dll).
export const NON_ATTENDANCE_ROLES = ['admin', 'superadmin'];

export function isTrackedForAttendance(emp) {
  return !!emp && !NON_ATTENDANCE_ROLES.includes(emp.role);
}

// Buang admin & superadmin dari daftar karyawan untuk keperluan absensi.
// Karyawan dengan role kosong/null tetap dihitung (dianggap karyawan biasa).
export function filterTrackedEmployees(list) {
  return (list || []).filter(isTrackedForAttendance);
}

// ===== KOMPRES & RESIZE GAMBAR (hemat storage) =====
// Terima File/Blob gambar, kembalikan Blob JPEG yang sudah diperkecil.
// Opsi: maxDim (sisi terpanjang px), quality (0..1), maxBytes (target ukuran),
//       minQuality & minDim (batas bawah agar gambar tetap layak).
// Jika maxBytes diisi, kualitas lalu dimensi diturunkan bertahap sampai <= maxBytes.
export function compressImage(input, opts = {}) {
  const {
    maxDim = 1280,
    quality = 0.75,
    maxBytes = null,
    minQuality = 0.4,
    minDim = 640
  } = opts;

  return new Promise((resolve, reject) => {
    let url;
    try { url = URL.createObjectURL(input); } catch (e) { return reject(e); }

    const img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gagal memuat gambar untuk dikompres.')); };
    img.onload = () => {
      const baseW = img.naturalWidth || img.width;
      const baseH = img.naturalHeight || img.height;
      const scale = Math.min(1, maxDim / Math.max(baseW, baseH));
      const startW = Math.max(1, Math.round(baseW * scale));
      const startH = Math.max(1, Math.round(baseH * scale));

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const finish = (blob) => { URL.revokeObjectURL(url); resolve(blob); };

      const encode = (w, h, q) => {
        canvas.width = w;
        canvas.height = h;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          if (!blob) { URL.revokeObjectURL(url); return reject(new Error('Gagal mengompres gambar.')); }
          if (!maxBytes || blob.size <= maxBytes) return finish(blob);
          if (q > minQuality + 0.001) {
            return encode(w, h, Math.max(minQuality, q - 0.1)); // turunkan kualitas dulu
          }
          if (Math.max(w, h) > minDim) {
            return encode(Math.max(1, Math.round(w * 0.85)), Math.max(1, Math.round(h * 0.85)), quality); // lalu perkecil dimensi
          }
          return finish(blob); // sudah mentok, pakai apa adanya
        }, 'image/jpeg', q);
      };

      encode(startW, startH, quality);
    };

    img.src = url;
  });
}
