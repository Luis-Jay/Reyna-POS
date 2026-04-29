-- Default admin user (PIN: 1234 — bcrypt hash stored as plain for dev; replace in prod)
INSERT OR IGNORE INTO users (id, name, pin, role)
VALUES ('admin-001', 'Admin', '1234', 'admin');

-- Default categories
INSERT OR IGNORE INTO categories (id, name, sort_order) VALUES
  ('cat-candy',    'Candy',         1),
  ('cat-chichirya','Chichirya',     2),
  ('cat-cigs',     'Cigarettes',    3),
  ('cat-foods',    'Foods',         4),
  ('cat-laundry',  'Laundry',       5),
  ('cat-morning',  'Morning items', 6),
  ('cat-seasoning','Seasoning',     7);

-- Default variation groups
INSERT OR IGNORE INTO variation_groups (id, name) VALUES
  ('vg-size',   'Size'),
  ('vg-drinks', 'Drinks');

INSERT OR IGNORE INTO variation_options (id, group_id, name, price, cost, sort_order) VALUES
  ('vo-small',   'vg-size',   'Small',       35, 25, 1),
  ('vo-medium',  'vg-size',   'Medium',      45, 35, 2),
  ('vo-large',   'vg-size',   'Large',       55, 45, 3),
  ('vo-swakto',  'vg-drinks', 'Swakto',       0,  0, 1),
  ('vo-mismo',   'vg-drinks', 'Mismo',        0,  0, 2),
  ('vo-litrog',  'vg-drinks', 'Litro - Glass',0,  0, 3),
  ('vo-litrop',  'vg-drinks', 'Litro - Plastic',0,0,4),
  ('vo-1p5l',    'vg-drinks', '1.5 L',        0,  0, 5),
  ('vo-1p75l',   'vg-drinks', '1.75 L',       0,  0, 6);

-- Default settings
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('store_name',           'Reyna Store'),
  ('store_phone',          ''),
  ('setup_completed',      'false'),
  ('thermal_enabled',      'false'),
  ('paper_size',           '58mm'),
  ('printer_interface',    ''),
  ('inventory_enabled',    'true'),
  ('cashier_manage_debtors','false'),
  ('buyer_page_enabled',   'true'),
  ('oos_blocking',         'true'),
  ('sound_alerts',         'true'),
  ('store_closed',         'false'),
  ('ai_image_recognition', 'false'),
  ('cloud_sync_url',       ''),
  ('cloud_sync_enabled',   'false');
