// Adapted from ibelick/mesurer (MIT). See THIRD_PARTY_LICENSES.md.
const FONT_WEIGHT_KEYWORD = new Map<string, string>([
  ["100", "thin"],
  ["200", "extralight"],
  ["300", "light"],
  ["400", "normal"],
  ["500", "medium"],
  ["600", "semibold"],
  ["700", "bold"],
  ["800", "extrabold"],
  ["900", "black"],
]);
const TYPO_PROPS = ["font-family", "font-size", "font-weight", "line-height", "letter-spacing"] as const;
type TypoProp = (typeof TYPO_PROPS)[number];
const TYPO_LABELS = new Map<string, TypoProp>([
  ["Family", "font-family"],
  ["Size", "font-size"],
  ["Weight", "font-weight"],
  ["Line", "line-height"],
  ["Tracking", "letter-spacing"],
]);
export type TypographyRow = { label: string; value: string; varName: string | null };
export type TypographyInfo = { rows: TypographyRow[]; tagName: string; textSnippet: string };
type FlatRule = { rule: CSSStyleRule; mediaOk: boolean; order: number };
type Candidate = { name: string; specificity: number; order: number; important: boolean };

const formatPx = (raw: string) => {
  if (!raw || raw === "normal") return raw || "normal";
  const match = /^(-?[\d.]+)px$/.exec(raw);
  return match ? `${Math.round(Number(match[1]) * 10) / 10}px` : raw;
};
const firstFontFamily = (families: string) => (families.split(",")[0] ?? "").trim().replace(/^['"]|['"]$/g, "");
const weightWithKeyword = (weight: string) => {
  const keyword = FONT_WEIGHT_KEYWORD.get(weight);
  return keyword ? `${weight} / ${keyword}` : weight;
};
const extractVarName = (value: string | null | undefined) => value ? /var\(\s*(--[a-zA-Z0-9_-]+)/.exec(value)?.[1] ?? null : null;
const selectorSpecificity = (selector: string) =>
  (selector.match(/#[\w-]+/g) ?? []).length * 10000
  + (selector.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g) ?? []).length * 100
  + (selector.match(/(?:^|[ >+~])([a-zA-Z][\w-]*)/g) ?? []).length;
const wins = (next: Candidate, previous: Candidate | undefined) =>
  !previous || (next.important !== previous.important
    ? next.important
    : next.specificity !== previous.specificity
      ? next.specificity > previous.specificity
      : next.order > previous.order);

export class TypographyInspector {
  constructor(private readonly document: Document, private readonly window: Window) {}

  private collectRules(rules: CSSRuleList, output: FlatRule[], mediaOk: boolean, order: { value: number }) {
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      const currentOrder = order.value++;
      if (rule.type === 4) {
        // SAFETY: CSSRule.type 4 is CSSMediaRule by the CSSOM contract.
        const mediaRule = rule as CSSMediaRule;
        let matches = mediaOk;
        try {
          matches = mediaOk && this.window.matchMedia(mediaRule.media.mediaText).matches;
        } catch {
          matches = false;
        }
        this.collectRules(mediaRule.cssRules, output, matches, order);
      } else if (rule.type === 12) {
        // SAFETY: CSSRule.type 12 is CSSSupportsRule by the CSSOM contract.
        const supportsRule = rule as CSSSupportsRule;
        this.collectRules(supportsRule.cssRules, output, mediaOk, order);
      } else if (rule.type === 1) {
        // SAFETY: CSSRule.type 1 is CSSStyleRule by the CSSOM contract.
        const styleRule = rule as CSSStyleRule;
        output.push({ rule: styleRule, mediaOk, order: currentOrder });
      }
    }
  }

  private getRules() {
    const rules: FlatRule[] = [];
    const order = { value: 0 };
    for (const sheet of Array.from(this.document.styleSheets)) {
      try {
        this.collectRules(sheet.cssRules, rules, true, order);
      } catch {
        continue;
      }
    }
    return rules;
  }

  private findVarReferences(el: HTMLElement) {
    const result = new Map<TypoProp, string | null>(TYPO_PROPS.map((prop) => [prop, null]));
    const rules = this.getRules();
    for (const prop of TYPO_PROPS) {
      let node: HTMLElement | null = el;
      while (node && result.get(prop) === null) {
        let winner: Candidate | undefined;
        const inlineName = extractVarName(node.style.getPropertyValue(prop));
        if (inlineName) {
          winner = {
            name: inlineName,
            specificity: Number.MAX_SAFE_INTEGER,
            order: Number.MAX_SAFE_INTEGER,
            important: node.style.getPropertyPriority(prop) === "important",
          };
        }
        for (const { rule, mediaOk, order } of rules) {
          if (!mediaOk) continue;
          let matches = false;
          try {
            matches = node.matches(rule.selectorText);
          } catch {
            continue;
          }
          if (!matches) continue;
          const name = extractVarName(rule.style.getPropertyValue(prop));
          if (!name) continue;
          const candidate = {
            name,
            specificity: selectorSpecificity(rule.selectorText),
            order,
            important: rule.style.getPropertyPriority(prop) === "important",
          };
          if (wins(candidate, winner)) winner = candidate;
        }
        if (winner) result.set(prop, winner.name);
        node = node.parentElement;
      }
    }
    return result;
  }

  getFast(el: HTMLElement): TypographyInfo {
    const styles = this.window.getComputedStyle(el);
    const rows: TypographyRow[] = [
      { label: "Family", value: firstFontFamily(styles.fontFamily), varName: null },
      { label: "Size", value: formatPx(styles.fontSize), varName: null },
      { label: "Weight", value: weightWithKeyword(styles.fontWeight), varName: null },
      { label: "Line", value: styles.lineHeight === "normal" ? "normal" : formatPx(styles.lineHeight), varName: null },
      { label: "Tracking", value: styles.letterSpacing === "normal" ? "normal" : formatPx(styles.letterSpacing), varName: null },
    ];
    const directText = Array.from(el.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.nodeValue?.trim() ?? "")
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ");
    return {
      rows,
      tagName: el.tagName.toLowerCase(),
      textSnippet: directText.length > 40 ? `${directText.slice(0, 40)}…` : directText,
    };
  }

  getFull(el: HTMLElement, base = this.getFast(el)): TypographyInfo {
    const vars = this.findVarReferences(el);
    return {
      ...base,
      rows: base.rows.map((row) => {
        const prop = TYPO_LABELS.get(row.label);
        return { ...row, varName: prop ? vars.get(prop) ?? null : null };
      }),
    };
  }
}
