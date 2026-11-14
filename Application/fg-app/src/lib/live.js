// Live link tablet → helmet for scout reports.
// Same browser (two tabs): BroadcastChannel, instant, no server.
// Two devices (tablet + phone helmet): run server.py instead of "python3 -m http.server";
// it adds a tiny /api/events relay. With the plain server, only the same-browser link works.
const bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("firmground") : null;

export function publish(ev) {
  const e = { ...ev, uid: Math.random().toString(36).slice(2), t: Date.now() };
  bc?.postMessage(e);
  fetch("api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(e) }).catch(() => {});
}

export function subscribe(cb) {
  const seen = new Set();
  const handle = (e) => { if (!e || seen.has(e.uid)) return; seen.add(e.uid); cb(e); };
  if (bc) bc.onmessage = (m) => handle(m.data);
  let since = 0, stop = false, timer;
  const poll = async () => {
    try {
      const r = await fetch("api/events?since=" + since);
      if (r.ok && (r.headers.get("content-type") || "").includes("json")) {
        const j = await r.json();
        j.events.forEach((e) => { since = Math.max(since, e.id); handle(e); });
      }
    } catch {}
    if (!stop) timer = setTimeout(poll, 1500);
  };
  poll();
  return () => { stop = true; clearTimeout(timer); if (bc) bc.onmessage = null; };
}

// compass bearing a → b in degrees (0 = north, 90 = east)
export function bearing(a, b) {
  const r = Math.PI / 180, y = Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r);
  return ((Math.atan2(y, x) / r) + 360) % 360;
}
