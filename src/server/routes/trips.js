const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT_DIR = path.join(__dirname, "..", "..", "..");
const TRIPS_DIR = path.join(ROOT_DIR, "data", "trips");
const TRIP_TEMPLATE_FILE = path.join(TRIPS_DIR, "_template.json");
const UPLOAD_TRIPS_DIR = path.join(ROOT_DIR, "public", "uploads", "trips");
const MODE_KEYS = ["van", "mercedes", "bus"];
const LEGACY_DURATION_FIELDS = ["duration", "duration_hours", "duration_days"];
const MAX_TRIP_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_TRIP_IMAGE_COUNT = 12;
const MODE_DEFAULT_META = {
  van: { capacity: 7, charge_type: "per_person" },
  mercedes: { capacity: 1, charge_type: "per_vehicle" },
  bus: { capacity: 40, charge_type: "per_person" },
};
let multer = null;
try {
  multer = require("multer");
} catch (_) {
  multer = null;
}
const TEMPLATE_FILENAME = path.basename(TRIP_TEMPLATE_FILE);

let tripTemplateCache = null;

function baseModeTemplate(modeKey) {
  const meta = MODE_DEFAULT_META[modeKey] || {
    capacity: 0,
    charge_type: "per_person",
  };
  return {
    active: false,
    title: "",
    subtitle: "",
    description: "",
    duration: "",
    duration_days: 0,
    price_per_person: 0,
    price_total: 0,
    charge_type: meta.charge_type,
    capacity: meta.capacity,
    includes: [],
    excludes: [],
    tags: [],
    sections: [{ title: "", content: "" }],
    gallery: [],
    video: { url: "", thumbnail: "" },
    videos: [],
    stops: [{ title: "", description: "", images: [], videos: [] }],
    faq: [{ q: "", a: "" }],
    map: {
      start: { label: "", lat: null, lng: null },
      end: { label: "", lat: null, lng: null },
      route: [],
    },
  };
}

function loadTripTemplate() {
  if (tripTemplateCache) return tripTemplateCache;
  try {
    const raw = fs.readFileSync(TRIP_TEMPLATE_FILE, "utf8");
    tripTemplateCache = JSON.parse(raw || "{}") || {};
  } catch (err) {
    console.warn(
      "trips: failed to load template, falling back to empty structure",
      err && err.message ? err.message : err,
    );
    const fallbackModes = {};
    MODE_KEYS.forEach((key) => {
      fallbackModes[key] = baseModeTemplate(key);
    });
    tripTemplateCache = {
      id: "",
      slug: "",
      title: "",
      subtitle: "",
      teaser: "",
      category: "",
      active: true,
      defaultMode: "van",
      iconPath: "",
      coverImage: "",
      featuredImage: "",
      currency: "EUR",
      tags: [],
      modes: fallbackModes,
      createdAt: "",
      updatedAt: "",
    };
  }
  return tripTemplateCache;
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function applyTemplateDefaults(input) {
  const tpl = loadTripTemplate();
  const obj =
    input && typeof input === "object" && !Array.isArray(input)
      ? { ...input }
      : {};
  const visit = (target, template) => {
    if (!template || typeof template !== "object" || Array.isArray(template))
      return;
    Object.keys(template).forEach((key) => {
      const tplVal = template[key];
      const hasKey = Object.prototype.hasOwnProperty.call(target, key);
      if (!hasKey) {
        target[key] = cloneJson(tplVal);
        return;
      }
      const curVal = target[key];
      if (curVal === undefined) {
        target[key] = cloneJson(tplVal);
        return;
      }
      if (Array.isArray(tplVal)) {
        if (!Array.isArray(curVal)) target[key] = cloneJson(tplVal);
        return;
      }
      if (tplVal && typeof tplVal === "object" && !Array.isArray(tplVal)) {
        if (curVal && typeof curVal === "object" && !Array.isArray(curVal)) {
          visit(curVal, tplVal);
        } else {
          target[key] = cloneJson(tplVal);
        }
      }
    });
  };
  visit(obj, tpl);
  return obj;
}

function toInt(value, def) {
  const num = parseInt(value, 10);
  return Number.isFinite(num) ? num : (def ?? 0);
}

function parseDurationDaysValue(value) {
  if (value === null || typeof value === "undefined") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.floor(num);
}

function hasDurationDaysValue(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function toFloat(value) {
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : null;
}

function toMoney(value) {
  if (value === "" || value === null || typeof value === "undefined")
    return null;
  const num = parseFloat(String(value).replace(",", "."));
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100) / 100;
}

function toBool(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    if (["false", "0", "no", "inactive", "disabled"].includes(normalized))
      return false;
    return true;
  }
  return false;
}

