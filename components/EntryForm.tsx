"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { saveEntry } from "@/app/actions"

export default function EntryForm({ onEntryResult }: { onEntryResult?: (entry: any) => void }) {
    // Set default date to today YYYY-MM-DD
    const [formData, setFormData] = React.useState({
        date: new Date().toISOString().split('T')[0],
        product: "",
        supplier: "",
        quantity: "", // Kg
        price: "",
        commissionRate: "10", // %
        laborCost: "", // Hamaliye
        transportCost: "", // Nakliye
    })
    const [loading, setLoading] = React.useState(false)

    // Calculations
    const quantity = parseFloat(formData.quantity) || 0
    const price = parseFloat(formData.price) || 0
    const grossAmount = quantity * price

    const commission = (grossAmount * (parseFloat(formData.commissionRate) || 0)) / 100
    const labor = parseFloat(formData.laborCost) || 0
    const transport = parseFloat(formData.transportCost) || 0
    const stopaj = grossAmount * 0.02 // 2%
    const rusum = grossAmount * 0.01 // 1%

    const totalDeductions = commission + labor + transport + stopaj + rusum
    const netAmount = grossAmount - totalDeductions

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value })
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            const result = await saveEntry({
                ...formData,
                quantity,
                price,
                grossAmount,
                commission,
                labor,
                transport,
                stopaj,
                rusum,
                netAmount,
                received: 0 // Default 0 for backup compatibility
            })

            // Reset form (keep supplier/date maybe? Resetting quantity/product usually better)
            setFormData(prev => ({
                ...prev,
                quantity: "",
                price: "",
                product: "" // Keep supplier maybe?
            }))

            alert("Kayıt Başarılı! (Bulut'a gönderiliyor...)");
            if (onEntryResult && result.success) onEntryResult(result.entry);
        } catch (error) {
            console.error(error)
            alert("Hata oluştu!")
        } finally {
            setLoading(false)
        }
    }

    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle>Yeni Mal Girişi</CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Tarih</label>
                            <Input type="date" name="date" value={formData.date} onChange={handleChange} required />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Müstahsil Adı</label>
                            <Input name="supplier" placeholder="Örn: Ahmet Yılmaz" value={formData.supplier} onChange={handleChange} required />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Ürün Cinsi</label>
                            <Input name="product" placeholder="Örn: Domates" value={formData.product} onChange={handleChange} required />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Miktar (Kg)</label>
                            <Input type="number" name="quantity" placeholder="0" value={formData.quantity} onChange={handleChange} required />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Birim Fiyat (₺)</label>
                            <Input type="number" name="price" placeholder="0.00" value={formData.price} onChange={handleChange} step="0.01" required />
                        </div>
                    </div>

                    <div className="p-4 bg-muted rounded-lg space-y-4">
                        <h4 className="font-semibold text-sm">Kesintiler</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                                <label className="text-xs text-muted-foreground">Komisyon (%)</label>
                                <Input type="number" name="commissionRate" value={formData.commissionRate} onChange={handleChange} />
                            </div>
                            <div>
                                <label className="text-xs text-muted-foreground">Hamaliye</label>
                                <Input type="number" name="laborCost" value={formData.laborCost} onChange={handleChange} placeholder="0" />
                            </div>
                            <div>
                                <label className="text-xs text-muted-foreground">Nakliye</label>
                                <Input type="number" name="transportCost" value={formData.transportCost} onChange={handleChange} placeholder="0" />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
                        <div>
                            <div className="text-sm text-muted-foreground">Brüt Tutar</div>
                            <div className="text-lg font-bold">{grossAmount.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-sm text-muted-foreground">Net Ele Geçen</div>
                            <div className="text-xl font-bold text-primary">{netAmount.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}</div>
                        </div>
                    </div>

                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? "Kaydediliyor..." : "Kaydet"}
                    </Button>
                </form>
            </CardContent>
        </Card>
    )
}
