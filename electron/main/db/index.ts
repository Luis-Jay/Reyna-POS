import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

let db: Database.Database | null = null
let currentDbPath: string | null = null

type AccountState = {
  activeCloudUserId: string | null
}

const ACCOUNT_STATE_FILENAME = 'account-state.json'
const STORAGE_ROOT_DIRNAME = 'account-data'
const LOCAL_SCOPE = 'local-device'

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function getUserDataPath() {
  return app.getPath('userData')
}

function getAccountStatePath() {
  return path.join(getUserDataPath(), ACCOUNT_STATE_FILENAME)
}

function normalizeScopeKey(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function readAccountState(): AccountState {
  try {
    const raw = fs.readFileSync(getAccountStatePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<AccountState>
    return {
      activeCloudUserId: typeof parsed.activeCloudUserId === 'string' ? parsed.activeCloudUserId : null,
    }
  } catch {
    return { activeCloudUserId: null }
  }
}

function writeAccountState(state: AccountState) {
  fs.writeFileSync(getAccountStatePath(), JSON.stringify(state, null, 2))
}

function getStorageRootPath() {
  const storageRoot = path.join(getUserDataPath(), STORAGE_ROOT_DIRNAME)
  ensureDir(storageRoot)
  return storageRoot
}

function getScopeKey(cloudUserId: string | null) {
  return cloudUserId ? `cloud-${normalizeScopeKey(cloudUserId)}` : LOCAL_SCOPE
}

export function getDbPathForCloudUser(cloudUserId: string | null) {
  return path.join(getStorageDirForCloudUser(cloudUserId), 'reyna-pos.db')
}

export function getActiveCloudUserId(): string | null {
  return readAccountState().activeCloudUserId
}

export function getStorageDirForCloudUser(cloudUserId: string | null) {
  const storageDir = path.join(getStorageRootPath(), getScopeKey(cloudUserId))
  ensureDir(storageDir)
  return storageDir
}

export function getCurrentStorageDir() {
  return getStorageDirForCloudUser(getActiveCloudUserId())
}

export function getCurrentDbPath() {
  return getDbPathForCloudUser(getActiveCloudUserId())
}

export function getCurrentProductImagesDir() {
  const imagesDir = path.join(getCurrentStorageDir(), 'product-images')
  ensureDir(imagesDir)
  return imagesDir
}

export function setActiveCloudUserId(cloudUserId: string | null) {
  const currentState = readAccountState()
  if (currentState.activeCloudUserId === cloudUserId) return

  closeDb()
  writeAccountState({ activeCloudUserId: cloudUserId })
}

function moveSqliteSidecarFiles(fromDbPath: string, toDbPath: string) {
  for (const suffix of ['', '-shm', '-wal']) {
    const source = `${fromDbPath}${suffix}`
    const destination = `${toDbPath}${suffix}`
    if (!fs.existsSync(source)) continue
    ensureDir(path.dirname(destination))
    fs.renameSync(source, destination)
  }
}

function moveDirectoryContents(sourceDir: string, destinationDir: string) {
  if (!fs.existsSync(sourceDir)) return
  ensureDir(destinationDir)

  for (const entry of fs.readdirSync(sourceDir)) {
    const sourcePath = path.join(sourceDir, entry)
    const destinationPath = path.join(destinationDir, entry)
    
    if (fs.existsSync(destinationPath)) {
      try {
        const sourceStats = fs.statSync(sourcePath)
        const destStats = fs.statSync(destinationPath)
        
        // For directories, always recursively merge regardless of mtime
        if (sourceStats.isDirectory() && destStats.isDirectory()) {
          moveDirectoryContents(sourcePath, destinationPath)
          // Remove source directory if empty after merge
          try {
            if (fs.readdirSync(sourcePath).length === 0) {
              fs.rmdirSync(sourcePath)
            }
          } catch {}
        } else if (sourceStats.isFile() && destStats.isFile()) {
          // For files, use atomic-safe rename with temp file strategy
          if (sourceStats.mtimeMs > destStats.mtimeMs) {
            const tempPath = destinationPath + '.tmp-' + Date.now()
            try {
              // Rename source to temp location first
              fs.renameSync(sourcePath, tempPath)
              try {
                // Move old destination to backup
                const backupPath = destinationPath + '.bak-' + Date.now()
                fs.renameSync(destinationPath, backupPath)
                try {
                  // Move temp to final destination
                  fs.renameSync(tempPath, destinationPath)
                  // Clean up backup
                  fs.rmSync(backupPath)
                } catch (err) {
                  // Restore backup if final move failed
                  try {
                    fs.renameSync(backupPath, destinationPath)
                  } catch {}
                  throw err
                }
              } catch (err) {
                // If backup failed, restore temp to source
                try {
                  fs.renameSync(tempPath, sourcePath)
                } catch {}
                throw err
              }
            } catch (err) {
              console.warn(`Failed to safely replace ${entry}: ${err}`, '. Leaving source in place.')
            }
          } else {
            // Destination is newer or same age, skip with warning
            console.warn(`Skipping ${entry}: destination file is newer or same age`)
          }
        } else if (sourceStats.isDirectory() || destStats.isDirectory()) {
          // One is directory, one is file - warn and skip
          console.warn(`Skipping ${entry}: source and destination types differ (directory vs file)`)
        }
      } catch (err) {
        console.warn(`Error comparing ${entry}: ${err}`)
        continue
      }
    } else {
      try {
        fs.renameSync(sourcePath, destinationPath)
      } catch (err) {
        console.warn(`Failed to move ${entry}: ${err}`)
      }
    }
  }

  if (fs.existsSync(sourceDir)) {
    try {
      if (fs.readdirSync(sourceDir).length === 0) {
        fs.rmdirSync(sourceDir)
      }
    } catch (err) {
      console.warn(`Failed to clean up ${sourceDir}: ${err}`)
    }
  }
}

export function migrateLocalDeviceDataToCloudUser(cloudUserId: string) {
  const sourceDir = getStorageDirForCloudUser(null)
  const destinationDir = getStorageDirForCloudUser(cloudUserId)
  const sourceDbPath = path.join(sourceDir, 'reyna-pos.db')
  const destinationDbPath = path.join(destinationDir, 'reyna-pos.db')

  closeDb()

  if (fs.existsSync(sourceDbPath) && !fs.existsSync(destinationDbPath)) {
    moveSqliteSidecarFiles(sourceDbPath, destinationDbPath)
  }

  moveDirectoryContents(path.join(sourceDir, 'product-images'), path.join(destinationDir, 'product-images'))
}

export function getDb(): Database.Database {
  const dbPath = getCurrentDbPath()
  if (db && currentDbPath === dbPath) return db
  if (db && currentDbPath !== dbPath) {
    closeDb()
  }

  db = new Database(dbPath)
  currentDbPath = dbPath
  initializeDatabase(db)
  return db
}

export function withScopedDb<T>(cloudUserId: string | null, callback: (database: Database.Database) => T): T {
  const dbPath = getDbPathForCloudUser(cloudUserId)
  if (db && currentDbPath === dbPath) {
    return callback(db)
  }

  const scopedDb = new Database(dbPath)
  try {
    initializeDatabase(scopedDb)
    return callback(scopedDb)
  } finally {
    scopedDb.close()
  }
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
CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, image_path TEXT, barcode TEXT UNIQUE, category_id TEXT REFERENCES categories(id), base_price REAL NOT NULL DEFAULT 0, retail_price REAL NOT NULL DEFAULT 0, wholesale_price REAL, base_cost REAL NOT NULL DEFAULT 0, markup_pct REAL, has_variations INTEGER NOT NULL DEFAULT 0, variation_group_id TEXT REFERENCES variation_groups(id), allow_fractions INTEGER NOT NULL DEFAULT 0, track_inventory INTEGER NOT NULL DEFAULT 1, is_active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, monthly_sold REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT);
CREATE TABLE IF NOT EXISTS inventory (id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), quantity REAL NOT NULL DEFAULT 0, low_threshold REAL NOT NULL DEFAULT 5, updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_product_unique ON inventory(product_id);
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
  {
    name: '003_activation.sql',
    sql: `
INSERT OR IGNORE INTO settings (key, value) VALUES ('activated','false');
INSERT OR IGNORE INTO settings (key, value) VALUES ('installation_id','');
    `,
  },
  {
    name: '004_setup_defaults.sql',
    sql: `
INSERT OR IGNORE INTO settings (key, value) VALUES ('store_phone','');
INSERT OR IGNORE INTO settings (key, value) VALUES ('setup_completed','false');
    `,
  },
  {
    name: '005a_debtor_due_date.sql',
    sql: `ALTER TABLE debtors ADD COLUMN due_date TEXT;`,
  },
  {
    name: '005b_debtor_follow_up_date.sql',
    sql: `ALTER TABLE debtors ADD COLUMN follow_up_date TEXT;`,
  },
  {
    name: '005c_debtor_last_reminder_at.sql',
    sql: `ALTER TABLE debtors ADD COLUMN last_reminder_at TEXT;`,
  },
  {
    name: '006_order_payment_breakdown.sql',
    sql: `
ALTER TABLE orders ADD COLUMN payment_breakdown TEXT;
    `,
  },
  {
    name: '008_expenses.sql',
    sql: `
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL DEFAULT 'Other',
  description TEXT,
  amount REAL NOT NULL,
  date TEXT NOT NULL DEFAULT (date('now')),
  user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
    `,
  },
  {
    name: '010_wholesale_tiers.sql',
    sql: `
CREATE TABLE IF NOT EXISTS product_price_tiers (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  min_qty REAL NOT NULL,
  price REAL NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tiers_product ON product_price_tiers(product_id);
    `,
  },
  {
    name: '009_cashier_monitoring.sql',
    sql: `
CREATE TABLE IF NOT EXISTS cashier_shifts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  start_money REAL NOT NULL DEFAULT 0,
  end_money REAL,
  time_in TEXT NOT NULL DEFAULT (datetime('now')),
  time_out TEXT,
  petty_cash_total REAL NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS petty_cash (
  id TEXT PRIMARY KEY,
  shift_id TEXT NOT NULL REFERENCES cashier_shifts(id),
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_shifts_user ON cashier_shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_shifts_time_in ON cashier_shifts(time_in);
    `,
  },
  {
    name: '008_store_setup_fields.sql',
    sql: `
INSERT OR IGNORE INTO settings (key, value) VALUES ('store_tin','');
INSERT OR IGNORE INTO settings (key, value) VALUES ('store_address','');
INSERT OR IGNORE INTO settings (key, value) VALUES ('store_logo_data','');
INSERT OR IGNORE INTO settings (key, value) VALUES ('receipt_footer','Thank you for shopping with us!');
    `,
  },
  {
    name: '011_user_permissions.sql',
    sql: `ALTER TABLE users ADD COLUMN permissions TEXT NOT NULL DEFAULT '{}';`,
  },
  {
    name: '012_loyalty.sql',
    sql: `
CREATE TABLE IF NOT EXISTS loyalty_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  points REAL NOT NULL DEFAULT 0,
  total_earned REAL NOT NULL DEFAULT 0,
  total_redeemed REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES loyalty_accounts(id),
  type TEXT NOT NULL CHECK(type IN ('earn','redeem','adjust')),
  points REAL NOT NULL,
  order_id TEXT REFERENCES orders(id),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_loyalty_phone ON loyalty_accounts(phone);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_account ON loyalty_transactions(account_id);
INSERT OR IGNORE INTO settings (key, value) VALUES ('loyalty_enabled','false');
INSERT OR IGNORE INTO settings (key, value) VALUES ('loyalty_rate','1');
INSERT OR IGNORE INTO settings (key, value) VALUES ('loyalty_redeem_rate','1');
    `,
  },
  {
    name: '012a_product_retail_wholesale_prices.sql',
    sql: `
ALTER TABLE products ADD COLUMN retail_price REAL NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN wholesale_price REAL;
UPDATE products
SET retail_price = CASE
  WHEN retail_price IS NULL OR retail_price = 0 THEN base_price
  ELSE retail_price
END
WHERE retail_price IS NULL OR retail_price = 0;
UPDATE products
SET wholesale_price = retail_price
WHERE wholesale_price IS NULL;
    `,
  },
  {
    name: '013_inventory_unique_per_product.sql',
    sql: `
DELETE FROM inventory
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY product_id
        ORDER BY datetime(updated_at) DESC, rowid DESC
      ) AS row_num
    FROM inventory
  )
  WHERE row_num > 1
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_product_unique ON inventory(product_id);
    `,
  },
  {
    name: '014_debtor_credit_limit.sql',
    sql: `ALTER TABLE debtors ADD COLUMN credit_limit REAL NOT NULL DEFAULT 0;`,
  },
  {
    name: '015_vat_settings.sql',
    sql: `
INSERT OR IGNORE INTO settings (key, value) VALUES ('vat_enabled','false');
INSERT OR IGNORE INTO settings (key, value) VALUES ('vat_rate','12');
    `,
  },
  {
    name: '017_product_orders.sql',
    sql: `
CREATE TABLE IF NOT EXISTS product_orders (
  id           TEXT PRIMARY KEY,
  product_id   TEXT NOT NULL REFERENCES products(id),
  vendor_name  TEXT,
  quantity      REAL NOT NULL DEFAULT 0,
  unit_cost     REAL NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK(status IN ('pending','received','cancelled')),
  expected_at  TEXT,
  notes        TEXT,
  received_at  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
    `,
  },
  {
    name: '007_customer_views.sql',
    sql: `
DROP VIEW IF EXISTS customers;
CREATE VIEW customers AS
SELECT
  id,
  name,
  phone,
  balance,
  total_credit,
  total_paid,
  due_date,
  follow_up_date,
  last_reminder_at,
  created_at,
  deleted_at,
  synced
FROM debtors
WHERE deleted_at IS NULL;

DROP VIEW IF EXISTS customer_transactions;
CREATE VIEW customer_transactions AS
SELECT
  dt.id,
  dt.debtor_id AS customer_id,
  d.name AS customer_name,
  d.phone AS customer_phone,
  dt.type,
  dt.amount,
  dt.profit,
  dt.note,
  dt.order_id,
  dt.user_id,
  dt.created_at,
  dt.synced
FROM debtor_transactions dt
JOIN debtors d ON d.id = dt.debtor_id
WHERE d.deleted_at IS NULL;
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

  const hasColumn = (tableName: string, columnName: string) => {
    const columns = database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
    return columns.some(column => column.name === columnName)
  }

  const isMigrationAlreadySatisfied = (migrationName: string) => {
    if (migrationName === '005a_debtor_due_date.sql') {
      return hasColumn('debtors', 'due_date')
    }
    if (migrationName === '005b_debtor_follow_up_date.sql') {
      return hasColumn('debtors', 'follow_up_date')
    }
    if (migrationName === '005c_debtor_last_reminder_at.sql') {
      return hasColumn('debtors', 'last_reminder_at')
    }
    if (migrationName === '006_order_payment_breakdown.sql') {
      return hasColumn('orders', 'payment_breakdown')
    }
    if (migrationName === '011_user_permissions.sql') {
      return hasColumn('users', 'permissions')
    }
    if (migrationName === '012a_product_retail_wholesale_prices.sql') {
      return hasColumn('products', 'retail_price') && hasColumn('products', 'wholesale_price')
    }
    if (migrationName === '014_debtor_credit_limit.sql') {
      return hasColumn('debtors', 'credit_limit')
    }
    return false
  }

  for (const migration of MIGRATIONS) {
    if (ran.has(migration.name)) continue
    if (isMigrationAlreadySatisfied(migration.name)) {
      database.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration.name)
      console.log(`[DB] Migration already satisfied: ${migration.name}`)
      continue
    }
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

function initializeDatabase(database: Database.Database) {
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
  runMigrations(database)
}

export function closeDb() {
  db?.close()
  db = null
  currentDbPath = null
}
