// ── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://mezayharkjyvnnhvdlww.supabase.co';
const SUPABASE_ANON = 'sb_publishable_bw3Kcni9Yc88BWLp6G93Gg_HIGbqOKF';

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
  currentTab = ['wishlist', 'dishes'].includes(tabValue) ? tabValue : 'week';
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tabValue)
  );
  calendarEl.classList.toggle('hidden', currentTab !== 'week');
  wishlistEl.classList.toggle('hidden', currentTab !== 'wishlist');
  dishesEl.classList.toggle('hidden', currentTab !== 'dishes');
  if (currentTab === 'wishlist') {
    useBanner.classList.add('hidden');
  } else if (currentTab === 'dishes') {
    useBanner.classList.add('hidden');
    loadDishes();
  } else {
    currentWeek = Number(tabValue);
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
  const typeLabel = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' }[mealType] || mealType;
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
    const [dateStr, mealType] = editingKey.split(/-(?=breakfast|lunch|dinner)/);
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

// ── Gerichte: where a dish is defined (meal-draft addendum, 2 Oct 2026) ─────────
// Name · her recipe (photos / link) · what she needs · three ratings (Aufwand, vorkochbar or
// muss frisch, wer isst es nicht) · "mehr". meal_draft.py's `recipes` job reads new photos
// within ten minutes. Before migration 06 the recipe columns don't exist: the tab still works
// on the old columns and hides photos / chips with a one-line hint.
const dishesEl     = document.getElementById('dishes');
const dishListEl   = document.getElementById('dish-list');
const dishModal    = document.getElementById('dish-modal');
const dishIngsEl   = document.getElementById('dish-ings');
const dishFinish   = document.getElementById('dish-finish');
const dishNameEl   = document.getElementById('dish-name');
const dishUrlEl    = document.getElementById('dish-url');
const dishNotesEl  = document.getElementById('dish-notes');
const dishMethodEl = document.getElementById('dish-method');
const photoRowEl   = document.getElementById('dish-photos');
const uploadEl     = document.getElementById('dish-upload');
const recipeModal  = document.getElementById('recipe-modal');
const photoView    = document.getElementById('photo-view');
const BUCKET = 'recipes';
const PEOPLE = ['Astrid', 'Niko', 'Max', 'Alex', 'Vicky'];
const BAND_MIN = { schnell: 25, mittel: 45, lang: 75 };        // Aufwand -> active_min when no recipe time
const UNITS = ['g', 'kg', 'ml', 'l', 'Stk', 'Bund', 'Glas', 'Pkg', 'Flasche', 'Zehen', 'EL', 'TL', 'Prise', 'Dose'];
const MAX_PX = 1600;
let dishes = [];
let HAS_RECIPES = false;
// Batch cooking + the freezer + desserts (meal-draft addendum 2, 3 Oct 2026). One number per batch:
// portions, with the date. Before migration 07 (no `freezer` table, no `freezes` / `kind`) every
// freezer part is hidden behind one hint line.
let HAS_FREEZER = false;
let freezer = [];              // rows of the `freezer` table
let dishFilter = null;         // null | 'frz' | 'prep' | 'freeze' | 'dessert'
const KIND_LABEL = { hauptgericht: 'Hauptgericht', nachspeise: 'Nachspeise', beilage: 'Beilage' };
let editingDish = null;        // null = a new dish
let photos = [];               // storage paths in the open editor
let photoFolder = null;
let pendingUploads = [];
let holdsTouched = false;

function bandOf(min) { return (min || 0) <= 30 ? 'schnell' : (min || 0) <= 60 ? 'mittel' : 'lang'; }
function hasRecipe(d) { return !!(d && ((d.photos && d.photos.length) || d.method || d.recipe_url)); }
function photoUrl(path) { return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl; }
function dishKey(s) { return (s || '').replace(/^Reste:\s*/i, '').trim().toLowerCase(); }
function dishForMeal(name) {
  const k = dishKey(name);
  return dishes.find(d => dishKey(d.name) === k || (d.aliases || []).some(a => dishKey(a) === k)) || null;
}

async function loadDishes() {
  const { data, error } = await db.from('dishes').select('*').order('name');
  if (error) {
    dishListEl.innerHTML = '<div class="wish-empty">Die Gerichte-Liste ist noch nicht eingerichtet.</div>';
    return;
  }
  dishes = data || [];
  if (dishes.length) HAS_RECIPES = 'photos' in dishes[0];
  else HAS_RECIPES = !(await db.from('dishes').select('photos').limit(1)).error;
  const hasCols = dishes.length ? 'kind' in dishes[0] : !(await db.from('dishes').select('kind').limit(1)).error;
  HAS_FREEZER = hasCols && await loadFreezer();
  if (currentTab === 'dishes') renderDishes();
  if (currentTab === 'week') renderCalendar();
}

// ── the freezer ──
async function loadFreezer() {
  const { data, error } = await db.from('freezer').select('*').order('frozen_at');
  if (error) { freezer = []; return false; }
  freezer = data || [];
  return true;
}
function todayISO() { return toISODate(new Date()); }
function addMonthsISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const last = new Date(y, m - 1 + n + 1, 0).getDate();        // last day of the target month
  return toISODate(new Date(y, m - 1 + n, Math.min(d, last)));
}
function shortDate(iso) { const [, m, d] = iso.split('-').map(Number); return `${d}.${m}.`; }
function ageText(iso) {
  const days = Math.round((new Date(todayISO() + 'T12:00:00') - new Date(iso + 'T12:00:00')) / 86400000);
  if (days < 1) return 'heute';
  if (days < 14) return `${days} Tage`;
  if (days < 63) return `${Math.floor(days / 7)} Wochen`;
  return `${Math.floor(days / 30.4)} Monate`;
}
// meal-draft's rule: a planned batch counts as stock from the morning after its prep day
function isReal(r) { return r.portions > 0 && (!r.planned || r.frozen_at < todayISO()); }
function stockRows(d) { return freezer.filter(r => r.dish_id === d.id && r.portions > 0); }
function stockOf(d) {
  const rows = stockRows(d);
  if (!rows.length) return null;
  const real = rows.filter(isReal);
  const use = real.length ? real : rows;
  return { portions: use.reduce((s, r) => s + r.portions, 0), oldest: use[0].frozen_at, planned: !real.length };
}
function ageClass(iso) {
  const t = todayISO();
  return t >= addMonthsISO(iso, 4) ? ' old' : t >= addMonthsISO(iso, 3) ? ' aging' : '';
}
function stockTag(d, withAge) {
  const s = stockOf(d);
  if (!s) return '';
  const txt = s.planned
    ? `❄ ${s.portions} geplant · ${shortDate(s.oldest)}`
    : `❄ ${s.portions} Portionen · seit ${shortDate(s.oldest)}` + (withAge ? ` (${ageText(s.oldest)})` : '');
  return `<span class="frz-tag${s.planned ? '' : ageClass(s.oldest)}">${escapeHtml(txt)}</span>`;
}

