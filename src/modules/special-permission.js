import { state } from '../state.js';
import { supabaseClient } from '../services/supabase.js';
import { showError, showSuccess } from '../utils/modal.js';
import { getErrorMessage, formatDateLabel } from '../utils/helpers.js';

const TYPE_LABEL = { sakit: 'Sakit', keluarga: 'Urusan Keluarga', lainnya: 'Lainnya' };

export async function submitSpecialPermission() {
  if (state.isSubmitting) return;

  const type = document.getElementById('izinType').value;
  const tanggal = document.getElementById('izinStartDate').value;
  const reason = document.getElementById('izinReason').value;
  const submitBtn = document.getElementById('submitIzinBtn');

  if (!tanggal) {
    await showError('Data Belum Lengkap', 'Tanggal harus diisi.');
    return;
  }

  // Izin khusus wajib 1 hari per pengajuan. Untuk beberapa hari, ajukan terpisah.
  const startDate = tanggal;
  const endDate = tanggal;

  state.isSubmitting = true;
  const originalBtnText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span>Mengirim...';

  try {
    const { error } = await supabaseClient
      .from('special_permission_requests')
      .insert({
        employee_id: state.currentEmployee.id,
        permission_type: type,
        start_date: startDate,
        end_date: endDate,
        reason: reason,
        status: 'pending'
      });

    if (error) throw error;

    document.getElementById('izinStartDate').value = '';
    document.getElementById('izinReason').value = '';

    await loadSpecialPermissions();
    await showSuccess('Pengajuan Terkirim', 'Pengajuan izin khusus berhasil dikirim dan menunggu persetujuan superadmin.');

  } catch (err) {
    console.error(err);
    await showError('Gagal Mengajukan Izin', getErrorMessage(err));
  } finally {
    state.isSubmitting = false;
    submitBtn.disabled = false;
    submitBtn.textContent = originalBtnText;
  }
}

export async function loadSpecialPermissions() {
  const listEl = document.getElementById('izinHistoryList');
  if (!listEl) return;

  try {
    const { data, error } = await supabaseClient
      .from('special_permission_requests')
      .select('*')
      .eq('employee_id', state.currentEmployee.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><i data-lucide="inbox"></i>Belum ada pengajuan izin khusus</div>';
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    listEl.innerHTML = data.map(item => {
      let statusBadge = '<span class="status-warning">Pending</span>';
      if (item.status === 'approved') statusBadge = '<span class="status-ok">Approved</span>';
      if (item.status === 'rejected') statusBadge = '<span class="status-error">Rejected</span>';

      const tglLabel = formatDateLabel(item.start_date);

      return `
        <div class="attendance-item">
          <div class="attendance-date">${TYPE_LABEL[item.permission_type] || 'Izin'} \u2022 ${tglLabel}</div>
          <div class="attendance-time">${item.reason || '-'}</div>
          ${statusBadge}
        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();

  } catch (err) {
    console.error(err);
    listEl.innerHTML = '<div class="empty-state"><i data-lucide="circle-alert"></i>Gagal memuat riwayat izin khusus</div>';
  }
}
