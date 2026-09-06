CREATE TABLE semantic_chunks(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,version_id TEXT NOT NULL REFERENCES source_versions(id) ON DELETE CASCADE,page INTEGER NOT NULL,start INTEGER NOT NULL,text TEXT NOT NULL,model TEXT NOT NULL,vector TEXT NOT NULL CHECK(json_valid(vector)),created_at TEXT NOT NULL,UNIQUE(version_id,page,start,model));
CREATE INDEX semantic_project ON semantic_chunks(project_id,model);
CREATE TABLE direct_run_costs_v2(run_id TEXT PRIMARY KEY REFERENCES research_runs(id), project_id TEXT NOT NULL REFERENCES projects(id), owner_id TEXT NOT NULL REFERENCES user(id), phase TEXT NOT NULL CHECK(phase IN ('reserved','calling','settled','uncertain')), reserved_units INTEGER NOT NULL CHECK(reserved_units>=0), input_rate REAL NOT NULL CHECK(input_rate>0), output_rate REAL NOT NULL CHECK(output_rate>=0), max_output INTEGER NOT NULL CHECK(max_output>=0), created_at TEXT NOT NULL);
INSERT INTO direct_run_costs_v2 SELECT * FROM direct_run_costs;
DROP TABLE direct_run_costs;
ALTER TABLE direct_run_costs_v2 RENAME TO direct_run_costs;
CREATE INDEX direct_run_costs_owner ON direct_run_costs(owner_id,created_at);
