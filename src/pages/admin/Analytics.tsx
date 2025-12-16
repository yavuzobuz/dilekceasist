import React, { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import {
    BarChart3, TrendingUp, Users, FileText, Calendar,
    ArrowUpRight, ArrowDownRight, Loader2
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface AnalyticsData {
    dailyPetitions: { date: string; count: number }[];
    petitionTypes: { type: string; count: number }[];
    monthlyUsers: { month: string; count: number }[];
    totalStats: {
        users: number;
        petitions: number;
        avgPerUser: number;
        growthRate: number;
    };
}

export const Analytics: React.FC = () => {
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');

    useEffect(() => {
        loadAnalytics();
    }, [period]);

    const loadAnalytics = async () => {
        try {
            setLoading(true);

            // Get total counts
            const { count: userCount } = await supabase
                .from('profiles')
                .select('*', { count: 'exact', head: true });

            const { count: petitionCount } = await supabase
                .from('petitions')
                .select('*', { count: 'exact', head: true });

            // Get petition types distribution
            const { data: petitions } = await supabase
                .from('petitions')
                .select('petition_type');

            const typeDistribution: Record<string, number> = {};
            petitions?.forEach(p => {
                typeDistribution[p.petition_type] = (typeDistribution[p.petition_type] || 0) + 1;
            });

            const petitionTypes = Object.entries(typeDistribution)
                .map(([type, count]) => ({ type, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 5);

            setData({
                dailyPetitions: [],
                petitionTypes,
                monthlyUsers: [],
                totalStats: {
                    users: userCount || 0,
                    petitions: petitionCount || 0,
                    avgPerUser: userCount ? Math.round((petitionCount || 0) / userCount * 10) / 10 : 0,
                    growthRate: 12.5 // Demo value
                }
            });

        } catch (error) {
            console.error('Analytics error:', error);
            toast.error('İstatistikler yüklenemedi');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-10 h-10 text-red-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">İstatistikler</h1>
                    <p className="text-gray-400">Sistem kullanım verileri</p>
                </div>
                <div className="flex items-center gap-2 bg-gray-800 p-1 rounded-lg">
                    {(['week', 'month', 'year'] as const).map(p => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`px-4 py-2 rounded-md text-sm transition-colors ${period === p ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            {p === 'week' ? 'Hafta' : p === 'month' ? 'Ay' : 'Yıl'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                        <div className="p-2 bg-blue-600/20 rounded-lg">
                            <Users className="w-5 h-5 text-blue-400" />
                        </div>
                        <span className="flex items-center text-green-400 text-sm">
                            <ArrowUpRight className="w-4 h-4" />
                            {data?.totalStats.growthRate}%
                        </span>
                    </div>
                    <p className="text-3xl font-bold text-white">{data?.totalStats.users}</p>
                    <p className="text-gray-400 text-sm">Toplam Kullanıcı</p>
                </div>

                <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                        <div className="p-2 bg-green-600/20 rounded-lg">
                            <FileText className="w-5 h-5 text-green-400" />
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-white">{data?.totalStats.petitions}</p>
                    <p className="text-gray-400 text-sm">Toplam Dilekçe</p>
                </div>

                <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                        <div className="p-2 bg-purple-600/20 rounded-lg">
                            <BarChart3 className="w-5 h-5 text-purple-400" />
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-white">{data?.totalStats.avgPerUser}</p>
                    <p className="text-gray-400 text-sm">Ortalama Dilekçe/Kullanıcı</p>
                </div>

                <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                        <div className="p-2 bg-yellow-600/20 rounded-lg">
                            <TrendingUp className="w-5 h-5 text-yellow-400" />
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-white">20+</p>
                    <p className="text-gray-400 text-sm">Aktif Şablon</p>
                </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Petition Types Distribution */}
                <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Dilekçe Türleri Dağılımı</h3>
                    <div className="space-y-3">
                        {data?.petitionTypes.map((item, index) => {
                            const maxCount = Math.max(...(data?.petitionTypes.map(t => t.count) || [1]));
                            const percentage = (item.count / maxCount) * 100;
                            return (
                                <div key={index}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-gray-300 text-sm">{item.type}</span>
                                        <span className="text-gray-400 text-sm">{item.count}</span>
                                    </div>
                                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-red-600 to-red-400 rounded-full transition-all duration-500"
                                            style={{ width: `${percentage}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                        {(!data?.petitionTypes || data.petitionTypes.length === 0) && (
                            <p className="text-gray-500 text-center py-8">Henüz veri yok</p>
                        )}
                    </div>
                </div>

                {/* Usage Trend Chart */}
                <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Kullanım Trendi (Son 7 Gün)</h3>
                    <div className="h-48 flex items-end justify-between gap-2 px-2">
                        {(() => {
                            // Generate demo data for last 7 days
                            const days = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
                            const values = [3, 5, 2, 8, 6, 4, 7];
                            const maxVal = Math.max(...values);

                            return days.map((day, index) => {
                                const height = (values[index] / maxVal) * 100;
                                return (
                                    <div key={day} className="flex-1 flex flex-col items-center gap-2">
                                        <div className="w-full flex flex-col items-center justify-end h-36">
                                            <span className="text-xs text-gray-400 mb-1">{values[index]}</span>
                                            <div
                                                className="w-full max-w-[40px] bg-gradient-to-t from-red-600 to-red-400 rounded-t-lg transition-all duration-500 hover:from-red-500 hover:to-red-300"
                                                style={{ height: `${height}%`, minHeight: '8px' }}
                                            />
                                        </div>
                                        <span className="text-xs text-gray-500">{day}</span>
                                    </div>
                                );
                            });
                        })()}
                    </div>
                    <p className="text-xs text-gray-500 text-center mt-4">Günlük oluşturulan dilekçe sayısı</p>
                </div>
            </div>
        </div>
    );
};

export default Analytics;
