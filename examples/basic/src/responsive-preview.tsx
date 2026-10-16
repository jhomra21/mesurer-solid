import { render } from "@solidjs/web";
import { mountMesurer } from "../../../packages/mesurer/src/index";
import { edit, recording, screenshot } from "../../../packages/mesurer/src/plugins";

function Fixture() {
  return (
    <main style={{ padding: "32px", "font-family": "system-ui, sans-serif" }}>
      <h1>Responsive preview fixture</h1>
      <p data-testid="breakpoint-label">Desktop layout</p>
      <input aria-label="Shortcut input" />
      <button type="button" data-testid="edit-target">Editable target</button>
      <style>{`
        body { margin: 0 }
        [data-testid="breakpoint-label"] { color: rgb(200, 30, 30); }
        @media (max-width: 500px) {
          [data-testid="breakpoint-label"] { color: rgb(20, 150, 50); }
          [data-testid="breakpoint-label"] { font-size: 0; }
          [data-testid="breakpoint-label"]::after { content: "Mobile layout"; font-size: 16px; }
        }
      `}</style>
    </main>
  );
}

const root = document.querySelector<HTMLElement>("#root")!;

render(() => <Fixture />, root);

const mounted = mountMesurer({ target: root, persistKey: "responsive-preview-contract", plugins: [edit(), recording(), screenshot()] });

// SAFETY: This fixture intentionally exposes the mounted handle to its same-origin browser contract.
(window as Window & { __responsiveMount?: typeof mounted }).__responsiveMount = mounted;

// SAFETY: The acceptance contract calls this function only inside the fixture's own same-origin frame.
(window as Window & { __mountMesurerForContract?: typeof mountMesurer }).__mountMesurerForContract = mountMesurer;
