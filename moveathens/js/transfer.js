/**
 * MoveAthens Transfer Flow
 * Step 1: Categories → Step 2: Destinations → Step 3: Vehicles → Step 4: Confirm
 */
(() => {
  'use strict';

  // ========================================
  // STATE
  // ========================================
  let CONFIG = null;
  let hotelContext = null;  // { origin_zone_id, ... }
  let selectedCategory = null;
  let selectedDestination = null;
  let selectedVehicle = null;

  // ========================================
  // DOM
  // ========================================
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const steps = {
    categories: $('#step-categories'),
    destinations: $('#step-destinations'),
    vehicles: $('#step-vehicles'),
    confirm: $('#step-confirm'),
    noZone: $('#step-no-zone')
  };

  const categoriesGrid = $('#categories-grid');
  const destinationsList = $('#destinations-list');
  const vehiclesGrid = $('#vehicles-grid');
  const selectedCategoryName = $('#selected-category-name');
  const selectedDestinationName = $('#selected-destination-name');

  // Confirm step
  const confirmDestination = $('#confirm-destination');
  const confirmVehicle = $('#confirm-vehicle');
  const confirmCapacity = $('#confirm-capacity');
  const confirmPrice = $('#confirm-price');
  const ctaWhatsapp = $('#cta-whatsapp');
  const ctaPhone = $('#cta-phone');
  const ctaWhatsappFallback = $('#cta-whatsapp-fallback');
  const ctaPhoneFallback = $('#cta-phone-fallback');

  // ========================================
  // NAVIGATION
  // ========================================
  const showStep = (stepName) => {
    Object.values(steps).forEach(s => s?.classList.remove('active'));
    steps[stepName]?.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ========================================
  // API
  // ========================================
  const api = async (url) => {
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.error('API error:', e);
      return null;
    }
  };

  // ========================================
  // HOTEL CONTEXT
  // ========================================
  const loadHotelContext = () => {
    // Try to get from localStorage or cookie (set by hotel-context page)
    try {
      const stored = localStorage.getItem('moveathens_hotel');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.origin_zone_id) {
          return parsed;
        }
      }
    } catch (e) {}
    return null;
  };

  // ========================================
  // RENDER FUNCTIONS
  // ========================================
  
  // Helper: render category icon (can be URL or emoji)
  const renderCategoryIcon = (icon) => {
    if (!icon) return '<span class="ma-category-emoji">📍</span>';
    // If it starts with / or http, it's an image URL
    if (icon.startsWith('/') || icon.startsWith('http')) {
      return `<img src="${icon}" alt="" class="ma-category-icon-img">`;
    }
    // Otherwise it's an emoji or text
    return `<span class="ma-category-emoji">${icon}</span>`;
  };

  const renderCategories = async () => {
    const data = await api('/api/moveathens/categories');
    if (!data || !data.categories || !data.categories.length) {
      categoriesGrid.innerHTML = '<p class="ma-empty">Δεν υπάρχουν διαθέσιμες κατηγορίες.</p>';
      return;
    }

    categoriesGrid.innerHTML = data.categories.map(cat => `
      <button class="ma-category-card" data-id="${cat.id}" data-name="${cat.name}">
        <span class="ma-category-icon">${renderCategoryIcon(cat.icon)}</span>
        <span class="ma-category-name">${cat.name}</span>
      </button>
    `).join('');

    // Event listeners
    categoriesGrid.querySelectorAll('.ma-category-card').forEach(card => {
      card.addEventListener('click', () => {
        selectedCategory = {
          id: card.dataset.id,
          name: card.dataset.name
        };
        loadDestinations();
      });
    });
  };

  const loadDestinations = async () => {
    if (!selectedCategory) return;
    selectedCategoryName.textContent = selectedCategory.name;
    destinationsList.innerHTML = '<div class="ma-loading">Φόρτωση...</div>';
    showStep('destinations');

    const data = await api(`/api/moveathens/destinations?category_id=${encodeURIComponent(selectedCategory.id)}`);
    if (!data || !data.destinations || !data.destinations.length) {
      destinationsList.innerHTML = '<p class="ma-empty">Δεν υπάρχουν διαθέσιμοι προορισμοί.</p>';
      return;
    }

    destinationsList.innerHTML = data.destinations.map(dest => `
      <button class="ma-destination-item" data-id="${dest.id}" data-name="${dest.name}">
        <span class="ma-destination-name">${dest.name}</span>
        ${dest.description ? `<span class="ma-destination-desc">${dest.description}</span>` : ''}
        <span class="ma-destination-arrow">→</span>
      </button>
    `).join('');

    // Event listeners
    destinationsList.querySelectorAll('.ma-destination-item').forEach(item => {
      item.addEventListener('click', () => {
        selectedDestination = {
          id: item.dataset.id,
          name: item.dataset.name
        };
        loadVehicles();
      });
    });
  };

  const loadVehicles = async () => {
    if (!selectedDestination || !hotelContext?.origin_zone_id) return;
    selectedDestinationName.textContent = selectedDestination.name;
    vehiclesGrid.innerHTML = '<div class="ma-loading">Φόρτωση...</div>';
    showStep('vehicles');

    const url = `/api/moveathens/vehicles?origin_zone_id=${encodeURIComponent(hotelContext.origin_zone_id)}&destination_id=${encodeURIComponent(selectedDestination.id)}`;
    const data = await api(url);

    if (!data || !data.vehicles || !data.vehicles.length) {
      vehiclesGrid.innerHTML = '<p class="ma-empty">Δεν υπάρχουν διαθέσιμα οχήματα για αυτή τη διαδρομή.</p>';
      return;
    }

    vehiclesGrid.innerHTML = data.vehicles.map(v => `
      <button class="ma-vehicle-card" data-id="${v.id}" data-name="${v.name}" data-price="${v.price}" 
              data-pax="${v.max_passengers}" data-large="${v.luggage_large}" 
              data-medium="${v.luggage_medium}" data-cabin="${v.luggage_cabin}">
        ${v.imageUrl ? `<img src="${v.imageUrl}" alt="${v.name}" class="ma-vehicle-img">` : '<div class="ma-vehicle-placeholder">🚗</div>'}
        <div class="ma-vehicle-info">
          <h3 class="ma-vehicle-name">${v.name}</h3>
          <div class="ma-vehicle-specs">
            <span class="ma-spec">👤 ${v.max_passengers}</span>
            ${v.luggage_large ? `<span class="ma-spec">🧳L ${v.luggage_large}</span>` : ''}
            ${v.luggage_medium ? `<span class="ma-spec">🧳M ${v.luggage_medium}</span>` : ''}
            ${v.luggage_cabin ? `<span class="ma-spec">🎒 ${v.luggage_cabin}</span>` : ''}
          </div>
        </div>
        <div class="ma-vehicle-price">€${v.price.toFixed(0)}</div>
      </button>
    `).join('');

    // Event listeners
    vehiclesGrid.querySelectorAll('.ma-vehicle-card').forEach(card => {
      card.addEventListener('click', () => {
        selectedVehicle = {
          id: card.dataset.id,
          name: card.dataset.name,
          price: parseFloat(card.dataset.price),
          max_passengers: parseInt(card.dataset.pax, 10),
          luggage_large: parseInt(card.dataset.large, 10),
          luggage_medium: parseInt(card.dataset.medium, 10),
          luggage_cabin: parseInt(card.dataset.cabin, 10)
        };
        showConfirmation();
      });
    });
  };

  const showConfirmation = () => {
    if (!selectedDestination || !selectedVehicle) return;

    confirmDestination.textContent = selectedDestination.name;
    confirmVehicle.textContent = selectedVehicle.name;
    confirmCapacity.textContent = `${selectedVehicle.max_passengers} επιβάτες`;
    confirmPrice.textContent = `€${selectedVehicle.price.toFixed(0)}`;

    // Build WhatsApp message
    const msg = encodeURIComponent(
      `Γεια σας! Θέλω να κλείσω transfer:\n` +
      `📍 Προορισμός: ${selectedDestination.name}\n` +
      `🚗 Όχημα: ${selectedVehicle.name}\n` +
      `💰 Τιμή: €${selectedVehicle.price.toFixed(0)}\n` +
      `Από: ${hotelContext.hotelName || 'Ξενοδοχείο'}`
    );
    const phone = CONFIG?.whatsappNumber?.replace(/[^0-9+]/g, '') || '';
    ctaWhatsapp.href = `https://wa.me/${phone}?text=${msg}`;
    ctaPhone.href = `tel:${CONFIG?.phoneNumber || ''}`;

    showStep('confirm');
  };

  // ========================================
  // INIT
  // ========================================
  const init = async () => {
    // Load config
    CONFIG = await api('/api/moveathens/ui-config');
    if (!CONFIG) {
      categoriesGrid.innerHTML = '<p class="ma-empty">Σφάλμα φόρτωσης.</p>';
      return;
    }

    // Fallback CTAs
    const phone = CONFIG?.whatsappNumber?.replace(/[^0-9+]/g, '') || '';
    if (ctaWhatsappFallback) ctaWhatsappFallback.href = `https://wa.me/${phone}`;
    if (ctaPhoneFallback) ctaPhoneFallback.href = `tel:${CONFIG?.phoneNumber || ''}`;

    // Load hotel context
    hotelContext = loadHotelContext();
    if (!hotelContext?.origin_zone_id) {
      // No zone - show warning
      showStep('noZone');
      return;
    }

    // Show categories
    await renderCategories();

    // Back buttons
    $('#back-to-categories')?.addEventListener('click', () => {
      selectedCategory = null;
      showStep('categories');
    });

    $('#back-to-destinations')?.addEventListener('click', () => {
      selectedDestination = null;
      showStep('destinations');
    });

    $('#back-to-vehicles')?.addEventListener('click', () => {
      selectedVehicle = null;
      showStep('vehicles');
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
