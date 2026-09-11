'use client';
import { useState } from 'react';

export default function Login() {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) });
    if (r.ok) window.location.href = '/'; else { setErr('Esa no es. Probá de nuevo.'); setBusy(false); }
  }
  return (
    <main className="shell" style={{ paddingTop: 80 }}>
      <div className="logo" style={{ justifyContent: 'center', marginBottom: 24 }}><span>◎</span> Prospector</div>
      <form className="card" onSubmit={go}>
        <h2>Hola 👋</h2>
        <p className="sub">Poné la contraseña del equipo para entrar.</p>
        <input className="bigInput" type="password" placeholder="Contraseña" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        {err && <div className="err">{err}</div>}
        <button className="btn" disabled={busy || !pw}>Entrar</button>
      </form>
    </main>
  );
}
