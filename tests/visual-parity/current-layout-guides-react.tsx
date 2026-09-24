import { createRoot } from "react-dom/client";
import { Mesurer } from "mesurer";

function Fixture() {
  return <Mesurer />;
}

createRoot(document.getElementById("root")!).render(<Fixture />);
