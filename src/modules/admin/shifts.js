import { supabaseClient } from '../../services/supabase.js';
import { showError, showSuccess, showConfirm } from '../../utils/modal.js';
import { getErrorMessage, escapeHtml } from '../../utils/helpers.js';

let editingShiftId = null;
let _shiftCache = [];

export function openShiftForm(shift) {
  editingShiftId = shift ? shift.id : null;
  document.getElementById('shiftFormTitle').textContent = shift ? 'Edit Shift' : 'Tambah Shift';
  document.getElementById('shiftFormNama').value = shift ? shift.nama : '';
  document.getElementById('shiftFormJamMulai').value = shift ? (shift.jam_mulai || '').slice(0, 5) : '';
  document.getElementById('shiftFormJamSelesai').value = shift ? (shift.jam_selesai || '').slice(0, 5) : '';
  document.getElementById('shiftFormOverlay').classList.add('active');
}

export function openShiftFormById(id) {
  const shift = _shiftCache.find(s => String(s.id) === String(id));
  openShiftForm(shift || null);
}

export function closeShiftForm() {
  document.getElementById('shiftFormOverlay').classList.remove('active');
  editingShiftId = null;
}

export async function loadShiftList() {
  const container = document.getElementById('adminShiftList');
  if (!container) return;

  try {
    const { data, error } = await supabaseClient.from('shifts').select('*').order('jam_mulai');
    if (error) throw error;

    _shiftCache = data || [];

    if (_shiftCache.length === 0) {
      container.innerHTML = '<div class="empty-state"><i data-lucide="inbox"></i>Belum ada shift. Tambah shift dulu supaya karyawan bisa pilih shift saat absen.</div>';
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    container.innerHTML = _shiftCache.map(s => `
      <div class="employee-card">
        <div class="employee-name">${escapeHtml(s.nama)}</div>
        <div class="employee-meta">${(s.jam_mulai || '').slice(0, 5)} – ${(s.jam_selesai || '').slice(0, 5)}</div>
        <div class="employee-actions">
          <button class="btn-neutral shift-edit-btn" data-shift-id="${s.id}">Edit</button>
          <button class="btn-reject shift-delete-btn" data-shift-id="${s.id}">Hapus</button>
        </div>
      </div>
    `).join('');
    if (window.lucide) window.lucide.createIcons();

  } catch (err) {
    console.error('loadShiftList error:', err);
    container.innerHTML = '<div class="empty-state"><i data-lucide="circle-alert"></i>Gagal memuat data shift. Coba refresh halaman.</div>';
  }
}

export async function saveShift() {
  const nama = document.getElementById('shiftFormNama').value.trim();
  const jamMulai = document.getElementById('shiftFormJamMulai').value;
  const jamSelesai = document.getElementById('shiftFormJamSelesai').value;
  const btn = document.getElementById('shiftFormSaveBtn');

  if (!nama || !jamMulai || !jamSelesai) {
    await showError('Data Belum Lengkap', 'Nama shift, jam mulai, dan jam selesai harus diisi.');
    return;
  }

  const originalText = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Menyimpan...';

  try {
    const payload = { nama, jam_mulai: jamMulai, jam_selesai: jamSelesai };

    if (editingShiftId) {
      const { error } = await supabaseClient.from('shifts').update(payload).eq('id', editingShiftId);
      if (error) throw error;
    } else {
      const { error } = await supabaseClient.from('shifts').insert(payload);
      if (error) throw error;
    }

    closeShiftForm();
    await loadShiftList();
    await showSuccess('Tersimpan', 'Data shift berhasil disimpan.');

  } catch (err) {
    console.error('saveShift error:', err);
    await showError(editingShiftId ? 'Gagal Memperbarui' : 'Gagal Menambahkan', getErrorMessage(err));
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

export async function deleteShift(id) {
  const confirmed = await showConfirm(
    'Hapus Shift?',
    'Shift yang sudah pernah dipakai di data absensi tidak akan bisa dihapus.',
    'Ya, Hapus'
  );
  if (!confirmed) return;

  try {
    const { error } = await supabaseClient.from('shifts').delete().eq('id', id);
    if (error) throw error;
    await loadShiftList();
    await showSuccess('Dihapus', 'Shift berhasil dihapus.');
  } catch (err) {
    console.error('deleteShift error:', err);
    await showError('Gagal Menghapus', getErrorMessage(err));
  }
}
