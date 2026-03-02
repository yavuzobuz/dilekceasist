import React from 'react';
import { Link } from 'react-router-dom';
import { Mail, MapPin, Phone } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-gray-900 border-t border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center space-x-2 mb-4">
              <img src="/logo.png" alt="DilekAI Logo" className="w-8 h-8" />
              <span className="text-2xl font-bold text-white">
                Dilek<span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-red-400">AI</span>
              </span>
            </div>
            <p className="text-gray-400 mb-4">
              Yapay zeka destekli belge oluşturma platformu. Dilekçe, sözleşme ve ihtarname süreçlerini hızlandırın.
            </p>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-4">Hızlı Linkler</h3>
            <ul className="space-y-2">
              <li><Link to="/" className="text-gray-400 hover:text-red-500 transition-colors">Ana Sayfa</Link></li>
              <li><Link to="/about" className="text-gray-400 hover:text-red-500 transition-colors">Hakkında</Link></li>
              <li><Link to="/faq" className="text-gray-400 hover:text-red-500 transition-colors">SSS</Link></li>
              <li><Link to="/fiyatlandirma" className="text-gray-400 hover:text-red-500 transition-colors">Fiyatlandırma</Link></li>
              <li><Link to="/petition-pool" className="text-gray-400 hover:text-red-500 transition-colors">Dilekçe Havuzu</Link></li>
              <li><Link to="/app" className="text-gray-400 hover:text-red-500 transition-colors">Dilekçe Oluştur</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-4">İletişim</h3>
            <ul className="space-y-3">
              <li className="flex items-start space-x-3 text-gray-400">
                <Mail className="w-5 h-5 mt-0.5 flex-shrink-0 text-red-500" />
                <span>info@dilekai.com</span>
              </li>
              <li className="flex items-start space-x-3 text-gray-400">
                <Phone className="w-5 h-5 mt-0.5 flex-shrink-0 text-red-500" />
                <span>+90 (212) 123 45 67</span>
              </li>
              <li className="flex items-start space-x-3 text-gray-400">
                <MapPin className="w-5 h-5 mt-0.5 flex-shrink-0 text-red-500" />
                <span>İstanbul, Türkiye</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-8 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-gray-400 text-sm">© 2026 DilekAI. Tüm hakları saklıdır.</p>
          <div className="flex space-x-6 mt-4 md:mt-0">
            <Link to="/gizlilik" className="text-gray-400 hover:text-red-500 text-sm transition-colors">Gizlilik Politikası</Link>
            <Link to="/kullanim-kosullari" className="text-gray-400 hover:text-red-500 text-sm transition-colors">Kullanım Şartları</Link>
            <Link to="/cerez-politikasi" className="text-gray-400 hover:text-red-500 text-sm transition-colors">Çerez Politikası</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

