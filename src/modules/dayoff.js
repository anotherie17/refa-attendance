import { state } from '../state.js';
import { supabaseClient } from '../services/supabase.js';
import { showError, showSuccess, showConfirm } from '../utils/modal.js';
import { getErrorMessage, getWeekStart, formatDateLabel, skeletonList, HARI_LABELS as HARI } from '../utils/helpers.js';

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}

function weekRangeLabel(weekStart) {
  const end = addDays(weekStart, 6);
  const opt = { day: 'numeric', month: 'short' };
  const s = new Date(weekStart + 'T12:00:00').toLocaleDateString('id-ID', opt);
  const e = new Date(end + 'T12:00:00').toLocaleDateString('id-ID', opt);
  return s + ' \u2013 ' + e;
}

export async function loadDayOffSection() {
  const container = document.getElementById('dayOffContainer');
  if (!container || !state.currentEmployee?.id) return;
  container.innerHTML = skeletonList(2);

  const thisWeek = getWeekStart();
  const nextWeek = addDays(thisWeek, 7);
  const weeks = [
    { ws: thisWeek, label: 'Minggu ini' },
    { ws: nextWeek, label: 'Minggu depan' }
  ];

  try {
    const { data, error } = await supabaseClient
      .from('day_off_requests')
      .select('id, week_start, off_date, status')
      .eq('employee_id', state.currentEmployee.id)
      .in('week_start', [thisWeek, nextWeek]);
    if (error) throw error;

    const byWeek = {};
    (data || []).forEach(r => { byWeek[r.week_start] = r; });

    container.innerHTML = weeks.map(w => renderWeekCard(w, byWeek[w.ws])).join('');
  } catch (err) {
    console.error('loadDayOffSection error:', err);
    container.innerHTML = '<div class="empty-state"><i data-lucide="circle-alert"></i>Gagal memuat jadwal off.</div>';
  }
}

function renderWeekCard(w, req) {
  const range = weekRangeLabel(w.ws);
  let options = '';
  for (let i = 0; i < 7; i++) {
    const ds = addDays(w.ws, i);
    const sel = req && req.off_date === ds ? ' selected' : '';
    options += `<option value="${ds}"${sel}>${HARI[i]}, ${formatDateLabel(ds)}</option>`;
  }

  let statusHtml = '';
  let controls = '';

  if (req && req.status === 'approved') {
    const hari = HARI[new Date(req.off_date + 'T12:00:00').getDay()];
    statusHtml = '<span class="status-ok">Disetujui</span>';
    controls = `<div class="dayoff-picked">Off: <strong>${hari}, ${formatDateLabel(req.off_date)}</strong></div>`;
  } else {
    if (req && req.status === 'pending') statusHtml = '<span class="status-warning">Menunggu persetujuan</span>';
    if (req && req.status === 'rejected') statusHtml = '<span class="status-error">Ditolak \u2014 silakan ajukan ulang</span>';
    controls = `
      <select class="dayoff-select" id="dayOffSelect_${w.ws}">${options}</select>
      <div class="dayoff-actions">
        <button class="dayoff-submit-btn" data-week="${w.ws}">${req ? 'Ubah Ajuan' : 'Ajukan Izin Off'}</button>
        ${req && req.status === 'pending' ? `<button class="dayoff-cancel-btn secondary" data-dayoff-id="${req.id}">Batal</button>` : ''}
      </div>`;
  }

  return `
    <div class="dayoff-week">
      <div class="dayoff-week-head">
        <div class="dayoff-week-label">${w.label} <span class="dayoff-week-range">(${range})</span></div>
        ${statusHtml}
      </div>
      ${controls}
    </div>`;
}

let _submitting = false;

