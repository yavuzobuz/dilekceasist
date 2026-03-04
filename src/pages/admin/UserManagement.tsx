import React, { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import {
    Users, Search, Mail, Calendar, Eye,
    FileText, ChevronLeft, ChevronRight, Loader2, X
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface UserProfile {
    id: string;
    full_name: string | null;
    email: string | null;
    office_name: string | null;
    created_at: string;
    petition_count?: number;
    plan_code?: string | null;
    plan_status?: string | null;
    daily_limit?: number | null;
    used_today?: number;
    remaining_today?: number | null;
    trial_ends_at?: string | null;
}

interface UserPetition {
    id: string;
    title: string;
    petition_type: string;
    created_at: string;
}

// Use empty string for Vite proxy or same-origin deployment.
const API_BASE = '';

const PLAN_LABELS: Record<string, string> = {
    trial: 'Trial',
    pro: 'Pro',
    team: 'Team',
    enterprise: 'Enterprise',
};

export const UserManagement: React.FC = () => {
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalUsers, setTotalUsers] = useState(0);
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
    const [userPetitions, setUserPetitions] = useState<UserPetition[]>([]);
    const [loadingPetitions, setLoadingPetitions] = useState(false);
    const [savingRights, setSavingRights] = useState(false);
    const [rightsForm, setRightsForm] = useState<{
        plan_code: string;
        plan_status: string;
        daily_limit: string;
        reset_today_usage: boolean;
    }>({
        plan_code: 'trial',
        plan_status: 'active',
        daily_limit: '',
        reset_today_usage: false
    });
    const pageSize = 10;

    const getAuthHeaders = async (includeJson = false): Promise<Record<string, string>> => {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.access_token) {
            throw new Error('Admin oturumu bulunamadi');
        }

        return {
            ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
            Authorization: `Bearer ${session.access_token}`
        };
    };

    useEffect(() => {
        loadUsers();
    }, [currentPage, searchQuery]);

    const loadUsers = async () => {
        try {
            setLoading(true);

            // Use admin API endpoint to get users with emails
            const params = new URLSearchParams({
                page: currentPage.toString(),
                pageSize: pageSize.toString(),
                ...(searchQuery && { search: searchQuery })
            });

            const response = await fetch(`${API_BASE}/api/admin-users?${params}`, {
                headers: await getAuthHeaders()
            });

            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    throw new Error('Bu işlem için admin yetkisi gerekli');
                }
                // Fallback to profiles table if API fails
                console.warn('Admin API not available, falling back to profiles');
                await loadUsersFromProfiles();
                return;
            }

            const data = await response.json();
            setUsers(data.users || []);
            setTotalUsers(data.total || 0);

        } catch (error) {
            console.error('Error loading users:', error);
            const message = error instanceof Error ? error.message : 'Kullanıcılar yüklenemedi';

            if (message.includes('admin yetkisi') || message.includes('oturumu')) {
                setUsers([]);
                setTotalUsers(0);
                toast.error(message);
                return;
            }

            // Fallback to profiles
            await loadUsersFromProfiles();
        } finally {
            setLoading(false);
        }
    };

    const loadUsersFromProfiles = async () => {
        try {
            let query = supabase
                .from('profiles')
                .select('id, full_name, created_at', { count: 'exact' });

            if (searchQuery) {
                query = query.ilike('full_name', `%${searchQuery}%`);
            }

            const { data, count, error } = await query
                .range((currentPage - 1) * pageSize, currentPage * pageSize - 1)
                .order('created_at', { ascending: false });

            if (error) throw error;

            const usersWithCounts = await Promise.all(
                (data || []).map(async (user) => {
                    const { count } = await supabase
                        .from('petitions')
                        .select('*', { count: 'exact', head: true })
                        .eq('user_id', user.id);

                    return {
                        ...user,
                        email: null,
                        office_name: null,
                        petition_count: count || 0,
                        plan_code: 'trial',
                        plan_status: 'active',
                        daily_limit: null,
                        used_today: 0,
                        remaining_today: null,
                        trial_ends_at: null,
                    };
                })
            );

            setUsers(usersWithCounts);
            setTotalUsers(count || 0);
        } catch (error) {
            console.error('Fallback error:', error);
            toast.error('Kullanıcılar yüklenemedi');
        }
    };

    const loadUserPetitions = async (userId: string) => {
        setLoadingPetitions(true);
        try {
            const { data, error } = await supabase
                .from('petitions')
                .select('id, title, petition_type, created_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(10);

            if (error) throw error;
            setUserPetitions(data || []);
        } catch (error) {
            console.error('Error loading petitions:', error);
        } finally {
            setLoadingPetitions(false);
        }
    };

    const handleViewUser = (user: UserProfile) => {
        setSelectedUser(user);
        setRightsForm({
            plan_code: String(user.plan_code || 'trial').toLowerCase(),
            plan_status: String(user.plan_status || 'active').toLowerCase(),
            daily_limit: user.daily_limit == null ? '' : String(user.daily_limit),
            reset_today_usage: false
        });
        loadUserPetitions(user.id);
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('tr-TR', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const formatPlanLabel = (planCode?: string | null) => {
        const normalized = String(planCode || 'trial').toLowerCase();
        return PLAN_LABELS[normalized] || normalized.toUpperCase();
    };

    const formatRemainingRights = (user: UserProfile) => {
        if (user.remaining_today == null || user.daily_limit == null) {
            return 'Sınırsız';
        }
        return `${user.remaining_today} / ${user.daily_limit}`;
    };

    const handleSaveUserRights = async () => {
        if (!selectedUser) return;

        try {
            setSavingRights(true);

            if (rightsForm.daily_limit !== '' && (!Number.isFinite(Number(rightsForm.daily_limit)) || Number(rightsForm.daily_limit) <= 0)) {
                toast.error('Günlük limit pozitif bir sayı olmalıdır');
                return;
            }

            const response = await fetch(`${API_BASE}/api/admin-users`, {
                method: 'PATCH',
                headers: await getAuthHeaders(true),
                body: JSON.stringify({
                    userId: selectedUser.id,
                    planCode: rightsForm.plan_code,
                    status: rightsForm.plan_status,
                    dailyLimit: rightsForm.daily_limit === '' ? null : Number(rightsForm.daily_limit),
                    resetTodayUsage: rightsForm.reset_today_usage
                })
            });

            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.error || 'Hak güncellemesi başarısız');
            }

            const summary = payload.summary || {};
            const updatedUser: UserProfile = {
                ...selectedUser,
                plan_code: summary.plan_code || selectedUser.plan_code || 'trial',
                plan_status: summary.status || selectedUser.plan_status || 'active',
                daily_limit: summary.daily_limit ?? null,
                used_today: summary.used_today ?? 0,
                remaining_today: summary.remaining_today ?? null,
                trial_ends_at: summary.trial_ends_at ?? selectedUser.trial_ends_at ?? null
            };

            setUsers(prev => prev.map(item => item.id === selectedUser.id ? { ...item, ...updatedUser } : item));
            setSelectedUser(updatedUser);
            setRightsForm(prev => ({ ...prev, reset_today_usage: false }));
            toast.success('Kullanıcı hakları güncellendi');
        } catch (error) {
            console.error('Rights update error:', error);
            const message = error instanceof Error ? error.message : 'Hak güncellemesi başarısız';
            toast.error(message);
        } finally {
            setSavingRights(false);
        }
    };

    const totalPages = Math.ceil(totalUsers / pageSize);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Kullanıcı Yönetimi</h1>
                    <p className="text-gray-400">Toplam {totalUsers} kullanıcı</p>
                </div>
            </div>

            {/* Search */}
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="İsim veya e-posta ile ara..."
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setCurrentPage(1);
                        }}
                        className="w-full pl-10 pr-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                    />
                </div>
            </div>

            {/* Users Table */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-10 h-10 text-red-500 animate-spin" />
                    </div>
                ) : users.length === 0 ? (
                    <div className="text-center py-16">
                        <Users className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-400">Kullanıcı bulunamadı</p>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-gray-700 bg-gray-700/50">
                                        <th className="text-left px-6 py-4 text-sm font-medium text-gray-300">Kullanıcı</th>
                                        <th className="text-left px-6 py-4 text-sm font-medium text-gray-300">E-posta</th>
                                        <th className="text-left px-6 py-4 text-sm font-medium text-gray-300">Paket</th>
                                        <th className="text-left px-6 py-4 text-sm font-medium text-gray-300">Kalan Hak</th>
                                        <th className="text-left px-6 py-4 text-sm font-medium text-gray-300">Kayıt Tarihi</th>
                                        <th className="text-left px-6 py-4 text-sm font-medium text-gray-300">Dilekçe</th>
                                        <th className="text-right px-6 py-4 text-sm font-medium text-gray-300">İşlemler</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {users.map((user) => (
                                        <tr key={user.id} className="hover:bg-gray-700/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-gradient-to-br from-red-600 to-red-400 rounded-full flex items-center justify-center">
                                                        <span className="text-white font-semibold text-sm">
                                                            {(user.full_name || 'U')[0].toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <p className="text-white font-medium">
                                                            {user.full_name || 'İsimsiz Kullanıcı'}
                                                        </p>
                                                        {user.office_name && (
                                                            <p className="text-sm text-gray-500">{user.office_name}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-gray-300 flex items-center gap-2">
                                                    <Mail className="w-4 h-4 text-gray-500" />
                                                    {user.email || <span className="text-gray-500 italic">Belirtilmemiş</span>}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-sm ${String(user.plan_status || 'active').toLowerCase() === 'active' ? 'bg-emerald-900/30 text-emerald-400' : 'bg-yellow-900/30 text-yellow-300'}`}>
                                                    {formatPlanLabel(user.plan_code)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-900/30 text-indigo-300 rounded text-sm">
                                                    {formatRemainingRights(user)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-gray-300 flex items-center gap-2">
                                                    <Calendar className="w-4 h-4 text-gray-500" />
                                                    {formatDate(user.created_at)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-900/30 text-blue-400 rounded text-sm">
                                                    <FileText className="w-4 h-4" />
                                                    {user.petition_count}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={() => handleViewUser(user)}
                                                    className="p-2 hover:bg-gray-600 rounded-lg text-gray-400 hover:text-white transition-colors"
                                                    title="Detay"
                                                >
                                                    <Eye className="w-5 h-5" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-700">
                                <p className="text-sm text-gray-400">
                                    {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, totalUsers)} / {totalUsers}
                                </p>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="p-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
                                    >
                                        <ChevronLeft className="w-5 h-5" />
                                    </button>
                                    <span className="text-gray-400 px-3">
                                        {currentPage} / {totalPages}
                                    </span>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className="p-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
                                    >
                                        <ChevronRight className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* User Detail Modal */}
            {selectedUser && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-gray-900 rounded-2xl w-full max-w-[38.4rem] max-h-[calc(100vh-2rem)] border border-gray-700 flex flex-col overflow-hidden my-auto">
                        <div className="flex items-center justify-between p-6 border-b border-gray-700">
                            <h2 className="text-xl font-bold text-white">Kullanıcı Detayı</h2>
                            <button onClick={() => setSelectedUser(null)} className="p-2 hover:bg-gray-700 rounded-lg text-gray-400">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto">
                            {/* User Info */}
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-16 h-16 bg-gradient-to-br from-red-600 to-red-400 rounded-full flex items-center justify-center">
                                    <span className="text-white font-bold text-xl">
                                        {(selectedUser.full_name || 'U')[0].toUpperCase()}
                                    </span>
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-white">
                                        {selectedUser.full_name || 'İsimsiz Kullanıcı'}
                                    </h3>
                                    <p className="text-gray-400">{selectedUser.email || 'E-posta belirtilmemiş'}</p>
                                    {selectedUser.office_name && (
                                        <p className="text-sm text-gray-500">{selectedUser.office_name}</p>
                                    )}
                                </div>
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                                <div className="bg-gray-800 rounded-lg p-4">
                                    <p className="text-2xl font-bold text-white">{selectedUser.petition_count}</p>
                                    <p className="text-gray-400 text-sm">Toplam Dilekçe</p>
                                </div>
                                <div className="bg-gray-800 rounded-lg p-4">
                                    <p className="text-sm font-medium text-white">{formatDate(selectedUser.created_at)}</p>
                                    <p className="text-gray-400 text-sm">Kayıt Tarihi</p>
                                </div>
                                <div className="bg-gray-800 rounded-lg p-4">
                                    <p className="text-sm font-medium text-white">{formatPlanLabel(selectedUser.plan_code)}</p>
                                    <p className="text-gray-400 text-sm">Mevcut Paket</p>
                                </div>
                            </div>

                            {/* Plan & Rights Management */}
                            <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 mb-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-semibold text-gray-200">Paket ve Belge Hakkı Tanımla</h4>
                                    <span className="text-xs text-gray-400">Anlık kalan: {formatRemainingRights(selectedUser)}</span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Paket</label>
                                        <select
                                            value={rightsForm.plan_code}
                                            onChange={(event) => setRightsForm(prev => ({ ...prev, plan_code: event.target.value }))}
                                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                                        >
                                            <option value="trial">Trial</option>
                                            <option value="pro">Pro</option>
                                            <option value="team">Team</option>
                                            <option value="enterprise">Enterprise</option>
                                            <option value="custom">Custom</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Durum</label>
                                        <select
                                            value={rightsForm.plan_status}
                                            onChange={(event) => setRightsForm(prev => ({ ...prev, plan_status: event.target.value }))}
                                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                                        >
                                            <option value="active">Aktif</option>
                                            <option value="inactive">Pasif</option>
                                            <option value="suspended">Askıda</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Günlük Limit (boş: sınırsız)</label>
                                        <input
                                            type="number"
                                            min={1}
                                            value={rightsForm.daily_limit}
                                            onChange={(event) => setRightsForm(prev => ({ ...prev, daily_limit: event.target.value }))}
                                            placeholder="örn 10"
                                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                                        />
                                    </div>
                                </div>

                                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={rightsForm.reset_today_usage}
                                        onChange={(event) => setRightsForm(prev => ({ ...prev, reset_today_usage: event.target.checked }))}
                                        className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-red-600"
                                    />
                                    Bugünkü kullanım kaydını sıfırla
                                </label>

                                <button
                                    onClick={handleSaveUserRights}
                                    disabled={savingRights}
                                    className="w-full sm:w-auto px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded-lg text-sm transition-colors"
                                >
                                    {savingRights ? 'Kaydediliyor...' : 'Hakları Güncelle'}
                                </button>
                            </div>

                            {/* Recent Petitions */}
                            <div>
                                <h4 className="text-sm font-medium text-gray-400 mb-2">Son Dilekçeler</h4>
                                {loadingPetitions ? (
                                    <div className="flex justify-center py-4">
                                        <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                                    </div>
                                ) : userPetitions.length > 0 ? (
                                    <div className="space-y-2 max-h-48 overflow-y-auto">
                                        {userPetitions.map(p => (
                                            <div key={p.id} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                                                <div>
                                                    <p className="text-white text-sm truncate max-w-[200px]">{p.title}</p>
                                                    <p className="text-xs text-gray-500">{p.petition_type}</p>
                                                </div>
                                                <span className="text-xs text-gray-500">{formatDate(p.created_at)}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-gray-500 text-sm text-center py-4">Henüz dilekçe yok</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserManagement;

