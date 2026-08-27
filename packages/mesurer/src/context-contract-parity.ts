import type {
  MesurerAnnotation as CoreMesurerAnnotation,
  MesurerAnnotationBaseline as CoreMesurerAnnotationBaseline,
  MesurerAnnotationTarget as CoreMesurerAnnotationTarget,
  MesurerContextRequest as CoreMesurerContextRequest,
  MesurerElementFingerprint as CoreMesurerElementFingerprint,
} from "@jhomra21/mesurer-solid-core";
import type {
  MesurerAnnotation,
  MesurerAnnotationBaseline,
  MesurerAnnotationTarget,
  MesurerContextRequest,
  MesurerElementFingerprint,
} from "./context";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? (<Value>() => Value extends Right ? 1 : 2) extends
      (<Value>() => Value extends Left ? 1 : 2)
      ? true
      : false
    : false;

type Assert<Condition extends true> = Condition;

/**
 * The public package intentionally repeats these JSON-safe shapes so its emitted
 * declarations remain self-contained. These assertions make that serialization
 * boundary exact at compile time while the renderer uses the canonical core model.
 */
type _RequestParity = Assert<Equal<MesurerContextRequest, CoreMesurerContextRequest>>;
type _FingerprintParity = Assert<Equal<MesurerElementFingerprint, CoreMesurerElementFingerprint>>;
type _TargetParity = Assert<Equal<MesurerAnnotationTarget, CoreMesurerAnnotationTarget>>;
type _BaselineParity = Assert<Equal<MesurerAnnotationBaseline, CoreMesurerAnnotationBaseline>>;
type _AnnotationParity = Assert<Equal<MesurerAnnotation, CoreMesurerAnnotation>>;