export async function submitDayOff(weekStart) {
  if (_submitting) return;
  if (!state.currentEmployee?.id) return;
  const select = document.getElementById('dayOffSelect_' + weekStart);
  if (!select) return;
  const offDate = select.value;

  _submitting = true;
  try {
    const { data: existing, error: exErr } = await supabaseClient
      .from('day_off_requests')
      .select('id, status')
      .eq('employee_id', state.currentEmployee.id)
      .eq('week_start', weekStart)
      .maybeSingle();
    if (exErr) throw exErr;

    if (existing && existing.status === 'approved') {
      await showError('Tidak Bisa Diubah', 'Jadwal off untuk minggu ini sudah disetujui.');
      return;
    }

    if (existing) {
      const { error } = await supabaseClient
        .from('day_off_requests')
        .update({ off_date: offDate, status: 'pending' })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabaseClient
        .from('day_off_requests')
        .insert({ employee_id: state.currentEmployee.id, week_start: weekStart, off_date: offDate });
      if (error) throw error;
    }

    await showSuccess('Ajuan Terkirim', 'Pengajuan izin off menunggu persetujuan superadmin.');
    await loadDayOffSection();
    await loadHomeDayOffCard();
  } catch (err) {
    console.error('submitDayOff error:', err);
    await showError('Gagal Mengajukan', getErrorMessage(err));
  } finally {
    _submitting = false;
  }
}

export async function cancelDayOff(id) {
  const ok = await showConfirm('Batalkan Ajuan?', 'Pengajuan izin off ini akan dihapus.', 'Ya, Batalkan');
  if (!ok) return;
  try {
    const { error } = await supabaseClient.from('day_off_requests').delete().eq('id', id);
    if (error) throw error;
    await showSuccess('Dibatalkan', 'Pengajuan izin off dibatalkan.');
    await loadDayOffSection();
    await loadHomeDayOffCard();
  } catch (err) {
    console.error('cancelDayOff error:', err);
    await showError('Gagal Membatalkan', getErrorMessage(err));
  }
}

// ===== CARD HIGHLIGHT DI HALAMAN AWAL (ABSEN) =====
export async function loadHomeDayOffCard() {
  const el = document.getElementById('homeDayOffCard');
  if (!el || !state.currentEmployee?.id) return;
  const thisWeek = getWeekStart();
  try {
    const { data, error } = await supabaseClient
      .from('day_off_requests')
      .select('off_date, status')
      .eq('employee_id', state.currentEmployee.id)
      .eq('week_start', thisWeek)
      .maybeSingle();
    if (error) throw error;
    el.innerHTML = renderHomeCard(data, thisWeek);
  } catch (err) {
    console.error('loadHomeDayOffCard error:', err);
    el.innerHTML = '';
  }
}

function renderHomeCard(req, thisWeek) {
  const range = weekRangeLabel(thisWeek);
  let accent, badge = '', detail;
  if (req && req.status === 'approved') {
    const hari = HARI[new Date(req.off_date + 'T12:00:00').getDay()];
    accent = 'approved';
    badge = '<span class="status-ok">Disetujui</span>';
    detail = 'Hari off kamu: <strong>' + hari + ', ' + formatDateLabel(req.off_date) + '</strong>';
  } else if (req && req.status === 'pending') {
    const hari = HARI[new Date(req.off_date + 'T12:00:00').getDay()];
    accent = 'pending';
    badge = '<span class="status-warning">Menunggu</span>';
    detail = 'Ajuan off: <strong>' + hari + ', ' + formatDateLabel(req.off_date) + '</strong> \u2014 menunggu persetujuan';
  } else if (req && req.status === 'rejected') {
    accent = 'rejected';
    badge = '<span class="status-error">Ditolak</span>';
    detail = 'Ajuan off ditolak. Silakan ajukan ulang di tab Pengajuan.';
  } else {
    accent = 'none';
    detail = 'Belum mengajukan off minggu ini (jatah 1 hari/minggu). Ajukan di tab Pengajuan.';
  }
  return '<div class="info-box dayoff-home dayoff-home-' + accent + '">' +
    '<div class="info-label"><span class="icon">\uD83D\uDECC</span>Off Minggu Ini <span class="dayoff-week-range">(' + range + ')</span></div>' +
    '<div class="dayoff-home-body"><div class="dayoff-home-detail">' + detail + '</div>' + badge + '</div>' +
    '</div>';
}
