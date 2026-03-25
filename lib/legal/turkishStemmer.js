/**
 * Hafif Türkçe Kelime Kökü Bulucu (Stemmer)
 * Sadece arama/reranking eşleşme başarısını artırmak için tasarlanmıştır.
 * İsim ve fiil çekim eklerini (çoğul, hal, iyelik, zaman vb.) kaldırır.
 */

const VOWELS = 'aeiouüöı';

// Ekleri tespit etmek için en uzundan en kısaya sıralı regex array
const SUFFIX_PATTERNS = [
    // Fiilimsiler ve birleşik ekler
    /(y)?(arak|erek|dıkça|dikçe|dukça|dükçe|maksızın|meksizin|casına|cesine|ıp|ip|up|üp|ınca|ince|unca|ünce|dığında|diğinde|duğunda|düğünde)$/,
    
    // Geniş zaman ve geçmiş zaman hikaye/şart
    /(y)?(acak|ecek|mış|miş|muş|müş|dı|di|du|dü|tı|ti|tu|tü|sa|se|dır|dir|dur|dür|tır|tir|tur|tür)(lar|ler)?$/,

    // Çoğul ve hal ekleri kombinasyonları (larında, lerinden vb.)
    /(lar|ler)(ı|i|u|ü)?(n)?(da|de|dan|den|a|e|ı|i|u|ü|nın|nin|nun|nün)$/,

    // Fiil zaman ve şahıs ekleri (yor, yorlar, malı vb.)
    /(ı|i|u|ü)?(yor)(lar|um|sun|uz|sunuz)?$/,
    /(malı|meli|mak|mek)$/,

    // Çoğul Eki
    /(lar|ler)$/,

    // İsmin Hal Ekleri (Ayrılma, Bulunma, Yönelme, Belirtme)
    /(dan|den|tan|ten)$/,
    /(da|de|ta|te)$/,
    /(y)?(a|e)$/,
    /(y)?(ı|i|u|ü)$/,

    // İyelik / İlgi Ekleri (ının, inin, ımız vb.)
    /(n)?(ın|in|un|ün)$/,
    /(mız|miz|muz|müz|nız|niz|nuz|nüz|ları|leri)$/,
    /(m|n|k)$/,

    // Yapım Ekleri (lık, lı, sız vb.)
    /(lık|lik|luk|lük)$/,
    /(lı|li|lu|lü)$/,
    /(sız|siz|suz|süz)$/,
    /(cı|ci|cu|cü|çı|çi|çu|çü)$/
];

/**
 * Verilen Türkçe kelimenin sonundaki çekim ve yapım eklerini atarak kökünü bulur.
 * Tam sözlük doğruluğu iddia etmez, bilgi getirimi (arama eşleşmesi) için optimize edilmiştir.
 * @param {string} word - İşlenecek kelime (Küçük harf ve ASCII karakterlere dönüştürülmüş olmalı)
 * @returns {string} Kelimenin kökü
 */
export const stemTurkishWord = (word = '') => {
    let current = String(word || '').trim();
    
    // 3 harfli veya daha kısa kelimelerin kökünü bulmaya çalışmayız
    if (current.length <= 3) return current;

    let changed = true;
    while (changed) {
        changed = false;
        
        for (const pattern of SUFFIX_PATTERNS) {
            const match = current.match(pattern);
            if (match) {
                const stemmed = current.slice(0, match.index);
                // Eğer kök çok kısa kalıyorsa (örn: 'il' den 'i' kalıyorsa) kesmeyi yapma
                if (stemmed.length >= 3) {
                    // Kelime içinde en az 1 sesli harf kalmalı (Türkçe kelime kuralı)
                    const hasVowel = VOWELS.split('').some(v => stemmed.includes(v));
                    if (hasVowel) {
                        current = stemmed;
                        changed = true;
                        break; // Baştan kontrol et ki ekler sırayla soyulsun
                    }
                }
            }
        }
    }

    return current;
};
