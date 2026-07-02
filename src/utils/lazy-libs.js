// ===== LAZY LOADER LIBRARY ADMIN =====
// Library berat (Chart.js, XLSX, jsPDF) hanya dipakai halaman admin.
// Dimuat saat pertama kali dibutuhkan, supaya HP karyawan tidak ikut
// mengunduh ~1 MB script yang tidak pernah mereka pakai.

const CDN = {
  chart: ['https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js'],
  xlsx: ['https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'],
  jspdf: [
    'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
    'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js'
  ]
};

const _loaded = {}; // url -> Promise

function loadScript(url) {
  if (!_loaded[url]) {
    _loaded[url] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = resolve;
      s.onerror = () => { delete _loaded[url]; reject(new Error('Gagal memuat ' + url)); };
      document.head.appendChild(s);
    });
  }
  return _loaded[url];
}

// name: 'chart' | 'xlsx' | 'jspdf'. Urutan dijaga (autotable butuh jspdf dulu).
export async function ensureLib(name) {
  const urls = CDN[name];
  if (!urls) throw new Error('Library tidak dikenal: ' + name);
  for (const url of urls) {
    await loadScript(url);
  }
}
