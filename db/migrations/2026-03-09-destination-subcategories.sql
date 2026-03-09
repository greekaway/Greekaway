-- MoveAthens: Destination Subcategories + Extended Destination Fields
-- 2026-03-09

-- Subcategories table
CREATE TABLE IF NOT EXISTS ma_destination_subcategories (
    id VARCHAR(50) PRIMARY KEY,
    category_id VARCHAR(50) REFERENCES ma_destination_categories(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ma_dest_subcats_category ON ma_destination_subcategories(category_id);
CREATE INDEX IF NOT EXISTS idx_ma_dest_subcats_active ON ma_destination_subcategories(is_active);

-- Add subcategory_id to destinations
ALTER TABLE ma_destinations ADD COLUMN IF NOT EXISTS subcategory_id VARCHAR(50) REFERENCES ma_destination_subcategories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ma_destinations_subcategory ON ma_destinations(subcategory_id);

-- Extended destination fields
ALTER TABLE ma_destinations ADD COLUMN IF NOT EXISTS venue_type VARCHAR(100) DEFAULT '';
ALTER TABLE ma_destinations ADD COLUMN IF NOT EXISTS vibe VARCHAR(100) DEFAULT '';
ALTER TABLE ma_destinations ADD COLUMN IF NOT EXISTS area VARCHAR(100) DEFAULT '';
ALTER TABLE ma_destinations ADD COLUMN IF NOT EXISTS indicative_price VARCHAR(100) DEFAULT '';
ALTER TABLE ma_destinations ADD COLUMN IF NOT EXISTS suitable_for VARCHAR(200) DEFAULT '';
ALTER TABLE ma_destinations ADD COLUMN IF NOT EXISTS rating VARCHAR(20) DEFAULT '';
ALTER TABLE ma_destinations ADD COLUMN IF NOT EXISTS michelin VARCHAR(50) DEFAULT '';
ALTER TABLE ma_destinations ADD COLUMN IF NOT EXISTS details TEXT DEFAULT '';
ALTER TABLE ma_destinations ADD COLUMN IF NOT EXISTS main_artist VARCHAR(150) DEFAULT '';
ALTER TABLE ma_destinations ADD COLUMN IF NOT EXISTS participating_artists TEXT DEFAULT '';
ALTER TABLE ma_destinations ADD COLUMN IF NOT EXISTS program_info TEXT DEFAULT '';
ALTER TABLE ma_destinations ADD COLUMN IF NOT EXISTS operating_days VARCHAR(100) DEFAULT '';
ALTER TABLE ma_destinations ADD COLUMN IF NOT EXISTS opening_time VARCHAR(10) DEFAULT '';
ALTER TABLE ma_destinations ADD COLUMN IF NOT EXISTS closing_time VARCHAR(10) DEFAULT '';
