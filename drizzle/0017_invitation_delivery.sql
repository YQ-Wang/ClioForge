CREATE TABLE invitation_deliveries(invitation_id TEXT PRIMARY KEY REFERENCES project_invitations(id) ON DELETE CASCADE ON UPDATE CASCADE, owner_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, status TEXT NOT NULL CHECK(status IN ('sending','sent','uncertain')), attempted_at TEXT NOT NULL);
CREATE INDEX invitation_delivery_owner ON invitation_deliveries(owner_id,attempted_at);
