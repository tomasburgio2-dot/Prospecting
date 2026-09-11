import { NextResponse } from 'next/server';
import { phonesFromWebhook, bestPhone } from '@/lib/apollo';
import { getContact, saveContact } from '@/lib/db';
export const dynamic = 'force-dynamic';

// Apollo llama acá cuando termina de buscar el teléfono.
export async function POST(req: Request) {
  let payload: any = {};
  try { payload = await req.json(); } catch { /* ignoramos */ }
  const results = phonesFromWebhook(payload);
  for (const r of results) {
    const c = await getContact(r.id);
    if (!c) continue;
    const ph = bestPhone(r.phones);
    await saveContact({ ...c, phone: ph?.number ?? c.phone, phone_status: ph ? 'found' : 'not_found', phone_source: ph ? 'Apollo' : c.phone_source });
  }
  return NextResponse.json({ ok: true, updated: results.length });
}
export async function GET() { return NextResponse.json({ ok: true }); }
