import { render } from "@solidjs/web";
import { Mesurer } from "@jhomra21/mesurer-solid-renderer";

function Fixture() {
  return <Mesurer />;
}

render(() => <Fixture />, document.getElementById("root")!);
