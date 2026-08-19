import { render } from "@solidjs/web";
import { Measurer } from "@jhomra21/mesurer-solid";
import "@jhomra21/mesurer-solid/styles.css";
import "./playground.css";

function App() {
  return (
    <main class="page-shell">
      <header class="hero">
        <p class="eyebrow">Solid 2 playground</p>
        <h1>Measure this page.</h1>
        <p>
          Move the pointer to preview an element, then click it to pin the measurement.
          Press <kbd>M</kbd> to toggle and <kbd>S</kbd> for Select mode.
        </p>
      </header>

      <section class="demo-grid">
        <article class="card card--large">
          <span>01</span>
          <h2>Element bounds</h2>
          <p>The first vertical slice tracks DOM bounds and renders them in a Solid 2 portal.</p>
        </article>
        <article class="card">
          <span>02</span>
          <h2>Solid model</h2>
          <p>State uses a Solid 2 draft-first store instead of React-shaped hooks.</p>
        </article>
        <article class="card">
          <span>03</span>
          <h2>Next</h2>
          <p>Snapping, guides, rulers, history, distance overlays, text inspection and persistence.</p>
        </article>
      </section>

      <Measurer />
    </main>
  );
}

render(() => <App />, document.getElementById("root")!);
