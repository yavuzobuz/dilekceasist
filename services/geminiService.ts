import { GoogleGenAI, Part, Type, FunctionDeclaration, GenerateContentResponse } from "@google/genai";
import { type ChatMessage, type GroundingSource, type GeneratePetitionParams, UploadedFile, WebSearchResult, AnalysisData, UserRole, CaseDetails, ChatContext, LawyerInfo, ContactInfo } from '../types';

// The API_KEY is expected to be set in the execution environment via Vite's import.meta.env
// Using VITE_ prefix is required for Vite to expose the variable to the client
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

if (!apiKey) {
    console.error('⚠️ VITE_GEMINI_API_KEY not found in environment variables!');
    console.error('Please create a .env file with: VITE_GEMINI_API_KEY=your_api_key');
}

const ai = new GoogleGenAI({ apiKey: apiKey || '' });

const formatChatHistoryForPrompt = (history: ChatMessage[]): string => {
    if (history.length === 0) return "Sohbet geçmişi yok.";
    return history.map(msg => `${msg.role === 'user' ? 'Kullanıcı' : 'Asistan'}: ${msg.text}`).join('\n');
};

const formatPartiesForPrompt = (parties: { [key: string]: string }): string => {
    const partyEntries = Object.entries(parties).filter(([, value]) => value.trim() !== '');
    if (partyEntries.length === 0) return "Taraf bilgisi sağlanmadı.";
    
    const labelMap: { [key: string]: string } = {
        plaintiff: 'Davacı',
        defendant: 'Davalı',
        appellant: 'Başvuran / İtiraz Eden',
        counterparty: 'Karşı Taraf',
        complainant: 'Müşteki / Şikayetçi',
        suspect: 'Şüpheli',
        party1: 'Taraf 1',
        party2: 'Taraf 2',
    };

    return partyEntries
        .map(([key, value]) => `${labelMap[key] || key}: ${value}`)
        .join('\n');
};

const formatCaseDetailsForPrompt = (details: CaseDetails): string => {
    const detailEntries = [
        details.court && `Mahkeme: ${details.court}`,
        details.fileNumber && `Dosya Numarası (Esas No): ${details.fileNumber}`,
        details.decisionNumber && `Karar Numarası: ${details.decisionNumber}`,
        details.decisionDate && `Karar Tarihi: ${details.decisionDate}`,
    ].filter(Boolean);

    if (detailEntries.length === 0) return "Dava künye bilgisi sağlanmadı.";
    return detailEntries.join('\n');
}

const formatLawyerInfoForPrompt = (lawyerInfo?: LawyerInfo): string => {
    if (!lawyerInfo || !lawyerInfo.name) return "Vekil bilgisi sağlanmadı.";
    
    const entries = [
        `Ad Soyad: ${lawyerInfo.name}`,
        lawyerInfo.title && `Unvan: ${lawyerInfo.title}`,
        lawyerInfo.bar && `Baro: ${lawyerInfo.bar}`,
        lawyerInfo.barNumber && `Baro Sicil No: ${lawyerInfo.barNumber}`,
        lawyerInfo.address && `Adres: ${lawyerInfo.address}`,
        lawyerInfo.phone && `Telefon: ${lawyerInfo.phone}`,
        lawyerInfo.email && `Email: ${lawyerInfo.email}`,
        lawyerInfo.tcNo && `TC No: ${lawyerInfo.tcNo}`,
    ].filter(Boolean);
    
    return entries.join('\n');
}

const formatContactInfoForPrompt = (contactInfo?: ContactInfo[]): string => {
    if (!contactInfo || contactInfo.length === 0) return "İletişim bilgisi sağlanmadı.";
    
    return contactInfo.map((contact, index) => {
        const entries = [
            `--- Kişi/Kurum ${index + 1} ---`,
            contact.name && `Ad: ${contact.name}`,
            contact.address && `Adres: ${contact.address}`,
            contact.phone && `Telefon: ${contact.phone}`,
            contact.email && `Email: ${contact.email}`,
            contact.tcNo && `TC No: ${contact.tcNo}`,
        ].filter(Boolean);
        return entries.join('\n');
    }).join('\n\n');
}

