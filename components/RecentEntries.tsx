"use client"

import { useEffect, useState } from "react"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { getEntries } from "@/app/actions"

interface RecentEntriesProps {
    entries: any[];
    onDelete?: (id: string) => void;
    onEdit?: (id: string) => void;
}

export default function RecentEntries({ entries, onDelete, onEdit }: RecentEntriesProps) {
    // Component now depends on parent state, simplifying logic and fixing Vercel sync issue by using client-side data directly.
    const data = entries || [];

    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle>Son Hareketler</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow className="border-b border-white/5 hover:bg-transparent">
                            <TableHead className="text-[9px] uppercase tracking-wider text-slate-500 font-bold p-4">Tarih</TableHead>
                            <TableHead className="text-[9px] uppercase tracking-wider text-slate-500 font-bold p-4">Ürün / Miktar</TableHead>
                            <TableHead className="text-[9px] uppercase tracking-wider text-slate-500 font-bold p-4">Net / Kalan</TableHead>
                            <TableHead className="text-[9px] uppercase tracking-wider text-slate-500 font-bold p-4 text-center">İşlem</TableHead>
                        </TableRow>
                    </TableHeader>
                    <tbody className="divide-y divide-white/5 italic">
                        {data.length === 0 && (
                            <TableRow className="hover:bg-transparent">
                                <TableCell colSpan={4} className="text-center text-slate-500 p-8">
                                    Kayıt bulunamadı.
                                </TableCell>
                            </TableRow>
                        )}
                        {[...data].reverse().slice(0, 50).map((item) => (
                            <tr key={item.id} className="hover:bg-white/5 transition-colors">
                                <td className="p-4 text-[11px] text-slate-300">
                                    <b>{new Date(item.date).toLocaleDateString('tr-TR')}</b>
                                    <br />
                                    <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[9px] font-bold border border-emerald-500/20 bg-emerald-500/10 text-emerald-500">
                                        {new Date(item.date).getMonth() > 9 ? new Date(item.date).getFullYear() + "/" + (new Date(item.date).getFullYear() + 1) : (new Date(item.date).getFullYear() - 1) + "/" + new Date(item.date).getFullYear()}
                                    </span>
                                </td>
                                <td className="p-4 text-xs font-semibold text-white">
                                    {item.quantity} kg
                                    <div className="text-[10px] text-slate-400 font-normal">{item.product}</div>
                                </td>
                                <td className="p-4">
                                    <div className="font-bold text-emerald-400 text-xs">{(parseFloat(item.netAmount) || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}</div>
                                    <div className="text-[9px] text-rose-400">Kalan: {((parseFloat(item.netAmount) || 0) - (parseFloat(item.received) || 0)).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}</div>
                                </td>
                                <td className="p-4 text-center">
                                    <button
                                        onClick={() => onEdit && onEdit(item.id)}
                                        className="text-blue-400 hover:text-blue-300 mr-2"
                                    >
                                        ✎
                                    </button>
                                    <button
                                        onClick={() => onDelete && onDelete(item.id)}
                                        className="text-rose-500 hover:text-rose-400 text-lg opacity-100 px-2"
                                        title="Sil"
                                    >
                                        🗑️
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </Table>
            </CardContent>
        </Card>
    )
}
