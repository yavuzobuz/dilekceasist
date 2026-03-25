import { generateLegalSearchPlanWithDiagnostics } from './backend/gemini/legal-search-plan-core.js';
const rawText = 'uyusmazlik dosyasi icinde davaci ile davali arasindaki uyusmazlikta olaylar daginik sekilde anlatilmistir. gecersiz nedenle feshedilen is sozlesmesi nedeniyle ise iade, bos gecen sure ucreti ve ise baslatmama tazminati talebi. uyusmazlik dosyasi kapsaminda beyanlar, kayitlar ve mevcut evrak bir arada degerlendirilmekte olup mesele ayni hukuki cekirdekte toplanmaktadir. Bu nedenle ayni hukuki cekirdegi tasiyan emsal kararlarin taranmasi talep edilmektedir.';
const result = await generateLegalSearchPlanWithDiagnostics({ rawText, preferredSource: 'all' });
console.log(JSON.stringify(result, null, 2));
