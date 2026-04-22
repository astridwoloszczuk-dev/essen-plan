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
let currentTab  = 'week'; // 'week' or 'wishlist'
let currentWeek = 0;
let meals   = new Map();
let ratings = new Map();
let wishes  = [];
let pendingWish = null; // { id, dish } set when editor clicks Use →

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

function timeAgo(isoStr) {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── DOM refs ─────────────────────────────────────────────────────────────────
const calendarEl     = document.getElementById('calendar');
const wishlistEl     = document.getElementById('wishlist');
const wishListEl     = document.getElementById('wish-list');
const wishInput      = document.getElementById('wish-input');
const wishNotesInput = document.getElementById('wish-notes-input');
const wishAddBtn     = document.getElementById('wish-add-btn');
const useBanner      = document.getElementById('use-banner');
const useDishName    = document.getElementById('use-dish-name');
const useCancelBtn   = document.getElementById('use-cancel-btn');
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
function switchTab(tabValue) {
  currentTab = tabValue === 'wishlist' ? 'wishlist' : 'week';
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tabValue)
  );
  if (currentTab === 'wishlist') {
    calendarEl.classList.add('hidden');
    wishlistEl.classList.remove('hidden');
    useBanner.classList.add('hidden');
  } else {
    currentWeek = Number(tabValue);
    calendarEl.classList.remove('hidden');
    wishlistEl.classList.add('hidden');
    renderCalendar();
  }
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ── Use banner ────────────────────────────────────────────────────────────────
useCancelBtn.addEventListener('click', () => {
  pendingWish = null;
  useBanner.classList.add('hidden');
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
function openMealModal(dateStr, mealType, existingMeal = null, prefillDish = null) {
  if (!currentUser) { showUserModal(); return; }

  editingKey = `${dateStr}-${mealType}`;
  const dayLabel  = formatDay(dateStr);
  const typeLabel = mealType === 'lunch' ? 'Lunch' : 'Dinner';
  modalTitle.textContent = `${typeLabel} · ${dayLabel}`;

  const editor = isEditor();

  editFields.classList.toggle('hidden', !editor);
  dishDisplay.classList.toggle('hidden', editor || !existingMeal);

  if (editor) {
    dishInput.value  = prefillDish || existingMeal?.dish  || '';
    notesInput.value = existingMeal?.notes || '';
    selectedStatus   = existingMeal?.cook_status || 'scratch';
    statusBtns.forEach(b => b.classList.toggle('active', b.dataset.status === selectedStatus));
    const existing_attendees = existingMeal?.attendees || [];
    attendBtns.forEach(b => b.classList.toggle('active', existing_attendees.includes(b.dataset.name)));
    guestInput.value = existingMeal?.guest_count || 0;
  } else {
    dishDisplay.textContent = existingMeal?.dish || '';
  }

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

    // If used from wishlist, delete the wish
    if (pendingWish) {
      await db.from('meal_wishes').delete().eq('id', pendingWish.id);
      pendingWish = null;
      useBanner.classList.add('hidden');
    }
  } else {
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
  if (existing) await db.from('meal_plan').delete().eq('id', existing.id);
  closeMealModal();
});

// ── Wishlist ──────────────────────────────────────────────────────────────────
async function loadWishes() {
  const { data, error } = await db.from('meal_wishes').select('*').order('created_at');
  if (error) { console.error(error); return; }
  wishes = data || [];
  if (currentTab === 'wishlist') renderWishlist();
}

function renderWishlist() {
  wishListEl.innerHTML = '';
  if (!wishes.length) {
    wishListEl.innerHTML = '<div class="wish-empty">No wishes yet — add one above!</div>';
    return;
  }
  wishes.forEach(w => {
    const card = document.createElement('div');
    card.className = 'wish-card';
    const canDelete = currentUser === w.suggested_by || isEditor();
    card.innerHTML = `
      <div class="wish-dish">${escapeHtml(w.dish)}</div>
      ${w.notes ? `<div class="wish-notes">${escapeHtml(w.notes)}</div>` : ''}
      <div class="wish-footer">
        <span class="wish-by">by ${escapeHtml(w.suggested_by || '?')} · ${timeAgo(w.created_at)}</span>
        ${isEditor() ? `<button class="wish-use-btn" data-id="${w.id}" data-dish="${escapeHtml(w.dish)}">Use →</button>` : ''}
        ${canDelete ? `<button class="wish-del-btn" data-id="${w.id}">✕</button>` : ''}
      </div>
    `;
    wishListEl.appendChild(card);
  });

  wishListEl.querySelectorAll('.wish-use-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      pendingWish = { id: btn.dataset.id, dish: btn.dataset.dish };
      useDishName.textContent = btn.dataset.dish;
      useBanner.classList.remove('hidden');
      switchTab('0'); // switch to This Week
    });
  });

  wishListEl.querySelectorAll('.wish-del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await db.from('meal_wishes').delete().eq('id', btn.dataset.id);
    });
  });
}

wishAddBtn.addEventListener('click', async () => {
  if (!currentUser) { showUserModal(); return; }
  const dish = wishInput.value.trim();
  if (!dish) return;
  await db.from('meal_wishes').insert({
    dish,
    notes: wishNotesInput.value.trim() || null,
    suggested_by: currentUser,
  });
  wishInput.value = '';
  wishNotesInput.value = '';
});

wishInput.addEventListener('keydown', e => e.key === 'Enter' && wishAddBtn.click());

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

      // When pendingWish active: only empty future slots are clickable (for placement)
      const wishPlacement = pendingWish && !meal && isEditor() && !past;
      const clickable = wishPlacement || (meal && currentUser) || (!meal && isEditor() && !past);
      const slot = document.createElement('div');
      slot.className = 'meal-slot' + (meal ? ' filled' : ' empty') + (clickable ? ' editable' : '');
      if (wishPlacement) slot.classList.add('wish-target');

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
          <span class="meal-empty">${isEditor() && !past ? (pendingWish ? '+ Place here' : '+ Add') : '—'}</span>
        `;
      }

      if (clickable) {
        slot.addEventListener('click', () =>
          openMealModal(dateStr, mealType, meal || null, wishPlacement ? pendingWish.dish : null)
        );
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

  ratings.clear();
  const mealIds = data.map(m => m.id);
  if (mealIds.length) {
    const { data: rData } = await db.from('meal_ratings').select('*').in('meal_id', mealIds);
    (rData || []).forEach(r => {
      if (!ratings.has(r.meal_id)) ratings.set(r.meal_id, new Map());
      ratings.get(r.meal_id).set(r.person_name, r.rating);
    });
  }

  if (currentTab === 'week') renderCalendar();
}

// ── Real-time ─────────────────────────────────────────────────────────────────
db.channel('essen_changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_plan' },    () => loadMeals())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_ratings' }, () => loadMeals())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_wishes' },  () => loadWishes())
  .subscribe();

// ── Init ──────────────────────────────────────────────────────────────────────
if (!currentUser) { showUserModal(); } else { userBadge.textContent = currentUser; }
loadMeals();
loadWishes();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
