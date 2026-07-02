import { state } from '../state.js';
import { supabaseClient } from '../services/supabase.js';
import { showError, showSuccess } from '../utils/modal.js';
import { getErrorMessage } from '../utils/helpers.js';
import { showPage, updateUserInfo } from '../utils/dom.js';
import { enterDashboard } from './auth.js';

const DEFAULT_PASSWORD = 'refa123456';

// Hanya KARYAWAN yang masih pakai password bawaan yang dipaksa ganti.
// Admin & superadmin tidak pernah dipaksa oleh alur ini.
export function needsForcedPasswordChange() {
  const emp = state.currentEmployee;
  return !!emp && emp.role === 'karyawan' && emp.must_change_password === true;
}

// Tampilkan layar wajib ganti password (memblokir akses menu lain).
export function showForcePasswordScreen() {
  showPage('forcePasswordPage');
}

// Checklist hidup: update centang saat user mengetik.
export function initPasswordChecklist() {
  const pw = document.getElementById('forceNewPassword');
  const cf = document.getElementById('forceConfirmPassword');
  const liLen = document.getElementById('pwCheckLength');
  const liMatch = document.getElementById('pwCheckMatch');
  if (!pw || !cf || !liLen || !liMatch) return;

  const update = () => {
    liLen.classList.toggle('ok', pw.value.length >= 6);
    liMatch.classList.toggle('ok', cf.value.length > 0 && pw.value === cf.value);
  };
  pw.addEventListener('input', update);
  cf.addEventListener('input', update);
}

export async function submitForcedPassword() {
  if (state.isSubmitting) return;

  const newPassword = document.getElementById('forceNewPassword').value;
  const confirmPassword = document.getElementById('forceConfirmPassword').value;
  const btn = document.getElementById('forcePasswordBtn');

  if (!newPassword || !confirmPassword) {
    await showError('Data Belum Lengkap', 'Isi password baru dan konfirmasinya.');
    return;
  }
  if (newPassword.length < 6) {
    await showError('Password Terlalu Pendek', 'Password baru minimal 6 karakter.');
    return;
  }
  if (newPassword !== confirmPassword) {
    await showError('Tidak Cocok', 'Password baru dan konfirmasi tidak sama. Periksa kembali.');
    return;
  }
  if (newPassword === DEFAULT_PASSWORD) {
    await showError('Gunakan Password Baru', 'Password tidak boleh sama dengan password bawaan.');
    return;
  }

  state.isSubmitting = true;
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Menyimpan...';

  try {
    // 1) Ganti password di Auth. updateUser TIDAK membuat logout, sesi tetap jalan.
    const { error: pwErr } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (pwErr) throw pwErr;

    // 2) Matikan flag lewat RPC aman (user hanya bisa mematikan flag miliknya sendiri).
    const { error: rpcErr } = await supabaseClient.rpc('clear_must_change_password');
    if (rpcErr) throw rpcErr;

    state.currentEmployee.must_change_password = false;

    document.getElementById('forceNewPassword').value = '';
    document.getElementById('forceConfirmPassword').value = '';

    await showSuccess('Password Tersimpan', 'Password baru berhasil dibuat. Selamat bekerja!');

    // 3) Lanjut masuk app seperti biasa (bisa langsung check-in / check-out).
    enterDashboard();
    updateUserInfo();

  } catch (err) {
    console.error('submitForcedPassword error:', err);
    await showError('Gagal Menyimpan Password', getErrorMessage(err));
  } finally {
    state.isSubmitting = false;
    btn.disabled = false;
    btn.textContent = originalText;
  }
}
