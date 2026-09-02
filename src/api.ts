import type { AppState, PendingOperation, Sale } from "./types";

const API_BASE_KEY = "hal_api_base_url";
const API_KEY_KEY = "hal_api_key";
const CACHE_KEY = "hal_state_v8_clean";
const QUEUE_KEY = "hal_queue_v8_clean";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function getApiConfig() {
  return {
    baseUrl: (localStorage.getItem(API_BASE_KEY) || import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, ""),
    apiKey: localStorage.getItem(API_KEY_KEY) || ""
  };
}

export function saveApiConfig(baseUrl: string, apiKey: string) {
  localStorage.setItem(API_BASE_KEY, baseUrl.trim().replace(/\/$/, ""));
  localStorage.setItem(API_KEY_KEY, apiKey.trim());
}

function urlFor(path: string) {
  const { baseUrl } = getApiConfig();
  if (!baseUrl) throw new ApiError("Cloudflare sunucu adresi henüz tanımlı değil.", 0);
  return `${baseUrl}${path}`;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { apiKey } = getApiConfig();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (apiKey) headers.set("X-Hal-Key", apiKey);

  const response = await fetch(urlFor(path), { ...init, headers });
  const body = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new ApiError(body.error || `Sunucu hatası (${response.status})`, response.status);
  return body as T;
}

export const api = {
  state: () => apiFetch<AppState>("/api/state"),
  upsertSale: (sale: Sale) => apiFetch<{ sale: Sale }>(`/api/sales/${encodeURIComponent(sale.id)}`, { method: "PUT", body: JSON.stringify(sale) }),
  deleteSale: (id: string) => apiFetch<{ success: true }>(`/api/sales/${encodeURIComponent(id)}`, { method: "DELETE" }),
  payment: (paymentId: string, amount: number, date: string) => apiFetch<{ success: true; duplicate?: boolean }>("/api/payments", { method: "POST", body: JSON.stringify({ paymentId, amount, date }) }),
  settings: (commissionRate: number) => apiFetch<{ success: true }>("/api/settings", { method: "PATCH", body: JSON.stringify({ commissionRate }) })
};

export function readCachedState(): AppState | null {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null") as AppState | null; } catch { return null; }
}

export function writeCachedState(state: AppState) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(state));
}

export function readQueue(): PendingOperation[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]") as PendingOperation[]; } catch { return []; }
}

export function writeQueue(queue: PendingOperation[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function flushQueue(queue: PendingOperation[]): Promise<PendingOperation[]> {
  const remaining = [...queue];
  while (remaining.length) {
    const op = remaining[0];
    if (op.type === "upsert-sale") await api.upsertSale(op.payload);
    if (op.type === "delete-sale") await api.deleteSale(op.payload.id);
    if (op.type === "payment") await api.payment(op.payload.paymentId, op.payload.amount, op.payload.date);
    if (op.type === "settings") await api.settings(op.payload.commissionRate);
    remaining.shift();
    writeQueue(remaining);
  }
  return remaining;
}
