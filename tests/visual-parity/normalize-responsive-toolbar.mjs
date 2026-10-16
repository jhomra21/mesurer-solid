export const normalizeResponsiveToolbar = async (page, implementation, caseName) => {
  if (implementation !== "solid") return;

  const wrappers = page.locator("div[data-mesurer-builtin='responsive']");
  const count = await wrappers.count();

  if (count !== 1) {
    throw new Error(`Expected exactly one Responsive toolbar button in ${caseName}, got ${count}`);
  }

  const contract = await wrappers.locator("button").evaluate((button) => ({
    label: button.getAttribute("aria-label"),
    pressed: button.getAttribute("aria-pressed"),
    hasSvg: Boolean(button.querySelector("svg")),
  }));

  if (
    contract.label !== "Responsive (B)"
    || contract.pressed !== "false"
    || !contract.hasSvg
  ) throw new Error(`Unexpected Responsive toolbar contract in ${caseName}: ${JSON.stringify(contract)}`);

  await wrappers.evaluate((element) => {
    const divider = element.nextElementSibling;
    element.remove();

    if (divider?.hasAttribute("data-mesurer-toolbar-divider")) divider.remove();
  });
};
