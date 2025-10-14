import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, Petition } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { User, FileText, Calendar, Trash2, Eye, LogOut, ArrowLeft, Share2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { ShareModal } from '../components/ShareModal';
import { Footer } from '../../components/Footer';

const Profile: React.FC = () => {
  const { user, profile, signOut } = useAuth();
  const [petitions, setPetitions] = useState<Petition[]>([]);
  const [loading, setLoading] = useState(true);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [selectedPetition, setSelectedPetition] = useState<Petition | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      loadPetitions();
    }
  }, [user]);

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
    // Navigate to app with petition data
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate('/')}
              className="flex items-center text-gray-300 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              Ana Sayfa
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Çıkış Yap
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Profile Info */}
        <div className="bg-gray-800 rounded-2xl shadow-xl p-8 mb-8 border border-gray-700">
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-br from-red-600 to-red-700 p-4 rounded-full">
              <User className="w-12 h-12 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">{profile?.full_name || 'Kullanıcı'}</h1>
              <p className="text-gray-400">{user?.email}</p>
            </div>
          </div>
        </div>

        {/* Petitions Section */}
        <div className="bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-700">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white flex items-center">
              <FileText className="w-6 h-6 mr-2 text-red-500" />
              Dilekçelerim
            </h2>
            <span className="text-gray-400">{petitions.length} dilekçe</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <svg
                className="animate-spin h-8 w-8 text-red-500"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            </div>
          ) : petitions.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 mb-4">Henüz kayıtlı dilekçeniz yok</p>
              <button
                onClick={() => navigate('/app')}
                className="px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 text-white font-semibold rounded-lg hover:from-red-700 hover:to-red-800 transition-all"
              >
                İlk Dilekçenizi Oluşturun
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {petitions.map((petition) => (
                <div
                  key={petition.id}
                  className="bg-gray-700 rounded-lg p-6 hover:bg-gray-650 transition-colors border border-gray-600"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white mb-2">{petition.title}</h3>
                      <div className="flex items-center text-sm text-gray-400 space-x-4">
                        <span className="flex items-center">
                          <Calendar className="w-4 h-4 mr-1" />
                          {formatDate(petition.created_at)}
                        </span>
                        <span className="px-2 py-1 bg-gray-600 rounded text-xs">
                          {petition.petition_type}
                        </span>
                      </div>
                      {petition.content && (
                        <p className="text-gray-400 mt-2 line-clamp-2">{petition.content.substring(0, 150)}...</p>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 ml-4">
                      <button
                        onClick={() => handleView(petition)}
                        className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                        title="Görüntüle"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleShare(petition)}
                        className="p-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                        title="Paylaş"
                      >
                        <Share2 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDelete(petition.id)}
                        className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                        title="Sil"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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
