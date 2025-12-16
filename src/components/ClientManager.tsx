import React, { useState, useEffect, useRef } from 'react';
import { Users, Plus, Search, Trash2, Building2, User, X, Check, Loader2, FileText, Upload } from 'lucide-react';
import { Client } from '../types';
import { clientService } from '../services/clientService';
import toast from 'react-hot-toast';

interface ClientManagerProps {
    onSelect?: (client: Client) => void;
    onClose: () => void;
    mode?: 'manage' | 'select'; // 'manage' for just editing, 'select' for picking a client
}

export const ClientManager: React.FC<ClientManagerProps> = ({ onSelect, onClose, mode = 'manage' }) => {
    const [clients, setClients] = useState<Client[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    // New Client Form State
    const [newClientType, setNewClientType] = useState<'INDIVIDUAL' | 'CORPORATE'>('INDIVIDUAL');
    const [newClientNames, setNewClientNames] = useState({ firstName: '', lastName: '', fullName: '' }); // For Individual vs Corporate
    const [newClientData, setNewClientData] = useState({
        tc_vk_no: '',
        address: '',
        phone: '',
        email: ''
    });
    const [vekaletPdf, setVekaletPdf] = useState<File | null>(null);
    const [isDraggingPdf, setIsDraggingPdf] = useState(false);
    const [isUploadingPdf, setIsUploadingPdf] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const pdfInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadClients();
    }, []);

    const loadClients = async () => {
        setIsLoading(true);
        try {
            const data = await clientService.getClients();
            setClients(data);
        } catch (error) {
            console.error('Error loading clients:', error);
            toast.error('Müvekkiller yüklenirken hata oluştu');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddClient = async () => {
        // Validation
        const name = newClientType === 'INDIVIDUAL'
            ? `${newClientNames.firstName} ${newClientNames.lastName}`.trim()
            : newClientNames.fullName.trim();

        if (!name) {
            toast.error('İsim/Ünvan zorunludur');
            return;
        }

        setIsSaving(true);
        try {
            const client = await clientService.addClient({
                type: newClientType,
                name,
                ...newClientData
            });

            // Upload PDF if provided
            if (vekaletPdf) {
                setIsUploadingPdf(true);
                try {
                    await clientService.uploadVekaletPdf(client.id, vekaletPdf);
                    client.vekalet_pdf_url = 'uploaded'; // Mark as having PDF
                } catch (pdfError) {
                    console.error('PDF upload error:', pdfError);
                    toast.error('Vekaletname yüklenirken hata oluştu');
                } finally {
                    setIsUploadingPdf(false);
                }
            }

            setClients([...clients, client]);
            setIsAdding(false);
            setNewClientNames({ firstName: '', lastName: '', fullName: '' });
            setNewClientData({ tc_vk_no: '', address: '', phone: '', email: '' });
            setVekaletPdf(null);
            toast.success('Müvekkil eklendi');

            if (mode === 'select' && onSelect) {
                onSelect(client);
            }
        } catch (error) {
            console.error('Error adding client:', error);
            toast.error('Müvekkil eklenirken hata oluştu');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteClient = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm('Bu müvekkili silmek istediğinize emin misiniz?')) return;

        try {
            await clientService.deleteClient(id);
            setClients(clients.filter(c => c.id !== id));
            toast.success('Müvekkil silindi');
        } catch (error) {
            console.error('Error deleting client:', error);
            toast.error('Silme işlemi başarısız');
        }
    };

    const filteredClients = clients.filter(client =>
        client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        client.tc_vk_no?.includes(searchQuery)
    );

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-gray-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[90vh] flex flex-col border-t sm:border border-gray-700 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-700">
                    <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                        <Users className="w-5 h-5 text-red-500" />
                        {isAdding ? 'Yeni Müvekkil Ekle' : (mode === 'select' ? 'Müvekkil Seç' : 'Müvekkil Yönetimi')}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                    {isAdding ? (
                        <div className="space-y-4">
                            {/* Type Selection */}
                            <div className="flex bg-gray-800 p-1 rounded-lg mb-6">
                                <button
                                    onClick={() => setNewClientType('INDIVIDUAL')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md transition-all ${newClientType === 'INDIVIDUAL' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                                        }`}
                                >
                                    <User className="w-4 h-4" /> Bireysel
                                </button>
                                <button
                                    onClick={() => setNewClientType('CORPORATE')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md transition-all ${newClientType === 'CORPORATE' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                                        }`}
                                >
                                    <Building2 className="w-4 h-4" /> Kurumsal
                                </button>
                            </div>

                            {newClientType === 'INDIVIDUAL' ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-sm font-medium text-gray-300">Ad</label>
                                        <input
                                            type="text"
                                            value={newClientNames.firstName}
                                            onChange={(e) => setNewClientNames({ ...newClientNames, firstName: e.target.value })}
                                            className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-red-500 focus:outline-none"
                                            placeholder="Örn: Ahmet"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-sm font-medium text-gray-300">Soyad</label>
                                        <input
                                            type="text"
                                            value={newClientNames.lastName}
                                            onChange={(e) => setNewClientNames({ ...newClientNames, lastName: e.target.value })}
                                            className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-red-500 focus:outline-none"
                                            placeholder="Örn: Yılmaz"
                                        />
                                    </div>
                                    <div className="sm:col-span-2 space-y-1">
                                        <label className="text-sm font-medium text-gray-300">TC Kimlik No</label>
                                        <input
                                            type="text"
                                            value={newClientData.tc_vk_no}
                                            onChange={(e) => setNewClientData({ ...newClientData, tc_vk_no: e.target.value })}
                                            maxLength={11}
                                            className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-red-500 focus:outline-none"
                                            placeholder="11 haneli TC no"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <label className="text-sm font-medium text-gray-300">Şirket Ünvanı</label>
                                        <input
                                            type="text"
                                            value={newClientNames.fullName}
                                            onChange={(e) => setNewClientNames({ ...newClientNames, fullName: e.target.value })}
                                            className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-red-500 focus:outline-none"
                                            placeholder="Örn: ABC A.Ş."
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-sm font-medium text-gray-300">Vergi Kimlik No</label>
                                        <input
                                            type="text"
                                            value={newClientData.tc_vk_no}
                                            onChange={(e) => setNewClientData({ ...newClientData, tc_vk_no: e.target.value })}
                                            className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-red-500 focus:outline-none"
                                            placeholder="Vergi No"
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="space-y-1">
                                <label className="text-sm font-medium text-gray-300">Adres</label>
                                <textarea
                                    value={newClientData.address}
                                    onChange={(e) => setNewClientData({ ...newClientData, address: e.target.value })}
                                    rows={3}
                                    className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-red-500 focus:outline-none"
                                    placeholder="Tam adres..."
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-gray-300">Telefon (Opsiyonel)</label>
                                    <input
                                        type="tel"
                                        value={newClientData.phone}
                                        onChange={(e) => setNewClientData({ ...newClientData, phone: e.target.value })}
                                        className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-red-500 focus:outline-none"
                                        placeholder="05..."
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-gray-300">E-posta (Opsiyonel)</label>
                                    <input
                                        type="email"
                                        value={newClientData.email}
                                        onChange={(e) => setNewClientData({ ...newClientData, email: e.target.value })}
                                        className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-red-500 focus:outline-none"
                                        placeholder="ornek@email.com"
                                    />
                                </div>
                            </div>

                            {/* Vekaletname PDF Upload */}
                            <div className="space-y-1">
                                <label className="text-sm font-medium text-gray-300">Vekaletname (PDF)</label>
                                <input
                                    ref={pdfInputRef}
                                    type="file"
                                    accept=".pdf"
                                    onChange={(e) => {
                                        if (e.target.files && e.target.files[0]) {
                                            const file = e.target.files[0];
                                            if (file.type !== 'application/pdf') {
                                                toast.error('Lütfen sadece PDF dosyası yükleyin');
                                                return;
                                            }
                                            if (file.size > 10 * 1024 * 1024) {
                                                toast.error('Dosya boyutu 10MB\'ı aşamaz');
                                                return;
                                            }
                                            setVekaletPdf(file);
                                        }
                                    }}
                                    className="hidden"
                                />
                                <div
                                    onClick={() => pdfInputRef.current?.click()}
                                    onDragOver={(e) => { e.preventDefault(); setIsDraggingPdf(true); }}
                                    onDragLeave={() => setIsDraggingPdf(false)}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        setIsDraggingPdf(false);
                                        const file = e.dataTransfer.files[0];
                                        if (file) {
                                            if (file.type !== 'application/pdf') {
                                                toast.error('Lütfen sadece PDF dosyası yükleyin');
                                                return;
                                            }
                                            if (file.size > 10 * 1024 * 1024) {
                                                toast.error('Dosya boyutu 10MB\'ı aşamaz');
                                                return;
                                            }
                                            setVekaletPdf(file);
                                        }
                                    }}
                                    className={`w-full p-4 border-2 border-dashed rounded-lg cursor-pointer transition-all text-center ${isDraggingPdf
                                        ? 'border-red-500 bg-red-900/20'
                                        : vekaletPdf
                                            ? 'border-green-500 bg-green-900/20'
                                            : 'border-gray-600 bg-gray-800 hover:border-gray-500'
                                        }`}
                                >
                                    {vekaletPdf ? (
                                        <div className="flex items-center justify-center gap-2 text-green-400">
                                            <FileText className="w-5 h-5" />
                                            <span className="text-sm">{vekaletPdf.name}</span>
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); setVekaletPdf(null); }}
                                                className="ml-2 p-1 hover:bg-gray-700 rounded"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-2 text-gray-400">
                                            <Upload className="w-6 h-6" />
                                            <span className="text-sm">PDF sürükleyin veya tıklayın</span>
                                            <span className="text-xs text-gray-500">Maks. 10MB</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Toolbar */}
                            <div className="flex gap-3 mb-6">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Müvekkil ara..."
                                        className="w-full pl-9 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-red-500 focus:outline-none"
                                    />
                                </div>
                                <button
                                    onClick={() => setIsAdding(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors whitespace-nowrap"
                                >
                                    <Plus className="w-4 h-4" /> Yeni Ekle
                                </button>
                            </div>

                            {/* List */}
                            {isLoading ? (
                                <div className="flex justify-center py-10">
                                    <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
                                </div>
                            ) : filteredClients.length === 0 ? (
                                <div className="text-center py-10 text-gray-500">
                                    Kayıtlı müvekkil bulunamadı.
                                </div>
                            ) : (
                                <div className="grid gap-3">
                                    {filteredClients.map((client) => (
                                        <div
                                            key={client.id}
                                            onClick={() => mode === 'select' && onSelect ? onSelect(client) : null}
                                            className={`flex items-center justify-between p-4 rounded-xl border border-gray-700 transition-all ${mode === 'select'
                                                ? 'bg-gray-800/50 hover:border-red-500 cursor-pointer'
                                                : 'bg-gray-800'
                                                }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-lg ${client.type === 'CORPORATE' ? 'bg-blue-900/30 text-blue-400' : 'bg-green-900/30 text-green-400'}`}>
                                                    {client.type === 'CORPORATE' ? <Building2 className="w-5 h-5" /> : <User className="w-5 h-5" />}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="font-medium text-white">{client.name}</h3>
                                                        {client.vekalet_pdf_url && (
                                                            <span title="Vekaletname mevcut" className="text-red-400">
                                                                <FileText className="w-4 h-4" />
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-gray-400">
                                                        {client.type === 'CORPORATE' ? 'VKN:' : 'TC:'} {client.tc_vk_no || '-'}
                                                    </p>
                                                </div>
                                            </div>

                                            <button
                                                onClick={(e) => handleDeleteClient(client.id, e)}
                                                className="p-2 hover:bg-red-900/30 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
                                                title="Sil"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                {isAdding && (
                    <div className="p-4 sm:p-6 border-t border-gray-700 flex gap-2 sm:gap-3">
                        <button
                            onClick={() => setIsAdding(false)}
                            className="flex-1 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
                        >
                            İptal
                        </button>
                        <button
                            onClick={handleAddClient}
                            disabled={isSaving}
                            className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                            {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                            Kaydet
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
