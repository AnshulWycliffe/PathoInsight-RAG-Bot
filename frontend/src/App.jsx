import { useState, useRef, useEffect, useCallback } from 'react';
import { DEMO_REPORT, MOCK_CONVERSATION } from './mockData';
import './App.css';

const API = 'http://localhost:8000';
const ts  = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// ── Dynamic suggestions from report ────────────
function makeSuggestions(report) {
  if (!report) return [];
  const qs = ['Give me an overall summary of my report.'];
  for (const cat of report.categories ?? []) {
    for (const m of (cat.metrics ?? []).filter(m => m.status !== 'normal').slice(0, 2)) {
      qs.push(m.status === 'high'
        ? `Why is my ${m.name} high (${m.value} ${m.unit})?`
        : `What does a low ${m.name} (${m.value} ${m.unit}) mean?`);
    }
  }
  qs.push('What dietary changes should I make?');
  qs.push('Which results need urgent follow-up?');
  return qs.slice(0, 6);
}

// ── Tiny markdown renderer ──────────────────────
function MD({ text }) {
  if (!text) return null;
  return text.split('\n').map((line, i) => {
    const key = i;
    if (/^#{1,3}\s/.test(line))
      return <h3 key={key}>{inl(line.replace(/^#{1,3}\s/, ''))}</h3>;
    if (/^[-*]\s/.test(line))
      return <li key={key}>{inl(line.slice(2))}</li>;
    if (!line.trim())
      return <br key={key} />;
    return <p key={key}>{inl(line)}</p>;
  });
}
function inl(t) {
  return t.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((p, i) => {
    if (p.startsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('*'))  return <em key={i}>{p.slice(1, -1)}</em>;
    return p;
  });
}

// ── Citations ───────────────────────────────────
function Cites({ list }) {
  if (!list?.length) return null;
  return (
    <div className="cites">
      <div className="cites-lbl">Sources</div>
      {list.map((c, i) => (
        <a key={i} className="cite-a" href={c.url} target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          {c.title || c.url}
        </a>
      ))}
    </div>
  );
}

// ── Status badge ────────────────────────────────
function Badge({ status }) {
  if (status === 'normal') return <span className="sb sb-ok">Normal</span>;
  if (status === 'high')   return <span className="sb sb-high">↑ High</span>;
  return                          <span className="sb sb-low">↓ Low</span>;
}

// ── Main App ────────────────────────────────────
export default function App() {
  const [report,      setReport]      = useState(null);
  const [loaded,      setLoaded]      = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [history,     setHistory]     = useState([MOCK_CONVERSATION[0]]);
  const [input,       setInput]       = useState('');
  const [streaming,   setStreaming]   = useState(false);
  const bottomRef = useRef(null);
  const fileRef   = useRef(null);
  const abortRef  = useRef(null);

  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), [history]);

  const pushBot = (text, citations = []) =>
    setHistory(p => [...p, { id: Date.now(), sender: 'bot', text, timestamp: ts(), citations }]);

  // ── Demo / Reset ──────────────────────────────
  const demo = () => {
    setLoading(true);
    setTimeout(() => {
      setReport(DEMO_REPORT); setLoaded(true); setLoading(false);
      pushBot(`**Demo report loaded** for ${DEMO_REPORT.patient.name}.\n5 panels: CBC · LFT · KFT · Thyroid · Lipid. Ask me anything.`);
    }, 800);
  };

  const reset = () => {
    abortRef.current?.abort();
    setReport(null); setLoaded(false);
    setHistory([MOCK_CONVERSATION[0]]);
    setInput(''); setStreaming(false);
  };

  // ── File upload ───────────────────────────────
  const processFile = async (file) => {
    setLoading(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch(`${API}/api/upload`, { method: 'POST', body: fd });
      if (res.ok) {
        const j = await res.json();
        if (j.success && j.data) {
          setReport(j.data); setLoaded(true); setLoading(false);
          pushBot(`**${file.name}** parsed. Dashboard updated. Ask me about your results.`);
          return;
        }
      }
    } catch (e) { console.warn('Backend offline:', e); }
    setTimeout(() => {
      setReport(DEMO_REPORT); setLoaded(true); setLoading(false);
      pushBot(`Loaded demo data (backend offline). You can still explore the UI.`);
    }, 900);
  };

  // ── Streaming chat ─────────────────────────────
  const send = useCallback(async (text) => {
    if (!text.trim() || streaming) return;
    const uid = Date.now(), bid = Date.now() + 1;
    setHistory(p => [
      ...p,
      { id: uid, sender: 'user', text, timestamp: ts(), citations: [] },
      { id: bid, sender: 'bot',  text: '', timestamp: ts(), citations: [], streaming: true },
    ]);
    setStreaming(true);

    const ctrl = new AbortController(); abortRef.current = ctrl;
    try {
      const res = await fetch(`${API}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text }),
        signal: ctrl.signal,
      });
      if (res.ok) {
        const reader = res.body.getReader(), dec = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n'); buf = lines.pop();
          for (const ln of lines) {
            if (!ln.startsWith('data: ')) continue;
            try {
              const ev = JSON.parse(ln.slice(6));
              if (ev.type === 'text')
                setHistory(p => p.map(m => m.id === bid ? { ...m, text: m.text + ev.content } : m));
              else if (ev.type === 'citations')
                setHistory(p => p.map(m => m.id === bid ? { ...m, citations: ev.citations ?? [] } : m));
              else if (ev.type === 'done' || ev.type === 'error')
                setHistory(p => p.map(m => m.id === bid
                  ? { ...m, streaming: false, ...(ev.content ? { text: ev.content } : {}) }
                  : m));
            } catch (_) {}
          }
        }
        setStreaming(false); return;
      }
    } catch (e) { if (e.name === 'AbortError') { setStreaming(false); return; } }

    // fallback
    setStreaming(false);
    setHistory(p => p.map(m => m.id === bid ? { ...m, text: mockReply(text, report), streaming: false } : m));
  }, [streaming, report]);

  const submit = e => { e?.preventDefault(); send(input); setInput(''); };

  // ─────────────────────────────────────────────
  return (
    <>
      {/* Header */}
      <header className="hdr">
        <div className="hdr-brand">
          <div className="hdr-icon">
            <svg viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
          </div>
          <div>
            <div className="hdr-title">Patho<span>Insight</span></div>
            <div className="hdr-sub">AI Pathology Assistant</div>
          </div>
        </div>
        {!loaded
          ? <button className="btn btn-teal" onClick={demo}>Use Demo Report</button>
          : <button className="btn btn-red"  onClick={reset}>Reset</button>
        }
      </header>

      {/* Two-panel grid */}
      <div className="grid">

        {/* LEFT — Report */}
        <div className="card">
          <div className="card-head">
            <div className="card-title">
              <svg viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
              Report
            </div>
            {loaded && <span className="sb sb-ok">Loaded</span>}
          </div>

          <div className="card-body">
            {loading ? (
              <div className="loading"><div className="spinner"/><p>Parsing report…</p></div>
            ) : !loaded ? (
              <div className="upload-area">
                <div
                  className="drop-zone"
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) processFile(f); }}
                  onClick={() => fileRef.current.click()}
                >
                  <div className="drop-icon">
                    <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                  </div>
                  <h3>Drop your pathology report</h3>
                  <p>PDF or image · CBC, LFT, KFT, Thyroid, Lipid</p>
                  <button className="btn-primary" onClick={e => { e.stopPropagation(); fileRef.current.click(); }}>Browse</button>
                  <input type="file" className="file-input" ref={fileRef} accept=".pdf,image/*"
                    onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
                </div>
                <div className="or-row">or</div>
                <button className="btn-primary" onClick={demo}>Load 5-Panel Demo</button>
              </div>
            ) : (
              <>
                {/* Patient */}
                <div className="pt-bar">
                  <span><span className="lbl">Patient: </span><span className="val">{report.patient?.name}</span></span>
                  <span><span className="lbl">Age/Sex: </span><span className="val">{report.patient?.age} / {report.patient?.gender}</span></span>
                  <span><span className="lbl">Date: </span><span className="val">{report.patient?.date}</span></span>
                  <span><span className="lbl">ID: </span><span className="val">{report.patient?.id}</span></span>
                </div>

                {/* One compact table per category */}
                {report.categories?.map(cat => {
                  const ab = cat.metrics?.filter(m => m.status !== 'normal').length ?? 0;
                  return (
                    <div key={cat.id} className="cat">
                      <div className="cat-name">
                        {cat.name}
                        {ab > 0 && <span className="ab-badge">{ab} abnormal</span>}
                      </div>
                      <table className="results-table">
                        <thead>
                          <tr>
                            <th>Test</th>
                            <th>Result</th>
                            <th>Reference</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cat.metrics?.map((m, i) => (
                            <tr key={i} className={m.status !== 'normal' ? 'abnormal-row' : ''}>
                              <td className="t-name">{m.name}</td>
                              <td><span className="t-value">{m.value}</span><span className="t-unit">{m.unit}</span></td>
                              <td className="t-ref">{m.minRef} – {m.maxRef}</td>
                              <td className="t-status"><Badge status={m.status}/></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* RIGHT — Chat */}
        <div className="card">
          <div className="card-head">
            <div className="card-title">
              <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              AI Assistant
            </div>
            <div className="status">
              <div className={`dot ${streaming ? 'gen' : 'ok'}`}/>
              {streaming ? 'Generating…' : 'Ready'}
            </div>
          </div>

          <div className="chat-msgs">
            {history.map(m => (
              <div key={m.id} className={`msg ${m.sender}`}>
                <div className="av">
                  {m.sender === 'bot'
                    ? <svg viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                    : <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  }
                </div>
                <div className="msg-wrap">
                  <div className="bubble">
                    <MD text={m.text}/>
                    {m.streaming && <span className="cursor"/>}
                    {!m.streaming && <Cites list={m.citations}/>}
                  </div>
                  <span className="ts">{m.timestamp}</span>
                </div>
              </div>
            ))}
            <div ref={bottomRef}/>
          </div>

          {/* Context-aware suggestion pills */}
          {loaded && !streaming && (
            <div className="sugg-wrap">
              <div className="sugg-lbl">Ask about your report</div>
              <div className="sugg-pills">
                {makeSuggestions(report).map((q, i) => (
                  <button key={i} className="sugg" onClick={() => { send(q); }}>{q}</button>
                ))}
              </div>
            </div>
          )}

          <form className="input-bar" onSubmit={submit}>
            <input
              className="chat-in"
              type="text"
              placeholder={loaded ? 'Ask about your results…' : 'Upload a report first…'}
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={loading || streaming}
            />
            <button className="send" type="submit" disabled={!input.trim() || loading || streaming}>
              <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </form>
        </div>
      </div>

      <footer className="footer">
        ⚕️ <strong>Disclaimer:</strong> PathoInsight is for educational purposes only — not medical advice. Always consult a qualified physician.
      </footer>
    </>
  );
}

// ── Mock fallback ───────────────────────────────
function mockReply(text, report) {
  if (!report) return "Please upload a report or load the demo first.";
  const t = text.toLowerCase();
  if (t.includes('summary') || t.includes('overall'))
    return `**Overall Summary**\n* **CBC** — Mild anemia (low Hb, RBC)\n* **LFT** — Elevated ALT/AST (liver stress)\n* **KFT** — High uric acid\n* **Thyroid** — Hypothyroidism pattern (high TSH, low FT4)\n* **Lipid** — High LDL and triglycerides\n\n⚕️ Discuss all findings with your doctor.`;
  if (t.includes('liver') || t.includes('alt') || t.includes('ast'))
    return `**Elevated Liver Enzymes**\nALT 78 and AST 65 are above normal. This often indicates fatty liver, alcohol use, or medication effects. A repeat test in 4–6 weeks is usually recommended.\n\n⚕️ Educational only. Consult your physician.`;
  if (t.includes('hemoglobin') || t.includes('anemia'))
    return `**Low Hemoglobin**\nHemoglobin 11.2 g/dL is below 13.8 (normal for males). Likely iron-deficiency anemia. Increase iron-rich foods and ask your doctor for a ferritin test.\n\n⚕️ Educational only. Consult your physician.`;
  if (t.includes('tsh') || t.includes('thyroid'))
    return `**Thyroid — Hypothyroidism**\nHigh TSH (6.2) + low FT4 (0.72) = underactive thyroid. Treatable with daily levothyroxine. See an endocrinologist.\n\n⚕️ Educational only. Consult your physician.`;
  if (t.includes('ldl') || t.includes('cholesterol') || t.includes('lipid'))
    return `**High Cholesterol / LDL**\nLDL 142 is above the 100 target. Reduce saturated fats, add more fibre, and exercise regularly. Your doctor may consider statins.\n\n⚕️ Educational only. Consult your physician.`;
  if (t.includes('uric') || t.includes('gout'))
    return `**High Uric Acid**\nUric acid 7.8 (ref < 7.2) raises gout and kidney stone risk. Stay hydrated, reduce red meat and alcohol intake.\n\n⚕️ Educational only. Consult your physician.`;
  if (t.includes('diet') || t.includes('food'))
    return `**Dietary Tips**\n* Anemia: spinach, lentils, lean meat + Vitamin C\n* Liver: Mediterranean diet, no alcohol\n* Cholesterol: oats, beans, cut saturated fat\n* Thyroid: iodine-rich foods (seafood, dairy)\n* Uric acid: 2+ litres water daily\n\n⚕️ Educational only. Consult your physician.`;
  if (t.includes('urgent') || t.includes('follow'))
    return `**Priority Follow-ups**\n1. Thyroid — endocrinologist referral soon\n2. Liver enzymes — repeat LFT in 6 weeks\n3. LDL — GP discussion on statins\n4. Anemia — iron/ferritin panel\n\n⚕️ Educational only. Consult your physician.`;
  return `I'm in offline mode. Start the backend to get AI-powered answers grounded in your report.\n\n⚕️ Educational only. Consult your physician.`;
}