function renderFilters() {
  const box = document.getElementById('dish-filters');
  const chips = HAS_FREEZER
    ? [['frz', '❄ Tiefkühler'], ['prep', 'vorkochbar'], ['freeze', 'einfrierbar'], ['dessert', 'Nachspeisen']]
    : [['prep', 'vorkochbar']];
  if (!chips.some(([k]) => k === dishFilter)) dishFilter = null;
  box.innerHTML = '';
  chips.forEach(([k, label]) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.classList.toggle('active', dishFilter === k);
    b.addEventListener('click', () => { dishFilter = dishFilter === k ? null : k; renderDishes(); });
    box.appendChild(b);
  });
  document.getElementById('dish-freezer-off').classList.toggle('hidden', HAS_FREEZER);
}

function renderDishes() {
  document.getElementById('dish-new').classList.toggle('hidden', !isEditor());
  renderFilters();
  let list = [...dishes].sort((a, b) => (a.reviewed - b.reviewed) || a.name.localeCompare(b.name, 'de'));
  if (dishFilter === 'frz') {
    // only dishes with stock, oldest first, with the age
    list = list.filter(d => stockOf(d)).sort((a, b) => stockOf(a).oldest.localeCompare(stockOf(b).oldest));
  } else if (dishFilter === 'prep') list = list.filter(d => d.preps_well);
  else if (dishFilter === 'freeze') list = list.filter(d => d.freezes);
  else if (dishFilter === 'dessert') list = list.filter(d => d.kind === 'nachspeise');
  dishListEl.innerHTML = list.length ? '' : '<div class="wish-empty">Nichts in dieser Auswahl.</div>';
  list.forEach(d => {
    const row = document.createElement('div');
    row.className = 'dish-row';
    const kind = d.kind && d.kind !== 'hauptgericht' ? KIND_LABEL[d.kind] : null;
    const tags = [
      bandOf(d.active_min),
      kind || (d.preps_well ? 'vorkochbar' : 'frisch'),
      (d.not_for || []).length ? `nicht: ${(d.not_for || []).join(', ')}` : null,
    ].filter(Boolean).join(' · ');
    const read = d.source === 'recipe' && !d.reviewed ? '<span class="dish-tag">aus dem Rezept gelesen – bitte ansehen</span>' : '';
    row.innerHTML = `<span class="dish-dot${d.reviewed ? ' done' : ''}"></span>
      <span class="dish-name">${hasRecipe(d) ? '📖 ' : ''}${escapeHtml(d.name)} ${read}${HAS_FREEZER ? stockTag(d, dishFilter === 'frz') : ''}</span>
      <span class="dish-meta">${escapeHtml(tags)}</span>`;
    row.addEventListener('click', () => (isEditor() ? openDish(d) : openRecipe(d)));
    dishListEl.appendChild(row);
  });
}

