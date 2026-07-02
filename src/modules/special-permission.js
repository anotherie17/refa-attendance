import { state } from '../state.js';
import { supabaseClient } from '../services/supabase.js';
import { showError, showSuccess, showFieldError } from '../utils/modal.js';
import { getErrorMessage, formatDateLabel , escapeHtml} from '../utils/helpers.js';

const TYPE_LABEL = { sakit: 'Sakit', keluarga: 'Urusan Keluarga', lainnya: 'Lainnya' };

export async function submitSpecialPermission() {
  if (state.isSubmitting) return;

  const type = document.getElementById('izinType').value;
  const tanggal = document.getElementById('izinStartDate').value;
  const reason = document.getElementById('izinReason').value;
  const submitBtn = document.getElementById('submitIzinBtn');

  if (!tanggal) {
    showFieldError('izinStartDate', 'Tanggal harus diisi.');
    return;
  }

  // Izin khusus wajib 1 hari per pengajuan. Untuk beberapa hari, ajukan terpisah.
  const startDate = tanggal;
  const endDate = tanggal;

  state.isSubmitting = true;
  // Simpan innerHTML (bukan textContent) supaya ikon di tombol gak hilang saat di-restore.
  const originalBtnHtml = submitBtn.innerHTML;
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
    submitBtn.innerHTML = originalBtnHtml;
  }
}

export async function loadSpecialPermissions() {
  const listEl = document.getElementById('izinHistoryList');
  if (!listEl || !state.currentEmployee?.id) return;

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
      let statusBadge = '<span class="status-warning">Menunggu</span>';
      if (item.status === 'approved') statusBadge = '<span class="status-ok">Disetujui</span>';
      if (item.status === 'rejected') statusBadge = '<span class="status-error">Ditolak</span>';

      const tglLabel = formatDateLabel(item.start_date);

      return `
        <div class="attendance-item">
          <div class="attendance-date">${TYPE_LABEL[item.permission_type] || 'Izin'} \u2022 ${tglLabel}</div>
          <div class="attendance-time">${escapeHtml(item.reason || '-')}</div>
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
