const TOKEN_KEY = "ewt-token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

async function request(path, { method = "POST", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "请求失败，请稍后再试");
    err.status = res.status;
    throw err;
  }
  return data;
}

export const post = (path, body) => request(path, { body });
export const get = (path) => request(path, { method: "GET" });

export const fetchHealth = () =>
  fetch("/api/health")
    .then((r) => r.json())
    .catch(() => ({ ok: false }));

export const fetchMaterials = (payload) => post("/api/materials", payload);
export const fetchFeedback = (payload) => post("/api/feedback", payload);
