// Capa de datos: Postgres si hay DATABASE_URL, si no, memoria (se pierde al reiniciar).
import { Pool } from 'pg';

export type Contact = {
  key: string; // apollo person id o linkedin url
  name: string;
  title: string;
  company: string;
  city?: string;
  linkedin?: string;
  photo?: string;
  email?: string;
  email_status?: string;
  email_source?: string;
  phone?: string;
  phone_status?: 'pending' | 'found' | 'not_found' | 'unavailable';
  phone_source?: string;
  updated_at?: string;
};

export type SearchLog = { id?: number; query: string; company: string; roles: string[]; results: number; created_at?: string };

let pool: Pool | null = null;
const mem = { contacts: new Map<string, Contact>(), searches: [] as SearchLog[] };

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('railway') ? { rejectUnauthorized: false } : undefined });
  }
  return pool;
}

let ready: Promise<void> | null = null;
export function init() {
  if (ready) return ready;
  ready = (async () => {
    const p = getPool();
    if (!p) return;
    await p.query(`CREATE TABLE IF NOT EXISTS contacts (
      key TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT now())`);
    await p.query(`CREATE TABLE IF NOT EXISTS searches (
      id SERIAL PRIMARY KEY, query TEXT, company TEXT, roles JSONB, results INT, created_at TIMESTAMPTZ DEFAULT now())`);
  })();
  return ready;
}

export async function getContact(key: string): Promise<Contact | null> {
  await init();
  const p = getPool();
  if (!p) return mem.contacts.get(key) ?? null;
  const r = await p.query('SELECT data, updated_at FROM contacts WHERE key=$1', [key]);
  return r.rows[0] ? { ...r.rows[0].data, updated_at: r.rows[0].updated_at } : null;
}

export async function saveContact(c: Contact): Promise<Contact> {
  await init();
  const merged = { ...(await getContact(c.key)), ...c, updated_at: new Date().toISOString() };
  const p = getPool();
  if (!p) { mem.contacts.set(c.key, merged); return merged; }
  await p.query(
    `INSERT INTO contacts(key, data, updated_at) VALUES($1,$2,now())
     ON CONFLICT (key) DO UPDATE SET data=$2, updated_at=now()`, [c.key, merged]);
  return merged;
}

export async function findContactByPhoneRequest(apolloId: string): Promise<Contact | null> {
  return getContact(apolloId);
}

export async function logSearch(s: SearchLog) {
  await init();
  const p = getPool();
  if (!p) { mem.searches.unshift({ ...s, created_at: new Date().toISOString() }); mem.searches = mem.searches.slice(0, 200); return; }
  await p.query('INSERT INTO searches(query, company, roles, results) VALUES($1,$2,$3,$4)', [s.query, s.company, JSON.stringify(s.roles), s.results]);
}

export async function recentContacts(limit = 50): Promise<Contact[]> {
  await init();
  const p = getPool();
  if (!p) return [...mem.contacts.values()].sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? '')).slice(0, limit);
  const r = await p.query('SELECT data, updated_at FROM contacts ORDER BY updated_at DESC LIMIT $1', [limit]);
  return r.rows.map((x) => ({ ...x.data, updated_at: x.updated_at }));
}
