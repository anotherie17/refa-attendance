import { state } from '../state.js';
import { supabaseClient } from '../services/supabase.js';
import { formatShiftLabel, formatAttendanceTime, getAttendanceStatusLabel, getDaysInMonth, formatDateLabel, getTodayWITA } from './helpers.js';
import { showGreetingBubble } from '../modules/greeting.js';

// ===== PAGE NAVIGATION =====
export function showPage(pageName) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById(pageName);
  if (page) page.classList.add('active');
}

// ===== SECTION NAVIGATION (KARYAWAN) =====
export function switchSection(sectionName) {
  document.querySelectorAll('.app-section').forEach(section => section.classList.remove('active'));
  document.querySelectorAll('.quick-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === sectionName);
  });

  const sectionMap = {
    attendance: 'attendanceSection',
    leave: 'leaveSection',
    history: 'historySection',
    profile: 'profileSection'
  };

  const sectionId = sectionMap[sectionName] || sectionMap.attendance;
  const el = document.getElementById(sectionId);
  if (el) el.classList.add('active');

  // Sapaan acak ala chat muncul tiap masuk tab Absen
  if (sectionName === 'attendance') {
    showGreetingBubble();
  }
}

// ===== ADMIN TAB NAVIGATION =====
export function switchAdminTab(tabName) {
  document.querySelectorAll('.admin-section').forEach(section => section.classList.remove('active'));
  document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.adminTab === tabName);
  });

  const sectionMap = {
    ringkasan: 'adminRingkasanSection',
    approval: 'adminApprovalSection',
    riwayatcuti: 'adminRiwayatCutiSection',
    karyawan: 'adminKaryawanSection',
    absensi: 'adminAbsensiSection'
  };

  const sectionId = sectionMap[tabName] || sectionMap.ringkasan;
  const el = document.getElementById(sectionId);
  if (el) el.classList.add('active');
}

export function switchAbsensiView(view) {
  const hariIniBtn = document.getElementById('absensiToggleHariIni');
  const rekapBtn = document.getElementById('absensiToggleRekap');
  if (hariIniBtn) hariIniBtn.classList.toggle('active', view === 'hariini');
  if (rekapBtn) rekapBtn.classList.toggle('active', view === 'rekap');

  const hariIniView = document.getElementById('absensiHariIniView');
  const rekapView = document.getElementById('absensiRekapView');
  if (hariIniView) hariIniView.style.display = view === 'hariini' ? 'block' : 'none';
  if (rekapView) rekapView.style.display = view === 'rekap' ? 'block' : 'none';
}

// ===== PENGAJUAN SUB-TAB (Cuti / Libur / Izin Khusus) =====
export function switchPengajuanView(view) {
  const views = { cuti: 'pengajuanCutiView', libur: 'pengajuanLiburView', izin: 'pengajuanIzinView' };
  const buttons = { cuti: 'pengajuanToggleCuti', libur: 'pengajuanToggleLibur', izin: 'pengajuanToggleIzin' };

  Object.entries(views).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.style.display = key === view ? 'block' : 'none';
  });
  Object.entries(buttons).forEach(([key, id]) => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.toggle('active', key === view);
  });

  if (window.lucide) window.lucide.createIcons();
}

