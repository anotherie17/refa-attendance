import { state } from '../state.js';
import { supabaseClient } from '../services/supabase.js';
import { showError, showSuccess, showFieldError } from '../utils/modal.js';
import { getErrorMessage, formatDateLabel , escapeHtml} from '../utils/helpers.js';

export async function submitLeaveRequest() {
  if (state.isSubmitting) return;

  const leaveDate = document.getElementById('leaveDate').value;
  const reason = document.getElementById('leaveReason').value;
  const submitBtn = document.getElementById('submitLeaveBtn');

  if (!leaveDate) {
    showFieldError('leaveDate', 'Tanggal cuti harus diisi.');
    return;
  }

  if ((state.currentEmployee.leave_balance || 0) <= 0) {
    await showError('Saldo Tidak Cukup', 'Saldo cuti Anda sudah habis. Hubungi admin jika ada pertanyaan.');
    return;
  }

  state.isSubmitting = true;
  // Simpan innerHTML (bukan textContent) supaya ikon di tombol gak hilang saat di-restore.
  const originalBtnHtml = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span>Mengirim...';

  try {
    const { data: existingLeave, error: checkError } = await supabaseClient
      .from('leave_requests')
      .select('id')
      .eq('employee_id', state.currentEmployee.id)
      .eq('start_date', leaveDate)
      .in('status', ['pending', 'approved']);

    if (checkError) throw checkError;

    if (existingLeave.length > 0) {
      await showError('Tidak Bisa Diajukan', 'Tanggal tersebut sudah pernah diajukan cuti sebelumnya.');
      return;
    }

    const { error } = await supabaseClient
      .from('leave_requests')
      .insert({
        employee_id: state.currentEmployee.id,
        start_date: leaveDate,
        end_date: leaveDate,
        reason: reason,
        status: 'pending'
      });

    if (error) throw error;

    document.getElementById('leaveDate').value = '';
    document.getElementById('leaveReason').value = '';

    await loadLeaveRequests();
    await showSuccess('Pengajuan Terkirim', 'Pengajuan cuti Anda berhasil dikirim dan menunggu persetujuan admin.');

  } catch (err) {
    console.error(err);
    await showError('Gagal Mengajukan Cuti', getErrorMessage(err));
  } finally {
    state.isSubmitting = false;
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnHtml;
  }
}

export async function loadLeaveRequests() {
  const listEl = document.getElementById('leaveHistoryList');
  if (!listEl || !state.currentEmployee?.id) return;
  try {
    const { data, error } = await supabaseClient
      .from('leave_requests')
      .select(`
        *,
        employees!leave_requests_employee_id_fkey (nama)
      `)
      .eq('employee_id', state.currentEmployee.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><i data-lucide="inbox"></i>Belum ada pengajuan cuti</div>';
      return;
    }

    listEl.innerHTML = data.map(item => {
      let statusBadge = '<span class="status-warning">Menunggu</span>';
      if (item.status === 'approved') statusBadge = '<span class="status-ok">Disetujui</span>';
      if (item.status === 'rejected') statusBadge = '<span class="status-error">Ditolak</span>';

      return `
        <div class="attendance-item">
          <div class="attendance-date">Tanggal: ${formatDateLabel(item.start_date)}</div>
          <div class="attendance-time">${escapeHtml(item.reason || '-')}</div>
          ${statusBadge}
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error(err);
    listEl.innerHTML = '<div class="empty-state"><i data-lucide="circle-alert"></i>Gagal memuat riwayat cuti</div>';
  }
}
