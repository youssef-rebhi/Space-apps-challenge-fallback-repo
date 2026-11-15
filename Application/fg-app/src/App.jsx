import Tablet from "./components/Tablet.jsx";
import Helmet from "./components/Helmet.jsx";
import Control from "./components/Control.jsx";

// One app, two views: the tablet (plan + scout + pairing) and the helmet (?view=helmet)
import { useEffect, useState } from "react";

// short pairing link ?h=CODE → fetch the route stored by server.py → open the helmet
function Pair({ code }) {
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch("api/pair?c=" + code).then((r) => (r.ok ? r.json() : Promise.reject())).then((e) => {
      const u = new URL(location.href.split("?")[0]);
      u.searchParams.set("view", "helmet"); u.searchParams.set("stops", e.stops); u.searchParams.set("eva", e.eva || 240);
      location.replace(u.href);
    }).catch(() => setErr(`Code ${code} not found. Is server.py running, and was the route made on the tablet after it started?`));
  }, []);
  return <div style={{ padding: 24, color: "#eee", font: "16px system-ui" }}>{err || `Pairing helmet with code ${code}…`}</div>;
}

export default function App() {
  const qs = new URLSearchParams(location.search), h = qs.get("h");
  if (h) return <Pair code={h.toUpperCase()} />;
  const view = qs.get("view");
  return view === "helmet" ? <Helmet /> : view === "control" ? <Control /> : <Tablet />;
}