function linesToArray(value) {
  if (Array.isArray(value))
    return value.map((v) => String(v || "").trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/\r?\n|,/g)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeMediaList(value) {
  if (Array.isArray(value))
    return value.map((v) => String(v || "").trim()).filter(Boolean);
  if (typeof value === "string") return linesToArray(value);
  return [];
}

function normalizeVideoBlock(value) {
  if (!value || typeof value !== "object") return { url: "", thumbnail: "" };
  return {
    url: String(value.url || value.src || "").trim(),
    thumbnail: String(value.thumbnail || value.thumb || "").trim(),
  };
}

function normalizeSectionsList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const title = String(item.title || "").trim();
      const content = String(item.content || item.text || "").trim();
      if (!title && !content) return null;
      return { title, content };
    })
    .filter(Boolean);
}

function normalizeFaqList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const q = String(item.q || item.question || "").trim();
      const a = String(item.a || item.answer || "").trim();
      if (!q && !a) return null;
      return { q, a };
    })
    .filter(Boolean);
}

function normalizeStopsList(value) {
  if (typeof value === "string") {
    return value
      .split(/\r?\n|,/g)
      .map((line) => ({ title: line.trim() }))
      .filter((entry) => entry.title);
  }
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") {
        const title = entry.trim();
        if (!title) return null;
        return { title, description: "", images: [], videos: [] };
      }
      if (!entry || typeof entry !== "object") return null;
      const title = String(entry.title || entry.name || "").trim();
      const description = String(entry.description || entry.text || "").trim();
      const images = normalizeMediaList(entry.images);
      const videos = normalizeMediaList(entry.videos);
      if (!title && !description && !images.length && !videos.length)
        return null;
      return { title, description, images, videos };
    })
    .filter(Boolean);
}

function normalizeMapPoint(value) {
  if (!value) return { label: "", lat: null, lng: null };
  if (typeof value === "string")
    return { label: value.trim(), lat: null, lng: null };
  if (typeof value === "object") {
    return {
      label: String(value.label || value.name || value.title || "").trim(),
      lat: toFloat(value.lat ?? value.latitude),
      lng: toFloat(value.lng ?? value.longitude),
    };
  }
  return { label: "", lat: null, lng: null };
}

function normalizeRouteList(value) {
  if (Array.isArray(value))
    return value
      .map(normalizeMapPoint)
      .filter((pt) => pt.label || (pt.lat !== null && pt.lng !== null));
  if (typeof value === "string") {
    return value
      .split(/\r?\n/g)
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        const parts = trimmed.split(",").map((p) => p.trim());
        const lat = toFloat(parts[0]);
        const lng = toFloat(parts[1]);
        const label = parts.slice(2).join(",").trim();
        return { label, lat, lng };
      })
      .filter(Boolean);
  }
  return [];
}

function normalizeMapBlock(value) {
  const raw = value && typeof value === "object" ? value : {};
  const markers = Array.isArray(raw.markers) ? raw.markers : [];
  const route = normalizeRouteList(raw.route);
  if (!route.length && markers.length) {
    route.push(
      ...markers
        .map(normalizeMapPoint)
        .filter((pt) => pt.label || (pt.lat !== null && pt.lng !== null)),
    );
  }
  return {
    start: normalizeMapPoint(raw.start),
    end: normalizeMapPoint(raw.end),
    route,
  };
}

function normalizeChargeType(value, fallback) {
  const val = String(value || fallback || "per_person")
    .trim()
    .toLowerCase();
  return val === "per_vehicle" ? "per_vehicle" : "per_person";
}

