CREATE TABLE work_items (
  id          TEXT PRIMARY KEY,
  parent_id   TEXT REFERENCES work_items(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'todo'
                CHECK(status IN ('todo','active','done','blocked','cancelled')),
  notes       TEXT,
  sort_order  REAL NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);

CREATE INDEX idx_work_items_parent  ON work_items(parent_id);
CREATE INDEX idx_work_items_status  ON work_items(status);
CREATE INDEX idx_work_items_deleted ON work_items(deleted_at);
