interface Env {
  DB: D1Database;
  HAL_API_KEY: string;
}

type SaleInput = { id?: string; date?: string; kilo?: number; unitPrice?: number; commissionRate?: number; received?: number };
const jsonHeaders = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

function reply(data: unknown, status = 200, extra: HeadersInit = {}) { return new Response(JSON.stringify(data), { status, headers: { ...jsonHeaders, ...extra } }); }
function corsHeaders() { return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, X-Hal-Key", "Access-Control-Allow-Methods": "GET, PUT, POST, PATCH, DELETE, OPTIONS" }; }
function error(message: string, status = 400) { return reply({ error: message }, status, corsHeaders()); }
function n(value: unknown) { const x = Number(value); return Number.isFinite(x) ? x : 0; }
function seasonOf(date: string) { const d = new Date(`${date}T12:00:00Z`); const y = d.getUTCFullYear(); return d.getUTCMonth() + 1 >= 9 ? `${y}/${y + 1}` : `${y - 1}/${y}`; }
function validDate(x: string) { return /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(new Date(`${x}T12:00:00Z`).getTime()); }
function id() { return `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`; }

function mapSale(row: Record<string, unknown>) {
  return { id: String(row.id), date: String(row.date), season: String(row.season), kilo: n(row.kilo), unitPrice: n(row.unit_price), gross: n(row.gross), commissionRate: n(row.commission_rate), net: n(row.net), received: n(row.received), createdAt: String(row.created_at || ""), updatedAt: String(row.updated_at || "") };
}

async function authenticate(request: Request, env: Env) {
  if (!env.HAL_API_KEY) return error("HAL_API_KEY Cloudflare secret henüz tanımlanmamış.", 503);
  const provided = request.headers.get("X-Hal-Key") || "";
  if (provided !== env.HAL_API_KEY) return error("Yetkisiz erişim.", 401);
  return null;
}

async function getCommission(env: Env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key='commission_rate'").first<{ value: string }>();
  return Math.min(30, Math.max(0, n(row?.value || 8)));
}

async function getState(env: Env) {
  const [salesResult, paymentsResult, commissionRate] = await Promise.all([
    env.DB.prepare("SELECT * FROM sales WHERE deleted_at IS NULL ORDER BY date DESC, created_at DESC").all<Record<string, unknown>>(),
    env.DB.prepare("SELECT id,date,amount,created_at FROM payments ORDER BY created_at DESC LIMIT 50").all<Record<string, unknown>>(),
    getCommission(env)
  ]);
  return {
    sales: salesResult.results.map(mapSale),
    payments: paymentsResult.results.map(x => ({ id: String(x.id), date: String(x.date), amount: n(x.amount), createdAt: String(x.created_at || "") })),
    commissionRate,
    serverTime: new Date().toISOString()
  };
}

async function upsertSale(request: Request, env: Env, saleId: string) {
  const body = await request.json<SaleInput>().catch(() => ({}));
  const date = String(body.date || ""); const kilo = n(body.kilo); const unitPrice = n(body.unitPrice);
  const commissionRate = Math.min(30, Math.max(0, n(body.commissionRate ?? await getCommission(env))));
  if (!validDate(date)) return error("Geçerli bir tarih girin.");
  if (kilo <= 0 || unitPrice <= 0) return error("Kilo ve birim fiyat sıfırdan büyük olmalı.");
  const existing = await env.DB.prepare("SELECT received FROM sales WHERE id=?").bind(saleId).first<{ received: number }>();
  const received = existing ? n(existing.received) : Math.max(0, n(body.received));
  const gross = kilo * unitPrice; const net = gross * (1 - commissionRate / 100);
  if (received > net + 0.01) return error("Tahsil edilmiş tutar yeni net tutardan büyük olamaz.", 409);
  await env.DB.prepare(`INSERT INTO sales (id,date,season,kilo,unit_price,gross,commission_rate,net,received,created_at,updated_at,deleted_at)
    VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL)
    ON CONFLICT(id) DO UPDATE SET date=excluded.date,season=excluded.season,kilo=excluded.kilo,unit_price=excluded.unit_price,gross=excluded.gross,commission_rate=excluded.commission_rate,net=excluded.net,received=?,updated_at=CURRENT_TIMESTAMP,deleted_at=NULL`)
    .bind(saleId, date, seasonOf(date), kilo, unitPrice, gross, commissionRate, net, received, received).run();
  const row = await env.DB.prepare("SELECT * FROM sales WHERE id=?").bind(saleId).first<Record<string, unknown>>();
  return reply({ sale: row ? mapSale(row) : null }, 200, corsHeaders());
}

async function deleteSale(env: Env, saleId: string) {
  const found = await env.DB.prepare("SELECT id FROM sales WHERE id=? AND deleted_at IS NULL").bind(saleId).first();
  if (!found) return error("Kayıt bulunamadı.", 404);
  await env.DB.prepare("UPDATE sales SET deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(saleId).run();
  return reply({ success: true }, 200, corsHeaders());
}

async function addPayment(request: Request, env: Env) {
  const body = await request.json<{ amount?: number; date?: string }>().catch(() => ({}));
  const amount = n(body.amount); const date = String(body.date || "");
  if (amount <= 0) return error("Tahsilat sıfırdan büyük olmalı.");
  if (!validDate(date)) return error("Geçerli tahsilat tarihi girin.");
  const debtRows = await env.DB.prepare("SELECT id,net,received FROM sales WHERE deleted_at IS NULL AND net-received>0.009 ORDER BY date ASC,created_at ASC").all<{ id: string; net: number; received: number }>();
  const totalDebt = debtRows.results.reduce((s,x)=>s+n(x.net)-n(x.received),0);
  if (amount > totalDebt + 0.01) return error("Tahsilat kalan bakiyeden büyük olamaz.", 409);
  const paymentId = id(); let remaining = amount; const statements: D1PreparedStatement[] = [env.DB.prepare("INSERT INTO payments(id,date,amount,created_at) VALUES(?,?,?,CURRENT_TIMESTAMP)").bind(paymentId,date,amount)];
  for (const sale of debtRows.results) {
    if (remaining <= 0.001) break;
    const debt = Math.max(0,n(sale.net)-n(sale.received)); const take = Math.min(debt,remaining);
    if (take > 0) {
      statements.push(env.DB.prepare("UPDATE sales SET received=received+?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(take,sale.id));
      statements.push(env.DB.prepare("INSERT INTO payment_allocations(payment_id,sale_id,amount) VALUES(?,?,?)").bind(paymentId,sale.id,take));
      remaining -= take;
    }
  }
  await env.DB.batch(statements);
  return reply({ success: true, paymentId }, 200, corsHeaders());
}

async function updateSettings(request: Request, env: Env) {
  const body = await request.json<{ commissionRate?: number }>().catch(() => ({}));
  const rate = n(body.commissionRate);
  if (rate < 0 || rate > 30) return error("Komisyon oranı 0-30 arasında olmalı.");
  await env.DB.prepare("INSERT INTO settings(key,value,updated_at) VALUES('commission_rate',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(String(rate)).run();
  return reply({ success: true }, 200, corsHeaders());
}

async function importLegacy(request: Request, env: Env) {
  const body = await request.json<{ records?: unknown[] }>().catch(() => ({}));
  if (!Array.isArray(body.records) || body.records.length > 5000) return error("Geçersiz içe aktarma paketi.");
  const defaultRate = await getCommission(env); const statements: D1PreparedStatement[] = []; let imported = 0;
  for (const raw of body.records) {
    if (!raw || typeof raw !== "object") continue;
    const x = raw as Record<string, unknown>; const date = String(x.date || "").split("T")[0]; const kilo = n(x.kilo ?? x.quantity); const net = n(x.net ?? x.netAmount); const received = Math.max(0,n(x.received));
    if (!validDate(date) || kilo <= 0 || net <= 0) continue;
    const saleId = String(x.id || id()); const rate = Math.min(30,Math.max(0,n(x.commissionRate ?? defaultRate))); const gross = rate < 100 ? net / (1-rate/100) : net; const unitPrice = kilo ? gross/kilo : 0;
    statements.push(env.DB.prepare(`INSERT INTO sales(id,date,season,kilo,unit_price,gross,commission_rate,net,received,created_at,updated_at,deleted_at)
      VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL)
      ON CONFLICT(id) DO UPDATE SET date=excluded.date,season=excluded.season,kilo=excluded.kilo,unit_price=excluded.unit_price,gross=excluded.gross,commission_rate=excluded.commission_rate,net=excluded.net,received=excluded.received,updated_at=CURRENT_TIMESTAMP,deleted_at=NULL`)
      .bind(saleId,date,String(x.season || seasonOf(date)),kilo,unitPrice,gross,rate,net,Math.min(received,net)));
    imported++;
  }
  for (let i=0;i<statements.length;i+=100) await env.DB.batch(statements.slice(i,i+100));
  return reply({ success:true, imported },200,corsHeaders());
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return new Response(null,{status:404});
    if (request.method === "OPTIONS") return new Response(null,{status:204,headers:corsHeaders()});
    if (url.pathname === "/api/health") return reply({ ok:true, service:"hal-takip", time:new Date().toISOString() },200,corsHeaders());
    const auth = await authenticate(request,env); if (auth) return auth;
    try {
      if (url.pathname === "/api/state" && request.method === "GET") return reply(await getState(env),200,corsHeaders());
      if (url.pathname.startsWith("/api/sales/") && request.method === "PUT") return upsertSale(request,env,decodeURIComponent(url.pathname.slice(11)));
      if (url.pathname.startsWith("/api/sales/") && request.method === "DELETE") return deleteSale(env,decodeURIComponent(url.pathname.slice(11)));
      if (url.pathname === "/api/payments" && request.method === "POST") return addPayment(request,env);
      if (url.pathname === "/api/settings" && request.method === "PATCH") return updateSettings(request,env);
      if (url.pathname === "/api/import/legacy" && request.method === "POST") return importLegacy(request,env);
      return error("API yolu bulunamadı.",404);
    } catch (e) {
      console.error("HAL API error", e instanceof Error ? e.message : e);
      return error("Sunucu işlemi tamamlanamadı.",500);
    }
  }
} satisfies ExportedHandler<Env>;
