import { NextResponse } from 'next/server';
import { getContact, saveContact } from '@/lib/db';
export const dynamic = 'force-dynamic';

// La UI consulta acá cada pocos segundos hasta que llega el teléfono (o vence el plazo).
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 });
  const c = await getContact(id);
  if (!c) return NextResponse.json({ error: 'No existe' }, { status: 404 });
  if (c.phone_status === 'pending' && c.updated_at && Date.now() - new Date(c.updated_at).getTime() > 3 * 60 * 1000) {
    return NextResponse.json({ contact: await saveContact({ ...c, phone_status: 'not_found' }) });
  }
  return NextResponse.json({ contact: c });
}