// ===== USER INFO =====
export function updateUserInfo() {
  if (!state.currentEmployee) return;
  const _r = state.currentEmployee.role;

  const roleText = _r === 'superadmin' ? 'Super Admin' : (_r === 'admin' ? 'Admin' : 'Karyawan');

  const userName = document.getElementById('userName');
  const userRole = document.getElementById('userRole');
  const profileName = document.getElementById('profileName');
  const profileRole = document.getElementById('profileRole');
  const profileEmail = document.getElementById('profileEmail');
  const profileTanggalMasuk = document.getElementById('profileTanggalMasuk');
  const profileTanggalLahir = document.getElementById('profileTanggalLahir');
  const leaveBalanceEl = document.getElementById('leaveBalance');
  const leaveEntitlementEl = document.getElementById('leaveEntitlement');

  if (userName) userName.textContent = state.currentEmployee.nama;
  if (userRole) userRole.textContent = roleText;
  if (profileName) profileName.textContent = state.currentEmployee.nama;
  if (profileRole) profileRole.textContent = roleText;
  if (profileEmail) profileEmail.textContent = state.currentUser?.email || '-';
  if (profileTanggalMasuk) profileTanggalMasuk.textContent = formatDateLabel(state.currentEmployee.tanggal_masuk);
  if (profileTanggalLahir) profileTanggalLahir.textContent = formatDateLabel(state.currentEmployee.tanggal_lahir);

  const profilePhone = document.getElementById('profilePhone');
  if (profilePhone) profilePhone.textContent = state.currentEmployee.nomor_telepon || '-';

  const ktpEl = document.getElementById('profileKtpImg');
  if (ktpEl) {
    if (state.currentEmployee.ktp_url) {
      ktpEl.innerHTML = '<span class="ktp-loading"><span class="spinner"></span>Memuat KTP...</span>';
      supabaseClient.storage.from('ktp').createSignedUrl(state.currentEmployee.ktp_url, 3600)
        .then(({ data }) => {
          ktpEl.innerHTML = data?.signedUrl
            ? `<img src="${data.signedUrl}" alt="Foto KTP" style="max-width:100%;border-radius:8px;border:1px solid var(--line);">`
            : '<span style="color:var(--muted);font-size:13px;">Gagal memuat foto KTP.</span>';
        })
        .catch(() => { ktpEl.innerHTML = '<span style="color:var(--muted);font-size:13px;">Gagal memuat foto KTP.</span>'; });
    } else {
      ktpEl.innerHTML = '<span style="color:var(--muted);font-size:13px;">KTP belum diunggah. Hubungi admin.</span>';
    }
  }
  if (leaveBalanceEl) leaveBalanceEl.textContent = (state.currentEmployee.leave_balance || 0) + ' Hari';
  if (leaveEntitlementEl) leaveEntitlementEl.textContent = (state.currentEmployee.leave_entitlement || 0) + ' Hari';

  updateHeroState();
}

// ===== HERO =====
export function getSelectedShift() {
  if (state.todayAttendance && state.todayAttendance.shifts) {
    return state.todayAttendance.shifts;
  }
  return state.shifts.find(s => s.id === state.selectedShiftId) || null;
}

export function updateHeroState() {
  const heroBadge = document.getElementById('heroBadge');
  const heroTitle = document.getElementById('heroTitle');
  const heroSubtitle = document.getElementById('heroSubtitle');
  const heroShift = document.getElementById('heroShift');
  const heroStatus = document.getElementById('heroStatus');
  const heroNextAction = document.getElementById('heroNextAction');
  const heroCard = document.querySelector('.attendance-hero');

  if (!heroTitle || !state.currentEmployee) return;

  const nama = state.currentEmployee.nama || 'Karyawan';
  const shift = getSelectedShift();
  const hasMasuk = state.todayAttendance && state.todayAttendance.jam_masuk;
  const hasKeluar = state.todayAttendance && state.todayAttendance.jam_keluar;
  const isReadyCheckIn = !hasMasuk && state.locationOk && state.photoData && state.selectedShiftId;
  const isReadyCheckOut = hasMasuk && !hasKeluar && state.locationOk && state.photoData;
  const isComplete = hasMasuk && hasKeluar;
  const stateClass = isComplete ? 'state-complete' : isReadyCheckIn || isReadyCheckOut ? 'state-ready' : 'state-pending';

  if (heroCard) {
    heroCard.classList.remove('state-pending', 'state-ready', 'state-complete');
    heroCard.classList.add(stateClass);
  }

  if (heroShift) heroShift.textContent = formatShiftLabel(shift);

  if (isComplete) {
    if (heroBadge) heroBadge.textContent = 'Selesai';
    if (heroTitle) heroTitle.textContent = 'Absensi hari ini selesai';
    if (heroSubtitle) heroSubtitle.textContent = nama + ' tercatat absen masuk ' + formatAttendanceTime(state.todayAttendance.jam_masuk) + ' dan absen keluar ' + formatAttendanceTime(state.todayAttendance.jam_keluar) + '.';
    if (heroStatus) heroStatus.textContent = 'Lengkap';
    if (heroNextAction) heroNextAction.textContent = 'Tidak ada tindakan absensi lagi untuk hari ini.';
  } else if (hasMasuk) {
    if (heroBadge) heroBadge.textContent = isReadyCheckOut ? 'Siap Absen Keluar' : 'Absen Masuk Tercatat';
    if (heroTitle) heroTitle.textContent = nama + ', lanjutkan absen keluar';
    if (heroSubtitle) heroSubtitle.textContent = 'Absen masuk tercatat pukul ' + formatAttendanceTime(state.todayAttendance.jam_masuk) + '.';
    if (heroStatus) heroStatus.textContent = getAttendanceStatusLabel(state.todayAttendance);
    if (heroNextAction) heroNextAction.textContent = isReadyCheckOut
      ? 'Berikutnya: cek lokasi, ambil selfie, lalu tekan Absen Keluar.'
      : 'Lengkapi lokasi dan foto untuk lanjut absen keluar.';
  } else {
    if (heroBadge) heroBadge.textContent = isReadyCheckIn ? 'Siap Absen Masuk' : 'Belum Absen';
    if (heroTitle) heroTitle.textContent = nama + ', ' + (isReadyCheckIn ? 'siap absen masuk' : 'belum absen');
    if (heroSubtitle) heroSubtitle.textContent = isReadyCheckIn
      ? 'Semua syarat absensi sudah lengkap. Silakan lanjutkan absen masuk.'
      : 'Mulai dengan validasi lokasi dan selfie untuk absensi hari ini.';
    if (heroStatus) heroStatus.textContent = isReadyCheckIn ? 'Siap' : 'Belum absen';
    if (heroNextAction) heroNextAction.textContent = isReadyCheckIn
      ? 'Berikutnya: pilih shift, lalu tekan Absen Masuk.'
      : 'Berikutnya: cek lokasi, ambil selfie, pilih shift, lalu tekan Absen Masuk.';
  }

  // Centang "Beres" di kartu langkah 1-2-3
  const stepDone = [
    ['stepCardLokasi', !!state.locationOk],
    ['stepCardFoto', !!state.photoData],
    ['shiftCard', !!state.selectedShiftId]
  ];
  stepDone.forEach(([id, done]) => {
    const card = document.getElementById(id);
    if (card) card.classList.toggle('done', done);
  });
}

