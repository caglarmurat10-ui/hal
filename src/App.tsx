import { useEffect, useMemo, useState } from "react";
import { ApiError, api, flushQueue, getApiConfig, readCachedState, readQueue, saveApiConfig, writeCachedState, writeQueue } from "./api";
import type { AppState, PendingOperation, Sale } from "./types";
import SeasonAnalysis from "./SeasonAnalysis";

const emptyState: AppState = { sales: [], payments: [], commissionRate: 8, serverTime: "" };
const LEGACY_URL = "https://script.google.com/macros/s/AKfycbz1juixEOJWvZHcqjEQ222L3jc6LpiHIKiP_TnObZifz_losMyNN776UVz_T2mMQ03j/exec";
type Modal = "sale" | "payment" | "settings" | null;
type Status = "online" | "offline" | "syncing" | "auth";

function today() { return new Date().toISOString().slice(0, 10); }
function seasonOf(date: string): string | null {
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (m >= 11) return `${y}/${y + 1}`;
  if (m <= 6) return `${y - 1}/${y}`;
  return null;
}
function money(n: number) { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(n || 0); }
function number(n: number, digits = 0) { return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: digits }).format(n || 0); }
function newId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function legacyDate(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(Date.UTC(1899, 11, 30) + value * 86_400_000).toISOString().slice(0, 10);
  return String(value || "").split("T")[0];
}
function normalizeLegacy(records: unknown[], rate: number) {
  let sourceReceived = 0;
  const sales: Sale[] = [];
  for (const raw of records) {
    if (!raw || typeof raw !== "object") continue;
    const x = raw as Record<string, unknown>;
    const date = legacyDate(x.date);
    const season = seasonOf(date);
    const kilo = Number(x.kilo ?? x.quantity) || 0;
    const net = Number(x.net ?? x.netAmount) || 0;
    const received = Math.max(0, Number(x.received) || 0);
    if (!season || kilo <= 0 || net <= 0) continue;
    sourceReceived += received;
    const commissionRate = Math.min(30, Math.max(0, Number(x.commissionRate ?? rate) || rate));
    const gross = net / (1 - commissionRate / 100);
    sales.push({
      id: String(x.id || newId()), date, season, kilo, unitPrice: gross / kilo, gross,
      commissionRate, net, received: 0
    });
  }
  let remaining = Math.min(sourceReceived, sales.reduce((sum, sale) => sum + sale.net, 0));
  for (const sale of [...sales].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
    const take = Math.min(sale.net, remaining);
    sale.received = take;
    remaining -= take;
    if (remaining <= 0.001) break;
  }
  return { sales, sourceReceived };
}

