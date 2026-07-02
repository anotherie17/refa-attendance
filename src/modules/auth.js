import { state } from '../state.js';
import { supabaseClient } from '../services/supabase.js';
import { showError, showConfirm, showFieldError } from '../utils/modal.js';
import { getErrorMessage, filterTrackedEmployees } from '../utils/helpers.js';
import { showPage, switchSection, switchAdminTab, updateUserInfo } from '../utils/dom.js';
import { needsForcedPasswordChange, showForcePasswordScreen } from './force-password.js';

export async function login(email, password) {
  if (state.isSubmitting) return false;

  if (!email || !password) {
    if (!email) showFieldError('email', 'Email harus diisi.');
    if (!password) showFieldError('password', 'Password harus diisi.');
    return false;
  }

  if (!supabaseClient) {
    await showError('Koneksi Bermasalah', 'Sistem tidak dapat terhubung ke server. Silakan refresh halaman.');
    return false;
  }

  state.isSubmitting = true;

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message || 'Login gagal');

    state.currentUser = data.user;
    
    const { data: empData, error: empError } = await supabaseClient
      .from('employees')
      .select('*')
      .eq('auth_id', state.currentUser.id)
      .single();

    if (empError) {
      throw new Error('Data karyawan tidak ditemukan. Hubungi admin untuk bantuan.');
    }

    if (empData.is_active === false) {
      await supabaseClient.auth.signOut();
      throw new Error('Akun Anda telah dinonaktifkan. Hubungi admin untuk informasi lebih lanjut.');
    }

    state.currentEmployee = empData;
    if (needsForcedPasswordChange()) {
      showForcePasswordScreen();
      return true;
    }
    // enterDashboard() sudah memanggil updateUserInfo() di dalamnya —
    // jangan panggil dobel (dulu bikin 2x request signed URL foto KTP).
    enterDashboard();
    return true;

  } catch (err) {
    await showError('Login Gagal', getErrorMessage(err));
    return false;
  } finally {
    state.isSubmitting = false;
  }
}

export function enterDashboard() {
  if (['admin', 'superadmin'].includes(state.currentEmployee.role)) {
    enterAdminDashboard();
    return;
  }
  showPage('dashboardPage');
  switchSection('attendance');
  updateUserInfo();
}

export async function refreshPendingApprovalCard() {
  try {
    const heads = { count: 'exact', head: true };
    const [{ count: pendingCuti }, { count: pendingLibur }, { count: pendingIzin }] = await Promise.all([
      supabaseClient.from('leave_requests').select('*', heads).eq('status', 'pending'),
      supabaseClient.from('day_off_requests').select('*', heads).eq('status', 'pending'),
      supabaseClient.from('special_permission_requests').select('*', heads).eq('status', 'pending')
    ]);

    const cuti = pendingCuti || 0;
    const libur = pendingLibur || 0;
    const izin = pendingIzin || 0;
    const totalPending = cuti + libur + izin;

    const pendingLeaveEl = document.getElementById('adminPendingLeave');
    if (pendingLeaveEl) pendingLeaveEl.textContent = totalPending;

    const breakdownEl = document.getElementById('adminPendingBreakdown');
    if (breakdownEl) {
      breakdownEl.innerHTML = totalPending > 0
        ? `Cuti ${cuti} \u2022 Off ${libur} \u2022 Izin ${izin}` +
          '<div class="need-approval-cta"><i data-lucide="arrow-right"></i> Tap untuk proses</div>'
        : 'Tidak ada yang menunggu persetujuan';
    }

    const cardEl = document.getElementById('adminNeedApprovalCard');
    if (cardEl) cardEl.classList.toggle('has-pending', totalPending > 0);

    if (window.lucide) window.lucide.createIcons();
  } catch (err) {
    console.error('refreshPendingApprovalCard error:', err);
  }
}

export async function enterAdminDashboard() {
  showPage('adminPage');

  try {
    const { data: allEmps } = await supabaseClient
      .from('employees')
      .select('id, role');

    const totalEmployeesEl = document.getElementById('adminTotalEmployees');
    if (totalEmployeesEl) totalEmployeesEl.textContent = filterTrackedEmployees(allEmps).length;

    await refreshPendingApprovalCard();

  } catch (err) {
    console.error('Admin dashboard error:', err);
  }

  switchAdminTab('ringkasan');
}

// Dipanggil saat sesi Supabase habis/di-revoke (bukan logout manual).
export function handleSessionExpired() {
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }
  state.currentUser = null;
  state.currentEmployee = null;
  state.locationOk = false;
  state.photoData = null;
  state.selectedShiftId = null;
  state.todayAttendance = null;
  showPage('loginPage');
  showError('Sesi Berakhir', 'Sesi berakhir, silakan login lagi.');
}

export async function checkExistingSession() {
  if (!supabaseClient) {
    showPage('loginPage');
    return false;
  }

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session || !session.user) {
      showPage('loginPage');
      return false;
    }

    state.currentUser = session.user;

    const { data: empData, error: empError } = await supabaseClient
      .from('employees')
      .select('*')
      .eq('auth_id', state.currentUser.id)
      .single();

    if (empError || !empData) {
      await supabaseClient.auth.signOut();
      showPage('loginPage');
      return false;
    }

    if (empData.is_active === false) {
      await supabaseClient.auth.signOut();
      showPage('loginPage');
      return false;
    }

    state.currentEmployee = empData;
    if (needsForcedPasswordChange()) {
      showForcePasswordScreen();
      return true;
    }
    enterDashboard();
    return true;

  } catch (err) {
    console.error('checkExistingSession error:', err);
    showPage('loginPage');
    return false;
  }
}

export async function logout(skipConfirm) {
  if (!skipConfirm) {
    const ok = await showConfirm('Keluar dari Aplikasi?', 'Kamu perlu login lagi untuk masuk kembali.', 'Ya, Keluar');
    if (!ok) return;
  }

  // Kosongkan state DULU supaya listener onAuthStateChange tahu ini logout manual,
  // bukan sesi kedaluwarsa.
  state.currentUser = null;
  state.currentEmployee = null;

  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }

  // Matikan kamera kalau masih menyala saat logout
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }

  state.locationOk = false;
  state.photoData = null;
  state.selectedShiftId = null;
  state.todayAttendance = null;
  state.shifts = [];
  
  const form = document.getElementById('loginForm');
  if (form) form.reset();
  showPage('loginPage');
}
