import { state } from '../state.js';

// ===== Sapaan acak ala chat di bawah hero =====
// Konsep: rekan kerja yang santai + sering nyelipin perhatian kecil.
// Netral waktu (TIDAK pagi/siang/sore/malam). {nama} = nama pendek karyawan.

const SANTAI = [
  'Gimana {nama}, semua aman?',
  '{nama}, pelan-pelan aja, ga usah buru-buru',
  '{nama}, kopi dulu apa langsung gas?',
  'Yuk mulai, {nama}',
  'Gimana {nama}, udah siap?',
  'Santai dulu {nama}, atur napas',
  '{nama}, ada yang perlu dibantu?',
  'Oke {nama}, satu-satu aja',
  '{nama}, mau langsung atau ngopi dulu?',
  'Selow {nama}, ga usah panik',
  '{nama}, kita mulai dari mana nih?',
  'Gimana {nama}, lancar semua?',
  '{nama}, hari ini gaskeun apa selow?',
  'Sini {nama}, mulai bareng',
  '{nama}, semua terkendali?',
  'Yuk {nama}, dikit-dikit yang penting jalan',
  '{nama}, siap tempur atau siap santai?',
  'Oke {nama}, kita jalan pelan-pelan',
  'Gimana {nama}, ada yang mau dikerjain duluan?',
  '{nama}, mulai dari yang gampang dulu aja'
];

const PERHATIAN = [
  '{nama}, jangan lupa makan ya, seriusan',
  'Jangan maksain kalau lagi ga fit ya, {nama}',
  '{nama}, udah minum air belum dari tadi?',
  'Kalau capek, istirahat aja dulu {nama}, ga apa-apa',
  '{nama}, jangan skip makan siang ya',
  'Pundak udah pegel belum, {nama}? Regangin dulu',
  '{nama}, matanya diistirahatin sesekali ya',
  'Kalau ada yang berat, ga usah dipendem sendiri {nama}',
  '{nama}, pulang jangan kemaleman ya',
  'Inget istirahat ya {nama}, kerjaan ga bakal lari',
  '{nama}, udah duduk kelamaan belum? jalan dikit gih',
  'Jaga kesehatan ya {nama}, bukan cuma kejar target',
  '{nama}, kalau butuh rehat sebentar, ambil aja',
  'Jangan lupa bahagia juga ya {nama}, bukan kerja doang',
  '{nama}, kamu udah kerja keras, ga usah dipaksa banget',
  'Udah ngemil belum {nama}? jangan kerja perut kosong',
  '{nama}, jangan lupa senyum, itu juga penting',
  'Kalau pusing, pejamin mata sebentar ya {nama}',
  '{nama}, minum kopi boleh, tapi air putih jangan lupa',
  'Jangan lupa sarapan ya {nama}, biar ga lemes',
  '{nama}, kalau butuh ngobrol, ada kok temennya',
  'Sesekali lihat jauh ya {nama}, matanya kasih jeda',
  '{nama}, jangan tahan-tahan kalau mau ke toilet',
  'Kerja boleh serius, tapi jangan lupa napas ya {nama}',
  '{nama}, badan juga butuh dirawat, bukan cuma kerjaan',
  'Kalau lagi banyak pikiran, pelan-pelan aja {nama}',
  '{nama}, udah cukup istirahat semalam belum?',
  'Jangan lupa minum ya {nama}, gampang lupa soalnya',
  '{nama}, jaga postur duduk, biar punggung ga sakit',
  'Kalau lapar ya makan {nama}, jangan ditunda-tunda',
  '{nama}, ambil napas dalam sekali, baru lanjut',
  'Semoga hari ini ga terlalu berat buat kamu, {nama}',
  '{nama}, jangan lupa kamu juga butuh dijaga',
  'Kalau mumet, keluar cari angin bentar ya {nama}',
  '{nama}, jangan lupa regangin badan tiap sejam',
  'Udah istirahat mata dari layar belum, {nama}?',
  '{nama}, kalau butuh apa-apa tinggal bilang ya',
  'Jangan lupa kabarin keluarga juga ya {nama}',
  '{nama}, pelan tapi konsisten lebih baik kok',
  'Semoga harimu ga bikin kamu abis, {nama}'
];

// Ambil nama pendek (kata pertama). Kalau kata pertama pendek/berakhiran titik
// (mis. "St."), gabung dengan kata berikutnya.
function shortName(full) {
  const parts = (full || 'Kamu').trim().split(/\s+/);
  let s = parts[0];
  if (parts[1] && (s.endsWith('.') || s.length <= 2)) s = s + ' ' + parts[1];
  return s;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// "Kantong bergilir" rasio 1 santai : 3 perhatian.
// Bikin urutan penuh (semua item terpakai) dengan pola tiap 4 slot = 1 santai + 3 perhatian,
// masing-masing sumber diacak. Saat kantong habis, dibangun ulang. Hasilnya rasio konsisten
// dan tidak ada pengulangan sampai stok masing-masing menipis.
function buildBag() {
  const s = shuffle(SANTAI);
  const p = shuffle(PERHATIAN);
  const bag = [];
  let si = 0, pi = 0;
  // selama masih ada stok, susun blok [1 santai, 3 perhatian]
  while (si < s.length || pi < p.length) {
    if (si < s.length) bag.push(s[si++]);
    for (let k = 0; k < 3; k++) {
      if (pi < p.length) bag.push(p[pi++]);
    }
  }
  return bag;
}

function nextTemplate() {
  if (!state.greetingBag || state.greetingBag.length === 0) {
    state.greetingBag = buildBag();
  }
  return state.greetingBag.shift();
}

// Tampilkan sapaan: efek "sedang mengetik" dulu, lalu teks fade-in.
export function showGreetingBubble() {
  const wrap = document.getElementById('greetingBubbleWrap');
  const bubble = document.getElementById('greetingBubble');
  const textEl = document.getElementById('greetingText');
  if (!wrap || !bubble || !textEl) return;

  const nama = shortName(state.currentEmployee && state.currentEmployee.nama);
  const text = nextTemplate().replaceAll('{nama}', nama);

  // reset & mulai state "typing"
  if (state.greetingTimer) { clearTimeout(state.greetingTimer); state.greetingTimer = null; }
  if (state.greetingHideTimer) { clearTimeout(state.greetingHideTimer); state.greetingHideTimer = null; }
  bubble.classList.remove('is-done', 'is-visible');
  bubble.classList.add('is-typing');
  textEl.textContent = '';

  // munculkan bubble (fade-in) di frame berikutnya
  requestAnimationFrame(() => bubble.classList.add('is-visible'));

  // durasi "mengetik" sedikit acak biar natural (700–1100ms)
  const typingMs = 700 + Math.floor(Math.random() * 400);
  state.greetingTimer = setTimeout(() => {
    textEl.textContent = text;
    bubble.classList.remove('is-typing');
    bubble.classList.add('is-done');

    // melayang sebentar, lalu menghilang (fade-out)
    state.greetingHideTimer = setTimeout(() => {
      bubble.classList.remove('is-visible');
    }, 3600);
  }, typingMs);
}
