import { supabaseClient } from '../../services/supabase.js';

import { state } from '../../state.js';
import { showError, showSuccess, showConfirm } from '../../utils/modal.js';
import { getErrorMessage, formatDateLabel , escapeHtml} from '../../utils/helpers.js';
import { refreshPendingApprovalCard } from '../auth.js';

// ===== TAB APPROVAL: DAFTAR CUTI PENDING =====
export async function loadAdminLeaveRequests() {
  const container = document.getElementById('adminLeaveList');

  try {
    const { data, error } = await supabaseClient
      .from('leave_requests')
      .select(`
        *,
        employees!leave_requests_employee_id_fkey (nama)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML = '<div class="empty-state"><i data-lucide="inbox"></i>Tidak ada pengajuan cuti yang menunggu persetujuan.</div>';
      return;
    }

    const canAct = state.currentEmployee?.role === 'superadmin';
    container.innerHTML = data.map(item => `
      <div class="admin-leave-card">
        <div class="admin-leave-name">${escapeHtml(item.employees?.nama || 'Tidak diketahui')}</div>
        <div class="admin-leave-reason">${escapeHtml(item.reason || '-')}</div>
        <div class="admin-leave-date">Tanggal: ${formatDateLabel(item.start_date)}</div>
        <span class="status-warning">Menunggu</span>

        ${canAct ? `
        <div class="admin-leave-actions">
          <button class="btn-approve" data-leave-id="${item.id}">Setujui</button>
          <button class="btn-reject" data-leave-id="${item.id}">Tolak</button>
        </div>` : `
        <div class="admin-leave-note" style="margin-top:8px;font-size:12px;color:var(--muted);font-style:italic;">Hanya superadmin yang dapat menyetujui / menolak.</div>`}
      </div>
    `).join('');

  } catch (err) {
    console.error(err);
    container.innerHTML = '<div class="empty-state"><i data-lucide="circle-alert"></i>Gagal memuat data. Coba refresh halaman.</div>';
  }
}

export async function approveLeave(id) {
  if (state.currentEmployee?.role !== 'superadmin') {
    await showError('Akses Ditolak', 'Hanya superadmin yang dapat menyetujui pengajuan.');
    return;
  }
  const confirmed = await showConfirm(
    'Setujui Pengajuan Cuti?',
    'Saldo cuti karyawan akan berkurang 1 hari setelah disetujui. Tindakan ini tidak bisa dibatalkan.',
    'Ya, Setujui'
  );

  if (!confirmed) return;

  try {
    const { data, error } = await supabaseClient
      .rpc('approve_leave_request', { p_leave_id: id });

    if (error) throw error;

    if (data && data.success === false) {
      await showError('Gagal Menyetujui', data.message || 'Pengajuan tidak dapat disetujui.');
      return;
    }

    await showSuccess('Cuti Disetujui', 'Pengajuan cuti berhasil disetujui dan saldo karyawan sudah diperbarui.');
    await loadAdminLeaveRequests();
    await refreshPendingApprovalCard();

  } catch (err) {
    console.error(err);
    await showError('Gagal Menyetujui', getErrorMessage(err));
  }
}

export async function rejectLeave(id) {
  if (state.currentEmployee?.role !== 'superadmin') {
    await showError('Akses Ditolak', 'Hanya superadmin yang dapat menolak pengajuan.');
    return;
  }
  const confirmed = await showConfirm(
    'Tolak Pengajuan Cuti?',
    'Pengajuan ini akan ditolak dan saldo cuti karyawan tidak berubah.',
    'Ya, Tolak'
  );

  if (!confirmed) return;

  try {
    const { data, error } = await supabaseClient
      .from('leave_requests')
      .update({ status: 'rejected' })
      .eq('id', id)
      .eq('status', 'pending')
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      await showError('Tidak Bisa Diproses', 'Pengajuan ini sudah diproses sebelumnya.');
      await loadAdminLeaveRequests();
    await refreshPendingApprovalCard();
      return;
    }

    await showSuccess('Cuti Ditolak', 'Pengajuan cuti berhasil ditolak.');
    await loadAdminLeaveRequests();
    await refreshPendingApprovalCard();

  } catch (err) {
    console.error(err);
    await showError('Gagal Menolak', getErrorMessage(err));
  }
}

// ===== TAB RIWAYAT CUTI: FILTER + DAFTAR YANG SUDAH DIPROSES =====
export async function populateRiwayatCutiFilter() {
  const select = document.getElementById('riwayatCutiFilter');
  if (!select) return;
  const currentValue = select.value;

  try {
    const { data, error } = await supabaseClient
      .from('employees')
      .select('id, nama')
      .order('nama', { ascending: true });

    if (error) throw error;

    select.innerHTML = '<option value="">Semua Karyawan</option>' +
      (data || []).map(emp => `<option value="${emp.id}">${escapeHtml(emp.nama)}</option>`).join('');

    // Pertahankan pilihan filter sebelumnya kalau masih ada
    select.value = currentValue || '';

  } catch (err) {
    console.error('Gagal memuat filter karyawan:', err);
  }
}

// ===== TAB RIWAYAT PENGAJUAN: GABUNGAN CUTI + LIBUR + IZIN KHUSUS =====
const TYPE_META = {
  cuti:  { label: 'Cuti',           cls: 'cuti'  },
  libur: { label: 'Izin Off', cls: 'libur' },
  izin:  { label: 'Izin Khusus',    cls: 'izin'  }
};
const IZIN_TYPE_LABEL = { sakit: 'Sakit', keluarga: 'Urusan Keluarga', lainnya: 'Lainnya' };

function normalizeHistoryRow(type, item) {
  const nama = item.employees?.nama || 'Tidak diketahui';
  if (type === 'cuti') {
    return { type, nama, created_at: item.created_at, status: item.status,
      detail: item.reason || '-', dateText: formatDateLabel(item.start_date) };
  }
  if (type === 'libur') {
    return { type, nama, created_at: item.created_at, status: item.status,
      detail: 'Off mingguan', dateText: formatDateLabel(item.off_date) };
  }
  // izin khusus (1 hari per pengajuan)
  const jenis = IZIN_TYPE_LABEL[item.permission_type] || 'Izin';
  return { type, nama, created_at: item.created_at, status: item.status,
    detail: jenis + ': ' + (item.reason || '-'), dateText: formatDateLabel(item.start_date) };
}

export async function loadAdminLeaveHistory() {
  const container = document.getElementById('adminLeaveHistory');
  if (!container) return;
  const selectedEmployeeId = document.getElementById('riwayatCutiFilter')?.value || '';
  const selectedType = document.getElementById('riwayatTypeFilter')?.value || '';
  const wants = (t) => !selectedType || selectedType === t;

  try {
    const tasks = [];

    if (wants('cuti')) {
      let q = supabaseClient.from('leave_requests')
        .select('id, start_date, reason, status, created_at, employees!leave_requests_employee_id_fkey (nama)')
        .neq('status', 'pending');
      if (selectedEmployeeId) q = q.eq('employee_id', selectedEmployeeId);
      tasks.push(q.then(r => ({ type: 'cuti', ...r })));
    }
    if (wants('libur')) {
      let q = supabaseClient.from('day_off_requests')
        .select('id, off_date, status, created_at, employees!day_off_requests_employee_id_fkey (nama)')
        .neq('status', 'pending');
      if (selectedEmployeeId) q = q.eq('employee_id', selectedEmployeeId);
      tasks.push(q.then(r => ({ type: 'libur', ...r })));
    }
    if (wants('izin')) {
      let q = supabaseClient.from('special_permission_requests')
        .select('id, permission_type, start_date, end_date, reason, status, created_at, employees!special_permission_requests_employee_id_fkey (nama)')
        .neq('status', 'pending');
      if (selectedEmployeeId) q = q.eq('employee_id', selectedEmployeeId);
      tasks.push(q.then(r => ({ type: 'izin', ...r })));
    }

    const results = await Promise.all(tasks);

    const rows = [];
    for (const res of results) {
      if (res.error) throw res.error;
      for (const item of (res.data || [])) rows.push(normalizeHistoryRow(res.type, item));
    }
    rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

    if (rows.length === 0) {
      container.innerHTML = '<div class="empty-state"><i data-lucide="inbox"></i>Belum ada riwayat pengajuan.</div>';
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    container.innerHTML = rows.map(r => {
      const statusPill = r.status === 'approved'
        ? '<span class="status-ok">Disetujui</span>'
        : '<span class="status-error">Ditolak</span>';
      const meta = TYPE_META[r.type];
      return `
        <div class="admin-leave-card">
          <span class="req-type-tag ${meta.cls}">${meta.label}</span>
          <div class="admin-leave-name">${escapeHtml(r.nama)}</div>
          <div class="admin-leave-reason">${escapeHtml(r.detail)}</div>
          <div class="admin-leave-date">Tanggal: ${r.dateText}</div>
          ${statusPill}
        </div>`;
    }).join('');
    if (window.lucide) window.lucide.createIcons();

  } catch (err) {
    console.error(err);
    container.innerHTML = '<div class="empty-state"><i data-lucide="circle-alert"></i>Gagal memuat riwayat. Coba refresh halaman.</div>';
  }
}
