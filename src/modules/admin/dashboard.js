import { state } from '../../state.js';
import { supabaseClient } from '../../services/supabase.js';
import { showError, showSuccess } from '../../utils/modal.js';
import { getErrorMessage, getDaysInMonth, formatDateLabel, computeMonthlyAttendance, filterTrackedEmployees } from '../../utils/helpers.js';
import { renderCalendarGrid } from '../../utils/dom.js';

let trenChartInstance = null;
let trenMode = 'semua';

function getBirthdayInfo(value) {
  if (!value) return null;
  const dateValue = String(value).slice(0, 10);
  if (!dateValue || dateValue === 'null') return null;
  const [year, month, day] = dateValue.split('-').map(Number);
  if (!year || !month || !day) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentYear = today.getFullYear();
  const birthDate = new Date(currentYear, month - 1, day);
  let diffDays = Math.round((birthDate - today) / 86400000);

  if (diffDays < 0) {
    const nextYear = new Date(currentYear + 1, month - 1, day);
    diffDays = Math.round((nextYear - today) / 86400000);
  }

  return { month, day, diffDays };
}

export async function computeRingkasanBulan(monthValue) {
  const [tahun, bulan] = monthValue.split('-');
  const tahunNum = parseInt(tahun, 10);
  const bulanNum = parseInt(bulan, 10);
  const startDateStr = tahunNum + '-' + String(bulanNum).padStart(2, '0') + '-01';
  const endDateObj = new Date(tahunNum, bulanNum, 1);
  const endDateStr = endDateObj.getFullYear() + '-' + String(endDateObj.getMonth() + 1).padStart(2, '0') + '-01';

  const today = new Date();
  const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

  const { data: employeesRaw, error: empError } = await supabaseClient
    .from('employees')
    .select('id, nama, created_at, tanggal_masuk, role')
    .eq('is_active', true);
  if (empError) throw empError;
  const employees = filterTrackedEmployees(employeesRaw);

  const { data: attendanceRows, error: attError } = await supabaseClient
    .from('attendance')
    .select('employee_id, tanggal, status')
    .gte('tanggal', startDateStr)
    .lt('tanggal', endDateStr);
  if (attError) throw attError;

  const { data: leaveRows, error: leaveError } = await supabaseClient
    .from('leave_requests')
    .select('employee_id, start_date, end_date')
    .eq('status', 'approved')
    .lt('start_date', endDateStr)
    .gte('end_date', startDateStr);
  if (leaveError) throw leaveError;

  const { data: dayOffRows, error: dayOffError } = await supabaseClient
    .from('day_off_requests')
    .select('employee_id, week_start, off_date')
    .eq('status', 'approved');
  if (dayOffError) throw dayOffError;

  let totalHadir = 0, totalTelat = 0, totalCuti = 0, totalAlpa = 0, totalWajib = 0;
  const perEmployee = {};

  (employees || []).forEach(emp => {
    const stat = computeMonthlyAttendance({
      startDateStr, endDateStr, todayStr,
      joinDateStr: emp.tanggal_masuk || (emp.created_at ? String(emp.created_at).slice(0, 10) : null),
      attRows: (attendanceRows || []).filter(a => a.employee_id === emp.id),
      leaveRows: (leaveRows || []).filter(l => l.employee_id === emp.id),
      dayOffRows: (dayOffRows || []).filter(o => o.employee_id === emp.id)
    });
    totalHadir += stat.hadir;
    totalTelat += stat.telat;
    totalCuti += stat.cutiDays;
    totalAlpa += stat.alpa;
    totalWajib += stat.wajibMasuk;
    perEmployee[emp.id] = { nama: emp.nama, hadir: stat.hadir, telat: stat.telat, cuti: stat.cutiDays, alpa: stat.alpa, persen: stat.persen };
  });

  const persenTotal = totalWajib > 0 ? Math.round((totalHadir / totalWajib) * 100) : null;

  return {
    monthLabel: new Date(tahunNum, bulanNum - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }),
    totalHadir, totalTelat, totalCuti, totalAlpa, persenTotal,
    perEmployee,
    employeeCount: (employees || []).length
  };
}

