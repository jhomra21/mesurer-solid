// Adapted from ibelick/mesurer (MIT). See THIRD_PARTY_LICENSES.md.
export const formatValue = (value: number) => Math.round(value);

export const createId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
