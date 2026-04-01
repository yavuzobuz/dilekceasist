import React from 'react';
import { Scale, Upload, Search } from 'lucide-react';
import { Header } from '../../components/Header';
import EmsalPanel from '../components/EmsalPanel';

export default function EmsalAraPage() {
    return (
        <div className="min-h-screen bg-[#0a0c10] text-white">
            <Header />
            <div className="mx-auto max-w-7xl px-4 pb-12 pt-10 sm:px-6 lg:px-8">
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-8">
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                        <div className="max-w-3xl">
                            <div className="inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-red-200">
                                <Scale className="h-3.5 w-3.5" />
                                Hibrit Emsal Arama
                            </div>
                            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                                Belge yükleyip doğrudan karar arayabilirsiniz
                            </h1>
                            <p className="mt-3 max-w-2xl text-sm leading-7 text-gray-400 sm:text-base">
                                Alt-app mantığıyla çalışır. Metin yazın veya PDF/Word yükleyin; sistem belgeyi analiz edip
                                aynı hibrit karar arama hattı üzerinden sonuçları getirir.
                            </p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[360px]">
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                                    <Upload className="h-4 w-4 text-red-300" />
                                    Belge Yükle
                                </div>
                                <p className="mt-2 text-xs leading-6 text-gray-400">
                                    PDF ve Word dosyaları desteklenir.
                                </p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                                    <Search className="h-4 w-4 text-red-300" />
                                    Karar Ara
                                </div>
                                <p className="mt-2 text-xs leading-6 text-gray-400">
                                    Belgeyle veya düz metinle aynı ekranda arama yapın.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-8">
                    <EmsalPanel />
                </div>
            </div>
        </div>
    );
}
