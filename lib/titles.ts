// Diccionario de cargos HoReCa / generales → variantes que entiende Apollo.
// Se usa como fallback cuando no hay ANTHROPIC_API_KEY y como "ampliador" cuando sí la hay.

export const ROLE_GROUPS: Record<string, string[]> = {
  'alimentos y bebidas': [
    'food and beverage director', 'f&b director', 'director de alimentos y bebidas', 'director f&b',
    'food and beverage manager', 'f&b manager', 'gerente de alimentos y bebidas', 'jefe de alimentos y bebidas',
    'food & beverage', 'f&b', 'alimentos y bebidas', 'restauración', 'director de restauración',
  ],
  sommelier: ['sommelier', 'head sommelier', 'jefe de sala', 'chef sommelier', 'wine director', 'beverage manager', 'bar manager'],
  chef: ['executive chef', 'chef ejecutivo', 'head chef', 'jefe de cocina', 'chef'],
  'director general': ['general manager', 'director general', 'gerente general', 'hotel manager', 'director de hotel', 'managing director'],
  compras: ['purchasing manager', 'procurement manager', 'director de compras', 'jefe de compras', 'responsable de compras', 'buyer'],
  operaciones: ['operations director', 'director de operaciones', 'operations manager', 'coo', 'gerente de operaciones'],
  marketing: ['marketing director', 'director de marketing', 'cmo', 'marketing manager', 'head of marketing'],
  ventas: ['sales director', 'director comercial', 'commercial director', 'head of sales', 'sales manager', 'cro'],
  finanzas: ['cfo', 'chief financial officer', 'finance director', 'director financiero', 'head of finance', 'vp finance'],
  ceo: ['ceo', 'chief executive officer', 'founder', 'co-founder', 'fundador', 'presidente', 'president', 'owner', 'propietario', 'dueño'],
  rrhh: ['hr director', 'director de recursos humanos', 'people director', 'chro', 'head of people'],
  tecnologia: ['cto', 'chief technology officer', 'it director', 'director de tecnología', 'head of engineering'],
  eventos: ['events manager', 'director de eventos', 'banquet manager', 'mice manager'],
};

const ALIASES: Record<string, string> = {
  'a&b': 'alimentos y bebidas', 'ayb': 'alimentos y bebidas', 'f&b': 'alimentos y bebidas', 'fb': 'alimentos y bebidas',
  'food and beverage': 'alimentos y bebidas', 'food & beverage': 'alimentos y bebidas', 'restauracion': 'alimentos y bebidas',
  'sumiller': 'sommelier', 'sommeliers': 'sommelier', 'jefe de sala': 'sommelier',
  'cocinero': 'chef', 'cocina': 'chef',
  'gerente': 'director general', 'general manager': 'director general', 'gm': 'director general', 'director del hotel': 'director general',
  'comprador': 'compras', 'compra': 'compras', 'procurement': 'compras',
  'comercial': 'ventas', 'sales': 'ventas',
  'financiero': 'finanzas', 'cfo': 'finanzas', 'finance': 'finanzas',
  'dueño': 'ceo', 'fundador': 'ceo', 'founder': 'ceo', 'presidente': 'ceo',
  'recursos humanos': 'rrhh', 'hr': 'rrhh', 'people': 'rrhh',
  'tech': 'tecnologia', 'cto': 'tecnologia', 'tecnología': 'tecnologia', 'it': 'tecnologia',
};

const STOP = ['de', 'del', 'la', 'el', 'los', 'las', 'en', 'y', 'o', 'the', 'of', 'at', 'para', 'con', 'un', 'una', 'quien', 'quién', 'quienes', 'es', 'son', 'busco', 'buscar', 'quiero', 'dame', 'necesito', 'contacto', 'contactos', 'numero', 'número', 'mail', 'email', 'telefono', 'teléfono'];

export function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9&\s/]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Parser de respaldo sin LLM. Devuelve roles detectados + el resto como nombre de empresa. */
export function parseWithDictionary(q: string): { roles: string[]; role_labels: string[]; company: string; location?: string } {
  let text = normalize(q);
  const labels = new Set<string>();

  // 1) aliases y grupos, de más largo a más corto para que "director de alimentos y bebidas" gane a "director"
  const keys = [...Object.keys(ALIASES), ...Object.keys(ROLE_GROUPS)].map(normalize).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (!k) continue;
    const re = new RegExp(`(^|\\s)${k.replace(/[&/]/g, (m) => '\\' + m)}(s)?(\\s|$)`);
    if (re.test(text)) {
      const group = ALIASES[k] ?? k;
      if (ROLE_GROUPS[group]) { labels.add(group); text = text.replace(re, ' '); }
    }
  }
  // 2) palabras sueltas de rol que quedaron ("director", "jefe") → si no hay grupo, las tratamos como título literal
  const loose = ['director', 'directora', 'manager', 'jefe', 'jefa', 'head', 'responsable', 'gerente', 'vp', 'vicepresidente'];
  const literal: string[] = [];
  for (const w of loose) if (new RegExp(`(^|\\s)${w}(\\s|$)`).test(text)) { if (labels.size === 0) literal.push(w); text = text.replace(new RegExp(`(^|\\s)${w}(\\s|$)`), ' '); }

  // 3) ubicación (muy simple): "en madrid", "en barcelona"...
  let location: string | undefined;
  const loc = text.match(/\b(?:en|de)\s+(madrid|barcelona|valencia|sevilla|malaga|marbella|ibiza|mallorca|palma|bilbao|canarias|tenerife|espana|spain|mexico|cdmx|guadalajara|monterrey|cancun|uruguay|montevideo|argentina|buenos aires|chile|santiago|colombia|bogota|peru|lima|brasil|brazil|sao paulo|portugal|lisboa|francia|paris|italia|londres|london|uk|miami)\b/);
  if (loc) { location = loc[1]; text = text.replace(loc[0], ' '); }

  // 4) lo que queda, menos stopwords y palabras genéricas, es la empresa
  const generic = ['hotel', 'hoteles', 'restaurante', 'restaurantes', 'grupo', 'cadena', 'empresa', 'company', 'sa', 'sl'];
  const words = text.split(' ').filter((w) => w && !STOP.includes(w));
  const company = words.filter((w) => !generic.includes(w)).join(' ').trim() || words.join(' ').trim();

  const roles = new Set<string>();
  for (const l of labels) ROLE_GROUPS[l].forEach((t) => roles.add(t));
  literal.forEach((t) => roles.add(t));
  return { roles: [...roles], role_labels: [...labels, ...literal], company, location };
}
