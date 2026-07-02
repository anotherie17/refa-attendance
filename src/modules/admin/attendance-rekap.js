import { supabaseClient } from '../../services/supabase.js';
import { showError, showSuccess } from '../../utils/modal.js';
import {
  getErrorMessage, computeMonthlyAttendance, skeletonList,
  filterTrackedEmployees, groupRowsByEmployee, escapeHtml,
  HARI_LABELS as HARI, formatStatusLabel, formatDurasiJam
} from '../../utils/helpers.js';
import { ensureLib } from '../../utils/lazy-libs.js';

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
          safe(formatDurasiJam(att.jam_masuk, att.jam_keluar)),
          safe(formatStatusLabel(att.status)),
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
