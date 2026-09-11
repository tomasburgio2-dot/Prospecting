const BASE = 'https://api.apollo.io/api/v1';

function headers() {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error('Falta APOLLO_API_KEY');
  return { 'content-type': 'application/json', 'cache-control': 'no-cache', 'x-api-key': key };
}

async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  const text = await r.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch { /* vacío */ }
  if (!r.ok) throw new Error(`Apollo ${path} → ${r.status}: ${json.error || json.message || text.slice(0, 200)}`);
  return json;
}

export type Company = { name: string; domain: string; logo?: string; employees?: number; industry?: string; city?: string; country?: string };

export async function searchCompanies(name: string): Promise<Company[]> {
  if (!name.trim()) return [];
  const j = await post('/mixed_companies/search', { q_organization_name: name, per_page: 6, page: 1 });
  return (j.organizations ?? j.accounts ?? [])
    .filter((o: any) => o.primary_domain)
    .map((o: any) => ({
      name: o.name, domain: o.primary_domain, logo: o.logo_url, employees: o.estimated_num_employees,
      industry: o.industry, city: o.city, country: o.country,
    }));
}

export type Person = {
  id: string; first_name: string; last_name_hint: string; title: string; company: string;
  city?: string; country?: string; seniority?: string; has_email: boolean; maybe_phone: boolean;
  linkedin?: string; photo?: string;
};

export async function searchPeople(domain: string, titles: string[], location?: string, page = 1): Promise<{ people: Person[]; total: number }> {
  const body: any = { q_organization_domains_list: [domain], person_titles: titles, page, per_page: 25 };
  if (location) body.person_locations = [location];
  const j = await post('/mixed_people/api_search', body);
  const people = (j.people ?? []).map((p: any): Person => ({
    id: p.id,
    first_name: p.first_name ?? '',
    last_name_hint: p.last_name ?? p.last_name_obfuscated ?? '',
    title: p.title ?? '',
    company: p.organization?.name ?? '',
    city: p.city, country: p.country, seniority: p.seniority,
    has_email: !!p.has_email || !!p.email,
    maybe_phone: !!p.has_direct_phone,
    linkedin: p.linkedin_url, photo: p.photo_url,
  }));
  return { people, total: j.total_entries ?? people.length };
}

export type Enriched = {
  id: string; name: string; title: string; company: string; city?: string; linkedin?: string; photo?: string;
  email?: string; email_status?: string; phones: { number: string; type?: string }[];
};

/** Enriquece por id de Apollo. Si webhookUrl está presente, pide también el teléfono (llega async al webhook). */
export async function enrich(id: string, webhookUrl?: string): Promise<Enriched> {
  const body: any = { id, reveal_personal_emails: false };
  if (webhookUrl) { body.reveal_phone_number = true; body.webhook_url = webhookUrl; }
  const j = await post('/people/match', body);
  const p = j.person ?? {};
  return {
    id: p.id ?? id,
    name: p.name ?? [p.first_name, p.last_name].filter(Boolean).join(' '),
    title: p.title ?? '', company: p.organization?.name ?? '', city: [p.city, p.country].filter(Boolean).join(', '),
    linkedin: p.linkedin_url, photo: p.photo_url,
    email: p.email || undefined, email_status: p.email_status,
    phones: (p.phone_numbers ?? []).map((x: any) => ({ number: x.sanitized_number ?? x.raw_number, type: x.type })),
  };
}

/** Extrae teléfonos del payload del webhook de Apollo (el formato varía un poco entre versiones). */
export function phonesFromWebhook(payload: any): { id: string; phones: { number: string; type?: string }[] }[] {
  const list: any[] = payload?.people ?? (payload?.person ? [payload.person] : Array.isArray(payload) ? payload : []);
  return list.map((p) => ({
    id: p.id ?? p.person_id,
    phones: (p.phone_numbers ?? []).map((x: any) => ({ number: x.sanitized_number ?? x.raw_number ?? x.number, type: x.type })).filter((x: any) => x.number),
  })).filter((x) => x.id);
}

export function bestPhone(phones: { number: string; type?: string }[]) {
  const order = ['mobile', 'work_direct', 'direct', 'work_hq', 'home', 'other'];
  return [...phones].sort((a, b) => order.indexOf(a.type ?? 'other') - order.indexOf(b.type ?? 'other'))[0];
}
