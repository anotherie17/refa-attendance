// ===== KTP Cropper =====
// Cropper foto KTP dengan rasio terkunci ke standar kartu ID-1 (e-KTP / ATM):
// 85,6 mm x 53,98 mm  ->  85.6 / 53.98 = 1.5857 (lebar : tinggi).
// Murni vanilla + canvas, TANPA dependency eksternal.
//
// API: openKtpCropper(file) -> Promise<Blob|null>
//   - resolve Blob (JPEG ~1400x883) bila user menekan "Pakai Foto".
//   - resolve null bila dibatalkan.
//
// Catatan: fungsi ini HANYA menghasilkan blob hasil crop. Kompresi akhir
// (target <=250KB) tetap dilakukan pemanggil lewat compressImage(), supaya
// perilaku ukuran file konsisten dengan upload yang sudah ada.

const KTP_RATIO = 85.6 / 53.98; // 1.5857...
const OUT_W = 1400;
const OUT_H = Math.round(OUT_W / KTP_RATIO); // 883
const LOWRES_MIN_W = 1000; // di bawah ini, foto dianggap beresiko buram

export function openKtpCropper(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    img.onload = () => {
      const nW = img.naturalWidth || img.width;
      const nH = img.naturalHeight || img.height;

      // ---- Bangun DOM overlay (inline style + CSS var, nyatu dengan tema app) ----
      const overlay = document.createElement('div');
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-label', 'Atur foto KTP');
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:1100;display:flex;align-items:center;' +
        'justify-content:center;padding:20px;background:rgba(9,9,11,.72);' +
        'opacity:0;transition:opacity .18s ease;';

      const box = document.createElement('div');
      box.style.cssText =
        'width:100%;max-width:430px;background:var(--surface);border-radius:var(--r-xl,16px);' +
        'box-shadow:var(--shadow-lg);padding:16px;transform:translateY(8px);' +
        'transition:transform .18s ease;';

      const title = document.createElement('div');
      title.textContent = 'Atur Foto KTP';
      title.style.cssText =
        'font-size:16px;font-weight:700;color:var(--text);letter-spacing:-.01em;margin-bottom:2px;';

      const subtitle = document.createElement('div');
      subtitle.textContent = 'Geser & zoom agar KTP pas di dalam bingkai. Rasio dikunci.';
      subtitle.style.cssText = 'font-size:12.5px;color:var(--muted);line-height:1.5;margin-bottom:12px;';

      // Bingkai crop = area crop itu sendiri (overflow hidden).
      const frameWrap = document.createElement('div');
      frameWrap.style.cssText =
        'width:100%;background:var(--surface-2,#fafafa);border:1px solid var(--line);' +
        'border-radius:var(--r-md,10px);overflow:hidden;position:relative;touch-action:none;' +
        'cursor:grab;user-select:none;';

      // tinggi bingkai mengikuti rasio KTP terhadap lebar aktual
      const frame = document.createElement('div');
      frame.style.cssText = 'position:relative;width:100%;aspect-ratio:' + KTP_RATIO + ';';
      // fallback bila aspect-ratio tak didukung: di-set ulang via JS saat measure
      frameWrap.appendChild(frame);

      const imgEl = document.createElement('img');
      imgEl.src = url;
      imgEl.alt = '';
      imgEl.draggable = false;
      imgEl.style.cssText =
        'position:absolute;top:0;left:0;transform-origin:top left;will-change:transform;' +
        'pointer-events:none;max-width:none;';
      frame.appendChild(imgEl);

      // garis bantu tipis (rule of thirds) supaya gampang merataikan
      const guide = document.createElement('div');
      guide.style.cssText =
        'position:absolute;inset:0;pointer-events:none;' +
        'background-image:linear-gradient(rgba(255,255,255,.35) 1px,transparent 1px),' +
        'linear-gradient(90deg,rgba(255,255,255,.35) 1px,transparent 1px);' +
        'background-size:33.33% 33.33%;mix-blend-mode:overlay;';
      frame.appendChild(guide);

      // Slider zoom
      const zoomRow = document.createElement('div');
      zoomRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin-top:12px;';
      const zoomIcoMin = document.createElement('span');
      zoomIcoMin.textContent = '\u2013'; // –
      zoomIcoMin.style.cssText = 'font-size:18px;color:var(--muted);width:14px;text-align:center;';
      const zoom = document.createElement('input');
      zoom.type = 'range';
      zoom.min = '1';
      zoom.max = '4';
      zoom.step = '0.01';
      zoom.value = '1';
      zoom.style.cssText = 'flex:1;accent-color:var(--brand,#f97316);';
      const zoomIcoMax = document.createElement('span');
      zoomIcoMax.textContent = '+';
      zoomIcoMax.style.cssText = 'font-size:18px;color:var(--muted);width:14px;text-align:center;';
      zoomRow.append(zoomIcoMin, zoom, zoomIcoMax);

      // Peringatan resolusi rendah (opsional)
      const warn = document.createElement('div');
      warn.style.cssText =
        'display:none;margin-top:10px;font-size:12px;line-height:1.5;color:var(--warning,#d97706);' +
        'background:var(--warning-soft,#fffbeb);border:1px solid var(--warning,#d97706);' +
        'border-radius:var(--r-sm,8px);padding:8px 10px;';
      if (nW < LOWRES_MIN_W) {
        warn.style.display = 'block';
        warn.textContent =
          'Resolusi foto agak rendah (' + nW + '\u00d7' + nH + ' px). Hasil crop bisa kurang tajam. ' +
          'Disarankan foto ulang dengan resolusi lebih tinggi bila memungkinkan.';
      }

      // Tombol aksi
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:8px;margin-top:14px;';
      const btnCancel = document.createElement('button');
      btnCancel.type = 'button';
      btnCancel.textContent = 'Batal';
      btnCancel.style.cssText =
        'flex:1;padding:11px;border-radius:var(--r-md,10px);border:1px solid var(--line);' +
        'background:var(--surface);color:var(--text);font-size:14px;font-weight:600;cursor:pointer;';
      const btnOk = document.createElement('button');
      btnOk.type = 'button';
      btnOk.textContent = 'Pakai Foto';
      btnOk.style.cssText =
        'flex:1;padding:11px;border-radius:var(--r-md,10px);border:1px solid var(--brand-dark,#ea580c);' +
        'background:var(--brand,#f97316);color:#fff;font-size:14px;font-weight:600;cursor:pointer;';
      actions.append(btnCancel, btnOk);

      box.append(title, subtitle, frameWrap, zoomRow, warn, actions);
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      // animasi masuk
      requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        box.style.transform = 'translateY(0)';
      });

      // ---- State transform ----
      let frameW = 0, frameH = 0;
      let baseScale = 1; // skala "cover" minimum
      let scale = 1;
      let tx = 0, ty = 0;

      function measure() {
        const r = frameWrap.getBoundingClientRect();
        frameW = r.width;
        frameH = r.width / KTP_RATIO;
        // pastikan tinggi frame benar walau aspect-ratio tak didukung
        frame.style.height = frameH + 'px';
      }

      function clampOffsets() {
        const dispW = nW * scale;
        const dispH = nH * scale;
        const minTx = Math.min(0, frameW - dispW);
        const minTy = Math.min(0, frameH - dispH);
        if (tx > 0) tx = 0;
        if (ty > 0) ty = 0;
        if (tx < minTx) tx = minTx;
        if (ty < minTy) ty = minTy;
      }

      function render() {
        imgEl.style.transform =
          'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
      }

      function setScale(newScale, anchorX, anchorY) {
        const min = baseScale;
        const max = baseScale * 4;
        newScale = Math.max(min, Math.min(max, newScale));
        // jaga titik anchor (default tengah frame) tetap di tempat saat zoom
        const ax = anchorX == null ? frameW / 2 : anchorX;
        const ay = anchorY == null ? frameH / 2 : anchorY;
        const imgX = (ax - tx) / scale;
        const imgY = (ay - ty) / scale;
        scale = newScale;
        tx = ax - imgX * scale;
        ty = ay - imgY * scale;
        clampOffsets();
        render();
        // sinkronkan slider (skala relatif terhadap baseScale)
        zoom.value = String(scale / baseScale);
      }

      function init() {
        measure();
        baseScale = Math.max(frameW / nW, frameH / nH); // cover
        scale = baseScale;
        // center
        tx = (frameW - nW * scale) / 2;
        ty = (frameH - nH * scale) / 2;
        clampOffsets();
        render();
        zoom.value = '1';
      }

      // tunggu layout siap
      requestAnimationFrame(init);
      window.addEventListener('resize', onResize);
      function onResize() {
        const prevRel = scale / baseScale;
        measure();
        baseScale = Math.max(frameW / nW, frameH / nH);
        scale = baseScale * prevRel;
        clampOffsets();
        render();
      }

      // ---- Interaksi: drag (pan) + pinch (zoom) ----
      const pointers = new Map();
      let pinchStartDist = 0;
      let pinchStartScale = 1;

      frameWrap.addEventListener('pointerdown', (e) => {
        frameWrap.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 2) {
          const pts = [...pointers.values()];
          pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          pinchStartScale = scale;
        }
        frameWrap.style.cursor = 'grabbing';
      });

      frameWrap.addEventListener('pointermove', (e) => {
        if (!pointers.has(e.pointerId)) return;
        const prev = pointers.get(e.pointerId);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (pointers.size === 1) {
          tx += e.clientX - prev.x;
          ty += e.clientY - prev.y;
          clampOffsets();
          render();
        } else if (pointers.size === 2) {
          const pts = [...pointers.values()];
          const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          if (pinchStartDist > 0) {
            const rect = frameWrap.getBoundingClientRect();
            const midX = (pts[0].x + pts[1].x) / 2 - rect.left;
            const midY = (pts[0].y + pts[1].y) / 2 - rect.top;
            setScale(pinchStartScale * (dist / pinchStartDist), midX, midY);
          }
        }
      });

      function endPointer(e) {
        if (pointers.has(e.pointerId)) pointers.delete(e.pointerId);
        if (pointers.size < 2) pinchStartDist = 0;
        if (pointers.size === 0) frameWrap.style.cursor = 'grab';
      }
      frameWrap.addEventListener('pointerup', endPointer);
      frameWrap.addEventListener('pointercancel', endPointer);

      // wheel zoom (desktop)
      frameWrap.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = frameWrap.getBoundingClientRect();
        const ax = e.clientX - rect.left;
        const ay = e.clientY - rect.top;
        const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
        setScale(scale * factor, ax, ay);
      }, { passive: false });

      // slider zoom
      zoom.addEventListener('input', () => {
        setScale(baseScale * parseFloat(zoom.value));
      });

      // ---- Tutup / hasil ----
      function cleanup() {
        window.removeEventListener('resize', onResize);
        overlay.style.opacity = '0';
        box.style.transform = 'translateY(8px)';
        setTimeout(() => {
          URL.revokeObjectURL(url);
          overlay.remove();
        }, 180);
      }

      function cancel() {
        cleanup();
        resolve(null);
      }

      function confirm() {
        // sumber crop dalam koordinat natural image
        const sx = -tx / scale;
        const sy = -ty / scale;
        const sW = frameW / scale;
        const sH = frameH / scale;

        const canvas = document.createElement('canvas');
        canvas.width = OUT_W;
        canvas.height = OUT_H;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, sx, sy, sW, sH, 0, 0, OUT_W, OUT_H);

        canvas.toBlob((blob) => {
          cleanup();
          resolve(blob || null);
        }, 'image/jpeg', 0.9);
      }

      btnCancel.addEventListener('click', cancel);
      btnOk.addEventListener('click', confirm);
      overlay.addEventListener('pointerdown', (e) => {
        if (e.target === overlay) cancel(); // klik backdrop = batal
      });
    };

    img.src = url;
  });
}

export const KTP_OUTPUT = { width: OUT_W, height: OUT_H, ratio: KTP_RATIO };
