CREATE TABLE account_preferences(owner_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE, locale TEXT NOT NULL CHECK(locale IN ('zh-CN','en')), updated_at TEXT NOT NULL);
