import { supabaseClient } from '../../services/supabase.js';
import { filterTrackedEmployees, formatWITATime, escapeHtml } from '../../utils/helpers.js';

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
