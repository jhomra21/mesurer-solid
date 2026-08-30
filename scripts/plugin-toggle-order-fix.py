from pathlib import Path

path = Path("visual-parity/plugin-settings-contract.mjs")
source = path.read_text()
old = '''  if (JSON.stringify(resetAvailability?.enabled) !== JSON.stringify(expectedAvailability)) {
    throw new Error(`Use defaults persisted the wrong plugin availability: ${JSON.stringify(resetAvailability)}`);
  }'''
new = '''  const actualAvailability = resetAvailability?.enabled ?? {};
  const expectedEntries = Object.entries(expectedAvailability).sort(([left], [right]) => left.localeCompare(right));
  const actualEntries = Object.entries(actualAvailability).sort(([left], [right]) => left.localeCompare(right));
  if (JSON.stringify(actualEntries) !== JSON.stringify(expectedEntries)) {
    throw new Error(`Use defaults persisted the wrong plugin availability: ${JSON.stringify(resetAvailability)}`);
  }'''
if source.count(old) != 1:
    raise RuntimeError("Expected order-sensitive availability assertion not found exactly once")
path.write_text(source.replace(old, new, 1))
print("Made plugin availability assertion order independent.")