// The editor's freezer box: each batch with −1 / aufgebraucht, and "+ eingefroren". Writes at once
// (no Speichern needed) — the one number she keeps.
function renderFreezerBox() {
  const list = document.getElementById('dish-freezer-list');
  const add = document.getElementById('frz-new');
  list.innerHTML = '';
  if (!editingDish) {
    list.innerHTML = '<div class="dish-hint">Erst speichern, dann einfrieren.</div>';
    add.classList.add('hidden');
    document.getElementById('frz-form').classList.add('hidden');
    return;
  }
  add.classList.remove('hidden');
  stockRows(editingDish).forEach(r => {
    const row = document.createElement('div');
    row.className = 'frz-row';
    const label = isReal(r)
      ? `${r.portions} Portionen · seit ${shortDate(r.frozen_at)} (${ageText(r.frozen_at)})`
      : `${r.portions} Portionen geplant · Batch am ${shortDate(r.frozen_at)}`;
    row.innerHTML = `<span class="frz-label${isReal(r) ? ageClass(r.frozen_at) : ''}">❄ ${escapeHtml(label)}</span>
      <button data-a="minus">−1</button><button data-a="gone">aufgebraucht</button>`;
    row.querySelector('[data-a="minus"]').addEventListener('click', () => freezerWrite(
      r.portions <= 1 ? db.from('freezer').delete().eq('id', r.id)
        : db.from('freezer').update({ portions: r.portions - 1, planned: false, updated_at: new Date().toISOString() }).eq('id', r.id)));
    row.querySelector('[data-a="gone"]').addEventListener('click', () =>
      freezerWrite(db.from('freezer').delete().eq('id', r.id)));
    list.appendChild(row);
  });
}

async function freezerWrite(q) {
  const { error } = await q;
  if (error) { alert('Tiefkühler: das ging nicht – ' + error.message); return; }
  await loadFreezer();
  renderFreezerBox();
  if (currentTab === 'dishes') renderDishes();
}

