/**
 * MoveAthens Admin — Pricing Tab
 * Depends on: admin-ma-helpers.js (window.MaAdmin)
 */
(() => {
  'use strict';
  const { $, showToast, setStatus, state, api, ensureConfigLoaded } = window.MaAdmin;

  const initPricingTab = () => {
    const originHidden = $('#maPriceOriginZone');
    const hotelSearch = $('#maPriceHotelSearch');
    const hotelDropdown = $('#maPriceHotelDropdown');
    const destSelect = $('#maPriceDestination');
    const tariffSelect = $('#maPriceTariff');
    const loadBtn = $('#maPriceLoadBtn');
    const form = $('#ma-pricing-form');
    const grid = $('#ma-pricing-grid');
    const status = $('#maPriceStatus');

    const tariffLabels = {
      day: '☀️ Ημερήσια (05:00 - 00:00)',
      night: '🌙 Νυχτερινή (00:00 - 05:00)'
    };

    // ---- Hotel autocomplete ----
    let allHotels = [];
    let selectedHotelName = '';

    const populateHotelList = () => {
      allHotels = (state.CONFIG.transferZones || []).filter(z => z.is_active !== false);
    };

    const showDropdown = (matches) => {
      if (!matches.length) { hotelDropdown.hidden = true; return; }
      hotelDropdown.innerHTML = matches.map(h =>
        `<div class="ma-ac-item" data-id="${h.id}">${h.name}${h.municipality ? ' <span class="ma-muted">(' + h.municipality + ')</span>' : ''}</div>`
      ).join('');
      hotelDropdown.hidden = false;

      hotelDropdown.querySelectorAll('.ma-ac-item').forEach(item => {
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const id = item.dataset.id;
          const hotel = allHotels.find(h => h.id === id);
          if (hotel) {
            originHidden.value = hotel.id;
            hotelSearch.value = hotel.name;
            selectedHotelName = hotel.name;
          }
          hotelDropdown.hidden = true;
          if (originHidden.value && destSelect.value) loadPrices();
        });
      });
    };

    hotelSearch?.addEventListener('input', () => {
      const q = hotelSearch.value.trim().toLowerCase();
      if (q.length < 2) { hotelDropdown.hidden = true; return; }
      const matches = allHotels.filter(h =>
        h.name.toLowerCase().includes(q) ||
        (h.municipality || '').toLowerCase().includes(q)
      );
      showDropdown(matches);
    });

    hotelSearch?.addEventListener('focus', () => {
      const q = hotelSearch.value.trim().toLowerCase();
      if (q.length >= 2) {
        const matches = allHotels.filter(h =>
          h.name.toLowerCase().includes(q) ||
          (h.municipality || '').toLowerCase().includes(q)
        );
        showDropdown(matches);
      }
    });

    hotelSearch?.addEventListener('blur', () => {
      setTimeout(() => { hotelDropdown.hidden = true; }, 200);
    });

    // ---- Destination dropdown ----
    const populateDestinations = () => {
      const destinations = (state.CONFIG.destinations || []).filter(d => d.is_active !== false);
      const categories = state.CONFIG.destinationCategories || [];
      const getCatName = (catId) => categories.find(c => c.id === catId)?.name || 'Χωρίς κατηγορία';
      
      const grouped = {};
      destinations.forEach(d => {
        const catName = getCatName(d.category_id);
        if (!grouped[catName]) grouped[catName] = [];
        grouped[catName].push(d);
      });

      let destOpts = '<option value="">-- Επιλογή Προορισμού --</option>';
      Object.keys(grouped).sort().forEach(catName => {
        destOpts += `<optgroup label="${catName}">`;
        grouped[catName].forEach(d => {
          destOpts += `<option value="${d.id}">${d.name}</option>`;
        });
        destOpts += '</optgroup>';
      });
      destSelect.innerHTML = destOpts;
    };

    const render = () => {
      populateHotelList();
      populateDestinations();
      form.hidden = true;
      if (originHidden.value && selectedHotelName) {
        hotelSearch.value = selectedHotelName;
      }
    };

    // ---- Commission validation ----
    const validateCommissions = () => {
      const rows = grid.querySelectorAll('.ma-price-row');
      let allOk = true;
      rows.forEach(row => {
        const priceInput = row.querySelector('.price-input');
        const driverInput = row.querySelector('.comm-driver');
        const hotelInput = row.querySelector('.comm-hotel');
        const serviceInput = row.querySelector('.comm-service');
        if (!priceInput) return;

        const total = parseFloat(priceInput.value) || 0;
        const driver = parseFloat(driverInput?.value) || 0;
        const hotel = parseFloat(hotelInput?.value) || 0;
        const service = parseFloat(serviceInput?.value) || 0;
        const sumComm = driver + hotel + service;

        const errorEl = row.querySelector('.ma-comm-error');
        if (total > 0 && sumComm > total) {
          if (errorEl) {
            errorEl.textContent = `⚠️ Σύνολο προμηθειών (${sumComm.toFixed(2)}€) > τιμή (${total.toFixed(2)}€)`;
            errorEl.hidden = false;
          }
          allOk = false;
        } else if (total > 0 && sumComm < total) {
          if (errorEl) {
            errorEl.textContent = `⚠️ Σύνολο προμηθειών (${sumComm.toFixed(2)}€) < τιμή (${total.toFixed(2)}€)`;
            errorEl.hidden = false;
          }
          allOk = false;
        } else {
          if (errorEl) errorEl.hidden = true;
        }
      });
      return allOk;
    };

    const loadPrices = () => {
      const originZoneId = originHidden.value;
      const destinationId = destSelect.value;
      const tariff = tariffSelect?.value || 'day';
      if (!originZoneId || !destinationId) {
        showToast('Επιλέξτε ξενοδοχείο και προορισμό');
        return;
      }
      const vehicles = (state.CONFIG.vehicleTypes || []).filter(v => v.is_active !== false);
      const prices = state.CONFIG.transferPrices || [];

      const tariffLabel = tariffLabels[tariff] || tariff;
      grid.innerHTML = `
        <div class="ma-tariff-indicator">Ταρίφα: ${tariffLabel}</div>
        <div class="ma-price-header">
          <span>Όχημα</span>
          <span>Συνολικό Κόστος (€)</span>
          <span>Προμήθεια Οδηγού (€)</span>
          <span>Προμήθεια Ξενοδοχείου (€)</span>
          <span>Προμήθεια Υπηρεσίας (€)</span>
        </div>
      ` + vehicles.map(v => {
        const existing = prices.find(p =>
          p.origin_zone_id === originZoneId &&
          p.destination_id === destinationId &&
          p.vehicle_type_id === v.id &&
          (p.tariff || 'day') === tariff
        );
        const price = existing ? existing.price : '';
        const commDriver = existing ? (existing.commission_driver || '') : '';
        const commHotel = existing ? (existing.commission_hotel || '') : '';
        const commService = existing ? (existing.commission_service || '') : '';
        return `
          <div class="ma-price-row" data-vehicle="${v.id}">
            <div class="ma-price-vehicle">
              <strong>${v.name}</strong>
              <span class="ma-muted">(👤${v.max_passengers})</span>
            </div>
            <input type="number" class="input price-input" data-vehicle="${v.id}" min="0" step="0.01" value="${price}" placeholder="€" title="Συνολικό κόστος">
            <input type="number" class="input comm-driver" min="0" step="0.01" value="${commDriver}" placeholder="€" title="Προμήθεια οδηγού">
            <input type="number" class="input comm-hotel" min="0" step="0.01" value="${commHotel}" placeholder="€" title="Προμήθεια ξενοδοχείου">
            <input type="number" class="input comm-service" min="0" step="0.01" value="${commService}" placeholder="€" title="Προμήθεια υπηρεσίας">
            <div class="ma-comm-error" hidden></div>
          </div>
        `;
      }).join('');

      grid.querySelectorAll('input[type="number"]').forEach(inp => {
        inp.addEventListener('input', validateCommissions);
      });

      form.hidden = false;
    };

    loadBtn?.addEventListener('click', loadPrices);

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!ensureConfigLoaded()) return;
      setStatus(status, '', '');

      if (!validateCommissions()) {
        setStatus(status, 'Οι προμήθειες δεν μπορούν να υπερβαίνουν το συνολικό κόστος', 'error');
        return;
      }

      const originZoneId = originHidden.value;
      const destinationId = destSelect.value;
      const tariff = tariffSelect?.value || 'day';
      if (!originZoneId || !destinationId) return;

      const rows = grid.querySelectorAll('.ma-price-row');
      let newPrices = [...(state.CONFIG.transferPrices || [])];

      newPrices = newPrices.filter(p =>
        !(p.origin_zone_id === originZoneId && p.destination_id === destinationId && (p.tariff || 'day') === tariff)
      );

      rows.forEach(row => {
        const vehicleId = row.dataset.vehicle;
        if (!vehicleId) return;
        const priceInput = row.querySelector('.price-input');
        const price = parseFloat(priceInput?.value);
        if (!Number.isFinite(price) || price < 0) return;

        const commDriver = parseFloat(row.querySelector('.comm-driver')?.value) || 0;
        const commHotel = parseFloat(row.querySelector('.comm-hotel')?.value) || 0;
        const commService = parseFloat(row.querySelector('.comm-service')?.value) || 0;

        newPrices.push({
          id: `tp_${Date.now()}_${vehicleId}_${tariff}`,
          origin_zone_id: originZoneId,
          destination_id: destinationId,
          vehicle_type_id: vehicleId,
          tariff,
          price,
          commission_driver: commDriver,
          commission_hotel: commHotel,
          commission_service: commService
        });
      });

      const res = await api('/api/admin/moveathens/transfer-prices', 'PUT', { transferPrices: newPrices });
      if (!res) return;
      if (res.ok) {
        const data = await res.json();
        state.CONFIG.transferPrices = data.transferPrices || [];
        showToast('Τιμές αποθηκεύτηκαν');
        setStatus(status, 'Saved', 'ok');
      } else {
        const err = await res.json().catch(() => ({}));
        setStatus(status, err.error || 'Σφάλμα', 'error');
      }
    });

    destSelect?.addEventListener('change', () => {
      if (originHidden.value && destSelect.value) loadPrices();
      else { form.hidden = true; grid.innerHTML = ''; }
    });

    tariffSelect?.addEventListener('change', () => {
      if (originHidden.value && destSelect.value) loadPrices();
    });

    return { render };
  };

  window.MaAdmin.initPricingTab = initPricingTab;
})();
