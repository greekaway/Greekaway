-- =========================================================
-- PostgreSQL Schema for Greekaway + MoveAthens
-- Designed to replace JSON file storage with persistent DB
-- =========================================================

-- Enable UUID extension if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================================================
-- GREEKAWAY TABLES
-- =========================================================

-- Categories (replaces data/categories.json)
CREATE TABLE IF NOT EXISTS gk_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    icon_path VARCHAR(512),
    display_order INTEGER DEFAULT 0,
    published BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gk_categories_slug ON gk_categories(slug);
CREATE INDEX IF NOT EXISTS idx_gk_categories_published ON gk_categories(published);

-- Trips (replaces data/trips/*.json)
CREATE TABLE IF NOT EXISTS gk_trips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    subtitle TEXT,
    teaser TEXT,
    category VARCHAR(255),
    active BOOLEAN DEFAULT true,
    default_mode VARCHAR(50) DEFAULT 'van',
    icon_path VARCHAR(512),
    cover_image VARCHAR(512),
    featured_image VARCHAR(512),
    hero_video_url VARCHAR(512),
    hero_thumbnail VARCHAR(512),
    currency VARCHAR(10) DEFAULT 'EUR',
    tags JSONB DEFAULT '[]'::jsonb,
    gallery JSONB DEFAULT '[]'::jsonb,
    videos JSONB DEFAULT '[]'::jsonb,
    modes JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gk_trips_slug ON gk_trips(slug);
CREATE INDEX IF NOT EXISTS idx_gk_trips_category ON gk_trips(category);
CREATE INDEX IF NOT EXISTS idx_gk_trips_active ON gk_trips(active);

-- =========================================================
-- MOVEATHENS TABLES
-- =========================================================

-- UI Config (replaces moveathens/data/moveathens_ui.json - static config)
CREATE TABLE IF NOT EXISTS ma_config (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- singleton row
    hero_video_url VARCHAR(512),
    hero_logo_url VARCHAR(512),
    hero_headline VARCHAR(255),
    hero_subtext TEXT,
    footer_labels JSONB DEFAULT '{}'::jsonb,
    footer_icons JSONB DEFAULT '{}'::jsonb,
    phone_number VARCHAR(50),
    whatsapp_number VARCHAR(50),
    company_email VARCHAR(255),
    cta_labels JSONB DEFAULT '{}'::jsonb,
    contact_labels JSONB DEFAULT '{}'::jsonb,
    hotel_context_labels JSONB DEFAULT '{}'::jsonb,
    hotel_email_subject_prefix VARCHAR(255),
    info_page_title VARCHAR(255),
    info_page_content TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Hotels (was Transfer Zones — repurposed to store hotel records)
CREATE TABLE IF NOT EXISTS ma_transfer_zones (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    zone_type VARCHAR(50) NOT NULL DEFAULT 'suburb' CHECK (zone_type IN ('city_area', 'suburb', 'port', 'airport')),
    municipality VARCHAR(255) DEFAULT '',
    address VARCHAR(500) DEFAULT '',
    phone VARCHAR(50) DEFAULT '',
    email VARCHAR(255) DEFAULT '',
    accommodation_type VARCHAR(30) DEFAULT 'hotel' CHECK (accommodation_type IN ('hotel', 'rental_rooms')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ma_zones_active ON ma_transfer_zones(is_active);

-- Vehicle Types (from moveathens_ui.json vehicleTypes)
CREATE TABLE IF NOT EXISTS ma_vehicle_types (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    image_url VARCHAR(512),
    max_passengers INTEGER DEFAULT 4,
    luggage_large INTEGER DEFAULT 2,
    luggage_medium INTEGER DEFAULT 2,
    luggage_cabin INTEGER DEFAULT 4,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    allow_instant BOOLEAN DEFAULT true,
    min_advance_minutes INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ma_vehicles_active ON ma_vehicle_types(is_active);

-- Destination Categories (from moveathens_ui.json destinationCategories)
CREATE TABLE IF NOT EXISTS ma_destination_categories (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    icon VARCHAR(512),
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ma_dest_cats_active ON ma_destination_categories(is_active);

-- Destinations (from moveathens_ui.json destinations)
CREATE TABLE IF NOT EXISTS ma_destinations (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category_id VARCHAR(50) REFERENCES ma_destination_categories(id) ON DELETE SET NULL,
    zone_id VARCHAR(50) REFERENCES ma_transfer_zones(id) ON DELETE SET NULL,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ma_destinations_category ON ma_destinations(category_id);
CREATE INDEX IF NOT EXISTS idx_ma_destinations_zone ON ma_destinations(zone_id);
CREATE INDEX IF NOT EXISTS idx_ma_destinations_active ON ma_destinations(is_active);

-- Transfer Prices (from moveathens_ui.json transferPrices)
CREATE TABLE IF NOT EXISTS ma_transfer_prices (
    id VARCHAR(100) PRIMARY KEY,
    origin_zone_id VARCHAR(50) REFERENCES ma_transfer_zones(id) ON DELETE CASCADE,
    destination_id VARCHAR(50) REFERENCES ma_destinations(id) ON DELETE CASCADE,
    vehicle_type_id VARCHAR(50) REFERENCES ma_vehicle_types(id) ON DELETE CASCADE,
    tariff VARCHAR(20) NOT NULL CHECK (tariff IN ('day', 'night')),
    price DECIMAL(10, 2) NOT NULL,
    commission_driver DECIMAL(10, 2) DEFAULT 0,
    commission_hotel DECIMAL(10, 2) DEFAULT 0,
    commission_service DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(origin_zone_id, destination_id, vehicle_type_id, tariff)
);

CREATE INDEX IF NOT EXISTS idx_ma_prices_origin ON ma_transfer_prices(origin_zone_id);
CREATE INDEX IF NOT EXISTS idx_ma_prices_dest ON ma_transfer_prices(destination_id);
CREATE INDEX IF NOT EXISTS idx_ma_prices_vehicle ON ma_transfer_prices(vehicle_type_id);

-- Vehicle Category Availability (which vehicles available per destination category)
CREATE TABLE IF NOT EXISTS ma_vehicle_category_availability (
    id SERIAL PRIMARY KEY,
    category_id VARCHAR(50) REFERENCES ma_destination_categories(id) ON DELETE CASCADE,
    vehicle_type_id VARCHAR(50) REFERENCES ma_vehicle_types(id) ON DELETE CASCADE,
    is_available BOOLEAN DEFAULT true,
    UNIQUE(category_id, vehicle_type_id)
);

-- Vehicle Destination Overrides (special pricing/availability per destination)
CREATE TABLE IF NOT EXISTS ma_vehicle_destination_overrides (
    id SERIAL PRIMARY KEY,
    destination_id VARCHAR(50) REFERENCES ma_destinations(id) ON DELETE CASCADE,
    vehicle_type_id VARCHAR(50) REFERENCES ma_vehicle_types(id) ON DELETE CASCADE,
    is_available BOOLEAN DEFAULT true,
    price_override DECIMAL(10, 2),
    UNIQUE(destination_id, vehicle_type_id)
);

-- =========================================================
-- MOVEATHENS DRIVERS & TRANSFER REQUESTS
-- =========================================================

-- Drivers table (profile per phone number)
CREATE TABLE IF NOT EXISTS ma_drivers (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(200) NOT NULL DEFAULT '',
    phone VARCHAR(50) NOT NULL UNIQUE,
    notes TEXT DEFAULT '',
    total_trips INTEGER DEFAULT 0,
    total_revenue DECIMAL(12, 2) DEFAULT 0,
    total_owed DECIMAL(12, 2) DEFAULT 0,
    total_paid DECIMAL(12, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ma_drivers_phone ON ma_drivers(phone);

-- Transfer requests table
CREATE TABLE IF NOT EXISTS ma_transfer_requests (
    id VARCHAR(50) PRIMARY KEY,
    origin_zone_id VARCHAR(50),
    origin_zone_name VARCHAR(200) DEFAULT '',
    hotel_name VARCHAR(200) DEFAULT '',
    hotel_address VARCHAR(300) DEFAULT '',
    destination_id VARCHAR(50),
    destination_name VARCHAR(200) DEFAULT '',
    vehicle_type_id VARCHAR(50),
    vehicle_name VARCHAR(200) DEFAULT '',
    tariff VARCHAR(20) DEFAULT 'day',
    booking_type VARCHAR(20) DEFAULT 'instant',
    scheduled_date VARCHAR(20) DEFAULT '',
    scheduled_time VARCHAR(10) DEFAULT '',
    passenger_name VARCHAR(200) DEFAULT '',
    passengers INTEGER DEFAULT 0,
    luggage_large INTEGER DEFAULT 0,
    luggage_medium INTEGER DEFAULT 0,
    luggage_cabin INTEGER DEFAULT 0,
    payment_method VARCHAR(20) DEFAULT 'cash',
    price DECIMAL(10, 2) DEFAULT 0,
    commission_driver DECIMAL(10, 2) DEFAULT 0,
    commission_hotel DECIMAL(10, 2) DEFAULT 0,
    commission_service DECIMAL(10, 2) DEFAULT 0,
    driver_id VARCHAR(50) REFERENCES ma_drivers(id) ON DELETE SET NULL,
    driver_phone VARCHAR(50) DEFAULT '',
    accept_token VARCHAR(100) UNIQUE,
    status VARCHAR(30) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    expired_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ma_requests_status ON ma_transfer_requests(status);
CREATE INDEX IF NOT EXISTS idx_ma_requests_driver ON ma_transfer_requests(driver_id);
CREATE INDEX IF NOT EXISTS idx_ma_requests_token ON ma_transfer_requests(accept_token);

-- Driver payments table
CREATE TABLE IF NOT EXISTS ma_driver_payments (
    id VARCHAR(50) PRIMARY KEY,
    driver_id VARCHAR(50) NOT NULL REFERENCES ma_drivers(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    note TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ma_payments_driver ON ma_driver_payments(driver_id);

-- =========================================================
-- HELPER FUNCTIONS
-- =========================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to all tables with updated_at
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE column_name = 'updated_at' 
        AND table_schema = 'public'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS update_%I_updated_at ON %I', t, t);
        EXECUTE format('CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t, t);
    END LOOP;
END;
$$;

-- =========================================================
-- VIEWS FOR CONVENIENCE
-- =========================================================

-- Full transfer pricing view (joins zones, destinations, vehicles)
CREATE OR REPLACE VIEW ma_transfer_pricing_full AS
SELECT 
    p.id,
    p.tariff,
    p.price,
    oz.id AS origin_zone_id,
    oz.name AS origin_zone_name,
    oz.zone_type AS origin_zone_type,
    d.id AS destination_id,
    d.name AS destination_name,
    dc.id AS destination_category_id,
    dc.name AS destination_category_name,
    v.id AS vehicle_type_id,
    v.name AS vehicle_type_name,
    v.max_passengers,
    v.image_url AS vehicle_image
FROM ma_transfer_prices p
JOIN ma_transfer_zones oz ON p.origin_zone_id = oz.id
JOIN ma_destinations d ON p.destination_id = d.id
LEFT JOIN ma_destination_categories dc ON d.category_id = dc.id
JOIN ma_vehicle_types v ON p.vehicle_type_id = v.id
WHERE oz.is_active = true 
  AND d.is_active = true 
  AND v.is_active = true;
