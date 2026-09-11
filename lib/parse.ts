import { parseWithDictionary, ROLE_GROUPS } from './titles';

export type ParsedQuery = {
  company: string;        // "Barceló Hotel Group"
  roles: string[];        // títulos para Apollo
  role_labels: string[];  // etiquetas legibles para mostrar ("alimentos y bebidas", "sommelier")
  location?: string;      // "Spain", "Madrid"
  summary: string;        // frase para confirmar: "Sommeliers y directores de A&B en Barceló (España)"
  method: 'claude' | 'dictionary';
};

const SYSTEM = `Sos un asistente de prospección B2B. El usuario escribe en lenguaje natural (español o inglés) a quién quiere encontrar.
Devolvé SOLO un JSON con esta forma, sin texto extra:
{"company": string, "roles": string[], "role_labels": string[], "location": string|null, "summary": string}
- company: el nombre de la empresa/cadena/grupo tal como se la conoce (ej: "Barceló Hotel Group", "Meliá Hotels International", "Grupo Dani García"). Si no hay empresa, "".
- roles: 6 a 15 variantes de cargo en inglés Y español que un buscador de personas (Apollo) matchearía por título, cubriendo sinónimos y niveles (director/manager/head). Pensá en cómo la gente escribe su cargo en LinkedIn en hostelería y empresas.
- role_labels: 1 a 4 etiquetas cortas y legibles de los roles pedidos, en español.
- location: país o ciudad si el usuario lo dice o se infiere claramente (ej: "Spain"), si no null.
- summary: una frase corta en español rioplatense confirmando lo entendido, ej: "Sommeliers y directores de A&B de Barceló en España".`;

export async function parseQuery(q: string): Promise<ParsedQuery> {
  const key = process.env.ANTHROPIC_API_KEY;
  const fallback = parseWithDictionary(q);
  if (!key) return { ...fallback, summary: summarize(fallback), method: 'dictionary' };
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
        max_tokens: 600,
        system: SYSTEM,
        messages: [{ role: 'user', content: q }],
      }),
    });
    if (!r.ok) throw new Error(`anthropic ${r.status}`);
    const j = await r.json();
    const text: string = j.content?.map((c: any) => c.text ?? '').join('') ?? '';
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    // Ampliamos con el diccionario para no perder sinónimos conocidos
    const roles = new Set<string>((json.roles ?? []).map((s: string) => String(s).toLowerCase()));
    for (const l of fallback.role_labels) ROLE_GROUPS[l]?.forEach((t) => roles.add(t));
    return {
      company: json.company || fallback.company,
      roles: [...roles].slice(0, 25),
      role_labels: json.role_labels?.length ? json.role_labels : fallback.role_labels,
      location: json.location ?? fallback.location ?? undefined,
      summary: json.summary || summarize(fallback),
      method: 'claude',
    };
  } catch (e) {
    console.error('parseQuery: fallback to dictionary', e);
    return { ...fallback, summary: summarize(fallback), method: 'dictionary' };
  }
}

function summarize(p: { role_labels: string[]; company: string; location?: string }) {
  const roles = p.role_labels.length ? p.role_labels.join(' y ') : 'personas';
  return `${cap(roles)}${p.company ? ` en ${cap(p.company)}` : ''}${p.location ? ` (${cap(p.location)})` : ''}`;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
