import { state } from '../../state.js';
import { supabaseClient } from '../../services/supabase.js';
import { showError, showSuccess } from '../../utils/modal.js';
import { getErrorMessage, getDaysInMonth, computeMonthlyAttendance, skeletonList, filterTrackedEmployees, formatWITATime, groupRowsByEmployee , escapeHtml} from '../../utils/helpers.js';
import { ensureLib } from '../../utils/lazy-libs.js';

// ---- Fase 9: util unduh foto -> thumbnail dataURL (dipakai export PDF per karyawan) ----
async function loadThumbnailDataUrl(url, maxSize) {
  try {
    const resp = await fetch(url, { mode: 'cors', cache: 'no-store' });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    let bitmap;
    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(blob);
    } else {
      const objUrl = URL.createObjectURL(blob);
      try {
        bitmap = await new Promise((res, rej) => {
          const im = new Image();
          im.onload = () => res(im);
          im.onerror = () => rej(new Error('img load fail'));
          im.src = objUrl;
        });
      } finally {
        URL.revokeObjectURL(objUrl);
      }
    }
    const srcW = bitmap.width;
    const srcH = bitmap.height;
    const scale = Math.min(1, maxSize / Math.max(srcW, srcH));
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    if (bitmap.close) bitmap.close();
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.72), w, h };
  } catch (e) {
    console.warn('Gagal memuat foto untuk PDF:', url, e);
    return null;
  }
}

async function mapWithLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const cur = i++;
      out[cur] = await fn(items[cur], cur);
    }
  }
  const n = Math.min(limit, items.length) || 0;
  await Promise.all(Array.from({ length: n }, worker));
  return out;
}

export async function loadAdminAbsensiHariIni() {
  const container = document.getElementById('adminAbsensiHariIni');

  try {
    // Tanggal hari ini dalam WITA (bukan timezone perangkat) — konsisten dgn server
    const tanggal = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Makassar' });

    const IZIN_LABEL = { sakit: 'Sakit', keluarga: 'Urusan Keluarga', lainnya: 'Lainnya' };

    const { data: employeesRaw, error: empError } = await supabaseClient
      .from('employees')
      .select('id, nama, jabatan, role')
      .eq('is_active', true)
      .order('nama', { ascending: true });

    if (empError) throw empError;
    const employees = filterTrackedEmployees(employeesRaw);

    // Ambil semua sumber status hari ini secara paralel
    const [attRes, cutiRes, offRes, izinRes] = await Promise.all([
      supabaseClient.from('attendance')
        .select('employee_id, jam_masuk, jam_keluar, status, shifts(nama)')
        .eq('tanggal', tanggal),
      supabaseClient.from('leave_requests')
        .select('employee_id, status')
        .lte('start_date', tanggal).gte('end_date', tanggal)
        .in('status', ['approved', 'pending']),
      supabaseClient.from('day_off_requests')
        .select('employee_id, status')
        .eq('off_date', tanggal)
        .in('status', ['approved', 'pending']),
      supabaseClient.from('special_permission_requests')
        .select('employee_id, permission_type, status')
        .lte('start_date', tanggal).gte('end_date', tanggal)
        .in('status', ['approved', 'pending'])
    ]);

    if (attRes.error) throw attRes.error;

    const attendanceMap = {};
    (attRes.data || []).forEach(a => { attendanceMap[a.employee_id] = a; });
    const cutiMap = {};
    (cutiRes.data || []).forEach(c => { cutiMap[c.employee_id] = c.status; });
    const offMap = {};
    (offRes.data || []).forEach(o => { offMap[o.employee_id] = o.status; });
    const izinMap = {};
    (izinRes.data || []).forEach(i => { izinMap[i.employee_id] = { type: i.permission_type, status: i.status }; });

    if (!employees || employees.length === 0) {
      container.innerHTML = '<div class="empty-state"><i data-lucide="inbox"></i>Belum ada data karyawan aktif.</div>';
      return;
    }

    const totalCount = employees.length;
    let sudahCount = 0, izinCount = 0, pendingCount = 0;

    const cards = employees.map(emp => {
      const att = attendanceMap[emp.id];
      const cuti = cutiMap[emp.id];
      const off = offMap[emp.id];
      const izin = izinMap[emp.id];

      // 1) Sudah absen (menang di atas segalanya — dia beneran datang)
      if (att) {
        sudahCount++;
        const jamMasuk = att.jam_masuk ? formatWITATime(att.jam_masuk, true) : '-';
        const jamKeluar = att.jam_keluar ? formatWITATime(att.jam_keluar, true) : null;
        const statusBadge = jamKeluar
          ? '<span class="status-ok">Sudah Absen Keluar</span>'
          : '<span class="status-ok">Sudah Absen Masuk</span>';
        return `
          <div class="employee-card">
            <div class="employee-name">${escapeHtml(emp.nama)}</div>
            <div class="employee-meta">
              ${escapeHtml(emp.jabatan || '-')} · ${escapeHtml(att.shifts?.nama || 'Shift tidak diketahui')}<br>
              Masuk: ${jamMasuk}${jamKeluar ? ' · Keluar: ' + jamKeluar : ''}
            </div>
            ${statusBadge}
          </div>
        `;
      }

      // 2) Approved cuti / izin / off
      let badge = null;
      if (cuti === 'approved') badge = '<span class="status-info">Cuti</span>';
      else if (izin && izin.status === 'approved') badge = '<span class="status-info">Izin: ' + (IZIN_LABEL[izin.type] || 'Khusus') + '</span>';
      else if (off === 'approved') badge = '<span class="status-info">Off</span>';

      if (badge) izinCount++;

      // 3) Ada pengajuan pending (cuti > izin > off)
      if (!badge) {
        let jenis = null;
        if (cuti === 'pending') jenis = 'Cuti';
        else if (izin && izin.status === 'pending') jenis = 'Izin ' + (IZIN_LABEL[izin.type] || 'Khusus');
        else if (off === 'pending') jenis = 'Off';
        if (jenis) {
          pendingCount++;
          badge = '<span class="status-warning">' + jenis + ' · Menunggu approval</span>';
        }
      }

      // 4) Tidak ada apa-apa
      if (!badge) badge = '<span class="status-neutral">Belum Absen Masuk</span>';

      return `
        <div class="employee-card">
          <div class="employee-name">${escapeHtml(emp.nama)}</div>
          <div class="employee-meta">${escapeHtml(emp.jabatan || '-')}</div>
          ${badge}
        </div>
      `;
    }).join('');

    const extraNote = (izinCount || pendingCount)
      ? `<div style="margin-bottom:10px;font-size:12px;color:var(--muted);">` +
        [izinCount ? izinCount + ' cuti/izin/off' : null,
         pendingCount ? pendingCount + ' menunggu approval' : null]
          .filter(Boolean).join(' · ') + `</div>`
      : '';

    const summary = `
      <div style="margin-bottom:${extraNote ? '2px' : '10px'};font-size:13px;color:var(--text);font-weight:700;">
        ${sudahCount} dari ${totalCount} karyawan sudah absen hari ini
      </div>
      ${extraNote}
    `;

    container.innerHTML = summary + cards;

  } catch (err) {
    console.error(err);
    container.innerHTML = '<div class="empty-state"><i data-lucide="circle-alert"></i>Gagal memuat data absensi hari ini. Coba refresh halaman.</div>';
  }
}

