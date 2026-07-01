import { state } from '../state.js';

export function showModal(type, title, message, options) {
  options = options || {};

  const overlay = document.getElementById('modalOverlay');
  const icon = document.getElementById('modalIcon');
  const titleEl = document.getElementById('modalTitle');
  const messageEl = document.getElementById('modalMessage');
  const okBtn = document.getElementById('modalOkBtn');
  const cancelBtn = document.getElementById('modalCancelBtn');

  const icons = {
    success: 'check',
    error: 'x',
    warning: 'triangle-alert',
    confirm: 'circle-question-mark'
  };

  icon.className = 'modal-icon ' + type;
  icon.innerHTML = '<i data-lucide="' + (icons[type] || icons.confirm) + '"></i>';
  if (window.lucide) window.lucide.createIcons();
  titleEl.textContent = title;
  messageEl.textContent = message;

  okBtn.textContent = options.okText || 'OK';

  if (options.showCancel) {
    cancelBtn.style.display = 'block';
    cancelBtn.textContent = options.cancelText || 'Batal';
  } else {
    cancelBtn.style.display = 'none';
  }
okBtn.onclick = () => closeModal(true);
cancelBtn.onclick = () => closeModal(false);
  overlay.classList.add('active');

  return new Promise((resolve) => {
    state.modalResolve = resolve;
  });
}

export function closeModal(confirmed) {
  const overlay = document.getElementById('modalOverlay');
  overlay.classList.remove('active');

  if (state.modalResolve) {
    state.modalResolve(confirmed);
    state.modalResolve = null;
  }
}

export function showSuccess(title, message) {
  return showModal('success', title, message);
}

export function showError(title, message) {
  return showModal('error', title, message);
}

// ===== TOAST — feedback ringan (muncul-hilang sendiri) =====
export function showToast(message, type) {
  type = type || 'success';
  const wrap = document.getElementById('toastWrap');
  if (!wrap) return;

  const icons = { success: 'circle-check-big', error: 'circle-alert', info: 'info' };
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = '<i data-lucide="' + (icons[type] || icons.info) + '"></i><span></span>';
  el.querySelector('span').textContent = message;
  wrap.appendChild(el);
  if (window.lucide) window.lucide.createIcons();

  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }, 2400);
}

export function showConfirm(title, message, okText) {
  return showModal('confirm', title, message, {
    showCancel: true,
    okText: okText || 'Ya, Lanjutkan',
    cancelText: 'Batal'
  });
}
