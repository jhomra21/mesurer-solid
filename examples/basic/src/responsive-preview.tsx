import { render } from "@solidjs/web";
import { mountMesurer } from "../../../packages/mesurer/src/index";
import { context, edit, layoutGuides, recording, screenshot } from "../../../packages/mesurer/src/plugins";

function Fixture() {
  return (
    <main style={{ padding: "32px", "font-family": "system-ui, sans-serif" }}>
      <h1>Responsive preview fixture</h1>
      <button id="root-only-target" type="button">Root-only target</button>
      <p data-testid="breakpoint-label">Desktop layout</p>
      <input aria-label="Shortcut input" />
      <button type="button" data-testid="edit-target">Editable target</button>
      <button type="button" id="inspection-target" data-testid="inspection-target">Responsive inspection target</button>
      <iframe
        data-testid="nested-preview-frame"
        title="Nested preview target"
        srcdoc="<button data-testid='nested-inspection-target' style='margin:48px;width:170px;height:72px'>Nested target</button>"
      />
      <style>{`
        body { margin: 0 }
        #root-only-target { position: fixed; left: 16px; top: 260px; width: 116px; height: 48px; z-index: 2; }
        [data-testid="breakpoint-label"] { color: rgb(200, 30, 30); }
        @media (max-width: 500px) {
          [data-testid="breakpoint-label"] { color: rgb(20, 150, 50); }
          [data-testid="breakpoint-label"] { font-size: 0; }
          [data-testid="breakpoint-label"]::after { content: "Mobile layout"; font-size: 16px; }
        }
        @media (width >= 40rem) and (width < 64rem) {
          [data-testid="breakpoint-label"] { outline: 1px solid transparent; }
        }
        @media (min-width: 80em) {
          [data-testid="breakpoint-label"] { text-decoration-thickness: 1px; }
        }
        @media (max-width: 200px) {
          [data-testid="breakpoint-label"] { letter-spacing: 1px; }
        }
      `}</style>
      <style>{`@import url("/responsive-imported.css");`}</style>
    </main>
  );
}

const root = document.querySelector<HTMLElement>("#root")!;

render(() => <Fixture />, root);

const mounted = mountMesurer({ target: root, persistKey: "responsive-preview-contract", agent: true, plugins: [context(), edit(), layoutGuides(), recording(), screenshot()] });

// SAFETY: This fixture intentionally exposes the mounted handle to its same-origin browser contract.
(window as Window & { __responsiveMount?: typeof mounted }).__responsiveMount = mounted;

// SAFETY: The acceptance contract calls this function only inside the fixture's own same-origin frame.
(window as Window & { __mountMesurerForContract?: typeof mountMesurer }).__mountMesurerForContract = mountMesurer;
