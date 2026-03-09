/**
 * MoveAthens Admin — Bulk Pricing Matrix
 * Shows all destinations in a single table for one hotel + vehicle + tariff.
 * Depends on: admin-ma-helpers.js (window.MaAdmin)
 */
(() => {
  'use strict';
  const { $, showToast, setStatus, state, api, ensureConfigLoaded } = window.MaAdmin;

  const initPricingMatrixTab = () => {
    /* ── Sub-navigation (Τιμολόγηση / Πίνακας) ── */
    const subnav = $('#maPricingSubnav');
    const singleView = $('#maPricingSingleView');
    const matrixView = $('#maPricingMatrixView');

    subnav?.querySelectorAll('.ma-info-jumpnav__btn').forEach(btn => {
      btn.addEventListener('click', () => {
        subnav.querySelectorAll('.ma-info-jumpnav__btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const view = btn.dataset.pricingView;
        if (view === 'single') {
          singleView.hidden = false;
          matrixView.hidden = true;
        } else {
          singleView.hidden = true;
          matrixView.hidden = false;
        }
      });
    });

    /* ── DOM refs ── */
    const hotelSearch = $('#maMatrixHotelSearch');
    const hotelDropdown = $('#maMatrixHotelDropdown');
    const originHidden = $('#maMatrixOriginZone');
    const vehicleSelect = $('#maMatrixVehicle');
    const tariffSelect = $('#maMatrixTariff');
    const filterCategory = $('#maMatrixFilterCategory');
    const filterSubcategory = $('#maMatrixFilterSubcategory');
    const filterSubcatWrap = $('#maMatrixFilterSubcatWrap');
    const loadBtn = $('#maMatrixLoadBtn');
    const form = $('#ma-matrix-form');
    const thead = $('#ma-matrix-thead');
    const tbody = $('#ma-matrix-tbody');
    const status = $('#maMatrixStatus');

    let allHotels = [];
    let selectedHotelName = '';

    /* ── Hotel autocomplete (same pattern as single view) ── */
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
          const hotel = allHotels.find(h => h.id === item.dataset.id);
          if (hotel) {
            originHidden.value = hotel.id;
            hotelSearch.value = hotel.name;
            selectedHotelName = hotel.name;
          }
          hotelDropdown.hidden = true;
        });
      });
    };

    hotelSearch?.addEventListener('input', () => {
      const q = hotelSearch.value.trim().toLowerCase();
      if (q.length < 2) { hotelDropdown.hidden = true; return; }
      showDropdown(allHotels.filter(h =>
        h.name.toLowerCase().includes(q) || (h.municipality || '').toLowerCase().includes(q)
      ));
    });
    hotelSearch?.addEventListener('focus', () => {
      const q = hotelSearch.value.trim().toLowerCase();
      if (q.length >= 2) showDropdown(allHotels.filter(h =>
        h.name.toLowerCase().includes(q) || (h.municipality || '').toLowerCase().includes(q)
      ));
    });
    hotelSearch?.addEventListener('blur', () => {
      setTimeout(() => { hotelDropdown.hidden = true; }, 200);
    });

    /* ── Vehicle dropdown ── */
    const populateVehicles = () => {
      const vehicles = (state.CONFIG.vehicleTypes || []).filter(v => v.is_active !== false);
      if (vehicleSelect) {
        vehicleSelect.innerHTML = '<option value="">-- Επιλογή Οχήματος --</option>' +
          vehicles.map(v => `<option value="${v.id}">${v.name} (👤${v.max_passengers})</option>`).join('');
      }
    };

    /* ── Category / Subcategory filters ── */
    const populateCategoryFilter = () => {
      const activeCats = (state.CONFIG.destinationCategories || []).filter(c => c.is_active !== false);
      if (filterCategory) {
        filterCategory.innerHTML = '<option value="">Όλες</option>' +
          activeCats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
      }
      updateSubcategoryFilter();
    };

    const updateSubcategoryFilter = () => {
      const catId = filterCategory?.value || '';
      const subs = (state.CONFIG.destinationSubcategories || []).filter(s => s.category_id === catId && s.is_active !== false);
      if (subs.length > 0 && filterSubcatWrap) {
        filterSubcatWrap.hidden = false;
        if (filterSubcategory) filterSubcategory.innerHTML = '<option value="">Όλες</option>' +
          subs.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
      } else if (filterSubcatWrap) {
        filterSubcatWrap.hidden = true;
        if (filterSubcategory) filterSubcategory.value = '';
      }
    };

    filterCategory?.addEventListener('change', updateSubcategoryFilter);

    /* ── Load matrix ── */
    const getFilteredDestinations = () => {
      const allDest = (state.CONFIG.destinations || []).filter(d => d.is_active !== false);
      const catId = filterCategory?.value || '';
      const subId = filterSubcategory?.value || '';
      return allDest.filter(d => {
        if (catId && d.category_id !== catId) return false;
        if (subId && d.subcategory_id !== subId) return false;
        return true;
      });
    };

    const getCategoryName = (id) => (state.CONFIG.destinationCategories || []).find(c => c.id === id)?.name || '—';

    const loadMatrix = () => {
      const originZoneId = originHidden.value;
      const vehicleId = vehicleSelect?.value;
      const tariff = tariffSelect?.value || 'day';

      if (!originZoneId) { showToast('Επιλέξτε ξενοδοχείο'); return; }
      if (!vehicleId) { showToast('Επιλέξτε όχημα'); return; }

      const destinations = getFilteredDestinations();
      if (!destinations.length) { showToast('Δεν βρέθηκαν προορισμοί'); return; }

      const prices = state.CONFIG.transferPrices || [];

      thead.innerHTML = `<tr>
        <th class="ma-matrix-th-dest">Προορισμός</th>
        <th class="ma-matrix-th-cat">Κατηγορία</th>
        <th>Κόστος €</th>
        <th>Οδηγός €</th>
        <th>Ξεν/χείο €</th>
        <th>Υπηρεσία €</th>
      </tr>`;

      tbody.innerHTML = destinations.map(d => {
        const existing = prices.find(p =>
          p.origin_zone_id === originZoneId &&
          p.destination_id === d.id &&
          p.vehicle_type_id === vehicleId &&
          (p.tariff || 'day') === tariff
        );
        const price = existing ? existing.price : '';
        const commDriver = existing ? (existing.commission_driver || '') : '';
        const commHotel = existing ? (existing.commission_hotel || '') : '';
        const commService = existing ? (existing.commission_service || '') : '';

        return `<tr data-dest="${d.id}">
          <td class="ma-matrix-dest-name">${d.name}</td>
          <td class="ma-matrix-cat-name">${getCategoryName(d.category_id)}</td>
          <td><input type="number" class="input mx-price" min="0" step="1" value="${price}" placeholder="—"></td>
          <td><input type="number" class="input mx-driver" min="0" step="1" value="${commDriver}" placeholder="—"></td>
          <td><input type="number" class="input mx-hotel" min="0" step="1" value="${commHotel}" placeholder="—"></td>
          <td><input type="number" class="input mx-service" min="0" step="1" value="${commService}" placeholder="—"></td>
        </tr>`;
      }).join('');

      // Wire commission validation on every input
      tbody.querySelectorAll('input[type="number"]').forEach(inp => {
        inp.addEventListener('input', validateMatrixCommissions);
      });

      form.hidden = false;
      setStatus(status, '', '');
    };

    loadBtn?.addEventListener('click', loadMatrix);

    /* ── Commission validation ── */
    const validateMatrixCommissions = () => {
      // Clean ALL previous error rows first
      tbody.querySelectorAll('tr.ma-mx-error').forEach(r => r.remove());

      const rows = tbody.querySelectorAll('tr[data-dest]');
      let allOk = true;
      rows.forEach(row => {
        const priceInput = row.querySelector('.mx-price');
        if (!priceInput) return;

        const total = parseFloat(priceInput.value) || 0;
        if (total <= 0) return; // skip empty rows

        const driver = parseFloat(row.querySelector('.mx-driver')?.value) || 0;
        const hotel = parseFloat(row.querySelector('.mx-hotel')?.value) || 0;
        const service = parseFloat(row.querySelector('.mx-service')?.value) || 0;
        const sumComm = driver + hotel + service;

        if (Math.abs(sumComm - total) > 0.009) {
          const errTd = document.createElement('td');
          errTd.colSpan = 6;
          errTd.style.cssText = 'color:#d32f2f;font-size:12px;font-weight:600;padding:2px 10px';
          if (sumComm > total) {
            errTd.textContent = `⚠️ Προμήθειες (${sumComm}€) > κόστος (${total}€)`;
          } else {
            errTd.textContent = `⚠️ Προμήθειες (${sumComm}€) < κόστος (${total}€)`;
          }
          const errRow = document.createElement('tr');
          errRow.className = 'ma-mx-error';
          errRow.appendChild(errTd);
          row.after(errRow);
          allOk = false;
        }
      });
      return allOk;
    };

    /* ── Save all ── */
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!ensureConfigLoaded()) return;
      setStatus(status, '', '');

      // Clean old error rows before validating
      tbody.querySelectorAll('tr.ma-mx-error').forEach(r => r.remove());
      if (!validateMatrixCommissions()) {
        setStatus(status, 'Το σύνολο προμηθειών πρέπει να ισούται με το συνολικό κόστος', 'error');
        return;
      }

      const originZoneId = originHidden.value;
      const vehicleId = vehicleSelect?.value;
      const tariff = tariffSelect?.value || 'day';
      if (!originZoneId || !vehicleId) return;

      const rows = tbody.querySelectorAll('tr[data-dest]');
      let newPrices = [...(state.CONFIG.transferPrices || [])];

      // Remove existing entries for this hotel + vehicle + tariff (only for destinations shown)
      const destIdsInMatrix = new Set();
      rows.forEach(row => destIdsInMatrix.add(row.dataset.dest));

      newPrices = newPrices.filter(p =>
        !(p.origin_zone_id === originZoneId &&
          p.vehicle_type_id === vehicleId &&
          (p.tariff || 'day') === tariff &&
          destIdsInMatrix.has(p.destination_id))
      );

      rows.forEach(row => {
        const destId = row.dataset.dest;
        const price = parseFloat(row.querySelector('.mx-price')?.value);
        if (!Number.isFinite(price) || price < 0) return;

        const driver = parseFloat(row.querySelector('.mx-driver')?.value) || 0;
        const hotel = parseFloat(row.querySelector('.mx-hotel')?.value) || 0;
        const service = parseFloat(row.querySelector('.mx-service')?.value) || 0;

        newPrices.push({
          id: `tp_${Date.now()}_${destId}_${vehicleId}_${tariff}`,
          origin_zone_id: originZoneId,
          destination_id: destId,
          vehicle_type_id: vehicleId,
          tariff,
          price,
          commission_driver: driver,
          commission_hotel: hotel,
          commission_service: service
        });
      });

      const res = await api('/api/admin/moveathens/transfer-prices', 'PUT', { transferPrices: newPrices });
      if (!res) return;
      if (res.ok) {
        const data = await res.json();
        state.CONFIG.transferPrices = data.transferPrices || [];
        showToast('✅ Τιμές αποθηκεύτηκαν (' + destIdsInMatrix.size + ' προορισμοί)');
        setStatus(status, 'Saved', 'ok');
      } else {
        const err = await res.json().catch(() => ({}));
        setStatus(status, err.error || 'Σφάλμα', 'error');
      }
    });

    /* ── Render (called after config loads) ── */
    const render = () => {
      populateHotelList();
      populateVehicles();
      populateCategoryFilter();
      form.hidden = true;
      if (originHidden.value && selectedHotelName) {
        hotelSearch.value = selectedHotelName;
      }
    };

    return { render };
  };

  window.MaAdmin.initPricingMatrixTab = initPricingMatrixTab;
})();
