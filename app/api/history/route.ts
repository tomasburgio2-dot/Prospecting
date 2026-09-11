import { NextResponse } from 'next/server';
import { recentContacts } from '@/lib/db';
import { credits } from '@/lib/finalscout';
export const dynamic = 'force-dynamic';
export async function GET() {
  const [contacts, fs] = await Promise.all([recentContacts(100), credits()]);
  return NextResponse.json({ contacts, finalscout_credits: fs });
}
