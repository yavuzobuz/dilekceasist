import React, { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import {
    Users, FileText, BarChart3, TrendingUp, Clock, CheckCircle,
    AlertTriangle, Activity, Calendar, ArrowUpRight
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface DashboardStats {
    totalUsers: number;
    totalPetitions: number;
    totalTemplates: number;
    petitionsThisMonth: number;
    recentUsers: { email: string; created_at: string }[];
    recentPetitions: { title: string; petition_type: string; created_at: string }[];
}

export const AdminDashboard: React.FC = () => {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadDashboardData();
    }, []);

    const loadDashboardData = async () => {
        try {
            setLoading(true);

            // Get user count
            const { count: userCount } = await supabase
                .from('profiles')
                .select('*', { count: 'exact', head: true });

            // Get petition count
            const { count: petitionCount } = await supabase
                .from('petitions')
                .select('*', { count: 'exact', head: true });

            // Get petitions this month
            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);

            const { count: monthlyPetitions } = await supabase
                .from('petitions')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', startOfMonth.toISOString());

            // Get recent users
            const { data: recentUsers } = await supabase
                .from('profiles')
                .select('email:id, created_at')
                .order('created_at', { ascending: false })
                .limit(5);

            // Get recent petitions
            const { data: recentPetitions } = await supabase
                .from('petitions')
                .select('title, petition_type, created_at')
                .order('created_at', { ascending: false })
                .limit(5);

            setStats({
                totalUsers: userCount || 0,
                totalPetitions: petitionCount || 0,
                totalTemplates: 20, // From templates config
                petitionsThisMonth: monthlyPetitions || 0,
                recentUsers: recentUsers || [],
                recentPetitions: recentPetitions || []
            });

        } catch (error) {
            console.error('Dashboard load error:', error);
            toast.error('Dashboard verileri yüklenemedi');
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('tr-TR', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-red-500 border-t-transparent"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-white">Dashboard</h1>
                <p className="text-gray-400">Sistem durumu ve özet bilgiler</p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 hover:border-blue-500/50 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                        <div className="p-2 bg-blue-600/20 rounded-lg">
                            <Users className="w-5 h-5 text-blue-400" />
                        </div>
                        <TrendingUp className="w-4 h-4 text-green-400" />
                    </div>
                    <p className="text-3xl font-bold text-white">{stats?.totalUsers || 0}</p>
                    <p className="text-gray-400 text-sm">Toplam Kullanıcı</p>
                </div>

                <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 hover:border-green-500/50 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                        <div className="p-2 bg-green-600/20 rounded-lg">
                            <FileText className="w-5 h-5 text-green-400" />
                        </div>
                        <ArrowUpRight className="w-4 h-4 text-green-400" />
                    </div>
                    <p className="text-3xl font-bold text-white">{stats?.totalPetitions || 0}</p>
                    <p className="text-gray-400 text-sm">Toplam Dilekçe</p>
                </div>

                <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 hover:border-purple-500/50 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                        <div className="p-2 bg-purple-600/20 rounded-lg">
                            <BarChart3 className="w-5 h-5 text-purple-400" />
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-white">{stats?.petitionsThisMonth || 0}</p>
                    <p className="text-gray-400 text-sm">Bu Ay Dilekçe</p>
                </div>

                <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 hover:border-yellow-500/50 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                        <div className="p-2 bg-yellow-600/20 rounded-lg">
                            <Activity className="w-5 h-5 text-yellow-400" />
                        </div>
                        <CheckCircle className="w-4 h-4 text-green-400" />
                    </div>
                    <p className="text-3xl font-bold text-white">{stats?.totalTemplates || 0}</p>
                    <p className="text-gray-400 text-sm">Aktif Şablon</p>
                </div>
            </div>

            {/* Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Petitions */}
                <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
                        <h2 className="font-semibold text-white flex items-center gap-2">
                            <FileText className="w-5 h-5 text-red-500" />
                            Son Dilekçeler
                        </h2>
                    </div>
                    <div className="divide-y divide-gray-700">
                        {stats?.recentPetitions?.length ? (
                            stats.recentPetitions.map((petition, index) => (
                                <div key={index} className="px-5 py-3 hover:bg-gray-700/50 transition-colors">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-white font-medium truncate max-w-[200px]">
                                                {petition.title}
                                            </p>
                                            <p className="text-sm text-gray-500">{petition.petition_type}</p>
                                        </div>
                                        <span className="text-xs text-gray-500 flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {formatDate(petition.created_at)}
                                        </span>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="px-5 py-8 text-center text-gray-500">
                                <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
                                Henüz dilekçe yok
                            </div>
                        )}
                    </div>
                </div>

                {/* System Status */}
                <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-700">
                        <h2 className="font-semibold text-white flex items-center gap-2">
                            <Activity className="w-5 h-5 text-green-500" />
                            Sistem Durumu
                        </h2>
                    </div>
                    <div className="p-5 space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-gray-400">API Durumu</span>
                            <span className="flex items-center gap-2 text-green-400">
                                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                                Aktif
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-gray-400">Veritabanı</span>
                            <span className="flex items-center gap-2 text-green-400">
                                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                                Bağlı
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-gray-400">Harç Tarifeleri</span>
                            <span className="text-gray-300">2025.1</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-gray-400">AAÜT Versiyonu</span>
                            <span className="text-gray-300">2025-2026</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-gray-400">Son Güncelleme</span>
                            <span className="text-gray-300 flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                {new Date().toLocaleDateString('tr-TR')}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
                <h2 className="font-semibold text-white mb-4">Hızlı İşlemler</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <a href="/admin/templates" className="flex flex-col items-center p-4 bg-gray-700/50 hover:bg-gray-700 rounded-lg transition-colors text-center">
                        <FileText className="w-6 h-6 text-red-400 mb-2" />
                        <span className="text-sm text-gray-300">Şablon Ekle</span>
                    </a>
                    <a href="/admin/tariffs" className="flex flex-col items-center p-4 bg-gray-700/50 hover:bg-gray-700 rounded-lg transition-colors text-center">
                        <TrendingUp className="w-6 h-6 text-blue-400 mb-2" />
                        <span className="text-sm text-gray-300">Tarifeleri Güncelle</span>
                    </a>
                    <a href="/admin/users" className="flex flex-col items-center p-4 bg-gray-700/50 hover:bg-gray-700 rounded-lg transition-colors text-center">
                        <Users className="w-6 h-6 text-green-400 mb-2" />
                        <span className="text-sm text-gray-300">Kullanıcılar</span>
                    </a>
                    <a href="/admin/analytics" className="flex flex-col items-center p-4 bg-gray-700/50 hover:bg-gray-700 rounded-lg transition-colors text-center">
                        <BarChart3 className="w-6 h-6 text-purple-400 mb-2" />
                        <span className="text-sm text-gray-300">Raporlar</span>
                    </a>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
