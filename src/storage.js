export async function loadData(key, fallback) {
  try {
    const r = localStorage.getItem(key);
    return r ? JSON.parse(r) : fallback;
  } catch { return fallback; }
}

export async function saveData(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}