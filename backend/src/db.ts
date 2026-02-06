import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const dbPath = process.env.DB_PATH || path.join(process.cwd(), "db.sqlite");

// Создаём папку под БД если путь включает директорию
const dir = path.dirname(dbPath);
if (dir && dir !== "." && !fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

export const db = new Database(dbPath);

// Включим нужные pragma
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    db.prepare("SELECT id FROM migrations").all().map((r: any) => r.id)
  );

  const migrations: { id: string; sql: string }[] = [
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
    {
      id: "002_nutrition_training",
      sql: `
        CREATE TABLE IF NOT EXISTS foods (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tg_user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          base_grams INTEGER,
          kcal REAL NOT NULL,
          protein REAL NOT NULL,
          fat REAL NOT NULL,
          carbs REAL NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_foods_user ON foods(tg_user_id);

        CREATE TABLE IF NOT EXISTS nutrition_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tg_user_id TEXT NOT NULL,
          date TEXT NOT NULL,
          food_id INTEGER,
          name TEXT NOT NULL,
          grams REAL NOT NULL,
          kcal REAL NOT NULL,
          protein REAL NOT NULL,
          fat REAL NOT NULL,
          carbs REAL NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(food_id) REFERENCES foods(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_nutrition_entries_user_date
        ON nutrition_entries(tg_user_id, date);

        CREATE TABLE IF NOT EXISTS exercises (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tg_user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          category TEXT,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_exercises_user ON exercises(tg_user_id);

        CREATE TABLE IF NOT EXISTS workout_sets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tg_user_id TEXT NOT NULL,
          date TEXT NOT NULL,
          exercise_id INTEGER NOT NULL,
          weight REAL NOT NULL,
          reps INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_workout_sets_user_date
        ON workout_sets(tg_user_id, date);

        CREATE TABLE IF NOT EXISTS daily_stats (
          tg_user_id TEXT NOT NULL,
          date TEXT NOT NULL,
          weight_kg REAL,
          water_ml INTEGER,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (tg_user_id, date)
        );
      `,
    },
  ];

  const insertMigration = db.prepare(
    "INSERT INTO migrations (id, applied_at) VALUES (?, ?)"
  );

  for (const m of migrations) {
    if (applied.has(m.id)) continue;
    db.exec(m.sql);
    insertMigration.run(m.id, new Date().toISOString());
    console.log(`Applied migration ${m.id}`);
  }

  db.exec(`
  CREATE TABLE IF NOT EXISTS day_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    space_id INTEGER NOT NULL,
    date TEXT NOT NULL,                    -- YYYY-MM-DD
    author_tg_user_id TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_day_notes_space_date
  ON day_notes(space_id, date);

  CREATE INDEX IF NOT EXISTS idx_day_notes_space_date_created
  ON day_notes(space_id, date, created_at);
`);

}
