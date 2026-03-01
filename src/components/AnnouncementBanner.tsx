import React, { useEffect, useState } from 'react';
import { X, Bell, AlertTriangle, CheckCircle, Info, AlertCircle } from 'lucide-react';

interface Announcement {
    id: string;
    title: string;
    content: string;
    type: 'info' | 'warning' | 'success' | 'error';
    is_active: boolean;
    show_on_login: boolean;
}

const typeConfig = {
    info: {
        bg: 'bg-blue-600',
        icon: Info,
        border: 'border-blue-500'
    },
    warning: {
        bg: 'bg-yellow-600',
        icon: AlertTriangle,
        border: 'border-yellow-500'
    },
    success: {
        bg: 'bg-green-600',
        icon: CheckCircle,
        border: 'border-green-500'
    },
    error: {
        bg: 'bg-red-600',
        icon: AlertCircle,
        border: 'border-red-500'
    }
};

// API_BASE is empty to use the Vite proxy (e.g., fetch('/api/announcements'))
const API_BASE = '';

interface AnnouncementBannerProps {
    position?: 'top' | 'bottom';
}

export const AnnouncementBanner: React.FC<AnnouncementBannerProps> = ({ position = 'top' }) => {
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Load dismissed announcements from localStorage
        const dismissedIds = localStorage.getItem('dismissed_announcements');
        if (dismissedIds) {
            try {
                setDismissed(new Set(JSON.parse(dismissedIds)));
            } catch (e) {
                // Ignore parse errors
            }
        }

        // Fetch active announcements from API
        fetchAnnouncements();
    }, []);

    const fetchAnnouncements = async () => {
        try {
            const response = await fetch(`${API_BASE}/api/announcements?active=true`);
            if (response.ok) {
                const data = await response.json();
                setAnnouncements(data.announcements || []);
            }
        } catch (error) {
            console.error('Failed to fetch announcements:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDismiss = (id: string) => {
        const newDismissed = new Set(dismissed);
        newDismissed.add(id);
        setDismissed(newDismissed);
        localStorage.setItem('dismissed_announcements', JSON.stringify([...newDismissed]));
    };

    const visibleAnnouncements = announcements.filter(a => !dismissed.has(a.id));

    if (loading || visibleAnnouncements.length === 0) return null;

    return (
        <div className={`w-full ${position === 'top' ? 'z-40' : ''}`}>
            {visibleAnnouncements.map(announcement => {
                const config = typeConfig[announcement.type] || typeConfig.info;
                const Icon = config.icon;

                return (
                    <div
                        key={announcement.id}
                        className={`${config.bg} text-white px-4 py-3`}
                    >
                        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <Icon className="w-5 h-5 flex-shrink-0" />
                                <div>
                                    <span className="font-semibold">{announcement.title}</span>
                                    <span className="mx-2">—</span>
                                    <span className="opacity-90">{announcement.content}</span>
                                </div>
                            </div>
                            <button
                                onClick={() => handleDismiss(announcement.id)}
                                className="p-1 hover:bg-white/20 rounded-lg transition-colors flex-shrink-0"
                                title="Kapat"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

// Modal version for login page announcements
interface AnnouncementModalProps {
    onClose: () => void;
}

export const AnnouncementModal: React.FC<AnnouncementModalProps> = ({ onClose }) => {
    const [announcements, setAnnouncements] = useState<Announcement[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check if already shown in this session
        const shownThisSession = sessionStorage.getItem('announcements_shown');
        if (shownThisSession) {
            onClose();
            return;
        }

        // Fetch login announcements from API
        const fetchAnnouncements = async () => {
            try {
                const response = await fetch(`${API_BASE}/api/announcements?active=true`);
                if (response.ok) {
                    const data = await response.json();
                    // Filter for login page announcements
                    const loginAnnouncements = (data.announcements || []).filter(
                        (a: Announcement) => a.show_on_login
                    );
                    setAnnouncements(loginAnnouncements);

                    if (loginAnnouncements.length > 0) {
                        sessionStorage.setItem('announcements_shown', 'true');
                    } else {
                        onClose();
                    }
                } else {
                    onClose();
                }
            } catch (error) {
                console.error('Failed to fetch announcements:', error);
                onClose();
            } finally {
                setLoading(false);
            }
        };

        fetchAnnouncements();
    }, [onClose]);

    if (loading || announcements.length === 0) {
        return null;
    }

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-2xl w-full max-w-md border border-gray-700 overflow-hidden">
                <div className="flex items-center justify-between p-4 bg-red-600">
                    <div className="flex items-center gap-2">
                        <Bell className="w-5 h-5" />
                        <h2 className="text-lg font-semibold">Duyurular</h2>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                    {announcements.map(announcement => {
                        const config = typeConfig[announcement.type] || typeConfig.info;
                        const Icon = config.icon;

                        return (
                            <div
                                key={announcement.id}
                                className={`p-4 rounded-lg border ${config.border} bg-gray-800`}
                            >
                                <div className="flex items-start gap-3">
                                    <div className={`p-2 ${config.bg} rounded-lg`}>
                                        <Icon className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-white mb-1">
                                            {announcement.title}
                                        </h3>
                                        <p className="text-gray-300 text-sm">
                                            {announcement.content}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="p-4 border-t border-gray-700">
                    <button
                        onClick={onClose}
                        className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                    >
                        Anladım
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AnnouncementBanner;
