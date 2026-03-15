-- Add media_links column to ma_destinations (2026-03-15)
-- Stores JSON: {"instagram":[{id,url,title}],"tiktok":[...],"youtube":[...]}
ALTER TABLE ma_destinations ADD COLUMN IF NOT EXISTS media_links TEXT DEFAULT '';
