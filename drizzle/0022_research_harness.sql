ALTER TABLE research_jobs ADD COLUMN diagnostics TEXT CHECK(diagnostics IS NULL OR json_valid(diagnostics));
ALTER TABLE mission_tasks ADD COLUMN failure_stage TEXT;
