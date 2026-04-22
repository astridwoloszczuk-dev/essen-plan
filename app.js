// ── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://mezayharkjyvnnhvdlww.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lemF5aGFya2p5dm5uaHZkbHd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwOTE2ODQsImV4cCI6MjA5MTY2NzY4NH0.GlyIlgobMa0lVjEhH59-Zu1mt3f_usAipFNsg0bJSqE';

const EDITORS = ['Astrid', 'Niko'];

const COOK_STATUS = {
  scratch:     { label: 'Cooking',    emoji: '👩‍🍳' },
  defrost:     { label: 'Defrosting', emoji: '❄️'  },
  soulkitchen: { label: 'Soulkitchen',emoji: '🥡'  },
  eating_out:  { label: 'Eating out', emoji: '🍴'  },
};

// ── Supabase ─────────────────────────────────────────────────────────────────
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── State ────────────────────────────────────────────────────────────────────
let currentUser = localStorage.getItem('essen_user') || null;
let meals = new Map(); // "YYYY-MM-DD-lunch/dinner" → meal object

// ── Helpers ──────────────────────────────────────────────────────────────────
function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toISODate(date) {
  return date.toISOString().split('T')[0];
}

function formatDay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric', month: 'short' });
}

function isToday(dateStr) {
  return dateStr === toISODate(new Date());
}

function isPast(dateStr) {
  return dateStr < toISODate(new Date());
}

function isEditor() {
  return EDITORS.includes(currentUser);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── DOM refs ─────────────────────────────────────────────────────────────────
const calendarEl  = document.getElementById('calendar');
const userBadge   = document.getElementById('user-badge');
const userModal   = document.getElementById('user-modal');
const userNameEl  = document.getElementById('user-name-input');
const userSaveBtn = document.getElementById('user-save-btn');
const mealModal   = document.getElementById('meal-modal');
const modalTitle  = document.getElementById('modal-title');
const dishInput   = document.getElementById('dish-input');
const notesInput  = document.getElementById('notes-input');
const saveBtn     = document.getElementById('modal-save-btn');
const deleteBtn   = document.getElementById('modal-delete-btn');
const cancelBtn   = document.getElementById('modal-cancel-btn');
const statusBtns  = document.querySelectorAll('.status-btn');

let editingKey = null; // "YYYY-MM-DD-lunch" or "YYYY-MM-DD-dinner"

// ── User setup ────────────────────────────────────────────────────────────────
function showUserModal() { userModal.classList.remove('hidden'); userNameEl.focus(); }
function saveUser() {
  const val = userNameEl.value.trim();
  if (!val) return;
  currentUser = val;
  localStorage.setItem('essen_user', val);
  userModal.classList.add('hidden');
  userBadge.textContent = val;
  renderCalendar();
}
userSaveBtn.addEventListener('click', saveUser);
userNameEl.addEventListener('keydown', e => e.key === 'Enter' && saveUser());
userBadge.addEventListener('click', () => { userNameEl.value = currentUser || ''; showUserModal(); });

document.querySelectorAll('.modal-name-btn').forEach(btn => {
  btn.addEventListener('click', () => { userNameEl.value = btn.textContent; userSaveBtn.click(); });
});

// ── Meal modal ────────────────────────────────────────────────────────────────
let selectedStatus = 'scratch';

statusBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    selectedStatus = btn.dataset.status;
    statusBtns.forEach(b => b.classList.toggle('active', b.dataset.status === selectedStatus));
  });
});

function openMealModal(dateStr, mealType, existingMeal = null) {
  if (!isEditor()) return;
  editingKey = `${dateStr}-${mealType}`;
  const dayLabel = formatDay(dateStr);
  const typeLabel = mealType === 'lunch' ? 'Lunch' : 'Dinner';
  modalTitle.textContent = `${typeLabel} · ${dayLabel}`;

  dishInput.value  = existingMeal?.dish  || '';
  notesInput.value = existingMeal?.notes || '';
  selectedStatus   = existingMeal?.cook_status || 'scratch';
  statusBtns.forEach(b => b.classList.toggle('active', b.dataset.status === selectedStatus));
  deleteBtn.classList.toggle('hidden', !existingMeal);

  mealModal.classList.remove('hidden');
  dishInput.focus();
}

function closeMealModal() {
  mealModal.classList.add('hidden');
  editingKey = null;
}

