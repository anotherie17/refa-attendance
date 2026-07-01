import { state } from '../state.js';
import { supabaseClient } from '../services/supabase.js';
import { showError, showSuccess, showToast } from '../utils/modal.js';
import { calculateDistance, addPhotoWatermark, getErrorMessage, compressImage, formatWITATime } from '../utils/helpers.js';
import { updateHeroState, updateAbsenButtons } from '../utils/dom.js';

export async function loadTodayStatus() {
  if (!supabaseClient || !state.currentEmployee?.id) {
    state.todayAttendance = null;
    updateHeroState();
    updateAbsenButtons();
    return;
  }

  const today = new Date();
  const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

  try {
    const { data, error } = await supabaseClient
      .from('attendance')
      .select('*, shifts(nama)')
      .eq('employee_id', state.currentEmployee.id)
      .eq('tanggal', todayStr)
      .maybeSingle();

    if (error) throw error;

    state.todayAttendance = data || null;
    updateHeroState();
    updateAbsenButtons();
  } catch (err) {
    console.error('Error loading today status:', err);
    state.todayAttendance = null;
    updateHeroState();
    updateAbsenButtons();
  }
}

// ===== HELPER LOKAL ABSENSI =====
function resetPhotoPreview() {
  const preview = document.getElementById('photoPreview');
  if (preview) {
    preview.classList.add('empty');
    preview.textContent = 'Foto belum diambil';
  }
}

function computeMasukStatus(shift, now) {
  if (!shift || !shift.jam_mulai) return 'tepat_waktu';
  const [h, m] = String(shift.jam_mulai).split(':').map(Number);
  const shiftStart = new Date(now);
  shiftStart.setHours(h || 0, m || 0, 0, 0);
  const lateMs = now.getTime() - shiftStart.getTime();
  if (lateMs <= 0) return 'tepat_waktu';
  return 'telat_' + Math.round(lateMs / 60000);
}

async function uploadSelfie(prefix) {
  if (!state.photoData) throw new Error('Foto belum tersedia.');
  const res = await fetch(state.photoData);
  const rawBlob = await res.blob();
  const blob = await compressImage(rawBlob, { maxDim: 960, quality: 0.6, maxBytes: 100 * 1024, minDim: 480 });
  const fileName = state.currentEmployee.id + '/' + prefix + '_' + Date.now() + '.jpg';
  const { error: upErr } = await supabaseClient
    .storage.from('attendance-photos')
    .upload(fileName, blob, { contentType: 'image/jpeg', upsert: false });
  if (upErr) throw upErr;
  const { data: pub } = supabaseClient.storage.from('attendance-photos').getPublicUrl(fileName);
  return pub.publicUrl;
}

// ===== CEK LOKASI =====
export async function checkLocation() {
  const statusEl = document.getElementById('locationStatus');
  const btn = document.getElementById('checkLocBtn');

  if (!navigator.geolocation) {
    if (statusEl) { statusEl.textContent = 'Perangkat tidak mendukung GPS'; statusEl.className = 'status-error'; }
    return;
  }

  if (statusEl) { statusEl.textContent = 'Mengecek lokasi...'; statusEl.className = 'status-warning'; }
  if (btn) btn.disabled = true;

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true, timeout: 15000, maximumAge: 0
      });
    });

    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    state.currentLat = lat;
    state.currentLng = lng;

    const { data: office, error } = await supabaseClient
      .from('office_config')
      .select('latitude, longitude, radius_meter, nama_kantor')
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    if (!office) {
      state.locationOk = true;
      if (statusEl) { statusEl.textContent = 'Lokasi terdeteksi (kantor belum dikonfigurasi)'; statusEl.className = 'status-warning'; }
    } else {
      const distance = calculateDistance(lat, lng, office.latitude, office.longitude);
      const radius = office.radius_meter || 100;
      if (distance <= radius) {
        state.locationOk = true;
        if (statusEl) { statusEl.textContent = 'Berada di lokasi kantor (' + Math.round(distance) + ' m)'; statusEl.className = 'status-ok'; }
      } else {
        state.locationOk = false;
        if (statusEl) { statusEl.textContent = 'Di luar radius kantor (' + Math.round(distance) + ' m dari ' + (office.nama_kantor || 'kantor') + ')'; statusEl.className = 'status-error'; }
      }
    }
  } catch (err) {
    console.error('checkLocation error:', err);
    state.locationOk = false;
    if (statusEl) { statusEl.textContent = getErrorMessage(err); statusEl.className = 'status-error'; }
  } finally {
    if (btn) btn.disabled = false;
    updateAbsenButtons();
    updateHeroState();
  }
}

// ===== KAMERA / SELFIE =====
export async function startCamera() {
  const videoContainer = document.getElementById('videoContainer');
  const cameraBtn = document.getElementById('cameraBtn');
  const video = document.getElementById('video');

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' }, audio: false
    });
    state.stream = stream;
    if (video) {
      video.srcObject = stream;
      await video.play().catch(() => {});
    }
    if (videoContainer) videoContainer.style.display = 'block';
    if (cameraBtn) cameraBtn.style.display = 'none';
  } catch (err) {
    console.error('startCamera error:', err);
    await showError('Kamera Tidak Bisa Dibuka', getErrorMessage(err));
  }
}

