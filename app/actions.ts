'use server'

import fs from 'fs'
import path from 'path'

const DB_PATH = 'c:\\Users\\Savarona\\Documents\\hal\\hal-app\\data\\entries.json'
// Hardcoded absolute path to prevent CWD resolution issues during dev
const BACKUP_HTML_PATH = 'c:\\Users\\Savarona\\Documents\\Hal Takip.html'

const DRIVE_URL = "https://script.google.com/macros/s/AKfycbyWyF1E8cpJGbQ1Bscsbt3b5sCtH-iZWbPoUC5dKuDGfR0qiMbT_RPCE68nlu6x8iak/exec";

export async function getEntries() {
    if (!fs.existsSync(DB_PATH)) {
        return []
    }
    const data = fs.readFileSync(DB_PATH, 'utf-8')
    try {
        return JSON.parse(data)
    } catch {
        return []
    }
}

function getSeason(dateStr: string) {
    const d = new Date(dateStr);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    if (month >= 9) {
        return `${year}/${year + 1}`;
    } else {
        return `${year - 1}/${year}`;
    }
}

export async function syncFromCloud() {
    try {
        // Server-Side Proxy with Browser Masquerading
        const response = await fetch(DRIVE_URL, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
                "Referer": "https://script.google.com/"
            },
            cache: 'no-store'
        });

        const contentType = response.headers.get("content-type");
        const text = await response.text();

        // Check if response is HTML (Bot Detection / Auth Page)
        if (contentType && contentType.includes("text/html")) {
            // Extract Page Title or Body to define error
            const match = text.match(/<title>(.*?)<\/title>/i) || text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
            const errorContent = match ? match[1].substring(0, 100).replace(/<[^>]*>?/gm, "") : text.substring(0, 100);
            console.error("Google Script HTML Response:", errorContent);
            return { success: false, error: "Google Sunucu Yanıtı (HTML): " + errorContent.trim() };
        }

        try {
            const data = JSON.parse(text);

            if (Array.isArray(data)) {
                // Map Cloud Data (V6.1 Object-Based)
                const cloudEntries = data.map((x: any) => {
                    return {
                        id: String(x.id),
                        date: String(x.date).split('T')[0],
                        product: "Genel Ürün",
                        supplier: "Bulut Kaydı",
                        quantity: parseFloat(x.kilo) || 0,
                        price: 0,
                        grossAmount: 0,
                        netAmount: parseFloat(x.net) || 0,
                        received: parseFloat(x.received) || 0,
                        commission: 0,
                        labor: 0,
                        transport: 0,
                        stopaj: 0,
                        rusum: 0
                    }
                }).filter((e: any) => (parseFloat(e.quantity) > 0 || parseFloat(e.netAmount) > 0 || parseFloat(e.received) > 0)); // Keeping logic loose to show data

                // Save to local disk (Optional/Fails on Vercel)
                try {
                    fs.writeFileSync(DB_PATH, JSON.stringify(cloudEntries, null, 2))
                } catch (e) { }

                return { success: true, count: cloudEntries.length, data: cloudEntries }
            }
            return { success: false, error: "Beklenmeyen Veri Formatı (Dizi değil)" }

        } catch (jsonError) {
            return { success: false, error: "JSON Ayrıştırma Hatası: " + text.substring(0, 50) }
        }

    } catch (error: any) {
        console.error("Cloud Sync Error:", error)
        return { success: false, error: "Sunucu Bağlantı Hatası: " + (error.message || "") }
    }
}

// ... (existing code)

export async function saveCloudData(cloudEntries: any[]) {
    try {
        // Overwrite local JSON
        fs.writeFileSync(DB_PATH, JSON.stringify(cloudEntries, null, 2));

        // Sync HTML Backup
        if (fs.existsSync(BACKUP_HTML_PATH)) {
            try {
                let htmlContent = fs.readFileSync(BACKUP_HTML_PATH, 'utf-8')
                const htmlEntries = cloudEntries.map((e: any) => ({
                    id: parseInt(e.id) || Date.now(),
                    date: e.date,
                    season: getSeason(e.date),
                    kilo: parseFloat(e.quantity) || 0,
                    net: parseFloat(e.netAmount) || 0,
                    received: parseFloat(e.received) || 0
                }))
                const injection = `let entries = ${JSON.stringify(htmlEntries)}; localStorage.setItem('hal_data_v5', JSON.stringify(entries));`
                const regex = /let entries = .*?;/
                if (regex.test(htmlContent)) {
                    htmlContent = htmlContent.replace(regex, injection)
                    fs.writeFileSync(BACKUP_HTML_PATH, htmlContent, 'utf-8')
                }
            } catch (e) {
                console.error("HTML Backup Error", e)
            }
        }
        return { success: true }
    } catch (error) {
        console.error("Save Cloud Data Error", error);
        return { success: false, error: "Failed to save data" };
    }
}

export async function saveEntry(formData: any) {
    // ... (existing saveEntry code)
    const entries = await getEntries()

    const newEntry = {
        id: Date.now().toString(),
        ...formData,
    }

    entries.push(newEntry)

    // 1. Save to JSON DB
    fs.writeFileSync(DB_PATH, JSON.stringify(entries, null, 2))

    // 2. Sync to HTML Backup
    if (fs.existsSync(BACKUP_HTML_PATH)) {
        try {
            let htmlContent = fs.readFileSync(BACKUP_HTML_PATH, 'utf-8')
            const htmlEntries = entries.map((e: any) => ({
                id: parseInt(e.id) || Date.now(),
                date: e.date,
                season: getSeason(e.date),
                kilo: parseFloat(e.quantity) || 0,
                net: parseFloat(e.netAmount) || 0,
                received: parseFloat(e.received) || 0
            }))
            const injection = `let entries = ${JSON.stringify(htmlEntries)}; localStorage.setItem('hal_data_v5', JSON.stringify(entries));`
            const regex = /let entries = .*?;/
            if (regex.test(htmlContent)) {
                htmlContent = htmlContent.replace(regex, injection)
                fs.writeFileSync(BACKUP_HTML_PATH, htmlContent, 'utf-8')
            }
        } catch (e) {
            console.error("HTML Backup Error", e)
        }
    }

    // 3. Post to Cloud (REMOVED: Done Client-Side to avoid Bot Detection)
    // Client (page.tsx) handles this via syncEntry()

    return { success: true, entry: newEntry }
}
