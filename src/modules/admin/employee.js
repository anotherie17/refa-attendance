import { state } from '../../state.js';
import { supabaseClient } from '../../services/supabase.js';
import { showError, showSuccess, showConfirm, showModal } from '../../utils/modal.js';
import { getErrorMessage, formatDateLabel, compressImage , escapeHtml} from '../../utils/helpers.js';
import { closeEmployeeForm } from '../../utils/dom.js';
import { openKtpCropper, KTP_OUTPUT } from '../../utils/ktp-cropper.js';

// Blob hasil crop KTP terakhir (rasio terkunci). Dipakai uploadKtp() bila ada.
let ktpCroppedBlob = null;
// File asli terakhir yang dipilih, untuk fitur "crop ulang".
let ktpLastFile = null;

// Dipanggil dari main.js saat input file KTP berubah: buka cropper rasio KTP.
export async function onKtpFileSelected(e) {
  const input = e.target;
  const file = input && input.files ? input.files[0] : null;
  ktpCroppedBlob = null;
  ktpLastFile = null;

  if (!file) return;
  if (!file.type || !file.type.startsWith('image/')) {
    input.value = '';
    await showError('Format Tidak Didukung', 'File KTP harus berupa gambar (JPG/PNG).');
    return;
  }

  ktpLastFile = file;
  const blob = await openKtpCropper(file);
  if (!blob) {
    // Dibatalkan / gagal dimuat: kosongkan input, jangan ubah pratinjau KTP lama.
    input.value = '';
    ktpCroppedBlob = null;
    ktpLastFile = null;
    return;
  }

  ktpCroppedBlob = blob;
  renderKtpCropPreview(blob);
}

// Render pratinjau hasil crop di area form admin (#empFormKtpPreview).
// Catatan: ini HANYA pratinjau di form admin. Tampilan KTP di halaman profil
// karyawan (#profileKtpImg) tidak diubah sama sekali.
function renderKtpCropPreview(blob) {
  const prev = document.getElementById('empFormKtpPreview');
  if (!prev) return;
  const previewUrl = URL.createObjectURL(blob);
  const kb = Math.max(1, Math.round(blob.size / 1024));
  prev.innerHTML =
    '<img src="' + previewUrl + '" alt="Pratinjau KTP" ' +
    'style="max-width:100%;border-radius:8px;border:1px solid var(--line);display:block;">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap;">' +
    '<span style="font-size:12px;color:var(--muted);">Hasil crop \u2022 ' +
    KTP_OUTPUT.width + '\u00d7' + KTP_OUTPUT.height + ' px \u2022 ~' + kb + ' KB \u2022 siap diunggah</span>' +
    '<button type="button" id="empFormKtpRecropBtn" ' +
    'style="font-size:12px;font-weight:600;color:var(--brand-darker,#c2410c);background:none;' +
    'border:none;cursor:pointer;padding:0;text-decoration:underline;">Crop ulang</button>' +
    '</div>';

  const recropBtn = document.getElementById('empFormKtpRecropBtn');
  if (recropBtn) {
    recropBtn.addEventListener('click', async () => {
      if (!ktpLastFile) return;
      const blob2 = await openKtpCropper(ktpLastFile);
      if (blob2) {
        ktpCroppedBlob = blob2;
        renderKtpCropPreview(blob2);
      }
    });
  }
}

