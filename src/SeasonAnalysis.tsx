import type { Sale } from "./types";
import "./season-analysis.css";

type Props = {
  sales: Sale[];
  seasons: string[];
  seasonFilter: string;
  onSelectSeason: (season: string) => void;
};

type Metrics = {
  net: number;
  kilo: number;
  avgPrice: number;
  received: number;
  collectionRate: number;
  saleCount: number;
};

function calc(items: Sale[]): Metrics {
  const net = items.reduce((sum, sale) => sum + sale.net, 0);
  const kilo = items.reduce((sum, sale) => sum + sale.kilo, 0);
  const gross = items.reduce((sum, sale) => sum + sale.gross, 0);
  const received = items.reduce((sum, sale) => sum + sale.received, 0);
  return {
    net,
    kilo,
    avgPrice: kilo ? gross / kilo : 0,
    received,
    collectionRate: net ? (received / net) * 100 : 0,
    saleCount: items.length
  };
}

function percentChange(current: number, previous: number) {
  if (Math.abs(previous) < 0.0001) return current > 0 ? null : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function money(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function number(value: number, digits = 0) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: digits }).format(value || 0);
}

function Delta({ current, previous, invert = false, suffix = "%" }: { current: number; previous: number; invert?: boolean; suffix?: string }) {
  const delta = percentChange(current, previous);
  if (delta === null) return <span className="analysis-delta neutral">Yeni veri</span>;
  const improved = invert ? delta <= 0 : delta >= 0;
  const arrow = delta > 0.05 ? "↑" : delta < -0.05 ? "↓" : "→";
  return <span className={`analysis-delta ${Math.abs(delta) < 0.05 ? "neutral" : improved ? "up" : "down"}`}>{arrow} %{number(Math.abs(delta), 1)}{suffix === "%" ? "" : suffix}</span>;
}

export default function SeasonAnalysis({ sales, seasons, seasonFilter, onSelectSeason }: Props) {
  if (!seasons.length) return null;

  const currentSeason = seasonFilter !== "all" && seasons.includes(seasonFilter) ? seasonFilter : seasons[0];
  const currentIndex = seasons.indexOf(currentSeason);
  const previousSeason = currentIndex >= 0 ? seasons[currentIndex + 1] : undefined;
  const current = calc(sales.filter(sale => sale.season === currentSeason));
  const previous = previousSeason ? calc(sales.filter(sale => sale.season === previousSeason)) : null;

  if (!previousSeason || !previous) {
    return (
      <section className="analysis-panel analysis-empty">
        <div>
          <small>SEZON ANALİZİ</small>
          <h2>{currentSeason}</h2>
          <p>Önceki sezon verisi oluştuğunda kıyaslama otomatik burada görünecek.</p>
        </div>
      </section>
    );
  }

  const netDelta = percentChange(current.net, previous.net);
  const kgDelta = percentChange(current.kilo, previous.kilo);
  const priceDelta = percentChange(current.avgPrice, previous.avgPrice);
  const collectionPointDelta = current.collectionRate - previous.collectionRate;

  const summaryParts = [
    netDelta === null ? "Net ciro için önceki baz yok" : `net ciro %${number(Math.abs(netDelta), 1)} ${netDelta >= 0 ? "yukarıda" : "aşağıda"}`,
    kgDelta === null ? "kilo için önceki baz yok" : `satış kilosu %${number(Math.abs(kgDelta), 1)} ${kgDelta >= 0 ? "yukarıda" : "aşağıda"}`,
    priceDelta === null ? "fiyat için önceki baz yok" : `ortalama fiyat %${number(Math.abs(priceDelta), 1)} ${priceDelta >= 0 ? "yukarıda" : "aşağıda"}`
  ];

  return (
    <section className="analysis-panel">
      <div className="analysis-head">
        <div>
          <small>SEZON ANALİZİ</small>
          <h2>{currentSeason} <span>vs {previousSeason}</span></h2>
          <p>{summaryParts.join(" · ")}</p>
        </div>
        <div className="analysis-switcher">
          <label htmlFor="analysis-season">Karşılaştırılan sezon</label>
          <select id="analysis-season" value={currentSeason} onChange={event => onSelectSeason(event.target.value)}>
            {seasons.slice(0, -1).map(season => <option key={season} value={season}>{season}</option>)}
          </select>
        </div>
      </div>

      <div className="analysis-grid">
        <article>
          <span>Net Ciro</span>
          <strong>{money(current.net)}</strong>
          <div><small>{previousSeason}: {money(previous.net)}</small><Delta current={current.net} previous={previous.net} /></div>
        </article>
        <article>
          <span>Toplam Kilo</span>
          <strong>{number(current.kilo, 1)} kg</strong>
          <div><small>{previousSeason}: {number(previous.kilo, 1)} kg</small><Delta current={current.kilo} previous={previous.kilo} /></div>
        </article>
        <article>
          <span>Ort. Brüt Fiyat</span>
          <strong>{money(current.avgPrice)}/kg</strong>
          <div><small>{previousSeason}: {money(previous.avgPrice)}/kg</small><Delta current={current.avgPrice} previous={previous.avgPrice} /></div>
        </article>
        <article>
          <span>Tahsilat</span>
          <strong>{money(current.received)}</strong>
          <div><small>{previousSeason}: {money(previous.received)}</small><Delta current={current.received} previous={previous.received} /></div>
        </article>
        <article>
          <span>Tahsilat Oranı</span>
          <strong>%{number(current.collectionRate, 1)}</strong>
          <div><small>{previousSeason}: %{number(previous.collectionRate, 1)}</small><span className={`analysis-delta ${Math.abs(collectionPointDelta) < 0.05 ? "neutral" : collectionPointDelta > 0 ? "up" : "down"}`}>{collectionPointDelta > 0.05 ? "↑" : collectionPointDelta < -0.05 ? "↓" : "→"} {number(Math.abs(collectionPointDelta), 1)} puan</span></div>
        </article>
        <article>
          <span>Satış Kaydı</span>
          <strong>{current.saleCount}</strong>
          <div><small>{previousSeason}: {previous.saleCount}</small><Delta current={current.saleCount} previous={previous.saleCount} /></div>
        </article>
      </div>
    </section>
  );
}