document.getElementById('frz-new').addEventListener('click', () => {
  document.getElementById('frz-portions').value = 5;
  document.getElementById('frz-date').value = todayISO();
  document.getElementById('frz-form').classList.remove('hidden');
});
document.getElementById('frz-ok').addEventListener('click', async () => {
  const portions = parseInt(document.getElementById('frz-portions').value, 10);
  const frozen_at = document.getElementById('frz-date').value || todayISO();
  if (!editingDish || !(portions > 0)) return;
  document.getElementById('frz-form').classList.add('hidden');
  await freezerWrite(db.from('freezer').insert({ dish_id: editingDish.id, portions, frozen_at, planned: false }));
});

function fmtIng(x) {
  const q = x.qty ? String(x.qty).replace('.', ',') + ' ' : '';
  return `${q}${x.unit && x.qty ? x.unit + ' ' : ''}${x.item}`;
}

function parseIng(line, old) {
  const m = line.trim().match(/^([\d]+(?:[.,]\d+)?)?\s*([A-Za-zäöü]+)?\s+(.+)$/);
  let qty = null, unit = '', item = line.trim();
  if (m && m[1]) {
    qty = parseFloat(m[1].replace(',', '.'));
    if (m[2] && UNITS.map(u => u.toLowerCase()).includes(m[2].toLowerCase())) { unit = m[2]; item = m[3]; }
    else { unit = 'Stk'; item = ((m[2] || '') + ' ' + m[3]).trim(); }
  }
  // keep what the line can't show (keeps_days, base) from the same ingredient before the edit
  const prev = (old || []).find(o => o.item.toLowerCase() === item.toLowerCase()) || {};
  return { ...prev, item, qty: qty ?? prev.qty ?? 1, unit: unit || prev.unit || 'Stk' };
}

function ingRow(x) {
  const row = document.createElement('div');
  row.className = 'ing-row';
  row.innerHTML = `<input type="text" value="${escapeHtml(x ? fmtIng(x) : '')}" placeholder="z.B. 500 g Faschiertes" />
    <button class="ing-home${x && x.always_home ? ' active' : ''}" title="immer zu Hause">🏠</button>
    <button class="ing-del" title="entfernen">✕</button>`;
  row.querySelector('.ing-home').addEventListener('click', e => e.currentTarget.classList.toggle('active'));
  row.querySelector('.ing-del').addEventListener('click', () => row.remove());
  return row;
}

function setSeg(id, value) {
  document.querySelectorAll(`#${id} button`).forEach(b => b.classList.toggle('active', b.dataset.v === String(value)));
}
function segValue(id) {
  const b = document.querySelector(`#${id} button.active`);
  return b ? b.dataset.v : null;
}
['dish-effort', 'dish-preps', 'dish-holds', 'dish-freezes', 'dish-kind'].forEach(id =>
  document.querySelectorAll(`#${id} button`).forEach(b => b.addEventListener('click', () => {
    setSeg(id, b.dataset.v);
    if (id === 'dish-holds') holdsTouched = true;
    // "hält" defaults to the Vorkochbar answer until she sets it herself
    if (id === 'dish-preps' && !holdsTouched) setSeg('dish-holds', b.dataset.v);
  })));

function renderChips(selected) {
  const box = document.getElementById('dish-notfor');
  box.innerHTML = '';
  PEOPLE.forEach(n => {
    const b = document.createElement('button');
    b.textContent = n;
    b.classList.toggle('active', selected.includes(n));
    b.addEventListener('click', () => b.classList.toggle('active'));
    box.appendChild(b);
  });
}

function renderPhotos() {
  photoRowEl.innerHTML = '';
  photos.forEach((p, i) => {
    const t = document.createElement('div');
    t.className = 'photo-thumb';
    t.innerHTML = `<img src="${photoUrl(p)}" alt="Rezeptseite ${i + 1}" /><button title="entfernen">✕</button>`;
    t.querySelector('img').addEventListener('click', () => showPhoto(photoUrl(p)));
    t.querySelector('button').addEventListener('click', () => { photos.splice(i, 1); renderPhotos(); });
    photoRowEl.appendChild(t);
  });
}

