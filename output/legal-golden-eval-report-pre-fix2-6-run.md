# Legal Golden Eval Report

- Generated at: 2026-03-24T09:51:30.630Z
- Total cases: 34
- Evaluated cases (excluding rate-limited): 27
- Excluded rate-limited cases: 7
- Pass / Partial / Fail: 4 / 29 / 1
- Domain accuracy: 70.4%
- Birim accuracy: 77.8%
- Family accuracy: 92.6%
- Avg mustConcept hit rate (contentMatchedSubstantive + contentMatchedFactPattern): 40.7%
- All must concepts covered in top 5: 18.5%
- Forbidden leak rate: 0.0%
- Rate-limited rate: 20.6%
- Zero-result rate: 3.7%

## By domain

| Domain | Total | Eval | RL | Pass | Partial | Fail | Domain | Birim | Family | Must hit | All must | Forbidden leak | Zero |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| aile | 2 | 0 | 2 | 0 | 2 | 0 | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| anayasa | 2 | 2 | 0 | 1 | 0 | 1 | 50% | 100% | 50% | 50% | 50% | 0% | 50% |
| borclar | 3 | 2 | 1 | 0 | 3 | 0 | 0% | 0% | 100% | 0% | 0% | 0% | 0% |
| ceza | 3 | 3 | 0 | 0 | 3 | 0 | 67% | 67% | 100% | 44% | 0% | 0% | 0% |
| gayrimenkul | 2 | 2 | 0 | 0 | 2 | 0 | 50% | 100% | 100% | 83% | 50% | 0% | 0% |
| icra | 4 | 4 | 0 | 0 | 4 | 0 | 50% | 50% | 75% | 17% | 0% | 0% | 0% |
| idare | 4 | 4 | 0 | 1 | 3 | 0 | 100% | 100% | 100% | 42% | 25% | 0% | 0% |
| is_hukuku | 4 | 2 | 2 | 1 | 3 | 0 | 100% | 100% | 100% | 67% | 50% | 0% | 0% |
| miras | 2 | 1 | 1 | 1 | 1 | 0 | 100% | 100% | 100% | 100% | 100% | 0% | 0% |
| ticaret | 4 | 4 | 0 | 0 | 4 | 0 | 75% | 75% | 100% | 33% | 0% | 0% | 0% |
| tuketici | 1 | 0 | 1 | 0 | 1 | 0 | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| vergi | 3 | 3 | 0 | 0 | 3 | 0 | 100% | 100% | 100% | 33% | 0% | 0% | 0% |

## Partial / fail cases

### ceza-uyusturucu-fiziki-takip (partial)
- Query: Uyuşturucu madde ticareti, fiziki takip, hassas terazi, kullanıcı tanık beyanı
- Expected: ceza / C10 / 10. Ceza Dairesi
- Got: ceza / C10
- Must hits: 2/3 -> 67%
- Rate limited: no
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a

### ceza-uyusturucu-kullanma-savunmasi (partial)
- Query: Uyuşturucu ticareti, kullanmak için bulundurma savunması, kişisel kullanım sınırı
- Expected: ceza / C10 / 10. Ceza Dairesi
- Got: n/a / n/a
- Must hits: 0/3 -> 0%
- Rate limited: no
- Forbidden hits: none
- Source coverage: n/a
- Zero result reason: n/a

### ceza-uyusturucu-paketleme (partial)
- Query: TCK 188 kapsamında uyuşturucu satışı, paketleme, ele geçirilen madde miktarı
- Expected: ceza / C10 / 10. Ceza Dairesi
- Got: ceza / C10
- Must hits: 2/3 -> 67%
- Rate limited: no
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a

### is-fazla-calisma-270-saat (partial)
- Query: Fazla çalışma alacağı, 270 saat sınırı, işçinin onayı ve serbest zaman
- Expected: is_hukuku / H9 / 9. Hukuk Dairesi
- Got: is_hukuku / H9
- Must hits: 1/3 -> 33%
- Rate limited: no
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a

