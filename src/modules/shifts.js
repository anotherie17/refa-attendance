import { state } from '../state.js';
import { supabaseClient } from '../services/supabase.js';
import { updateHeroState, updateAbsenButtons } from '../utils/dom.js';

export async function loadShifts() {
  try {
    const { data, error } = await supabaseClient
      .from('shifts')
      .select('*')
      .order('jam_mulai');

    if (error) throw error;

    state.shifts = data;
    
    const select = document.getElementById('shiftSelect');
    if (!select) return;
    select.innerHTML = '<option value="">-- Pilih Shift --</option>';
    
    state.shifts.forEach(shift => {
      const jamMulai = shift.jam_mulai.slice(0, 5);
      const jamSelesai = shift.jam_selesai.slice(0, 5);
      const option = document.createElement('option');
      option.value = shift.id;
      option.textContent = shift.nama + ' (' + jamMulai + ' - ' + jamSelesai + ')';
      select.appendChild(option);
    });

    updateHeroState();

  } catch (err) {
    console.error('Error loading shifts:', err);
  }
}

export function onShiftChange() {
  state.selectedShiftId = document.getElementById('shiftSelect').value || null;
  updateAbsenButtons();
  updateHeroState();
}
