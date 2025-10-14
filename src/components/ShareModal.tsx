import React, { useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toast } from 'react-hot-toast';
import { Petition } from '../../lib/supabase';

interface ShareModalProps {
  petition: Petition;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({ petition, isOpen, onClose, onSuccess }) => {
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [isPremium, setIsPremium] = useState(false);
  const [price, setPrice] = useState('0');
  const [isSharing, setIsSharing] = useState(false);

  if (!isOpen) return null;

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSharing(true);

    try {
      // Parse tags
      const tagArray = tags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);

      const { error } = await supabase
        .from('public_petitions')
        .insert({
          user_id: petition.user_id,
          original_petition_id: petition.id,
          title: petition.title,
          petition_type: petition.petition_type,
          content: petition.content,
          description: description.trim() || null,
          tags: tagArray.length > 0 ? tagArray : null,
          is_premium: isPremium,
          price: isPremium ? parseFloat(price) : 0,
          status: 'active'
        });

      if (error) throw error;

      toast.success('Dilekçe başarıyla paylaşıldı! 🎉');
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error sharing petition:', error);
      toast.error('Dilekçe paylaşılamadı');
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <span>📤</span>
            Dilekçeyi Paylaş
          </h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleShare} className="p-6 space-y-6">
          {/* Petition Info */}
          <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600">
            <h3 className="font-semibold text-white mb-1">{petition.title}</h3>
            <p className="text-sm text-gray-400">{petition.petition_type}</p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Açıklama <span className="text-gray-500">(İsteğe Bağlı)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-gray-200 placeholder-gray-400 focus:ring-2 focus:ring-red-500 focus:border-red-500"
              placeholder="Bu dilekçe hakkında kısa bir açıklama yazın..."
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Etiketler <span className="text-gray-500">(virgülle ayırın)</span>
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-gray-200 placeholder-gray-400 focus:ring-2 focus:ring-red-500 focus:border-red-500"
              placeholder="örn: iş hukuku, tazminat, fesih"
            />
            <p className="text-xs text-gray-500 mt-1">
              Etiketler, diğer kullanıcıların dilekçenizi bulmasına yardımcı olur
            </p>
          </div>

          {/* Premium Toggle */}
          <div className="bg-yellow-900/20 p-4 rounded-lg border border-yellow-600/30">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="premium"
                checked={isPremium}
                onChange={(e) => setIsPremium(e.target.checked)}
                className="mt-1 w-4 h-4 text-yellow-500 bg-gray-700 border-gray-600 rounded focus:ring-yellow-500"
              />
              <div className="flex-1">
                <label htmlFor="premium" className="font-medium text-yellow-400 cursor-pointer">
                  ⭐ Premium Dilekçe (Yakında)
                </label>
                <p className="text-sm text-gray-400 mt-1">
                  Dilekçenizi premium olarak işaretleyin. Premium özellikler yakında aktif edilecek.
                </p>
              </div>
            </div>

            {isPremium && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Fiyat (TL)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-gray-200 placeholder-gray-400 focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                  placeholder="0.00"
                  disabled
                />
                <p className="text-xs text-gray-500 mt-1">
                  Fiyatlandırma özelliği yakında aktif edilecek
                </p>
              </div>
            )}
          </div>

          {/* Warning */}
          <div className="bg-red-900/20 p-4 rounded-lg border border-red-600/30">
            <p className="text-sm text-red-300">
              ⚠️ Paylaştığınız dilekçe herkes tarafından görülebilir olacaktır. Kişisel bilgilerinizi paylaşmadığınızdan emin olun.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-4 pt-4 border-t border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors font-medium"
              disabled={isSharing}
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isSharing}
              className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSharing ? 'Paylaşılıyor...' : '📤 Paylaş'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