export default function App() {
  const [state, setState] = useState<AppState>(() => readCachedState() || emptyState);
  const [queue, setQueue] = useState<PendingOperation[]>(() => readQueue());
  const [status, setStatus] = useState<Status>("syncing");
  const [lastSync, setLastSync] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [editing, setEditing] = useState<Sale | null>(null);
  const [seasonFilter, setSeasonFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const previewMode = !getApiConfig().baseUrl;

  const persist = (next: AppState) => { setState(next); writeCachedState(next); };
  const persistQueue = (next: PendingOperation[]) => { setQueue(next); writeQueue(next); };

  async function sync() {
    if (!getApiConfig().baseUrl) { setStatus("offline"); return; }
    if (!navigator.onLine) { setStatus("offline"); return; }
    setStatus("syncing");
    try {
      const left = await flushQueue(readQueue());
      persistQueue(left);
      const fresh = await api.state();
      persist(fresh);
      setStatus("online");
      setLastSync(new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }));
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 503)) setStatus("auth");
      else setStatus("offline");
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) setNotice(e.message);
    }
  }

  useEffect(() => {
    sync();
    const onOnline = () => sync();
    const onOffline = () => setStatus("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const id = window.setInterval(() => { if (navigator.onLine && getApiConfig().baseUrl) sync(); }, 60_000);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); clearInterval(id); };
  }, []);

  const totals = useMemo(() => {
    const totalNet = state.sales.reduce((s, x) => s + x.net, 0);
    const totalReceived = state.sales.reduce((s, x) => s + x.received, 0);
    const totalKg = state.sales.reduce((s, x) => s + x.kilo, 0);
    const gross = state.sales.reduce((s, x) => s + x.gross, 0);
    return { totalNet, totalReceived, debt: totalNet - totalReceived, totalKg, avg: totalKg ? gross / totalKg : 0 };
  }, [state.sales]);

  const seasons = useMemo(() => [...new Set(state.sales.map(x => x.season))].sort().reverse(), [state.sales]);
  const filtered = useMemo(() => state.sales
    .filter(x => seasonFilter === "all" || x.season === seasonFilter)
    .filter(x => !query || `${x.date} ${x.season} ${x.kilo} ${x.net}`.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR")))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)), [state.sales, seasonFilter, query]);

  async function enqueue(op: PendingOperation, optimistic: AppState) {
    persist(optimistic);
    if (!getApiConfig().baseUrl) { setStatus("offline"); return; }
    const nextQueue = [...readQueue(), op];
    persistQueue(nextQueue);
    if (navigator.onLine) await sync(); else setStatus("offline");
  }

  async function saveSale(input: { date: string; kilo: number; unitPrice: number }) {
    const season = seasonOf(input.date);
    if (!season) { setNotice("HAL üretim sezonu Kasım-Haziran arasındadır. Temmuz-Ekim dönemine satış kaydı girilemez."); return; }
    const rate = state.commissionRate;
    const gross = input.kilo * input.unitPrice;
    const net = gross * (1 - rate / 100);
    const existing = editing;
    if (existing && existing.received > net + 0.01) { setNotice("Yeni net tutar, bu satış için daha önce tahsil edilmiş tutardan düşük olamaz."); return; }
    const sale: Sale = { id: existing?.id || newId(), date: input.date, season, kilo: input.kilo, unitPrice: input.unitPrice, gross, commissionRate: rate, net, received: existing?.received || 0 };
    const sales = existing ? state.sales.map(x => x.id === sale.id ? sale : x) : [...state.sales, sale];
    setEditing(null); setModal(null);
    await enqueue({ id: newId(), type: "upsert-sale", payload: sale }, { ...state, sales });
  }

  async function deleteSale(sale: Sale) {
    if (sale.received > 0.01) { setNotice("Tahsilat bağlanmış bir satış silinemez. Muhasebe geçmişini korumak için önce ilgili tahsilatın ters kaydı gerekir."); return; }
    if (!confirm(`${new Date(`${sale.date}T12:00:00`).toLocaleDateString("tr-TR")} tarihli kayıt silinsin mi?`)) return;
    await enqueue({ id: newId(), type: "delete-sale", payload: { id: sale.id } }, { ...state, sales: state.sales.filter(x => x.id !== sale.id) });
  }

  async function addPayment(amount: number, date: string) {
    if (amount <= 0 || amount > totals.debt + 0.01) { setNotice("Tahsilat, kalan bakiyeden büyük olamaz."); return; }
    let rem = amount;
    const sales = [...state.sales].sort((a, b) => a.date.localeCompare(b.date)).map(x => ({ ...x }));
    for (const sale of sales) {
      const debt = Math.max(0, sale.net - sale.received);
      const take = Math.min(debt, rem);
      if (take > 0) { sale.received += take; rem -= take; }
      if (rem <= 0.001) break;
    }
    const paymentId = newId();
    setModal(null);
    await enqueue({ id: paymentId, type: "payment", payload: { paymentId, amount, date } }, { ...state, sales });
  }

  function editSale(sale: Sale) { setEditing(sale); setModal("sale"); }
  function exportCsv() {
    const rows = [["Tarih","Sezon","Kilo","Birim Fiyat","Brüt","Komisyon %","Net","Tahsilat","Kalan"], ...filtered.map(x => [x.date,x.season,x.kilo,x.unitPrice,x.gross,x.commissionRate,x.net,x.received,x.net-x.received])];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
    download(`hal-takip-${today()}.csv`, new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  }
  function exportJson() { download(`hal-takip-${today()}.json`, new Blob([JSON.stringify(state, null, 2)], { type: "application/json" })); }
  function download(name: string, blob: Blob) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 500); }

  async function importLegacy() {
    const localPreview = !getApiConfig().baseUrl;
    if (!confirm(localPreview ? "Eski Google HAL kayıtları bu tarayıcıdaki TEST önizlemesine yüklensin mi? Gerçek Cloudflare verisi değişmeyecek." : "Eski Google HAL kayıtları Cloudflare veritabanına içe aktarılsın mı?")) return;
    setNotice("Eski HAL kayıtları okunuyor...");
    try {
      if (localPreview) {
        const response = await fetch(`${LEGACY_URL}?t=${Date.now()}`);
        if (!response.ok) throw new Error(`Eski veri sunucusu ${response.status} yanıtı verdi.`);
        const records = await response.json() as unknown;
        if (!Array.isArray(records)) throw new Error("Eski veri beklenmeyen formatta.");
        const normalized = normalizeLegacy(records, state.commissionRate);
        const next: AppState = { ...state, sales: normalized.sales, payments: [], serverTime: "preview" };
        persistQueue([]);
        persist(next);
        setSeasonFilter("all");
        setNotice(`${normalized.sales.length} eski kayıt TEST önizlemesine yüklendi. Toplam tahsilat ${money(normalized.sourceReceived)} korunarak FIFO ile düzeltildi.`);
        return;
      }
      const result = await api.importLegacyFromCloud();
      setNotice(`${result.imported} kayıt Cloudflare'a içe aktarıldı.`);
      await sync();
    } catch (e) { setNotice(`İçe aktarma başarısız: ${e instanceof Error ? e.message : "Bilinmeyen hata"}`); }
  }

  return (
    <main className="app-shell">
      <header className="topbar"><div><div className="brand-row"><h1>HAL <span>Takip</span></h1><span className="version">v8 Cloudflare</span></div><button className={`sync-pill ${status}`} onClick={sync}><i /> {previewMode ? "Test önizleme modu" : status === "online" ? `Senkron ${lastSync || "hazır"}` : status === "syncing" ? "Güncelleniyor" : status === "auth" ? "Sunucu anahtarı gerekli" : `Çevrimdışı${queue.length ? ` · ${queue.length} bekleyen` : ""}`}</button></div><button className="icon-button" onClick={() => setModal("settings")} aria-label="Ayarlar">⚙</button></header>
      {previewMode && <div className="banner"><b>TEST MODU</b><span>Cloudflare bağlı değil. Buradaki ekleme/değişiklikler sadece bu tarayıcıda kalır.</span></div>}
      {status === "auth" && <div className="banner warning"><b>Güvenli bağlantı tamamlanmadı.</b><span>Ayarlar’dan Cloudflare sunucu adresi ve erişim anahtarını girin.</span><button onClick={() => setModal("settings")}>Ayarları Aç</button></div>}
      {notice && <div className="banner"><span>{notice}</span><button onClick={() => setNotice("")}>Kapat</button></div>}

      <section className="stats-grid"><Stat label="Net Ciro" value={money(totals.totalNet)} tone="green" /><Stat label="Tahsilat" value={money(totals.totalReceived)} tone="blue" /><Stat label="Kalan" value={money(totals.debt)} tone="red" /><Stat label="Toplam Kilo" value={`${number(totals.totalKg, 1)} kg`} tone="gold" /><Stat label="Ort. Brüt Fiyat" value={`${money(totals.avg)}/kg`} tone="violet" /></section>
      <section className="season-strip">{seasons.map(s => { const items = state.sales.filter(x => x.season === s); const net = items.reduce((a,b)=>a+b.net,0); const kg = items.reduce((a,b)=>a+b.kilo,0); return <button key={s} onClick={() => setSeasonFilter(s)} className={seasonFilter===s ? "season-card active" : "season-card"}><small>{s} SEZONU</small><b>{money(net)}</b><span>{number(kg,1)} kg satış</span></button>; })}</section>
      <SeasonAnalysis sales={state.sales} seasons={seasons} seasonFilter={seasonFilter} onSelectSeason={setSeasonFilter} />
      <section className="actions"><button className="primary" onClick={() => { setEditing(null); setModal("sale"); }}>＋ Satış Ekle</button><button className="secondary" disabled={totals.debt <= 0} onClick={() => setModal("payment")}>₺ Tahsilat Al</button></section>

      <section className="panel"><div className="panel-head"><div><h2>İşlemler</h2><p>{filtered.length} kayıt · {previewMode ? "test verisi" : queue.length ? `${queue.length} senkron bekliyor` : "tümü güncel"}</p></div><div className="filters"><select value={seasonFilter} onChange={e => setSeasonFilter(e.target.value)}><option value="all">Tüm sezonlar</option>{seasons.map(s => <option key={s}>{s}</option>)}</select><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Ara" /></div></div>
        <div className="desktop-table"><table><thead><tr><th>Tarih</th><th>Sezon</th><th>Kilo</th><th>Fiyat</th><th>Net</th><th>Tahsilat</th><th>Kalan</th><th /></tr></thead><tbody>{filtered.map(x => <tr key={x.id}><td>{new Date(`${x.date}T12:00:00`).toLocaleDateString("tr-TR")}</td><td><span className="tag">{x.season}</span></td><td>{number(x.kilo,1)} kg</td><td>{money(x.unitPrice)}</td><td className="good">{money(x.net)}</td><td>{money(x.received)}</td><td className={x.net-x.received>1?"bad":"muted"}>{money(x.net-x.received)}</td><td className="row-actions"><button onClick={()=>editSale(x)}>✎</button><button onClick={()=>deleteSale(x)}>⌫</button></td></tr>)}</tbody></table></div>
        <div className="mobile-list">{filtered.map(x => <article className="sale-card" key={x.id}><div><b>{new Date(`${x.date}T12:00:00`).toLocaleDateString("tr-TR")}</b><span className="tag">{x.season}</span></div><div className="sale-main"><strong>{number(x.kilo,1)} kg</strong><strong className="good">{money(x.net)}</strong></div><div className="sale-sub"><span>{money(x.unitPrice)}/kg</span><span className={x.net-x.received>1?"bad":"muted"}>Kalan {money(x.net-x.received)}</span></div><div className="card-actions"><button onClick={()=>editSale(x)}>Düzenle</button><button onClick={()=>deleteSale(x)}>Sil</button></div></article>)}</div>
        {!filtered.length && <div className="empty">Henüz kayıt yok.</div>}
      </section>
      <footer>HAL Takip v8 · Kasım-Haziran sezonu · Cloudflare D1</footer>

      {modal === "sale" && <SaleModal sale={editing} commissionRate={state.commissionRate} onClose={() => { setModal(null); setEditing(null); }} onSave={saveSale} />}
      {modal === "payment" && <PaymentModal debt={totals.debt} onClose={() => setModal(null)} onSave={addPayment} />}
      {modal === "settings" && <SettingsModal previewMode={previewMode} commissionRate={state.commissionRate} onClose={() => setModal(null)} onSave={async (rate,base,key) => { saveApiConfig(base,key); const next={...state,commissionRate:rate}; persist(next); setModal(null); await enqueue({id:newId(),type:"settings",payload:{commissionRate:rate}},next); }} onCsv={exportCsv} onJson={exportJson} onImport={importLegacy} />}
    </main>
  );
}

function Stat({label,value,tone}:{label:string;value:string;tone:string}) { return <div className={`stat ${tone}`}><span>{label}</span><b>{value}</b></div>; }
function SaleModal({ sale, commissionRate, onClose, onSave }: { sale: Sale | null; commissionRate: number; onClose: () => void; onSave: (x:{date:string;kilo:number;unitPrice:number})=>void }) {
  const [date,setDate]=useState(sale?.date || today()); const [kilo,setKilo]=useState(sale?.kilo?.toString() || ""); const [price,setPrice]=useState(sale?.unitPrice?.toString() || "");
  const gross=(Number(kilo)||0)*(Number(price)||0); const net=gross*(1-commissionRate/100); const season=seasonOf(date);
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><form className="modal" onSubmit={e=>{e.preventDefault(); if(Number(kilo)>0&&Number(price)>0)onSave({date,kilo:Number(kilo),unitPrice:Number(price)});}}><div className="modal-title"><div><small>{sale?"KAYIT DÜZENLE":"YENİ SATIŞ"}</small><h3>{season || "Üretim dışı dönem"}</h3></div><button type="button" onClick={onClose}>×</button></div><label>Tarih<input type="date" value={date} onChange={e=>setDate(e.target.value)} required /></label>{!season && <div className="banner warning"><span>Üretim sezonu Kasım-Haziran arasındadır.</span></div>}<div className="two"><label>Kilo<input inputMode="decimal" value={kilo} onChange={e=>setKilo(e.target.value)} placeholder="0" required /></label><label>Birim fiyat<input inputMode="decimal" value={price} onChange={e=>setPrice(e.target.value)} placeholder="₺" required /></label></div><div className="calc"><span>Brüt <b>{money(gross)}</b></span><span>Komisyon %{commissionRate} <b>-{money(gross*commissionRate/100)}</b></span><strong>Net {money(net)}</strong></div><button className="primary full" type="submit" disabled={!season}>{sale?"Değişiklikleri Kaydet":"Satışı Kaydet"}</button></form></div>;
}
function PaymentModal({debt,onClose,onSave}:{debt:number;onClose:()=>void;onSave:(amount:number,date:string)=>void}) { const [amount,setAmount]=useState(""); const [date,setDate]=useState(today()); return <div className="modal-backdrop"><form className="modal" onSubmit={e=>{e.preventDefault();onSave(Number(amount),date);}}><div className="modal-title"><div><small>TAHSİLAT</small><h3>Kalan {money(debt)}</h3></div><button type="button" onClick={onClose}>×</button></div><label>Tarih<input type="date" value={date} onChange={e=>setDate(e.target.value)} /></label><label>Tahsil edilen tutar<input autoFocus inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="₺ 0" /></label><button type="button" className="ghost full" onClick={()=>setAmount(debt.toFixed(2))}>Kalanın tamamı</button><button className="secondary full" type="submit">Tahsilatı Kaydet</button></form></div>; }
function SettingsModal({previewMode,commissionRate,onClose,onSave,onCsv,onJson,onImport}:{previewMode:boolean;commissionRate:number;onClose:()=>void;onSave:(r:number,b:string,k:string)=>void;onCsv:()=>void;onJson:()=>void;onImport:()=>void}) { const cfg=getApiConfig(); const [rate,setRate]=useState(commissionRate.toString()); const [base,setBase]=useState(cfg.baseUrl); const [key,setKey]=useState(cfg.apiKey); return <div className="modal-backdrop"><div className="modal settings"><div className="modal-title"><div><small>AYARLAR</small><h3>HAL Takip v8</h3></div><button onClick={onClose}>×</button></div><label>Komisyon oranı (%)<input inputMode="decimal" value={rate} onChange={e=>setRate(e.target.value)} /></label><label>Cloudflare API adresi <span className="hint">Test sırasında boş bırak. Üretimde workers.dev veya özel alan adı kullanılacak.</span><input value={base} onChange={e=>setBase(e.target.value)} placeholder="https://hal-takip....workers.dev" /></label><label>Erişim anahtarı <span className="hint">Üretimde Cloudflare HAL_API_KEY secret ile aynı olmalı.</span><input type="password" value={key} onChange={e=>setKey(e.target.value)} /></label><button className="primary full" onClick={()=>onSave(Number(rate)||8,base,key)}>Kaydet</button><div className="settings-actions"><button className="ghost" onClick={onCsv}>CSV Dışa Aktar</button><button className="ghost" onClick={onJson}>JSON Yedekle</button><button className="ghost danger" onClick={onImport}>{previewMode?"Eski Veriyi TESTE Yükle":"Eski Google Verisini İçe Aktar"}</button></div></div></div>; }
