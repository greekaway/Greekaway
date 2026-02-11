-- Driver timeline timestamps: track each state change for analytics
-- arrived_at       = driver pressed "Έφτασα" (at hotel)
-- navigating_dest_at = driver pressed "Πλοήγηση στον προορισμό" (passenger picked up)
-- completed_at     = driver pressed "Ολοκλήρωση"

ALTER TABLE ma_transfer_requests ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;
ALTER TABLE ma_transfer_requests ADD COLUMN IF NOT EXISTS navigating_dest_at TIMESTAMPTZ;
ALTER TABLE ma_transfer_requests ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