export async function analyzeDocuments(
    uploadedFiles: UploadedFile[], 
    udfTextContent: string,
    wordTextContent: string
): Promise<AnalysisData> {
    if (uploadedFiles.length === 0 && !udfTextContent && !wordTextContent) {
      throw new Error("Analiz edilecek hiçbir belge veya metin içeriği sağlanmadı.");
    }
    
    const model = 'gemini-2.5-flash';
    const systemInstruction = `Sen Türk hukukunda uzmanlaşmış bir hukuk asistanısın. Görevin, sağlanan belgeleri, resimleri ve metinleri titizlikle analiz etmektir. Temel bilgileri çıkar, tüm potansiyel tarafları (şahıslar, şirketler) belirle ve eğer varsa dava künyesi bilgilerini (mahkeme adı, dosya/esas no, karar no, karar tarihi) tespit et. Ayrıca belgelerden avukat/vekil bilgilerini (isim, baro, baro sicil no, adres, telefon, email) ve diğer iletişim bilgilerini çıkar. Çıktını JSON nesnesi olarak yapılandır. Analiz özetinin HER ZAMAN Türkçe olmasını sağla.`;
    
    const promptText = `
Lütfen SANA GÖNDERİLEN PDF belgelerini, resim dosyalarını ve aşağıdaki metin olarak sağlanan UDF ve Word belgelerinin içeriğini titizlikle analiz et.

**ANA GÖREVLER:**
1. Olayın detaylı ve Türkçe bir özetini oluştur
2. Metinde adı geçen tüm potansiyel tarafları listele
3. Dava künyesi bilgilerini çıkar (mahkeme, dosya numarası, karar numarası, karar tarihi)
4. **ÖNEMLİ:** Avukat/vekil bilgilerini bul ve çıkar:
   - Avukat adı soyadı (genellikle "Av." veya "Avukat" ile başlar)
   - Baro adı ("... Barosu" formatında)
   - Baro sicil numarası
   - İş adresi
   - Telefon numarası
   - Email adresi
5. Diğer iletişim bilgilerini çıkar (tarafların adres, telefon, email bilgileri)

**ARANACAK AVUKAT BİLGİLERİ ÖRNEKLERİ:**
- "Av. [Ad Soyad]"
- "[Baro Adı] Barosu"
- "Baro Sicil No:" veya "Baro Sicil:"
- Adres satırları (genellikle mahalle, cadde, ilçe, il bilgisi içerir)
- Telefon numaraları (0xxx xxx xx xx formatında)
- Email adresleri (@... içeren)

**UDF Belge İçerikleri:**
${udfTextContent || "UDF belgesi yüklenmedi."}

**Word Belge İçerikleri:**
${wordTextContent || "Word belgesi yüklenmedi."}

**ÇIKTI FORMATİ:**
Sonucu 'summary', 'potentialParties', 'caseDetails', 'lawyerInfo' ve 'contactInfo' anahtarlarına sahip bir JSON nesnesi olarak döndür.
`;

    const contentParts: Part[] = [
      { text: promptText },
      ...uploadedFiles.map(file => ({
        inlineData: {
          mimeType: file.mimeType,
          data: file.data
        }
      }))
    ];

    const MAX_RETRIES = 3;
    const INITIAL_DELAY_MS = 1000;
    let lastError: any = new Error("Belge analizi denemeleri başarısız oldu.");

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const response = await ai.models.generateContent({
                model,
                contents: { parts: contentParts },
                config: {
                    systemInstruction: systemInstruction,
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            summary: { type: Type.STRING, description: 'Documentsların detaylı Türkçe özeti.' },
                            potentialParties: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Benzersiz potansiyel taraf isimlerinin listesi.' },
                            caseDetails: { 
                                type: Type.OBJECT,
                                properties: {
                                    court: { type: Type.STRING },
                                    fileNumber: { type: Type.STRING },
                                    decisionNumber: { type: Type.STRING },
                                    decisionDate: { type: Type.STRING },
                                }
                             },
                            lawyerInfo: {
                                type: Type.OBJECT,
                                description: 'Avukat/vekil bilgileri (eğer belgede varsa)',
                                properties: {
                                    name: { type: Type.STRING, description: 'Avukatın tam adı' },
                                    address: { type: Type.STRING, description: 'Avukatın iş adresi' },
                                    phone: { type: Type.STRING, description: 'Telefon numarası' },
                                    email: { type: Type.STRING, description: 'Email adresi' },
                                    barNumber: { type: Type.STRING, description: 'Baro sicil numarası' },
                                    bar: { type: Type.STRING, description: 'Baro adı (örn: Ankara Barosu)' },
                                    title: { type: Type.STRING, description: 'Unvan (örn: Avukat)' },
                                    tcNo: { type: Type.STRING, description: 'TC Kimlik No (eğer varsa)' }
                                }
                            },
                            contactInfo: {
                                type: Type.ARRAY,
                                description: 'Diğer iletişim bilgileri (tarafların adresleri, telefonları)',
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        name: { type: Type.STRING, description: 'Kişi/Kurum adı' },
                                        address: { type: Type.STRING, description: 'Adres' },
                                        phone: { type: Type.STRING, description: 'Telefon' },
                                        email: { type: Type.STRING, description: 'Email' },
                                        tcNo: { type: Type.STRING, description: 'TC Kimlik No (eğer varsa)' }
                                    }
                                }
                            }
                        },
                        required: ['summary', 'potentialParties']
                    }
                },
            });
            
            try {
                const json = JSON.parse(response.text);
                const caseDetails: CaseDetails = {
                    court: json.caseDetails?.court || '',
                    fileNumber: json.caseDetails?.fileNumber || '',
                    decisionNumber: json.caseDetails?.decisionNumber || '',
                    decisionDate: json.caseDetails?.decisionDate || '',
                };

                // Vekil bilgilerini parse et
                const lawyerInfo: LawyerInfo | undefined = json.lawyerInfo ? {
                    name: json.lawyerInfo.name || '',
                    address: json.lawyerInfo.address || '',
                    phone: json.lawyerInfo.phone || '',
                    email: json.lawyerInfo.email || '',
                    barNumber: json.lawyerInfo.barNumber || '',
                    bar: json.lawyerInfo.bar || '',
                    title: json.lawyerInfo.title || 'Avukat',
                    tcNo: json.lawyerInfo.tcNo,
                } : undefined;

                // İletişim bilgilerini parse et
                const contactInfo: ContactInfo[] | undefined = json.contactInfo?.map((contact: any) => ({
                    name: contact.name || '',
                    address: contact.address || '',
                    phone: contact.phone || '',
                    email: contact.email || '',
                    tcNo: contact.tcNo,
                }));

                return {
                    summary: json.summary || '',
                    potentialParties: Array.from(new Set(json.potentialParties || [])) as string[], // Ensure uniqueness
                    caseDetails: caseDetails,
                    lawyerInfo: lawyerInfo,
                    contactInfo: contactInfo
                };
            } catch (e) {
                console.error("Failed to parse analysis JSON:", e, "Raw text:", response.text);
                return { summary: "Analiz sırasında JSON verisi ayrıştırılamadı. Ham metin: " + response.text, potentialParties: [] };
            }
        } catch (e: any) {
             lastError = e;
             const errorMessage = e.toString().toLowerCase();
             // Retry on transient 5xx errors
             if (errorMessage.includes('500') || errorMessage.includes('503') || errorMessage.includes('internal error')) {
                if (attempt < MAX_RETRIES - 1) {
                    const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
                    console.warn(`Attempt ${attempt + 1} failed with a server error. Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
             } else {
                 // Not a retryable error, throw immediately
                 throw e;
             }
        }
    }

    // If all retries fail, throw the last captured error
    throw lastError;
}

export async function generateSearchKeywords(analysisText: string, userRole: UserRole): Promise<string[]> {
    const model = 'gemini-2.5-flash';
    const systemInstruction = `Sen Türk Hukuku alanında uzman, stratejik bir araştırma asistanısın. Görevin, verilen vaka özetini analiz ederek, kullanıcının '${userRole}' olan rolünü hukuki olarak en güçlü konuma getirecek anahtar kelimeleri belirlemektir. Oluşturacağın anahtar kelimeler, kullanıcının lehine olan Yargıtay kararlarını, mevzuatı ve hukuki argümanları bulmaya odaklanmalıdır. Çıktı olarak SADECE 'keywords' anahtarını içeren ve bu anahtarın değerinin bir string dizisi olduğu bir JSON nesnesi döndür.`;

    const promptText = `Sağlanan vaka özeti:\n\n"${analysisText}"\n\nBu özete dayanarak, '${userRole}' rolündeki bir kişinin elini güçlendirecek, onun lehine kanıt ve emsal karar bulmayı hedefleyen, 10 ila 15 adet, çok detaylı ve stratejik anahtar kelime ve arama ifadesi oluştur. Kelimeler, karşı tarafın argümanlarını çürütecek ve '${userRole}' tarafının tezlerini destekleyecek şekilde seçilmelidir. Örneğin: "haksız fesih tazminatı", "işe iade davası mobbing ispatı", "Yargıtay 9. Hukuk Dairesi lehe olan fazla mesai hesaplama kararı" gibi hem genel hem de spesifik ve lehe yönelik ifadeler oluştur.`;

    const response = await ai.models.generateContent({
        model,
        contents: promptText,
        config: {
            systemInstruction: systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    keywords: {
                        type: Type.ARRAY,
                        description: `List of 10-15 detailed, strategic legal search keywords for Turkish Law, aimed at favoring the user's role: ${userRole}.`,
                        items: {
                            type: Type.STRING
                        }
                    }
                },
                required: ["keywords"]
            }
        },
    });

    try {
        const json = JSON.parse(response.text);
        return json.keywords || [];
    } catch (e) {
        console.error("Failed to parse keywords JSON:", e, "Raw text:", response.text);
        // Fallback if JSON is malformed
        return response.text.split('\n').map(k => k.trim()).filter(Boolean);
    }
}

