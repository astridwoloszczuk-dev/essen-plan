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
let currentWeek = 0; // 0 = this week, 1 = next week
let meals   = new Map(); // "YYYY-MM-DD-lunch/dinner" → meal object
let ratings = new Map(); // meal_id → Map(person_name → rating)

// ── Helpers ──────────────────────────────────────────────────────────────────
function mondayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric', month: 'short' });
}

function isToday(dateStr)   { return dateStr === toISODate(new Date()); }
function isPast(dateStr)    { return dateStr < toISODate(new Date()); }
function isEditor()         { return EDITORS.includes(currentUser); }
function isWeekend(dateStr) { const d = new Date(dateStr + 'T12:00:00'); return d.getDay() === 0 || d.getDay() === 6; }

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── DOM refs ─────────────────────────────────────────────────────────────────
const calendarEl     = document.getElementById('calendar');
const userBadge      = document.getElementById('user-badge');
const userModal      = document.getElementById('user-modal');
const userNameEl     = document.getElementById('user-name-input');
const userSaveBtn    = document.getElementById('user-save-btn');
const mealModal      = document.getElementById('meal-modal');
const modalTitle     = document.getElementById('modal-title');
const dishDisplay    = document.getElementById('meal-dish-display');
const editFields     = document.getElementById('edit-fields');
const dishInput      = document.getElementById('dish-input');
const notesInput     = document.getElementById('notes-input');
const saveBtn        = document.getElementById('modal-save-btn');
const deleteBtn      = document.getElementById('modal-delete-btn');
const cancelBtn      = document.getElementById('modal-cancel-btn');
const statusBtns     = document.querySelectorAll('.status-btn');
const attendBtns     = document.querySelectorAll('.attend-btn');
const guestInput     = document.getElementById('guest-count');
const starEls        = document.querySelectorAll('#star-input .star');

let editingKey     = null;
let selectedStatus = 'scratch';
let selectedRating = null;

// ── Status buttons ────────────────────────────────────────────────────────────
statusBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    selectedStatus = btn.dataset.status;
    statusBtns.forEach(b => b.classList.toggle('active', b.dataset.status === selectedStatus));
  });
});

// ── Attend buttons ────────────────────────────────────────────────────────────
attendBtns.forEach(btn => {
  btn.addEventListener('click', () => btn.classList.toggle('active'));
});

// ── Star rating ───────────────────────────────────────────────────────────────
function setStars(val) {
  selectedRating = val || null;
  starEls.forEach(s => s.classList.toggle('on', Number(s.dataset.v) <= (val || 0)));
}

starEls.forEach(s => {
  s.addEventListener('click', () => {
    const v = Number(s.dataset.v);
    setStars(selectedRating === v ? 0 : v);
  });
});

// ── Tabs ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentWeek = Number(btn.dataset.week);
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
    renderCalendar();
  });
});

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
function openMealModal(dateStr, mealType, existingMeal = null) {
  if (!currentUser) { showUserModal(); return; }

  editingKey = `${dateStr}-${mealType}`;
  const dayLabel  = formatDay(dateStr);
  const typeLabel = mealType === 'lunch' ? 'Lunch' : 'Dinner';
  modalTitle.textContent = `${typeLabel} · ${dayLabel}`;

  const editor = isEditor();

  // Edit fields: editors only
  editFields.classList.toggle('hidden', !editor);
  dishDisplay.classList.toggle('hidden', editor || !existingMeal);

  if (editor) {
    dishInput.value  = existingMeal?.dish  || '';
    notesInput.value = existingMeal?.notes || '';
    selectedStatus   = existingMeal?.cook_status || 'scratch';
    statusBtns.forEach(b => b.classList.toggle('active', b.dataset.status === selectedStatus));
    const existing_attendees = existingMeal?.attendees || [];
    attendBtns.forEach(b => b.classList.toggle('active', existing_attendees.includes(b.dataset.name)));
    guestInput.value = existingMeal?.guest_count || 0;
  } else {
    dishDisplay.textContent = existingMeal?.dish || '';
  }

  // Rating: current user's own rating
  const mealRatings = existingMeal ? ratings.get(existingMeal.id) : null;
  setStars(mealRatings?.get(currentUser) || 0);

  deleteBtn.classList.toggle('hidden', !editor || !existingMeal);
  saveBtn.textContent = editor ? 'Save' : 'Rate';

  mealModal.classList.remove('hidden');
  if (editor) dishInput.focus();
}

function closeMealModal() {
  mealModal.classList.add('hidden');
  editingKey = null;
}

cancelBtn.addEventListener('click', closeMealModal);
mealModal.addEventListener('click', e => { if (e.target === mealModal) closeMealModal(); });

