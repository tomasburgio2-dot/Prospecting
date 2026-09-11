'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

type Parsed = { company: string; roles: string[]; role_labels: string[]; location?: string; summary: string; method: string };
type Company = { name: string; domain: string; logo?: string; employees?: number; industry?: string; city?: string; country?: string };
type Person = { id: string; first_name: string; last_name_hint: string; title: string; company: string; city?: string; country?: string; has_email: boolean; maybe_phone: boolean; photo?: string };
type Contact = { key: string; name: string; title: string; company: string; city?: string; linkedin?: string; photo?: string; email?: string; email_status?: string; email_source?: string; phone?: string; phone_status?: string; phone_source?: string };
type Row = { person: Person; state: 'queued' | 'working' | 'done' | 'error'; contact?: Contact; steps?: string[]; error?: string };

const EXAMPLES = ['Sommelier del hotel Barceló', 'Director de A&B de Meliá en Madrid', 'Jefe de compras de Grupo Dani García', 'CEO y CFO de Scala Data Centers'];

export default function Home() {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 'history'>(1);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [total, setTotal] = useState(0);
  const [note, setNote] = useState('');
  const [idx, setIdx] = useState(0);
  const [fly, setFly] = useState<'left' | 'right' | null>(null);
  const [liked, setLiked] = useState<Person[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [history, setHistory] = useState<{ contacts: Contact[]; finalscout_credits: number | null } | null>(null);
  const [manual, setManual] = useState('');

  const initials = (p: { first_name?: string; name?: string; last_name_hint?: string }) => {
    const n = (p.name ?? `${p.first_name ?? ''} ${p.last_name_hint ?? ''}`).trim();
    return n.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
  };

  // Paso 1 → interpretar
  async function interpret(q: string) {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/parse', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: q }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setParsed(j.parsed); setCompanies(j.companies); setStep(2);
      if (j.companies.length === 1) pickCompany(j.companies[0], j.parsed);
    } catch (e: any) { setErr(e.message || 'Algo falló'); }
    setBusy(false);
  }

  async function lookupCompany(name: string) {
    setBusy(true); setErr('');
    const r = await fetch('/api/companies?q=' + encodeURIComponent(name)); const j = await r.json();
    setCompanies(j.companies ?? []); setBusy(false);
    if (!j.companies?.length) setErr('No encontré esa empresa. Probá con otro nombre (o el dominio, ej: barcelo.com).');
  }

  // Paso 2 → personas
  async function pickCompany(c: Company, p = parsed) {
    if (!p) return;
    setCompany(c); setBusy(true); setErr(''); setNote('');
    try {
      const r = await fetch('/api/people', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ domain: c.domain, roles: p.roles, location: p.location, query, company: c.name }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setPeople(j.people); setTotal(j.total); setIdx(0); setLiked([]);
      if (j.droppedLocation) setNote(`No había nadie en "${p.location}", así que te muestro gente de ${c.name} en cualquier lugar.`);
      if (!j.people.length) setErr(`No encontré ${p.role_labels.join(' / ') || 'ese cargo'} en ${c.name}. Probá con otro cargo o empresa.`);
      else setStep(3);
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  // Paso 3 → tinder
  const swipe = useCallback((dir: 'left' | 'right') => {
    if (fly || idx >= people.length) return;
    setFly(dir);
    setTimeout(() => {
      if (dir === 'right') setLiked((l) => [...l, people[idx]]);
      setIdx((i) => i + 1); setFly(null);
    }, 240);
  }, [fly, idx, people]);

  useEffect(() => {
    if (step !== 3) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') swipe('right'); if (e.key === 'ArrowLeft') swipe('left'); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [step, swipe]);

  // Paso 4 → enriquecer uno por uno
  const pollers = useRef<Record<string, any>>({});
  async function getContacts(list: Person[]) {
    setStep(4);
    const initial: Row[] = list.map((person) => ({ person, state: 'queued' }));
    setRows(initial);
    for (let i = 0; i < list.length; i++) {
      setRows((rs) => rs.map((r, k) => (k === i ? { ...r, state: 'working' } : r)));
      try {
        const r = await fetch('/api/enrich', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: list[i].id, domain: company?.domain }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setRows((rs) => rs.map((row, k) => (k === i ? { ...row, state: 'done', contact: j.contact, steps: j.steps } : row)));
        if (j.contact?.phone_status === 'pending') pollPhone(j.contact.key);
      } catch (e: any) {
        setRows((rs) => rs.map((row, k) => (k === i ? { ...row, state: 'error', error: e.message } : row)));
      }
    }
  }
  function pollPhone(id: string) {
    let n = 0;
    pollers.current[id] = setInterval(async () => {
      n++;
      const r = await fetch('/api/phone?id=' + id); const j = await r.json();
      const c: Contact | undefined = j.contact;
      if (c && c.phone_status !== 'pending') {
        setRows((rs) => rs.map((row) => (row.contact?.key === id ? { ...row, contact: c } : row)));
        clearInterval(pollers.current[id]);
      }
      if (n > 60) clearInterval(pollers.current[id]);
    }, 4000);
  }
  useEffect(() => () => Object.values(pollers.current).forEach(clearInterval), []);

  function copy(t: string) { navigator.clipboard?.writeText(t); }
  function exportCsv(cs: Contact[]) {
    const esc = (s?: string) => `"${(s ?? '').replace(/"/g, '""')}"`;
    const lines = ['Nombre,Cargo,Empresa,Ciudad,Email,Estado email,Fuente email,Teléfono,Fuente teléfono,LinkedIn', ...cs.map((c) => [c.name, c.title, c.company, c.city, c.email, c.email_status, c.email_source, c.phone, c.phone_source, c.linkedin].map(esc).join(','))];
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `contactos-${company?.name ?? 'prospector'}.csv`; a.click();
  }
  function copyAll(cs: Contact[]) {
    copy(cs.map((c) => `${c.name} — ${c.title} (${c.company})\n📧 ${c.email ?? 'sin mail'}\n📱 ${c.phone ?? 'sin teléfono'}\n${c.linkedin ?? ''}`).join('\n\n'));
  }
  async function openHistory() { setStep('history'); const r = await fetch('/api/history'); setHistory(await r.json()); }
  function reset() { setStep(1); setQuery(''); setParsed(null); setCompanies([]); setCompany(null); setPeople([]); setRows([]); setErr(''); setNote(''); }

  const current = people[idx];
  const next = people[idx + 1];
  const doneContacts = rows.filter((r) => r.contact).map((r) => r.contact!) as Contact[];

  return (
    <main className="shell">
      <div className="top">
        <div className="logo" onClick={reset} style={{ cursor: 'pointer' }}><span>◎</span> Prospector</div>
        {step === 'history' ? <button className="link" onClick={reset}>← Volver</button> : <button className="link" onClick={openHistory}>Historial</button>}
      </div>

      {typeof step === 'number' && (
        <div className="steps">{[1, 2, 3, 4].map((s) => <div key={s} className={s <= step ? 'on' : ''} />)}</div>
      )}

      {step === 1 && (
        <>
          <h1>¿A quién querés encontrar?</h1>
          <p className="sub">Escribilo como se lo dirías a un amigo. Cargo + empresa, y si querés, la ciudad.</p>
          <form className="card" onSubmit={(e) => { e.preventDefault(); if (query.trim()) interpret(query); }}>
            <input className="bigInput" placeholder="Ej: sommelier del hotel Barceló" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
            <div className="chips">{EXAMPLES.map((x) => <button type="button" key={x} className="chip" onClick={() => { setQuery(x); interpret(x); }}>{x}</button>)}</div>
            {err && <div className="err">{err}</div>}
            <button className="btn" disabled={busy || !query.trim()}>{busy ? 'Pensando…' : 'Buscar'}</button>
          </form>
        </>
      )}

      {step === 2 && parsed && (
        <>
          <h1>Entendí esto 👇</h1>
          <p className="sub"><b>{parsed.summary}</b>. ¿A cuál de estas empresas te referís?</p>
          <div className="card">
            {companies.map((c) => (
              <button key={c.domain} className="company" onClick={() => pickCompany(c)} disabled={busy}>
                {c.logo ? <img src={c.logo} alt="" /> : <div className="ph">{c.name[0]}</div>}
                <div><b>{c.name}</b><small>{c.domain}{c.employees ? ` · ~${c.employees.toLocaleString('es')} empleados` : ''}{c.country ? ` · ${c.country}` : ''}</small></div>
              </button>
            ))}
            {!companies.length && !busy && <p className="sub">No encontré ninguna empresa con ese nombre.</p>}
            <div className="row mt">
              <input className="bigInput" style={{ padding: 12, fontSize: 15 }} placeholder="Otra empresa o dominio (ej: melia.com)" value={manual} onChange={(e) => setManual(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && lookupCompany(manual)} />
              <button className="btn small ghost" onClick={() => lookupCompany(manual)} disabled={busy || !manual}>Buscar</button>
            </div>
            {busy && <p className="pending mt"><span className="spin" /> Buscando gente…</p>}
            {err && <div className="err">{err}</div>}
          </div>
          <button className="btn ghost" onClick={() => setStep(1)}>← Cambiar la búsqueda</button>
        </>
      )}

      {step === 3 && (
        <>
          <h1>¿Es esta persona?</h1>
          <p className="sub">Deslizá a la derecha (o ❤️) si es a quien buscás. A la izquierda (o ✕) si no. Tranqui: no gasta nada hasta que pidas los contactos.</p>
          {note && <div className="note">{note}</div>}
          <div className="counter"><span>{Math.min(idx + 1, people.length)} de {people.length}{total > people.length ? ` (hay ${total} en total)` : ''}</span><span>❤️ {liked.length} elegidos</span></div>
          <div className="deck">
            {next && <div className="person behind"><div className="avatar">{initials(next)}</div><h3>{next.first_name} {next.last_name_hint}</h3></div>}
            {current ? (
              <div className={`person ${fly ?? ''}`}>
                {current.photo ? <img className="avatar" src={current.photo} alt="" /> : <div className="avatar">{initials(current)}</div>}
                <h3>{current.first_name} {current.last_name_hint}</h3>
                <div className="title">{current.title}</div>
                <div className="meta">{current.company}{current.city ? ` · ${current.city}` : ''}{current.country ? `, ${current.country}` : ''}</div>
                <div className="badges">
                  <span className={`badge ${current.has_email ? 'ok' : ''}`}>{current.has_email ? '📧 tiene mail' : '📧 mail: a buscar'}</span>
                  <span className={`badge ${current.maybe_phone ? 'warn' : ''}`}>{current.maybe_phone ? '📱 puede tener teléfono' : '📱 teléfono: a buscar'}</span>
                </div>
              </div>
            ) : (
              <div className="person"><h3>Listo, no hay más 🙌</h3><p className="sub">Elegiste {liked.length}. Pedí los contactos abajo.</p></div>
            )}
          </div>
          {current && (
            <div className="actions">
              <button className="round no" onClick={() => swipe('left')} aria-label="No">✕</button>
              <button className="round yes" onClick={() => swipe('right')} aria-label="Sí">❤️</button>
            </div>
          )}
          <p className="hint">También podés usar las flechas ← → del teclado</p>
          <button className="btn" disabled={!liked.length} onClick={() => getContacts(liked)}>Conseguir {liked.length ? `${liked.length} contacto${liked.length > 1 ? 's' : ''}` : 'contactos'} →</button>
          <button className="btn ghost" onClick={() => setStep(2)}>← Otra empresa</button>
        </>
      )}

      {step === 4 && (
        <>
          <h1>Acá van 🎯</h1>
          <p className="sub">Buscamos mail y teléfono en Apollo y FinalScout. El teléfono a veces tarda un minuto más.</p>
          {rows.map((r) => (
            <div className="result" key={r.person.id}>
              {r.contact?.photo ? <img src={r.contact.photo} alt="" /> : <div className="ph">{initials(r.contact ?? r.person)}</div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{r.contact?.name ?? `${r.person.first_name} ${r.person.last_name_hint}`}</b>
                <div className="t">{r.contact?.title ?? r.person.title} · {r.contact?.company ?? r.person.company}</div>
                {r.state === 'queued' && <span className="pending">En cola…</span>}
                {r.state === 'working' && <span className="pending"><span className="spin" /> Buscando mail y teléfono…</span>}
                {r.state === 'error' && <div className="err">Falló: {r.error}</div>}
                {r.contact && (
                  <>
                    <div className="row"><span className="k">📧</span>{r.contact.email ? <><code>{r.contact.email}</code><button className="copy" onClick={() => copy(r.contact!.email!)}>copiar</button><small style={{ color: 'var(--muted)' }}>{r.contact.email_status} · {r.contact.email_source}</small></> : <span className="pending">No apareció mail en ninguna fuente</span>}</div>
                    <div className="row"><span className="k">📱</span>
                      {r.contact.phone ? <><code>{r.contact.phone}</code><button className="copy" onClick={() => copy(r.contact!.phone!)}>copiar</button><small style={{ color: 'var(--muted)' }}>{r.contact.phone_source}</small></>
                        : r.contact.phone_status === 'pending' ? <span className="pending"><span className="spin" /> Apollo está buscando el teléfono…</span>
                        : r.contact.phone_status === 'unavailable' ? <span className="pending">Teléfonos desactivados (falta APP_URL https)</span>
                        : <span className="pending">Sin teléfono</span>}
                    </div>
                    {r.contact.linkedin && <div className="row"><span className="k">in</span><a href={r.contact.linkedin} target="_blank" rel="noreferrer">Ver perfil de LinkedIn ↗</a></div>}
                  </>
                )}
              </div>
            </div>
          ))}
          {rows.every((r) => r.state === 'done' || r.state === 'error') && (
            <div className="grid2 mt">
              <button className="btn ghost" style={{ marginTop: 0 }} onClick={() => copyAll(doneContacts)}>Copiar todo</button>
              <button className="btn ghost" style={{ marginTop: 0 }} onClick={() => exportCsv(doneContacts)}>Bajar Excel (CSV)</button>
            </div>
          )}
          <button className="btn" onClick={reset}>Nueva búsqueda</button>
        </>
      )}

      {step === 'history' && (
        <>
          <h1>Historial</h1>
          <p className="sub">Contactos que ya conseguimos (no vuelven a gastar créditos).{history?.finalscout_credits != null && <> Créditos FinalScout: <b>{history.finalscout_credits.toLocaleString('es')}</b>.</>}</p>
          {!history && <p className="pending"><span className="spin" /> Cargando…</p>}
          {history?.contacts.map((c) => (
            <div className="result" key={c.key}>
              {c.photo ? <img src={c.photo} alt="" /> : <div className="ph">{initials(c)}</div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{c.name}</b><div className="t">{c.title} · {c.company}</div>
                <div className="row"><span className="k">📧</span>{c.email ? <><code>{c.email}</code><button className="copy" onClick={() => copy(c.email!)}>copiar</button></> : <span className="pending">sin mail</span>}</div>
                <div className="row"><span className="k">📱</span>{c.phone ? <><code>{c.phone}</code><button className="copy" onClick={() => copy(c.phone!)}>copiar</button></> : <span className="pending">sin teléfono</span>}</div>
              </div>
            </div>
          ))}
          {history && !history.contacts.length && <p className="sub">Todavía no hay nada. Hacé tu primera búsqueda.</p>}
          {history?.contacts.length ? <button className="btn ghost" onClick={() => exportCsv(history.contacts)}>Bajar todo (CSV)</button> : null}
        </>
      )}
    </main>
  );
}
