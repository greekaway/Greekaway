(async () => {
  // Apply domain-aware home links
  if (window.MoveAthensConfig?.applyHomeLinks) {
    window.MoveAthensConfig.applyHomeLinks();
  }

  const cfg = await window.MoveAthensConfig.load();

  // DOM refs
  const nameInput        = document.querySelector('[data-ma-hotel-input="name"]');
  const suggestionsList  = document.querySelector('[data-ma-hotel-suggestions]');
  const municipalityInput = document.querySelector('[data-ma-hotel-input="municipality"]');
  const addressInput     = document.querySelector('[data-ma-hotel-input="address"]');
  const phoneInput       = document.querySelector('[data-ma-hotel-input="phone"]');
  const emailInput       = document.querySelector('[data-ma-hotel-input="email"]');
  const accTypeInput     = document.querySelector('[data-ma-hotel-input="accommodation_type"]');
  const sendButton       = document.querySelector('[data-ma-hotel-send]');

  // ── Fetch all zones (hotels) from admin panel ──
  let allZones = [];
  try {
    const resp = await fetch('/api/moveathens/zones');
    if (resp.ok) {
      const data = await resp.json();
      allZones = (data.zones || []).filter(z => z.id && z.name);
    }
  } catch (e) {
    console.warn('[hotel-context] Failed to load zones', e);
  }

  // ── Restore saved hotel from localStorage ──
  let selectedZone = null;
  const stored = (() => {
    try { return JSON.parse(localStorage.getItem('moveathens_hotel') || 'null'); } catch { return null; }
  })();

  if (stored) {
    if (nameInput)        nameInput.value        = stored.origin_zone_name || '';
    if (municipalityInput) municipalityInput.value = stored.municipality || '';
    if (addressInput)     addressInput.value     = stored.address || '';
    if (phoneInput)       phoneInput.value       = stored.phone || '';
    if (emailInput)       emailInput.value       = stored.email || '';
    if (accTypeInput)     accTypeInput.value     = stored.accommodation_type || '';
    // Try to find matching zone
    if (stored.origin_zone_id) {
      selectedZone = allZones.find(z => z.id === stored.origin_zone_id) || null;
    }
  }

  // ── Autocomplete logic ──
  let acHighlight = -1;

  const showSuggestions = (query) => {
    if (!suggestionsList) return;
    const q = query.trim().toLowerCase();
    if (q.length < 1) {
      suggestionsList.innerHTML = '';
      suggestionsList.style.display = 'none';
      return;
    }
    const matches = allZones.filter(z => z.name.toLowerCase().includes(q)).slice(0, 8);
    if (!matches.length) {
      suggestionsList.innerHTML = '<li class="ma-ac-empty">Δεν βρέθηκε ξενοδοχείο</li>';
      suggestionsList.style.display = 'block';
      return;
    }
    suggestionsList.innerHTML = matches.map((z, i) => {
      const typeLabel = z.accommodation_type === 'rental_rooms' ? 'Ενοικ. Δωμάτια' : 'Ξενοδοχείο';
      return `<li class="ma-ac-item" data-idx="${i}" data-zone-id="${z.id}">
        <span class="ma-ac-name">${highlightMatch(z.name, q)}</span>
        <span class="ma-ac-meta">${z.municipality || ''} · ${typeLabel}</span>
      </li>`;
    }).join('');
    suggestionsList.style.display = 'block';
    acHighlight = -1;

    // Click listeners on suggestions
    suggestionsList.querySelectorAll('.ma-ac-item').forEach(li => {
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const zoneId = li.dataset.zoneId;
        const zone = allZones.find(z => z.id === zoneId);
        if (zone) selectHotel(zone);
      });
    });
  };

  const highlightMatch = (name, query) => {
    const idx = name.toLowerCase().indexOf(query);
    if (idx < 0) return name;
    return name.slice(0, idx) + '<b>' + name.slice(idx, idx + query.length) + '</b>' + name.slice(idx + query.length);
  };

  const selectHotel = (zone) => {
    selectedZone = zone;
    if (nameInput)         nameInput.value         = zone.name;
    if (municipalityInput) municipalityInput.value  = zone.municipality || '';
    if (addressInput)      addressInput.value      = zone.address || '';
    if (phoneInput)        phoneInput.value        = zone.phone || '';
    if (emailInput)        emailInput.value        = zone.email || '';
    if (accTypeInput)      accTypeInput.value      = zone.accommodation_type === 'rental_rooms' ? 'Ενοικ. Δωμάτια' : 'Ξενοδοχείο';
    if (suggestionsList)   { suggestionsList.innerHTML = ''; suggestionsList.style.display = 'none'; }
    // Auto-save on selection
    persistHotel();
  };

  // ── Input event: show autocomplete ──
  if (nameInput) {
    nameInput.addEventListener('input', () => {
      selectedZone = null; // clear selection when user types
      showSuggestions(nameInput.value);
    });
    nameInput.addEventListener('focus', () => {
      if (nameInput.value.trim().length >= 1) showSuggestions(nameInput.value);
    });
    nameInput.addEventListener('blur', () => {
      // Delay hiding to allow click events on suggestions
      setTimeout(() => {
        if (suggestionsList) { suggestionsList.innerHTML = ''; suggestionsList.style.display = 'none'; }
      }, 200);
    });
    // Keyboard navigation
    nameInput.addEventListener('keydown', (e) => {
      const items = suggestionsList ? suggestionsList.querySelectorAll('.ma-ac-item') : [];
      if (!items.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        acHighlight = Math.min(acHighlight + 1, items.length - 1);
        items.forEach((li, i) => li.classList.toggle('ma-ac-active', i === acHighlight));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        acHighlight = Math.max(acHighlight - 1, 0);
        items.forEach((li, i) => li.classList.toggle('ma-ac-active', i === acHighlight));
      } else if (e.key === 'Enter' && acHighlight >= 0) {
        e.preventDefault();
        const zoneId = items[acHighlight]?.dataset?.zoneId;
        const zone = allZones.find(z => z.id === zoneId);
        if (zone) selectHotel(zone);
      }
    });
  }

  // ── Persist hotel to localStorage ──
  const persistHotel = () => {
    const obj = {
      origin_zone_id:     selectedZone?.id || '',
      origin_zone_name:   nameInput?.value.trim() || '',
      hotelName:          nameInput?.value.trim() || '',
      municipality:       municipalityInput?.value.trim() || '',
      address:            addressInput?.value.trim() || '',
      phone:              phoneInput?.value.trim() || '',
      email:              emailInput?.value.trim() || '',
      accommodation_type: accTypeInput?.value.trim() || ''
    };
    localStorage.setItem('moveathens_hotel', JSON.stringify(obj));
    // Keep legacy keys for compatibility
    localStorage.setItem('moveathens_hotel_zone_id', obj.origin_zone_id);
    localStorage.setItem('moveathens_hotel_zone', obj.origin_zone_name);
    localStorage.setItem('moveathens_hotel_address', obj.address);
    localStorage.setItem('moveathens_hotel_email', obj.email);
  };

  // ── Auto-save editable fields on input ──
  [municipalityInput, addressInput, phoneInput, emailInput].forEach(el => {
    if (el) el.addEventListener('input', () => persistHotel());
  });

  // ── Save button ──
  const saveButton = document.querySelector('[data-ma-hotel-save]');
  if (saveButton) {
    saveButton.addEventListener('click', () => {
      if (!selectedZone && nameInput?.value.trim()) {
        // User typed a name but didn't select from list — try to match
        const q = nameInput.value.trim().toLowerCase();
        const match = allZones.find(z => z.name.toLowerCase() === q);
        if (match) selectHotel(match);
      }
      persistHotel();

      // Visual feedback
      const textEl = saveButton.querySelector('.ma-button__text');
      const successEl = saveButton.querySelector('.ma-button__success');
      if (textEl && successEl) {
        textEl.style.display = 'none';
        successEl.style.display = 'inline';
        saveButton.classList.add('ma-button--saved');
        setTimeout(() => {
          textEl.style.display = 'inline';
          successEl.style.display = 'none';
          saveButton.classList.remove('ma-button--saved');
        }, 2000);
      }
    });
  }

  // ── Send email ──
  if (sendButton) {
    sendButton.addEventListener('click', () => {
      const email = emailInput ? emailInput.value.trim() : '';
      const subjectPrefix = cfg.hotelEmailSubjectPrefix || '';
      const subject = `${subjectPrefix} ${email}`.trim();
      const to = cfg.companyEmail || '';
      if (!to) return;
      const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}`;
      window.location.href = mailto;
    });
  }
})();
