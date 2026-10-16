const normalizedDocuments = new WeakMap();

export const normalizeResponsiveToolbar = async (page, implementation, caseName) => {
  if (implementation !== "solid") return;

  const wrappers = page.locator("div[data-mesurer-builtin='responsive']");
  const count = await wrappers.count();
  const documentToken = await page.evaluate(() => performance.timeOrigin);

  // Cases normalize again after running; a document already normalized has no button left.
  if (count === 0 && normalizedDocuments.get(page) === documentToken) return;

  if (count !== 1) {
    throw new Error(`Expected exactly one Responsive toolbar button in ${caseName}, got ${count}`);
  }

  const contract = await wrappers.evaluate((element) => {
    const button = element.querySelector("button");

    return {
      label: button?.getAttribute("aria-label"),
      pressed: button?.getAttribute("aria-pressed"),
      hasSvg: Boolean(button?.querySelector("svg")),
      soleChildOfItem: element.parentElement?.childElementCount === 1,
    };
  });

  if (
    contract.label !== "Responsive (B)"
    || contract.pressed !== "false"
    || !contract.hasSvg
    || !contract.soleChildOfItem
  ) throw new Error(`Unexpected Responsive toolbar contract in ${caseName}: ${JSON.stringify(contract)}`);

  // Remove the padded toolbar item wrapper too; leaving it behind shifts later controls by its padding.
  await wrappers.evaluate((element) => {
    const item = element.parentElement;
    const divider = item.nextElementSibling;
    item.remove();

    if (divider?.hasAttribute("data-mesurer-toolbar-divider")) divider.remove();
  });
  normalizedDocuments.set(page, documentToken);
};
