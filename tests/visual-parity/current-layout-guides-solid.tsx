import { render } from "@solidjs/web";
import {
  Mesurer,
  layoutGuidesPlugin,
} from "@jhomra21/mesurer-solid-renderer";

function Fixture() {
  return <Mesurer plugins={[layoutGuidesPlugin()]} />;
}

render(() => <Fixture />, document.getElementById("root")!);
