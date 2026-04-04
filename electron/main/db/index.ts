import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db

  const userDataPath = app.getPath('userData')
  const dbPath = path.join(userDataPath, 'reyna-pos.db')

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  runMigrations(db)
  return db
}

const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: '001_init.sql',
    sql: `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, pin TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','cashier')), is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT);
CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, sort_order INTEGER NOT NULL DEFAULT 0, deleted_at TEXT);
CREATE TABLE IF NOT EXISTS variation_groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, deleted_at TEXT);
CREATE TABLE IF NOT EXISTS variation_options (id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES variation_groups(id), name TEXT NOT NULL, price REAL NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0, deleted_at TEXT);
CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, image_path TEXT, barcode TEXT UNIQUE, category_id TEXT REFERENCES categories(id), base_price REAL NOT NULL DEFAULT 0, base_cost REAL NOT NULL DEFAULT 0, markup_pct REAL, has_variations INTEGER NOT NULL DEFAULT 0, variation_group_id TEXT REFERENCES variation_groups(id), allow_fractions INTEGER NOT NULL DEFAULT 0, track_inventory INTEGER NOT NULL DEFAULT 1, is_active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, monthly_sold REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT);
CREATE TABLE IF NOT EXISTS inventory (id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), quantity REAL NOT NULL DEFAULT 0, low_threshold REAL NOT NULL DEFAULT 5, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS stock_movements (id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), type TEXT NOT NULL CHECK(type IN ('sale','restock','adjustment','return')), quantity REAL NOT NULL, reference_id TEXT, note TEXT, user_id TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now')), synced INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, order_number TEXT NOT NULL UNIQUE, customer_name TEXT, status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('pending','completed','cancelled','void')), subtotal REAL NOT NULL DEFAULT 0, discount REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0, payment_amount REAL, change_amount REAL, is_credit INTEGER NOT NULL DEFAULT 0, debtor_id TEXT REFERENCES debtors(id), user_id TEXT REFERENCES users(id), note TEXT, exclude_sales INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT, synced INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS order_items (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), product_id TEXT REFERENCES products(id), name TEXT NOT NULL, price REAL NOT NULL, cost REAL NOT NULL DEFAULT 0, quantity REAL NOT NULL, subtotal REAL NOT NULL, is_custom INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS saved_orders (id TEXT PRIMARY KEY, name TEXT NOT NULL, items_json TEXT NOT NULL, total REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS debtors (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, balance REAL NOT NULL DEFAULT 0, total_credit REAL NOT NULL DEFAULT 0, total_paid REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT, synced INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS debtor_transactions (id TEXT PRIMARY KEY, debtor_id TEXT NOT NULL REFERENCES debtors(id), type TEXT NOT NULL CHECK(type IN ('debt','payment','note')), amount REAL NOT NULL DEFAULT 0, profit REAL NOT NULL DEFAULT 0, note TEXT, order_id TEXT REFERENCES orders(id), user_id TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now')), synced INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sync_queue (id TEXT PRIMARY KEY, table_name TEXT NOT NULL, record_id TEXT NOT NULL, operation TEXT NOT NULL CHECK(operation IN ('insert','update','delete')), payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), synced_at TEXT);
CREATE TABLE IF NOT EXISTS audit_log (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), action TEXT NOT NULL, table_name TEXT, record_id TEXT, old_value TEXT, new_value TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_pid ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_debtor_tx_debtor ON debtor_transactions(debtor_id);
    `,
  },
  {
    name: '002_seed.sql',
    sql: `
INSERT OR IGNORE INTO users (id, name, pin, role) VALUES ('admin-001', 'Admin', '1234', 'admin');
INSERT OR IGNORE INTO categories (id, name, sort_order) VALUES ('cat-candy','Candy',1),('cat-chichirya','Chichirya',2),('cat-cigs','Cigarettes',3),('cat-foods','Foods',4),('cat-laundry','Laundry',5),('cat-morning','Morning items',6),('cat-seasoning','Seasoning',7);
INSERT OR IGNORE INTO variation_groups (id, name) VALUES ('vg-size','Size'),('vg-drinks','Drinks');
INSERT OR IGNORE INTO variation_options (id, group_id, name, price, cost, sort_order) VALUES ('vo-small','vg-size','Small',35,25,1),('vo-medium','vg-size','Medium',45,35,2),('vo-large','vg-size','Large',55,45,3),('vo-swakto','vg-drinks','Swakto',0,0,1),('vo-mismo','vg-drinks','Mismo',0,0,2),('vo-litrog','vg-drinks','Litro - Glass',0,0,3),('vo-litrop','vg-drinks','Litro - Plastic',0,0,4),('vo-1p5l','vg-drinks','1.5 L',0,0,5),('vo-1p75l','vg-drinks','1.75 L',0,0,6);
INSERT OR IGNORE INTO settings (key, value) VALUES ('store_name','Reyna Store'),('thermal_enabled','false'),('paper_size','58mm'),('printer_interface',''),('inventory_enabled','true'),('cashier_manage_debtors','false'),('buyer_page_enabled','true'),('oos_blocking','true'),('sound_alerts','true'),('store_closed','false'),('ai_image_recognition','false'),('cloud_sync_url',''),('cloud_sync_enabled','false');
    `,
  },
]

function runMigrations(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      run_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const ran = new Set(
    database.prepare('SELECT name FROM _migrations').all().map((r: any) => r.name)
  )

  for (const migration of MIGRATIONS) {
    if (ran.has(migration.name)) continue
    try {
      database.exec(migration.sql)
      database.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration.name)
      console.log(`[DB] Migration applied: ${migration.name}`)
    } catch (err) {
      console.error(`[DB] Migration failed: ${migration.name}`, err)
      throw err
    }
  }
}

export function closeDb() {
  db?.close()
  db = null
}
