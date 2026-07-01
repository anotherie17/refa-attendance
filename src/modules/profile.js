import { state } from '../state.js';
import { supabaseClient } from '../services/supabase.js';
import { showError, showSuccess, showConfirm } from '../utils/modal.js';
import { getErrorMessage } from '../utils/helpers.js';
import { logout } from './auth.js';

export async function changePassword() {
  if (state.isSubmitting) return;

  const newPassword = document.getElementById('newPasswordInput').value;
  const confirmPassword = document.getElementById('confirmPasswordInput').value;
  const btn = document.getElementById('changePasswordBtn');

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

  const confirmed = await showConfirm(
    'Ganti Password?',
    'Anda akan keluar dan perlu login ulang dengan password baru setelah ini berhasil.',
    'Ya, Ganti'
  );
  if (!confirmed) return;

  state.isSubmitting = true;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Menyimpan...';

  try {
    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (error) throw error;

    document.getElementById('newPasswordInput').value = '';
    document.getElementById('confirmPasswordInput').value = '';

    await showSuccess('Password Diperbarui', 'Password Anda berhasil diganti. Silakan login kembali.');
    await logout();

  } catch (err) {
    console.error(err);
    await showError('Gagal Mengganti Password', getErrorMessage(err));
  } finally {
    state.isSubmitting = false;
    btn.disabled = false;
    btn.innerHTML = 'Simpan Password Baru';
  }
}
