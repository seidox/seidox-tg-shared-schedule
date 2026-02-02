"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
exports.migrate = migrate;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dbPath = process.env.DB_PATH || path_1.default.join(process.cwd(), "db.sqlite");
// Создаём папку под БД если путь включает директорию
const dir = path_1.default.dirname(dbPath);
if (dir && dir !== "." && !fs_1.default.existsSync(dir)) {
    fs_1.default.mkdirSync(dir, { recursive: true });
}
exports.db = new better_sqlite3_1.default(dbPath);
// Включим нужные pragma
exports.db.pragma("journal_mode = WAL");
exports.db.pragma("foreign_keys = ON");
function migrate() {
    exports.db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
    const applied = new Set(exports.db.prepare("SELECT id FROM migrations").all().map((r) => r.id));
    const migrations = [
        {
            id: "001_init",
            sql: `
        CREATE TABLE IF NOT EXISTS spaces (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pin_hash TEXT,
          pin_expires_at TEXT,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS members (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          space_id INTEGER NOT NULL,
          tg_user_id TEXT NOT NULL,
          role TEXT NOT NULL,
          joined_at TEXT NOT NULL,
          UNIQUE(space_id, tg_user_id),
          FOREIGN KEY(space_id) REFERENCES spaces(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS series (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          space_id INTEGER NOT NULL,
          owner_tg_user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          color TEXT NOT NULL,
          start_time_min INTEGER,
          end_time_min INTEGER,
          time_kind TEXT NOT NULL,
          recurrence_kind TEXT NOT NULL,
          single_date TEXT,
          weekly_mask INTEGER,
          cycle_pattern TEXT,
          cycle_anchor_date TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(space_id) REFERENCES spaces(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS overrides (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          series_id INTEGER NOT NULL,
          date TEXT NOT NULL,
          is_cancelled INTEGER NOT NULL DEFAULT 0,
          title_override TEXT,
          start_time_min_override INTEGER,
          end_time_min_override INTEGER,
          time_kind_override TEXT,
          color_override TEXT,
          updated_at TEXT NOT NULL,
          UNIQUE(series_id, date),
          FOREIGN KEY(series_id) REFERENCES series(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS notes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          series_id INTEGER NOT NULL,
          date TEXT NOT NULL,
          space_id INTEGER NOT NULL,
          author_tg_user_id TEXT NOT NULL,
          text TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(series_id) REFERENCES series(id) ON DELETE CASCADE,
          FOREIGN KEY(space_id) REFERENCES spaces(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_series_space ON series(space_id);
        CREATE INDEX IF NOT EXISTS idx_overrides_series ON overrides(series_id);
        CREATE INDEX IF NOT EXISTS idx_notes_space_date ON notes(space_id, date);
      `,
        },
    ];
    const insertMigration = exports.db.prepare("INSERT INTO migrations (id, applied_at) VALUES (?, ?)");
    for (const m of migrations) {
        if (applied.has(m.id))
            continue;
        exports.db.exec(m.sql);
        insertMigration.run(m.id, new Date().toISOString());
        console.log(`Applied migration ${m.id}`);
    }
}
//# sourceMappingURL=db.js.map