export function populateRingkasanMonthFilter() {
  const select = document.getElementById('ringkasanMonthFilter');
  if (!select || select.options.length > 0) return;
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const label = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }
}

export async function loadBirthdayReminder() {
  const container = document.getElementById('upcomingBirthdaysList');
  if (!container) return;

  try {
    const { data, error } = await supabaseClient
      .from('employees')
      .select('id, nama, tanggal_lahir')
      .eq('is_active', true)
      .order('nama', { ascending: true });

    if (error) throw error;

    const upcoming = (data || [])
      .map(emp => ({ ...emp, birthday: getBirthdayInfo(emp.tanggal_lahir) }))
      .filter(emp => emp.birthday && emp.birthday.diffDays >= 0 && emp.birthday.diffDays <= 45)
      .sort((a, b) => a.birthday.diffDays - b.birthday.diffDays)
      .slice(0, 8);

    if (!upcoming.length) {
      container.innerHTML = '<div class="empty-state"><i data-lucide="cake"></i>Tidak ada reminder ulang tahun dalam 45 hari ke depan.</div>';
      return;
    }

    container.innerHTML = upcoming.map(emp => {
      const birthday = emp.birthday;
      const label = birthday.diffDays === 0
        ? 'Hari ini'
        : birthday.diffDays === 1
          ? 'Besok'
          : `dalam ${birthday.diffDays} hari`;

      return `
        <div class="ranking-item">
          <div class="ranking-rank"><i data-lucide="cake"></i></div>
          <div class="ranking-info">
            <div class="ranking-name">${emp.nama}</div>
            <div class="ranking-meta">Ulang tahun ${formatDateLabel(emp.tanggal_lahir)} · ${label}</div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('loadBirthdayReminder error:', err);
    container.innerHTML = '<div class="empty-state"><i data-lucide="circle-alert"></i>Gagal memuat reminder ulang tahun.</div>';
  }
}

export async function loadRingkasanDashboard() {
  populateRingkasanMonthFilter();
  const monthValue = document.getElementById('ringkasanMonthFilter').value;
  if (!monthValue) return;

  try {
    const stats = await computeRingkasanBulan(monthValue);

    document.getElementById('ringkasanPersenHadir').textContent = stats.totalHadir;
    document.getElementById('ringkasanHadirSub').textContent = (stats.persenTotal === null ? 'kehadiran tercatat' : stats.persenTotal + '% kehadiran');
    document.getElementById('ringkasanTotalTelat').textContent = stats.totalTelat;
    document.getElementById('ringkasanTelatSub').textContent = 'dari ' + stats.totalHadir + ' kehadiran';
    document.getElementById('ringkasanTotalCuti').textContent = stats.totalCuti;
    document.getElementById('ringkasanTotalAlpa').textContent = stats.totalAlpa;

    renderRanking('rankingTelat', stats.perEmployee, 'telat', 'kali telat');
    await loadBirthdayReminder();

  } catch (err) {
    console.error('loadRingkasanDashboard error:', err);
  }
}

function renderRanking(containerId, perEmployee, field, unitLabel) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const sorted = Object.values(perEmployee)
    .filter(e => e[field] > 0)
    .sort((a, b) => b[field] - a[field])
    .slice(0, 5);

  if (sorted.length === 0) {
    container.innerHTML = '<div class="empty-state"><i data-lucide="party-popper"></i>Tidak ada keterlambatan bulan ini</div>';
    return;
  }

  container.innerHTML = sorted.map((e, i) => `
    <div class="ranking-item">
      <div class="ranking-rank">${i + 1}</div>
      <div class="ranking-info">
        <div class="ranking-name">${e.nama}</div>
        <div class="ranking-meta">${e.hadir} hadir bulan ini</div>
      </div>
      <div class="ranking-count">${e[field]}<span style="font-size:10px;font-weight:600;color:var(--muted);"> ${unitLabel}</span></div>
    </div>
  `).join('');
}

export function setTrenMode(mode) {
  trenMode = mode;
  const semuaBtn = document.getElementById('trenToggleSemua');
  const individuBtn = document.getElementById('trenToggleIndividu');
  const filterEl = document.getElementById('trenEmployeeFilter');
  if (semuaBtn) semuaBtn.classList.toggle('active', mode === 'semua');
  if (individuBtn) individuBtn.classList.toggle('active', mode === 'individu');
  if (filterEl) filterEl.style.display = mode === 'individu' ? 'block' : 'none';

  if (mode === 'individu') {
    populateTrenEmployeeFilter().then(loadTrenKeterlambatan);
  } else {
    loadTrenKeterlambatan();
  }
}

async function populateTrenEmployeeFilter() {
  const select = document.getElementById('trenEmployeeFilter');
  if (select.options.length > 0) return;

  try {
    const { data, error } = await supabaseClient
      .from('employees')
      .select('id, nama, role')
      .eq('is_active', true)
      .order('nama', { ascending: true });
    if (error) throw error;

    select.innerHTML = filterTrackedEmployees(data).map(e => `<option value="${e.id}">${e.nama}</option>`).join('');
  } catch (err) {
    console.error('populateTrenEmployeeFilter error:', err);
  }
}

export async function loadTrenKeterlambatan() {
  const canvas = document.getElementById('trenChart');
  if (!canvas || typeof Chart === 'undefined') return;

  try {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        value: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'),
        label: d.toLocaleDateString('id-ID', { month: 'short' })
      });
    }

    const employeeId = trenMode === 'individu' ? document.getElementById('trenEmployeeFilter').value : null;
    if (trenMode === 'individu' && !employeeId) return;

    const startDateStr = months[0].value + '-01';
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const endDateStr = lastMonthDate.getFullYear() + '-' + String(lastMonthDate.getMonth() + 1).padStart(2, '0') + '-01';

    let query = supabaseClient
      .from('attendance')
      .select('employee_id, tanggal, status')
      .gte('tanggal', startDateStr)
      .lt('tanggal', endDateStr);

    if (employeeId) query = query.eq('employee_id', employeeId);

    const { data, error } = await query;
    if (error) throw error;

    const telatPerBulan = months.map(m => {
      return (data || []).filter(a =>
        a.tanggal.startsWith(m.value) && a.status && a.status.startsWith('telat_')
      ).length;
    });

    if (trenChartInstance) {
      trenChartInstance.destroy();
    }

    trenChartInstance = new Chart(canvas, {
      type: trenMode === 'individu' ? 'line' : 'bar',
      data: {
        labels: months.map(m => m.label),
        datasets: [{
          label: 'Jumlah Telat',
          data: telatPerBulan,
          backgroundColor: 'rgba(255, 122, 26, 0.55)',
          borderColor: '#ff7a1a',
          borderWidth: 2,
          tension: 0.3,
          fill: trenMode === 'individu'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 } }
        }
      }
    });

  } catch (err) {
    console.error('loadTrenKeterlambatan error:', err);
  }
}

export async function populateKalenderAdminFilter() {
  const select = document.getElementById('kalenderAdminEmployeeFilter');
  if (select.options.length > 0) return;

  try {
    const { data, error } = await supabaseClient
      .from('employees')
      .select('id, nama, role')
      .eq('is_active', true)
      .order('nama', { ascending: true });
    if (error) throw error;

    select.innerHTML = '<option value="">-- Pilih Karyawan --</option>' +
      filterTrackedEmployees(data).map(e => `<option value="${e.id}">${e.nama}</option>`).join('');
  } catch (err) {
    console.error('populateKalenderAdminFilter error:', err);
  }
}

export async function loadKalenderAdmin() {
  const employeeId = document.getElementById('kalenderAdminEmployeeFilter').value;
  const container = document.getElementById('kalenderAdminContainer');

  if (!employeeId) {
    container.innerHTML = 'Pilih karyawan untuk melihat kalender';
    return;
  }

  try {
    const now = new Date();
    const tahunNum = now.getFullYear();
    const bulanNum = now.getMonth() + 1;
    const startDateStr = tahunNum + '-' + String(bulanNum).padStart(2, '0') + '-01';
    const endDateObj = new Date(tahunNum, bulanNum, 1);
    const endDateStr = endDateObj.getFullYear() + '-' + String(endDateObj.getMonth() + 1).padStart(2, '0') + '-01';
    const todayStr = tahunNum + '-' + String(bulanNum).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const daysInMonth = getDaysInMonth(tahunNum, bulanNum);

    const { data: attData, error: attError } = await supabaseClient
      .from('attendance')
      .select('tanggal, status')
      .eq('employee_id', employeeId)
      .gte('tanggal', startDateStr)
      .lt('tanggal', endDateStr);
    if (attError) throw attError;

    const { data: leaveData, error: leaveError } = await supabaseClient
      .from('leave_requests')
      .select('start_date')
      .eq('employee_id', employeeId)
      .eq('status', 'approved')
      .gte('start_date', startDateStr)
      .lt('start_date', endDateStr);
    if (leaveError) throw leaveError;

    const dayDataMap = {};
    const _moStart = tahunNum + '-' + String(bulanNum).padStart(2, '0') + '-01';
    const _moEnd = tahunNum + '-' + String(bulanNum).padStart(2, '0') + '-' + String(daysInMonth).padStart(2, '0');
    const { data: offData } = await supabaseClient
      .from('day_off_requests')
      .select('off_date')
      .eq('employee_id', employeeId)
      .eq('status', 'approved')
      .gte('off_date', _moStart)
      .lte('off_date', _moEnd);
    (offData || []).forEach(o => { dayDataMap[o.off_date] = 'libur'; });
    (attData || []).forEach(a => {
      dayDataMap[a.tanggal] = (a.status && a.status.startsWith('telat_')) ? 'telat' : 'hadir';
    });
    (leaveData || []).forEach(l => {
      dayDataMap[l.start_date] = 'cuti';
    });

    renderCalendarGrid('kalenderAdminContainer', tahunNum, bulanNum, dayDataMap);

  } catch (err) {
    console.error('loadKalenderAdmin error:', err);
    container.innerHTML = '<div class="empty-state"><i data-lucide="circle-alert"></i>Gagal memuat kalender</div>';
  }
}

export async function exportRingkasanToPDF() {
  const monthValue = document.getElementById('ringkasanMonthFilter').value;
  if (!monthValue) {
    await showError('Pilih Bulan', 'Pilih bulan terlebih dahulu sebelum export PDF.');
    return;
  }

  if (typeof jspdf === 'undefined') {
    await showError('Gagal Export', 'Komponen PDF belum siap. Coba refresh halaman.');
    return;
  }

  try {
    const stats = await computeRingkasanBulan(monthValue);
    const { jsPDF } = jspdf;
    const doc = new jsPDF();

    const today = new Date();
    const tglCetak = today.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text('Laporan Ringkasan Absensi', 14, 18);
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    doc.text('Refa Printing', 14, 25);
    doc.text('Periode: ' + stats.monthLabel, 14, 31);
    doc.text('Dicetak: ' + tglCetak, 14, 37);

    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Ringkasan Umum', 14, 48);

    doc.autoTable({
      startY: 52,
      head: [['Metrik', 'Nilai']],
      body: [
        ['Total Karyawan Aktif', String(stats.employeeCount)],
        ['Total Kehadiran', String(stats.totalHadir)],
        ['Total Tidak Hadir', String(stats.totalAlpa)],
        ['Total Keterlambatan', String(stats.totalTelat)],
        ['Total Cuti Disetujui (hari)', String(stats.totalCuti)],
        ['Rata-rata Kehadiran', stats.persenTotal === null ? '-' : stats.persenTotal + '%']
      ],
      theme: 'grid',
      headStyles: { fillColor: [255, 122, 26] },
      styles: { fontSize: 10 }
    });

    const employeeRows = Object.values(stats.perEmployee)
      .sort((a, b) => b.alpa - a.alpa)
      .map(e => [e.nama, String(e.hadir), String(e.alpa), String(e.telat), String(e.cuti), (e.persen === null ? '-' : e.persen + '%')]);

    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 10,
      head: [['Nama Karyawan', 'Hadir', 'Tidak Hadir', 'Telat', 'Cuti', '%']],
      body: employeeRows,
      theme: 'grid',
      headStyles: { fillColor: [255, 122, 26] },
      styles: { fontSize: 9 }
    });

    doc.save('Ringkasan_Absensi_Refa_Printing_' + monthValue + '.pdf');

  } catch (err) {
    console.error('exportRingkasanToPDF error:', err);
    await showError('Gagal Export', getErrorMessage(err));
  }
}