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
  const [refreshKey, setRefreshKey] = useState(0);

  // V6 Features: Commission Settings
  const [commission, setCommission] = useState(8);
  const [showSettings, setShowSettings] = useState(false);

  // Load Settings from LocalStorage on Mount
  useEffect(() => {
    const savedConfig = localStorage.getItem('hal_config');
    if (savedConfig) {
      try {
        const config = JSON.parse(savedConfig);
        if (config.commission) setCommission(config.commission);
      } catch (e) { }
    }
  }, []);

  // Save Settings
  const saveSettings = () => {
    localStorage.setItem('hal_config', JSON.stringify({ commission }));
    setShowSettings(false);
    alert(`Komisyon oranı %${commission} olarak güncellendi.`);
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

  useEffect(() => {
    getEntries().then(data => {
      if (Array.isArray(data)) {
        setEntries(data);
        calculateStats(data);
      }
    })
  }, [refreshKey]);

  const handleCloudSync = async () => {
    setSyncing(true);
    let clientError = "";

    // --- STRATEGY 1: CLIENT-SIDE FETCH (V6 Logic) ---
    try {
      const response = await fetch(DRIVE_URL);
      const contentType = response.headers.get("content-type");

      if (contentType && contentType.includes("text/html")) {
        throw new Error("Client: Google HTML yanıtı döndü.");
      }

      if (!response.ok) throw new Error("Client: HTTP " + response.status);

      const data = await response.json();
      if (Array.isArray(data)) {
        updateStateWithData(data);
        return;
      } else {
        throw new Error("Client: Veri formatı bozuk.");
      }
    } catch (error: any) {
      console.warn("Client Sync Failed, trying Server Proxy...", error);
      clientError = error.message || String(error);
    }

    // --- STRATEGY 2: SERVER-SIDE PROXY ---
    try {
      const result = await syncFromCloud();
      if (result.success && result.data) {
        setEntries(result.data);
        calculateStats(result.data);
        alert(`✅ Bulut verileri başarıyla indirildi via PROXY. Toplam ${result.count || 0} kayıt.`);
        return;
      } else {
        throw new Error(result.error);
      }
    } catch (serverError: any) {
      console.error("Server Sync Failed", serverError);
      alert(`❌ EŞLEŞTİRME BAŞARISIZ\n\n1. Deneme: ${clientError}\n2. Deneme: ${serverError.message || serverError}`);
    } finally {
      setSyncing(false);
    }
  };

  const updateStateWithData = (data: any[]) => {
    // V6 MAPPING LOGIC (OBJECT BASED)
    const cloudEntries = data.map((item: any) => {
      return {
        id: String(item.id),
        date: String(item.date).split('T')[0],
        product: "Genel Ürün",
        supplier: "Bulut Kaydı",
        quantity: parseFloat(item.kilo) || 0,
        price: 0,
        grossAmount: 0,
        netAmount: parseFloat(item.net) || 0,
        received: parseFloat(item.received) || 0,
        commission: 0, labor: 0, transport: 0, stopaj: 0, rusum: 0
      }
    }).filter((e: any) => (parseFloat(e.quantity) > 0 || parseFloat(e.netAmount) > 0));

    setEntries(cloudEntries);
    calculateStats(cloudEntries);

    // Fire-and-forget backup
    saveCloudData(cloudEntries).catch(() => { });

    alert(`✅ Bulut Hazır. Toplam ${cloudEntries.length} kayıt. (V6)`);
    setSyncing(false);
  };

  return (
    <div className="max-w-md mx-auto sm:max-w-2xl md:max-w-5xl">
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4 text-white backdrop-blur-sm">
          <div className="glass-card w-full max-w-xs p-6 bg-slate-900 border-slate-700 border shadow-2xl">
            <h2 className="text-lg font-bold mb-4 text-white flex items-center gap-2">⚙️ Ayarlar</h2>
            <label className="text-xs text-slate-400 uppercase font-bold block mb-2">Komisyon Oranı (%)</label>
            <div className="flex gap-2 mb-4">
              <input
                type="number"
                value={commission}
                onChange={(e) => setCommission(parseFloat(e.target.value))}
                className="bg-slate-800 border border-slate-700 text-white p-3 rounded-xl w-full text-center font-bold text-emerald-400 text-xl outline-none focus:border-emerald-500"
              />
              <span className="flex items-center font-bold text-xl">%</span>
            </div>
            <Button onClick={saveSettings} className="w-full bg-emerald-600 hover:bg-emerald-700 py-6 font-bold text-sm">KAYDET</Button>
            <Button onClick={() => setShowSettings(false)} className="w-full mt-2 bg-transparent text-slate-500 hover:text-white">Kapat</Button>
          </div>
        </div>
      )}

      {/* Header Card */}
      <div className="glass-card p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-2xl font-bold text-emerald-400 tracking-tight">Hal <span className="text-white">Takip</span></h1>
            <div onClick={handleCloudSync} className="cursor-pointer flex items-center gap-2 mt-1">
              {syncing ? (
                <span className="text-[10px] text-orange-400 font-bold uppercase tracking-widest flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-orange-400 animate-spin"></span> Güncelleniyor...
                </span>
              ) : (
                <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest flex items-center gap-1 hover:text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Hazır
                </span>
              )}
            </div>
          </div>

          <button onClick={() => setShowSettings(true)} className="bg-slate-800/80 p-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white transition-colors">
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

      {/* Actions */}
      <div className="flex gap-3 mb-6">
        <Button onClick={() => setShowEntryForm(!showEntryForm)} className="flex-1 bg-emerald-600 hover:bg-emerald-700 py-6 text-sm font-bold shadow-lg uppercase italic text-white rounded-xl">
          {showEntryForm ? "Listeye Dön" : "✚ Satış Ekle"}
        </Button>
        <Button className="flex-1 bg-blue-600 hover:bg-blue-700 py-6 text-sm font-bold shadow-lg uppercase italic text-white rounded-xl">
          ₺ Tahsilat Al
        </Button>
      </div>

      {/* Content Area */}
      <div className="glass-card overflow-hidden">
        {showEntryForm ? (
          <div className="p-4">
            <h2 className="text-emerald-400 font-bold mb-4 uppercase italic">Yeni İşlem</h2>
            {/* Pass commission to EntryForm if needed, or EntryForm handles it locally? 
                Ideally EntryForm should take commission as prop, but for now we keep it simple.
                The prompt didn't ask to rewrite EntryForm yet, but logic is tied. 
                For now let's focus on Page Sync matching V6.
            */}
            <EntryForm onEntryResult={() => { setRefreshKey(k => k + 1); setShowEntryForm(false); }} />
          </div>
        ) : (
          <RecentEntries entries={entries} />
        )}
      </div>
    </div>
  );
}
