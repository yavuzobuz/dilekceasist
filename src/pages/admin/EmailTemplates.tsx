import React, { useState } from 'react';
import {
    Mail, Save, Eye, X, Edit2, RefreshCw,
    Send, Code, CheckCircle, Loader2
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface EmailTemplate {
    id: string;
    name: string;
    subject: string;
    body: string;
    type: 'welcome' | 'password_reset' | 'petition_ready' | 'announcement';
    variables: string[];
    lastUpdated: string;
}

const DEMO_TEMPLATES: EmailTemplate[] = [
    {
        id: '1',
        name: 'Hoşgeldin E-postası',
        subject: 'Hukuk Asistanı\'na Hoşgeldiniz!',
        body: `Sayın {{USER_NAME}},

Hukuk Asistanı platformumuza hoşgeldiniz!

Artık yapay zeka destekli dilekçe oluşturma aracımızı kullanarak profesyonel hukuki belgeler hazırlayabilirsiniz.

Hemen başlamak için: {{LOGIN_URL}}

Sorularınız için destek ekibimize ulaşabilirsiniz.

Saygılarımızla,
Hukuk Asistanı Ekibi`,
        type: 'welcome',
        variables: ['USER_NAME', 'LOGIN_URL'],
        lastUpdated: '2025-01-01'
    },
    {
        id: '2',
        name: 'Şifre Sıfırlama',
        subject: 'Şifre Sıfırlama Talebiniz',
        body: `Sayın {{USER_NAME}},

Hesabınız için şifre sıfırlama talebinde bulundunuz.

Şifrenizi sıfırlamak için aşağıdaki linke tıklayın:
{{RESET_LINK}}

Bu linkin geçerlilik süresi 1 saattir.

Eğer bu talebi siz yapmadıysanız, bu e-postayı dikkate almayınız.

Saygılarımızla,
Hukuk Asistanı Ekibi`,
        type: 'password_reset',
        variables: ['USER_NAME', 'RESET_LINK'],
        lastUpdated: '2025-01-01'
    },
    {
        id: '3',
        name: 'Dilekçe Hazır',
        subject: 'Dilekçeniz Hazırlandı: {{PETITION_TITLE}}',
        body: `Sayın {{USER_NAME}},

"{{PETITION_TITLE}}" başlıklı dilekçeniz hazırlanmıştır.

Dilekçenizi görüntülemek ve indirmek için:
{{PETITION_URL}}

Dilekçe Türü: {{PETITION_TYPE}}
Oluşturma Tarihi: {{CREATED_DATE}}

Saygılarımızla,
Hukuk Asistanı Ekibi`,
        type: 'petition_ready',
        variables: ['USER_NAME', 'PETITION_TITLE', 'PETITION_TYPE', 'PETITION_URL', 'CREATED_DATE'],
        lastUpdated: '2025-01-01'
    },
    {
        id: '4',
        name: 'Genel Duyuru',
        subject: '{{SUBJECT}}',
        body: `Sayın {{USER_NAME}},

{{ANNOUNCEMENT_CONTENT}}

Saygılarımızla,
Hukuk Asistanı Ekibi`,
        type: 'announcement',
        variables: ['USER_NAME', 'SUBJECT', 'ANNOUNCEMENT_CONTENT'],
        lastUpdated: '2025-01-01'
    }
];

const typeLabels = {
    welcome: 'Hoşgeldin',
    password_reset: 'Şifre Sıfırlama',
    petition_ready: 'Dilekçe Hazır',
    announcement: 'Duyuru'
};

export const EmailTemplates: React.FC = () => {
    const [templates, setTemplates] = useState<EmailTemplate[]>(DEMO_TEMPLATES);
    const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!editingTemplate) return;
        setSaving(true);
        await new Promise(resolve => setTimeout(resolve, 1000));
        setTemplates(templates.map(t =>
            t.id === editingTemplate.id
                ? { ...editingTemplate, lastUpdated: new Date().toISOString().split('T')[0] }
                : t
        ));
        setSaving(false);
        setEditingTemplate(null);
        toast.success('Şablon kaydedildi');
    };

    const handleSendTest = () => {
        toast.success('Test e-postası gönderildi (demo)');
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('tr-TR');
    };

    const getPreviewContent = (template: EmailTemplate) => {
        let content = template.body;
        const demoValues: Record<string, string> = {
            USER_NAME: 'Ahmet Yılmaz',
            LOGIN_URL: 'https://hukukasistani.com/login',
            RESET_LINK: 'https://hukukasistani.com/reset/abc123',
            PETITION_TITLE: 'İş Akdi Fesih İhtarnamesi',
            PETITION_TYPE: 'İş Hukuku',
            PETITION_URL: 'https://hukukasistani.com/petition/123',
            CREATED_DATE: new Date().toLocaleDateString('tr-TR'),
            SUBJECT: 'Önemli Güncelleme',
            ANNOUNCEMENT_CONTENT: 'Platformumuzda önemli güncellemeler yapılmıştır.'
        };

        Object.entries(demoValues).forEach(([key, value]) => {
            content = content.replace(new RegExp(`{{${key}}}`, 'g'), value);
        });

        return content;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-white">E-posta Şablonları</h1>
                <p className="text-gray-400">Sistem e-postalarının içeriklerini düzenleyin</p>
            </div>

            {/* Templates Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {templates.map(template => (
                    <div
                        key={template.id}
                        className="bg-gray-800 rounded-xl border border-gray-700 p-5 hover:border-red-500/50 transition-colors"
                    >
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-red-600/20 rounded-lg">
                                    <Mail className="w-5 h-5 text-red-400" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-white">{template.name}</h3>
                                    <span className="text-xs px-2 py-0.5 bg-gray-700 rounded text-gray-400">
                                        {typeLabels[template.type]}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <p className="text-sm text-gray-400 mb-3 line-clamp-2">
                            Konu: {template.subject}
                        </p>

                        <div className="flex items-center gap-1 mb-4 flex-wrap">
                            {template.variables.map(v => (
                                <span key={v} className="text-xs px-1.5 py-0.5 bg-blue-900/30 text-blue-400 rounded">
                                    {`{{${v}}}`}
                                </span>
                            ))}
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-gray-700">
                            <span className="text-xs text-gray-500">
                                Güncelleme: {formatDate(template.lastUpdated)}
                            </span>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => {
                                        setEditingTemplate(template);
                                        setShowPreview(true);
                                    }}
                                    className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
                                    title="Önizle"
                                >
                                    <Eye className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => {
                                        setEditingTemplate(template);
                                        setShowPreview(false);
                                    }}
                                    className="p-2 hover:bg-blue-600 rounded-lg text-blue-400 hover:text-white transition-colors"
                                    title="Düzenle"
                                >
                                    <Edit2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Edit/Preview Modal */}
            {editingTemplate && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-900 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-700">
                        <div className="flex items-center justify-between p-6 border-b border-gray-700">
                            <div className="flex items-center gap-2">
                                <h2 className="text-xl font-bold text-white">
                                    {showPreview ? 'Önizleme' : 'Şablonu Düzenle'}
                                </h2>
                                <button
                                    onClick={() => setShowPreview(!showPreview)}
                                    className={`px-3 py-1 text-sm rounded-lg transition-colors ${showPreview ? 'bg-gray-700 text-gray-300' : 'bg-blue-600 text-white'
                                        }`}
                                >
                                    {showPreview ? 'Düzenle' : 'Önizle'}
                                </button>
                            </div>
                            <button onClick={() => setEditingTemplate(null)} className="p-2 hover:bg-gray-700 rounded-lg text-gray-400">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6">
                            {showPreview ? (
                                <div className="bg-white text-gray-900 rounded-lg p-6 font-sans">
                                    <h3 className="text-lg font-semibold mb-4 pb-4 border-b">
                                        {editingTemplate.subject.replace(/{{.*?}}/g, 'Örnek Konu')}
                                    </h3>
                                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                                        {getPreviewContent(editingTemplate)}
                                    </pre>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-1">Şablon Adı</label>
                                        <input
                                            type="text"
                                            value={editingTemplate.name}
                                            onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                                            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-1">Konu</label>
                                        <input
                                            type="text"
                                            value={editingTemplate.subject}
                                            onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                                            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-1">
                                            İçerik <span className="text-gray-500">({'{{DEGISKEN}}'} formatında değişkenler kullanın)</span>
                                        </label>
                                        <textarea
                                            value={editingTemplate.body}
                                            onChange={(e) => setEditingTemplate({ ...editingTemplate, body: e.target.value })}
                                            rows={12}
                                            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white font-mono text-sm resize-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-300 mb-1">Kullanılabilir Değişkenler</label>
                                        <div className="flex flex-wrap gap-2">
                                            {editingTemplate.variables.map(v => (
                                                <code key={v} className="px-2 py-1 bg-gray-700 text-blue-400 rounded text-xs">
                                                    {`{{${v}}}`}
                                                </code>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center justify-between p-6 border-t border-gray-700">
                            <button
                                onClick={handleSendTest}
                                className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                            >
                                <Send className="w-4 h-4" />
                                Test Gönder
                            </button>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setEditingTemplate(null)}
                                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
                                >
                                    İptal
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50"
                                >
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    Kaydet
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EmailTemplates;
