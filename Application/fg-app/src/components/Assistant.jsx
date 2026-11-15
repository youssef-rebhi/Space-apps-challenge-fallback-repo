import { useRef, useState } from "react";
import { answer, respond } from "../lib/assistant.js";
import { say } from "../lib/mission.js";

// Ask by voice (if the browser allows speech recognition) or by typing. Answers are spoken.
export default function Assistant({ ctx, voice = true, compact = false }) {
  const [log, setLog] = useState([]);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const rec = useRef(null);
  const [pending, setPending] = useState(null); // a question I asked ("go back to the start?")

  function ask(q) {
    if (!q.trim()) return;
    let a;
    if (ctx.actions) { // helmet: conversation with actions, always asks before acting
      const r = respond(q, ctx, pending);
      setPending(r.ask || null);
      if (r.act) ctx.actions[r.act.type]?.(r.act);
      a = r.text;
    } else a = answer(q, ctx);
    setLog((l) => [...l.slice(-3), { q, a }]);
    setText("");
    say(a, voice);
  }

  function listen() {
    if (!SR) return;
    if (listening) { rec.current?.stop(); return; }
    const r = new SR();
    r.lang = "en-US"; r.interimResults = false;
    r.onresult = (e) => ask(e.results[0][0].transcript);
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    rec.current = r; setListening(true); r.start();
  }

  const quick = compact ? ["Why this route?", "Next turn?", "Danger ahead?", "I want to go back", "Science near me?"] : ["Can I go?", "Is the AI sure?", "Oxygen?", "Turn back?"];
  return (
    <div className={"assistant" + (compact ? " compact" : "")}>
      {!compact && <h3>🤖 Assistant</h3>}
      <div className="chat">
        {log.length === 0 && !compact && <p className="muted">Ask about this mission. Answers come only from the data on screen.</p>}
        {log.map((m, k) => (
          <div key={k}><p className="q">🧑‍🚀 {m.q}</p><p className="a">🤖 {m.a}</p></div>
        ))}
      </div>
      {pending ? (
        <div className="quick confirm"><button className="yes" onClick={() => ask("yes")}>✅ Yes</button><button onClick={() => ask("no")}>✖ No</button></div>
      ) : <div className="quick">{quick.map((q) => <button key={q} onClick={() => ask(q)}>{q}</button>)}</div>}
      <form className="askrow" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a question…" aria-label="Question for the assistant" />
        {SR && <button type="button" className={listening ? "on" : ""} onClick={listen}>{listening ? "● Listening" : "🎙 Talk"}</button>}
        <button type="submit">Ask</button>
      </form>
      {!SR && !compact && <small className="muted">Voice input needs Chrome (Brave blocks it). Typing works everywhere.</small>}
    </div>
  );
}
