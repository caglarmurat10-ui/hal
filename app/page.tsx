"use client"

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

const DRIVE_URL = "https://script.google.com/macros/s/AKfycbz1juixEOJWvZHcqjEQ222L3jc6LpiHIKiP_TnObZifz_losMyNN776UVz_T2mMQ03j/exec";

export default function Home() {
  // --- STATE ---
  const [entries, setEntries] = useState<any[]>([]);
  const [commission, setCommission] = useState(8);

  // UI State
  const [showSettings, setShowSettings] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'sale' | 'payment' | 'edit'>('sale');
  const [activeId, setActiveId] = useState<string | null>(null);

  // Sync State
  const [syncStatus, setSyncStatus] = useState("Bağlanıyor...");
  const [syncColor, setSyncColor] = useState("bg-slate-500");

  // Form State
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    kilo: "",
    price: "",
    payAmount: "",
  });

  // --- INITIALIZATION ---
  useEffect(() => {
    // 1. Load LocalStorage
    const savedData = localStorage.getItem('hal_data_v6');
    if (savedData) setEntries(JSON.parse(savedData));

    const savedConfig = localStorage.getItem('hal_config');
    if (savedConfig) setCommission(JSON.parse(savedConfig).commission || 8);

    // 2. Initial Sync
    syncWithCloud();
  }, []);

  // --- LOGIC: SEASON ---
  const getSeason = (dateStr: string) => {
    const d = new Date(dateStr);
    return (d.getMonth() + 1 >= 9) ? (d.getFullYear() + "/" + (d.getFullYear() + 1)) : ((d.getFullYear() - 1) + "/" + d.getFullYear());
  };

  // --- LOGIC: SYNC ---
  const syncWithCloud = async () => {
    setSyncStatus("Güncelleniyor...");
    setSyncColor("bg-orange-400 animate-spin");

    try {
      const response = await fetch(DRIVE_URL + "?t=" + Date.now());
      if (!response.ok) throw new Error("Sunucu hatası");

      const data = await response.json();
      if (Array.isArray(data)) {
        const mapped = data.map((item: any) => ({
          id: String(item.id),
          date: String(item.date).split('T')[0],
          season: item.season || getSeason(item.date),
          kilo: parseFloat(item.kilo) || 0,
          net: parseFloat(item.net) || 0,
          received: parseFloat(item.received) || 0
        }));

        setEntries(mapped);
        localStorage.setItem('hal_data_v6', JSON.stringify(mapped));

        setSyncStatus("BAĞLANDI 🟢");
        setSyncColor("bg-emerald-500");
      }
    } catch (e) {
      console.error(e);
      setSyncStatus("Çevrimdışı 🔴");
      setSyncColor("bg-rose-500");
    }
  };

  const syncEntry = async (record: any) => {
    setSyncStatus("Kaydediliyor...");
    setSyncColor("bg-blue-400");

    try {
      await fetch(DRIVE_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({
          id: record.id,
          cin: record.date,
          nights: record.kilo,
          net: record.net,
          received: record.received,
          season: record.season,
          action: record.action || 'save' // 'delete' if needed
        })
      });
      setSyncStatus("Kaydedildi ✅");
      setSyncColor("bg-emerald-500");
      setTimeout(syncWithCloud, 1000);
    } catch (e) {
      setSyncStatus("Hata ⚠️");
      setSyncColor("bg-rose-500");
    }
  };

  // --- ACTIONS ---
  const handleSave = () => {
    let newEntries = [...entries];
    let record;

    if (modalMode === 'sale' || modalMode === 'edit') {
      const k = parseFloat(formData.kilo);
      const p = parseFloat(formData.price);
      if (!k || !p) return alert("Kilo ve Fiyat giriniz.");

      const brut = k * p;
      const net = brut * ((100 - commission) / 100);
      const d = formData.date;

      if (modalMode === 'sale') {
        record = { id: Date.now().toString(), date: d, season: getSeason(d), kilo: k, net: net, received: 0 };
        newEntries.push(record);
      } else {
        // Edit
        const idx = newEntries.findIndex(x => x.id === activeId);
        if (idx > -1) {
          newEntries[idx] = { ...newEntries[idx], date: d, kilo: k, net: net, season: getSeason(d) };
          record = newEntries[idx];
        }
      }
    } else {
      // Payment
      const amt = parseFloat(formData.payAmount);
      if (!amt) return alert("Miktar giriniz.");

      let rem = amt;
      newEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      for (let e of newEntries) {
        let debt = e.net - e.received;
        if (debt > 0 && rem > 0) {
          let take = Math.min(debt, rem);
          e.received += take;
          rem -= take;
          syncEntry(e); // Sync each update
        }
      }
      record = null; // Already synced inside loop
    }

    setEntries(newEntries);
    localStorage.setItem('hal_data_v6', JSON.stringify(newEntries));
    setShowModal(false);
    if (record) syncEntry(record);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Silinsin mi?")) return;

    // 1. Remove Local
    const updated = entries.filter(e => e.id !== id);
    setEntries(updated);
    localStorage.setItem('hal_data_v6', JSON.stringify(updated));

    // 2. Sync Delete
    await fetch(DRIVE_URL, {
      method: 'POST',
      mode: 'no-cors',
      body: JSON.stringify({ id, kilo: 0, received: 0, net: 0, action: 'delete' })
    });

    setTimeout(syncWithCloud, 1000);
  };

  const openEdit = (id: string) => {
    const e = entries.find(x => x.id === id);
    if (!e) return;

    setActiveId(id);
    setModalMode('edit');

    // Calculate approx price
    const factor = (100 - commission) / 100;
    const price = e.kilo > 0 ? (e.net / factor / e.kilo) : 0;

    setFormData({
      date: e.date,
      kilo: e.kilo.toString(),
      price: price.toFixed(2),
      payAmount: ""
    });
    setShowModal(true);
  };

  // --- STATS ---
  const totalNet = entries.reduce((a, b) => a + b.net, 0);
  const totalRec = entries.reduce((a, b) => a + b.received, 0);
  const totalDebt = totalNet - totalRec;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white p-4 pb-24 font-sans">
      <div className="max-w-md mx-auto sm:max-w-2xl md:max-w-5xl">

        {/* HEADER */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-emerald-400 tracking-tight">
              Hal <span className="text-white">Takip</span>
              <span className="text-[10px] bg-slate-800 text-slate-500 px-1 rounded ml-1">v7.0</span>
            </h1>
            <div onClick={syncWithCloud} className="mt-1 flex items-center gap-2 cursor-pointer">
              <span className={`w-2 h-2 rounded-full ${syncColor}`}></span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{syncStatus}</span>
            </div>
          </div>
          <button onClick={() => setShowSettings(true)} className="bg-slate-800/80 p-2 rounded-xl border border-slate-700 hover:bg-slate-700">
            ⚙️
          </button>
        </div>

        {/* STATS */}
        <div className="glass-card p-4 mb-6 bg-slate-800/50 rounded-2xl border border-white/5 shadow-xl">
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 bg-slate-900/50 rounded-xl border border-white/5">
              <p className="text-[10px] text-slate-400 uppercase font-bold">Net Ciro</p>
              <p className="text-lg font-bold text-emerald-400">₺{totalNet.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="text-center p-3 bg-blue-500/10 rounded-xl border border-blue-500/20">
              <p className="text-[10px] text-blue-400 uppercase font-bold">Tahsilat</p>
              <p className="text-lg font-bold text-blue-400">₺{totalRec.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="text-center p-3 bg-rose-500/10 rounded-xl border border-rose-500/20">
              <p className="text-[10px] text-rose-400 uppercase font-bold">Kalan</p>
              <p className="text-lg font-bold text-rose-500">₺{totalDebt.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</p>
            </div>
          </div>
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => { setModalMode('sale'); setFormData({ date: new Date().toISOString().split('T')[0], kilo: "", price: "", payAmount: "" }); setShowModal(true); }}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 p-4 rounded-xl font-bold shadow-lg text-sm uppercase italic transition-transform active:scale-95"
          >
            ✚ Satış Ekle
          </button>
          <button
            onClick={() => { setModalMode('payment'); setFormData({ date: new Date().toISOString().split('T')[0], kilo: "", price: "", payAmount: "" }); setShowModal(true); }}
            className="flex-1 bg-blue-600 hover:bg-blue-700 p-4 rounded-xl font-bold shadow-lg text-sm uppercase italic transition-transform active:scale-95"
          >
            ₺ Tahsilat Al
          </button>
        </div>

        {/* LIST */}
        <div className="glass-card bg-slate-800/30 rounded-2xl border border-white/5 overflow-hidden">
          <div className="p-4 bg-white/5 border-b border-white/5 flex justify-between items-center">
            <span className="text-xs font-bold uppercase text-slate-400 tracking-widest">SON İŞLEMLER</span>
            <button onClick={syncWithCloud} className="text-[10px] text-emerald-400 font-bold uppercase">YENİLE ↻</button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-white/5">
                {entries.length === 0 && (
                  <tr><td colSpan={4} className="p-8 text-center text-slate-500">Kayıt Yok</td></tr>
                )}
                {[...entries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(item => (
                  <tr key={item.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4">
                      <div className="text-xs font-bold text-slate-200">{new Date(item.date).toLocaleDateString('tr-TR')}</div>
                      <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                        {item.season}
                      </span>
                    </td>
                    <td className="p-4 text-xs font-semibold text-white">
                      {item.kilo} kg
                    </td>
                    <td className="p-4">
                      <div className="font-bold text-emerald-400 text-xs">₺{item.net.toLocaleString('tr-TR')}</div>
                      <div className={`text-[9px] ${(item.net - item.received) > 1 ? 'text-rose-400' : 'text-slate-500'}`}>
                        Kalan: ₺{(item.net - item.received).toLocaleString('tr-TR')}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <button onClick={() => openEdit(item.id)} className="text-blue-400 text-lg mr-3 hover:text-white">✏️</button>
                      <button onClick={() => handleDelete(item.id)} className="text-rose-500 text-lg hover:text-white">🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* MODAL */}
        {showModal && (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
              <h2 className="text-xl font-bold mb-6 text-emerald-400 uppercase italic">
                {modalMode === 'sale' ? 'Yeni Satış' : modalMode === 'edit' ? 'Düzenle' : 'Tahsilat Al'}
              </h2>

              <div className="space-y-4">
                {(modalMode === 'sale' || modalMode === 'edit') && (
                  <>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-400 ml-1">Tarih</label>
                      <input
                        type="date"
                        className="w-full bg-slate-800 border-slate-700 rounded-xl p-3 text-white outline-none focus:border-emerald-500 transition-colors"
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400 ml-1">Kilo</label>
                        <input
                          type="number"
                          className="w-full bg-slate-800 border-slate-700 rounded-xl p-3 text-white outline-none focus:border-emerald-500 transition-colors"
                          placeholder="kg"
                          value={formData.kilo}
                          onChange={(e) => setFormData({ ...formData, kilo: e.target.value })}
                          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                          autoComplete="off"
                        />         </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-400 ml-1">Birim Fiyat</label>
                        <input
                          type="number"
                          className="w-full bg-slate-800 border-slate-700 rounded-xl p-3 text-white outline-none focus:border-emerald-500 transition-colors"
                          placeholder="₺"
                          value={formData.price}
                          onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                          autoComplete="off"
                        />
                      </div>
                    </div>
                  </>
                )}

                {modalMode === 'payment' && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 ml-1">Tahsilat Miktarı</label>
                    <input
                      type="number"
                      className="w-full bg-slate-800 border-blue-500/50 rounded-xl p-3 text-white text-lg font-bold outline-none focus:border-blue-500 transition-colors"
                      placeholder="₺"
                      value={formData.payAmount}
                      onChange={(e) => setFormData({ ...formData, payAmount: e.target.value })}
                    />
                  </div>
                )}

                <div className="flex gap-3 pt-4 border-t border-white/10 mt-6">
                  <button onClick={() => setShowModal(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 p-3 rounded-xl font-bold uppercase text-xs text-slate-300">İptal</button>
                  <button onClick={handleSave} className="flex-[2] bg-emerald-600 hover:bg-emerald-700 p-3 rounded-xl font-bold uppercase text-xs text-white shadow-lg">Onayla</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SETTINGS MODAL */}
        {showSettings && (
          <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="w-full max-w-xs bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
              <h2 className="text-lg font-bold mb-4 text-white flex items-center gap-2">⚙️ Ayarlar</h2>
              <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Komisyon Oranı</label>
              <div className="flex gap-2 mb-6">
                <input
                  type="number"
                  value={commission}
                  onChange={(e) => setCommission(parseFloat(e.target.value))}
                  className="bg-slate-800 border border-slate-700 text-white p-3 rounded-xl w-full text-center font-bold text-emerald-400 text-xl outline-none"
                />
                <span className="flex items-center font-bold text-xl">%</span>
              </div>
              <Button onClick={() => {
                localStorage.setItem('hal_config', JSON.stringify({ commission }));
                alert("Ayarlar kaydedildi.");
                setShowSettings(false);
              }} className="w-full bg-emerald-600 font-bold mb-2">KAYDET</Button>
              <Button onClick={() => setShowSettings(false)} className="w-full bg-transparent text-slate-500 border border-slate-800">Kapat</Button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