cancelBtn.addEventListener('click', closeMealModal);
mealModal.addEventListener('click', e => { if (e.target === mealModal) closeMealModal(); });

saveBtn.addEventListener('click', async () => {
  const dish = dishInput.value.trim();
  if (!dish) return;
  const [dateStr, mealType] = editingKey.split(/-(?=lunch|dinner)/);
  const existing = meals.get(editingKey);

  if (existing) {
    await db.from('meal_plan').update({
      dish, notes: notesInput.value.trim() || null,
      cook_status: selectedStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', existing.id);
  } else {
    await db.from('meal_plan').insert({
      date: dateStr, meal_type: mealType,
      dish, notes: notesInput.value.trim() || null,
      cook_status: selectedStatus,
      added_by: currentUser,
    });
  }
  closeMealModal();
});

dishInput.addEventListener('keydown', e => e.key === 'Enter' && saveBtn.click());

deleteBtn.addEventListener('click', async () => {
  const existing = meals.get(editingKey);
  if (existing) {
    await db.from('meal_plan').delete().eq('id', existing.id);
  }
  closeMealModal();
});

// ── Render calendar ───────────────────────────────────────────────────────────
function renderCalendar() {
  calendarEl.innerHTML = '';
  const today    = new Date();
  const monday   = mondayOf(today);

  for (let w = 0; w < 2; w++) {
    const weekStart = addDays(monday, w * 7);
    const weekLabel = w === 0 ? 'This week' : 'Next week';

    const weekHeader = document.createElement('div');
    weekHeader.className = 'week-header';
    weekHeader.textContent = weekLabel;
    calendarEl.appendChild(weekHeader);

    for (let d = 0; d < 7; d++) {
      const date    = addDays(weekStart, d);
      const dateStr = toISODate(date);
      const past    = isPast(dateStr);
      const today_  = isToday(dateStr);

      const dayEl = document.createElement('div');
      dayEl.className = 'day' + (today_ ? ' today' : '') + (past ? ' past' : '');

      const dayLabel = document.createElement('div');
      dayLabel.className = 'day-label';
      dayLabel.textContent = formatDay(dateStr);
      dayEl.appendChild(dayLabel);

      ['lunch', 'dinner'].forEach(mealType => {
        const key  = `${dateStr}-${mealType}`;
        const meal = meals.get(key);
        const slot = document.createElement('div');
        slot.className = 'meal-slot' + (meal ? ' filled' : ' empty') + (isEditor() && !past ? ' editable' : '');
        slot.dataset.date = dateStr;
        slot.dataset.type = mealType;

        if (meal) {
          const cs = COOK_STATUS[meal.cook_status] || COOK_STATUS.scratch;
          slot.innerHTML = `
            <span class="meal-type-label">${mealType === 'lunch' ? '☀️' : '🌙'}</span>
            <span class="meal-name">${escapeHtml(meal.dish)}</span>
            <span class="meal-status">${cs.emoji}</span>
          `;
        } else {
          slot.innerHTML = `
            <span class="meal-type-label">${mealType === 'lunch' ? '☀️' : '🌙'}</span>
            <span class="meal-empty">${isEditor() && !past ? '+ Add' : '—'}</span>
          `;
        }

        if (isEditor() && !past) {
          slot.addEventListener('click', () => openMealModal(dateStr, mealType, meal || null));
        }

        dayEl.appendChild(slot);
      });

      calendarEl.appendChild(dayEl);
    }
  }
}

// ── Load ──────────────────────────────────────────────────────────────────────
async function loadMeals() {
  const today   = toISODate(new Date());
  const monday  = toISODate(mondayOf(new Date()));
  const endDate = toISODate(addDays(mondayOf(new Date()), 13));

  const { data, error } = await db
    .from('meal_plan')
    .select('*')
    .gte('date', monday)
    .lte('date', endDate)
    .order('date')
    .order('meal_type');

  if (error) { console.error(error); return; }
  meals.clear();
  data.forEach(m => meals.set(`${m.date}-${m.meal_type}`, m));
  renderCalendar();
}

// ── Real-time ─────────────────────────────────────────────────────────────────
db.channel('meal_plan')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_plan' }, () => {
    loadMeals();
  })
  .subscribe();

// ── Init ──────────────────────────────────────────────────────────────────────
if (!currentUser) { showUserModal(); } else { userBadge.textContent = currentUser; }
loadMeals();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
