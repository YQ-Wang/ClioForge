CREATE TABLE source_groups(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),created_at TEXT NOT NULL,UNIQUE(project_id,name),UNIQUE(id,project_id));
CREATE INDEX source_group_project ON source_groups(project_id,created_at);
CREATE TABLE source_organization(source_id TEXT PRIMARY KEY,project_id TEXT NOT NULL,group_id TEXT,trashed_at TEXT,updated_at TEXT NOT NULL,FOREIGN KEY(source_id,project_id) REFERENCES sources(id,project_id),FOREIGN KEY(group_id,project_id) REFERENCES source_groups(id,project_id));
CREATE INDEX source_organization_group ON source_organization(project_id,group_id);
CREATE INDEX source_organization_trash ON source_organization(project_id,trashed_at);
