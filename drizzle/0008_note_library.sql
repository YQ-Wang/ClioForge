CREATE TABLE note_state (note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1)), archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)));
CREATE INDEX note_state_project ON note_state(project_id);
