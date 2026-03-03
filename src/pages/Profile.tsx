import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, Petition } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import {
  User, Users, FileText, Calendar, Trash2, Eye, LogOut, ArrowLeft, Share2,
  Plus, TrendingUp, Clock, CheckCircle, AlertCircle, Settings,
  Download, Filter, Search, BarChart3, Briefcase, Edit3, Upload, Image, Save, X, Calculator,
  Building2, Phone, Mail, MapPin, ExternalLink, Loader2
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { ShareModal } from '../components/ShareModal';
import { Footer } from '../../components/Footer';
import { ClientManager } from '../components/ClientManager';
import { Client } from '../types';
import { clientService } from '../services/clientService';
import { FeeCalculator } from '../components/FeeCalculator';
import { LaborReceivablesCalculator } from '../components/LaborReceivablesCalculator';
import { Briefcase as BriefcaseIcon } from 'lucide-react';

interface UserPlanSummary {
  user_id: string;
  plan_code: string;
  status: string;
  daily_limit: number | null;
  used_today: number;
  remaining_today: number | null;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
}

const PLAN_LABELS: Record<string, string> = {
  trial: 'Trial',
  pro: 'Pro',
  team: 'Team',
  enterprise: 'Enterprise',
};

const getPlanLabel = (planCode?: string | null): string => {
  const normalized = String(planCode || 'trial').toLowerCase();
  return PLAN_LABELS[normalized] || normalized.toUpperCase();
};

const Profile: React.FC = () => {
  const { user, profile, signOut, updateProfile } = useAuth();
  const [petitions, setPetitions] = useState<Petition[]>([]);
  const [loading, setLoading] = useState(true);
  const [planSummary, setPlanSummary] = useState<UserPlanSummary | null>(null);
  const [loadingPlanSummary, setLoadingPlanSummary] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [selectedPetition, setSelectedPetition] = useState<Petition | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'petitions' | 'clients' | 'statistics' | 'settings' | 'calculator' | 'labor'>('petitions');
  const navigate = useNavigate();

  // Office branding state
  const [officeLogoUrl, setOfficeLogoUrl] = useState<string | null>(profile?.office_logo_url || null);
  const [corporateHeader, setCorporateHeader] = useState<string>(profile?.corporate_header || '');
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isSavingBranding, setIsSavingBranding] = useState(false);
  const [displayName, setDisplayName] = useState<string>(profile?.full_name || '');
  const [isSavingDisplayName, setIsSavingDisplayName] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isCancellingSubscription, setIsCancellingSubscription] = useState(false);

  // Sync office branding state when profile loads
  useEffect(() => {
    if (profile) {
      setOfficeLogoUrl(profile.office_logo_url || null);
      setCorporateHeader(profile.corporate_header || '');
      setDisplayName(profile.full_name || '');
    } else {
      setDisplayName('');
    }
  }, [profile]);

  // Clients state
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [clientFilterType, setClientFilterType] = useState<'ALL' | 'INDIVIDUAL' | 'CORPORATE'>('ALL');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showClientManager, setShowClientManager] = useState(false);
  const [isLoadingPdfUrl, setIsLoadingPdfUrl] = useState(false);

  // Client editing state
  const [isEditingClient, setIsEditingClient] = useState(false);
  const [editClientData, setEditClientData] = useState<{
    name: string;
    tc_vk_no: string;
    address: string;
    phone: string;
    email: string;
  }>({ name: '', tc_vk_no: '', address: '', phone: '', email: '' });
  const [isSavingClient, setIsSavingClient] = useState(false);
  const [editVekaletPdf, setEditVekaletPdf] = useState<File | null>(null);
  const [removeExistingVekaletPdf, setRemoveExistingVekaletPdf] = useState(false);
  const editVekaletInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      loadPetitions();
      loadPlanSummary();
    } else {
      setPlanSummary(null);
    }
  }, [user?.id]);

  const loadPlanSummary = async () => {
    if (!user) return;

    try {
      setLoadingPlanSummary(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const authHeaders = {
        Authorization: `Bearer ${session.access_token}`
      };

      // Prefer dedicated endpoint; fallback keeps compatibility with environments
      // where plan summary is exposed via /api/admin-users?action=plan-summary.
      let response = await fetch('/api/user-plan-summary', { headers: authHeaders });
      if (!response.ok) {
        response = await fetch('/api/admin-users?action=plan-summary', { headers: authHeaders });
      }
      if (!response.ok) {
        throw new Error('Plan bilgisi alinamadi');
      }

      const data = await response.json();
      setPlanSummary(data.summary || null);
    } catch (error) {
      console.error('Error loading plan summary:', error);
      setPlanSummary(null);
    } finally {
      setLoadingPlanSummary(false);
    }
  };

  const loadPetitions = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('petitions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPetitions(data || []);
    } catch (error) {
      console.error('Error loading petitions:', error);
      toast.error('Dilekçeler yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const loadClients = async () => {
    setClientsLoading(true);
    try {
      const data = await clientService.getClients();
      setClients(data);
    } catch (error) {
      console.error('Error loading clients:', error);
      toast.error('Müvekkiller yüklenirken hata oluştu');
    } finally {
      setClientsLoading(false);
    }
  };

  // Load clients when switching to clients tab
  useEffect(() => {
    if (activeTab === 'clients' && clients.length === 0) {
      loadClients();
    }
  }, [activeTab]);

  // Statistics calculations
  const statistics = useMemo(() => {
    const total = petitions.length;
    const thisMonth = petitions.filter(p => {
      const date = new Date(p.created_at);
      const now = new Date();
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }).length;

    const completed = petitions.filter(p => p.status === 'completed').length;
    const drafts = petitions.filter(p => p.status === 'draft').length;

    const typeBreakdown = petitions.reduce((acc, p) => {
      acc[p.petition_type] = (acc[p.petition_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return { total, thisMonth, completed, drafts, typeBreakdown };
  }, [petitions]);

  // Filtered petitions
  const filteredPetitions = useMemo(() => {
    return petitions.filter(p => {
      const matchesType = filterType === 'all' || p.petition_type === filterType;
      const matchesSearch = searchQuery === '' ||
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.content?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [petitions, filterType, searchQuery]);

  // Get unique petition types for filter
  const petitionTypes = useMemo(() => {
    return [...new Set(petitions.map(p => p.petition_type))];
  }, [petitions]);

  // Filtered clients
  const filteredClients = useMemo(() => {
    return clients.filter(client => {
      const matchesSearch =
        client.name.toLowerCase().includes(clientSearchQuery.toLowerCase()) ||
        client.tc_vk_no?.includes(clientSearchQuery) ||
        client.email?.toLowerCase().includes(clientSearchQuery.toLowerCase());

      const matchesType = clientFilterType === 'ALL' || client.type === clientFilterType;

      return matchesSearch && matchesType;
    });
  }, [clients, clientSearchQuery, clientFilterType]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Bu dilekçeyi silmek istediğinizden emin misiniz?')) {
      return;
    }

    try {
      const { error } = await supabase.from('petitions').delete().eq('id', id);

      if (error) throw error;

      setPetitions(petitions.filter((p) => p.id !== id));
      toast.success('Dilekçe silindi');
    } catch (error) {
      console.error('Error deleting petition:', error);
      toast.error('Dilekçe silinirken hata oluştu');
    }
  };

  const handleView = (petition: Petition) => {
    navigate('/app', { state: { petition } });
  };

  const handleShare = (petition: Petition) => {
    setSelectedPetition(petition);
    setShareModalOpen(true);
  };

  const handleShareSuccess = () => {
    toast.success('Dilekçe başarıyla paylaşıldı! 🎉');
    setShareModalOpen(false);
    setSelectedPetition(null);
  };

  const handleUpdateDisplayName = async () => {
    if (!user) return;

    const normalizedName = displayName.trim();
    if (!normalizedName) {
      toast.error('Ad Soyad alani bos olamaz');
      return;
    }

    setIsSavingDisplayName(true);
    try {
      const { error: authUpdateError } = await supabase.auth.updateUser({
        data: { full_name: normalizedName }
      });
      if (authUpdateError) throw authUpdateError;

      await updateProfile({ full_name: normalizedName });
    } catch (error: any) {
      console.error('Error updating display name:', error);
      toast.error(error?.message || 'Ad Soyad guncellenemedi');
    } finally {
      setIsSavingDisplayName(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!newPassword || !confirmNewPassword) {
      toast.error('Sifre alanlarini doldurun');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Sifre en az 6 karakter olmali');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast.error('Sifreler eslesmiyor');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setNewPassword('');
      setConfirmNewPassword('');
      toast.success('Sifre guncellendi');
    } catch (error: any) {
      console.error('Error updating password:', error);
      toast.error(error?.message || 'Sifre guncellenemedi');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!user) return;

    const confirmed = window.confirm('Aboneliginizi iptal etmek istediginizden emin misiniz? Bu islem plani pasife alir.');
    if (!confirmed) return;

    setIsCancellingSubscription(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Oturum bulunamadi');
      }

      const authHeaders = {
        Authorization: `Bearer ${session.access_token}`
      };

      let response = await fetch('/api/user-plan-cancel', {
        method: 'POST',
        headers: authHeaders
      });

      if (!response.ok) {
        response = await fetch('/api/admin-users?action=cancel-plan', {
          method: 'POST',
          headers: authHeaders
        });
      }

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Abonelik iptal edilemedi');
      }

      setPlanSummary(payload.summary || null);
      toast.success('Abonelik pasife alindi');
    } catch (error: any) {
      console.error('Error cancelling subscription:', error);
      toast.error(error?.message || 'Abonelik iptal edilemedi');
    } finally {
      setIsCancellingSubscription(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      // Error handled in AuthContext
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('tr-TR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatRelativeDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Bugün';
    if (diffDays === 1) return 'Dün';
    if (diffDays < 7) return `${diffDays} gün önce`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} hafta önce`;
    return formatDate(dateString);
  };

  const handleDeleteClient = async (id: string) => {
    if (!window.confirm('Bu müvekkili silmek istediğinize emin misiniz?')) return;

    try {
      await clientService.deleteClient(id);
      setClients(clients.filter(c => c.id !== id));
      setSelectedClient(null);
      toast.success('Müvekkil silindi');
    } catch (error) {
      console.error('Error deleting client:', error);
      toast.error('Silme işlemi başarısız');
    }
  };

  const handleViewPdf = async (client: Client) => {
    if (!client.vekalet_pdf_url) return;

    setIsLoadingPdfUrl(true);
    try {
      const url = await clientService.getVekaletPdfUrl(client.vekalet_pdf_url);
      if (url) {
        window.open(url, '_blank');
      } else {
        toast.error('PDF URL alınamadı');
      }
    } catch (error) {
      console.error('Error getting PDF URL:', error);
      toast.error('PDF açılamadı');
    } finally {
      setIsLoadingPdfUrl(false);
    }
  };

  const startEditingClient = () => {
    if (selectedClient) {
      setEditClientData({
        name: selectedClient.name,
        tc_vk_no: selectedClient.tc_vk_no || '',
        address: selectedClient.address || '',
        phone: selectedClient.phone || '',
        email: selectedClient.email || ''
      });
      setEditVekaletPdf(null);
      setRemoveExistingVekaletPdf(false);
      setIsEditingClient(true);
    }
  };

  const handleEditVekaletFileSelect = (file?: File | null) => {
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Lutfen sadece PDF dosyasi yukleyin');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Dosya boyutu 10MB\'i asamaz');
      return;
    }

    setEditVekaletPdf(file);
    setRemoveExistingVekaletPdf(false);
  };

  const handleSaveClient = async () => {
    if (!selectedClient) return;

    if (!editClientData.name.trim()) {
      toast.error('Müvekkil adı gereklidir');
      return;
    }

    setIsSavingClient(true);
    try {
      const updatedClient = await clientService.updateClient(selectedClient.id, {
        name: editClientData.name.trim(),
        tc_vk_no: editClientData.tc_vk_no.trim() || undefined,
        address: editClientData.address.trim() || undefined,
        phone: editClientData.phone.trim() || undefined,
        email: editClientData.email.trim() || undefined
      });

      // Handle vekaletname updates while editing
      if (removeExistingVekaletPdf && updatedClient.vekalet_pdf_url) {
        await clientService.deleteVekaletPdf(updatedClient.id);
      }

      if (editVekaletPdf) {
        if (!removeExistingVekaletPdf && updatedClient.vekalet_pdf_url) {
          await clientService.deleteVekaletPdf(updatedClient.id);
        }
        await clientService.uploadVekaletPdf(updatedClient.id, editVekaletPdf);
      }

      const refreshedClient = await clientService.getClient(updatedClient.id);
      const finalClient = refreshedClient || updatedClient;

      // Update local state
      setClients(clients.map(c => c.id === selectedClient.id ? finalClient : c));
      setSelectedClient(finalClient);
      setIsEditingClient(false);
      setEditVekaletPdf(null);
      setRemoveExistingVekaletPdf(false);
      toast.success('Müvekkil bilgileri güncellendi');
    } catch (error) {
      console.error('Error updating client:', error);
      toast.error('Güncelleme başarısız');
    } finally {
      setIsSavingClient(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B]">
      {/* Header */}
      <header className="premium-topbar sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate('/')}
              className="premium-back-button"
            >
              <ArrowLeft className="w-5 h-5 premium-back-icon" />
              <span className="premium-back-label">Ana Sayfa</span>
            </button>
            <div className="flex items-center space-x-2 sm:space-x-4">
              <button
                onClick={() => navigate('/app')}
                className="premium-cta-button premium-cta-button--brand text-sm sm:text-base"
              >
                <Plus className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Yeni Dilekçe</span>
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center px-3 sm:px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 hover:text-red-300 border border-red-600/50 rounded-lg transition-colors text-sm sm:text-base"
              >
                <LogOut className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Çıkış</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Profile Hero Section */}
        <div className="bg-gradient-to-r from-gray-800 via-gray-800 to-gray-700 rounded-2xl sm:rounded-3xl shadow-2xl p-4 sm:p-8 mb-6 sm:mb-8 border border-gray-700 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-red-600/10 to-transparent"></div>
          <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center space-x-4 sm:space-x-6">
              <div className="bg-gradient-to-br from-red-500 to-red-700 p-3 sm:p-5 rounded-xl sm:rounded-2xl shadow-lg ring-4 ring-red-500/20">
                <User className="w-8 h-8 sm:w-14 sm:h-14 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-3xl md:text-4xl font-bold text-white mb-1">
                  {profile?.full_name || 'Hoş Geldiniz'}
                </h1>
                <p className="text-gray-400 text-sm sm:text-lg truncate max-w-[200px] sm:max-w-none">{user?.email}</p>
                <div className="flex flex-wrap items-center mt-2 sm:mt-3 gap-2 sm:gap-4">
                  <span className="px-3 py-1 bg-green-600/20 text-green-400 rounded-full text-sm flex items-center">
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Aktif Hesap
                  </span>
                  <span className="text-gray-500 text-sm">
                    Üyelik: {user?.created_at ? formatDate(user.created_at) : '-'}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-4 md:mt-0 flex">
              <div className="w-full md:w-auto space-y-3">
                <div className="bg-black/25 border border-gray-600 rounded-xl p-3 sm:p-4 min-w-[250px]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-400 uppercase tracking-wide">Mevcut Plan</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${planSummary?.status === 'active' ? 'bg-green-600/20 text-green-400' : 'bg-yellow-600/20 text-yellow-300'}`}>
                      {planSummary?.status === 'active' ? 'Aktif' : 'Pasif'}
                    </span>
                  </div>
                  <p className="text-white text-lg font-bold">{getPlanLabel(planSummary?.plan_code)}</p>
                  <div className="mt-2 text-sm">
                    <p className="text-gray-400">Kalan belge üretme hakkı</p>
                    <p className="text-white font-semibold">
                      {loadingPlanSummary
                        ? 'Yukleniyor...'
                        : !planSummary
                          ? '-'
                          : (planSummary.remaining_today == null || planSummary.daily_limit == null)
                            ? 'Sinirsiz'
                            : `${planSummary.remaining_today} / ${planSummary.daily_limit}`}
                    </p>
                  </div>
                  {planSummary?.trial_ends_at && (
                    <p className="text-xs text-gray-500 mt-2">
                      Trial bitis: {formatDate(planSummary.trial_ends_at)}
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => navigate('/fiyatlandirma')}
                    className="px-3 sm:px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm sm:text-base"
                  >
                    Plan Yukselt
                  </button>
                  <button
                    onClick={() => setActiveTab('settings')}
                    className="px-3 sm:px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors flex items-center text-sm sm:text-base"
                  >
                    <Edit3 className="w-4 h-4 mr-1 sm:mr-2" />
                    <span className="hidden xs:inline">Profili Duzenle</span>
                    <span className="xs:hidden">Duzenle</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 mb-6 sm:mb-8">
          <div className="bg-gray-800 rounded-xl p-3 sm:p-5 border border-gray-700 hover:border-blue-500/50 transition-colors group">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <div className="p-1.5 sm:p-2 bg-blue-600/20 rounded-lg group-hover:bg-blue-600/30 transition-colors">
                <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
              </div>
              <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 text-green-400" />
            </div>
            <p className="text-xl sm:text-3xl font-bold text-white">{statistics.total}</p>
            <p className="text-gray-400 text-xs sm:text-sm">Toplam Dilekçe</p>
          </div>

          <div className="bg-gray-800 rounded-xl p-3 sm:p-5 border border-gray-700 hover:border-green-500/50 transition-colors group">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <div className="p-1.5 sm:p-2 bg-green-600/20 rounded-lg group-hover:bg-green-600/30 transition-colors">
                <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-400" />
              </div>
            </div>
            <p className="text-xl sm:text-3xl font-bold text-white">{statistics.completed}</p>
            <p className="text-gray-400 text-xs sm:text-sm">Tamamlanan</p>
          </div>

          <div className="bg-gray-800 rounded-xl p-3 sm:p-5 border border-gray-700 hover:border-yellow-500/50 transition-colors group">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <div className="p-1.5 sm:p-2 bg-yellow-600/20 rounded-lg group-hover:bg-yellow-600/30 transition-colors">
                <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-400" />
              </div>
            </div>
            <p className="text-xl sm:text-3xl font-bold text-white">{statistics.drafts}</p>
            <p className="text-gray-400 text-xs sm:text-sm">Taslak</p>
          </div>

          <div className="bg-gray-800 rounded-xl p-3 sm:p-5 border border-gray-700 hover:border-purple-500/50 transition-colors group">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <div className="p-1.5 sm:p-2 bg-purple-600/20 rounded-lg group-hover:bg-purple-600/30 transition-colors">
                <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" />
              </div>
            </div>
            <p className="text-xl sm:text-3xl font-bold text-white">{statistics.thisMonth}</p>
            <p className="text-gray-400 text-xs sm:text-sm">Bu Ay</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-2 mb-6 bg-gray-800 p-1 rounded-xl border border-gray-700 w-full sm:w-fit overflow-x-auto">
          <button
            onClick={() => setActiveTab('petitions')}
            className={`px-3 sm:px-4 py-2 rounded-lg transition-all flex items-center text-sm sm:text-base whitespace-nowrap ${activeTab === 'petitions'
              ? 'bg-red-600 text-white shadow-lg'
              : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
          >
            <FileText className="w-4 h-4 mr-1 sm:mr-2" />
            <span className="hidden xs:inline">Dilekçelerim</span>
            <span className="xs:hidden">Dilekçe</span>
          </button>
          <button
            onClick={() => setActiveTab('clients')}
            className={`px-3 sm:px-4 py-2 rounded-lg transition-all flex items-center text-sm sm:text-base whitespace-nowrap ${activeTab === 'clients'
              ? 'bg-red-600 text-white shadow-lg'
              : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
          >
            <Users className="w-4 h-4 mr-1 sm:mr-2" />
            <span className="hidden xs:inline">Müvekkillerim</span>
            <span className="xs:hidden">Müvekkil</span>
          </button>
          <button
            onClick={() => setActiveTab('statistics')}
            className={`px-3 sm:px-4 py-2 rounded-lg transition-all flex items-center text-sm sm:text-base whitespace-nowrap ${activeTab === 'statistics'
              ? 'bg-red-600 text-white shadow-lg'
              : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
          >
            <BarChart3 className="w-4 h-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">İstatistikler</span>
            <span className="sm:hidden">İstat.</span>
          </button>
          <button
            onClick={() => setActiveTab('calculator')}
            className={`px-3 sm:px-4 py-2 rounded-lg transition-all flex items-center text-sm sm:text-base whitespace-nowrap ${activeTab === 'calculator'
              ? 'bg-red-600 text-white shadow-lg'
              : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
          >
            <Calculator className="w-4 h-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Harc Hesapla</span>
            <span className="sm:hidden">Harc</span>
          </button>
          <button
            onClick={() => setActiveTab('labor')}
            className={`px-3 sm:px-4 py-2 rounded-lg transition-all flex items-center text-sm sm:text-base whitespace-nowrap ${activeTab === 'labor'
              ? 'bg-red-600 text-white shadow-lg'
              : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
          >
            <BriefcaseIcon className="w-4 h-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">İşçilik Alacakları</span>
            <span className="sm:hidden">İşçilik</span>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3 sm:px-4 py-2 rounded-lg transition-all flex items-center text-sm sm:text-base whitespace-nowrap ${activeTab === 'settings'
              ? 'bg-red-600 text-white shadow-lg'
              : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
          >
            <Settings className="w-4 h-4 mr-1 sm:mr-2" />
            Ayarlar
          </button>
        </div>

        {/* Petitions Tab */}
        {activeTab === 'petitions' && (
          <div className="bg-gray-800 rounded-xl sm:rounded-2xl shadow-xl border border-gray-700">
            {/* Search and Filter Bar */}
            <div className="p-3 sm:p-6 border-b border-gray-700">
              <div className="flex flex-col gap-3 sm:gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Dilekçe ara..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 sm:pl-10 pr-4 py-2.5 sm:py-3 bg-gray-700 border border-gray-600 rounded-lg sm:rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-red-500 transition-colors text-sm sm:text-base"
                  />
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                  <Filter className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-700 border border-gray-600 rounded-lg sm:rounded-xl text-white focus:outline-none focus:border-red-500 transition-colors cursor-pointer text-sm sm:text-base"
                  >
                    <option value="all">Tüm Türler</option>
                    {petitionTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Petitions List */}
            <div className="p-3 sm:p-6">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-red-500 border-t-transparent"></div>
                </div>
              ) : filteredPetitions.length === 0 ? (
                <div className="text-center py-16">
                  <FileText className="w-20 h-20 text-gray-600 mx-auto mb-6" />
                  <h3 className="text-xl font-semibold text-white mb-2">
                    {searchQuery || filterType !== 'all'
                      ? 'Arama kriterlerine uygun dilekçe bulunamadı'
                      : 'Henüz kayıtlı dilekçeniz yok'}
                  </h3>
                  <p className="text-gray-400 mb-6">
                    {searchQuery || filterType !== 'all'
                      ? 'Farklı arama kriterleri deneyin'
                      : 'Hemen ilk dilekçenizi oluşturmaya başlayın'}
                  </p>
                  {!searchQuery && filterType === 'all' && (
                    <button
                      onClick={() => navigate('/app')}
                      className="premium-cta-button premium-cta-button--brand px-8 py-4 rounded-xl inline-flex items-center"
                    >
                      <Plus className="w-5 h-5 mr-2" />
                      Yeni Dilekçe Oluştur
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3 sm:space-y-4">
                  {filteredPetitions.map((petition) => (
                    <div
                      key={petition.id}
                      className="bg-gray-700/50 rounded-xl p-3 sm:p-6 hover:bg-gray-700 transition-all border border-gray-600 hover:border-gray-500 group"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${petition.status === 'completed'
                              ? 'bg-green-600/20 text-green-400'
                              : 'bg-yellow-600/20 text-yellow-400'
                              }`}>
                              {petition.status === 'completed' ? 'Tamamlandı' : 'Taslak'}
                            </span>
                            <span className="text-xs text-gray-400 flex items-center">
                              <Calendar className="w-3 h-3 mr-1" />
                              {formatRelativeDate(petition.created_at)}
                            </span>
                          </div>
                          <h3 className="text-base sm:text-lg font-semibold text-white group-hover:text-red-400 transition-colors line-clamp-2">
                            {petition.title}
                          </h3>
                          <div className="mt-1">
                            <span className="inline-flex items-center px-2 py-0.5 bg-gray-600/50 rounded text-xs text-gray-300">
                              <Briefcase className="w-3 h-3 mr-1" />
                              {petition.petition_type}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pt-2 sm:pt-0 border-t sm:border-0 border-gray-600">
                          <button
                            onClick={() => handleView(petition)}
                            className="flex-1 sm:flex-none p-2 sm:p-3 bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white rounded-lg sm:rounded-xl transition-all flex items-center justify-center gap-1"
                            title="Görüntüle"
                          >
                            <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                            <span className="text-xs sm:hidden">Görüntüle</span>
                          </button>
                          <button
                            onClick={() => handleShare(petition)}
                            className="flex-1 sm:flex-none p-2 sm:p-3 bg-green-600/20 hover:bg-green-600 text-green-400 hover:text-white rounded-lg sm:rounded-xl transition-all flex items-center justify-center gap-1"
                            title="Paylaş"
                          >
                            <Share2 className="w-4 h-4 sm:w-5 sm:h-5" />
                            <span className="text-xs sm:hidden">Paylaş</span>
                          </button>
                          <button
                            onClick={() => handleDelete(petition.id)}
                            className="flex-1 sm:flex-none p-2 sm:p-3 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white rounded-lg sm:rounded-xl transition-all flex items-center justify-center gap-1"
                            title="Sil"
                          >
                            <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                            <span className="text-xs sm:hidden">Sil</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Clients Tab */}
        {activeTab === 'clients' && (
          <div className="bg-gray-800 rounded-2xl shadow-xl border border-gray-700">
            {/* Header with Add Button */}
            <div className="p-6 border-b border-gray-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-red-500" />
                  Müvekkillerim
                </h2>
                <p className="text-gray-400 text-sm mt-1">{clients.length} müvekkil kayıtlı</p>
              </div>
              <button
                onClick={() => setShowClientManager(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium"
              >
                <Plus className="w-5 h-5" />
                Yeni Müvekkil
              </button>
            </div>

            {/* Search and Filter Bar */}
            <div className="p-6 border-b border-gray-700">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="İsim, TC/VKN veya e-posta ile ara..."
                    value={clientSearchQuery}
                    onChange={(e) => setClientSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-red-500 transition-colors"
                  />
                </div>
                <div className="flex flex-wrap bg-gray-700 p-1 rounded-lg gap-1">
                  <button
                    onClick={() => setClientFilterType('ALL')}
                    className={`px-3 py-2 rounded-md transition-all text-sm ${clientFilterType === 'ALL'
                      ? 'bg-gray-600 text-white'
                      : 'text-gray-400 hover:text-white'
                      }`}
                  >
                    Tümü
                  </button>
                  <button
                    onClick={() => setClientFilterType('INDIVIDUAL')}
                    className={`flex items-center gap-1 px-3 py-2 rounded-md transition-all text-sm ${clientFilterType === 'INDIVIDUAL'
                      ? 'bg-gray-600 text-white'
                      : 'text-gray-400 hover:text-white'
                      }`}
                  >
                    <User className="w-4 h-4" />
                    <span className="hidden sm:inline">Bireysel</span>
                  </button>
                  <button
                    onClick={() => setClientFilterType('CORPORATE')}
                    className={`flex items-center gap-1 px-3 py-2 rounded-md transition-all text-sm ${clientFilterType === 'CORPORATE'
                      ? 'bg-gray-600 text-white'
                      : 'text-gray-400 hover:text-white'
                      }`}
                  >
                    <Building2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Kurumsal</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Clients Grid */}
            <div className="p-6">
              {clientsLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="w-10 h-10 text-red-500 animate-spin" />
                </div>
              ) : filteredClients.length === 0 ? (
                <div className="text-center py-16">
                  <Users className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-white mb-2">
                    {clientSearchQuery || clientFilterType !== 'ALL' ? 'Sonuç bulunamadı' : 'Henüz müvekkil eklenmemiş'}
                  </h3>
                  <p className="text-gray-400 mb-6">
                    {clientSearchQuery || clientFilterType !== 'ALL'
                      ? 'Farklı bir arama terimi deneyin'
                      : 'Yeni müvekkil ekleyerek başlayın'
                    }
                  </p>
                  {!clientSearchQuery && clientFilterType === 'ALL' && (
                    <button
                      onClick={() => setShowClientManager(true)}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                    >
                      <Plus className="w-5 h-5" />
                      İlk Müvekkili Ekle
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredClients.map((client) => (
                    <div
                      key={client.id}
                      onClick={() => setSelectedClient(client)}
                      className="bg-gray-700/50 border border-gray-600 rounded-xl p-5 hover:border-red-500/50 hover:bg-gray-700 cursor-pointer transition-all group"
                    >
                      {/* Card Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`p-2.5 rounded-lg ${client.type === 'CORPORATE'
                            ? 'bg-blue-900/30 text-blue-400'
                            : 'bg-green-900/30 text-green-400'
                            }`}>
                            {client.type === 'CORPORATE'
                              ? <Building2 className="w-5 h-5" />
                              : <User className="w-5 h-5" />
                            }
                          </div>
                          <div>
                            <h3 className="font-semibold text-white group-hover:text-red-400 transition-colors">
                              {client.name}
                            </h3>
                            <p className="text-sm text-gray-500">
                              {client.type === 'CORPORATE' ? 'Kurumsal' : 'Bireysel'}
                            </p>
                          </div>
                        </div>
                        {client.vekalet_pdf_url && (
                          <span title="Vekaletname mevcut" className="p-1.5 bg-red-900/30 rounded-lg text-red-400">
                            <FileText className="w-4 h-4" />
                          </span>
                        )}
                      </div>

                      {/* Card Body */}
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2 text-gray-400">
                          <span className="text-gray-500">{client.type === 'CORPORATE' ? 'VKN:' : 'TC:'}</span>
                          <span className="text-white font-mono">
                            {client.tc_vk_no
                              ? `${client.tc_vk_no.slice(0, 3)}***${client.tc_vk_no.slice(-2)}`
                              : '-'
                            }
                          </span>
                        </div>
                        {client.phone && (
                          <div className="flex items-center gap-2 text-gray-400">
                            <Phone className="w-3.5 h-3.5" />
                            <span>{client.phone}</span>
                          </div>
                        )}
                        {client.email && (
                          <div className="flex items-center gap-2 text-gray-400">
                            <Mail className="w-3.5 h-3.5" />
                            <span className="truncate">{client.email}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Client Detail Modal */}
        {selectedClient && (
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => {
              setSelectedClient(null);
              setIsEditingClient(false);
              setEditVekaletPdf(null);
              setRemoveExistingVekaletPdf(false);
            }}
          >
            <div
              className="bg-gray-900 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg border-t sm:border border-gray-700 shadow-2xl max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-700">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-xl ${selectedClient.type === 'CORPORATE'
                    ? 'bg-blue-900/30 text-blue-400'
                    : 'bg-green-900/30 text-green-400'
                    }`}>
                    {selectedClient.type === 'CORPORATE'
                      ? <Building2 className="w-6 h-6" />
                      : <User className="w-6 h-6" />
                    }
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">{selectedClient.name}</h2>
                    <p className="text-sm text-gray-400">
                      {selectedClient.type === 'CORPORATE' ? 'Kurumsal Müvekkil' : 'Bireysel Müvekkil'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedClient(null);
                    setIsEditingClient(false);
                    setEditVekaletPdf(null);
                    setRemoveExistingVekaletPdf(false);
                  }}
                  className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-4 sm:p-6 space-y-4 flex-1 overflow-y-auto">
                {isEditingClient ? (
                  /* Edit Mode */
                  <>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-gray-300">
                        {selectedClient.type === 'CORPORATE' ? 'Şirket Ünvanı' : 'Ad Soyad'}
                      </label>
                      <input
                        type="text"
                        value={editClientData.name}
                        onChange={(e) => setEditClientData({ ...editClientData, name: e.target.value })}
                        className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-red-500 focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-sm font-medium text-gray-300">
                        {selectedClient.type === 'CORPORATE' ? 'Vergi Kimlik No' : 'TC Kimlik No'}
                      </label>
                      <input
                        type="text"
                        value={editClientData.tc_vk_no}
                        onChange={(e) => setEditClientData({ ...editClientData, tc_vk_no: e.target.value })}
                        maxLength={selectedClient.type === 'INDIVIDUAL' ? 11 : undefined}
                        className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-red-500 focus:outline-none font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-sm font-medium text-gray-300">Adres</label>
                      <textarea
                        value={editClientData.address}
                        onChange={(e) => setEditClientData({ ...editClientData, address: e.target.value })}
                        rows={3}
                        className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-red-500 focus:outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-300">Telefon</label>
                        <input
                          type="tel"
                          value={editClientData.phone}
                          onChange={(e) => setEditClientData({ ...editClientData, phone: e.target.value })}
                          className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-red-500 focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-gray-300">E-posta</label>
                        <input
                          type="email"
                          value={editClientData.email}
                          onChange={(e) => setEditClientData({ ...editClientData, email: e.target.value })}
                          className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-red-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-300">Vekaletname (PDF)</label>
                      <input
                        ref={editVekaletInputRef}
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={(e) => {
                          handleEditVekaletFileSelect(e.target.files?.[0]);
                          e.currentTarget.value = '';
                        }}
                      />
                      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 space-y-3">
                        {selectedClient.vekalet_pdf_url && !removeExistingVekaletPdf && !editVekaletPdf && (
                          <div className="text-sm text-green-400 flex items-center gap-2">
                            <FileText className="w-4 h-4" />
                            Mevcut vekaletname kayitli
                          </div>
                        )}

                        {removeExistingVekaletPdf && (
                          <div className="text-sm text-yellow-400">
                            Kaydet ile mevcut vekaletname silinecek
                          </div>
                        )}

                        {editVekaletPdf && (
                          <div className="text-sm text-blue-300 flex items-center gap-2">
                            <FileText className="w-4 h-4" />
                            Secilen dosya: {editVekaletPdf.name}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => editVekaletInputRef.current?.click()}
                            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm flex items-center gap-2"
                          >
                            <Upload className="w-4 h-4" />
                            {selectedClient.vekalet_pdf_url ? 'Degistir' : 'Vekaletname Ekle'}
                          </button>

                          {editVekaletPdf && (
                            <button
                              type="button"
                              onClick={() => setEditVekaletPdf(null)}
                              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm"
                            >
                              Secimi Temizle
                            </button>
                          )}

                          {selectedClient.vekalet_pdf_url && (
                            <button
                              type="button"
                              onClick={() => {
                                setRemoveExistingVekaletPdf(prev => {
                                  const next = !prev;
                                  if (next) {
                                    setEditVekaletPdf(null);
                                  }
                                  return next;
                                });
                              }}
                              className={`px-3 py-2 rounded-lg transition-colors text-sm ${removeExistingVekaletPdf
                                ? 'bg-yellow-700 hover:bg-yellow-600 text-white'
                                : 'bg-red-700/80 hover:bg-red-700 text-white'
                                }`}
                            >
                              {removeExistingVekaletPdf ? 'Silmeyi Iptal Et' : 'Mevcutu Kaldir'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  /* View Mode */
                  <>
                    {/* TC/VKN */}
                    <div className="bg-gray-800/50 rounded-lg p-4">
                      <div className="text-sm text-gray-400 mb-1">
                        {selectedClient.type === 'CORPORATE' ? 'Vergi Kimlik No' : 'TC Kimlik No'}
                      </div>
                      <div className="text-lg font-mono text-white">
                        {selectedClient.tc_vk_no || '-'}
                      </div>
                    </div>

                    {/* Contact Info */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-gray-800/50 rounded-lg p-4">
                        <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                          <Phone className="w-4 h-4" /> Telefon
                        </div>
                        <div className="text-white">{selectedClient.phone || '-'}</div>
                      </div>
                      <div className="bg-gray-800/50 rounded-lg p-4">
                        <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                          <Mail className="w-4 h-4" /> E-posta
                        </div>
                        <div className="text-white truncate">{selectedClient.email || '-'}</div>
                      </div>
                    </div>

                    {/* Address */}
                    <div className="bg-gray-800/50 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                        <MapPin className="w-4 h-4" /> Adres
                      </div>
                      <div className="text-white">{selectedClient.address || '-'}</div>
                    </div>

                    {/* Vekaletname */}
                    {selectedClient.vekalet_pdf_url && (
                      <div className="bg-red-900/20 border border-red-800/30 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-red-400" />
                            <div>
                              <div className="text-white font-medium">Vekaletname</div>
                              <div className="text-sm text-gray-400">PDF belgesi mevcut</div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleViewPdf(selectedClient)}
                            disabled={isLoadingPdfUrl}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 text-white rounded-lg transition-colors text-sm"
                          >
                            {isLoadingPdfUrl ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <ExternalLink className="w-4 h-4" />
                            )}
                            Görüntüle
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex gap-2 sm:gap-3 p-4 sm:p-6 border-t border-gray-700">
                {isEditingClient ? (
                  <>
                    <button
                      onClick={() => {
                        setIsEditingClient(false);
                        setEditVekaletPdf(null);
                        setRemoveExistingVekaletPdf(false);
                      }}
                      className="flex-1 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
                    >
                      İptal
                    </button>
                    <button
                      onClick={handleSaveClient}
                      disabled={isSavingClient}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white rounded-lg transition-colors"
                    >
                      {isSavingClient ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Save className="w-5 h-5" />
                      )}
                      Kaydet
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleDeleteClient(selectedClient.id)}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-800 hover:bg-red-900/30 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Sil
                    </button>
                    <button
                      onClick={startEditingClient}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                      <Edit3 className="w-4 h-4" />
                      Düzenle
                    </button>
                    <button
                      onClick={() => {
                        setSelectedClient(null);
                        setIsEditingClient(false);
                        setEditVekaletPdf(null);
                        setRemoveExistingVekaletPdf(false);
                      }}
                      className="px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
                    >
                      Kapat
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Client Manager Modal */}
        {showClientManager && (
          <ClientManager
            mode="manage"
            onClose={() => {
              setShowClientManager(false);
              loadClients(); // Refresh list after adding
            }}
          />
        )}

        {/* Statistics Tab */}
        {activeTab === 'statistics' && (
          <div className="bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-700">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
              <BarChart3 className="w-6 h-6 mr-3 text-purple-400" />
              Dilekçe İstatistikleri
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Type Breakdown */}
              <div className="bg-gray-700/50 rounded-xl p-6 border border-gray-600">
                <h3 className="text-lg font-semibold text-white mb-4">Türe Göre Dağılım</h3>
                <div className="space-y-3">
                  {Object.entries(statistics.typeBreakdown).map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between">
                      <span className="text-gray-400">{type}</span>
                      <div className="flex items-center">
                        <div className="w-32 h-2 bg-gray-600 rounded-full mr-3 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-red-500 to-red-600 rounded-full"
                            style={{ width: `${(Number(count) / statistics.total) * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-white font-semibold w-8 text-right">{count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Activity Summary */}
              <div className="bg-gray-700/50 rounded-xl p-6 border border-gray-600">
                <h3 className="text-lg font-semibold text-white mb-4">Aktivite Özeti</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-gray-600/50 rounded-lg">
                    <span className="text-gray-300">Toplam Dilekçe</span>
                    <span className="text-2xl font-bold text-white">{statistics.total}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-600/50 rounded-lg">
                    <span className="text-gray-300">Bu Ay Oluşturulan</span>
                    <span className="text-2xl font-bold text-green-400">{statistics.thisMonth}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-600/50 rounded-lg">
                    <span className="text-gray-300">Tamamlanma Oranı</span>
                    <span className="text-2xl font-bold text-blue-400">
                      {statistics.total > 0 ? Math.round((statistics.completed / statistics.total) * 100) : 0}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-700">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
              <Settings className="w-6 h-6 mr-3 text-gray-400" />
              Hesap Ayarları
            </h2>

            <div className="space-y-6">
              {/* Account Info */}
              <div className="bg-gray-700/50 rounded-xl p-6 border border-gray-600">
                <h3 className="text-lg font-semibold text-white mb-4">Hesap Bilgileri</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-3 border-b border-gray-600">
                    <span className="text-gray-400">E-posta</span>
                    <span className="text-white">{user?.email}</span>
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-gray-600">
                    <span className="text-gray-400">Ad Soyad</span>
                    <span className="text-white">{profile?.full_name || 'Belirtilmemiş'}</span>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <span className="text-gray-400">Üyelik Tarihi</span>
                    <span className="text-white">{user?.created_at ? formatDate(user.created_at) : '-'}</span>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-gray-600 space-y-5">
                  <div>
                    <label className="block text-gray-300 text-sm font-medium mb-2">Ad Soyad</label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Ad Soyad"
                        className="flex-1 px-4 py-2.5 bg-gray-600 border border-gray-500 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
                      />
                      <button
                        onClick={handleUpdateDisplayName}
                        disabled={isSavingDisplayName}
                        className="px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors"
                      >
                        {isSavingDisplayName ? 'Kaydediliyor...' : 'Ismi Guncelle'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-gray-300 text-sm font-medium">Yeni Sifre</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="En az 6 karakter"
                      className="w-full px-4 py-2.5 bg-gray-600 border border-gray-500 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                    <input
                      type="password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder="Yeni sifre tekrar"
                      className="w-full px-4 py-2.5 bg-gray-600 border border-gray-500 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                    <button
                      onClick={handleUpdatePassword}
                      disabled={isUpdatingPassword}
                      className="w-full sm:w-auto px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors"
                    >
                      {isUpdatingPassword ? 'Guncelleniyor...' : 'Sifreyi Guncelle'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Office Branding */}
              <div className="bg-gray-700/50 rounded-xl p-6 border border-gray-600">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                  <Image className="w-5 h-5 mr-2 text-blue-400" />
                  Büro Kurumsal Bilgileri
                </h3>
                <p className="text-gray-400 text-sm mb-4">
                  Dilekçelerinizin başında görünecek logo ve kurumsal başlık bilgilerinizi buradan ayarlayabilirsiniz.
                </p>
                <div className="space-y-4">
                  {/* Logo Upload */}
                  <div>
                    <label className="block text-gray-300 text-sm font-medium mb-2">Büro Logosu</label>
                    <div className="flex items-start gap-4">
                      {/* Logo Preview */}
                      <div className="w-24 h-24 bg-gray-600 rounded-lg flex items-center justify-center overflow-hidden border border-gray-500">
                        {officeLogoUrl ? (
                          <img
                            src={officeLogoUrl}
                            alt="Büro logosu"
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <Image className="w-8 h-8 text-gray-400" />
                        )}
                      </div>
                      <div className="flex-1">
                        <input
                          type="file"
                          accept="image/*"
                          id="logo-upload"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file || !user) return;

                            if (file.size > 2 * 1024 * 1024) {
                              toast.error('Logo dosyası 2MB\'dan küçük olmalıdır');
                              return;
                            }

                            setIsUploadingLogo(true);
                            try {
                              const fileExt = file.name.split('.').pop();
                              const fileName = `${user.id}/logo.${fileExt}`;

                              const { error: uploadError } = await supabase.storage
                                .from('office-logos')
                                .upload(fileName, file, { upsert: true });

                              if (uploadError) throw uploadError;

                              const { data: { publicUrl } } = supabase.storage
                                .from('office-logos')
                                .getPublicUrl(fileName);

                              setOfficeLogoUrl(publicUrl);
                              toast.success('Logo yüklendi!');
                            } catch (error: any) {
                              console.error('Error uploading logo:', error);
                              toast.error('Logo yüklenirken hata oluştu: ' + (error.message || 'Bilinmeyen hata'));
                            } finally {
                              setIsUploadingLogo(false);
                            }
                          }}
                        />
                        <label
                          htmlFor="logo-upload"
                          className="inline-flex items-center px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg cursor-pointer transition-colors"
                        >
                          {isUploadingLogo ? (
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                          ) : (
                            <Upload className="w-4 h-4 mr-2" />
                          )}
                          Logo Yükle
                        </label>
                        {officeLogoUrl && (
                          <button
                            onClick={async () => {
                              if (!user) return;
                              try {
                                const fileName = `${user.id}/logo`;
                                // Delete from storage (best effort)
                                await supabase.storage.from('office-logos').remove([fileName]);
                                setOfficeLogoUrl(null);
                                toast.success('Logo silindi');
                              } catch (error) {
                                console.error('Error removing logo:', error);
                                setOfficeLogoUrl(null);
                              }
                            }}
                            className="ml-2 inline-flex items-center px-3 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
                          >
                            <X className="w-4 h-4 mr-1" />
                            Sil
                          </button>
                        )}
                        <p className="text-gray-500 text-xs mt-2">PNG, JPG veya WebP. Maks. 2MB.</p>
                      </div>
                    </div>
                  </div>

                  {/* Corporate Header */}
                  <div>
                    <label className="block text-gray-300 text-sm font-medium mb-2">Kurumsal Başlık</label>
                    <textarea
                      value={corporateHeader}
                      onChange={(e) => setCorporateHeader(e.target.value)}
                      placeholder="Örn: Av. Mehmet Yılmaz&#10;Ankara Barosu - Sicil No: 12345&#10;Adres: Kızılay Mah. Atatürk Bulvarı No:10/5"
                      className="w-full px-4 py-3 bg-gray-600 border border-gray-500 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                      rows={4}
                    />
                    <p className="text-gray-500 text-xs mt-1">Bu metin dilekçelerinizin başında logo ile birlikte görünecektir.</p>
                  </div>

                  {/* Save Button */}
                  <button
                    onClick={async () => {
                      if (!user) return;
                      setIsSavingBranding(true);
                      try {
                        const { error } = await supabase
                          .from('profiles')
                          .update({
                            office_logo_url: officeLogoUrl,
                            corporate_header: corporateHeader || null
                          })
                          .eq('id', user.id);

                        if (error) throw error;
                        toast.success('Kurumsal bilgiler kaydedildi!');
                      } catch (error: any) {
                        console.error('Error saving branding:', error);
                        toast.error('Kaydetme hatası: ' + (error.message || 'Bilinmeyen hata'));
                      } finally {
                        setIsSavingBranding(false);
                      }
                    }}
                    disabled={isSavingBranding}
                    className="inline-flex items-center justify-center px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors"
                  >
                    {isSavingBranding ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div>
                    ) : (
                      <Save className="w-5 h-5 mr-2" />
                    )}
                    Kurumsal Bilgileri Kaydet
                  </button>
                </div>
              </div>

              {/* Subscription */}
              <div className="bg-gray-700/50 rounded-xl p-6 border border-red-500/40">
                <h3 className="text-lg font-semibold text-white mb-2">Abonelik Iptali</h3>
                <p className="text-sm text-gray-400 mb-4">
                  Mevcut plan: <span className="text-gray-200">{getPlanLabel(planSummary?.plan_code)}</span>{' '}
                  ({planSummary?.status === 'active' ? 'Aktif' : 'Pasif'})
                </p>
                <button
                  onClick={handleCancelSubscription}
                  disabled={isCancellingSubscription || !planSummary || planSummary.status !== 'active'}
                  className="px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors"
                >
                  {isCancellingSubscription ? 'Iptal ediliyor...' : 'Aboneligi Iptal Et'}
                </button>
                {planSummary?.status !== 'active' && (
                  <p className="text-xs text-gray-500 mt-2">Planiniz zaten pasif durumda.</p>
                )}
              </div>

              {/* Actions */}
              <div className="bg-gray-700/50 rounded-xl p-6 border border-gray-600">
                <h3 className="text-lg font-semibold text-white mb-4">Eylemler</h3>
                <div className="space-y-3">
                  <button className="w-full flex items-center justify-between p-4 bg-gray-600/50 hover:bg-gray-600 rounded-lg transition-colors text-left">
                    <div className="flex items-center">
                      <Download className="w-5 h-5 text-blue-400 mr-3" />
                      <div>
                        <p className="text-white font-medium">Tüm Dilekçeleri İndir</p>
                        <p className="text-gray-400 text-sm">Dilekçelerinizi ZIP olarak indirin</p>
                      </div>
                    </div>
                    <ArrowLeft className="w-5 h-5 text-gray-400 rotate-180" />
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center justify-between p-4 bg-red-600/10 hover:bg-red-600/20 border border-red-600/30 rounded-lg transition-colors text-left"
                  >
                    <div className="flex items-center">
                      <LogOut className="w-5 h-5 text-red-400 mr-3" />
                      <div>
                        <p className="text-red-400 font-medium">Çıkış Yap</p>
                        <p className="text-gray-500 text-sm">Hesabınızdan güvenli çıkış yapın</p>
                      </div>
                    </div>
                    <ArrowLeft className="w-5 h-5 text-red-400 rotate-180" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Fee Calculator Tab */}
        {activeTab === 'calculator' && (
          <div className="max-w-4xl mr-auto">
            <FeeCalculator />
          </div>
        )}
        {/* Labor Receivables Calculator Tab */}
        {activeTab === 'labor' && (
          <div className="max-w-4xl mr-auto">
            <LaborReceivablesCalculator />
          </div>
        )}
      </div>

      {/* Share Modal */}
      {selectedPetition && (
        <ShareModal
          petition={selectedPetition}
          isOpen={shareModalOpen}
          onClose={() => {
            setShareModalOpen(false);
            setSelectedPetition(null);
          }}
          onSuccess={handleShareSuccess}
        />
      )}

      <Footer />
    </div>
  );
};

export default Profile;


