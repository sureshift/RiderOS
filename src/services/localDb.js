import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

const STORAGE_KEY = 'rideros.sqlite.v1';
const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS platforms (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT, active INTEGER NOT NULL DEFAULT 1, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS places (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, address TEXT, latitude REAL, longitude REAL, platform_id TEXT, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS riders (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT, active INTEGER NOT NULL DEFAULT 1, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, code TEXT NOT NULL, platform_id TEXT, rider_id TEXT, status TEXT NOT NULL, pickup_place_id TEXT, pickup_address TEXT, drop_address TEXT, drop_latitude REAL, drop_longitude REAL, earning REAL NOT NULL DEFAULT 0, distance_km REAL NOT NULL DEFAULT 0, duration_min REAL NOT NULL DEFAULT 0, notes TEXT, accepted_at TEXT, picked_up_at TEXT, delivered_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS trips (id TEXT PRIMARY KEY, name TEXT NOT NULL, rider_id TEXT, status TEXT NOT NULL, started_at TEXT, ended_at TEXT, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS trip_orders (trip_id TEXT NOT NULL, order_id TEXT NOT NULL, sequence_no INTEGER NOT NULL, phase TEXT NOT NULL, PRIMARY KEY (trip_id, order_id))',
  'CREATE TABLE IF NOT EXISTS gps_events (id TEXT PRIMARY KEY, order_id TEXT, trip_id TEXT, event_type TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL, accuracy_m REAL, captured_at TEXT NOT NULL, source TEXT NOT NULL, created_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS goals (id TEXT PRIMARY KEY, name TEXT NOT NULL, target REAL NOT NULL, saved REAL NOT NULL DEFAULT 0, deadline TEXT, rule TEXT NOT NULL, rule_value REAL NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, order_id TEXT, amount REAL NOT NULL, method TEXT NOT NULL, upi_reference TEXT, status TEXT NOT NULL, paid_at TEXT, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)'
];

let databasePromise;
let database;

function timestamp() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function save() {
  const bytes = database.export();
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  localStorage.setItem(STORAGE_KEY, btoa(binary));
}

function load(SQL) {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return new SQL.Database();
  const binary = atob(stored);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new SQL.Database(bytes);
}

function toRows(result) {
  if (!result[0]) return [];
  const { columns, values } = result[0];
  return values.map(value => Object.fromEntries(columns.map((column, index) => [column, value[index]])));
}

function select(sql, params = []) {
  return toRows(database.exec(sql, params));
}

function write(sql, params = []) {
  database.run(sql, params);
  save();
}

export async function getDatabase() {
  if (!databasePromise) {
    databasePromise = initSqlJs({ locateFile: () => wasmUrl }).then(SQL => {
      database = load(SQL);
      SCHEMA.forEach(statement => database.run(statement));
      const initialized = select('SELECT value FROM meta WHERE key = ?', ['initialized']);
      if (!initialized.length) {
        const created = timestamp();
        [
          ['platform_swiggy', 'Swiggy', 'Food'],
          ['platform_zomato', 'Zomato', 'Food'],
          ['platform_other', 'Other', 'Other']
        ].forEach(([platformId, name, category]) => database.run(
          'INSERT INTO platforms (id,name,category,active,created_at,updated_at) VALUES (?,?,?,?,?,?)',
          [platformId, name, category, 1, created, created]
        ));
        database.run('INSERT INTO meta (key,value) VALUES (?,?)', ['initialized', created]);
        save();
      }
      return database;
    });
  }
  return databasePromise;
}

export async function query(sql, params = []) {
  await getDatabase();
  return select(sql, params);
}

export async function insert(table, values, prefix = 'rec') {
  await getDatabase();
  const record = { id: id(prefix), created_at: timestamp(), updated_at: timestamp(), ...values };
  const fields = Object.keys(record);
  write(
    `INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`,
    fields.map(field => record[field])
  );
  return record;
}

export async function update(table, recordId, values) {
  await getDatabase();
  const fields = { ...values, updated_at: timestamp() };
  const keys = Object.keys(fields);
  write(`UPDATE ${table} SET ${keys.map(key => `${key} = ?`).join(',')} WHERE id = ?`, [...keys.map(key => fields[key]), recordId]);
  return select(`SELECT * FROM ${table} WHERE id = ?`, [recordId])[0] ?? null;
}

export async function remove(table, recordId) {
  await getDatabase();
  write(`DELETE FROM ${table} WHERE id = ?`, [recordId]);
}

export async function exportDatabase() {
  await getDatabase();
  return database.export();
}

export async function importDatabase(file) {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const bytes = new Uint8Array(await file.arrayBuffer());
  database = new SQL.Database(bytes);
  databasePromise = Promise.resolve(database);
  SCHEMA.forEach(statement => database.run(statement));
  save();
}

export async function clearDatabase() {
  localStorage.removeItem(STORAGE_KEY);
  databasePromise = undefined;
  database = undefined;
  await getDatabase();
}

export function downloadDatabase(bytes, filename = `rideros-backup-${new Date().toISOString().slice(0, 10)}.sqlite`) {
  const blob = new Blob([bytes], { type: 'application/x-sqlite3' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