export async function loadEmployeeList() {
  const container = document.getElementById('adminEmployeeList');

  try {
    const { data, error } = await supabaseClient
      .from('employees')
      .select('*')
      .order('nama', { ascending: true });

    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML = '<div class="empty-state"><i data-lucide="inbox"></i>Belum ada data karyawan.</div>';
      return;
    }

    container.innerHTML = data.map(emp => {
      const roleLabel = emp.role === 'superadmin' ? 'Super Admin' : (emp.role === 'admin' ? 'Admin' : 'Karyawan');
      const statusLabel = emp.is_active
        ? '<span class="status-ok">Aktif</span>'
        : '<span class="status-error">Nonaktif</span>';
      const authStatus = emp.auth_id
        ? 'Akun login: tersambung'
        : 'Akun login: belum disambungkan';

      const tanggalMasuk = emp.tanggal_masuk ? formatDateLabel(emp.tanggal_masuk) : '-';
      const tanggalLahir = emp.tanggal_lahir ? formatDateLabel(emp.tanggal_lahir) : '-';

      return `
        <div class="employee-card ${emp.is_active ? '' : 'inactive'}">
          <div class="employee-name">${escapeHtml(emp.nama)}</div>
          <div class="employee-meta">
            ${escapeHtml(emp.jabatan || 'Belum ada jabatan')} · ${roleLabel}<br>
            ${escapeHtml(emp.email)}<br>
            Tanggal masuk: ${tanggalMasuk}<br>
            Tanggal lahir: ${tanggalLahir}<br>
            Saldo cuti: ${emp.leave_balance ?? 0} / ${emp.leave_entitlement ?? 0} hari<br>
            ${authStatus}
          </div>
          ${statusLabel}
          ${emp.ktp_url ? `
          <div class="ktp-spoiler">
            <button type="button" class="ktp-spoiler-btn" data-ktp-path="${emp.ktp_url}" aria-expanded="false">
              <i data-lucide="id-card"></i> Lihat KTP <i data-lucide="chevron-down" class="ktp-chevron"></i>
            </button>
            <div class="ktp-spoiler-body" hidden></div>
          </div>` : ''}
          <div class="employee-actions">
            <button class="btn-neutral employee-edit-btn" data-employee-id="${emp.id}">Edit</button>
            <button class="${emp.is_active ? 'btn-reject' : 'btn-approve'} employee-toggle-btn" data-employee-id="${emp.id}" data-active="${emp.is_active}">
              ${emp.is_active ? 'Nonaktifkan' : 'Aktifkan'}
            </button>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error(err);
    container.innerHTML = '<div class="empty-state"><i data-lucide="circle-alert"></i>Gagal memuat data karyawan. Coba refresh halaman.</div>';
  }
}

// Spoiler KTP di list: signed URL (1 jam) baru dibuat saat pertama kali diketuk.
export async function toggleKtpSpoiler(btn) {
  const body = btn.parentElement.querySelector('.ktp-spoiler-body');
  if (!body) return;

  const isOpen = btn.getAttribute('aria-expanded') === 'true';
  if (isOpen) {
    body.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    return;
  }

  btn.setAttribute('aria-expanded', 'true');
  body.hidden = false;

  // Sudah pernah dimuat? Tinggal tampilkan lagi, jangan bikin signed URL baru.
  if (body.dataset.loaded === '1') return;

  body.innerHTML = '<span class="ktp-loading"><span class="spinner"></span>Memuat KTP...</span>';
  try {
    const { data: signed, error } = await supabaseClient.storage
      .from('ktp')
      .createSignedUrl(btn.dataset.ktpPath, 3600);
    if (error) throw error;
    if (!signed?.signedUrl) throw new Error('Signed URL kosong.');
    body.innerHTML = '<img src="' + signed.signedUrl + '" alt="Foto KTP" style="max-width:100%;border-radius:8px;border:1px solid var(--line);display:block;">';
    body.dataset.loaded = '1';
  } catch (err) {
    console.error('toggleKtpSpoiler error:', err);
    body.innerHTML = '<span style="color:var(--error);font-size:12px;">Gagal memuat KTP. Ketuk lagi untuk coba ulang.</span>';
    body.dataset.loaded = '';
  }
}

export async function loadEmployeeToForm(employeeId) {
  try {
    const { data, error } = await supabaseClient
      .from('employees')
      .select('*')
      .eq('id', employeeId)
      .single();

    if (error) throw error;

    document.getElementById('empFormNama').value = data.nama || '';
    document.getElementById('empFormEmail').value = data.email || '';
    document.getElementById('empFormJabatan').value = data.jabatan || '';
    document.getElementById('empFormTanggalMasuk').value = data.tanggal_masuk || '';
    document.getElementById('empFormTanggalLahir').value = data.tanggal_lahir || '';
    document.getElementById('empFormRole').value = data.role || 'karyawan';
    document.getElementById('empFormLeaveBalance').value = data.leave_balance ?? 0;
    document.getElementById('empFormLeaveEntitlement').value = data.leave_entitlement ?? 0;
    document.getElementById('empFormPhone').value = data.nomor_telepon || '';

    const ktpFileEl = document.getElementById('empFormKtpFile');
    if (ktpFileEl) ktpFileEl.value = '';
    const prev = document.getElementById('empFormKtpPreview');
    if (prev) {
      if (data.ktp_url) {
        const { data: signed } = await supabaseClient.storage.from('ktp').createSignedUrl(data.ktp_url, 3600);
        prev.innerHTML = signed?.signedUrl
          ? `<img src="${signed.signedUrl}" alt="KTP" style="max-width:100%;border-radius:8px;border:1px solid var(--line);">`
          : '<span style="color:var(--muted);font-size:12px;">KTP tersimpan (gagal memuat pratinjau).</span>';
      } else {
        prev.innerHTML = '<span style="color:var(--muted);font-size:12px;">Belum ada foto KTP.</span>';
      }
    }

  } catch (err) {
    console.error(err);
    await showError('Gagal Memuat Data', getErrorMessage(err));
  }
}

export async function saveEmployee() {
  const nama = document.getElementById('empFormNama').value.trim();
  const email = document.getElementById('empFormEmail').value.trim();
  const jabatan = document.getElementById('empFormJabatan').value.trim();
  const tanggalMasuk = document.getElementById('empFormTanggalMasuk').value;
  const tanggalLahir = document.getElementById('empFormTanggalLahir').value;
  const role = document.getElementById('empFormRole').value;
  const leaveBalanceRaw = document.getElementById('empFormLeaveBalance').value.trim();
  const leaveEntitlementRaw = document.getElementById('empFormLeaveEntitlement').value.trim();
  const password = document.getElementById('empFormPassword') ? document.getElementById('empFormPassword').value : '';
  const phone = document.getElementById('empFormPhone').value.trim();
  const ktpFileEl = document.getElementById('empFormKtpFile');
  const ktpFile = ktpFileEl && ktpFileEl.files ? ktpFileEl.files[0] : null;

  if (!nama || !email) {
    await showError('Data Belum Lengkap', 'Nama dan email karyawan harus diisi.');
    return;
  }

  if (!state.editingEmployeeId && (!password || password.length < 6)) {
    await showError('Password Belum Valid', 'Password akun minimal 6 karakter.');
    return;
  }

  const leaveBalance = parseInt(leaveBalanceRaw, 10);
  const leaveEntitlement = parseInt(leaveEntitlementRaw, 10);

  if (leaveBalanceRaw !== '' && isNaN(leaveBalance)) {
    await showError('Data Tidak Valid', 'Saldo cuti harus berupa angka.');
    return;
  }
  if (leaveEntitlementRaw !== '' && isNaN(leaveEntitlement)) {
    await showError('Data Tidak Valid', 'Jatah cuti tahunan harus berupa angka.');
    return;
  }

  const saveBtn = document.getElementById('empFormSaveBtn');
  const originalText = saveBtn.textContent;
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="spinner"></span>Menyimpan...';

  // Upload foto KTP ke bucket privat 'ktp'. Path: '<employee_id>/ktp.<ext>'.
  // Return: path (string) bila ada file baru, atau undefined bila tidak ada file (jangan ubah ktp_url).
  async function uploadKtp(empId) {
    if (!ktpFile) return undefined;
    // Pakai hasil crop rasio KTP bila tersedia; fallback ke file asli bila tidak.
    const source = ktpCroppedBlob || ktpFile;
    // Kompres dulu (KTP perlu tetap terbaca, jadi resolusi sedikit lebih tinggi).
    const compressed = await compressImage(source, { maxDim: 1400, quality: 0.75, maxBytes: 250 * 1024, minDim: 1000 });
    const path = empId + '/ktp.jpg';
    const { error: upErr } = await supabaseClient.storage.from('ktp')
      .upload(path, compressed, { contentType: 'image/jpeg', upsert: true });
    if (upErr) throw upErr;
    ktpCroppedBlob = null; // reset setelah berhasil supaya tidak terpakai ulang
    ktpLastFile = null;
    return path;
  }

  try {
    const payload = {
      nama,
      jabatan: jabatan || null,
      tanggal_masuk: tanggalMasuk || null,
      tanggal_lahir: tanggalLahir || null,
      role,
      nomor_telepon: phone || null,
      leave_balance: isNaN(leaveBalance) ? 0 : leaveBalance,
      leave_entitlement: isNaN(leaveEntitlement) ? 0 : leaveEntitlement
    };

    if (state.editingEmployeeId) {
      // auth_id tidak lagi diedit manual — dikelola otomatis oleh edge function
      // create-employee saat akun dibuat. Update TIDAK menyentuh kolom auth_id.
      const ktpPath = await uploadKtp(state.editingEmployeeId);
      if (ktpPath !== undefined) payload.ktp_url = ktpPath;

      const { error } = await supabaseClient
        .from('employees')
        .update(payload)
        .eq('id', state.editingEmployeeId);

      if (error) throw error;

      closeEmployeeForm();
      await loadEmployeeList();
      await showSuccess('Data Tersimpan', 'Data karyawan berhasil diperbarui.');

    } else {
      // Fase 10: buat akun Auth + baris employee sekaligus via Edge Function (tanpa UID manual).
      const { data, error } = await supabaseClient.functions.invoke('create-employee', {
        body: {
          nama,
          email,
          password,
          jabatan: jabatan || null,
          tanggal_masuk: tanggalMasuk || null,
          tanggal_lahir: tanggalLahir || null,
          role,
          nomor_telepon: phone || null,
          leave_balance: isNaN(leaveBalance) ? 0 : leaveBalance,
          leave_entitlement: isNaN(leaveEntitlement) ? 0 : leaveEntitlement
        }
      });

      if (error) {
        let msg = getErrorMessage(error);
        try {
          if (error.context && typeof error.context.json === 'function') {
            const ctx = await error.context.json();
            if (ctx && ctx.error) msg = ctx.error;
          }
        } catch (_) { /* abaikan parse error */ }
        throw new Error(msg);
      }
      if (data && data.success === false) {
        throw new Error(data.error || 'Gagal menambahkan karyawan.');
      }

      // Upload foto KTP setelah karyawan dibuat (butuh ID-nya untuk nama file).
      const newId = data?.employee?.id;
      if (newId) {
        try {
          const ktpPath = await uploadKtp(newId);
          if (ktpPath) {
            await supabaseClient.from('employees').update({ ktp_url: ktpPath }).eq('id', newId);
          }
        } catch (ktpErr) {
          console.error('Upload KTP gagal:', ktpErr);
          await showError('Karyawan Dibuat, KTP Gagal', 'Akun karyawan berhasil dibuat, tetapi foto KTP gagal diunggah. Silakan edit karyawan dan unggah ulang KTP-nya.');
        }
      }

      closeEmployeeForm();
      await loadEmployeeList();
      await showSuccess('Karyawan Ditambahkan',
        'Akun login & data karyawan "' + nama + '" berhasil dibuat. Karyawan bisa langsung login pakai email dan password tadi.'
      );
    }

  } catch (err) {
    console.error(err);
    await showError(
      state.editingEmployeeId ? 'Gagal Memperbarui' : 'Gagal Menambahkan',
      getErrorMessage(err)
    );
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = originalText;
  }
}

export async function toggleEmployeeActive(employeeId, isCurrentlyActive) {
  const action = isCurrentlyActive ? 'menonaktifkan' : 'mengaktifkan';
  const confirmed = await showConfirm(
    isCurrentlyActive ? 'Nonaktifkan Karyawan?' : 'Aktifkan Karyawan?',
    isCurrentlyActive
      ? 'Karyawan ini tidak akan bisa login setelah dinonaktifkan. Data riwayat absensi dan cuti tetap aman dan tidak terhapus.'
      : 'Karyawan ini akan bisa login dan menggunakan sistem kembali.',
    isCurrentlyActive ? 'Ya, Nonaktifkan' : 'Ya, Aktifkan'
  );

  if (!confirmed) return;

  try {
    const { error } = await supabaseClient
      .from('employees')
      .update({ is_active: !isCurrentlyActive })
      .eq('id', employeeId);

    if (error) throw error;

    await loadEmployeeList();
    await showSuccess(
      'Berhasil',
      'Karyawan berhasil ' + (isCurrentlyActive ? 'dinonaktifkan' : 'diaktifkan') + '.'
    );

  } catch (err) {
    console.error(err);
    await showError('Gagal Memproses', getErrorMessage(err));
  }
}
