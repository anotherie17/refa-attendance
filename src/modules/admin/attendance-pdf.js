import { supabaseClient } from '../../services/supabase.js';
import { showError, showSuccess } from '../../utils/modal.js';
import { getErrorMessage, computeMonthlyAttendance, HARI_LABELS as HARI, formatStatusLabel, formatDurasiJam, addDaysStr } from '../../utils/helpers.js';
import { ensureLib } from '../../utils/lazy-libs.js';

// ---- util unduh foto -> thumbnail dataURL (dipakai export PDF per karyawan) ----
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

// Laporan PDF per karyawan + foto selfie tertanam.
// onProgress(done, total) opsional: dipanggil tiap 1 foto selesai diproses, buat progress text di tombol.
export async function exportKaryawanToPDF(employeeId, monthValue, onProgress) {
  try {
    await ensureLib('jspdf');
    const [tahun, bulan] = monthValue.split('-');
    const tahunNum = parseInt(tahun, 10);
    const bulanNum = parseInt(bulan, 10);
    const startDateStr = tahunNum + '-' + String(bulanNum).padStart(2, '0') + '-01';
    const endDateObj = new Date(tahunNum, bulanNum, 1);
    const endDateStr = endDateObj.getFullYear() + '-' + String(endDateObj.getMonth() + 1).padStart(2, '0') + '-01';
    const monthLabel = new Date(tahunNum, bulanNum - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

    function fmtWITA(iso) {
      if (!iso) return '-';
      const w = new Date(new Date(iso).getTime() + 8 * 3600000);
      return String(w.getUTCHours()).padStart(2, '0') + ':' + String(w.getUTCMinutes()).padStart(2, '0') + ':' + String(w.getUTCSeconds()).padStart(2, '0');
    }

    const [empRes, attRes, leaveRes, dayOffRes, shiftRes] = await Promise.all([
      supabaseClient.from('employees').select('id, nama, jabatan, created_at, tanggal_masuk').eq('id', employeeId).single(),
      supabaseClient.from('attendance').select('tanggal, jam_masuk, jam_keluar, status, shift_id, foto_masuk_url, foto_keluar_url').eq('employee_id', employeeId).gte('tanggal', startDateStr).lt('tanggal', endDateStr).order('tanggal', { ascending: true }),
      supabaseClient.from('leave_requests').select('start_date, end_date, reason').eq('employee_id', employeeId).eq('status', 'approved').lt('start_date', endDateStr).gte('end_date', startDateStr).order('start_date', { ascending: true }),
      supabaseClient.from('day_off_requests').select('week_start, off_date').eq('employee_id', employeeId).eq('status', 'approved').gte('week_start', addDaysStr(startDateStr, -6)).lt('week_start', endDateStr),
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
        formatDurasiJam(att.jam_masuk, att.jam_keluar),
        formatStatusLabel(att.status)
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
      let doneCount = 0;
      const thumbs = await mapWithLimit(jobs, 4, async (job) => {
        const t = await loadThumbnailDataUrl(job.url, 360);
        doneCount++;
        if (onProgress) onProgress(doneCount, jobs.length);
        return t;
      });

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
