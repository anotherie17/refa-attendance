// ===== ENTRY POINT: ORCHESTRATOR & EVENT REGISTRY =====
import { state } from './state.js';
import { supabaseClient } from './services/supabase.js';
import { showError } from './utils/modal.js';
import { switchSection, switchAdminTab, switchAbsensiView, switchPengajuanView, updateClock, openEmployeeForm, closeEmployeeForm } from './utils/dom.js';
import * as auth from './modules/auth.js';
import * as forcePassword from './modules/force-password.js';
import * as shifts from './modules/shifts.js';
import * as attendance from './modules/attendance.js';
import * as leave from './modules/leave.js';
import * as history from './modules/history.js';
import * as profile from './modules/profile.js';
import * as adminDashboard from './modules/admin/dashboard.js';
import * as adminLeave from './modules/admin/leave.js';
import * as adminEmployee from './modules/admin/employee.js';
import * as adminAttendance from './modules/admin/attendance.js';
import * as dayoff from './modules/dayoff.js';
import * as adminDayoff from './modules/admin/dayoff.js';
import * as special from './modules/special-permission.js';
import * as adminSpecial from './modules/admin/special-permission.js';
import * as adminShifts from './modules/admin/shifts.js';
import { initThemeToggle } from './utils/theme.js';

// ===== BOOTSTRAP =====
document.addEventListener('DOMContentLoaded', async () => {

  // ===== Deteksi sesi Supabase habis (revoke/refresh gagal) =====
  supabaseClient?.auth.onAuthStateChange((event) => {
    // Kalau state.currentEmployee masih ada saat SIGNED_OUT, berarti bukan
    // logout manual (logout() mengosongkan state dulu) -> sesi kedaluwarsa.
    if (event === 'SIGNED_OUT' && state.currentEmployee) {
      auth.handleSessionExpired();
    }
  });
  setInterval(updateClock, 1000);
  updateClock();
  initThemeToggle();

  const loadingEl = document.getElementById('sessionLoading');
  if (loadingEl) loadingEl.classList.remove('hidden');

  const loggedIn = await auth.checkExistingSession();

  if (loadingEl) loadingEl.classList.add('hidden');

  if (loggedIn) {
    const isAdmin = ['admin', 'superadmin'].includes(state.currentEmployee?.role);
    if (!isAdmin) {
      await shifts.loadShifts();
      await attendance.loadTodayStatus();
      history.populateMonthFilter();
      dayoff.loadHomeDayOffCard();
    } else {
      adminDashboard.populateRingkasanMonthFilter();
      // loadRingkasanDashboard() sudah memanggil loadBirthdayReminder() di dalamnya.
      await adminDashboard.loadRingkasanDashboard();
      adminDashboard.setTrenMode('semua');
      adminDashboard.populateKalenderAdminFilter();
      adminDashboard.populateKalenderAdminMonthFilter();
      adminLeave.populateRiwayatCutiFilter();
      adminAttendance.populateRekapMonthFilter();
    }
  }
});

// ===== EVENT LISTENER REGISTRY =====

// AUTH
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginBtn');
  const originalText = btn.innerHTML;

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Sedang masuk...';

  const success = await auth.login(email, password);
  if (success) {
    const isAdmin = ['admin', 'superadmin'].includes(state.currentEmployee?.role);
    if (!isAdmin) {
      await shifts.loadShifts();
      await attendance.loadTodayStatus();
      history.populateMonthFilter();
      dayoff.loadHomeDayOffCard();
    } else {
      adminDashboard.populateRingkasanMonthFilter();
      // loadRingkasanDashboard() sudah memanggil loadBirthdayReminder() di dalamnya.
      await adminDashboard.loadRingkasanDashboard();
      adminDashboard.setTrenMode('semua');
      adminDashboard.populateKalenderAdminFilter();
      adminDashboard.populateKalenderAdminMonthFilter();
      adminLeave.populateRiwayatCutiFilter();
      adminAttendance.populateRekapMonthFilter();
    }
  }

  btn.disabled = false;
  btn.innerHTML = originalText;
});

document.getElementById('togglePasswordBtn')?.addEventListener('click', () => {
  const input = document.getElementById('loginPassword');
  const btn = document.getElementById('togglePasswordBtn');
  const isHidden = input.type === 'password';

  input.type = isHidden ? 'text' : 'password';

  btn.innerHTML = '<i data-lucide="' + (isHidden ? 'eye-off' : 'eye') + '"></i>';
  btn.setAttribute('aria-label', isHidden ? 'Sembunyikan password' : 'Tampilkan password');
  if (window.lucide) window.lucide.createIcons();
});

