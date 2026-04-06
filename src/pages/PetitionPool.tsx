import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Header } from '../../components/Header';
import { Footer } from '../../components/Footer';
import { toast } from 'react-hot-toast';
import { PetitionType } from '../../types';
import { BookOpenIcon, StarIcon, StarSolidIcon, EyeIcon, ArrowDownCircleIcon, XMarkIcon } from '../../components/Icon';
import { sanitizeHtml } from '../utils/sanitizeHtml';

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
  const maskSensitivePetitionPreview = (rawText: string): string => {
    const normalizeTr = (value: string): string => String(value || '')
      .toLocaleLowerCase('tr-TR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\u0131/g, 'i')
      .replace(/[^a-z0-9\s/.-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const maskPersonalName = (value: string): string => {
      const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
      if (parts.length < 2) return '[Kisisel Veri Maskelendi]';

      const maskWord = (word: string): string => {
        const chars = Array.from(word);
        if (chars.length <= 1) return chars[0] || '';
        return `${chars[0]}${'*'.repeat(Math.max(1, chars.length - 1))}`;
      };

      return parts.map(maskWord).join(' ');
    };

    const personalRolePattern = /\b(muvekkil|müvekkil|davaci|davacı|davali|davalı|sanik|sanık|supheli|şüpheli|musteki|müşteki|tanik|tanık|borclu|borçlu|alacakli|alacaklı|mirasbirakan|muris|vekil)\s+([A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?:\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+){1,3})/gu;
    const standalonePersonPattern = /\b([A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?:\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+){1,2})\b/gu;
    const isInstitutionName = (value: string): boolean => {
      const normalized = normalizeTr(value);
      return [
        'bakanligi',
        'belediyesi',
        'belediye baskanligi',
        'universitesi',
        'anonim sirketi',
        'limited sirketi',
        'genel mudurlugu',
        'mudurlugu',
        'valiligi',
        'kaymakamligi',
        'cumhuriyet bassavciligi',
        'il mudurlugu',
        'sgk',
        'vergi dairesi',
        'bankasi',
        'kurumu',
        'belediye',
        'bakanlik',
      ].some((token) => normalized.includes(token));
    };

    const maskCourtName = (line: string): string => {
      const upperLine = String(line || '').toLocaleUpperCase('tr-TR');
      const suffixMatch = upperLine.match(/(ASL[Iİ]YE HUKUK|ASL[Iİ]YE CEZA|SULH HUKUK|SULH CEZA|A[Iİ]LE MAHKEMES[Iİ]|[İI]DARE MAHKEMES[Iİ]|VERG[Iİ] MAHKEMES[Iİ]|T[Iİ]CARET MAHKEMES[Iİ]|[İI]Ş MAHKEMES[Iİ]|TÜKET[Iİ]C[Iİ] MAHKEMES[Iİ]|İCRA HUKUK MAHKEMESİ|İCRA CEZA MAHKEMESİ|BÖLGE ADLİYE MAHKEMESİ|YARGITAY|DANIŞTAY|ANAYASA MAHKEMESİ)/u);
      if (!suffixMatch) return '******';
      return `****** ${suffixMatch[1]}`;
    };

    const maskPartyHeadingNames = (text: string): string => {
      return text.replace(
        /^(\s*(?:İSTİNAF EDEN DAVACI|İSTİNAF EDİLEN DAVALILAR|DAVACI|DAVALI|DAVALILAR|DAVACILAR|DAVACI VEKILI|DAVALI VEKILI)\s*:?\s*)(.+)$/gim,
        (_, prefix: string, rawValue: string) => {
          const value = String(rawValue || '').trim();
          if (!value) return `${prefix}${value}`;
          if (isInstitutionName(value)) return `${prefix}${value}`;

          const maskedValue = value
            .replace(/\((?:T\.?C\.?\s*Kimlik\s*No|TCKN)[^)]+\)/gi, '(T.C. Kimlik No: [Maskelendi])')
            .replace(/^(\d+\.\s*)?([A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?:\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+){1,3})/u, (_m: string, indexPrefix = '', fullName: string) => `${indexPrefix}${maskPersonalName(fullName)}`);

          return `${prefix}${maskedValue}`;
        }
      );
    };

    const maskNarrativePersonNames = (text: string): string => {
      let result = text.replace(personalRolePattern, (_m: string, role: string, fullName: string) => {
        if (isInstitutionName(fullName)) return `${role} ${fullName}`;
        return `${role} ${maskPersonalName(fullName)}`;
      });

      result = result.replace(standalonePersonPattern, (fullName: string, _group: string, offset: number, source: string) => {
        if (isInstitutionName(fullName)) return fullName;

        const before = source.slice(Math.max(0, offset - 24), offset).toLocaleLowerCase('tr-TR');
        const after = source.slice(offset + fullName.length, offset + fullName.length + 24).toLocaleLowerCase('tr-TR');
        const contextualPersonHint = /(muvekkil|müvekkil|davaci|davacı|davali|davalı|sanik|sanık|supheli|şüpheli|musteki|müşteki|tanik|tanık|borclu|borçlu|alacakli|alacaklı|mirasbirakan|muris|vekil)/.test(before)
          || /(\(|,|\.)\s*(t\.?c\.?|adres|ikamet|malik|lehine|adina|adına)/.test(after);

        if (!contextualPersonHint) return fullName;
        return maskPersonalName(fullName);
      });

      return result;
    };

    let masked = String(rawText || '')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^(\s*Adres\s*:?\s*)(.+)$/gim, '$1[Maskelendi]')
      .replace(/^(\s*VEK[Iİ]L[Iİ]\s*:?\s*)(.+)$/gim, '$1[Maskelendi]');

    masked = maskPartyHeadingNames(masked);
    masked = maskNarrativePersonNames(masked);

    return masked
      .replace(/(TCKN\s*[:：]?\s*)(\d{3})\d{5}(\d{3})/gi, '$1$2*****$3')
      .replace(/(TC\s*Kimlik\s*No\s*[:：]?\s*)(\d{3})\d{5}(\d{3})/gi, '$1$2*****$3')
      .replace(/(Dosya\s*(?:No|Numarasi|Numarası)\s*[:：]?\s*)([^\n<]+)/gi, '$1[Maskelendi]')
      .replace(/\b(\d{4})\/(\d+)\s*([EK])\.?/gi, (_m: string, year: string, _seq: string, suffix: string) => `${year}/**** ${suffix}.`)
      .replace(/^.*\b(MAHKEMESI|MAHKEMESİ|BASSAVCILIGI|BAŞSAVCILIĞI|SAVCILIGI|SAVCILIĞI)\b.*$/gim, (line: string) => maskCourtName(line))
      .replace(/([A-ZÇĞİÖŞÜ][a-zçğıöşü]+\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+)\s*\(TCKN/gu, (_m: string, fullName: string) => `${maskPersonalName(fullName)} (TCKN`);
  };

  const convertPetitionPreviewToHtml = (rawText: string): string => {
    const maskedText = maskSensitivePetitionPreview(rawText)
      .replace(/\r\n/g, '\n')
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/^\s*\*\s+/gm, '• ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const html = maskedText
      .split('\n')
      .map((line) => line.trim())
      .map((line) => {
        if (!line) return '<div style="height:16px"></div>';
        const isHeading = /^[A-ZÇĞİÖŞÜ0-9\s./()'-]{12,}$/.test(line) || /^(KONU|ACIKLAMALAR|SONUC|TALEP|DELILLER|HUKUKI NEDENLER)\b/i.test(line);
        return isHeading
          ? `<p style="font-weight:700; letter-spacing:0.02em; margin:0 0 12px 0;">${sanitizeHtml(line)}</p>`
          : `<p style="margin:0 0 12px 0; text-align:justify;">${sanitizeHtml(line)}</p>`;
      })
      .join('');

    return sanitizeHtml(html);
  };

  const [petitions, setPetitions] = useState<PublicPetition[]>([]);
  const [filteredPetitions, setFilteredPetitions] = useState<PublicPetition[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedPetition, setSelectedPetition] = useState<PublicPetition | null>(null);
  const [favoritedPetitions, setFavoritedPetitions] = useState<Set<string>>(new Set());
  const sanitizedSelectedPetitionContent = React.useMemo(
    () => convertPetitionPreviewToHtml(selectedPetition?.content || ''),
    [selectedPetition?.content]
  );

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
        if (import.meta.env.DEV) {
          console.warn('Profiles relationship not found, fetching without join...');
        }
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
          if (import.meta.env.DEV) {
            console.warn('public_petitions table does not exist yet. Please run the migration.');
          }
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
      <div className="min-h-screen bg-[#0A0A0B] flex flex-col">
        <Header onShowLanding={() => navigate('/')} />
        <div className="flex-grow flex items-center justify-center">
          <div className="text-white text-xl">Yükleniyor...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-gray-200">
      <Header onShowLanding={() => navigate('/')} />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <BookOpenIcon className="w-8 h-8 text-red-500" />
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
                      <StarIcon className="w-4 h-4" /> {petition.favorite_count || 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <EyeIcon className="w-4 h-4" /> {petition.view_count || 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <ArrowDownCircleIcon className="w-4 h-4" /> {petition.download_count || 0}
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
                    className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm font-medium flex items-center justify-center gap-2"
                  >
                    <EyeIcon className="w-4 h-4" /> Önizle
                  </button>
                  <button
                    onClick={() => handleToggleFavorite(petition.id)}
                    className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium ${favoritedPetitions.has(petition.id)
                      ? 'bg-yellow-500 hover:bg-yellow-600 text-gray-900'
                      : 'bg-gray-700 hover:bg-yellow-500 hover:text-gray-900 text-white'
                      }`}
                    title={favoritedPetitions.has(petition.id) ? 'Favorilerden çıkar' : 'Favorilere ekle'}
                  >
                    {favoritedPetitions.has(petition.id) ? <StarSolidIcon className="w-5 h-5" /> : <StarIcon className="w-5 h-5" />}
                  </button>
                  <button
                    onClick={() => handleUsePetition(petition)}
                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors text-sm font-medium flex items-center justify-center gap-2"
                  >
                    <ArrowDownCircleIcon className="w-4 h-4" /> Kullan
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {selectedPetition && (
        <div className="fixed inset-0 bg-black/80 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={() => setSelectedPetition(null)}>
          <div className="bg-gray-800 rounded-t-2xl sm:rounded-lg w-full sm:max-w-4xl max-h-[90vh] overflow-hidden border-t sm:border border-gray-700 flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 sm:p-6 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
              <h2 className="text-lg sm:text-2xl font-bold text-white truncate pr-4">{selectedPetition.title}</h2>
              <button onClick={() => setSelectedPetition(null)} className="text-gray-400 hover:text-white flex-shrink-0">
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>
            <div className="bg-[#111113] p-4 sm:p-6 flex-1 overflow-y-auto">
              <div className="mx-auto max-w-3xl rounded-sm bg-white shadow-2xl shadow-black/30 ring-1 ring-black/10">
                <div className="min-h-[70vh] px-8 py-10 sm:px-14 sm:py-14 font-serif text-[15px] leading-8 text-gray-900">
                  <div dangerouslySetInnerHTML={{ __html: sanitizedSelectedPetitionContent }} />
                </div>
              </div>
            </div>
            <div className="p-4 sm:p-6 border-t border-gray-700 flex flex-col sm:flex-row gap-2 sm:gap-4 flex-shrink-0">
              <button
                onClick={() => handleUsePetition(selectedPetition)}
                className="w-full sm:flex-1 px-4 sm:px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors font-semibold flex items-center justify-center gap-2"
              >
                <ArrowDownCircleIcon className="w-5 h-5" /> Bu Dilekçeyi Kullan
              </button>
              <button
                onClick={() => setSelectedPetition(null)}
                className="w-full sm:w-auto px-4 sm:px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
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
