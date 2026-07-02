# Rencana: Notifikasi Approval via Bot Telegram

> Status: **DISETUJUI, BELUM DIEKSEKUSI.** Dokumen ini pegangan buat eksekusi nanti
> (sesi AI berikutnya cukup baca file ini + CLAUDE.md).

## Tujuan

Tiap ada pengajuan **cuti / izin off / izin khusus** baru dari karyawan, owner
(superadmin) langsung dapet pesan Telegram — gak perlu inget-inget buka dashboard
buat ngecek ada approval nunggu.

Contoh pesan yang bakal masuk:

> 📋 **Pengajuan Cuti Baru**
> Dilla — Kamis, 5 Juli 2026
> Alasan: acara keluarga
> Saldo cuti: 8 hari
> 👉 Proses di https://refaprinting.my.id

## Kenapa Telegram (bukan WA/push)

- **Gratis total** — Bot API Telegram tanpa biaya, beda sama WA Business API.
- **Nol infra baru** — dikirim langsung dari database Supabase (pg_net),
  **tanpa server tambahan, tanpa perubahan kode app, tanpa deploy ulang**.
- Kalau Telegram lagi down / token salah → notifikasi gagal DIAM-DIAM,
  pengajuan tetap tersimpan normal. Approval flow gak tergantung fitur ini.

## Arsitektur (Tahap 1 — satu arah)

```
Karyawan submit pengajuan (app)
        │ INSERT/UPDATE status='pending'
        ▼
Trigger Postgres di 3 tabel        ←  leave_requests / day_off_requests /
        │                              special_permission_requests
        ▼
Fungsi notify (plpgsql) — baca token dari Supabase Vault (terenkripsi),
rakit pesan (nama karyawan, jenis, tanggal, alasan)
        │ pg_net (HTTP async, gak ngeblokir insert)
        ▼
api.telegram.org/bot<TOKEN>/sendMessage → chat owner
```

Catatan teknis penting:
- Trigger jalan di `INSERT` **dan** `UPDATE` yang bikin status balik ke
  `pending` (kasus day-off "Ubah Ajuan" setelah ditolak — itu UPDATE, bukan INSERT).
- Token bot disimpan di **Supabase Vault** (terenkripsi), bukan hardcode.
- Semuanya bisa dipasang lewat migration SQL — **kode app & deploy GitHub Pages
  TIDAK disentuh sama sekali.**

## ✅ Yang HARUS LO SIAPKAN (total ±5 menit)

1. **Owner install Telegram** di HP-nya (kalau belum) + pastikan dia oke
   nerima notif di Telegram. ← *syarat paling penting; kalau owner gak bakal
   buka Telegram, fitur ini percuma.*
2. **Bikin bot** (dari akun Telegram siapa aja, sekali doang):
   - Chat **@BotFather** → ketik `/newbot`
   - Nama bot: bebas, mis. `REFA Approval`
   - Username bot: harus unik & diakhiri `bot`, mis. `refa_approval_bot`
   - BotFather kasih **TOKEN** (format `1234567890:AAxxxxxxxx...`) → **simpan,
     jangan di-share publik** — kasih ke AI pas sesi eksekusi.
3. **Owner buka chat bot-nya** (search username bot di Telegram) → pencet
   **Start** → kirim pesan apa aja (mis. "halo"). Ini wajib — bot Telegram
   gak bisa ngirim duluan ke orang yang belum pernah nyapa dia, dan dari
   pesan inilah chat_id owner diambil.
4. (Opsional) Putuskan: notif ke owner doang, atau ada orang kedua
   (mis. admin) yang ikut nerima? Bisa lebih dari satu penerima.

## Urutan Eksekusi (dikerjain AI, ±1 sesi pendek)

1. Terima TOKEN dari user → panggil `getUpdates` buat ambil **chat_id** owner.
2. Test kirim 1 pesan manual ke owner ("Bot REFA aktif ✅") — konfirmasi nyampe.
3. Migration:
   - pastikan extension `pg_net` aktif (cek dulu, biasanya tinggal enable),
   - simpan token + chat_id di Vault,
   - buat fungsi `notify_telegram_pengajuan()` + 3 trigger
     (leave_requests, day_off_requests, special_permission_requests).
4. Test end-to-end pakai **akun riri** (akun test, role karyawan): submit cuti
   dummy → pesan harus nyampe ke Telegram owner → hapus/tolak pengajuan dummy.
5. Update CLAUDE.md (changelog + arsitektur) & commit dokumen.

**Rollback:** satu migration `drop trigger` × 3 — fitur mati total, app gak
terpengaruh apa-apa.

## Tahap 2 (NANTI, kalau Tahap 1 kepake & owner suka)

Tombol ✅ Setujui / ❌ Tolak **langsung di pesan Telegram** (inline button):
- Butuh edge function baru sebagai webhook Telegram (dua arah).
- Wajib: whitelist chat_id (cuma owner yang bisa mencet), idempotency
  (pengajuan yang udah diproses gak bisa diproses ulang), pakai RPC
  `approve_leave_request` yang udah ada guard superadmin-nya.
- Effort: Sedang. JANGAN dikerjain bareng Tahap 1 — biar tahap 1 terbukti
  dipake dulu.

## Biaya

**Rp 0.** Telegram Bot API gratis, pg_net & Vault termasuk paket Supabase
yang sekarang, gak ada server/langganan baru.