function normalizeModeBlock(modeKey, input) {
  const meta = MODE_DEFAULT_META[modeKey] || {};
  const raw = input && typeof input === "object" ? input : {};
  const block = {
    active: toBool(raw.active),
    title: String(raw.title || "").trim(),
    subtitle: String(raw.subtitle || "").trim(),
    description: String(raw.description || "").trim(),
    duration: String(raw.duration || "").trim(),
    duration_days: parseDurationDaysValue(raw.duration_days),
    price_per_person: toMoney(raw.price_per_person ?? raw.price ?? null),
    price_total: toMoney(raw.price_total),
    charge_type: normalizeChargeType(raw.charge_type, meta.charge_type),
    capacity: toInt(raw.capacity, meta.capacity),
    includes: linesToArray(raw.includes),
    excludes: linesToArray(raw.excludes),
    tags: linesToArray(raw.tags),
    sections: normalizeSectionsList(raw.sections),
    gallery: normalizeMediaList(raw.gallery),
    video: normalizeVideoBlock(raw.video),
    videos: normalizeMediaList(raw.videos),
    stops: normalizeStopsList(raw.stops),
    faq: normalizeFaqList(raw.faq),
    map: normalizeMapBlock(raw.map),
  };
  if (!block.video.url && raw.videoUrl)
    block.video.url = String(raw.videoUrl).trim();
  if (!block.video.thumbnail && raw.videoThumbnail)
    block.video.thumbnail = String(raw.videoThumbnail).trim();
  if (!block.duration) {
    const legacyHours = toInt(raw.duration_hours, 0);
    if (legacyHours > 0) block.duration = `${legacyHours}h`;
  }
  return block;
}

function sanitizeModeKey(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (key === "private") return "mercedes";
  return MODE_KEYS.includes(key) ? key : "van";
}

function deriveModeSetFromModes(modes) {
  const out = {};
  MODE_KEYS.forEach((key) => {
    const block = modes && modes[key] ? modes[key] : baseModeTemplate(key);
    const charge =
      block.charge_type === "per_vehicle" ? "per_vehicle" : "per_person";
    let priceSource =
      charge === "per_vehicle" ? block.price_total : block.price_per_person;
    if (priceSource === null || typeof priceSource === "undefined") {
      priceSource =
        charge === "per_vehicle" ? block.price_per_person : block.price_total;
    }
    const priceCents = Number.isFinite(priceSource)
      ? Math.max(0, Math.round(priceSource * 100))
      : 0;
    out[key] = {
      active: !!block.active,
      price_cents: priceCents,
      charge_type: charge,
      default_capacity: toInt(
        block.capacity,
        MODE_DEFAULT_META[key] ? MODE_DEFAULT_META[key].capacity : 0,
      ),
    };
  });
  return out;
}

function resolveDefaultMode(trip) {
  const preferred = sanitizeModeKey(trip && trip.defaultMode);
  if (
    trip &&
    trip.modes &&
    trip.modes[preferred] &&
    trip.modes[preferred].active
  )
    return preferred;
  const active = MODE_KEYS.find(
    (key) => trip && trip.modes && trip.modes[key] && trip.modes[key].active,
  );
  return active || "van";
}

function projectBaseFieldsFromDefaultMode(trip) {
  if (!trip || !trip.modes) return trip;
  const defaultMode = resolveDefaultMode(trip);
  const mode = trip.modes[defaultMode] || {};
  trip.defaultMode = defaultMode;
  if (!trip.teaser) trip.teaser = mode.subtitle || "";
  if ((!trip.tags || !trip.tags.length) && Array.isArray(mode.tags))
    trip.tags = mode.tags.slice();
  delete trip.description;
  delete trip.duration;
  delete trip.duration_hours;
  delete trip.duration_days;
  return trip;
}

function listHasMeaningfulEntries(value) {
  if (!Array.isArray(value)) return false;
  return value.some((entry) => {
    if (!entry) return false;
    if (typeof entry === "string") return entry.trim().length > 0;
    if (Array.isArray(entry)) return entry.length > 0;
    if (typeof entry === "object") {
      return Object.values(entry).some((val) => {
        if (Array.isArray(val)) return val.length > 0;
        if (val === null || typeof val === "undefined") return false;
        return String(val).trim().length > 0;
      });
    }
    return false;
  });
}

