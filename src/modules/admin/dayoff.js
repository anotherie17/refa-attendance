import { state } from '../../state.js';
import { supabaseClient } from '../../services/supabase.js';
import { showError, showSuccess, showConfirm } from '../../utils/modal.js';
import { getErrorMessage, formatDateLabel , escapeHtml} from '../../utils/helpers.js';

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export async function loadAdminDayOffRequests() {
  const container = document.getElementById('adminDayOffList');
  if (!container) return;

  try {
    const { data, error } = await supabaseClient
      .from('day_off_requests')
      .select('id, week_start, off_date, status, employees!day_off_requests_employee_id_fkey (nama)')
      .eq('status', 'pending')
      .order('off_date', { ascending: true });
    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML = '<div class="empty-state"><i data-lucide="inbox"></i>Tidak ada pengajuan izin off yang menunggu persetujuan.</div>';
      return;
    }

    const canAct = state.currentEmployee?.role === 'superadmin';
    container.innerHTML = data.map(item => {
      const hari = HARI[new Date(item.off_date + 'T12:00:00').getDay()];
      return `
      <div class="admin-leave-card">
        <div class="admin-leave-name">${escapeHtml(item.employees?.nama || 'Tidak diketahui')}</div>
        <div class="admin-leave-date">Hari off: ${hari}, ${formatDateLabel(item.off_date)}</div>
        <span class="status-warning">Menunggu</span>
        ${canAct ? `
        <div class="admin-leave-actions">
          <button class="btn-dayoff-approve" data-dayoff-id="${item.id}">Setujui</button>
          <button class="btn-dayoff-reject" data-dayoff-id="${item.id}">Tolak</button>
        </div>` : `
        <div class="admin-leave-note" style="margin-top:8px;font-size:12px;color:var(--muted);font-style:italic;">Hanya superadmin yang dapat menyetujui / menolak.</div>`}
      </div>`;
    }).join('');
  } catch (err) {
    console.error('loadAdminDayOffRequests error:', err);
    container.innerHTML = '<div class="empty-state"><i data-lucide="circle-alert"></i>Gagal memuat data. Coba refresh halaman.</div>';
  }
}

async function setStatus(id, status, label) {
  if (state.currentEmployee?.role !== 'superadmin') {
    await showError('Akses Ditolak', 'Hanya superadmin yang dapat memproses pengajuan.');
    return;
  }
  const confirmed = await showConfirm(label + ' Izin Off?', 'Tindakan ini akan ' + label.toLowerCase() + ' pengajuan izin off.', 'Ya, ' + label);
  if (!confirmed) return;

  try {
    const { data, error } = await supabaseClient
      .from('day_off_requests')
      .update({ status, reviewed_by: state.currentUser?.id || null, reviewed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'pending')
      .select();
    if (error) throw error;

    if (!data || data.length === 0) {
      await showError('Tidak Bisa Diproses', 'Pengajuan ini sudah diproses sebelumnya.');
    } else {
      await showSuccess('Berhasil', 'Pengajuan izin off berhasil ' + label.toLowerCase() + '.');
    }
    await loadAdminDayOffRequests();
  } catch (err) {
    console.error('setStatus dayoff error:', err);
    await showError('Gagal Memproses', getErrorMessage(err));
  }
}

export async function approveDayOff(id) { await setStatus(id, 'approved', 'Setujui'); }
export async function rejectDayOff(id) { await setStatus(id, 'rejected', 'Tolak'); }
