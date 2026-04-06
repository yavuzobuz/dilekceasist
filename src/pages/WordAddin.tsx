import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, FileCheck, Monitor, Puzzle, RefreshCw, ShieldAlert, Terminal } from 'lucide-react';
import { Header } from '../../components/Header';
import { Footer } from '../../components/Footer';

type ManifestCard = {
  name: string;
  href: string;
  minWordApi: string;
  summary: string;
  recommended?: boolean;
};

const manifests: ManifestCard[] = [
  {
    name: 'Standart Manifest (Önerilen)',
    href: '/manifest.xml',
    minWordApi: '1.1',
    summary: 'En geniş uyumluluk. Eski Word sürümlerinde çalışma olasılığı daha yüksektir.',
    recommended: true,
  },
  {
    name: 'Gelişmiş Manifest',
    href: '/office/word/manifest.xml',
    minWordApi: '1.3',
    summary: 'Yeni Word sürümlerinde daha güncel API kabiliyeti sunar.',
  },
];

const manualInstall2021Steps = [
  'Word\'ü açın ve Geliştirici sekmesine tıklayın.',
  'Geliştirici sekmesi yoksa: Dosya > Seçenekler > Şeridi Özelleştir > Geliştirici kutusunu işaretleyin.',
  'Geliştirici > Word Eklentileri menüsüne tıklayın.',
  'Eklentilerimi Yönet > Dosyadan Yükle seçeneğine tıklayın.',
  'İndirdiğiniz manifest.xml dosyasını seçin.',
  'Eklenti paneli açılacaktır, kullanmaya başlayabilirsiniz.',
];

const troubleshooting = [
  'Eski arayüz görünüyorsa eklentiyi kaldırıp yeniden yükleyin.',
  'Word uygulamasını tamamen kapatıp tekrar açın.',
  'Aynı anda birden fazla manifest yüklemeyin; tek bir manifest kullanın.',
  'Kurumsal dağıtım için Microsoft 365 Admin Center ile merkezi yükleme önerilir.',
];

export default function WordAddin() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0A0A0B] flex flex-col">
      <Header onShowLanding={() => navigate('/')} />

      <main className="flex-grow">
        <section className="py-16 px-4">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-10">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-600 mb-4">
                <Puzzle className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-3xl sm:text-5xl font-bold text-white mb-3">Word Eklentisi Kurulumu</h1>
              <p className="text-lg text-gray-300 max-w-3xl mx-auto">
                Web sitesi üzerinden manifest indirip Word eklentisini kurabilirsiniz.
                Kullanıcıya `docx` değil, manifest (`.xml`) dağıtılır.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
              <div className="rounded-xl border border-red-500/60 p-6 bg-gray-900 md:col-span-2">
                <div className="flex items-center gap-3 mb-3">
                  <Terminal className="w-5 h-5 text-red-400" />
                  <h2 className="text-xl font-semibold text-white">Otomatik Kurulum Aracı (.bat)</h2>
                </div>
                <p className="text-gray-300 text-sm mb-4">
                  Windows terminal üzerinden kurulum için hazırlanmıştır.
                  Manifesti indirir, Office önbelleğini temizler ve Word\'e sideload eder.
                </p>
                <div className="flex flex-wrap gap-3">
                  <a
                    href="/office/word/install-word-addin.bat"
                    download
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Kurulum Aracını İndir (.bat)
                  </a>
                  <a
                    href="/office/word/install-word-addin.bat"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white font-medium transition-colors"
                  >
                    <FileCheck className="w-4 h-4" />
                    İçeriği Gör
                  </a>
                </div>
              </div>

              {manifests.map((manifest) => (
                <div
                  key={manifest.href}
                  className={`rounded-xl border p-6 bg-gray-900 ${manifest.recommended ? 'border-red-500/60' : 'border-gray-700'}`}
                >
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <h2 className="text-xl font-semibold text-white">{manifest.name}</h2>
                    {manifest.recommended && (
                      <span className="text-xs px-2 py-1 rounded-full bg-red-600/20 text-red-300 border border-red-500/40">
                        Önerilen
                      </span>
                    )}
                  </div>

                  <p className="text-gray-300 text-sm mb-3">{manifest.summary}</p>
                  <p className="text-xs text-gray-400 mb-5">Minimum WordApi: {manifest.minWordApi}</p>

                  <div className="flex flex-wrap gap-3">
                    <a
                      href={manifest.href}
                      download
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Manifesti İndir
                    </a>
                    <a
                      href={manifest.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white font-medium transition-colors"
                    >
                      <FileCheck className="w-4 h-4" />
                      Manifesti Aç
                    </a>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
                <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                  <Monitor className="w-5 h-5 text-red-400" />
                  Manuel Kurulum (Word 2021 ve sonrası)
                </h3>
                <ol className="space-y-3">
                  {manualInstall2021Steps.map((item, index) => (
                    <li key={item} className="text-gray-300 flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                        {index + 1}
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
                <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-red-400" />
                  Sürüm Farkı ve Notlar
                </h3>
                <ul className="space-y-3 text-gray-300">
                  <li>Eski Word sürümleri için önce Standart Manifest (WordApi 1.1) deneyin.</li>
                  <li>Yeni Microsoft 365 Word kullananlar Gelişmiş Manifest (1.3) ile devam edebilir.</li>
                  <li>Kurumsal ekipler için merkezi dağıtım (Admin Center) önerilir.</li>
                </ul>

                <div className="mt-6 pt-5 border-t border-gray-700">
                  <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-red-400" />
                    Sorun Giderme
                  </h4>
                  <ul className="space-y-2 text-sm text-gray-400">
                    {troubleshooting.map((item) => (
                      <li key={item}>- {item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="mt-10 text-center">
              <button
                onClick={() => navigate('/faq')}
                className="px-6 py-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-white font-medium transition-colors"
              >
                Kurulum SSS Sayfasına Git
              </button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
