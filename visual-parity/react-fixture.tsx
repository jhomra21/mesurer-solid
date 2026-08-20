import { createRoot } from "react-dom/client";
import { Measurer } from "mesurer";

function Fixture() {
  return (
    <>
      <button
        data-testid="primary-target"
        type="button"
        style={{ position: "absolute", left: 240, top: 240, width: 200, height: 100 }}
      >
        Underlying app button
      </button>
      <button
        data-testid="secondary-target"
        type="button"
        style={{ position: "absolute", left: 240, top: 520, width: 200, height: 100, fontSize: 18 }}
      >
        Secondary app button
      </button>
      <div
        data-testid="color-target"
        style={{ position: "absolute", left: 560, top: 260, width: 140, height: 80, background: "rgb(37, 99, 235)" }}
      />
      <Measurer persistKey="mesurer-react-visual-parity" />
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
