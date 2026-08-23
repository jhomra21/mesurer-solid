import { reviewMesurerAnnotation } from "../src/context.ts";

const region = { left: 0, top: 0, width: 100, height: 100 };
const baseline = {
  targets: [],
  guides: [{ id: "guide-1", orientation: "vertical", position: 50 }],
  measurements: [{ id: "measurement-1", rect: { left: 10, top: 10, width: 40, height: 20 }, deltaX: 40, deltaY: 20 }],
  distances: [{
    id: "distance-1",
    rectA: { left: 10, top: 10, width: 10, height: 10 },
    rectB: { left: 10, top: 40, width: 10, height: 10 },
    horizontal: null,
    vertical: { y1: 20, y2: 40, x: 15, value: 20 },
  }],
};
const annotation = {
  id: "annotation-1",
  note: "Keep review evidence identity stable",
  createdAt: 0,
  anchor: { kind: "region", rect: region },
  baseline,
};

let snapshot = {
  rulersVisible: false,
  xrayVisible: false,
  guideRelevanceTolerance: 10,
  guides: [{ id: "guide-1", orientation: "vertical", position: 300 }],
  measurements: [{ id: "measurement-1", rect: { left: 300, top: 300, width: 50, height: 20 }, deltaX: 50, deltaY: 20 }],
  activeMeasurement: null,
  heldDistances: [{
    id: "distance-1",
    rectA: { left: 300, top: 300, width: 10, height: 10 },
    rectB: { left: 300, top: 334, width: 10, height: 10 },
    horizontal: null,
    vertical: { y1: 310, y2: 334, x: 305, value: 24 },
  }],
};

const runtime = {
  snapshot: () => snapshot,
  currentSelection: () => ({ elements: [], region: null }),
  annotations: () => [annotation],
  annotation: (id) => id === annotation.id ? { ...annotation, resolvedTargets: [] } : null,
  annotationRect: (id) => id === annotation.id ? region : null,
};
const ownerDocument = { URL: "https://example.test/", title: "Context review check" };
const ownerWindow = {
  location: { href: "https://example.test/" },
  innerWidth: 800,
  innerHeight: 600,
  devicePixelRatio: 1,
  scrollX: 0,
  scrollY: 0,
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const change = (review, kind, label) => review.changes.find((item) => item.kind === kind && item.label === label);

const moved = reviewMesurerAnnotation({ runtime, ownerDocument, ownerWindow, annotationId: annotation.id });
assert(moved.current.visualContext.guides.length === 0, "Moved guide should leave scoped current context.");
assert(moved.current.visualContext.measurements.length === 0, "Moved measurement should leave scoped current context.");
assert(moved.current.visualContext.distances.length === 0, "Moved distance should leave scoped current context.");
assert(!moved.changes.some((item) => item.kind === "missing"), "Live evidence outside the current scope must not be reported missing.");
assert(change(moved, "guide", "vertical guide guide-1")?.delta === 250, "Review should compare the moved guide by stable id.");
assert(change(moved, "measurement", "measurement-1 width")?.delta === 10, "Review should compare the moved measurement by stable id.");
assert(change(moved, "distance", "distance-1 vertical")?.delta === 4, "Review should compare the moved distance by stable id.");

snapshot = {
  ...snapshot,
  guides: [],
  measurements: [],
  heldDistances: [],
};
const removed = reviewMesurerAnnotation({ runtime, ownerDocument, ownerWindow, annotationId: annotation.id });
for (const [evidence, id] of [["guide", "guide-1"], ["measurement", "measurement-1"], ["distance", "distance-1"]]) {
  assert(
    removed.changes.some((item) => item.kind === "missing" && item.evidence === evidence && item.id === id),
    `Removed ${evidence} ${id} should be reported missing.`,
  );
}

console.log("Mesurer annotation review evidence semantics: PASS");