saveBtn.addEventListener('click', async () => {
  const existing = meals.get(editingKey);
  const editor   = isEditor();

  if (editor) {
    const dish = dishInput.value.trim();
    if (!dish) return;
    const [dateStr, mealType] = editingKey.split(/-(?=lunch|dinner)/);
    const attendees   = [...attendBtns].filter(b => b.classList.contains('active')).map(b => b.dataset.name);
    const guest_count = parseInt(guestInput.value) || 0;

    let mealId;
    if (existing) {
      await db.from('meal_plan').update({
        dish, notes: notesInput.value.trim() || null,
        cook_status: selectedStatus,
        attendees, guest_count,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
      mealId = existing.id;
    } else {
      const { data: inserted } = await db.from('meal_plan').insert({
        date: dateStr, meal_type: mealType,
        dish, notes: notesInput.value.trim() || null,
        cook_status: selectedStatus,
        attendees, guest_count,
        added_by: currentUser,
      }).select('id').single();
      mealId = inserted?.id;
    }

    if (mealId) await saveRating(mealId);
  } else {
    // Non-editor: rating only
    if (existing) await saveRating(existing.id);
  }

  closeMealModal();
});

async function saveRating(mealId) {
  if (selectedRating) {
    await db.from('meal_ratings').upsert({ meal_id: mealId, person_name: currentUser, rating: selectedRating });
  } else {
    await db.from('meal_ratings').delete().eq('meal_id', mealId).eq('person_name', currentUser);
  }
}

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
  const today     = new Date();
  const monday    = mondayOf(today);
  const weekStart = addDays(monday, currentWeek * 7);

  for (let d = 0; d < 7; d++) {
      const date    = addDays(weekStart, d);
      const dateStr = toISODate(date);
      const past    = isPast(dateStr);
      const today_  = isToday(dateStr);
      const weekend = isWeekend(dateStr);

      const dayEl = document.createElement('div');
      dayEl.className = 'day' + (today_ ? ' today' : '') + (past ? ' past' : '') + (weekend ? ' weekend' : '');

      const dayLabel = document.createElement('div');
      dayLabel.className = 'day-label';
      dayLabel.textContent = formatDay(dateStr);
      dayEl.appendChild(dayLabel);

      ['lunch', 'dinner'].forEach(mealType => {
        const key  = `${dateStr}-${mealType}`;
        const meal = meals.get(key);

        // Filled meals: anyone with a name can click (to rate)
        // Empty future meals: editors only
        const clickable = (meal && currentUser) || (!meal && isEditor() && !past);
        const slot = document.createElement('div');
        slot.className = 'meal-slot' + (meal ? ' filled' : ' empty') + (clickable ? ' editable' : '');

        if (meal) {
          const cs = COOK_STATUS[meal.cook_status] || COOK_STATUS.scratch;
          const attendSummary = (() => {
            const names  = meal.attendees?.length ? meal.attendees.map(n => n.slice(0,2)).join(' ') : '';
            const guests = meal.guest_count > 0 ? `+${meal.guest_count}` : '';
            return (names || guests) ? `${names}${names && guests ? ' ' : ''}${guests}` : '';
          })();
          const mealRatings = ratings.get(meal.id);
          const ratingsSummary = mealRatings?.size
            ? [...mealRatings.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([p, r]) => `${p.slice(0,2)}${'★'.repeat(r)}`)
                .join(' ')
            : '';

          slot.innerHTML = `
            <span class="meal-type-label">${mealType === 'lunch' ? '☀️' : '🌙'}</span>
            <span class="meal-name">${escapeHtml(meal.dish)}</span>
            ${ratingsSummary ? `<span class="meal-stars">${escapeHtml(ratingsSummary)}</span>` : ''}
            ${meal.notes ? `<span class="meal-notes-dot" title="${escapeHtml(meal.notes)}">📝</span>` : ''}
            ${attendSummary ? `<span class="meal-attend">${escapeHtml(attendSummary)}</span>` : ''}
            <span class="meal-status">${cs.emoji}</span>
          `;
        } else {
          slot.innerHTML = `
            <span class="meal-type-label">${mealType === 'lunch' ? '☀️' : '🌙'}</span>
            <span class="meal-empty">${isEditor() && !past ? '+ Add' : '—'}</span>
          `;
        }

        if (clickable) {
          slot.addEventListener('click', () => openMealModal(dateStr, mealType, meal || null));
        }

        dayEl.appendChild(slot);
      });

      calendarEl.appendChild(dayEl);
  }
}

// ── Load ──────────────────────────────────────────────────────────────────────
async function loadMeals() {
  const monday  = toISODate(addDays(mondayOf(new Date()), -7));
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

  // Load ratings for visible meals
  ratings.clear();
  const mealIds = data.map(m => m.id);
  if (mealIds.length) {
    const { data: rData } = await db.from('meal_ratings').select('*').in('meal_id', mealIds);
    (rData || []).forEach(r => {
      if (!ratings.has(r.meal_id)) ratings.set(r.meal_id, new Map());
      ratings.get(r.meal_id).set(r.person_name, r.rating);
    });
  }

  renderCalendar();
}

// ── Real-time ─────────────────────────────────────────────────────────────────
db.channel('meal_plan_changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_plan' }, () => loadMeals())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_ratings' }, () => loadMeals())
  .subscribe();

// ── Init ──────────────────────────────────────────────────────────────────────
if (!currentUser) { showUserModal(); } else { userBadge.textContent = currentUser; }
loadMeals();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
