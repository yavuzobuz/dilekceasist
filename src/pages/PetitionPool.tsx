import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Header } from '../../components/Header';
import { Footer } from '../../components/Footer';
import { toast } from 'react-hot-toast';
import { PetitionType } from '../../types';

interface PublicPetition {
  id: string;
  user_id: string;
  title: string;
  petition_type: string;
  content: string;
  description: string | null;
  tags: string[] | null;
  is_premium: boolean;
  price: number;
  view_count: number;
  download_count: number;
  favorite_count: number;
  created_at: string;
  profiles?: {
    full_name: string | null;
  };
  is_favorited?: boolean;
}

export default function PetitionPool() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [petitions, setPetitions] = useState<PublicPetition[]>([]);
  const [filteredPetitions, setFilteredPetitions] = useState<PublicPetition[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedPetition, setSelectedPetition] = useState<PublicPetition | null>(null);
  const [favoritedPetitions, setFavoritedPetitions] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchPetitions();
  }, []);

  useEffect(() => {
    filterPetitions();
  }, [searchQuery, selectedType, petitions]);

  const fetchPetitions = async () => {
    try {
      // Try with profiles join first
      let { data, error } = await supabase
        .from('public_petitions')
        .select(`
          *,
          profiles (full_name)
        `)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      // If foreign key relationship doesn't exist yet, try without profiles join
      if (error && error.code === 'PGRST200') {
        console.log('Profiles relationship not found, fetching without join...');
        const result = await supabase
          .from('public_petitions')
          .select('*')
          .eq('status', 'active')
          .order('created_at', { ascending: false });
        
        data = result.data;
        error = result.error;
      }

      if (error) {
        // Table doesn't exist
        if (error.code === '42P01') {
          console.log('public_petitions table does not exist yet. Please run the migration.');
          setPetitions([]);
          return;
        }
        throw error;
      }
      
      setPetitions(data || []);
      
      // Fetch user's favorited petitions if logged in
      if (user) {
        fetchUserFavorites();
      }
    } catch (error: any) {
      console.error('Error fetching petitions:', error);
      setPetitions([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserFavorites = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('petition_favorites')
        .select('petition_id')
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      const favoriteIds = new Set((data || []).map(f => f.petition_id));
      setFavoritedPetitions(favoriteIds);
    } catch (error) {
      console.error('Error fetching favorites:', error);
    }
  };

  const filterPetitions = () => {
    let filtered = petitions;

    if (selectedType !== 'all') {
      filtered = filtered.filter(p => p.petition_type === selectedType);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.title.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query) ||
        p.tags?.some(tag => tag.toLowerCase().includes(query))
      );
    }

    setFilteredPetitions(filtered);
  };

  const handleToggleFavorite = async (petitionId: string) => {
    if (!user) {
      toast.error('Favorilere eklemek için giriş yapmalısınız');
      navigate('/login');
      return;
    }

    try {
      const { data, error } = await supabase.rpc('toggle_petition_favorite', {
        p_petition_id: petitionId,
        p_user_id: user.id
      });

      if (error) throw error;

      const result = data[0];
      const isFavorited = result.is_favorited;
      const newCount = result.new_count;

      // Update local state
      setFavoritedPetitions(prev => {
        const next = new Set(prev);
        if (isFavorited) {
          next.add(petitionId);
        } else {
          next.delete(petitionId);
        }
        return next;
      });

      // Update petition favorite count in list
      setPetitions(prev => prev.map(p => 
        p.id === petitionId ? { ...p, favorite_count: newCount } : p
      ));

      toast.success(isFavorited ? 'Favorilere eklendi! ⭐' : 'Favorilerden çıkarıldı');
    } catch (error: any) {
      console.error('Error toggling favorite:', error);
      toast.error('Bir hata oluştu');
    }
  };

  const handleViewPetition = async (petition: PublicPetition) => {
    setSelectedPetition(petition);

    // Increment views
    try {
      await supabase.rpc('increment_petition_views', { petition_id: petition.id });
    } catch (error) {
      console.error('Error incrementing views:', error);
    }
  };

  const handleUsePetition = async (petition: PublicPetition) => {
    if (!user) {
      toast.error('Dilekçeyi kullanmak için giriş yapmalısınız');
      navigate('/login');
      return;
    }

    try {
      // Copy petition to user's account
      const { error } = await supabase
        .from('petitions')
        .insert({
          user_id: user.id,
          title: `${petition.title} (Kopyalandı)`,
          petition_type: petition.petition_type,
          content: petition.content,
          metadata: {
            source: 'petition_pool',
            original_id: petition.id
          }
        });

      if (error) throw error;

      // Increment downloads count using RPC function
      await supabase.rpc('increment_petition_downloads', { petition_id: petition.id });

      toast.success('Dilekçe hesabınıza kopyalandı!');
      navigate('/profile');
    } catch (error: any) {
      console.error('Error copying petition:', error);
      toast.error('Dilekçe kopyalanamadı');
    }
  };

  const petitionTypes = Object.values(PetitionType);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col">
        <Header onShowLanding={() => navigate('/')} />
        <div className="flex-grow flex items-center justify-center">
          <div className="text-white text-xl">Yükleniyor...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200">
      <Header onShowLanding={() => navigate('/')} />
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <span className="text-4xl">📚</span>
            Dilekçe Havuzu
          </h1>
          <p className="text-gray-400">Topluluk tarafından paylaşılan dilekçelere göz atın ve kullanın</p>
        </div>

        {/* Filters */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8 border border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Arama</label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Dilekçe adı, açıklama veya etiket ara..."
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-gray-200 placeholder-gray-400 focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>

            {/* Type Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Dilekçe Türü</label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-gray-200 focus:ring-2 focus:ring-red-500 focus:border-red-500"
              >
                <option value="all">Tümü</option>
                {petitionTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Results Count */}
        <div className="mb-4 text-gray-400">
          {filteredPetitions.length} dilekçe bulundu
        </div>

        {/* Petitions Grid */}
        {filteredPetitions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">Henüz paylaşılmış dilekçe yok</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPetitions.map(petition => (
              <div
                key={petition.id}
                className="bg-gray-800 rounded-lg border border-gray-700 hover:border-red-500 transition-all duration-300 overflow-hidden group"
              >
                {/* Card Header */}
                <div className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <span className="px-3 py-1 bg-red-600 text-white text-xs font-semibold rounded-full">
                      {petition.petition_type}
                    </span>
                    {petition.is_premium && (
                      <span className="px-3 py-1 bg-yellow-500 text-gray-900 text-xs font-bold rounded-full">
                        ⭐ Premium
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-bold text-white mb-2 group-hover:text-red-400 transition-colors">
                    {petition.title}
                  </h3>

                  <p className="text-gray-400 text-sm mb-4 line-clamp-2">
                    {petition.description || 'Açıklama yok'}
                  </p>

                  {/* Tags */}
                  {petition.tags && petition.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {petition.tags.slice(0, 3).map((tag, idx) => (
                        <span key={idx} className="px-2 py-1 bg-gray-700 text-gray-300 text-xs rounded">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Stats */}
                  <div className="flex items-center gap-4 text-sm text-gray-400 mb-4">
                    <span className="flex items-center gap-1">
                      ⭐ {petition.favorite_count || 0}
                    </span>
                    <span className="flex items-center gap-1">
                      👁️ {petition.view_count || 0}
                    </span>
                    <span className="flex items-center gap-1">
                      📥 {petition.download_count || 0}
                    </span>
                  </div>

                  {/* Author */}
                  <p className="text-xs text-gray-500">
                    {petition.profiles?.full_name || 'Anonim'} • {new Date(petition.created_at).toLocaleDateString('tr-TR')}
                  </p>
                </div>

                {/* Actions */}
                <div className="bg-gray-750 border-t border-gray-700 p-4 flex gap-2">
                  <button
                    onClick={() => handleViewPetition(petition)}
                    className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm font-medium"
                  >
                    👁️ Önizle
                  </button>
                  <button
                    onClick={() => handleToggleFavorite(petition.id)}
                    className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                      favoritedPetitions.has(petition.id)
                        ? 'bg-yellow-500 hover:bg-yellow-600 text-gray-900'
                        : 'bg-gray-700 hover:bg-yellow-500 hover:text-gray-900 text-white'
                    }`}
                    title={favoritedPetitions.has(petition.id) ? 'Favorilerden çıkar' : 'Favorilere ekle'}
                  >
                    ⭐
                  </button>
                  <button
                    onClick={() => handleUsePetition(petition)}
                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors text-sm font-medium"
                  >
                    📥 Kullan
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {selectedPetition && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setSelectedPetition(null)}>
          <div className="bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">{selectedPetition.title}</h2>
              <button onClick={() => setSelectedPetition(null)} className="text-gray-400 hover:text-white text-2xl">×</button>
            </div>
            <div className="p-6">
              <div className="prose prose-invert max-w-none">
                <div dangerouslySetInnerHTML={{ __html: selectedPetition.content }} />
              </div>
            </div>
            <div className="p-6 border-t border-gray-700 flex gap-4">
              <button
                onClick={() => handleUsePetition(selectedPetition)}
                className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors font-semibold"
              >
                📥 Bu Dilekçeyi Kullan
              </button>
              <button
                onClick={() => setSelectedPetition(null)}
                className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
