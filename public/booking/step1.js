(() => {
  const MONTH_FORMATTER = new Intl.DateTimeFormat('el-GR', { month: 'long', year: 'numeric' });
  const HUMAN_FORMATTER = new Intl.DateTimeFormat('el-GR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const MIN_MONTH = startOfMonth(new Date());
  const MAX_MONTH = startOfMonth(new Date(new Date().getFullYear(), new Date().getMonth() + 11, 1));

  const dom = {
    root: document.getElementById('step1Root'),
    tripTitle: document.getElementById('tripTitle'),
    tripSubtitle: document.getElementById('tripSubtitle'),
    priceLine: document.getElementById('priceLine'),
    headError: document.getElementById('headError'),
    monthLabel: document.getElementById('monthLabel'),
    prevMonth: document.getElementById('prevMonth'),
    nextMonth: document.getElementById('nextMonth'),
    calendarGrid: document.getElementById('calendarGrid'),
    availabilityNote: document.getElementById('availabilityNote'),
    selectedDateLabel: document.getElementById('selectedDateLabel'),
    selectedAvailability: document.getElementById('selectedAvailability'),
    continueBtn: document.getElementById('continueBtn'),
    backBtn: document.getElementById('backToTrip')
  };

  const state = {
    tripParam: '',
    modeParam: '',
    trip: null,
    tripSlug: '',
    modeKey: '',
    modeBlock: null,
    selectedDate: '',
    monthCursor: MIN_MONTH,
    availabilityByMonth: new Map(),
    availabilityByDate: new Map(),
    loadingMonths: new Set()
  };

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    const params = new URLSearchParams(window.location.search);
    state.tripParam = safeValue(params.get('trip'));
    state.modeParam = safeValue(params.get('mode'));
    if (!state.tripParam || !state.modeParam) {
      renderFatal('Χρειαζόμαστε ταξίδι και mode για να συνεχίσουμε. Δοκίμασε ξανά από την εκδρομή.');
      return;
    }
    dom.root.dataset.state = 'loading';
    try {
      state.trip = await fetchTripFlexible(state.tripParam);
    } catch (err) {
      console.error('[step1] trip fetch failed', err);
      renderFatal('Δεν βρήκαμε αυτή την εκδρομή. Επιστρέψτε στη λίστα και δοκιμάστε ξανά.');
      return;
    }
    state.tripSlug = state.trip && state.trip.slug ? state.trip.slug : sanitizeSlug(state.tripParam);
    const modeInfo = pickMode(state.trip, state.modeParam);
    state.modeKey = modeInfo.key;
    state.modeBlock = modeInfo.data || {};
    if (!state.tripSlug) state.tripSlug = state.trip.id || state.tripParam;
    hydrateHeader();
    persistTripSession();
    attachHandlers();
    try {
      await ensureMonthLoaded(state.monthCursor);
    } catch (err) {
      console.error('[step1] availability fetch failed', err);
      dom.availabilityNote.textContent = 'Δεν ήταν δυνατή η φόρτωση διαθεσιμότητας. Προσπάθησε ξανά.';
    }
    dom.root.dataset.state = 'ready';
    renderCalendar();
  }

  function attachHandlers() {
    dom.prevMonth?.addEventListener('click', () => shiftMonth(-1));
    dom.nextMonth?.addEventListener('click', () => shiftMonth(1));
    dom.continueBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      if (!state.selectedDate) return;
      try { sessionStorage.setItem('gw_trip_date', state.selectedDate); } catch (_) {}
      const queryValue = state.tripSlug || state.tripParam;
      const search = new URLSearchParams({
        trip: queryValue,
        id: queryValue,
        mode: state.modeKey,
        date: state.selectedDate
      });
      window.location.assign(`/booking/step2?${search.toString()}`);
    });
    dom.backBtn?.addEventListener('click', () => {
      if (document.referrer) {
        history.back();
        return;
      }
      const slug = state.tripSlug ? `/trip.html?trip=${encodeURIComponent(state.tripSlug)}&mode=${encodeURIComponent(state.modeKey)}` : '/trip.html';
      window.location.assign(slug);
    });
  }

  function shiftMonth(step) {
    const next = startOfMonth(new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + step, 1));
    if (next < MIN_MONTH || next > MAX_MONTH) return;
    state.monthCursor = next;
    ensureMonthLoaded(next).finally(() => renderCalendar());
  }

  function renderCalendar() {
    dom.monthLabel.textContent = capitalize(MONTH_FORMATTER.format(state.monthCursor));
    dom.prevMonth.disabled = state.monthCursor.getTime() === MIN_MONTH.getTime();
    dom.nextMonth.disabled = state.monthCursor >= MAX_MONTH;
    const firstDay = startOfMonth(state.monthCursor);
    const start = new Date(firstDay);
    const firstDow = toMondayIndex(firstDay.getDay());
    start.setDate(start.getDate() - firstDow);
    const fragment = document.createDocumentFragment();
    const today = startOfDay(new Date());
    let availableCount = 0;
    for (let i = 0; i < 42; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const iso = formatISO(date);
      const info = state.availabilityByDate.get(iso) || null;
      if (info && info.available > 0) availableCount += 1;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'day-cell';
      const isCurrentMonth = date.getMonth() === state.monthCursor.getMonth();
      if (!isCurrentMonth) cell.classList.add('is-other-month');
      const isPast = date < today;
      const available = info ? Number(info.available || 0) : 0;
      const capacity = info ? Number(info.capacity || 0) : 0;
      const availabilityLabel = formatAvailabilityLabel(available, capacity);
      if (available <= 0) cell.classList.add('is-full');
      if (available > 0) cell.classList.add('has-availability');
      if (available > 0 && available <= 4) cell.classList.add('is-limited');
      if (!isCurrentMonth || isPast || available <= 0) {
        cell.classList.add('is-disabled');
        cell.disabled = true;
      }
      if (iso === state.selectedDate) {
        cell.classList.add('is-selected');
      }
      cell.dataset.date = iso;
      cell.dataset.available = String(available);
      cell.innerHTML = `
        <span class="day-number">${date.getDate()}</span>
        <span class="day-badge">
          <span class="badge-value">${availabilityLabel.value}</span>
          <span class="badge-label">${availabilityLabel.label}</span>
        </span>
      `;
      if (!cell.disabled) {
        cell.addEventListener('click', () => selectDate(iso));
      }
      fragment.appendChild(cell);
    }
    dom.calendarGrid.innerHTML = '';
    dom.calendarGrid.appendChild(fragment);
    dom.availabilityNote.textContent = availableCount
      ? `Αυτόν τον μήνα υπάρχουν ${availableCount} διαθέσιμες ημέρες.`
      : 'Δεν υπάρχουν διαθέσιμες ημέρες σε αυτόν τον μήνα. Δοκίμασε επόμενο μήνα.';
    if (!state.selectedDate) {
      dom.selectedDateLabel.textContent = '—';
      dom.selectedAvailability.textContent = '—';
      dom.continueBtn.disabled = true;
    }
  }

  function selectDate(iso) {
    state.selectedDate = iso;
    const info = state.availabilityByDate.get(iso) || null;
    dom.selectedDateLabel.textContent = capitalize(HUMAN_FORMATTER.format(parseISODate(iso)));
    dom.selectedAvailability.textContent = info && info.available > 0
      ? `${info.available} διαθέσιμες`
      : '—';
    dom.continueBtn.disabled = false;
    Array.from(dom.calendarGrid.querySelectorAll('.day-cell')).forEach((btn) => {
      btn.classList.toggle('is-selected', btn.dataset.date === iso);
    });
  }

  function hydrateHeader() {
    if (dom.tripTitle) dom.tripTitle.textContent = state.modeBlock.title || state.trip.title || 'Εκδρομή';
    const subtitle = state.modeBlock.subtitle || state.trip.subtitle || '';
    dom.tripSubtitle.textContent = subtitle || ' ';
    dom.priceLine.textContent = formatPriceLine();
  }

  function formatPriceLine() {
    const currency = (state.trip.currency || 'EUR').toUpperCase();
    const formatter = new Intl.NumberFormat('el-GR', { style: 'currency', currency });
    const pricePerPerson = Number(state.modeBlock.price_per_person);
    const priceTotal = Number(state.modeBlock.price_total);
    const charge = (state.modeBlock.charge_type || '').toLowerCase();
    if (charge === 'per_vehicle' && priceTotal) {
      return `${formatter.format(priceTotal)} / όχημα`;
    }
    if (pricePerPerson) {
      return `${formatter.format(pricePerPerson)} / άτομο`;
    }
    return 'Επικοινωνήστε για τιμή';
  }

  function persistTripSession() {
    const title = state.modeBlock.title || state.trip.title || '';
    const desc = state.modeBlock.description || state.trip.subtitle || '';
    const tripKey = state.tripSlug || state.trip.id || state.tripParam;
    try {
      sessionStorage.setItem('gw_trip_id', tripKey);
      sessionStorage.setItem('gw_trip_title', title);
      sessionStorage.setItem('gw_trip_desc', desc.slice(0, 240));
      sessionStorage.setItem('gw_trip_mode', state.modeKey);
      sessionStorage.removeItem('gw_trip_date');
      localStorage.setItem('trip_mode', state.modeKey);
    } catch (_) {}
    try { window.__loadedTrip = state.trip; } catch (_) {}
  }

  function formatAvailabilityLabel(available, capacity) {
    if (capacity && available > 0) {
      return { value: `${available}/${capacity}`, label: 'θέσεις' };
    }
    if (available > 0) {
      return { value: `${available}`, label: 'διαθέσιμες' };
    }
    return { value: '', label: 'Μη διαθέσιμη' };
  }

  async function ensureMonthLoaded(date) {
    const key = monthKey(date);
    if (state.availabilityByMonth.has(key) || state.loadingMonths.has(key)) return;
    state.loadingMonths.add(key);
    dom.availabilityNote.textContent = 'Φόρτωση διαθεσιμότητας…';
    try {
      const ym = key;
      const url = `/api/availability?trip_id=${encodeURIComponent(state.tripSlug || state.tripParam)}&mode=${encodeURIComponent(state.modeKey)}&month=${ym}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('availability_http_' + res.status);
      const payload = await res.json();
      const days = Array.isArray(payload.days) ? payload.days : [];
      const monthMap = new Map();
      days.forEach((day) => {
        if (!day || !day.date) return;
        monthMap.set(day.date, day);
        state.availabilityByDate.set(day.date, day);
      });
      state.availabilityByMonth.set(key, monthMap);
    } finally {
      state.loadingMonths.delete(key);
    }
  }

  async function fetchTripFlexible(key) {
    const slugAttempt = sanitizeSlug(key);
    try {
      if (slugAttempt) {
        const trip = await fetchTripBySlug(slugAttempt);
        if (trip) return trip;
      }
    } catch (err) {
      if (err && err.status !== 404) throw err;
    }
    const listRes = await fetch('/api/public/trips', { cache: 'no-store' });
    if (!listRes.ok) throw new Error('trip_list_fetch_failed');
    const list = await listRes.json();
    const match = Array.isArray(list)
      ? list.find((entry) => matchTrip(entry, key, slugAttempt))
      : null;
    if (!match) throw new Error('trip_not_found');
    return match;
  }

  async function fetchTripBySlug(slug) {
    const res = await fetch(`/api/trips/${encodeURIComponent(slug)}`, { cache: 'no-store' });
    if (!res.ok) {
      const err = new Error('trip_fetch_failed');
      err.status = res.status;
      throw err;
    }
    const payload = await res.json();
    if (!payload || !payload.trip) throw new Error('trip_payload_missing');
    return payload.trip;
  }

  function matchTrip(entry, key, slugAttempt) {
    if (!entry) return false;
    const slug = entry.slug || '';
    const id = entry.id || '';
    if (slug && slugAttempt && slug.toLowerCase() === slugAttempt) return true;
    if (slug && slug.toLowerCase() === key.toLowerCase()) return true;
    if (id && id.toLowerCase() === key.toLowerCase()) return true;
    return false;
  }

  function pickMode(trip, rawMode) {
    const normalized = normalizeMode(rawMode);
    const modes = trip.modes || {};
    if (normalized && modes[normalized]) return { key: normalized, data: modes[normalized] };
    const fallback = normalizeMode(trip.defaultMode);
    if (fallback && modes[fallback]) return { key: fallback, data: modes[fallback] };
    const active = Object.entries(modes).find(([, data]) => data && data.active);
    if (active) return { key: active[0], data: active[1] };
    const first = Object.entries(modes)[0];
    if (first) return { key: first[0], data: first[1] };
    return { key: normalized || 'van', data: {} };
  }

  function normalizeMode(value) {
    const alias = { private: 'mercedes', mercedes: 'mercedes', van: 'van', bus: 'bus' };
    const key = String(value || '').trim().toLowerCase();
    return alias[key] || key || 'van';
  }

  function renderFatal(message) {
    dom.root.dataset.state = 'error';
    dom.headError.removeAttribute('hidden');
    dom.headError.textContent = message;
    dom.continueBtn.disabled = true;
    dom.prevMonth.disabled = true;
    dom.nextMonth.disabled = true;
  }

  function safeValue(value) {
    return value ? String(value).trim() : '';
  }

  function monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function formatISO(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  }

  function parseISODate(iso) {
    const parts = iso.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function startOfDay(date) {
    const clone = new Date(date);
    clone.setHours(0, 0, 0, 0);
    return clone;
  }

  function toMondayIndex(day) {
    return (day + 6) % 7;
  }

  function sanitizeSlug(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function capitalize(text) {
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
})();
