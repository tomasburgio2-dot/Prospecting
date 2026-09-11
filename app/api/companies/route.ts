import { NextResponse } from 'next/server';
import { searchCompanies } from '@/lib/apollo';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get('q') ?? '';
  try { return NextResponse.json({ companies: await searchCompanies(name) }); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
