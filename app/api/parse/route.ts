import { NextResponse } from 'next/server';
import { parseQuery } from '@/lib/parse';
import { searchCompanies } from '@/lib/apollo';

export const dynamic = 'force-dynamic';

// Paso 1: interpreta la búsqueda y propone empresas candidatas.
export async function POST(req: Request) {
  try {
    const { query } = await req.json();
    if (!query?.trim()) return NextResponse.json({ error: 'Escribí qué querés buscar' }, { status: 400 });
    const parsed = await parseQuery(query);
    const companies = parsed.company ? await searchCompanies(parsed.company) : [];
    return NextResponse.json({ parsed, companies });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