function showPhoto(url) {
  document.getElementById('photo-view-img').src = url;
  photoView.classList.remove('hidden');
}
photoView.addEventListener('click', () => photoView.classList.add('hidden'));

// Downscale in the browser (<= 1600 px, JPEG) before upload — phone photos are 4–12 MB.
async function downscale(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_PX / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise(res => c.toBlob(res, 'image/jpeg', 0.85));
}

document.getElementById('dish-photo-input').addEventListener('change', e => {
  const files = [...e.target.files];
  e.target.value = '';
  if (!files.length) return;
  let done = 0, failed = 0;
  uploadEl.textContent = `Foto 1 von ${files.length} wird hochgeladen …`;
  const job = (async () => {
    for (const [i, f] of files.entries()) {
      uploadEl.textContent = `Foto ${i + 1} von ${files.length} wird hochgeladen …`;
      try {
        const blob = await downscale(f);
        const path = `${photoFolder}/${Date.now()}-${i}.jpg`;
        const { error } = await db.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
        if (error) throw error;
        photos.push(path); done++; renderPhotos();
      } catch (err) {
        failed++; console.error(err);
      }
    }
    uploadEl.textContent = failed
      ? `${failed} Foto(s) nicht hochgeladen – das Gericht lässt sich trotzdem speichern.`
      : `${done} Foto(s) hochgeladen – das Rezept wird in ein paar Minuten gelesen.`;
  })();
  pendingUploads.push(job);
});

function openDish(d) {
  if (!isEditor()) return;
  editingDish = d || null;
  d = d || { name: '', ingredients: [], active_min: BAND_MIN.mittel, preps_well: true, holds: true, not_for: [], photos: [],
             freezes: false, kind: 'hauptgericht' };
  photos = [...(d.photos || [])];
  photoFolder = d.id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
  pendingUploads = [];
  holdsTouched = !!editingDish;               // an existing dish keeps its own "hält"
  dishNameEl.value = d.name || '';
  dishUrlEl.value = d.recipe_url || '';
  dishNotesEl.value = d.notes || '';
  dishMethodEl.value = d.method || '';
  uploadEl.textContent = '';
  const note = d.source === 'recipe' && !d.reviewed ? 'Aus dem Rezept gelesen – bitte ansehen und speichern.' : '';
  const readNote = [note, d.recipe_note].filter(Boolean).join(' · ');
  const rn = document.getElementById('dish-readnote');
  rn.textContent = readNote; rn.classList.toggle('hidden', !readNote);
  document.getElementById('dish-recipe-box').classList.toggle('hidden', !HAS_RECIPES);
  document.getElementById('dish-recipe-off').classList.toggle('hidden', HAS_RECIPES);
  document.getElementById('dish-notfor-box').classList.toggle('hidden', !HAS_RECIPES);
  document.getElementById('dish-method-box').classList.toggle('hidden', !HAS_RECIPES);
  ['dish-freezes', 'dish-kind-box', 'dish-freezer-box'].forEach(id =>
    document.getElementById(id).classList.toggle('hidden', !HAS_FREEZER));
  document.getElementById('dish-freezer-off-ed').classList.toggle('hidden', HAS_FREEZER);
  setSeg('dish-freezes', !!d.freezes);
  setSeg('dish-kind', d.kind || 'hauptgericht');
  document.getElementById('frz-form').classList.add('hidden');
  if (HAS_FREEZER) renderFreezerBox();
  renderPhotos();
  renderChips(d.not_for || []);
  setSeg('dish-effort', bandOf(d.active_min));
  setSeg('dish-preps', !!d.preps_well);
  setSeg('dish-holds', !!d.holds);
  dishFinish.value = d.finish_min ?? '';
  dishIngsEl.innerHTML = '';
  (d.ingredients || []).forEach(x => dishIngsEl.appendChild(ingRow(x)));
  if (!(d.ingredients || []).length) dishIngsEl.appendChild(ingRow(null));
  recipeModal.classList.add('hidden');
  dishModal.classList.remove('hidden');
  if (!editingDish) dishNameEl.focus();
}

