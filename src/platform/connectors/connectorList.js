export async function fetchConnectorList(api, fallback) {
  if (!api?.listConnectors) return fallback;
  const list = await api.listConnectors();
  if (Array.isArray(list) && list.length) return list;
  return fallback;
}