function migrateLegacyTrip(trip) {
  if (!trip || typeof trip !== "object") return trip;
  if (!trip.modes || typeof trip.modes !== "object") trip.modes = {};
  MODE_KEYS.forEach((key) => {
    trip.modes[key] = normalizeModeBlock(key, trip.modes[key]);
  });
  const copyArrayField = (field, transform) => {
    const source = transform ? transform(trip[field]) : trip[field];
    const hasSource = Array.isArray(source)
      ? source.length > 0
      : !!(source && Object.keys(source).length);
    if (!hasSource) return;
    MODE_KEYS.forEach((key) => {
      const block = trip.modes[key];
      const target = block[field];
      const hasTarget = Array.isArray(target)
        ? listHasMeaningfulEntries(target)
        : !!(target && Object.keys(target).length);
      if (!hasTarget) block[field] = cloneJson(source);
    });
    delete trip[field];
  };
  copyArrayField("stops", normalizeStopsList);
  copyArrayField("sections", normalizeSectionsList);
  copyArrayField("includes", linesToArray);
  copyArrayField("excludes", linesToArray);
  copyArrayField("gallery", normalizeMediaList);
  copyArrayField("videos", normalizeMediaList);
  copyArrayField("faq", normalizeFaqList);
  if (trip.description) {
    MODE_KEYS.forEach((key) => {
      const block = trip.modes[key];
      if (!block.description) block.description = trip.description;
    });
  }
  if (trip.duration) {
    MODE_KEYS.forEach((key) => {
      const block = trip.modes[key];
      if (!block.duration) block.duration = trip.duration;
    });
  }
  const legacyHours = toInt(trip.duration_hours, 0);
  if (legacyHours) {
    MODE_KEYS.forEach((key) => {
      const block = trip.modes[key];
      if (!block.duration) block.duration = `${legacyHours}h`;
    });
  }
  const legacyDays = parseDurationDaysValue(trip.duration_days);
  if (hasDurationDaysValue(legacyDays)) {
    MODE_KEYS.forEach((key) => {
      const block = trip.modes[key];
      const existing = parseDurationDaysValue(block.duration_days);
      if (!hasDurationDaysValue(existing)) block.duration_days = legacyDays;
    });
  }
  delete trip.description;
  delete trip.duration;
  delete trip.duration_hours;
  delete trip.duration_days;
  if (trip.video) {
    const normalized = normalizeVideoBlock(trip.video);
    MODE_KEYS.forEach((key) => {
      const block = trip.modes[key];
      if (!block.video || (!block.video.url && !block.video.thumbnail))
        block.video = cloneJson(normalized);
    });
    delete trip.video;
  }
  if (trip.map) {
    const normalizedMap = normalizeMapBlock(trip.map);
    MODE_KEYS.forEach((key) => {
      const block = trip.modes[key];
      if (!block.map || !listHasMeaningfulEntries(block.map.route))
        block.map = cloneJson(normalizedMap);
    });
    delete trip.map;
  }
  const modeSet = trip.mode_set;
  if (modeSet && typeof modeSet === "object") {
    MODE_KEYS.forEach((key) => {
      const block = trip.modes[key];
      const meta = modeSet[key];
      if (!meta) return;
      if (typeof block.active === "undefined") block.active = !!meta.active;
      if (typeof meta.price_cents === "number") {
        const euros = Math.round(meta.price_cents) / 100;
        if ((meta.charge_type || block.charge_type) === "per_vehicle") {
          block.price_total = euros;
          block.charge_type = "per_vehicle";
        } else {
          block.price_per_person = euros;
          block.charge_type = "per_person";
        }
      }
      if (!block.capacity && meta.default_capacity)
        block.capacity = meta.default_capacity;
      if (meta.charge_type) block.charge_type = meta.charge_type;
    });
  }
  return trip;
}

