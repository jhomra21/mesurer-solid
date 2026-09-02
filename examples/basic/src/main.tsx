import { render } from "@solidjs/web";
import { Mesurer, arrangePlugin } from "@jhomra21/mesurer-solid-renderer";
import "./playground.css";

function App() {
  return (
    <main class="page-shell">
      <header class="hero">
        <p class="eyebrow">Mesurer renderer · parity playground</p>
        <h1>Inspect the page without leaving it.</h1>
        <p>
          This page intentionally mixes spacing, nested elements, typography and color so every
          Mesurer mode has something to inspect. Use the floating toolbar or the shortcuts below.
        </p>
        <div class="shortcut-row">
          <kbd>M</kbd><span>toggle</span><kbd>S</kbd><span>select</span><kbd>A</kbd><span>text</span>
          <kbd>G</kbd><span>guides</span><kbd>H/V</kbd><span>guide axis</span><kbd>R</kbd><span>rulers</span>
          <kbd>X</kbd><span>x-ray</span><kbd>P</kbd><span>color*</span><kbd>Shift+A</kbd><span>arrange</span>
          <kbd>Alt</kbd><span>distance</span>
        </div>
        <p><small>* Color Picker appears only when the host can use the native screen sampler.</small></p>
      </header>

      <section class="demo-grid">
        <article class="card card--large feature-card">
          <span class="index">01</span>
          <div class="feature-copy">
            <p class="kicker">Selection target</p>
            <h2>Drag across several cards, or Shift-click individual elements.</h2>
            <p>Select one or more elements, then use Arrange or <kbd>Shift+A</kbd> to drag them into the layout you want.</p>
          </div>
          <button class="primary-action" type="button">A real button target</button>
        </article>

        <article class="card warm-card">
          <span class="index">02</span>
          <h2>Guides + rulers</h2>
          <p>Create red guides with <kbd>G</kbd>, choose their axis with <kbd>H</kbd>/<kbd>V</kbd>, or turn on rulers with <kbd>R</kbd> and drag from an edge.</p>
          <div class="alignment-demo"><i /><i /><i /></div>
        </article>

        <article class="card type-card">
          <span class="index">03</span>
          <p class="kicker">Typography</p>
          <h2>Text Inspector sees computed type.</h2>
          <p class="tracked-text">This line uses custom tracking and a different line height.</p>
        </article>

        <article class="card color-card">
          <span class="index">04</span>
          <h2>Color + distance</h2>
          <div class="swatches"><b /><b /><b /><b /></div>
          <p>Select this card, hold <kbd>Alt</kbd>, then hover another card to inspect spacing.</p>
        </article>

        <article class="card nested-card">
          <span class="index">05</span>
          <h2>X-ray structure</h2>
          <div class="nested"><div><div><span>Nested DOM</span></div></div></div>
          <p>Press <kbd>X</kbd> to expose the element structure across the page.</p>
        </article>
      </section>

      <footer class="page-footer">
        <strong>Keyboard checks</strong>
        <p>Delete removes selected guides. Escape clears measurements/guides. Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z undo/redo. Cmd/Ctrl+, opens settings.</p>
      </footer>

      <Mesurer persistKey="mesurer-parity-playground" plugins={[arrangePlugin()]} />
    </main>
  );
}

render(() => <App />, document.getElementById("root")!);