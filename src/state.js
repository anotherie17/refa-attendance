// ===== STATE GLOBAL =====
export const state = {
  currentUser: null,
  currentEmployee: null,
  locationOk: false,
  currentLat: null,
  currentLng: null,
  photoData: null,
  stream: null,
  shifts: [],
  selectedShiftId: null,
  todayAttendance: null,
  isSubmitting: false,
  modalResolve: null,
  editingEmployeeId: null,
  trenMode: 'semua',
  trenChartInstance: null,
  greetingBag: null,
  greetingTimer: null,
  greetingHideTimer: null
};