function cleanupLegacyFields(trip) {
  [
    "stops",
    "sections",
    "includes",
    "excludes",
    "gallery",
    "videos",
    "faq",
    "video",
    "map",
    "description",
    "duration",
    "duration_hours",
    "duration_days",
  ].forEach((field) => {
    if (field in trip) delete trip[field];
  });
}

function ensureTripShape(raw) {
  if (!raw || typeof raw !== "object") return null;
  const working = cloneJson(raw) || {};
  migrateLegacyTrip(working);
  const withDefaults = applyTemplateDefaults(working);
  cleanupLegacyFields(withDefaults);
  withDefaults.mode_set = deriveModeSetFromModes(withDefaults.modes);
  projectBaseFieldsFromDefaultMode(withDefaults);
  return withDefaults;
}

function ensureTripsDir() {
  try {
    fs.mkdirSync(TRIPS_DIR, { recursive: true });
  } catch (_) {
    /* ignore */
  }
  try {
    fs.mkdirSync(UPLOAD_TRIPS_DIR, { recursive: true });
  } catch (_) {
    /* ignore */
  }
}

function removeUploadedFiles(files) {
  if (!files) return;
  const list = Array.isArray(files) ? files : [files];
  list.forEach((file) => {
    if (!file || !file.path) return;
    try {
      fs.unlinkSync(file.path);
    } catch (_) {
      /* ignore */
    }
  });
}

function isAllowedImageFile(file) {
  if (!file) return false;
  const typeOk = /^image\//i.test(file.mimetype || "");
  const sizeOk =
    typeof file.size === "number" ? file.size <= MAX_TRIP_IMAGE_BYTES : true;
  return typeOk && sizeOk;
}

function sanitizeSlug(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function hasLegacyDurationFields(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  return LEGACY_DURATION_FIELDS.some((field) =>
    Object.prototype.hasOwnProperty.call(obj, field),
  );
}

function normalizeTripFilePayload(rawObj, filePath, slugLabel) {
  const normalized = ensureTripShape(rawObj);
  if (!hasLegacyDurationFields(rawObj)) return normalized;
  try {
    fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2), "utf8");
    if (slugLabel) {
      console.log("trips: auto-cleaned legacy duration fields for", slugLabel);
    }
  } catch (err) {
    console.warn(
      "trips: failed to auto-clean legacy duration fields",
      slugLabel || filePath,
      err && err.message ? err.message : err,
    );
  }
  return normalized;
}

function readTrip(slug) {
  ensureTripsDir();
  try {
    const safeSlug = sanitizeSlug(slug || "");
    if (!safeSlug || safeSlug === "_template") return null;
    const file = path.join(TRIPS_DIR, safeSlug + ".json");
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, "utf8");
    const obj = JSON.parse(raw || "null");
    return normalizeTripFilePayload(obj, file, safeSlug);
  } catch (e) {
    console.error("trips: readTrip failed", slug, e.message);
    return null;
  }
}

function writeTrip(data) {
  ensureTripsDir();
  try {
    const safeSlug = sanitizeSlug(data && data.slug);
    if (!safeSlug || safeSlug === "_template") return false;
    const file = path.join(TRIPS_DIR, safeSlug + ".json");
    const prepared = ensureTripShape({ ...data, slug: safeSlug }) || {};
    fs.writeFileSync(file, JSON.stringify(prepared, null, 2), "utf8");
    return true;
  } catch (e) {
    console.error("trips: writeTrip failed", data.slug, e.message);
    return false;
  }
}

function deleteTrip(slug) {
  ensureTripsDir();
  try {
    const safeSlug = sanitizeSlug(slug || "");
    if (!safeSlug || safeSlug === "_template") return false;
    const file = path.join(TRIPS_DIR, safeSlug + ".json");
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return true;
  } catch (e) {
    console.error("trips: deleteTrip failed", slug, e.message);
    return false;
  }
}