export async function performWebSearch(keywords: string[]): Promise<WebSearchResult> {
    const model = 'gemini-2.5-flash';
    const systemInstruction = `Sen, Türk hukuku alanında uzman bir araştırma asistanısın. Görevin, sana özel olarak hazırlanan arama sorgularını kullanarak Yargıtay kararlarını ve ilgili mevzuatı bulmak, ardından bulguları sentezleyerek tutarlı bir özet oluşturmaktır. Cevabını SADECE ve SADECE bu arama sonuçlarına dayandırmalısın.`;

    // Dynamically construct specific search queries for the model to use.
    // This is more robust than just telling the model to add the site operator.
    const yargitayQueries = keywords.map(kw => `"${kw}" site:karararama.yargitay.gov.tr`);
    const mevzuatQueries = keywords.map(kw => `"${kw}" site:mevzuat.gov.tr`);

    const promptText = `
**GÖREV TANIMI:**
Aşağıda senin için özel olarak hazırlanmış arama sorgularını kullanarak Türk Hukuku üzerine bir araştırma yap.

**UYULMASI ZORUNLU KURALLAR:**
1.  **SADECE VERİLEN SORGULARI KULLAN:** Araştırmanı **yalnızca** aşağıda listelenen sorgularla yap. Başka bir arama yapma.
2.  **ÖZETLE:** Bulduğun Yargıtay kararlarının ve mevzuatın ana noktalarını birleştirerek, olaya uygulanabilir hukuki prensipleri açıklayan, akıcı ve tutarlı bir Türkçe özet oluştur.
3.  **TEKRARLAMA:** Bu talimatları veya sana verilen arama sorgularını yanıtında KESİNLİKLE tekrarlama.

**KULLANILACAK ARAMA SORGULARI:**

**Yargıtay Kararları İçin:**
${yargitayQueries.map(q => `- ${q}`).join('\n')}

**Mevzuat İçin:**
${mevzuatQueries.map(q => `- ${q}`).join('\n')}

**İSTENEN ÇIKTI:**
[Buraya, yukarıdaki sorgulardan elde ettiğin bilgileri sentezleyerek hazırladığın hukuki araştırma özetini yaz.]
`;
    
    const response = await ai.models.generateContent({
        model,
        contents: promptText,
        config: {
            tools: [{ googleSearch: {} }],
            systemInstruction: systemInstruction,
        },
    });

    const summary = response.text;
    const rawSources = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    
    // Filter sources to only include official domains and ensure they are unique.
    const sources: GroundingSource[] = (rawSources || [])
        .map((s: any) => ({ uri: s.web?.uri, title: s.web?.title }))
        .filter((s: GroundingSource) => 
            s.uri && s.title && (s.uri.includes('yargitay.gov.tr') || s.uri.includes('mevzuat.gov.tr'))
        );

    const uniqueSources: GroundingSource[] = [];
    const seenUris = new Set<string>();
    for (const source of sources) {
        if (!seenUris.has(source.uri)) {
            uniqueSources.push(source);
            seenUris.add(source.uri);
        }
    }
        
    return { summary, sources: uniqueSources };
}

