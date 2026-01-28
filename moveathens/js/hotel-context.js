(async () => {
  const cfg = await window.MoveAthensConfig.load();
  const emailInput = document.querySelector('[data-ma-hotel-input="email"]');
  const zoneSelect = document.querySelector('[data-ma-hotel-input="zone"]');
  const sendButton = document.querySelector('[data-ma-hotel-send]');

  const storedEmail = localStorage.getItem('moveathens_hotel_email') || '';
  const storedZoneId = localStorage.getItem('moveathens_hotel_zone_id') || '';

  if (emailInput) emailInput.value = storedEmail;

  // Fetch zones from dedicated API endpoint for proper IDs
  let normalizedZones = [];
  try {
    const resp = await fetch('/api/moveathens/zones');
    if (resp.ok) {
      const data = await resp.json();
      normalizedZones = (data.zones || []).filter(z => z.id && z.name);
    }
  } catch (e) {
    // Fallback to config zones
    const zones = Array.isArray(cfg.transferZones) && cfg.transferZones.length
      ? cfg.transferZones
      : (cfg.hotelZones || []);
    normalizedZones = zones.map((zone, idx) => {
      if (typeof zone === 'string') {
        return { id: String(idx + 1), name: zone };
      }
      return {
        id: zone.id || String(idx + 1),
        name: zone.name || zone
      };
    });
  }

  if (zoneSelect) {
    zoneSelect.innerHTML = '';
    normalizedZones.forEach((zone) => {
      const opt = document.createElement('option');
      opt.value = zone.id; // Store zone ID as value
      opt.textContent = zone.name;
      opt.dataset.zoneName = zone.name;
      zoneSelect.appendChild(opt);
    });
    
    // Restore stored value or select first option
    if (storedZoneId) {
      zoneSelect.value = storedZoneId;
    } else if (normalizedZones.length > 0) {
      // Auto-select first zone if none stored
      zoneSelect.value = normalizedZones[0].id;
    }
    
    // Save current selection immediately (for first load)
    const saveCurrentZone = () => {
      const selectedOption = zoneSelect.options[zoneSelect.selectedIndex];
      if (!selectedOption) return;
      const zoneId = zoneSelect.value || '';
      const zoneName = selectedOption.dataset.zoneName || selectedOption.textContent || '';
      
      localStorage.setItem('moveathens_hotel_zone_id', zoneId);
      localStorage.setItem('moveathens_hotel_zone', zoneName);
      localStorage.setItem('moveathens_hotel', JSON.stringify({
        origin_zone_id: zoneId,
        origin_zone_name: zoneName
      }));
    };
    
    // Save on page load if we have a selection
    if (zoneSelect.value) {
      saveCurrentZone();
    }
  }

  if (emailInput) {
    emailInput.addEventListener('input', () => {
      localStorage.setItem('moveathens_hotel_email', emailInput.value || '');
    });
  }

  if (zoneSelect) {
    zoneSelect.addEventListener('change', () => {
      const selectedOption = zoneSelect.options[zoneSelect.selectedIndex];
      const zoneId = zoneSelect.value || '';
      const zoneName = selectedOption ? selectedOption.dataset.zoneName : '';
      
      // Store both ID and name for compatibility
      localStorage.setItem('moveathens_hotel_zone_id', zoneId);
      localStorage.setItem('moveathens_hotel_zone', zoneName);
      
      // Also store as combined object for transfer.js
      localStorage.setItem('moveathens_hotel', JSON.stringify({
        origin_zone_id: zoneId,
        origin_zone_name: zoneName
      }));
    });
  }

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
