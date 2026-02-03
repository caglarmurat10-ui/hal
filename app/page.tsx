"use client"
import EntryForm from "@/components/EntryForm";
import RecentEntries from "@/components/RecentEntries";
import { getEntries, syncFromCloud } from "@/app/actions";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

const DRIVE_URL = "https://script.google.com/macros/s/AKfycbzEW49QpT17jE2K-AryYIfXp98-i1WdZbR0gK5thfWNZ06bpqHfbjfvY7B0F76zoQUd/exec";

export default function Home() {
  const [entries, setEntries] = useState<any[]>([]);
  const [stats, setStats] = useState({ net: 0, received: 0, debt: 0 });
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0); // Kept for EntryForm re-fetches if needed

  // Function to calculate stats from an array of entries
  const calculateStats = (data: any[]) => {
    const net = data.reduce((acc: number, curr: any) => acc + (parseFloat(curr.netAmount) || 0), 0);
    const received = data.reduce((acc: number, curr: any) => acc + (parseFloat(curr.received) || 0), 0);
    setStats({
      net,
      received,
      debt: net - received
    });
  };

  // Initial Load & Refresh from Server (for local saving workflow)
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
    try {
      // Use Server Action Proxy (bypasses CORS & Google Bot Detection)
      const result = await syncFromCloud();

      if (result.success && result.data) {
        setEntries(result.data);
        calculateStats(result.data);
        alert(`Bulut verileri başarıyla indirildi. Toplam ${result.count || 0} kayıt.`);
      } else {
        alert("Hata: " + (result.error || "Bilinmeyen hata"));
      }
    } catch (error) {
      console.error(error);
      alert("Bağlantı hatası.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="max-w-md mx-auto sm:max-w-2xl md:max-w-5xl">
      {/* Header Card */}
      <div className="glass-card p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <h1 className="text-2xl font-bold text-emerald-400 tracking-tight">Hal Satış <span className="text-white">Takip</span></h1>
          <div onClick={handleCloudSync} className="cursor-pointer flex items-center gap-2">
            <p className={`text-[10px] font-bold uppercase tracking-widest italic ${syncing ? 'text-blue-400 animate-pulse' : 'text-emerald-500 hover:text-emerald-400'}`}>
              {syncing ? 'GÜNCELLENİYOR...' : 'BULUT AKTİF ☁'}
            </p>
          </div>
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
            <EntryForm onEntryResult={() => { setRefreshKey(k => k + 1); setShowEntryForm(false); }} />
          </div>
        ) : (
          <RecentEntries entries={entries} />
        )}
      </div>
    </div>
  );
}