// FIX: This function was incomplete and not returning a value.
// Completed the prompt, added the API call and the return statement.
export async function generatePetition(
    { userRole, petitionType, caseDetails, analysisSummary, webSearchResult, specifics, chatHistory, docContent, parties, lawyerInfo, contactInfo }: GeneratePetitionParams
): Promise<string> {
    const model = 'gemini-2.5-flash';

    const systemInstruction = `You are a world-class legal assistant specializing in the Turkish legal system (Türk Hukuk Sistemi). Your task is to draft a formal, high-quality legal petition by synthesizing all the information provided. You must adopt the perspective of the user's role. Use precise legal terminology and formatting appropriate for submission to Turkish courts. DO NOT perform new web searches. Base your draft *exclusively* on the context given below. Fill in all placeholders like court name and file numbers using the provided 'Dava Künyesi' information.`;
    
    const promptText = `
**GÖREV: AŞAĞIDAKİ BİLGİLERİ KULLANARAK BİR HUKUKİ DİLEKÇE HAZIRLA.**

**ÖNCELİKLİ BİLGİLER:**
- **KULLANICININ ROLÜ (Dilekçenin Kimin Adına Yazılacası):** ${userRole}
- **DİLEKÇE TÜRÜ:** ${petitionType}

**1. DAVA KÜNYESİ (Bu bilgileri dilekçenin başlığında ve ilgili yerlerinde KESİNLİKLE kullan):**
${formatCaseDetailsForPrompt(caseDetails)}

**2. VEKİL BİLGİLERİ (ÖNEMLİ: Eğer vekil bilgisi varsa, dilekçenin sonunda vekil imza kısmında MUTLAKA kullan):**
${formatLawyerInfoForPrompt(lawyerInfo)}

**3. İLETİŞİM BİLGİLERİ (Tarafların adresleri, telefonları - Dilekçe başlığında kullan):**
${formatContactInfoForPrompt(contactInfo)}

**4. OLAYIN ÖZETİ (Belgelerden çıkarıldı):**
${analysisSummary || "Olay özeti sağlanmadı."}

**5. TARAFLAR:**
${formatPartiesForPrompt(parties)}

**6. İLGİLİ HUKUKİ ARAŞTIRMA (Web'den bulundu - Bu bilgileri argümanlarını desteklemek için kullan):**
${webSearchResult || "Web araştırması sonucu sağlanmadı."}

**7. EK METİN VE NOTLAR (Kullanıcı tarafından sağlandı):**
${docContent || "Ek metin sağlanmadı."}

**8. ÖZEL TALİMATLAR VE VURGULANMASI İSTENEN NOKTALAR (Kullanıcıdan):**
${specifics || "Özel talimat sağlanmadı."}

**9. ÖNCEKİ SOHBET GEÇMİŞİ (Kullanıcı ve asistan arasında geçti - Bağlamı anlamak için kullan):**
${formatChatHistoryForPrompt(chatHistory)}

**ÖNEMLİ UYARILAR:**
- Vekil bilgisi varsa, dilekçenin SONUNDA mutlaka vekil bilgilerini (ad, baro, adres, telefon) ekle.
- İletişim bilgileri varsa, taraflar kısmında uygun şekilde kullan.
- Türk Hukuk Usulü'ne uygun format kullan.

**DİLEKÇE TASLAĞI:**
[Buraya yukarıdaki tüm bilgileri sentezleyerek, Türk Hukuk Usulü'ne uygun, resmi, talep ve sonuç kısımlarını içeren tam bir dilekçe metni oluştur.]
`;

    const response = await ai.models.generateContent({
        model,
        contents: promptText,
        config: {
            systemInstruction,
        },
    });

    return response.text;
}