function listTrips() {
  ensureTripsDir();
  try {
    const fns = fs
      .readdirSync(TRIPS_DIR)
      .filter((f) => f.endsWith(".json") && f !== TEMPLATE_FILENAME);
    return fns
      .map((fn) => {
        try {
          const raw = fs.readFileSync(path.join(TRIPS_DIR, fn), "utf8");
          const obj = JSON.parse(raw || "null");
          const slug = fn.replace(/\.json$/i, "");
          return normalizeTripFilePayload(
            obj,
            path.join(TRIPS_DIR, fn),
            slug,
          );
        } catch (e) {
          console.error("trips: failed to parse", fn, e.message);
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) =>
        String(a.title || "").localeCompare(String(b.title || "")),
      );
  } catch (e) {
    console.error("trips: listTrips failed", e.message);
    return [];
  }
}

function validateTrip(input) {
  const errors = [];
  const title = String(input.title || "").trim();
  const slug = sanitizeSlug(input.slug || title);
  const category = String(input.category || "").trim();
  const subtitle = String(input.subtitle || "").trim();
  const teaser = String(input.teaser || "").trim();
  const coverImage = String(input.coverImage || "").trim();
  const featuredImage = String(input.featuredImage || "").trim();
  const iconPath = String(input.iconPath || "").trim();
  const hasActiveField =
    input && Object.prototype.hasOwnProperty.call(input, "active");
  let normalizedActive;
  if (typeof input.active === "boolean") {
    normalizedActive = input.active;
  } else if (hasActiveField) {
    normalizedActive = toBool(input.active);
  } else {
    normalizedActive = true;
  }
  const currency = String(input.currency || "EUR")
    .trim()
    .toUpperCase();
  const modesPayload = {};
  MODE_KEYS.forEach((key) => {
    const raw = input && input.modes ? input.modes[key] : {};
    modesPayload[key] = normalizeModeBlock(key, raw);
  });
  const activeModes = MODE_KEYS.filter((key) => modesPayload[key].active);
  if (!title) errors.push("missing_title");
  if (!slug) errors.push("missing_slug");
  if (!category) errors.push("missing_category");
  if (!activeModes.length) errors.push("missing_active_mode");
  activeModes.forEach((key) => {
    const block = modesPayload[key];
    if (!block.title) errors.push(`mode_${key}_missing_title`);
    if (!block.description) errors.push(`mode_${key}_missing_description`);
    if (!block.duration && !hasDurationDaysValue(block.duration_days))
      errors.push(`mode_${key}_missing_duration`);
    const charge =
      block.charge_type === "per_vehicle" ? "per_vehicle" : "per_person";
    if (charge === "per_person" && block.price_per_person == null)
      errors.push(`mode_${key}_missing_price`);
    if (charge === "per_vehicle" && block.price_total == null)
      errors.push(`mode_${key}_missing_price`);
    if (!listHasMeaningfulEntries(block.stops))
      errors.push(`mode_${key}_missing_stops`);
    if (!block.includes.length) errors.push(`mode_${key}_missing_includes`);
  });
  const defaultMode = activeModes.includes(sanitizeModeKey(input.defaultMode))
    ? sanitizeModeKey(input.defaultMode)
    : activeModes[0] || "van";
  const mode_set = deriveModeSetFromModes(modesPayload);
  return {
    ok: errors.length === 0,
    errors,
    data: {
      id: input.id || crypto.randomUUID(),
      slug,
      title,
      subtitle,
      teaser,
      category,
      active: normalizedActive !== false,
      coverImage,
      featuredImage,
      iconPath,
      currency,
      defaultMode,
      modes: modesPayload,
      mode_set,
      tags: linesToArray(input.tags),
      createdAt: input.createdAt || "",
      updatedAt: new Date().toISOString(),
    },
  };
}

function registerTripsRoutes(app, { checkAdminAuth }) {
  ensureTripsDir();
  const upload = multer
    ? multer({
        storage: multer.diskStorage({
          destination: (req, file, cb) => {
            try {
              fs.mkdirSync(UPLOAD_TRIPS_DIR, { recursive: true });
            } catch (_) {
              /* ignore */
            }
            cb(null, UPLOAD_TRIPS_DIR);
          },
          filename: (req, file, cb) => {
            const orig = String(file.originalname || "").toLowerCase();
            const extMatch = orig.match(/\.([a-z0-9]+)$/);
            const ext = extMatch ? extMatch[1] : "jpg";
            const stem = sanitizeSlug(
              (req.body && (req.body.slug || req.body.title)) || "file",
            );
            const fname = `${stem}-${Date.now()}.${ext}`;
            cb(null, fname);
          },
        }),
        fileFilter: (req, file, cb) => {
          const name = String(file.originalname || "");
          const ok = /(jpg|jpeg|png|webp|svg)$/i.test(name);
          if (!ok) return cb(new Error("invalid_file_type"));
          cb(null, true);
        },
        limits: { fileSize: MAX_TRIP_IMAGE_BYTES },
      })
    : null;

  const adminRouter = express.Router();
  const jsonParser = express.json({ limit: "400kb" });
  adminRouter.get("/", (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req))
      return res.status(403).json({ error: "Forbidden" });
    return res.json(listTrips());
  });
  adminRouter.get("/template", (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req))
      return res.status(403).json({ error: "Forbidden" });
    return res.json(loadTripTemplate());
  });
  adminRouter.get("/:slug", (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req))
      return res.status(403).json({ error: "Forbidden" });
    const slug = sanitizeSlug(req.params.slug || "");
    if (!slug) return res.status(400).json({ error: "invalid_slug" });
    const trip = readTrip(slug);
    if (!trip) return res.status(404).json({ error: "not_found" });
    return res.json(trip);
  });
  const handleSaveTrip = (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req))
      return res.status(403).json({ error: "Forbidden" });
    const input = req.body && typeof req.body === "object" ? req.body : {};
    const validation = validateTrip(input);
    if (!validation.ok)
      return res
        .status(400)
        .json({ error: "validation_failed", errors: validation.errors });
    const payload = validation.data;
    const existing = readTrip(payload.slug);
    const base = existing ? { ...existing } : applyTemplateDefaults({});
    const toWrite = { ...base, ...payload, slug: payload.slug };
    toWrite.modes = cloneJson(payload.modes);
    MODE_KEYS.forEach((key) => {
      const block = toWrite.modes[key];
      if (!block || typeof block !== "object") return;
      const parsed = parseDurationDaysValue(block.duration_days);
      block.duration_days = hasDurationDaysValue(parsed) ? parsed : null;
    });
    toWrite.mode_set = deriveModeSetFromModes(toWrite.modes);
    ["description", "duration", "duration_hours", "duration_days"].forEach(
      (legacyField) => {
        if (legacyField in toWrite) delete toWrite[legacyField];
      },
    );
    const nowIso = new Date().toISOString();
    if (existing && existing.createdAt) {
      toWrite.createdAt = existing.createdAt;
    } else if (!toWrite.createdAt) {
      toWrite.createdAt = nowIso;
    }
    toWrite.updatedAt = nowIso;
    if (!toWrite.id) toWrite.id = crypto.randomUUID();
    if (!writeTrip(toWrite))
      return res.status(500).json({ error: "write_failed" });
    return res.json({ ok: true, trip: ensureTripShape(toWrite) });
  };

  const handleDeleteTrip = (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req))
      return res.status(403).json({ error: "Forbidden" });
    const slug = sanitizeSlug(
      (req.params && req.params.slug) || (req.body && req.body.slug) || "",
    );
    if (!slug) return res.status(400).json({ error: "invalid_slug" });
    const existing = readTrip(slug);
    if (!existing) return res.status(404).json({ error: "not_found" });
    if (!deleteTrip(slug))
      return res.status(500).json({ error: "delete_failed" });
    return res.json({ success: true });
  };

  adminRouter.post("/", jsonParser, handleSaveTrip);
  adminRouter.post("/save", jsonParser, handleSaveTrip);
  adminRouter.delete("/:slug", handleDeleteTrip);
  adminRouter.post("/delete", jsonParser, handleDeleteTrip);

  adminRouter.post("/upload-trip-image", (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req))
      return res.status(403).json({ error: "Forbidden" });
    if (!upload) return res.status(500).json({ error: "upload_unavailable" });
    upload.single("coverImageFile")(req, res, (err) => {
      if (err) {
        return res
          .status(400)
          .json({
            error: "upload_failed",
            detail: err && err.message ? err.message : String(err),
          });
      }
      const filename = req.file && req.file.filename ? req.file.filename : "";
      if (!filename) return res.status(400).json({ error: "no_file" });
      return res.json({
        ok: true,
        filename,
        url: `/uploads/trips/${filename}`,
      });
    });
  });

  adminRouter.post("/upload-trip-icon", (req, res) => {
    if (!checkAdminAuth || !checkAdminAuth(req))
      return res.status(403).json({ error: "Forbidden" });
    if (!upload) return res.status(500).json({ error: "upload_unavailable" });
    upload.single("tripIconFile")(req, res, (err) => {
      if (err) {
        return res
          .status(400)
          .json({
            error: "upload_failed",
            detail: err && err.message ? err.message : String(err),
          });
      }
      const filename = req.file && req.file.filename ? req.file.filename : "";
      if (!filename) return res.status(400).json({ error: "no_file" });
      return res.json({
        ok: true,
        filename,
        url: `/uploads/trips/${filename}`,
      });
    });
  });

  app.use("/api/admin/trips", adminRouter);
  if (upload) {
    const stopImagesUpload = upload.array("images", MAX_TRIP_IMAGE_COUNT);
    app.post("/api/upload-trip-image", (req, res) => {
      if (!checkAdminAuth || !checkAdminAuth(req))
        return res.status(403).json({ error: "Forbidden" });
      stopImagesUpload(req, res, (err) => {
        if (err)
          return res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
            error: "upload_failed",
            detail: err && err.message ? err.message : "upload_failed",
          });
        const files = Array.isArray(req.files) ? req.files : [];
        if (!files.length) return res.status(400).json({ error: "no_files" });
        const invalid = files.find((file) => !isAllowedImageFile(file));
        if (invalid) {
          removeUploadedFiles(files);
          return res.status(400).json({
            error: "invalid_file_type",
            detail: "Μόνο εικόνες έως 4MB (JPG, PNG, WEBP, SVG).",
          });
        }
        return res.json({
          ok: true,
          files: files.map((file) => ({
            filename: file.filename,
            url: `/uploads/trips/${file.filename}`,
            size: file.size || 0,
          })),
        });
      });
    });
    app.post("/api/admin/upload-trip-image", (req, res) => {
      if (!checkAdminAuth || !checkAdminAuth(req))
        return res.status(403).json({ error: "Forbidden" });
      upload.single("coverImageFile")(req, res, (err) => {
        if (err)
          return res
            .status(400)
            .json({
              error: "upload_failed",
              detail: err && err.message ? err.message : String(err),
            });
        const filename = req.file && req.file.filename ? req.file.filename : "";
        if (!filename) return res.status(400).json({ error: "no_file" });
        return res.json({
          ok: true,
          filename,
          url: `/uploads/trips/${filename}`,
        });
      });
    });
    app.post("/api/admin/upload-trip-icon", (req, res) => {
      if (!checkAdminAuth || !checkAdminAuth(req))
        return res.status(403).json({ error: "Forbidden" });
      upload.single("tripIconFile")(req, res, (err) => {
        if (err)
          return res
            .status(400)
            .json({
              error: "upload_failed",
              detail: err && err.message ? err.message : String(err),
            });
        const filename = req.file && req.file.filename ? req.file.filename : "";
        if (!filename) return res.status(400).json({ error: "no_file" });
        return res.json({
          ok: true,
          filename,
          url: `/uploads/trips/${filename}`,
        });
      });
    });
  }

  app.get("/api/public/trips", (req, res) => {
    return res.json(listTrips());
  });
  app.get("/api/public/trips/:slug", (req, res) => {
    const slug = sanitizeSlug(req.params.slug || "");
    if (!slug) return res.status(400).json({ error: "invalid_slug" });
    const trip = readTrip(slug);
    if (!trip) return res.status(404).json({ error: "not_found" });
    return res.json(trip);
  });

  console.log("trips: routes registered");
}

module.exports = { registerTripsRoutes };
