'use server'

import fs from 'fs'
import path from 'path'

const DB_PATH = 'c:\\Users\\Savarona\\Documents\\hal\\hal-app\\data\\entries.json'
// Hardcoded absolute path to prevent CWD resolution issues during dev
const BACKUP_HTML_PATH = 'c:\\Users\\Savarona\\Documents\\Hal Takip.html'

const DRIVE_URL = "https://script.google.com/macros/s/AKfycbzEW49QpT17jE2K-AryYIfXp98-i1WdZbR0gK5thfWNZ06bpqHfbjfvY7B0F76zoQUd/exec";

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
    if (month >= 11) {
        return `${year}/${year + 1}`;
    } else {
        return `${year - 1}/${year}`;
    }
}

export async function syncFromCloud() {
    try {
        const response = await fetch(DRIVE_URL, { cache: 'no-store' });
        const data = await response.json();

        if (Array.isArray(data)) {
            // Map Cloud Data (Array) to Local Schema
            // Cloud: [id, date, kilo, ?, net, received, ...] (Based on HTML analysis)
            // HTML line 112: r[0]=id, r[1]=date, r[2]=kilo, r[4]=net, r[5]=received

            const cloudEntries = data.map((r: any) => {
                // The Sheet likely returns an array of objects or arrays. 
                // HTML code uses Object.values(x) which implies x is an object {id:..., date:...} or similar.
                // Let's assume the API returns array of objects like the HTML implies.
                // Actually HTML lines: const r = Object.values(x);
                // If the Google Script returns array of objects, Object.values transforms them to array. 
                // We should try to be robust. 

                // If the response is already arrays? 
                // Let's trust the HTML logic: Object.values(x) suggests x is an object.
                const vals = typeof r === 'object' ? Object.values(r) : r;

                // Mapping based on HTML:
                // r[0]: id
                // r[1]: date
                // r[2]: kilo
                // r[3]: ? (maybe product?)
                // r[4]: net
                // r[5]: received

                // We need to map this to our local schema:
                // { id, date, product, supplier, quantity, price, netAmount, ... }

                // Since we miss 'Supplier' and 'Product' in these columns (based on HTML usage), 
                // we will have to provide defaults or try to infer.
                // The HTML doesn't show where Supplier name comes from in the cloud columns. 
                // Wait, let's look at HTML again. 

                return {
                    id: String(vals[0]),
                    date: String(vals[1]).split('T')[0], // Clean date
                    product: "Genel Ürün", // Default as Sheet might not have it or it's in a different col
                    supplier: "Bulut Kaydı",
                    quantity: parseFloat(vals[2] as string) || 0,
                    price: 0, // Calculated?
                    grossAmount: 0,
                    netAmount: parseFloat(vals[4] as string) || 0,
                    received: parseFloat(vals[5] as string) || 0,
                    commission: 0,
                    labor: 0,
                    transport: 0,
                    stopaj: 0,
                    rusum: 0
                }
            }).filter(e => e.quantity > 0 || e.netAmount > 0);

            // Rewrite local DB with cloud data (Master source)
            fs.writeFileSync(DB_PATH, JSON.stringify(cloudEntries, null, 2))
            return { success: true, count: cloudEntries.length }
        }
        return { success: false, error: "Invalid data format" }
    } catch (error) {
        console.error("Cloud Sync Error:", error)
        return { success: false, error: "Connection Failed" }
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

    // 3. Post to Cloud
    try {
        await fetch(DRIVE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: newEntry.id,
                cin: newEntry.date,
                nights: newEntry.quantity, // Mapping Quantity->nights
                net: newEntry.netAmount,
                received: newEntry.received || 0
            })
        })
    } catch (e) {
        console.error("Cloud Post Error", e)
    }

    return { success: true, entry: newEntry }
}