// WAJIB GANTI PASSWORD (login pertama, karyawan)
forcePassword.initPasswordChecklist();

document.getElementById('forcePasswordForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  await forcePassword.submitForcedPassword();
});

document.getElementById('toggleForcePasswordBtn')?.addEventListener('click', () => {
  const input = document.getElementById('forceNewPassword');
  const btn = document.getElementById('toggleForcePasswordBtn');
  const isHidden = input.type === 'password';

  input.type = isHidden ? 'text' : 'password';

  btn.innerHTML = '<i data-lucide="' + (isHidden ? 'eye-off' : 'eye') + '"></i>';
  btn.setAttribute('aria-label', isHidden ? 'Sembunyikan password' : 'Tampilkan password');
  if (window.lucide) window.lucide.createIcons();
});

// QUICK TABS (Karyawan)
document.querySelectorAll('.quick-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const section = btn.dataset.section;
    switchSection(section);
    if (section === 'attendance') {
      dayoff.loadHomeDayOffCard();
    }
    if (section === 'history') {
      history.loadRiwayat();
      history.loadKalenderPribadi();
    }
    if (section === 'leave') {
      switchPengajuanView('cuti');
      leave.refreshLeaveBalance();
      leave.loadLeaveRequests();
      dayoff.loadDayOffSection();
      special.loadSpecialPermissions();
    }
  });
});

// ADMIN TABS
document.querySelectorAll('.admin-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.adminTab;
    switchAdminTab(tab);

    if (tab === 'ringkasan') {
      auth.refreshPendingApprovalCard();
      adminDashboard.populateRingkasanMonthFilter();
      adminDashboard.loadRingkasanDashboard();
      adminDashboard.loadTrenKeterlambatan();
      adminDashboard.populateKalenderAdminFilter();
      adminDashboard.populateKalenderAdminMonthFilter();
    }
    if (tab === 'approval') {
      adminLeave.loadAdminLeaveRequests();
      adminDayoff.loadAdminDayOffRequests();
      adminSpecial.loadAdminSpecialPermissions();
    }
    if (tab === 'riwayatcuti') {
      adminLeave.populateRiwayatCutiFilter();
      adminLeave.loadAdminLeaveHistory();
    }
    if (tab === 'karyawan') {
      adminEmployee.loadEmployeeList();
    }
    if (tab === 'absensi') {
      adminShifts.loadShiftList();
      adminAttendance.loadAdminAbsensiHariIni();
      adminAttendance.populateRekapMonthFilter();
    }
  });
});

// SHIFTS
document.getElementById('shiftSelect')?.addEventListener('change', shifts.onShiftChange);

// LOCATION
document.getElementById('checkLocBtn')?.addEventListener('click', attendance.checkLocation);

// CAMERA
document.getElementById('cameraBtn')?.addEventListener('click', attendance.startCamera);
document.getElementById('captureBtn')?.addEventListener('click', attendance.capturePhoto);
document.getElementById('cancelCameraBtn')?.addEventListener('click', attendance.stopCamera);

// ATTENDANCE BUTTONS
document.getElementById('absenMasukBtn')?.addEventListener('click', attendance.absenMasuk);
document.getElementById('absenKeluarBtn')?.addEventListener('click', attendance.absenKeluar);

// LEAVE (User)
// Tanggal cuti & izin minimal hari ini (WITA) — tidak bisa pilih tanggal lampau.
{
  const todayWita = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Makassar' });
  const leaveDateEl = document.getElementById('leaveDate');
  const izinDateEl = document.getElementById('izinStartDate');
  if (leaveDateEl) leaveDateEl.min = todayWita;
  if (izinDateEl) izinDateEl.min = todayWita;
}

document.getElementById('submitLeaveBtn')?.addEventListener('click', leave.submitLeaveRequest);

// PENGAJUAN SUB-TAB (Cuti / Libur / Izin Khusus)
document.getElementById('pengajuanToggleCuti')?.addEventListener('click', () => switchPengajuanView('cuti'));
document.getElementById('pengajuanToggleLibur')?.addEventListener('click', () => switchPengajuanView('libur'));
document.getElementById('pengajuanToggleIzin')?.addEventListener('click', () => switchPengajuanView('izin'));

// IZIN KHUSUS (User)
document.getElementById('submitIzinBtn')?.addEventListener('click', special.submitSpecialPermission);

// HISTORY FILTER
document.getElementById('monthFilter')?.addEventListener('change', () => {
  history.loadRiwayat();
  history.loadKalenderPribadi();
});

