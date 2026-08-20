import { createEffect, createSignal } from "solid-js";
import { render } from "solid-js/web";
import { mountMeasurer } from "@jhomra21/mesurer";

const root = document.getElementById("root");
if (!root) throw new Error("Missing Solid 1 root");

render(() => {
  const wrapper = document.createElement("div");
  wrapper.dataset.testid = "solid1-card";
  wrapper.style.display = "flex";
  wrapper.style.gap = "12px";
  wrapper.style.margin = "80px";
  wrapper.style.padding = "20px";

  const button = document.createElement("button");
  button.dataset.testid = "solid1-counter";
  const [count, setCount] = createSignal(0);
  createEffect(() => { button.textContent = `Solid 1 host · count ${count()}`; });
  button.addEventListener("click", () => setCount((value) => value + 1));
  button.style.padding = "16px 24px";

  const sibling = document.createElement("div");
  sibling.dataset.testid = "solid1-sibling";
  sibling.textContent = "Measured sibling";
  sibling.style.width = "140px";
  sibling.style.padding = "16px";

  wrapper.append(button, sibling);
  return wrapper;
}, root);

const mesurer = mountMeasurer({
  persistKey: "mesurer-solid1-example",
  agent: true,
});
Object.assign(window, { __MESURER_SOLID1__: mesurer });