document.getElementById('dish-new').addEventListener('click', () => openDish(null));
document.getElementById('dish-add-ing').addEventListener('click', () => {
  const r = ingRow(null);
  dishIngsEl.appendChild(r);
  r.querySelector('input').focus();
});
document.getElementById('dish-cancel').addEventListener('click', () => dishModal.classList.add('hidden'));
dishModal.addEventListener('click', e => { if (e.target === dishModal) dishModal.classList.add('hidden'); });

document.getElementById('dish-save').addEventListener('click', async () => {
  const d = editingDish || {};
  const name = dishNameEl.value.trim();
  if (!name) { dishNameEl.focus(); return; }
  const saveBtn = document.getElementById('dish-save');
  saveBtn.disabled = true;
  // wait for photos still uploading — a failed upload never blocks the save
  await Promise.allSettled(pendingUploads);
  const ingredients = [...dishIngsEl.querySelectorAll('.ing-row')]
    .map(r => ({ line: r.querySelector('input').value, home: r.querySelector('.ing-home').classList.contains('active') }))
    .filter(x => x.line.trim())
    .map(x => ({ ...parseIng(x.line, d.ingredients), always_home: x.home }));
  const band = segValue('dish-effort') || 'mittel';
  const patch = {
    name,
    // the rating only rewrites the minutes when it moves the dish into another band
    active_min: editingDish && bandOf(d.active_min) === band ? d.active_min : BAND_MIN[band],
    preps_well: segValue('dish-preps') === 'true',
    holds: segValue('dish-holds') === 'true',
    finish_min: dishFinish.value === '' ? null : parseInt(dishFinish.value, 10),
    ingredients,
    notes: dishNotesEl.value.trim() || null,
    reviewed: true,
    updated_at: new Date().toISOString(),
  };
  if (HAS_RECIPES) {
    const url = dishUrlEl.value.trim() || null;
    const recipeChanged = JSON.stringify(photos) !== JSON.stringify(d.photos || []) || url !== (d.recipe_url || null);
    const listChanged = JSON.stringify(ingredients) !== JSON.stringify(d.ingredients || []);
    Object.assign(patch, {
      photos, recipe_url: url,
      not_for: [...document.querySelectorAll('#dish-notfor button.active')].map(b => b.textContent),
      method: dishMethodEl.value.trim() || null,
      source: listChanged ? 'own' : (d.source || 'own'),
    });
    if (recipeChanged) Object.assign(patch, { recipe_read_at: null, recipe_attempts: 0, recipe_note: null });
    if (HAS_FREEZER) Object.assign(patch, {
      freezes: segValue('dish-freezes') === 'true',
      kind: segValue('dish-kind') || 'hauptgericht',
    });
    // New photos and no lines typed yet: leave it unchecked so the reader may fill the list.
    if (recipeChanged && (photos.length || url) && !ingredients.length) patch.reviewed = false;
  }
  const q = editingDish
    ? db.from('dishes').update(patch).eq('id', d.id)
    : db.from('dishes').insert({ ...patch, aliases: [] });
  const { error } = await q;
  saveBtn.disabled = false;
  if (error) { alert('Speichern ging nicht: ' + error.message); return; }
  const removed = (d.photos || []).filter(p => !photos.includes(p));
  if (removed.length) db.storage.from(BUCKET).remove(removed).catch(() => {});   // tidy, best effort
  dishModal.classList.add('hidden');
  await loadDishes();
});

