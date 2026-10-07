import { OBSERVED_MOTION_PROPERTIES } from "./motion";

export const cssVariables = (value: string) =>
  [...value.matchAll(/var\(\s*(--[\w-]+)/g)].map(([, name]) => name);

type MotionDependencyRule = {
  selector?: string;
  animation?: string;
  properties: Map<string, string[]>;
};

const mediaTextForRule = (rule: CSSRule) => {
  if (!("media" in rule)) return "";

  // SAFETY: CSS rules exposing a media property use the CSSMediaList contract.
  const candidate = rule as CSSMediaRule | CSSImportRule;

  return candidate.media?.mediaText ?? "";
};

const importedSheetForRule = (rule: CSSRule) => {
  if (!("styleSheet" in rule)) return null;

  // SAFETY: CSSImportRule is the CSS rule shape exposing styleSheet.
  const candidate = rule as CSSImportRule;

  return candidate.styleSheet;
};

const nestedRulesForRule = (rule: CSSRule) => {
  if (!("cssRules" in rule)) return null;

  // SAFETY: rules exposing cssRules implement the CSS grouping-rule contract.
  const candidate = rule as CSSGroupingRule;

  return candidate.cssRules;
};

const styleForRule = (rule: CSSRule) => {
  if (!("style" in rule)) return null;

  // SAFETY: rules exposing style provide a CSSStyleDeclaration.
  const candidate = rule as CSSStyleRule | CSSKeyframeRule;

  return candidate.style;
};

const keyframesNameForRule = (rule: CSSRule) => {
  if (!("name" in rule)) return "";

  // SAFETY: the CSS rule shape exposing name here is a keyframes rule.
  const candidate = rule as CSSKeyframesRule;

  return candidate.name;
};

const selectorForRule = (rule: CSSRule) => {
  if (!("selectorText" in rule)) return undefined;

  // SAFETY: selectorText is provided by CSSStyleRule.
  const candidate = rule as CSSStyleRule;

  return candidate.selectorText;
};

export function createMotionDependencies(document?: Document) {
  let scopes = new WeakMap<Node, MotionDependencyRule[]>();
  let opaque = new WeakSet<Node>();

  let cache = new WeakMap<Element, {
    names: string;
    properties: Map<string, string[]>;
  }>();

  const tracked = new Map<Document | ShadowRoot, {
    sheets: CSSStyleSheet[];
    signature: string;
  }>();

  let lastRefresh = -Infinity;

  const matchesMedia = (media?: string) =>
    !media
    || !document?.defaultView?.matchMedia
    || document.defaultView.matchMedia(media).matches;

  const sheetsOf = (scope: Document | ShadowRoot) => [
    ...(scope.styleSheets ?? []),
    ...(scope.adoptedStyleSheets ?? []),
  ];

  const signatureOf = (sheets: CSSStyleSheet[]) => {
    const seen = new Set<CSSStyleSheet>();

    const visit = (sheet: CSSStyleSheet): string => {
      if (seen.has(sheet)) return "";

      seen.add(sheet);

      try {
        const rules = (
          items: CSSRuleList,
          includeText = true,
        ): string => [...items].map((rule) => {
          const imported = importedSheetForRule(rule);
          const nested = nestedRulesForRule(rule);
          const media = mediaTextForRule(rule);

          return [
            includeText ? rule.cssText : "",
            matchesMedia(media),
            imported
              ? visit(imported)
              : nested ? rules(nested, false) : "",
          ].join(":");
        }).join("\n");

        return [
          sheet.disabled,
          matchesMedia(sheet.media?.mediaText),
          rules(sheet.cssRules),
        ].join(":");
      } catch {
        return [
          sheet.disabled,
          matchesMedia(sheet.media?.mediaText),
          "opaque",
        ].join(":");
      }
    };

    return sheets.map(visit).join("\n");
  };

  const invalidate = () => {
    scopes = new WeakMap();
    opaque = new WeakSet();
    cache = new WeakMap();
  };

  const collect = (
    items: CSSRuleList,
    result: MotionDependencyRule[],
    animation?: string,
  ) => {
    for (const rule of items) {
      const media = mediaTextForRule(rule);

      if (!matchesMedia(media)) continue;

      const imported = importedSheetForRule(rule);

      if (
        imported
        && !imported.disabled
        && matchesMedia(imported.media?.mediaText)
      ) {
        collect(imported.cssRules, result);
      }

      const style = styleForRule(rule);

      if (style) {
        const properties = new Map<string, string[]>();

        for (const property of OBSERVED_MOTION_PROPERTIES) {
          const variables = cssVariables(style.getPropertyValue(property));

          if (variables.length) properties.set(property, variables);
        }

        if (properties.size) {
          result.push({
            selector: selectorForRule(rule),
            animation,
            properties,
          });
        }
      }

      const nested = nestedRulesForRule(rule);

      if (nested) {
        collect(
          nested,
          result,
          keyframesNameForRule(rule) || animation,
        );
      }
    }
  };

  return {
    invalidate,

    refresh(time: number) {
      if (time - lastRefresh < 1000) return false;

      lastRefresh = time;

      let changed = false;

      for (const [scope, before] of tracked) {
        const sheets = sheetsOf(scope);
        const signature = signatureOf(sheets);

        if (
          signature !== before.signature
          || sheets.length !== before.sheets.length
          || sheets.some((sheet, index) => sheet !== before.sheets[index])
        ) {
          tracked.set(scope, { sheets, signature });
          changed = true;
        }
      }

      if (changed) invalidate();

      return changed;
    },

    hasOpaqueStyles(element: Element) {
      const scope = element.getRootNode();

      return opaque.has(scope);
    },

    forElement(element: Element, names: string) {
      const root = element.getRootNode();

      // SAFETY: an Element root is always its Document or a ShadowRoot.
      const scope = root as Document | ShadowRoot;

      let rules = scopes.get(scope);

      if (!rules) {
        rules = [];

        const sheets = sheetsOf(scope);

        if (!tracked.has(scope)) {
          tracked.set(scope, {
            sheets,
            signature: signatureOf(sheets),
          });
        }

        for (const sheet of sheets) {
          if (sheet.disabled || !matchesMedia(sheet.media?.mediaText)) continue;

          try {
            collect(sheet.cssRules, rules);
          } catch {
            opaque.add(scope);
          }
        }

        scopes.set(scope, rules);
      }

      const cached = cache.get(element);

      if (cached?.names === names) return cached.properties;

      const properties = new Map<string, string[]>();

      for (const rule of rules) {
        let matches = Boolean(
          rule.animation
          && names.split(",").some((name) => name.trim() === rule.animation),
        );

        if (rule.selector) {
          try {
            matches = element.matches(
              rule.selector.replace(/::(?:before|after)\b/g, ""),
            );
          } catch {
            continue;
          }
        }

        if (!matches) continue;

        for (const [property, variables] of rule.properties) {
          properties.set(
            property,
            [...(properties.get(property) ?? []), ...variables],
          );
        }
      }

      cache.set(element, { names, properties });

      return properties;
    },
  };
}
