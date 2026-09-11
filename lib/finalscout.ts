// FinalScout: mail por URL de LinkedIn o por nombre + dominio. Cobra 1 crédito solo si encuentra.
const WATERFALL = 'https://api-waterfall.finalscout.com';

function headers() {
  const key = process.env.FINALSCOUT_API_KEY;
  if (!key) throw new Error('Falta FINALSCOUT_API_KEY');
  return { 'content-type': 'application/json', authorization: key };
}

export type FsResult = { email?: string; status?: string; score?: number; type?: string };

function pick(j: any): FsResult {
  const c = j?.contact;
  if (!c?.email) return {};
  return { email: c.email, status: c.email_status, score: c.email_score, type: c.email_type };
}

/** Endpoint waterfall: mantiene la conexión abierta hasta que termina (timeout en segundos). */
export async function byLinkedin(linkedinUrl: string, fullName?: string, timeout = 90): Promise<FsResult> {
  const r = await fetch(`${WATERFALL}/find/linkedin/single?timeout=${timeout}&no_charge_on_timeout=true`, {
    method: 'POST', headers: headers(),
    body: JSON.stringify({ person: { linkedin_url: linkedinUrl, full_name: fullName }, enable_work_email: true, enable_personal_email: false, enable_generic_email: false }),
  });
  if (!r.ok) throw new Error(`FinalScout linkedin → ${r.status}`);
  return pick(await r.json());
}

export async function byNameDomain(fullName: string, domain: string, timeout = 90): Promise<FsResult> {
  const r = await fetch(`${WATERFALL}/find/professional/single?timeout=${timeout}&no_charge_on_timeout=true`, {
    method: 'POST', headers: headers(),
    body: JSON.stringify({ person: { full_name: fullName, domain, enable_related_domains: true } }),
  });
  if (!r.ok) throw new Error(`FinalScout professional → ${r.status}`);
  return pick(await r.json());
}

export async function credits(): Promise<number | null> {
  try {
    const r = await fetch('https://api.finalscout.com/v1/account', { headers: headers() });
    const j = await r.json();
    return j.credits_available ?? null;
  } catch { return null; }
}