// Jam & tanggal header SELALU WITA (Asia/Makassar), bukan timezone device,
// supaya konsisten dengan tanggal/status yang dihitung server.
// Dipanggil tiap 1 detik (lihat main.js) selama app kebuka, TANPA peduli tab
// mana yang aktif. Nulis textContent cuma kalau nilainya BENERAN berubah —
// mutation DOM yang gak perlu (tiap detik, teksnya sama, 59 dari 60x) bikin
// MutationObserver di index.html (buat re-render ikon Lucide) kepicu sia-sia
// terus-menerus, yang di HP low-end bisa numpuk jadi jank & bikin tap kerasa
// "harus ditekan 2x" pas nabrak momen itu.
export function updateClock() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit', hour12: false });
  const dateStr = now.toLocaleDateString('id-ID', { timeZone: 'Asia/Makassar', weekday: 'long', day: 'numeric', month: 'long' });
  const combined = timeStr + ' | ' + dateStr;

  const el = document.getElementById('currentDateTime');
  if (el && el.textContent !== combined) el.textContent = combined;
}

// ===== UPDATE TOMBOL ABSEN =====
export function updateAbsenButtons() {
  const masukBtn = document.getElementById('absenMasukBtn');
  const keluarBtn = document.getElementById('absenKeluarBtn');
  const completeMsg = document.getElementById('attendanceCompleteMsg');
  const buttonGroup = document.getElementById('attendanceButtonGroup');
  const shiftCard = document.getElementById('shiftCard');
  const hasMasuk = state.todayAttendance && state.todayAttendance.jam_masuk;
  const hasKeluar = state.todayAttendance && state.todayAttendance.jam_keluar;

  const readyMasuk = state.locationOk && state.photoData && state.selectedShiftId;
  const readyKeluar = state.locationOk && state.photoData;

  if (shiftCard) {
    shiftCard.style.display = hasMasuk ? 'none' : 'block';
  }

  if (hasMasuk && hasKeluar) {
    if (masukBtn) masukBtn.style.display = 'none';
    if (keluarBtn) keluarBtn.style.display = 'none';
    if (buttonGroup) buttonGroup.style.gridTemplateColumns = '1fr';
    if (masukBtn) masukBtn.disabled = true;
    if (keluarBtn) keluarBtn.disabled = true;
    if (completeMsg) completeMsg.style.display = 'block';
  } else if (hasMasuk) {
    if (masukBtn) masukBtn.style.display = 'none';
    if (keluarBtn) keluarBtn.style.display = 'block';
    if (buttonGroup) buttonGroup.style.gridTemplateColumns = '1fr';
    if (masukBtn) masukBtn.disabled = true;
    if (keluarBtn) keluarBtn.disabled = !readyKeluar;
    if (completeMsg) completeMsg.style.display = 'none';
  } else {
    if (masukBtn) masukBtn.style.display = 'block';
    if (keluarBtn) keluarBtn.style.display = 'none';
    if (buttonGroup) buttonGroup.style.gridTemplateColumns = '1fr';
    if (masukBtn) masukBtn.disabled = !readyMasuk;
    if (keluarBtn) keluarBtn.disabled = true;
    if (completeMsg) completeMsg.style.display = 'none';
  }
}

