import 'dotenv/config';
import { buildSearchStrategies } from './lib/legal/legal-strategy-builder.js';

async function testStrategies() {
    console.log("=== KISA METİN (<250 char) ===");
    const shortText = "Kira bedelinin tespiti davasında ıslah mümkün müdür?";
    const shortStrats = await buildSearchStrategies({ rawText: shortText, forceAiStrategy: true });
    console.log(`Üretilen strateji sayısı: ${shortStrats.length}\n`);

    console.log("=== ORTA METİN (250-1000 char) ===");
    const medText = "Müvekkil şirket, davalı şirket ile yaptığı eser sözleşmesi uyarınca edimini tam ve eksiksiz ifa etmiş, ancak hakedişlerini alamamıştır. Sözleşmede belirtilen %5 gecikme cezası ve avans faizi talebimiz bulunmaktadır. Ayrıca davalı yan faturaya süresinde itiraz etmemiştir. Ne yapabiliriz?";
    const medStrats = await buildSearchStrategies({ rawText: medText, forceAiStrategy: true });
    console.log(`Üretilen strateji sayısı: ${medStrats.length}\n`);

    console.log("=== UZUN METİN (>1000 char) ===");
    // Just create a long text by repeating something
    const longText = medText.repeat(8); 
    const longStrats = await buildSearchStrategies({ rawText: longText, forceAiStrategy: true });
    console.log(`Üretilen strateji sayısı: ${longStrats.length}\n`);
}

testStrategies().catch(console.error);
