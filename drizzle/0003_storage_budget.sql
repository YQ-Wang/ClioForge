CREATE TABLE upload_reservations(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES user(id), project_id TEXT NOT NULL REFERENCES projects(id), bytes INTEGER NOT NULL CHECK(bytes>0 AND bytes<=20971520), created_at TEXT NOT NULL);
CREATE INDEX upload_reservation_owner ON upload_reservations(owner_id);
-- Earlier receipts did not record size. Conservatively account for their maximum allowed size.
INSERT INTO upload_reservations(id,owner_id,project_id,bytes,created_at) SELECT id,owner_id,project_id,20971520,created_at FROM upload_receipts;