// HISTORY: EXPORT SLIP ABSENSI PRIBADI (PDF)
document.getElementById('exportMyPdfBtn')?.addEventListener('click', history.exportMyAttendancePDF);

// PROFILE - GANTI PASSWORD
document.getElementById('changePasswordBtn')?.addEventListener('click', profile.changePassword);

// LOGOUT
document.querySelectorAll('.logout-btn').forEach(btn => {
  btn.addEventListener('click', () => auth.logout());
});

// ADMIN: RINGKASAN
document.getElementById('ringkasanMonthFilter')?.addEventListener('change', adminDashboard.loadRingkasanDashboard);
document.getElementById('exportRingkasanBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('exportRingkasanBtn');
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Membuat...';
  try {
    await adminDashboard.exportRingkasanToPDF();
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
});

// ADMIN: TREN CHART
document.getElementById('trenToggleSemua')?.addEventListener('click', () => adminDashboard.setTrenMode('semua'));
document.getElementById('trenToggleIndividu')?.addEventListener('click', () => adminDashboard.setTrenMode('individu'));
document.getElementById('trenEmployeeFilter')?.addEventListener('change', adminDashboard.loadTrenKeterlambatan);

// ADMIN: KALENDER ADMIN
document.getElementById('kalenderAdminEmployeeFilter')?.addEventListener('change', adminDashboard.loadKalenderAdmin);
document.getElementById('kalenderAdminMonthFilter')?.addEventListener('change', adminDashboard.loadKalenderAdmin);

// ADMIN: ABSENSI TOGGLE
document.getElementById('absensiToggleHariIni')?.addEventListener('click', () => {
  switchAbsensiView('hariini');
  adminAttendance.loadAdminAbsensiHariIni();
});
document.getElementById('absensiToggleRekap')?.addEventListener('click', () => {
  switchAbsensiView('rekap');
  adminAttendance.loadRekapBulanan();
});

// ADMIN: REKAP BULANAN
document.getElementById('rekapMonthFilter')?.addEventListener('change', adminAttendance.loadRekapBulanan);

// ADMIN: RIWAYAT CUTI FILTER
document.getElementById('riwayatCutiFilter')?.addEventListener('change', adminLeave.loadAdminLeaveHistory);
document.getElementById('riwayatTypeFilter')?.addEventListener('change', adminLeave.loadAdminLeaveHistory);

// ADMIN: KARTU "PERLU PERSETUJUAN" -> buka tab Approval
document.getElementById('adminNeedApprovalCard')?.addEventListener('click', () => {
  document.querySelector('.admin-tab[data-admin-tab="approval"]')?.click();
});
document.getElementById('adminNeedApprovalCard')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    document.querySelector('.admin-tab[data-admin-tab="approval"]')?.click();
  }
});

// ADMIN: KARYAWAN - TAMBAH
document.getElementById('openEmployeeFormBtn')?.addEventListener('click', () => openEmployeeForm(null));

// ADMIN: EMPLOYEE FORM SAVE & CANCEL
document.getElementById('empFormSaveBtn')?.addEventListener('click', adminEmployee.saveEmployee);
document.getElementById('empFormCancelBtn')?.addEventListener('click', closeEmployeeForm);
document.getElementById('empFormKtpFile')?.addEventListener('change', adminEmployee.onKtpFileSelected);

// ADMIN: KELOLA SHIFT
document.getElementById('openShiftFormBtn')?.addEventListener('click', () => adminShifts.openShiftForm(null));
document.getElementById('shiftFormSaveBtn')?.addEventListener('click', adminShifts.saveShift);
document.getElementById('shiftFormCancelBtn')?.addEventListener('click', adminShifts.closeShiftForm);
document.getElementById('adminShiftList')?.addEventListener('click', (e) => {
  const editBtn = e.target.closest('.shift-edit-btn');
  if (editBtn) {
    const id = editBtn.dataset.shiftId;
    if (id) adminShifts.openShiftFormById(id);
    return;
  }
  const deleteBtn = e.target.closest('.shift-delete-btn');
  if (deleteBtn) {
    const id = deleteBtn.dataset.shiftId;
    if (id) adminShifts.deleteShift(id);
  }
});

// ===== EVENT DELEGATION (UNTUK KONTEN DINAMIS) =====