export function populateRekapMonthFilter() {
  const select = document.getElementById('rekapMonthFilter');
  if (select.options.length > 1) return;

  select.innerHTML = '<option value="">-- Pilih Bulan --</option>';
  const now = new Date();

  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const value = year + '-' + month;
    const label = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }
}

export async function getRekapBulananData(monthValue) {
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
    .select('id, nama, jabatan, created_at, tanggal_masuk, role')
    .eq('is_active', true)
    .order('nama', { ascending: true });
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

  const attByEmp = groupRowsByEmployee(attendanceRows);
  const leaveByEmp = groupRowsByEmployee(leaveRows);
  const dayOffByEmp = groupRowsByEmployee(dayOffRows);

  const result = (employees || []).map(emp => {
    const stat = computeMonthlyAttendance({
      startDateStr, endDateStr, todayStr,
      joinDateStr: emp.tanggal_masuk || (emp.created_at ? String(emp.created_at).slice(0, 10) : null),
      attRows: attByEmp.get(emp.id) || [],
      leaveRows: leaveByEmp.get(emp.id) || [],
      dayOffRows: dayOffByEmp.get(emp.id) || []
    });
    return {
      id: emp.id,
      nama: emp.nama,
      jabatan: emp.jabatan || '-',
      hadir: stat.hadir,
      telat: stat.telat,
      cuti: stat.cutiDays,
      alpa: stat.alpa,
      persen: stat.persen
    };
  });

  return result;
}

export async function loadRekapBulanan() {
  const monthValue = document.getElementById('rekapMonthFilter').value;
  const container = document.getElementById('adminRekapBulanan');

  if (!monthValue) {
    container.innerHTML = '<div class="empty-state"><i data-lucide="calendar-days"></i>Pilih bulan untuk melihat rekap.</div>';
    return;
  }

  container.innerHTML = skeletonList(4);

  try {
    const rekap = await getRekapBulananData(monthValue);

    if (!rekap || rekap.length === 0) {
      container.innerHTML = '<div class="empty-state"><i data-lucide="inbox"></i>Belum ada data karyawan aktif.</div>';
      return;
    }

    const tableRows = rekap.map(r => `
      <tr>
        <td class="t-name">${escapeHtml(r.nama)}</td>
        <td class="num">${r.hadir}</td>
        <td class="num">${r.telat}</td>
        <td class="num">${r.cuti}</td>
        <td class="num danger">${r.alpa}</td>
        <td class="num">${r.persen === null ? '–' : r.persen + '%'}</td>
        <td class="num"><button class="rekap-pdf-btn" data-emp-id="${r.id}" data-month="${monthValue}"><i data-lucide="file-text"></i> PDF</button></td>
      </tr>
    `).join('');

    container.innerHTML = `
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Nama</th>
              <th style="text-align:center;">Hadir</th>
              <th style="text-align:center;">Telat</th>
              <th style="text-align:center;">Cuti</th>
              <th style="text-align:center;">Tidak Hadir</th>
              <th style="text-align:center;">%</th>
              <th style="text-align:center;">Laporan</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
      <button id="exportRekapBtn" class="secondary-btn" data-month="${monthValue}" style="margin-top:14px;"><i data-lucide="download"></i> Export ke Excel</button>
    `;

  } catch (err) {
    console.error(err);
    container.innerHTML = '<div class="empty-state"><i data-lucide="circle-alert"></i>Gagal memuat rekap. Coba refresh halaman.</div>';
  }
}