// FIX: Added missing function 'streamChatResponse' which was being imported in App.tsx.
export async function* streamChatResponse(
    chatHistory: ChatMessage[],
    analysisSummary: string,
    context: ChatContext
): AsyncGenerator<GenerateContentResponse> {
    const model = 'gemini-2.5-flash';

    const contextPrompt = `
**MEVCUT DURUM VE BAĞLAM:**
- **Vaka Özeti:** ${analysisSummary || "Henüz analiz yapılmadı."}
- **Mevcut Arama Anahtar Kelimeleri:** ${context.keywords || "Henüz anahtar kelime oluşturulmadı."}
- **Web Araştırma Özeti:** ${context.searchSummary || "Henüz web araştırması yapılmadı."}
- **Kullanıcının Ek Metinleri:** ${context.docContent || "Ek metin sağlanmadı."}
- **Kullanıcının Özel Talimatları:** ${context.specifics || "Özel talimat sağlanmadı."}
`;
    
    const systemInstruction = `Sen, Türk Hukuku konusunda uzman bir hukuk asistanısın. Kullanıcıyla sohbet ederek, onların hukuki durumunu daha iyi anlamalarına yardımcı ol, sorularını yanıtla ve dilekçe için ek bilgi topla. Cevapların net, anlaşılır ve profesyonel olmalı.

**ÖNEMLİ: HER ZAMAN METİN YANITI DÖNDÜR**
Kullanıcıya HER ZAMAN bir metin yanıtı ver. Fonksiyon çağırırsın dahi, mutlaka kullanıcıyla konuş.

**ANAHTAR KELİME EKLEME**
Kullanıcı "tutanak hakkında 5 anahtar kelime ekle", "delil konusunda anahtar kelimeler ekle", "tanık ile ilgili kelimeler ekle" gibi talepler yaptığında:
1. 'update_search_keywords' fonksiyonunu çağır
2. Kullanıcıya hangi anahtar kelimeleri eklediğini söyle

Örnek yanıtlar:
- "Elbette! Tutanak konusunda 5 anahtar kelime ekledim: 'tutanak', 'duruşma tutanağı', 'kesinleşme tutanağı', 'tebligat tutanağı', 'tutanak örneği'. Bu kelimelerle Yargıtay kararlarını araabilirsiniz."
- "Delil konusunda 5 anahtar kelime ekledim: 'delil', 'delil türleri', 'senet delili', 'tanık delili', 'bilirkişi delili'. Şimdi web araması yapabilirsiniz."

İşte mevcut davanın bağlamı:\n${contextPrompt}`;

    const updateKeywordsFunction: FunctionDeclaration = {
        name: 'update_search_keywords',
        description: 'Kullanıcı "tutanak hakkında 5 anahtar kelime ekle", "delil ile ilgili kelimeler ekle" gibi talepler yaptığında, bu fonksiyonu kullanarak ilgili Türk Hukuku anahtar kelimelerini arama listesine ekle. Kullanıcının talebine uygun sayıda ve konuda anahtar kelime ekle.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                keywordsToAdd: {
                    type: Type.ARRAY,
                    description: 'Eklenecek yeni Türk Hukuku anahtar kelimelerinin dizisi. Örnek: ["tutanak", "duruşma tutanağı", "kesinleşme tutanağı"]',
                    items: { type: Type.STRING }
                },
            },
            required: ['keywordsToAdd'],
        },
    };

    const contents = chatHistory.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
    }));
    
    const responseStream = await ai.models.generateContentStream({
        model,
        contents: contents,
        config: {
            systemInstruction: systemInstruction,
            tools: [{ functionDeclarations: [updateKeywordsFunction] }],
        },
    });

    for await (const chunk of responseStream) {
        yield chunk;
    }
}

