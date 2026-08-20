import { render } from "@solidjs/web";
import { Measurer } from "../src/index";

const existing = document.querySelector<HTMLElement>("[data-mesurer-hope-ui-showcase]");
if (!existing) {
  const host = document.createElement("div");
  host.dataset.mesurerHopeUiShowcase = "true";
  document.body.append(host);

  render(
    () => (
      <Measurer
        persistOnReload={false}
        persistKey="mesurer-hope-ui-showcase"
      />
    ),
    host,
  );
}
