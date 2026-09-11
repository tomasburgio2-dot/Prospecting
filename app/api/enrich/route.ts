import { NextResponse } from 'next/server';
import { enrich, bestPhone } from '@/lib/apollo';
import { byLinkedin, byNameDomain } from '@/lib/finalscout';
import { getContact, saveContact, type Contact } from '@/lib/db';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function appUrl(req: Request) {
  const env = process.env.APP_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '');
  return (env || new URL(req.url).origin).replace(/\/$/, '');
}

// Paso 3: waterfall para UNA persona. Apollo (mail + pedido de teléfono) → FinalScout por LinkedIn → FinalScout por nombre+dominio.
export async function POST(req: Request) {
  const { id, domain, force = false } = await req.json();
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 });
  try {
    const cached = await getContact(id);
    if (cached?.email && !force && cached.phone_status !== 'pending') return NextResponse.json({ contact: cached, cached: true });

    const steps: string[] = [];
    const base = appUrl(req);
    const webhook = base.startsWith('https://') ? `${base}/api/apollo/webhook` : undefined; // Apollo exige https
    const a = await enrich(id, webhook);
    steps.push(a.email ? `Apollo: mail ${a.email_status ?? ''}`.trim() : 'Apollo: sin mail');

    let contact: Contact = {
      key: id, name: a.name, title: a.title, company: a.company, city: a.city, linkedin: a.linkedin, photo: a.photo,
      email: a.email, email_status: a.email_status, email_source: a.email ? 'Apollo' : undefined,
      phone_status: webhook ? 'pending' : 'unavailable',
    };
    const ph = bestPhone(a.phones);
    if (ph) { contact.phone = ph.number; contact.phone_status = 'found'; contact.phone_source = 'Apollo'; steps.push('Apollo: teléfono directo'); }
    await saveContact(contact); // guardamos ya, así el webhook encuentra la ficha

    if (!contact.email || contact.email_status === 'unavailable') {
      if (a.linkedin) {
        const f = await byLinkedin(a.linkedin, a.name).catch((e) => { steps.push(`FinalScout error: ${e.message}`); return {} as any; });
        if (f.email) { contact = { ...contact, email: f.email, email_status: f.status, email_source: 'FinalScout' }; steps.push(`FinalScout (LinkedIn): mail ${f.status}`); }
        else steps.push('FinalScout (LinkedIn): sin mail');
      }
      if (!contact.email && domain && a.name) {
        const f = await byNameDomain(a.name, domain).catch((e) => { steps.push(`FinalScout error: ${e.message}`); return {} as any; });
        if (f.email) { contact = { ...contact, email: f.email, email_status: f.status, email_source: 'FinalScout' }; steps.push(`FinalScout (nombre+dominio): mail ${f.status}`); }
        else steps.push('FinalScout (nombre+dominio): sin mail');
      }
    }
    const saved = await saveContact(contact);
    return NextResponse.json({ contact: saved, steps });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
