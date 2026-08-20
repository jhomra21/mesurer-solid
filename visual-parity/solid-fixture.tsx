import { render } from "@solidjs/web";
import { Measurer } from "@jhomra21/mesurer-solid-renderer";

function Fixture() {
  return (
    <>
      <button
        data-testid="primary-target"
        type="button"
        style={{ position: "absolute", left: "240px", top: "240px", width: "200px", height: "100px" }}
      >
        Underlying app button
      </button>
      <button
        data-testid="secondary-target"
        type="button"
        style={{ position: "absolute", left: "240px", top: "520px", width: "200px", height: "100px", "font-size": "18px" }}
      >
        Secondary app button
      </button>
      <div
        data-testid="color-target"
        style={{ position: "absolute", left: "560px", top: "260px", width: "140px", height: "80px", background: "rgb(37, 99, 235)" }}
      />
      <Measurer persistKey="mesurer-visual-parity" />
    </>
  );
}

render(() => <Fixture />, document.getElementById("root")!);
