# Prospector

App para que cualquiera (sin saber prospectar) encuentre el mail y el teléfono de una persona escribiendo en lenguaje natural:

> "sommelier del hotel Barceló" → lista de personas estilo Tinder → ❤️ a los que sirven → mail + teléfono.

## Cómo funciona por dentro

1. **Interpretar** la búsqueda → Claude (si hay `ANTHROPIC_API_KEY`) o un diccionario de cargos incorporado (`lib/titles.ts`) la convierte en `{ empresa, cargos, ubicación }`.
2. **Empresa** → Apollo busca la empresa y devuelve el dominio (sin gastar créditos).
3. **Personas** → Apollo People Search por dominio + cargos (sin gastar créditos). Se muestran de a una para elegir.
4. **Contactos (waterfall)** → por cada persona elegida:
   - Apollo `people/match`: mail verificado + pedido de teléfono (llega después por webhook). **Gasta créditos de Apollo.**
   - Si no hay mail → FinalScout por URL de LinkedIn → si sigue sin mail, FinalScout por nombre + dominio. FinalScout cobra 1 crédito solo cuando encuentra.
5. Todo se guarda en Postgres (o en memoria si no hay DB) para no pagar dos veces por la misma persona.

## Subirla a Railway (10 minutos)

1. Subí esta carpeta a un repo de GitHub (sin `node_modules` ni `.env`, el `.gitignore` ya los excluye).
2. En [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo** → elegí el repo. Railway detecta Next.js solo.
3. En el servicio → **Variables** → agregá:

   | Variable | Valor |
   |---|---|
   | `APP_PASSWORD` | la contraseña que van a usar para entrar |
   | `APOLLO_API_KEY` | tu key de Apollo |
   | `FINALSCOUT_API_KEY` | tu key de FinalScout |
   | `ANTHROPIC_API_KEY` | (opcional, recomendado) key de Anthropic para interpretar mejor las búsquedas |
   | `APP_URL` | la URL pública que te da Railway, ej. `https://prospector-production.up.railway.app` (Settings → Networking → Generate Domain). Sin esto no llegan los teléfonos. |

4. (Recomendado) **+ New → Database → PostgreSQL** en el mismo proyecto. Railway inyecta `DATABASE_URL` solo; la app crea las tablas al arrancar.
5. Deploy. Entrá a la URL, poné la contraseña y probá con "sommelier del hotel Barceló".

## Correrla local (opcional)

```bash
cp .env.example .env   # completá las keys
npm install
npm run dev            # http://localhost:3000
```

Nota: en local los teléfonos de Apollo no llegan (Apollo necesita una URL pública https para el webhook). El mail sí funciona.

## Costos por contacto

- Apollo: 1 crédito por mail revelado + créditos extra por teléfono (según plan; en planes básicos el teléfono puede no estar disponible → la app lo marca como "sin teléfono").
- FinalScout: 1 crédito solo si encuentra mail.
- Buscar empresas y personas: gratis.

## Dónde tocar cosas

- Cargos y sinónimos: `lib/titles.ts`
- Orden del waterfall: `app/api/enrich/route.ts`
- Textos de la interfaz: `app/page.tsx`
- Para sumar otro proveedor de teléfonos (Lusha, Kaspr): crear `lib/<proveedor>.ts` y llamarlo desde `enrich/route.ts` cuando `phone_status` no sea `found`.
