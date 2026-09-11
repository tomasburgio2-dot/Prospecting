import { NextResponse } from 'next/server';
import { searchPeople } from '@/lib/apollo';
import { logSearch } from '@/lib/db';
export const dynamic = 'force-dynamic';

// Paso 2: lista de personas (sin gastar créditos).
export async function POST(req: Request) {
  try {
    const { domain, roles, location, page = 1, query = '', company = '' } = await req.json();
    if (!domain || !roles?.length) return NextResponse.json({ error: 'Faltan empresa o cargos' }, { status: 400 });
    let result = await searchPeople(domain, roles, location, page);
    // Si el filtro de ubicación deja la lista vacía, reintentamos sin él y avisamos.
    let droppedLocation = false;
    if (result.total === 0 && location) { result = await searchPeople(domain, roles, undefined, page); droppedLocation = result.total > 0; }
    if (page === 1) logSearch({ query, company, roles, results: result.total }).catch(() => {});
    return NextResponse.json({ ...result, droppedLocation });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
