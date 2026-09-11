import { NextResponse, type NextRequest } from 'next/server';

// Protege todo salvo login, el webhook de Apollo y assets.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/login') || pathname.startsWith('/api/login') || pathname.startsWith('/api/apollo/webhook') || pathname.startsWith('/_next') || pathname === '/favicon.ico') {
    return NextResponse.next();
  }
  const expected = process.env.APP_PASSWORD;
  if (!expected) return NextResponse.next(); // sin contraseña configurada = abierta (solo para pruebas)
  if (req.cookies.get('prospector_auth')?.value === expected) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  return NextResponse.redirect(new URL('/login', req.url));
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