// FIX: Added missing function 'rewriteText' which was being imported in App.tsx.
export async function rewriteText(textToRewrite: string): Promise<string> {
    const model = 'gemini-2.5-flash';
    const systemInstruction = `Sen bir Türk hukuk metni editörüsün. Görevin, sana verilen metin parçasını daha resmi, akıcı ve hukuki terminolojiye uygun bir şekilde yeniden yazmaktır. Metnin orijinal anlamını koru, ancak ifadesini güçlendir. Sadece ve sadece yeniden yazılmış metni döndür, başka hiçbir açıklama veya ek metin ekleme.`;
    
    const promptText = `Lütfen aşağıdaki metni yeniden yaz:\n\n"${textToRewrite}"`;

    const response = await ai.models.generateContent({
        model,
        contents: promptText,
        config: {
            systemInstruction: systemInstruction,
        },
    });

    return response.text.trim();
}

// FIX: Added missing function 'reviewPetition' which was being imported in App.tsx.
export async function reviewPetition(
    params: GeneratePetitionParams & { currentPetition: string }
): Promise<string> {
    const { userRole, petitionType, caseDetails, analysisSummary, webSearchResult, specifics, chatHistory, docContent, parties, lawyerInfo, contactInfo, currentPetition } = params;
    
    const model = 'gemini-2.5-flash';
    const systemInstruction = `You are a senior Turkish legal editor (Kıdemli Türk Hukuk Editörü). Your task is to critically review and improve the provided legal petition draft. Enhance its legal reasoning, strengthen the arguments from the user's perspective, correct any factual or legal inaccuracies, and improve the overall formatting and language to meet the highest standards of Turkish courts. Base your review *exclusively* on the provided context. DO NOT perform new web searches. The final output should be the complete, improved petition text.`;

    const promptText = `
**GÖREV: AŞAĞIDAKİ MEVCUT DİLEKÇE TASLAĞINI, SAĞLANAN BAĞLAM BİLGİLERİNİ KULLANARAK GÖZDEN GEÇİR VE İYİLEŞTİR.**

**1. İYİLEŞTİRİLECEK MEVCUT DİLEKÇE TASLAĞI:**
---
${currentPetition}
---

**2. DİLEKÇENİN HAZIRLANMASINDA KULLANILAN ORİJİNAL BAĞLAM BİLGİLERİ (Referans için):**

- **KULLANICININ ROLÜ:** ${userRole}
- **DİLEKÇE TÜRÜ:** ${petitionType}

- **DAVA KÜNYESİ:**
${formatCaseDetailsForPrompt(caseDetails)}

- **VEKİL BİLGİLERİ:**
${formatLawyerInfoForPrompt(lawyerInfo)}

- **İLETİŞİM BİLGİLERİ:**
${formatContactInfoForPrompt(contactInfo)}

- **OLAYIN ÖZETİ:**
${analysisSummary || "Olay özeti sağlanmadı."}

- **TARAFLAR:**
${formatPartiesForPrompt(parties)}

- **İLGİLİ HUKUKİ ARAŞTIRMA:**
${webSearchResult || "Web araştırması sonucu sağlanmadı."}

- **EK METİN VE NOTLAR:**
${docContent || "Ek metin sağlanmadı."}

- **ÖZEL TALİMATLAR:**
${specifics || "Özel talimat sağlanmadı."}

- **ÖNCEKİ SOHBET GEÇMİŞİ:**
${formatChatHistoryForPrompt(chatHistory)}


**İYİLEŞTİRİLMİŞ NİHAİ DİLEKÇE METNİ:**
[Buraya, yukarıdaki taslağı tüm bağlamı dikkate alarak daha güçlü, ikna edici ve hukuken sağlam hale getirilmiş tam dilekçe metnini yaz.]
`;

    const response = await ai.models.generateContent({
        model,
        contents: promptText,
        config: {
            systemInstruction,
        },
    });

    return response.text.trim();
}