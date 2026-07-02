import { state } from '../state.js';
import { supabaseClient } from '../services/supabase.js';
import { renderCalendarGrid } from '../utils/dom.js';
import { getDaysInMonth, formatWITATime, escapeHtml } from '../utils/helpers.js';

export function populateMonthFilter() {
  const select = document.getElementById('monthFilter');
  if (!select) return;

  select.innerHTML = '<option value="">-- Pilih Bulan --</option>';
  const now = new Date();
  const currentValue = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const value = year + '-' + month;
    const label = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    if (value === currentValue) option.selected = true;
    select.appendChild(option);
  }

  select.value = currentValue;
  select.dispatchEvent(new Event('change'));
}

export async function loadRiwayat() {
  const monthValue = document.getElementById('monthFilter').value;
  const listEl = document.getElementById('attendanceList');

  if (!monthValue) {
    listEl.innerHTML = '<div class="empty-state"><i data-lucide="calendar-days"></i>Pilih bulan untuk melihat riwayat</div>';
    return;
  }

  try {
    const [tahun, bulan] = monthValue.split('-');
    const tahunNum = parseInt(tahun, 10);
    const bulanNum = parseInt(bulan, 10);

    const startStr = monthValue + '-01';
    const nextObj = new Date(tahunNum, bulanNum, 1); // bulan berikutnya
    const nextStr = nextObj.getFullYear() + '-' + String(nextObj.getMonth() + 1).padStart(2, '0') + '-01';

    const { data, error } = await supabaseClient
      .from('attendance')
      .select('*, shifts(nama)')
      .eq('employee_id', state.currentEmployee.id)
      .gte('tanggal', startStr)
      .lt('tanggal', nextStr)
      .order('tanggal', { ascending: false });

    if (error) throw error;

    const filteredData = data || [];

    if (!filteredData || filteredData.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><i data-lucide="inbox"></i>Tidak ada data absensi bulan ini</div>';
      return;
    }

    listEl.innerHTML = filteredData.map(att => {
      const tanggal = new Date(att.tanggal + 'T00:00:00');
      const hari = tanggal.toLocaleDateString('id-ID', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
      
      let times = '';
      if (att.jam_masuk) {
        times += 'Masuk: ' + formatWITATime(att.jam_masuk, true);
      }
      if (att.jam_keluar) {
        const keluarTime = formatWITATime(att.jam_keluar, true);
        times += times ? ' | Keluar: ' + keluarTime : 'Keluar: ' + keluarTime;
      }

      let statusBadge = 'Tepat waktu';
      if (att.status && att.status.startsWith('telat_')) {
        const menit = att.status.split('_')[1];
        statusBadge = 'Telat ' + menit + ' menit';
      }

      return '<div class="attendance-item"><div class="attendance-date">' + hari + '</div>' + (att.shifts ? '<div class="attendance-shift">Shift: ' + escapeHtml(att.shifts.nama) + '</div>' : '') + '<div class="attendance-time">' + (times || '—') + '</div><span class="attendance-status">' + statusBadge + '</span></div>';
    }).join('');

  } catch (err) {
    listEl.innerHTML = '<div class="empty-state"><i data-lucide="circle-alert"></i>Gagal memuat data</div>';
    console.error('loadRiwayat error:', err);
  }
}

export async function loadKalenderPribadi() {
  const monthValue = document.getElementById('monthFilter').value;
  const container = document.getElementById('kalenderPribadiContainer');

  if (!monthValue) {
    container.innerHTML = 'Pilih bulan untuk melihat kalender';
    return;
  }

  try {
    const [tahun, bulan] = monthValue.split('-');
    const tahunNum = parseInt(tahun, 10);
    const bulanNum = parseInt(bulan, 10);

    const today = new Date();
    const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    const daysInMonth = getDaysInMonth(tahunNum, bulanNum);

    const _moStart = tahunNum + '-' + String(bulanNum).padStart(2, '0') + '-01';
    const _moEnd = tahunNum + '-' + String(bulanNum).padStart(2, '0') + '-' + String(daysInMonth).padStart(2, '0');

    const { data: attData, error: attError } = await supabaseClient
      .from('attendance')
      .select('tanggal, status')
      .eq('employee_id', state.currentEmployee.id)
      .gte('tanggal', _moStart)
      .lte('tanggal', _moEnd)
      .order('tanggal', { ascending: true });

    if (attError) throw attError;

    const { data: leaveData, error: leaveError } = await supabaseClient
      .from('leave_requests')
      .select('start_date')
      .eq('employee_id', state.currentEmployee.id)
      .eq('status', 'approved')
      .gte('start_date', _moStart)
      .lte('start_date', _moEnd)
      .order('start_date', { ascending: true });

    if (leaveError) throw leaveError;

    const filteredAttData = attData || [];
    const filteredLeaveData = leaveData || [];

    const dayDataMap = {};
    const { data: offData } = await supabaseClient
      .from('day_off_requests')
      .select('off_date')
      .eq('employee_id', state.currentEmployee.id)
      .eq('status', 'approved')
      .gte('off_date', _moStart)
      .lte('off_date', _moEnd);
    (offData || []).forEach(o => { dayDataMap[o.off_date] = 'libur'; });
    // Izin khusus yang disetujui juga bukan "tidak hadir".
    const { data: izinData } = await supabaseClient
      .from('special_permission_requests')
      .select('start_date')
      .eq('employee_id', state.currentEmployee.id)
      .eq('status', 'approved')
      .gte('start_date', _moStart)
      .lte('start_date', _moEnd);
    (izinData || []).forEach(z => { dayDataMap[z.start_date] = 'cuti'; });
    (filteredAttData || []).forEach(a => {
      dayDataMap[a.tanggal] = (a.status && a.status.startsWith('telat_')) ? 'telat' : 'hadir';
    });
    (filteredLeaveData || []).forEach(l => {
      dayDataMap[l.start_date] = 'cuti';
    });

    renderCalendarGrid('kalenderPribadiContainer', tahunNum, bulanNum, dayDataMap);

  } catch (err) {
    console.error('loadKalenderPribadi error:', err);
    container.innerHTML = '<div class="empty-state"><i data-lucide="circle-alert"></i>Gagal memuat kalender</div>';
  }
}