export function capturePhoto() {
  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  const preview = document.getElementById('photoPreview');
  if (!video || !canvas) return;

  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  // Kamera depan tampil sebagai cermin (mirror). Balik horizontal supaya foto
  // yang tersimpan tidak terbalik / natural. Watermark digambar setelah restore
  // agar teksnya tetap terbaca (tidak ikut terbalik).
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);
  ctx.restore();

  addPhotoWatermark(ctx, canvas, state.currentEmployee?.nama, state.currentLat, state.currentLng);

  state.photoData = canvas.toDataURL('image/jpeg', 0.85);

  if (preview) {
    preview.classList.remove('empty');
    preview.innerHTML = '<img src="' + state.photoData + '" alt="Selfie" style="width:100%;border-radius:10px;display:block;" />';
  }

  stopCamera();
  updateAbsenButtons();
  updateHeroState();
  showToast('Foto selfie tersimpan');
}

export function stopCamera() {
  const videoContainer = document.getElementById('videoContainer');
  const cameraBtn = document.getElementById('cameraBtn');
  const video = document.getElementById('video');

  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }
  if (video) video.srcObject = null;
  if (videoContainer) videoContainer.style.display = 'none';
  if (cameraBtn) cameraBtn.style.display = 'block';
}

// ===== ABSEN MASUK / KELUAR =====
export async function absenMasuk() {
  if (state.isSubmitting) return;
  if (!state.currentEmployee?.id) { await showError('Sesi Berakhir', 'Silakan login ulang.'); return; }
  if (!state.locationOk) { await showError('Lokasi Belum Valid', 'Cek lokasi dulu dan pastikan berada di area kantor.'); return; }
  if (!state.photoData) { await showError('Foto Belum Ada', 'Ambil foto selfie terlebih dahulu.'); return; }
  if (!state.selectedShiftId) { await showError('Shift Belum Dipilih', 'Pilih shift terlebih dahulu.'); return; }

  const btn = document.getElementById('absenMasukBtn');
  const original = btn ? btn.innerHTML : '';
  state.isSubmitting = true;
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Memproses...'; }

  try {
    const fotoUrl = await uploadSelfie('masuk');
    const now = new Date();
    const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const shift = state.shifts.find(s => s.id === state.selectedShiftId) || null;
    const status = computeMasukStatus(shift, now);

    const { error } = await supabaseClient.from('attendance').insert({
      employee_id: state.currentEmployee.id,
      tanggal: today,
      jam_masuk: now.toISOString(),
      lat_masuk: state.currentLat,
      long_masuk: state.currentLng,
      foto_masuk_url: fotoUrl,
      shift_id: state.selectedShiftId,
      status
    });
    if (error) throw error;

    state.photoData = null;
    resetPhotoPreview();
    await loadTodayStatus();
    await showSuccess('Check In Berhasil', 'Absensi masuk tercatat pukul ' + formatWITATime(now, true) + ' WITA.');
  } catch (err) {
    console.error('absenMasuk error:', err);
    await showError('Gagal Check In', getErrorMessage(err, 'attendance'));
  } finally {
    state.isSubmitting = false;
    if (btn) btn.innerHTML = original;
    updateAbsenButtons();
  }
}

export async function absenKeluar() {
  if (state.isSubmitting) return;
  if (!state.todayAttendance?.id) { await showError('Belum Check In', 'Anda belum melakukan check in hari ini.'); return; }
  if (!state.locationOk) { await showError('Lokasi Belum Valid', 'Cek lokasi terlebih dahulu.'); return; }
  if (!state.photoData) { await showError('Foto Belum Ada', 'Ambil foto selfie terlebih dahulu.'); return; }

  const btn = document.getElementById('absenKeluarBtn');
  const original = btn ? btn.innerHTML : '';
  state.isSubmitting = true;
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Memproses...'; }

  try {
    const fotoUrl = await uploadSelfie('keluar');
    const now = new Date();
    const { error } = await supabaseClient.from('attendance').update({
      jam_keluar: now.toISOString(),
      lat_keluar: state.currentLat,
      long_keluar: state.currentLng,
      foto_keluar_url: fotoUrl
    }).eq('id', state.todayAttendance.id);
    if (error) throw error;

    state.photoData = null;
    resetPhotoPreview();
    await loadTodayStatus();
    await showSuccess('Check Out Berhasil', 'Absensi pulang tercatat pukul ' + formatWITATime(now, true) + ' WITA.');
  } catch (err) {
    console.error('absenKeluar error:', err);
    await showError('Gagal Check Out', getErrorMessage(err, 'attendance'));
  } finally {
    state.isSubmitting = false;
    if (btn) btn.innerHTML = original;
    updateAbsenButtons();
  }
}
