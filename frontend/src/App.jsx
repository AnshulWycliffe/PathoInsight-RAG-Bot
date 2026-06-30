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
            <img src="" alt="" />
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
                    ? <svg xmlns="http://www.w3.org/2000/svg" width="800px" height="800px" viewBox="0 -19.5 164 164" fill="none">
<path d="M19.2329 89.0831C17.3341 89.4211 15.7432 89.7559 14.1371 89.9817C7.06966 90.976 1.51901 86.5687 0.48068 79.5288C-1.0289 69.307 6.73229 58.1139 14.141 55.0389C16.6482 53.9986 19.5794 53.9795 23.0364 53.3665C32.2494 32.1615 49.7618 21.7934 73.5423 20.3488C73.8921 16.4462 74.238 12.5935 74.6022 8.54059C73.5751 8.11988 72.3431 7.95977 71.6796 7.26077C70.7134 6.24344 69.5996 4.84016 69.5957 3.59771C69.5918 2.53116 70.9221 0.709891 71.8974 0.535306C74.597 0.0535535 77.542 -0.276629 80.1608 0.325233C83.5048 1.0938 83.9852 3.75262 81.8548 6.48561C81.4171 6.9389 81.1341 7.51899 81.0462 8.14288C81.224 11.6156 81.5273 15.081 81.7616 18.179C88.0211 18.7375 94.0055 19.0381 99.9211 19.8421C119.273 22.472 132.088 33.3508 139.077 51.3896C139.194 51.6909 139.333 51.9849 139.478 52.2744C139.549 52.3747 139.633 52.4656 139.727 52.5448C142.943 52.5448 146.247 52.1103 149.393 52.6347C156.138 53.7583 161.178 57.4004 162.853 64.3477C164.528 71.2951 161.862 77.0616 156.759 81.6435C151.742 86.1493 145.621 87.389 138.993 86.5404C138.746 86.7453 138.532 86.987 138.359 87.2571C130.949 104.691 117.203 114.915 99.7662 120.658C84.6227 125.684 68.3154 126.026 52.9746 121.639C36.0424 116.958 23.8017 107.182 19.2329 89.0831ZM74.3653 116.033C77.9548 115.728 81.5686 115.59 85.1292 115.09C99.4118 113.083 112.05 107.628 121.744 96.6153C138.759 77.2881 134.524 42.1123 104.846 32.3558C93.8566 28.746 82.3857 26.5243 70.7233 27.2725C57.6687 28.1106 46.2832 33.0968 37.8617 43.4256C30.0513 53.0022 26.6062 64.3694 26.3233 76.5471C25.9125 94.2223 34.5276 106.232 51.1808 112.095C58.6448 114.649 66.4731 115.979 74.362 116.032L74.3653 116.033ZM20.0205 60.3756C19.7421 60.3376 19.4597 60.3412 19.1824 60.3861C12.7641 62.2757 6.45466 73.2929 8.09026 79.6823C8.58579 81.6199 9.81316 82.7712 11.7592 82.8092C13.8765 82.8512 16.0005 82.5894 17.5501 82.4949C18.4092 74.7881 19.2099 67.6156 20.0185 60.3742L20.0205 60.3756ZM141.736 77.21C145.278 77.15 148.678 75.8064 151.305 73.4289C154.874 70.1905 155.296 65.2817 152.224 62.4522C149.242 59.7061 145.667 58.9152 141.736 59.7146V77.21Z" fill="#FFFFFF"/>
<path d="M84.8075 82.0252C86.4018 82.3193 88.1725 82.2825 89.5331 83.0097C90.1516 83.3495 90.6946 83.8115 91.129 84.3676C91.5634 84.9238 91.8802 85.5624 92.06 86.2448C92.3344 88.1095 90.7172 89.0671 88.9411 89.2994C88.0814 89.4143 87.2076 89.3635 86.367 89.1498C84.8505 88.6937 83.2428 88.6309 81.6954 88.9674C80.148 89.304 78.7116 90.0287 77.5215 91.0734C76.1714 92.182 74.5896 93.0209 73.233 91.3781C72.0319 89.9236 72.5832 88.2348 73.7817 86.9346C75.1549 85.3673 76.8518 84.1166 78.7554 83.269C80.659 82.4214 82.7239 81.9971 84.8075 82.0252Z" fill="#FFFFFF"/>
<path d="M57.7186 52.5112C61.4295 52.6392 63.7503 55.2876 63.5495 59.1645C63.3893 62.2533 60.9084 64.7434 58.1203 64.6154C54.9698 64.4703 52.4724 61.3206 52.607 57.6582C52.7442 53.9453 54.2853 52.3924 57.7186 52.5112Z" fill="#FFFFFF"/>
<path d="M93.575 57.3327C93.5684 54.2361 94.7564 52.8328 97.4244 52.7856C100.873 52.7245 103.039 54.689 102.96 57.8066C102.891 60.4916 100.78 62.7678 98.3 62.8282C95.4672 62.8971 93.5822 60.7024 93.575 57.3327Z" fill="#FFFFFF"/>
</svg>
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