// ── Recipe view: 📖 in the week, the prep block's link (?gericht=<id>), the list ──
let viewingDish = null;
function openRecipe(d) {
  if (!d) return;
  viewingDish = d;
  document.getElementById('recipe-title').textContent = d.name;
  const ph = document.getElementById('recipe-photos');
  ph.innerHTML = '';
  (d.photos || []).forEach(p => {
    const img = document.createElement('img');
    img.src = photoUrl(p); img.alt = d.name;
    img.addEventListener('click', () => showPhoto(img.src));
    ph.appendChild(img);
  });
  const a = document.getElementById('recipe-url');
  a.href = d.recipe_url || '#'; a.classList.toggle('hidden', !d.recipe_url);
  document.getElementById('recipe-ings').innerHTML = (d.ingredients || [])
    .map(x => `<li class="${x.always_home ? 'home' : ''}">${escapeHtml(fmtIng(x))}${x.always_home ? ' 🏠' : ''}</li>`).join('')
    || '<li>noch keine Zutaten</li>';
  document.getElementById('recipe-method').textContent = d.method || '';
  document.getElementById('recipe-method-box').classList.toggle('hidden', !d.method);
  document.getElementById('recipe-edit').classList.toggle('hidden', !isEditor());
  recipeModal.classList.remove('hidden');
}
document.getElementById('recipe-close').addEventListener('click', () => recipeModal.classList.add('hidden'));
document.getElementById('recipe-edit').addEventListener('click', () => openDish(viewingDish));
recipeModal.addEventListener('click', e => { if (e.target === recipeModal) recipeModal.classList.add('hidden'); });

// ?gericht=<id> opens that recipe directly (the link in the 🍳 prep block)
async function openFromUrl() {
  const id = new URLSearchParams(location.search).get('gericht');
  if (!id) return;
  let d = dishes.find(x => String(x.id) === id);
  if (!d) {
    const { data } = await db.from('dishes').select('*').eq('id', id).maybeSingle();
    d = data;
  }
  if (d) openRecipe(d);
}

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

    ['breakfast', 'lunch', 'dinner'].forEach(mealType => {
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
          <span class="meal-type-label">${({ breakfast: '🥐', lunch: '☀️', dinner: '🌙' })[mealType]}</span>
          <span class="meal-name">${escapeHtml(meal.dish)}</span>
          ${ratingsSummary ? `<span class="meal-stars">${escapeHtml(ratingsSummary)}</span>` : ''}
          ${meal.notes ? `<span class="meal-notes-dot" title="${escapeHtml(meal.notes)}">📝</span>` : ''}
          ${hasRecipe(dishForMeal(meal.dish)) ? `<span class="meal-recipe" title="Rezept">📖</span>` : ''}
          ${attendSummary ? `<span class="meal-attend">${escapeHtml(attendSummary)}</span>` : ''}
          <span class="meal-status">${cs.emoji}</span>
        `;
      } else {
        slot.innerHTML = `
          <span class="meal-type-label">${({ breakfast: '🥐', lunch: '☀️', dinner: '🌙' })[mealType]}</span>
          <span class="meal-empty">${isEditor() && !past ? (pendingWish ? '+ Place here' : '+ Add') : '—'}</span>
        `;
      }

      const rec = meal ? slot.querySelector('.meal-recipe') : null;
      if (rec) rec.addEventListener('click', e => { e.stopPropagation(); openRecipe(dishForMeal(meal.dish)); });

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
  .on('postgres_changes', { event: '*', schema: 'public', table: 'dishes' },       () => loadDishes())
  .on('postgres_changes', { event: '*', schema: 'public', table: 'freezer' },      () => loadFreezer().then(() => {
    if (currentTab === 'dishes') renderDishes();
    if (!dishModal.classList.contains('hidden') && HAS_FREEZER) renderFreezerBox();
  }))
  .subscribe();

// ── Init ──────────────────────────────────────────────────────────────────────
if (!currentUser) { showUserModal(); } else { userBadge.textContent = currentUser; }
// ?woche=-1|0|1 opens Last / This / Next Week (the link in James's Thursday draft message, 9 Oct 2026)
{ const w = new URLSearchParams(location.search).get('woche'); if (['-1', '0', '1'].includes(w)) switchTab(w); }
loadMeals();
loadWishes();
loadDishes().then(openFromUrl);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
