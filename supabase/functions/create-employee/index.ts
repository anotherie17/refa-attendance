import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const ALLOWED_ROLES = ['karyawan', 'admin', 'superadmin'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Metode tidak diizinkan.' }, 405);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: 'Konfigurasi server tidak lengkap.' }, 500);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return json({ error: 'Tidak ada token autentikasi.' }, 401);

  // Klien service_role (bypass RLS) — hanya hidup di server, tidak pernah ke frontend.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) Identifikasi pemanggil dari JWT.
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: 'Token tidak valid.' }, 401);
  const callerAuthId = userData.user.id;

  // 2) Ambil role pemanggil dari tabel employees.
  const { data: callerEmp, error: callerErr } = await admin
    .from('employees')
    .select('role, is_active')
    .eq('auth_id', callerAuthId)
    .single();
  if (callerErr || !callerEmp) {
    return json({ error: 'Data karyawan pemanggil tidak ditemukan.' }, 403);
  }
  if (callerEmp.is_active === false) return json({ error: 'Akun pemanggil non-aktif.' }, 403);
  const callerRole = callerEmp.role;
  if (callerRole !== 'admin' && callerRole !== 'superadmin') {
    return json({ error: 'Hanya admin atau superadmin yang boleh menambah karyawan.' }, 403);
  }

  // 3) Parse & validasi input.
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body permintaan bukan JSON yang valid.' }, 400);
  }

  const nama = (body?.nama ?? '').toString().trim();
  const email = (body?.email ?? '').toString().trim().toLowerCase();
  const password = (body?.password ?? '').toString();
  const jabatan = body?.jabatan ? body.jabatan.toString().trim() : null;
  const tanggal_masuk = body?.tanggal_masuk || null;
  const tanggal_lahir = body?.tanggal_lahir || null;
  const role = (body?.role ?? 'karyawan').toString();
  const nomor_telepon = body?.nomor_telepon ? String(body.nomor_telepon).trim() : null;

  const lbRaw = body?.leave_balance;
  const leRaw = body?.leave_entitlement;
  const leave_balance = Number.isFinite(+lbRaw) ? parseInt(String(lbRaw), 10) : 0;
  const leave_entitlement = Number.isFinite(+leRaw) ? parseInt(String(leRaw), 10) : 0;

  if (!nama || !email || !password) {
    return json({ error: 'Nama, email, dan password wajib diisi.' }, 400);
  }
  if (password.length < 6) {
    return json({ error: 'Password minimal 6 karakter.' }, 400);
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return json({ error: 'Role tidak valid.' }, 400);
  }
  // Hanya superadmin yang boleh membuat akun superadmin (konsisten dengan RLS).
  if (role === 'superadmin' && callerRole !== 'superadmin') {
    return json({ error: 'Hanya superadmin yang boleh membuat akun superadmin.' }, 403);
  }

  // 4) Buat akun Auth.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nama },
  });
  if (createErr || !created?.user) {
    const msg = createErr?.message ?? 'tidak diketahui';
    const friendly = /already.*registered|exists/i.test(msg)
      ? 'Email sudah terdaftar sebagai akun login.'
      : 'Gagal membuat akun login: ' + msg;
    return json({ error: friendly }, 400);
  }
  const newAuthId = created.user.id;

  // 5) Insert baris employee. Jika gagal, rollback akun Auth agar tidak orphan.
  const { data: emp, error: insErr } = await admin
    .from('employees')
    .insert({
      nama,
      email,
      jabatan,
      role,
      nomor_telepon,
      tanggal_masuk,
      tanggal_lahir,
      leave_balance,
      leave_entitlement,
      auth_id: newAuthId,
      is_active: true,
    })
    .select('id, nama, email, role')
    .single();

  if (insErr) {
    await admin.auth.admin.deleteUser(newAuthId).catch(() => {});
    return json({ error: 'Gagal menyimpan data karyawan: ' + insErr.message }, 400);
  }

  return json({ success: true, employee: emp }, 200);
});
