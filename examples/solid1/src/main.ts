import { createEffect, createSignal } from "solid-js";
import { render } from "solid-js/web";
import { mountMeasurer } from "@jhomra21/mesurer";

const root = document.getElementById("root");
if (!root) throw new Error("Missing Solid 1 root");

render(() => {
  const button = document.createElement("button");
  const [count, setCount] = createSignal(0);
  createEffect(() => { button.textContent = `Solid 1 host · count ${count()}`; });
  button.addEventListener("click", () => setCount((value) => value + 1));
  button.style.margin = "80px";
  button.style.padding = "16px 24px";
  return button;
}, root);

const mesurer = mountMeasurer({ persistKey: "mesurer-solid1-example" });
Object.assign(window, { __MESURER_SOLID1__: mesurer });