export async function exportRekapToExcel(monthValue) {
  try {
    await ensureLib('xlsx');
    const [tahun, bulan] = monthValue.split('-');
    const tahunNum = parseInt(tahun, 10);
    const bulanNum = parseInt(bulan, 10);
    const startDateStr = tahunNum + '-' + String(bulanNum).padStart(2,'0') + '-01';
    const endDateObj = new Date(tahunNum, bulanNum, 1);
    const endDateStr = endDateObj.getFullYear() + '-' + String(endDateObj.getMonth()+1).padStart(2,'0') + '-01';
    const monthLabel = new Date(tahunNum, bulanNum - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    const HARI = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];

    function safe(v) {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return s.length > 32000 ? s.slice(0, 32000) : s;
    }
    function fmtWITA(iso) {
      if (!iso) return '-';
      const w = new Date(new Date(iso).getTime() + 8 * 3600000);
      return String(w.getUTCHours()).padStart(2,'0') + ':' + String(w.getUTCMinutes()).padStart(2,'0') + ':' + String(w.getUTCSeconds()).padStart(2,'0');
    }
    function fmtStatus(s) {
      if (!s) return '-';
      if (s === 'tepat_waktu') return 'Tepat Waktu';
      if (s.startsWith('telat_')) return 'Telat ' + s.split('_')[1] + ' menit';
      return s;
    }
    function fmtDurasi(masuk, keluar) {
      if (!masuk || !keluar) return '-';
      const ms = new Date(keluar) - new Date(masuk);
      if (ms <= 0) return '< 1m';
      return Math.floor(ms / 3600000) + 'j ' + Math.floor((ms % 3600000) / 60000) + 'm';
    }
    function safeSheetName(name) {
      return name.replace(/[:\\\/\?\*\[\]]/g, '').slice(0, 31);
    }
    const usedSheetNames = new Set();
    function uniqueSheetName(name) {
      let base = safeSheetName(name) || 'Karyawan';
      let candidate = base;
      let suffix = 2;
      while (usedSheetNames.has(candidate)) {
        const suffixStr = ' (' + suffix + ')';
        candidate = base.slice(0, 31 - suffixStr.length) + suffixStr;
        suffix++;
      }
      usedSheetNames.add(candidate);
      return candidate;
    }

    const [empRes, attRes, leaveRes, dayOffRes, shiftRes] = await Promise.all([
      supabaseClient.from('employees').select('id, nama, jabatan, created_at, tanggal_masuk, leave_balance, leave_entitlement, role').eq('is_active', true).order('nama'),
      supabaseClient.from('attendance').select('employee_id, tanggal, jam_masuk, jam_keluar, status, shift_id, foto_masuk_url, foto_keluar_url').gte('tanggal', startDateStr).lt('tanggal', endDateStr),
      supabaseClient.from('leave_requests').select('employee_id, start_date, end_date, reason').eq('status', 'approved').lt('start_date', endDateStr).gte('end_date', startDateStr),
      supabaseClient.from('day_off_requests').select('employee_id, week_start, off_date').eq('status', 'approved'),
      supabaseClient.from('shifts').select('id, nama, jam_mulai, jam_selesai')
    ]);
    if (empRes.error) throw empRes.error;
    if (attRes.error) throw attRes.error;
    if (leaveRes.error) throw leaveRes.error;
    if (dayOffRes.error) throw dayOffRes.error;

    const employees = filterTrackedEmployees(empRes.data);
    const allAtt = attRes.data || [];
    const allLeave = leaveRes.data || [];
    const allDayOff = dayOffRes.data || [];
    const shiftsMap = {};
    (shiftRes.data || []).forEach(s => { shiftsMap[s.id] = s; });

    if (!employees.length) {
      await showError('Tidak Ada Data', 'Tidak ada karyawan aktif.');
      return;
    }

    const today = new Date();
    const todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
    const daysInMo = getDaysInMonth(tahunNum, bulanNum);
    const nowWITA = new Date(today.getTime() + 8 * 3600000);
    const jamCetak = String(nowWITA.getUTCHours()).padStart(2,'0') + ':' + String(nowWITA.getUTCMinutes()).padStart(2,'0');
    const tglCetak = today.toLocaleDateString('id-ID', {day:'2-digit', month:'long', year:'numeric'});

    const attByEmp = groupRowsByEmployee(allAtt);
    const leaveByEmp = groupRowsByEmployee(allLeave);
    const dayOffByEmp = groupRowsByEmployee(allDayOff);

    const rekapList = employees.map(emp => {
      const empAtt = (attByEmp.get(emp.id) || []).slice().sort((a,b) => a.tanggal.localeCompare(b.tanggal));
      const empLeave = (leaveByEmp.get(emp.id) || []).slice().sort((a,b) => a.start_date.localeCompare(b.start_date));
      const empDayOff = dayOffByEmp.get(emp.id) || [];
      const stat = computeMonthlyAttendance({
        startDateStr, endDateStr, todayStr,
        joinDateStr: emp.tanggal_masuk || (emp.created_at ? String(emp.created_at).slice(0, 10) : null),
        attRows: empAtt.map(a => ({ tanggal: a.tanggal, status: a.status })),
        leaveRows: empLeave,
        dayOffRows: empDayOff
      });
      return { emp, empAtt, empLeave, hadir: stat.hadir, telat: stat.telat, cuti: stat.cutiDays, alpa: stat.alpa, persen: stat.persen };
    });

    const wb = XLSX.utils.book_new();

    // SHEET REKAP
    const rekapRows = [
      ['REKAP ABSENSI BULANAN'],
      ['Refa Printing'],
      ['Periode: ' + monthLabel],
      ['Dicetak: ' + tglCetak + '  ' + jamCetak + ' WITA'],
      [''],
      ['No', 'Nama', 'Jabatan', 'Hadir', 'Tidak Hadir', 'Telat', 'Cuti', '%', 'Sisa Cuti', 'Jatah Cuti']
    ];
    rekapList.forEach((r, i) => {
      rekapRows.push([i + 1, r.emp.nama, r.emp.jabatan || '-', r.hadir, r.alpa, r.telat, r.cuti, (r.persen === null ? '-' : r.persen + '%'), (r.emp.leave_balance ?? 0), (r.emp.leave_entitlement ?? 0)]);
    });
    const wsRekap = XLSX.utils.aoa_to_sheet(rekapRows);
    wsRekap['!cols'] = [{wch:4},{wch:22},{wch:18},{wch:8},{wch:11},{wch:8},{wch:8},{wch:7},{wch:10},{wch:10}];

    // Styling sederhana
    const ORANGE = 'FF7A1A';
    const HEADER_BG = 'FF7A1A';
    const HEADER_FG = 'FFFFFF';
    const TITLE_FG = 'EF5F19';
    const MUTED_FG = '7B8794';
    const WHITE = 'FFFFFF';
    const STRIPE = 'FFF7ED';
    const BORDER_C = 'EAEAEA';
    const GREEN_BG = 'EAF8EF';
    const GREEN_FG = '16A34A';
    const WARN_BG = 'FFF7E6';
    const WARN_FG = 'D97706';
    const ORANGE_L = 'FFF1E6';
    const RED_BG = 'FFF0F0';
    const RED_FG = 'DC2626';

    function mkBorder(color) {
      const side = { style: 'thin', color: { rgb: color } };
      return { top: side, bottom: side, left: side, right: side };
    }
    function styleCell(ws, addr, s) {
      if (!ws[addr]) ws[addr] = { v: '', t: 's' };
      ws[addr].s = s;
    }
    function applyRowStyle(ws, rowIdx, numCols, s) {
      for (let c = 0; c < numCols; c++)
        styleCell(ws, XLSX.utils.encode_cell({ r: rowIdx, c }), s);
    }

    // Header rekap
    const rekapHeaderRow = 5;
    for (let c = 0; c < 10; c++) {
      styleCell(wsRekap, XLSX.utils.encode_cell({ r: rekapHeaderRow, c }), {
        font: { bold: true, sz: 10, color: { rgb: HEADER_FG } },
        fill: { fgColor: { rgb: HEADER_BG } },
        alignment: { horizontal: c >= 3 ? 'center' : 'left', vertical: 'center', wrapText: true },
        border: mkBorder(BORDER_C)
      });
    }
    rekapList.forEach((_, i) => {
      const ri = rekapHeaderRow + 1 + i;
      const isStripe = i % 2 === 0;
      for (let c = 0; c < 10; c++) {
        styleCell(wsRekap, XLSX.utils.encode_cell({ r: ri, c }), {
          font: { sz: 10, bold: c === 1 },
          fill: { fgColor: { rgb: isStripe ? STRIPE : WHITE } },
          alignment: { horizontal: c >= 3 ? 'center' : 'left', vertical: 'center' },
          border: mkBorder(BORDER_C)
        });
      }
    });

    XLSX.utils.book_append_sheet(wb, wsRekap, 'Rekap');

    // SHEET PER KARYAWAN
    rekapList.forEach(({ emp, empAtt, empLeave, hadir, telat, cuti, alpa, persen }) => {
      const rows = [
        ['LAPORAN ABSENSI KARYAWAN'],
        ['Refa Printing  |  Periode: ' + monthLabel],
        ['Dicetak: ' + tglCetak + '  ' + jamCetak + ' WITA'],
        [''],
        ['Nama', emp.nama, '', 'Jabatan', emp.jabatan || '-'],
        [''],
        ['RINGKASAN'],
        ['Hadir', 'Tidak Hadir', 'Telat', 'Cuti', '%'],
        [hadir, alpa, telat, cuti, (persen === null ? '-' : persen + '%')],
        [''],
        ['No', 'Tanggal', 'Hari', 'Shift', 'Jam Masuk', 'Jam Keluar', 'Durasi', 'Status', 'Foto Masuk', 'Foto Keluar']
      ];

      const dataStartRow = rows.length;

      empAtt.forEach((att, i) => {
        const shift = att.shift_id ? shiftsMap[att.shift_id] : null;
        const shiftLabel = shift ? safe(shift.nama + ' (' + (shift.jam_mulai||'').slice(0,5) + '-' + (shift.jam_selesai||'').slice(0,5) + ')') : '-';
        rows.push([
          i + 1,
          safe(att.tanggal),
          HARI[new Date(att.tanggal + 'T12:00:00').getDay()],
          shiftLabel,
          safe(fmtWITA(att.jam_masuk)),
          safe(fmtWITA(att.jam_keluar)),
          safe(fmtDurasi(att.jam_masuk, att.jam_keluar)),
          safe(fmtStatus(att.status)),
          att.foto_masuk_url ? '📷 Lihat Foto' : '-',
          att.foto_keluar_url ? '📷 Lihat Foto' : '-'
        ]);
      });

      empLeave.forEach((lv, i) => {
        rows.push([
          empAtt.length + i + 1,
          safe(lv.start_date),
          HARI[new Date(lv.start_date + 'T12:00:00').getDay()],
          '-', '-', '-', '-',
          safe('CUTI' + (lv.reason ? ': ' + lv.reason : '')),
          '-', '-'
        ]);
      });

      if (empAtt.length === 0 && empLeave.length === 0) {
        rows.push(['', '-', '-', '-', '-', '-', '-', 'Tidak ada data absensi bulan ini', '-', '-']);
      }

      const ws = XLSX.utils.aoa_to_sheet(rows);

      function isSafeHyperlinkTarget(url) {
        if (!url || typeof url !== 'string') return false;
        if (url.length > 500) return false;
        if (url.startsWith('data:')) return false;
        return url.startsWith('http://') || url.startsWith('https://');
      }

      const range = XLSX.utils.decode_range(ws['!ref']);
      for (let r = dataStartRow; r <= range.e.r; r++) {
        const attRow = empAtt[r - dataStartRow];
        if (!attRow) break;

        const fotoMasukCell = ws[XLSX.utils.encode_cell({ r, c: 8 })];
        const fotoKeluarCell = ws[XLSX.utils.encode_cell({ r, c: 9 })];

        if (isSafeHyperlinkTarget(attRow.foto_masuk_url) && fotoMasukCell) {
          fotoMasukCell.l = { Target: attRow.foto_masuk_url };
        } else if (fotoMasukCell) {
          fotoMasukCell.v = attRow.foto_masuk_url ? '⚠️ Data foto tidak valid' : '-';
        }
        if (isSafeHyperlinkTarget(attRow.foto_keluar_url) && fotoKeluarCell) {
          fotoKeluarCell.l = { Target: attRow.foto_keluar_url };
        } else if (fotoKeluarCell) {
          fotoKeluarCell.v = attRow.foto_keluar_url ? '⚠️ Data foto tidak valid' : '-';
        }
      }

      ws['!cols'] = [
        {wch:4}, {wch:13}, {wch:9}, {wch:26}, {wch:11}, {wch:11}, {wch:9}, {wch:20}, {wch:14}, {wch:14}
      ];

      // Styling per karyawan
      const COL = 10;
      applyRowStyle(ws, 0, COL, {
        font: { bold: true, sz: 13, color: { rgb: TITLE_FG } },
        alignment: { horizontal: 'left', vertical: 'center' }
      });
      [1, 2].forEach(ri => applyRowStyle(ws, ri, COL, {
        font: { sz: 10, color: { rgb: MUTED_FG } },
        alignment: { horizontal: 'left', vertical: 'center' }
      }));

      ['A5','B5','D5','E5'].forEach(addr => {
        if (!ws[addr]) ws[addr] = { v: '', t: 's' };
        const isLabel = addr === 'A5' || addr === 'D5';
        ws[addr].s = {
          font: { bold: isLabel, sz: 10, color: { rgb: isLabel ? MUTED_FG : '1F2933' } },
          alignment: { horizontal: 'left', vertical: 'center' }
        };
      });

      styleCell(ws, 'A7', {
        font: { bold: true, sz: 10, color: { rgb: ORANGE } },
        alignment: { horizontal: 'left', vertical: 'center' }
      });

      const ringkasanColors = [GREEN_BG, RED_BG, WARN_BG, ORANGE_L, STRIPE];
      const ringkasanFG = [GREEN_FG, RED_FG, WARN_FG, ORANGE, ORANGE];
      for (let c = 0; c < 5; c++) {
        const hAddr = XLSX.utils.encode_cell({ r: 7, c });
        const vAddr = XLSX.utils.encode_cell({ r: 8, c });
        styleCell(ws, hAddr, {
          font: { bold: true, sz: 10, color: { rgb: ringkasanFG[c] } },
          fill: { fgColor: { rgb: ringkasanColors[c] } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: mkBorder(BORDER_C)
        });
        styleCell(ws, vAddr, {
          font: { bold: true, sz: 13, color: { rgb: ringkasanFG[c] } },
          fill: { fgColor: { rgb: ringkasanColors[c] } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: mkBorder(BORDER_C)
        });
      }

      const attHeaderRow = 10;
      for (let c = 0; c < COL; c++) {
        styleCell(ws, XLSX.utils.encode_cell({ r: attHeaderRow, c }), {
          font: { bold: true, sz: 10, color: { rgb: HEADER_FG } },
          fill: { fgColor: { rgb: HEADER_BG } },
          alignment: { horizontal: c >= 1 ? 'center' : 'center', vertical: 'center', wrapText: true },
          border: mkBorder(BORDER_C)
        });
      }

      const totalDataRows = empAtt.length + empLeave.length + (empAtt.length === 0 && empLeave.length === 0 ? 1 : 0);
      for (let i = 0; i < totalDataRows; i++) {
        const ri = attHeaderRow + 1 + i;
        const isStripe = i % 2 === 0;
        const attRow = empAtt[i];
        const isCuti = i >= empAtt.length && empLeave.length > 0;
        let rowBg = isStripe ? STRIPE : WHITE;
        let statusFG = '1F2933';
        if (isCuti) { rowBg = ORANGE_L; statusFG = ORANGE; }

        for (let c = 0; c < COL; c++) {
          const addr = XLSX.utils.encode_cell({ r: ri, c });
          let cellFG = statusFG;
          let cellBg = rowBg;
          if (c === 7 && attRow) {
            const st = attRow.status || '';
            if (st === 'tepat_waktu') { cellFG = GREEN_FG; cellBg = isStripe ? GREEN_BG : WHITE; }
            else if (st.startsWith('telat_')) { cellFG = WARN_FG; cellBg = isStripe ? WARN_BG : WHITE; }
          }
          styleCell(ws, addr, {
            font: { sz: 10, bold: c === 1, color: { rgb: cellFG } },
            fill: { fgColor: { rgb: cellBg } },
            alignment: { horizontal: c === 0 ? 'center' : (c >= 4 && c <= 6 ? 'center' : 'left'), vertical: 'center' },
            border: mkBorder(BORDER_C)
          });
        }
      }

      XLSX.utils.book_append_sheet(wb, ws, uniqueSheetName(emp.nama));
    });

    const fileName = 'Laporan_Absensi_Refa_Printing_' + monthValue + '.xlsx';
    XLSX.writeFile(wb, fileName, { bookSST: true, type: 'xlsx' });
    await showSuccess('Export Berhasil', 'Laporan ' + monthLabel + ' berhasil diunduh — ' + employees.length + ' sheet karyawan + 1 sheet Rekap.');

  } catch (err) {
    console.error(err);
    await showError('Gagal Export', getErrorMessage(err));
  }
}

// ---- Fase 9: Laporan PDF per karyawan + foto selfie tertanam ----
export async function exportKaryawanToPDF(employeeId, monthValue) {
  try {
    await ensureLib('jspdf');
    const [tahun, bulan] = monthValue.split('-');
    const tahunNum = parseInt(tahun, 10);
    const bulanNum = parseInt(bulan, 10);
    const startDateStr = tahunNum + '-' + String(bulanNum).padStart(2, '0') + '-01';
    const endDateObj = new Date(tahunNum, bulanNum, 1);
    const endDateStr = endDateObj.getFullYear() + '-' + String(endDateObj.getMonth() + 1).padStart(2, '0') + '-01';
    const monthLabel = new Date(tahunNum, bulanNum - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

    function fmtWITA(iso) {
      if (!iso) return '-';
      const w = new Date(new Date(iso).getTime() + 8 * 3600000);
      return String(w.getUTCHours()).padStart(2, '0') + ':' + String(w.getUTCMinutes()).padStart(2, '0') + ':' + String(w.getUTCSeconds()).padStart(2, '0');
    }
    function fmtStatus(s) {
      if (!s) return '-';
      if (s === 'tepat_waktu') return 'Tepat Waktu';
      if (s.startsWith('telat_')) return 'Telat ' + s.split('_')[1] + ' menit';
      return s;
    }
    function fmtDurasi(masuk, keluar) {
      if (!masuk || !keluar) return '-';
      const ms = new Date(keluar) - new Date(masuk);
      if (ms <= 0) return '< 1m';
      return Math.floor(ms / 3600000) + 'j ' + Math.floor((ms % 3600000) / 60000) + 'm';
    }

    const [empRes, attRes, leaveRes, dayOffRes, shiftRes] = await Promise.all([
      supabaseClient.from('employees').select('id, nama, jabatan, created_at, tanggal_masuk').eq('id', employeeId).single(),
      supabaseClient.from('attendance').select('tanggal, jam_masuk, jam_keluar, status, shift_id, foto_masuk_url, foto_keluar_url').eq('employee_id', employeeId).gte('tanggal', startDateStr).lt('tanggal', endDateStr).order('tanggal', { ascending: true }),
      supabaseClient.from('leave_requests').select('start_date, end_date, reason').eq('employee_id', employeeId).eq('status', 'approved').lt('start_date', endDateStr).gte('end_date', startDateStr).order('start_date', { ascending: true }),
      supabaseClient.from('day_off_requests').select('week_start, off_date').eq('employee_id', employeeId).eq('status', 'approved'),
      supabaseClient.from('shifts').select('id, nama, jam_mulai, jam_selesai')
    ]);
    if (empRes.error) throw empRes.error;
    if (attRes.error) throw attRes.error;
    if (leaveRes.error) throw leaveRes.error;
    if (dayOffRes.error) throw dayOffRes.error;

    const emp = empRes.data;
    if (!emp) { await showError('Tidak Ada Data', 'Data karyawan tidak ditemukan.'); return; }
    const empAtt = attRes.data || [];
    const empLeave = leaveRes.data || [];
    const shiftsMap = {};
    (shiftRes.data || []).forEach(s => { shiftsMap[s.id] = s; });

    const today = new Date();
    const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    const stat = computeMonthlyAttendance({
      startDateStr, endDateStr, todayStr,
      joinDateStr: emp.tanggal_masuk || (emp.created_at ? String(emp.created_at).slice(0, 10) : null),
      attRows: empAtt.map(a => ({ tanggal: a.tanggal, status: a.status })),
      leaveRows: empLeave,
      dayOffRows: dayOffRes.data || []
    });
    const hadir = stat.hadir;
    const telat = stat.telat;
    const cuti = stat.cutiDays;
    const alpa = stat.alpa;
    const persen = stat.persen;

    const { jsPDF } = jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageH = doc.internal.pageSize.getHeight();
    const MARGIN = 14;
    const ORANGE = [255, 122, 26];

    const tglCetak = today.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
    const nowWITA = new Date(today.getTime() + 8 * 3600000);
    const jamCetak = String(nowWITA.getUTCHours()).padStart(2, '0') + ':' + String(nowWITA.getUTCMinutes()).padStart(2, '0');

    // Header
    doc.setFontSize(16); doc.setFont(undefined, 'bold'); doc.setTextColor(239, 95, 25);
    doc.text('Laporan Absensi Karyawan', MARGIN, 18);
    doc.setTextColor(40, 40, 40); doc.setFontSize(11); doc.setFont(undefined, 'normal');
    doc.text('Refa Printing', MARGIN, 25);
    doc.setFontSize(10); doc.setTextColor(110, 120, 130);
    doc.text('Periode: ' + monthLabel + '  |  Dicetak: ' + tglCetak + ' ' + jamCetak + ' WITA', MARGIN, 31);

    // Identitas
    doc.setTextColor(40, 40, 40); doc.setFontSize(11);
    doc.setFont(undefined, 'bold'); doc.text('Nama:', MARGIN, 40);
    doc.setFont(undefined, 'normal'); doc.text(String(emp.nama || '-'), MARGIN + 16, 40);
    doc.setFont(undefined, 'bold'); doc.text('Jabatan:', MARGIN, 46);
    doc.setFont(undefined, 'normal'); doc.text(String(emp.jabatan || '-'), MARGIN + 20, 46);

    // Ringkasan
    doc.autoTable({
      startY: 52,
      head: [['Total Hadir', 'Tidak Hadir', 'Telat', 'Cuti', '% Hadir']],
      body: [[String(hadir), String(alpa), String(telat), String(cuti), (persen === null ? '-' : persen + '%')]],
      theme: 'grid',
      headStyles: { fillColor: ORANGE, halign: 'center' },
      bodyStyles: { halign: 'center', fontStyle: 'bold', fontSize: 12 },
      styles: { fontSize: 10 },
      margin: { left: MARGIN, right: MARGIN }
    });

    // Tabel detail
    const detailBody = [];
    empAtt.forEach((att, i) => {
      const shift = att.shift_id ? shiftsMap[att.shift_id] : null;
      const shiftLabel = shift ? (shift.nama + ' (' + (shift.jam_mulai || '').slice(0, 5) + '-' + (shift.jam_selesai || '').slice(0, 5) + ')') : '-';
      detailBody.push([
        String(i + 1),
        att.tanggal,
        HARI[new Date(att.tanggal + 'T12:00:00').getDay()],
        shiftLabel,
        fmtWITA(att.jam_masuk),
        fmtWITA(att.jam_keluar),
        fmtDurasi(att.jam_masuk, att.jam_keluar),
        fmtStatus(att.status)
      ]);
    });
    empLeave.forEach((lv, i) => {
      detailBody.push([
        String(empAtt.length + i + 1),
        lv.start_date,
        HARI[new Date(lv.start_date + 'T12:00:00').getDay()],
        '-', '-', '-', '-',
        'CUTI' + (lv.reason ? ': ' + lv.reason : '')
      ]);
    });
    if (detailBody.length === 0) {
      detailBody.push(['', '-', '-', '-', '-', '-', '-', 'Tidak ada data absensi bulan ini']);
    }

    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 8,
      head: [['No', 'Tanggal', 'Hari', 'Shift', 'Masuk', 'Keluar', 'Durasi', 'Status']],
      body: detailBody,
      theme: 'grid',
      headStyles: { fillColor: ORANGE, fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 1.5 },
      columnStyles: {
        0: { halign: 'center', cellWidth: 9 },
        4: { halign: 'center' },
        5: { halign: 'center' },
        6: { halign: 'center' }
      },
      margin: { left: MARGIN, right: MARGIN }
    });

    // Bagian Foto Selfie
    const withPhotos = empAtt.filter(a => a.foto_masuk_url || a.foto_keluar_url);
    if (withPhotos.length > 0) {
      const jobs = [];
      withPhotos.forEach(a => {
        if (a.foto_masuk_url) jobs.push({ tgl: a.tanggal, label: 'Masuk', url: a.foto_masuk_url });
        if (a.foto_keluar_url) jobs.push({ tgl: a.tanggal, label: 'Keluar', url: a.foto_keluar_url });
      });
      const thumbs = await mapWithLimit(jobs, 4, (job) => loadThumbnailDataUrl(job.url, 360));

      const byDate = {};
      jobs.forEach((job, idx) => {
        if (!byDate[job.tgl]) byDate[job.tgl] = [];
        byDate[job.tgl].push({ label: job.label, thumb: thumbs[idx] });
      });
      const orderedDates = withPhotos.map(a => a.tanggal);

      doc.addPage();
      let y = MARGIN + 4;
      doc.setFontSize(13); doc.setFont(undefined, 'bold'); doc.setTextColor(239, 95, 25);
      doc.text('Foto Selfie Absensi', MARGIN, y);
      doc.setTextColor(40, 40, 40);
      y += 8;

      const PHOTO_W = 55;
      const PHOTO_MAX_H = 50;
      const GAP_X = 8;
      const CAP_H = 5;
      const LABEL_H = 3;

      for (const tgl of orderedDates) {
        const items = byDate[tgl] || [];
        let blockPhotoH = 0;
        const drawItems = items.map(it => {
          let dispW = PHOTO_W, dispH = PHOTO_MAX_H;
          if (it.thumb) {
            const ratio = it.thumb.h / it.thumb.w;
            dispH = Math.min(PHOTO_MAX_H, PHOTO_W * ratio);
            dispW = dispH / ratio;
            if (dispW > PHOTO_W) { dispW = PHOTO_W; dispH = PHOTO_W * ratio; }
          } else {
            dispH = 24;
          }
          if (dispH > blockPhotoH) blockPhotoH = dispH;
          return { label: it.label, thumb: it.thumb, dispW, dispH };
        });

        const hariLabel = HARI[new Date(tgl + 'T12:00:00').getDay()];
        const blockH = CAP_H + LABEL_H + blockPhotoH + 8;
        if (y + blockH > pageH - MARGIN) {
          doc.addPage();
          y = MARGIN + 4;
        }

        doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.setTextColor(40, 40, 40);
        doc.text(tgl + ' (' + hariLabel + ')', MARGIN, y);
        y += CAP_H;

        let x = MARGIN;
        const photoTop = y + LABEL_H;
        drawItems.forEach(it => {
          doc.setFontSize(8); doc.setFont(undefined, 'normal'); doc.setTextColor(110, 120, 130);
          doc.text(it.label, x, y + 1.5);
          doc.setTextColor(40, 40, 40);
          if (it.thumb) {
            try {
              doc.addImage(it.thumb.dataUrl, 'JPEG', x, photoTop, it.dispW, it.dispH);
            } catch (e) {
              doc.setDrawColor(220); doc.rect(x, photoTop, PHOTO_W, 24);
              doc.setFontSize(8); doc.setTextColor(150, 150, 150);
              doc.text('(foto gagal dimuat)', x + 4, photoTop + 13);
              doc.setTextColor(40, 40, 40);
            }
          } else {
            doc.setDrawColor(220); doc.rect(x, photoTop, PHOTO_W, 24);
            doc.setFontSize(8); doc.setTextColor(150, 150, 150);
            doc.text('Foto tidak tersedia', x + 4, photoTop + 13);
            doc.setTextColor(40, 40, 40);
          }
          x += PHOTO_W + GAP_X;
        });

        y = photoTop + blockPhotoH + 8;
      }
    }

    const safeName = String(emp.nama || 'Karyawan').replace(/[^\w\-]+/g, '_');
    doc.save('Laporan_Absensi_' + safeName + '_' + monthValue + '.pdf');
    await showSuccess('Export Berhasil', 'Laporan PDF ' + (emp.nama || '') + ' (' + monthLabel + ') berhasil diunduh.');

  } catch (err) {
    console.error('exportKaryawanToPDF error:', err);
    await showError('Gagal Export', getErrorMessage(err));
  }
}