// Admin Leave: Approve/Reject
document.getElementById('adminLeaveList')?.addEventListener('click', (e) => {
  const approveBtn = e.target.closest('.btn-approve');
  if (approveBtn) {
    const id = approveBtn.dataset.leaveId;
    if (id) adminLeave.approveLeave(parseInt(id));
    return;
  }
  const rejectBtn = e.target.closest('.btn-reject');
  if (rejectBtn) {
    const id = rejectBtn.dataset.leaveId;
    if (id) adminLeave.rejectLeave(parseInt(id));
  }
});

// Day-off (karyawan): submit & cancel
document.getElementById('dayOffContainer')?.addEventListener('click', (e) => {
  const submitBtn = e.target.closest('.dayoff-submit-btn');
  if (submitBtn) {
    const w = submitBtn.dataset.week;
    if (w) dayoff.submitDayOff(w);
    return;
  }
  const cancelBtn = e.target.closest('.dayoff-cancel-btn');
  if (cancelBtn) {
    const id = cancelBtn.dataset.dayoffId;
    if (id) dayoff.cancelDayOff(parseInt(id));
  }
});

// Day-off (admin): approve & reject
document.getElementById('adminDayOffList')?.addEventListener('click', (e) => {
  const approveBtn = e.target.closest('.btn-dayoff-approve');
  if (approveBtn) {
    const id = approveBtn.dataset.dayoffId;
    if (id) adminDayoff.approveDayOff(parseInt(id));
    return;
  }
  const rejectBtn = e.target.closest('.btn-dayoff-reject');
  if (rejectBtn) {
    const id = rejectBtn.dataset.dayoffId;
    if (id) adminDayoff.rejectDayOff(parseInt(id));
  }
});

// Izin Khusus (admin): approve & reject
document.getElementById('adminSpecialPermissionList')?.addEventListener('click', (e) => {
  const approveBtn = e.target.closest('.btn-izin-approve');
  if (approveBtn) {
    const id = approveBtn.dataset.izinId;
    if (id) adminSpecial.approveSpecialPermission(parseInt(id));
    return;
  }
  const rejectBtn = e.target.closest('.btn-izin-reject');
  if (rejectBtn) {
    const id = rejectBtn.dataset.izinId;
    if (id) adminSpecial.rejectSpecialPermission(parseInt(id));
  }
});

// Admin Employee: Edit & Toggle
document.getElementById('adminEmployeeList')?.addEventListener('click', async (e) => {
  const ktpBtn = e.target.closest('.ktp-spoiler-btn');
  if (ktpBtn) {
    await adminEmployee.toggleKtpSpoiler(ktpBtn);
    return;
  }

  const editBtn = e.target.closest('.employee-edit-btn');
  if (editBtn) {
    const id = editBtn.dataset.employeeId;
    if (id) {
      openEmployeeForm(id);
      await adminEmployee.loadEmployeeToForm(id);
    }
    return;
  }
  const toggleBtn = e.target.closest('.employee-toggle-btn');
  if (toggleBtn) {
    const id = toggleBtn.dataset.employeeId;
    const isActive = toggleBtn.dataset.active === 'true';
    if (id) {
      await adminEmployee.toggleEmployeeActive(id, isActive);
    }
  }
});

// Admin Attendance: Export Excel
document.getElementById('adminRekapBulanan')?.addEventListener('click', async (e) => {
  const exportBtn = e.target.closest('#exportRekapBtn');
  if (!exportBtn) return;
  const month = exportBtn.dataset.month;
  if (!month) return;
  const orig = exportBtn.innerHTML;
  exportBtn.disabled = true;
  exportBtn.innerHTML = '<span class="spinner"></span>Membuat...';
  try {
    await adminAttendance.exportRekapToExcel(month);
  } finally {
    exportBtn.disabled = false;
    exportBtn.innerHTML = orig;
  }
});

// Admin Attendance: Export PDF per karyawan (Fase 9)
document.getElementById('adminRekapBulanan')?.addEventListener('click', async (e) => {
  const pdfBtn = e.target.closest('.rekap-pdf-btn');
  if (!pdfBtn) return;
  const empId = pdfBtn.dataset.empId;
  const month = pdfBtn.dataset.month;
  if (!empId || !month) return;
  const orig = pdfBtn.textContent;
  pdfBtn.disabled = true;
  pdfBtn.textContent = 'Membuat...';
  try {
    await adminAttendance.exportKaryawanToPDF(empId, month, (done, total) => {
      pdfBtn.textContent = 'Memuat foto ' + done + '/' + total + '...';
    });
  } finally {
    pdfBtn.disabled = false;
    pdfBtn.textContent = orig;
  }
});

console.log('🚀 Aplikasi Refa Attendance berhasil di-load dengan arsitektur modular!');