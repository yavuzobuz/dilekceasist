import React, { useState, useEffect, useRef } from 'react';
import {
    FileText, Search, Filter, RefreshCw, Download, Trash2,
    AlertCircle, AlertTriangle, Info, CheckCircle, Clock, ChevronDown
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface LogEntry {
    id: string;
    timestamp: string;
    level: 'info' | 'warning' | 'error' | 'success';
    source: string;
    message: string;
    details?: string;
}

const generateDemoLogs = (): LogEntry[] => {
    const sources = ['API', 'Auth', 'Gemini', 'Supabase', 'Server', 'WebSearch'];
    const levels: LogEntry['level'][] = ['info', 'warning', 'error', 'success'];
    const messages = {
        info: [
            'Kullanıcı giriş yaptı',
            'Dilekçe oluşturuldu',
            'Şablon yüklendi',
            'API isteği tamamlandı',
            'Oturum yenilendi'
        ],
        warning: [
            'Yavaş API yanıtı',
            'Rate limit yaklaşıyor',
            'Bellek kullanımı yüksek',
            'Timeout süresi aşıldı'
        ],
        error: [
            'Veritabanı bağlantı hatası',
            'API isteği başarısız',
            'Geçersiz token',
            'Dosya yükleme hatası'
        ],
        success: [
            'Yedekleme tamamlandı',
            'E-posta gönderildi',
            'Tarife güncellendi',
            'Cache temizlendi'
        ]
    };

    const logs: LogEntry[] = [];
    const now = Date.now();

    for (let i = 0; i < 50; i++) {
        const level = levels[Math.floor(Math.random() * (i < 5 ? 4 : i < 15 ? 3 : 2))];
        const levelMessages = messages[level];
        logs.push({
            id: `log-${i}`,
            timestamp: new Date(now - i * 60000 * Math.random() * 10).toISOString(),
            level,
            source: sources[Math.floor(Math.random() * sources.length)],
            message: levelMessages[Math.floor(Math.random() * levelMessages.length)],
            details: Math.random() > 0.7 ? `Request ID: ${Math.random().toString(36).substr(2, 9)}` : undefined
        });
    }

    return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

const levelConfig = {
    info: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-900/20' },
    warning: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-900/20' },
    error: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-900/20' },
    success: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-900/20' }
};

export const SystemLogs: React.FC = () => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [levelFilter, setLevelFilter] = useState<string>('all');
    const [sourceFilter, setSourceFilter] = useState<string>('all');
    const logContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadLogs();
    }, []);

    useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(() => {
            addNewLog();
        }, 5000);
        return () => clearInterval(interval);
    }, [autoRefresh, logs]);

    const loadLogs = async () => {
        setLoading(true);
        await new Promise(resolve => setTimeout(resolve, 500));
        setLogs(generateDemoLogs());
        setLoading(false);
    };

    const addNewLog = () => {
        const levels: LogEntry['level'][] = ['info', 'info', 'info', 'warning', 'success'];
        const level = levels[Math.floor(Math.random() * levels.length)];
        const sources = ['API', 'Auth', 'Server'];

        const newLog: LogEntry = {
            id: `log-${Date.now()}`,
            timestamp: new Date().toISOString(),
            level,
            source: sources[Math.floor(Math.random() * sources.length)],
            message: level === 'info' ? 'API isteği tamamlandı' : level === 'warning' ? 'Yavaş yanıt' : 'İşlem başarılı',
        };

        setLogs(prev => [newLog, ...prev.slice(0, 99)]);
    };

    const handleClearLogs = () => {
        if (!window.confirm('Tüm logları temizlemek istediğinize emin misiniz?')) return;
        setLogs([]);
        toast.success('Loglar temizlendi');
    };

    const handleExport = () => {
        const content = logs.map(l =>
            `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.source}] ${l.message}${l.details ? ` - ${l.details}` : ''}`
        ).join('\n');

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `system-logs-${new Date().toISOString().split('T')[0]}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Loglar indirildi');
    };

    const filteredLogs = logs.filter(log => {
        const matchesSearch = log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
            log.source.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesLevel = levelFilter === 'all' || log.level === levelFilter;
        const matchesSource = sourceFilter === 'all' || log.source === sourceFilter;
        return matchesSearch && matchesLevel && matchesSource;
    });

    const sources = [...new Set(logs.map(l => l.source))];

    const formatTime = (timestamp: string) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const formatDate = (timestamp: string) => {
        const date = new Date(timestamp);
        return date.toLocaleDateString('tr-TR');
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Sistem Logları</h1>
                    <p className="text-gray-400">
                        {filteredLogs.length} kayıt
                        {autoRefresh && <span className="ml-2 text-green-400">• Canlı</span>}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${autoRefresh ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'
                            }`}
                    >
                        <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
                        Otomatik
                    </button>
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        İndir
                    </button>
                    <button
                        onClick={handleClearLogs}
                        className="flex items-center gap-2 px-3 py-2 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white rounded-lg transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                        Temizle
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Log ara..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                        />
                    </div>
                    <select
                        value={levelFilter}
                        onChange={(e) => setLevelFilter(e.target.value)}
                        className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-red-500"
                    >
                        <option value="all">Tüm Seviyeler</option>
                        <option value="info">Info</option>
                        <option value="warning">Warning</option>
                        <option value="error">Error</option>
                        <option value="success">Success</option>
                    </select>
                    <select
                        value={sourceFilter}
                        onChange={(e) => setSourceFilter(e.target.value)}
                        className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-red-500"
                    >
                        <option value="all">Tüm Kaynaklar</option>
                        {sources.map(s => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Logs */}
            <div
                ref={logContainerRef}
                className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden"
            >
                <div className="max-h-[500px] overflow-y-auto font-mono text-sm">
                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <RefreshCw className="w-8 h-8 text-red-500 animate-spin" />
                        </div>
                    ) : filteredLogs.length === 0 ? (
                        <div className="text-center py-16 text-gray-500">
                            <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                            <p>Log bulunamadı</p>
                        </div>
                    ) : (
                        <table className="w-full">
                            <thead className="sticky top-0 bg-gray-800">
                                <tr className="text-left text-xs text-gray-400 uppercase">
                                    <th className="px-4 py-3 w-24">Zaman</th>
                                    <th className="px-4 py-3 w-20">Seviye</th>
                                    <th className="px-4 py-3 w-24">Kaynak</th>
                                    <th className="px-4 py-3">Mesaj</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {filteredLogs.map((log) => {
                                    const config = levelConfig[log.level];
                                    const Icon = config.icon;
                                    return (
                                        <tr key={log.id} className={`${config.bg} hover:bg-gray-800 transition-colors`}>
                                            <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                                                <div>{formatTime(log.timestamp)}</div>
                                                <div className="text-xs opacity-70">{formatDate(log.timestamp)}</div>
                                            </td>
                                            <td className="px-4 py-2">
                                                <span className={`flex items-center gap-1 ${config.color}`}>
                                                    <Icon className="w-4 h-4" />
                                                    <span className="uppercase text-xs">{log.level}</span>
                                                </span>
                                            </td>
                                            <td className="px-4 py-2">
                                                <span className="px-2 py-0.5 bg-gray-700 rounded text-gray-300 text-xs">
                                                    {log.source}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2 text-gray-300">
                                                {log.message}
                                                {log.details && (
                                                    <span className="text-gray-500 ml-2 text-xs">{log.details}</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {(['info', 'warning', 'error', 'success'] as const).map(level => {
                    const config = levelConfig[level];
                    const count = logs.filter(l => l.level === level).length;
                    const Icon = config.icon;
                    return (
                        <div key={level} className={`${config.bg} rounded-xl p-4 border border-gray-700`}>
                            <div className="flex items-center gap-2 mb-1">
                                <Icon className={`w-4 h-4 ${config.color}`} />
                                <span className={`text-sm ${config.color} uppercase`}>{level}</span>
                            </div>
                            <p className="text-2xl font-bold text-white">{count}</p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default SystemLogs;
