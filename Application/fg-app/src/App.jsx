import Tablet from "./components/Tablet.jsx";
import Helmet from "./components/Helmet.jsx";

// One app, two views: the tablet (plan + scout + pairing) and the helmet (?view=helmet)
export default function App() {
  const view = new URLSearchParams(location.search).get("view");
  return view === "helmet" ? <Helmet /> : <Tablet />;
}
