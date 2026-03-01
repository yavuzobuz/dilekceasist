import React, { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import {
    Users, Search, Filter, Mail, Calendar, MoreVertical, Eye,
    User, Building2, FileText, ChevronLeft, ChevronRight, Loader2, X
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface UserProfile {
    id: string;
    full_name: string | null;
    email: string | null;
    office_name: string | null;
    created_at: string;
    petition_count?: number;
}

interface UserPetition {
    id: string;
    title: string;
    petition_type: string;
    created_at: string;
}

// Use empty string for Vite proxy or same-origin deployment.
const API_BASE = '';

export const UserManagement: React.FC = () => {
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalUsers, setTotalUsers] = useState(0);
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
    const [userPetitions, setUserPetitions] = useState<UserPetition[]>([]);
    const [loadingPetitions, setLoadingPetitions] = useState(false);
    const pageSize = 10;

    useEffect(() => {
        loadUsers();
    }, [currentPage, searchQuery]);

    const loadUsers = async () => {
        try {
            setLoading(true);
            const { data: { session } } = await supabase.auth.getSession();

            if (!session?.access_token) {
                throw new Error('Admin oturumu bulunamadı');
            }

            // Use admin API endpoint to get users with emails
            const params = new URLSearchParams({
                page: currentPage.toString(),
                pageSize: pageSize.toString(),
                ...(searchQuery && { search: searchQuery })
            });

            const response = await fetch(`${API_BASE}/api/admin-users?${params}`, {
                headers: {
                    Authorization: `Bearer ${session.access_token}`
                }
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
                        petition_count: count || 0
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
        loadUserPetitions(user.id);
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('tr-TR', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
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
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-900 rounded-2xl w-full max-w-lg border border-gray-700">
                        <div className="flex items-center justify-between p-6 border-b border-gray-700">
                            <h2 className="text-xl font-bold text-white">Kullanıcı Detayı</h2>
                            <button onClick={() => setSelectedUser(null)} className="p-2 hover:bg-gray-700 rounded-lg text-gray-400">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6">
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
                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div className="bg-gray-800 rounded-lg p-4">
                                    <p className="text-2xl font-bold text-white">{selectedUser.petition_count}</p>
                                    <p className="text-gray-400 text-sm">Toplam Dilekçe</p>
                                </div>
                                <div className="bg-gray-800 rounded-lg p-4">
                                    <p className="text-sm font-medium text-white">{formatDate(selectedUser.created_at)}</p>
                                    <p className="text-gray-400 text-sm">Kayıt Tarihi</p>
                                </div>
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

