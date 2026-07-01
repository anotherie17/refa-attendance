import { state } from '../../state.js';
import { supabaseClient } from '../../services/supabase.js';
import { showError, showSuccess, showConfirm } from '../../utils/modal.js';
import { getErrorMessage, formatDateLabel } from '../../utils/helpers.js';

const TYPE_LABEL = { sakit: 'Sakit', keluarga: 'Urusan Keluarga', lainnya: 'Lainnya' };

export async function loadAdminSpecialPermissions() {
  const container = document.getElementById('adminSpecialPermissionList');
  if (!container) return;

  try {
    const { data, error } = await supabaseClient
      .from('special_permission_requests')
      .select('id, permission_type, start_date, end_date, reason, status, employees!special_permission_requests_employee_id_fkey (nama)')
      .eq('status', 'pending')
      .order('start_date', { ascending: true });
    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML = '<div class="empty-state"><i data-lucide="inbox"></i>Tidak ada pengajuan izin khusus yang menunggu persetujuan.</div>';
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    const canAct = state.currentEmployee?.role === 'superadmin';
    container.innerHTML = data.map(item => {
      const tglLabel = formatDateLabel(item.start_date);
      return `
      <div class="admin-leave-card">
        <div class="admin-leave-name">${item.employees?.nama || 'Tidak diketahui'}</div>
        <div class="admin-leave-reason">${TYPE_LABEL[item.permission_type] || 'Izin'}: ${item.reason || '-'}</div>
        <div class="admin-leave-date">Tanggal: ${tglLabel}</div>
        <span class="status-warning">Pending</span>
        ${canAct ? `
        <div class="admin-leave-actions">
          <button class="btn-izin-approve" data-izin-id="${item.id}">Approve</button>
          <button class="btn-izin-reject" data-izin-id="${item.id}">Reject</button>
        </div>` : `
        <div class="admin-leave-note" style="margin-top:8px;font-size:12px;color:var(--muted);font-style:italic;">Hanya superadmin yang dapat menyetujui / menolak.</div>`}
      </div>`;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  } catch (err) {
    console.error('loadAdminSpecialPermissions error:', err);
    container.innerHTML = '<div class="empty-state"><i data-lucide="circle-alert"></i>Gagal memuat data. Coba refresh halaman.</div>';
  }
}

async function setStatus(id, status, label) {
  if (state.currentEmployee?.role !== 'superadmin') {
    await showError('Akses Ditolak', 'Hanya superadmin yang dapat memproses pengajuan.');
    return;
  }
  const confirmed = await showConfirm(label + ' Izin Khusus?', 'Tindakan ini akan ' + label.toLowerCase() + ' pengajuan izin khusus.', 'Ya, ' + label);
  if (!confirmed) return;

  try {
    const { data, error } = await supabaseClient
      .from('special_permission_requests')
      .update({ status, reviewed_by: state.currentUser?.id || null, reviewed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'pending')
      .select();
    if (error) throw error;

    if (!data || data.length === 0) {
      await showError('Tidak Bisa Diproses', 'Pengajuan ini sudah diproses sebelumnya.');
    } else {
      await showSuccess('Berhasil', 'Pengajuan izin khusus berhasil ' + label.toLowerCase() + '.');
    }
    await loadAdminSpecialPermissions();
  } catch (err) {
    console.error('setStatus izin error:', err);
    await showError('Gagal Memproses', getErrorMessage(err));
  }
}

export async function approveSpecialPermission(id) { await setStatus(id, 'approved', 'Setujui'); }
export async function rejectSpecialPermission(id) { await setStatus(id, 'rejected', 'Tolak'); }