// ===== EMPLOYEE FORM MODAL =====
export function openEmployeeForm(employeeId) {
  state.editingEmployeeId = employeeId || null;

  const title = document.getElementById('employeeFormTitle');
  const subtitle = document.getElementById('employeeFormSubtitle');

  document.getElementById('empFormNama').value = '';
  document.getElementById('empFormEmail').value = '';
  document.getElementById('empFormJabatan').value = '';
  document.getElementById('empFormRole').value = 'karyawan';

  const _superOpt = document.querySelector('#empFormRole option[value="superadmin"]');

  if (_superOpt) _superOpt.disabled = state.currentEmployee?.role !== 'superadmin';
  document.getElementById('empFormLeaveBalance').value = '0';
  document.getElementById('empFormLeaveEntitlement').value = '0';
  const _phone = document.getElementById('empFormPhone');
  if (_phone) _phone.value = '';
  const _ktpFile = document.getElementById('empFormKtpFile');
  if (_ktpFile) _ktpFile.value = '';
  const _ktpPrev = document.getElementById('empFormKtpPreview');
  if (_ktpPrev) _ktpPrev.innerHTML = '';
  const _pwd = document.getElementById('empFormPassword');
  if (_pwd) _pwd.value = '';

  const passwordGroup = document.getElementById('empFormPasswordGroup');

  if (state.editingEmployeeId) {
    title.textContent = 'Edit Karyawan';
    subtitle.textContent = 'Perbarui data karyawan. Email tidak bisa diubah karena terhubung dengan akun login.';
    if (passwordGroup) passwordGroup.style.display = 'none';
    document.getElementById('empFormEmail').disabled = true;
  } else {
    title.textContent = 'Tambah Karyawan';
    subtitle.textContent = 'Isi data karyawan baru. Akun login otomatis dibuat dari email & password di bawah — karyawan langsung bisa login.';
    if (passwordGroup) passwordGroup.style.display = 'block';
    document.getElementById('empFormEmail').disabled = false;
  }

  document.getElementById('employeeFormOverlay').classList.add('active');
}

export function closeEmployeeForm() {
  document.getElementById('employeeFormOverlay').classList.remove('active');
  state.editingEmployeeId = null;
}

// ===== KALENDER GRID =====
// joinDateStr (opsional): tanggal_masuk karyawan ('YYYY-MM-DD'). Hari sebelum tanggal ini
// tidak ditandai "Tidak Hadir" karena karyawan belum bekerja di REFA saat itu.
export function renderCalendarGrid(containerId, year, month, dayDataMap, joinDateStr) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const weekdayLabels = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const firstDay = new Date(year, month - 1, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = getDaysInMonth(year, month);
  const monthLabel = firstDay.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  const todayStr = getTodayWITA();

  let html = '<div style="text-align:center;font-weight:700;font-size:13px;color:var(--text);margin-bottom:8px;">' + monthLabel + '</div>';
  html += '<div class="cal-grid">';
  weekdayLabels.forEach(w => { html += '<div class="cal-weekday">' + w + '</div>'; });

  for (let i = 0; i < startOffset; i++) {
    html += '<div class="cal-day empty"></div>';
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = year + '-' + String(month).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    // Hari lampau tanpa catatan (absen/cuti/izin/off) = tidak hadir (merah) —
    // KECUALI sebelum tanggal masuk karyawan (belum kerja di REFA, jangan ditandai alpa).
    const beforeJoin = joinDateStr && dateStr < joinDateStr;
    const status = dayDataMap[dateStr] || (!beforeJoin && dateStr < todayStr ? 'absen' : '');
    const isToday = dateStr === todayStr;
    html += '<div class="cal-day ' + status + (isToday ? ' today' : '') + '">' + d + '</div>';
  }

  html += '</div>';
  html += `
    <div class="cal-legend">
      <span><span class="dot" style="background:var(--success);"></span> Hadir</span>
      <span><span class="dot" style="background:var(--warning);"></span> Telat</span>
      <span><span class="dot" style="background:var(--orange-700);"></span> Cuti/Izin</span>
      <span><span class="dot" style="background:var(--libur-fg);"></span> Off</span>
      <span><span class="dot" style="background:var(--error);"></span> Tidak Hadir</span>
    </div>
  `;

  container.innerHTML = html;
}