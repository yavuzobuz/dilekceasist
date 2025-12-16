import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Shield, Loader2 } from 'lucide-react';

// Admin emails that are allowed to access admin panel
const ADMIN_EMAILS = ['kibrit74@gmail.com'];

interface AdminGuardProps {
    children: React.ReactNode;
}

export const AdminGuard: React.FC<AdminGuardProps> = ({ children }) => {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 text-red-500 animate-spin mx-auto mb-4" />
                    <p className="text-gray-400">Yetki kontrol ediliyor...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    const isAdmin = ADMIN_EMAILS.includes(user.email || '');

    if (!isAdmin) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
                <div className="bg-gray-800 rounded-2xl p-8 max-w-md text-center border border-gray-700">
                    <div className="w-16 h-16 bg-red-600/20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Shield className="w-8 h-8 text-red-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Erişim Reddedildi</h1>
                    <p className="text-gray-400 mb-6">
                        Bu sayfaya erişim yetkiniz bulunmamaktadır.
                        Admin paneline sadece yetkili kullanıcılar erişebilir.
                    </p>
                    <a
                        href="/"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                    >
                        Ana Sayfaya Dön
                    </a>
                </div>
            </div>
        );
    }

    return <>{children}</>;
};

export default AdminGuard;
