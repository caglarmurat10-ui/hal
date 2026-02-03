"use client"
import EntryForm from "@/components/EntryForm";
import RecentEntries from "@/components/RecentEntries";
import { getEntries, saveCloudData, syncFromCloud } from "@/app/actions";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

const DRIVE_URL = "https://script.google.com/macros/s/AKfycbz1juixEOJWvZHcqjEQ222L3jc6LpiHIKiP_TnObZifz_losMyNN776UVz_T2mMQ03j/exec";

export default function Home() {
  const [entries, setEntries] = useState<any[]>([]);
  const [stats, setStats] = useState({ net: 0, received: 0, debt: 0 });
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // V6 Features: Commission Settings
  const [commission, setCommission] = useState(8);
  const [showSettings, setShowSettings] = useState(false);
  const [syncStatus, setSyncStatus] = useState("Hazır");
  const [syncStatusColor, setSyncStatusColor] = useState("text-emerald-500");

  const [editingEntry, setEditingEntry] = useState<any>(null);

  // Load Settings from LocalStorage on Mount AND Sync
  useEffect(() => {
    const savedConfig = localStorage.getItem('hal_config');
    if (savedConfig) {
      try {
        const config = JSON.parse(savedConfig);
        if (config.commission) setCommission(config.commission);
      } catch (e) { }
    }
    // Auto-Fetch on mount (Delayed to ensure hydration)
    // Auto-Fetch on mount
    console.log("App Mounted - triggering auto-sync...");
    handleCloudSync();
  }, []);

  const saveSettings = () => {
    localStorage.setItem('hal_config', JSON.stringify({ commission }));
    setShowSettings(false);
    alert(`Komisyon oranı %${commission} olarak güncellendi.`);
  };

  const getSeason = (dateStr: string) => {
    const d = new Date(dateStr);
    return (d.getMonth() + 1 >= 9) ? (d.getFullYear() + "/" + (d.getFullYear() + 1)) : ((d.getFullYear() - 1) + "/" + d.getFullYear());
  };

  const calculateStats = (data: any[]) => {
    const net = data.reduce((acc: number, curr: any) => acc + (parseFloat(curr.netAmount) || 0), 0);
    const received = data.reduce((acc: number, curr: any) => acc + (parseFloat(curr.received) || 0), 0);
    setStats({
      net,
      received,
      debt: net - received
    });
  };

  // --- CLIENT SIDE SYNC (EXACT MATCH TO HTML V6.1) ---
  const handleCloudSync = async () => {
    setSyncing(true);
    setSyncStatus("Güncelleniyor...");
    setSyncStatusColor("text-orange-400");

    try {
      // Direct Fetch (Vercel Client IP -> Google)
      // Note: We use 'no-referrer' to try to mitigate Origin blocks
      // Cache Busting: ?t=... ensure fresh data
      const response = await fetch(DRIVE_URL + "?t=" + Date.now());

      if (!response.ok) throw new Error("Sunucu yanıt vermedi");

      const data = await response.json();

      if (Array.isArray(data)) {
        const cloudEntries = data.map((item: any) => ({
          id: String(item.id),
          date: String(item.date).split('T')[0],
          season: item.season || getSeason(item.date),
          product: "Genel Ürün", // Default - In V6 this is not stored, but we display generic
          supplier: "Bulut Kaydı", // Default
          quantity: parseFloat(item.kilo) || 0,
          price: 0,
          grossAmount: 0,
          netAmount: parseFloat(item.net) || 0,
          received: parseFloat(item.received) || 0,
          commission: 0, labor: 0, transport: 0, stopaj: 0, rusum: 0,
          // If available in cloud response (custom logic), map it, else defaults
          commissionRate: commission
        }));

        setEntries(cloudEntries);
        calculateStats(cloudEntries);
        saveCloudData(cloudEntries).catch(() => { }); // Backup

        setSyncStatus("BAĞLANDI 🟢"); // Distinct new status
        setSyncStatusColor("text-emerald-500");
        // alert(`✅ (TARAYICI MODU) Başarılı!\nVeri Kaynağı: Google Direkt\nKayıt Sayısı: ${cloudEntries.length}`); // Removed alert to be less intrusive on auto-load
      } else {
        throw new Error("Veri formatı hatalı.");
      }
    } catch (error: any) {
      console.error("Client Sync Error:", error);

      // Fallback: Try Server Proxy if Client fails
      try {
        console.log("Attempting Server Proxy Fallback...");
        const result = await syncFromCloud();
        if (result.success && result.data) {
          setEntries(result.data);
          calculateStats(result.data);
          setSyncStatus("Proxy Yedek");
          setSyncStatusColor("text-blue-400");
          // alert(`✅ (SUNUCU MODU - PROXY)\nGoogle engeli aşıldı.\nKayıt Sayısı: ${result.data.length}\n*Veriler düzeltildi.`);
        } else {
          throw new Error(result.error);
        }
      } catch (proxyError: any) {
        setSyncStatus("Hata");
        setSyncStatusColor("text-rose-500");
        // alert(`❌ Bağlantı Hatası: ${error.message}\nProxy Hatası: ${proxyError.message}`);
      }
    } finally {
      setSyncing(false);
    }
  };

  // --- CLIENT SIDE WRITE (EXACT MATCH TO HTML V6.1) ---
  const syncEntry = async (record: any) => {
    setSyncStatus("Kaydediliyor...");
    setSyncStatusColor("text-blue-400");

    try {
      await fetch(DRIVE_URL, {
        method: 'POST',
        mode: 'no-cors', // Critical: Bypasses CORS and Bot Detection
        body: JSON.stringify({
          id: record.id,
          cin: record.date,
          nights: record.quantity, // Quantity -> nights mapping
          net: record.netAmount,
          received: record.received || 0,
          season: record.season || getSeason(record.date)
        })
      });
      setSyncStatus("Kaydedildi ✅");
      setSyncStatusColor("text-emerald-500");
      setTimeout(() => {
        setSyncStatus("Yedekle / Yenile");
        handleCloudSync();
      }, 1000);
    } catch (e) {
      console.error("Write Error:", e);
      setSyncStatus("Hata ⚠️");
      setSyncStatusColor("text-rose-500");
    }
  };

  const handleEntryResult = (newEntry: any) => {
    // 1. Update Local State Immediately (Optimistic)
    // If editing, replace. If new, add.
    const exists = entries.find(e => e.id === newEntry.id);
    let updated;
    if (exists) {
      updated = entries.map(e => e.id === newEntry.id ? newEntry : e);
    } else {
      updated = [...entries, newEntry];
    }

    setEntries(updated);
    calculateStats(updated);

    // 2. Sync to Cloud
    syncEntry(newEntry);

    // 3. Close Form
    setShowEntryForm(false);
    setEditingEntry(null);
  };

  const handleEdit = (id: string) => {
    const entry = entries.find(e => e.id === id);
    if (entry) {
      setEditingEntry(entry);
      setShowEntryForm(true);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bu kaydı silmek istediğinize emin misiniz?")) return;

    // 1. Local Update
    const updated = entries.filter(e => e.id !== id);
    setEntries(updated);
    calculateStats(updated);

    // 2. Cloud Update (Action: Delete)
    setSyncStatus("Siliniyor...");
    setSyncStatusColor("text-rose-400");

    try {
      await fetch(DRIVE_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({
          id: id,
          kilo: 0,
          received: 0,
          net: 0,
          action: 'delete'
        })
      });
      setSyncStatus("Silindi 🗑️");
      setTimeout(() => {
        setSyncStatus("Yedekle / Yenile");
        handleCloudSync();
      }, 1000);
    } catch (e) {
      console.error("Delete Error:", e);
      setSyncStatus("Hata ⚠️");
    }
  };

  return (
    <div className="max-w-md mx-auto sm:max-w-2xl md:max-w-5xl">
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4 text-white backdrop-blur-sm">
          <div className="glass-card w-full max-w-xs p-6 bg-slate-900 border-slate-700 border shadow-2xl">
            <h2 className="text-lg font-bold mb-4 text-white flex items-center gap-2">⚙️ Ayarlar</h2>
            <div className="flex gap-2 mb-4">
              <input
                type="number"
                value={commission}
                onChange={(e) => setCommission(parseFloat(e.target.value))}
                className="bg-slate-800 border border-slate-700 text-white p-3 rounded-xl w-full text-center font-bold text-emerald-400 text-xl outline-none"
              />
              <span className="flex items-center font-bold text-xl">%</span>
            </div>
            <Button onClick={saveSettings} className="w-full bg-emerald-600 font-bold">KAYDET</Button>
            <Button onClick={() => setShowSettings(false)} className="w-full mt-2 bg-transparent text-slate-500">Kapat</Button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="glass-card p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-2xl font-bold text-emerald-400 tracking-tight">Hal <span className="text-white">Takip</span> <span className="text-[10px] bg-slate-800 text-slate-500 px-1 rounded ml-1">v6.4</span></h1>
            <div onClick={handleCloudSync} className="cursor-pointer flex items-center gap-2 mt-1">
              <span className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 ${syncStatusColor}`}>
                <span className={`w-2 h-2 rounded-full ${syncStatusColor.replace('text-', 'bg-')}`}></span> {syncStatus}
              </span>
            </div>
          </div>

          <button onClick={() => setShowSettings(true)} className="bg-slate-800/80 p-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white">
            ⚙️
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="text-center p-3 bg-slate-800/50 rounded-xl border border-white/5">
            <p className="text-[10px] text-slate-400 uppercase font-semibold">Net Ciro</p>
            <p className="text-sm sm:text-lg font-bold text-emerald-400">{stats.net.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 })}</p>
          </div>
          <div className="text-center p-3 bg-blue-500/10 rounded-xl border border-blue-500/20">
            <p className="text-[10px] text-blue-400 uppercase font-semibold">Tahsilat</p>
            <p className="text-sm sm:text-lg font-bold text-blue-400">{stats.received.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 })}</p>
          </div>
          <div className="text-center p-3 bg-rose-500/10 rounded-xl border border-rose-500/20">
            <p className="text-[10px] text-rose-400 uppercase font-semibold">Kalan</p>
            <p className="text-sm sm:text-lg font-bold text-rose-500">{stats.debt.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 })}</p>
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-3 mb-6">
        <Button onClick={() => { setShowEntryForm(!showEntryForm); setEditingEntry(null); }} className="flex-1 bg-emerald-600 hover:bg-emerald-700 py-6 text-sm font-bold shadow-lg uppercase italic text-white rounded-xl">
          {showEntryForm ? "Listeye Dön" : "✚ Satış Ekle"}
        </Button>
        <Button className="flex-1 bg-blue-600 hover:bg-blue-700 py-6 text-sm font-bold shadow-lg uppercase italic text-white rounded-xl">
          ₺ Tahsilat Al
        </Button>
      </div>

      {/* Content */}
      <div className="glass-card overflow-hidden">
        {showEntryForm ? (
          <div className="p-4">
            {/* Pass onEntryResult and initialData (if editing) */}
            <EntryForm onEntryResult={handleEntryResult} initialData={editingEntry} />
          </div>
        ) : (
          <RecentEntries entries={entries} onDelete={handleDelete} onEdit={handleEdit} />
        )}
      </div>
    </div>
  );
}