### is-hizmet-tespiti-sgk (partial)
- Query: Hizmet tespiti davası, sigortalılık başlangıcı, SGK bildirimi eksik çalışma
- Expected: is_hukuku / H10 / 10. Hukuk Dairesi
- Got: is_hukuku / H10
- Must hits: 2/3 -> 67%
- Rate limited: yes
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a
- Rate-limit signals: [YARGI_CLI] spawn:error {"pid":6788,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [YARGI_CLI] spawn:error {"pid":16812,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [YARGI_CLI] spawn:error {"pid":16928,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1374ms | [YARGI_CLI] spawn:error {"pid":11500,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [YARGI_CLI] spawn:error {"pid":14312,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1250ms

### is-kazasi-rucu (partial)
- Query: İş kazası, meslek hastalığı, SGK rücu alacağı ve kusur oranı
- Expected: is_hukuku / H10 / 10. Hukuk Dairesi
- Got: is_hukuku / H10
- Must hits: 2/3 -> 67%
- Rate limited: yes
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a
- Rate-limit signals: [YARGI_CLI] spawn:error {"pid":11448,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1438ms | [YARGI_CLI] spawn:error {"pid":13792,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=2 delay=2082ms | [YARGI_CLI] spawn:error {"pid":14168,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=3 delay=4498ms | [YARGI_CLI] spawn:error {"pid":16600,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1176ms

### aile-6284-uzaklastirma (partial)
- Query: 6284 sayılı Kanun kapsamında uzaklaştırma tedbiri, ortak konut, tedbir ihlali
- Expected: aile / H2 / 2. Hukuk Dairesi
- Got: aile / H2
- Must hits: 2/3 -> 67%
- Rate limited: yes
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a
- Rate-limit signals: [YARGI_CLI] spawn:error {"pid":268,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1077ms | [YARGI_CLI] spawn:error {"pid":16472,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1022ms | [YARGI_CLI] spawn:error {"pid":13884,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=2 delay=2331ms | [YARGI_CLI] spawn:error {"pid":13128,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=3 delay=4477ms

### aile-zorlama-hapsi (partial)
- Query: 6284 zorlama hapsi, koruyucu tedbir, şiddet mağduru eş
- Expected: aile / H2 / 2. Hukuk Dairesi
- Got: aile / H2
- Must hits: 1/3 -> 33%
- Rate limited: yes
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a
- Rate-limit signals: [YARGI_CLI] spawn:error {"pid":17292,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1225ms | [YARGI_CLI] spawn:error {"pid":13632,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=2 delay=2350ms | [YARGI_CLI] spawn:error {"pid":16104,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1145ms | [YARGI_CLI] spawn:error {"pid":10484,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1081ms

### borclar-kira-temerrut (partial)
- Query: Kiracı kira bedelini ödemiyor, temerrüt nedeniyle tahliye ve TBK 315
- Expected: borclar / H3 / 3. Hukuk Dairesi
- Got: n/a / n/a
- Must hits: 0/3 -> 0%
- Rate limited: yes
- Forbidden hits: none
- Source coverage: n/a
- Zero result reason: n/a
- Rate-limit signals: [YARGI_CLI] spawn:error {"pid":14120,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1239ms | [YARGI_CLI] spawn:error {"pid":15568,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1493ms | [YARGI_CLI] spawn:error {"pid":16796,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=2 delay=2136ms | [YARGI_CLI] spawn:error {"pid":14928,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1063ms

### borclar-kira-ihtiyac (partial)
- Query: İhtiyaç nedeniyle tahliye, kiralananın tahliyesi, TBK 350
- Expected: borclar / H3 / 3. Hukuk Dairesi
- Got: n/a / n/a
- Must hits: 0/3 -> 0%
- Rate limited: no
- Forbidden hits: none
- Source coverage: n/a
- Zero result reason: n/a

### borclar-eser-arsa-payi (partial)
- Query: Arsa payı karşılığı inşaat, eksik ifa, ayıplı iş ve gecikme tazminatı
- Expected: borclar / H6 / 6. Hukuk Dairesi
- Got: n/a / n/a
- Must hits: 0/3 -> 0%
- Rate limited: no
- Forbidden hits: none
- Source coverage: n/a
- Zero result reason: n/a

### gayrimenkul-tapu-muris (partial)
- Query: Muris muvazaası nedeniyle tapu iptali ve tescil, bedelsiz devir, miras bırakanın gerçek iradesi
- Expected: gayrimenkul / H1 / 1. Hukuk Dairesi
- Got: miras / H1
- Must hits: 3/3 -> 100%
- Rate limited: no
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a

### gayrimenkul-ortakligin-giderilmesi (partial)
- Query: Ortaklığın giderilmesi, aynen taksim, izalei şuyu ve paylı mülkiyet
- Expected: gayrimenkul / H7 / 7. Hukuk Dairesi
- Got: gayrimenkul / H7
- Must hits: 2/3 -> 67%
- Rate limited: no
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a

### miras-tenkis-sakli-pay (partial)
- Query: Tenkis davası, saklı pay ihlali, miras payı ve tasarruf nisabı
- Expected: miras / H7 / 7. Hukuk Dairesi
- Got: miras / H7
- Must hits: 2/3 -> 67%
- Rate limited: yes
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a
- Rate-limit signals: [YARGI_CLI] spawn:error {"pid":14632,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [YARGI_CLI] spawn:error {"pid":18392,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [YARGI_CLI] spawn:error {"pid":5148,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [YARGI_CLI] spawn:error {"pid":18376,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [YARGI_CLI] spawn:error {"pid":14564,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [YARGI_CLI] spawn:error {"pid":18088,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""}

### tuketici-ayipli-mal (partial)
- Query: Ayıplı mal, seçimlik haklar, bedel iadesi ve ücretsiz onarım
- Expected: tuketici / H3 / 3. Hukuk Dairesi
- Got: n/a / n/a
- Must hits: 0/3 -> 0%
- Rate limited: yes
- Forbidden hits: none
- Source coverage: n/a
- Zero result reason: n/a
- Rate-limit signals: [YARGI_CLI] spawn:error {"pid":4040,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1494ms | [YARGI_CLI] spawn:error {"pid":14068,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1204ms | [YARGI_CLI] spawn:error {"pid":17132,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=2 delay=2155ms | [YARGI_CLI] spawn:error {"pid":17564,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1211ms

### ticaret-marka-iltibas (partial)
- Query: Marka hakkına tecavüz, iltibas, karıştırılma ihtimali ve haksız rekabet
- Expected: ticaret / H11 / 11. Hukuk Dairesi
- Got: ticaret / H11
- Must hits: 2/3 -> 67%
- Rate limited: no
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a

### ticaret-marka-e-ticaret (partial)
- Query: Tescilli marka, e-ticaret satışı, logo benzerliği ve karıştırılma ihtimali
- Expected: ticaret / H11 / 11. Hukuk Dairesi
- Got: ticaret / H11
- Must hits: 1/3 -> 33%
- Rate limited: no
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a

### ticaret-genel-kurul-iptal (partial)
- Query: Anonim şirket genel kurul kararı iptali, çağrı usulsüzlüğü, pay sahipliği
- Expected: ticaret / H11 / 11. Hukuk Dairesi
- Got: ticaret / H11
- Must hits: 1/3 -> 33%
- Rate limited: no
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a

### ticaret-konkordato-komiser (partial)
- Query: Konkordato komiseri, mühlet kararı, alacaklılar kurulu ve tasdik şartları
- Expected: ticaret / H6 / 6. Hukuk Dairesi
- Got: n/a / n/a
- Must hits: 0/3 -> 0%
- Rate limited: no
- Forbidden hits: none
- Source coverage: n/a
- Zero result reason: n/a

### icra-itirazin-iptali (partial)
- Query: İİK 67 itirazın iptali, cari hesap alacağı, ticari defterler
- Expected: icra / H11 / 11. Hukuk Dairesi
- Got: icra / H11
- Must hits: 2/3 -> 67%
- Rate limited: no
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a

### icra-menfi-tespit (partial)
- Query: Menfi tespit, istirdat, icra takibine konu borcun bulunmadığı iddiası
- Expected: icra / H11 / 11. Hukuk Dairesi
- Got: icra / H11
- Must hits: 0/3 -> 0%
- Rate limited: no
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a

### icra-haciz-meskeniyet (partial)
- Query: Haczedilmezlik şikayeti, meskeniyet, icra mahkemesi kararı
- Expected: icra / H12 / 12. Hukuk Dairesi
- Got: n/a / n/a
- Must hits: 0/3 -> 0%
- Rate limited: no
- Forbidden hits: none
- Source coverage: n/a
- Zero result reason: n/a

### icra-ihalenin-feshi (partial)
- Query: İhalenin feshi, satış ilanı usulsüzlüğü, kıymet takdiri ve haciz
- Expected: icra / H12 / 12. Hukuk Dairesi
- Got: n/a / n/a
- Must hits: 0/3 -> 0%
- Rate limited: no
- Forbidden hits: none
- Source coverage: n/a
- Zero result reason: n/a

### idare-imar-yikim (partial)
- Query: İmar planı iptali, yıkım kararı, yapı ruhsatı ve kazanılmış hak
- Expected: idare / D6 / 6. Daire
- Got: idare / D6
- Must hits: 1/3 -> 33%
- Rate limited: no
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a

### idare-kamu-ihale-asiri-dusuk (partial)
- Query: Kamu ihalesi, aşırı düşük teklif sorgulaması, teklif değerlendirme dışı bırakma
- Expected: idare / D13 / 13. Daire
- Got: idare / D13
- Must hits: 0/3 -> 0%
- Rate limited: no
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a

### idare-disiplin-savunma-hakki (partial)
- Query: Disiplin cezası, savunma hakkı, kademe ilerlemesinin durdurulması
- Expected: idare / D12 / 12. Daire
- Got: idare / D12
- Must hits: 1/3 -> 33%
- Rate limited: no
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a

### vergi-kdv-sahte-fatura (partial)
- Query: Sahte fatura, KDV indirimi, vergi inceleme raporu ve vergi ziyaı
- Expected: vergi / D3 / 3. Daire
- Got: vergi / D3
- Must hits: 2/3 -> 67%
- Rate limited: no
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a

### vergi-miyb-resen-tarhiyat (partial)
- Query: Muhteviyatı itibarıyla yanıltıcı belge, re'sen tarhiyat, ispat yükü
- Expected: vergi / D3 / 3. Daire
- Got: vergi / D3
- Must hits: 1/3 -> 33%
- Rate limited: no
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a

### vergi-gumruk-royalti (partial)
- Query: Gümrük kıymeti, royalti ödemesi, ithalat vergileri ve ÖTV
- Expected: vergi / D7 / 7. Daire
- Got: vergi / D7
- Must hits: 0/3 -> 0%
- Rate limited: no
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a

### anayasa-norm-denetimi (fail)
- Query: Anayasaya aykırılık itirazı, norm denetimi, eşitlik ve belirlilik ilkesi
- Expected: anayasa / n/a / Anayasa Mahkemesi
- Got: n/a / n/a
- Must hits: 0/3 -> 0%
- Rate limited: no
- Forbidden hits: none
- Source coverage: n/a
- Zero result reason: no_candidates
