import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

let supabaseClient = null;

function createSupabaseClient() {
  const supabaseGlobal = window.supabase || globalThis.supabase;
  if (supabaseGlobal?.createClient) {
    supabaseClient = supabaseGlobal.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase client berhasil dibuat');
    return supabaseClient;
  }

  console.warn('Supabase SDK belum tersedia. Pastikan skrip CDN sudah dimuat sebelum aplikasi berjalan.');
  return null;
}

if (typeof window !== 'undefined') {
  createSupabaseClient();
}

export { supabaseClient };