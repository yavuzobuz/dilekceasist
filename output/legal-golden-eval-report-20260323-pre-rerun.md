# Legal Golden Eval Report

- Generated at: 2026-03-23T11:34:17.348Z
- Total cases: 34
- Evaluated cases (excluding rate-limited): 19
- Excluded rate-limited cases: 15
- Pass / Partial / Fail: 0 / 33 / 1
- Domain accuracy: 84.2%
- Birim accuracy: 89.5%
- Family accuracy: 89.5%
- Avg mustConcept hit rate (contentMatchedSubstantive + contentMatchedFactPattern): 36.8%
- All must concepts covered in top 5: 0.0%
- Forbidden leak rate: 0.0%
- Rate-limited rate: 44.1%
- Zero-result rate: 5.3%

## By domain

| Domain | Total | Eval | RL | Pass | Partial | Fail | Domain | Birim | Family | Must hit | All must | Forbidden leak | Zero |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| aile | 2 | 1 | 1 | 0 | 2 | 0 | 100% | 100% | 100% | 67% | 0% | 0% | 0% |
| anayasa | 2 | 2 | 0 | 0 | 1 | 1 | 50% | 100% | 50% | 33% | 0% | 0% | 50% |
| borclar | 3 | 0 | 3 | 0 | 3 | 0 | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| ceza | 3 | 3 | 0 | 0 | 3 | 0 | 67% | 67% | 100% | 33% | 0% | 0% | 0% |
| gayrimenkul | 2 | 0 | 2 | 0 | 2 | 0 | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| icra | 4 | 1 | 3 | 0 | 4 | 0 | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| idare | 4 | 4 | 0 | 0 | 4 | 0 | 100% | 100% | 100% | 50% | 0% | 0% | 0% |
| is_hukuku | 4 | 3 | 1 | 0 | 4 | 0 | 100% | 100% | 100% | 44% | 0% | 0% | 0% |
| miras | 2 | 0 | 2 | 0 | 2 | 0 | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| ticaret | 4 | 3 | 1 | 0 | 4 | 0 | 100% | 100% | 100% | 33% | 0% | 0% | 0% |
| tuketici | 1 | 0 | 1 | 0 | 1 | 0 | 0% | 0% | 0% | 0% | 0% | 0% | 0% |
| vergi | 3 | 2 | 1 | 0 | 3 | 0 | 100% | 100% | 100% | 17% | 0% | 0% | 0% |

## Partial / fail cases

### ceza-uyusturucu-fiziki-takip (partial)
- Query: Uyuşturucu madde ticareti, fiziki takip, hassas terazi, kullanıcı tanık beyanı
- Expected: ceza / C10 / 10. Ceza Dairesi
- Got: ceza / C10
- Must hits: 1/3 -> 33%
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

### is-fazla-mesai-puantaj (partial)
- Query: Fazla mesai ücreti, puantaj kayıtları, bordro ihtirazi kayıt
- Expected: is_hukuku / H9 / 9. Hukuk Dairesi
- Got: is_hukuku / H9
- Must hits: 2/3 -> 67%
- Rate limited: yes
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a
- Rate-limit signals: [legal-search-plan] Gemini query expansion fallback: {"error":{"code":429,"message":"Resource exhausted. Please try again later. Please refer to https://cloud.google.com/vertex-ai/generative-ai/docs/error-code-429 for more details.","status":"RESOURCE_EXHAUSTED"}}

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
- Must hits: 1/3 -> 33%
- Rate limited: no
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a

### is-kazasi-rucu (partial)
- Query: İş kazası, meslek hastalığı, SGK rücu alacağı ve kusur oranı
- Expected: is_hukuku / H10 / 10. Hukuk Dairesi
- Got: is_hukuku / H10
- Must hits: 2/3 -> 67%
- Rate limited: no
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a

### aile-6284-uzaklastirma (partial)
- Query: 6284 sayılı Kanun kapsamında uzaklaştırma tedbiri, ortak konut, tedbir ihlali
- Expected: aile / H2 / 2. Hukuk Dairesi
- Got: aile / H2
- Must hits: 2/3 -> 67%
- Rate limited: no
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a

### aile-zorlama-hapsi (partial)
- Query: 6284 zorlama hapsi, koruyucu tedbir, şiddet mağduru eş
- Expected: aile / H2 / 2. Hukuk Dairesi
- Got: aile / H2
- Must hits: 1/3 -> 33%
- Rate limited: yes
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a
- Rate-limit signals: [YARGI_CLI] spawn:error {"pid":5140,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1253ms | [YARGI_CLI] spawn:error {"pid":17328,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [YARGI_CLI] spawn:error {"pid":7416,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [YARGI_CLI] spawn:error {"pid":16904,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [YARGI_CLI] spawn:error {"pid":12168,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1323ms | [YARGI_CLI] spawn:error {"pid":4684,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""}

### borclar-kira-temerrut (partial)
- Query: Kiracı kira bedelini ödemiyor, temerrüt nedeniyle tahliye ve TBK 315
- Expected: borclar / H3 / 3. Hukuk Dairesi
- Got: n/a / n/a
- Must hits: 0/3 -> 0%
- Rate limited: yes
- Forbidden hits: none
- Source coverage: n/a
- Zero result reason: n/a
- Rate-limit signals: [YARGI_CLI] spawn:error {"pid":4536,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1296ms | [YARGI_CLI] spawn:error {"pid":16740,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1206ms | [YARGI_CLI] spawn:error {"pid":16880,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1385ms | [YARGI_CLI] spawn:error {"pid":15160,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=2 delay=2431ms

### borclar-kira-ihtiyac (partial)
- Query: İhtiyaç nedeniyle tahliye, kiralananın tahliyesi, TBK 350
- Expected: borclar / H3 / 3. Hukuk Dairesi
- Got: n/a / n/a
- Must hits: 0/3 -> 0%
- Rate limited: yes
- Forbidden hits: none
- Source coverage: n/a
- Zero result reason: n/a
- Rate-limit signals: [YARGI_CLI] spawn:error {"pid":4796,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [YARGI_CLI] spawn:error {"pid":8700,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [YARGI_CLI] spawn:error {"pid":15452,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [YARGI_CLI] spawn:error {"pid":15088,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [YARGI_CLI] spawn:error {"pid":14104,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [YARGI_CLI] spawn:error {"pid":1300,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [YARGI_CLI] spawn:error {"pid":4800,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [YARGI_CLI] spawn:error {"pid":14588,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""}

### borclar-eser-arsa-payi (partial)
- Query: Arsa payı karşılığı inşaat, eksik ifa, ayıplı iş ve gecikme tazminatı
- Expected: borclar / H6 / 6. Hukuk Dairesi
- Got: n/a / n/a
- Must hits: 0/3 -> 0%
- Rate limited: yes
- Forbidden hits: none
- Source coverage: n/a
- Zero result reason: n/a
- Rate-limit signals: [YARGI_CLI] spawn:error {"pid":15416,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1434ms | [YARGI_CLI] spawn:error {"pid":12816,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1087ms | [YARGI_CLI] spawn:error {"pid":12248,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=2 delay=2444ms | [YARGI_CLI] spawn:error {"pid":7116,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [YARGI_CLI] spawn:error {"pid":15616,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""}

### gayrimenkul-tapu-muris (partial)
- Query: Muris muvazaası nedeniyle tapu iptali ve tescil, bedelsiz devir, miras bırakanın gerçek iradesi
- Expected: gayrimenkul / H1 / 1. Hukuk Dairesi
- Got: miras / H1
- Must hits: 3/3 -> 100%
- Rate limited: yes
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a
- Rate-limit signals: [YARGI_CLI] spawn:error {"pid":12816,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1387ms | [YARGI_CLI] spawn:error {"pid":16344,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1480ms | [YARGI_CLI] spawn:error {"pid":14136,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1191ms | [YARGI_CLI] spawn:error {"pid":14064,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1057ms

### gayrimenkul-ortakligin-giderilmesi (partial)
- Query: Ortaklığın giderilmesi, aynen taksim, izalei şuyu ve paylı mülkiyet
- Expected: gayrimenkul / H7 / 7. Hukuk Dairesi
- Got: gayrimenkul / H7
- Must hits: 2/3 -> 67%
- Rate limited: yes
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a
- Rate-limit signals: [YARGI_CLI] spawn:error {"pid":16248,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1460ms | [YARGI_CLI] spawn:error {"pid":13644,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1083ms | [YARGI_CLI] spawn:error {"pid":15832,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1208ms | [YARGI_CLI] spawn:error {"pid":14780,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=2 delay=2286ms

### miras-muris-muvazaasi (partial)
- Query: Miras bırakanın mal kaçırması, muris muvazaası, ölünceye kadar bakma sözleşmesi
- Expected: miras / H1 / 1. Hukuk Dairesi
- Got: miras / H1
- Must hits: 3/3 -> 100%
- Rate limited: yes
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a
- Rate-limit signals: [YARGI_CLI] spawn:error {"pid":14132,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1131ms | [YARGI_CLI] spawn:error {"pid":2376,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1392ms | [YARGI_CLI] spawn:error {"pid":7992,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=2 delay=2080ms | [YARGI_CLI] spawn:error {"pid":16340,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1294ms

### miras-tenkis-sakli-pay (partial)
- Query: Tenkis davası, saklı pay ihlali, miras payı ve tasarruf nisabı
- Expected: miras / H7 / 7. Hukuk Dairesi
- Got: miras / H7
- Must hits: 2/3 -> 67%
- Rate limited: yes
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a
- Rate-limit signals: [YARGI_CLI] spawn:error {"pid":15724,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1253ms | [YARGI_CLI] spawn:error {"pid":2984,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1176ms | [YARGI_CLI] spawn:error {"pid":15332,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1205ms | [YARGI_CLI] spawn:error {"pid":16180,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=2 delay=2255ms

### tuketici-ayipli-mal (partial)
- Query: Ayıplı mal, seçimlik haklar, bedel iadesi ve ücretsiz onarım
- Expected: tuketici / H3 / 3. Hukuk Dairesi
- Got: n/a / n/a
- Must hits: 0/3 -> 0%
- Rate limited: yes
- Forbidden hits: none
- Source coverage: n/a
- Zero result reason: n/a
- Rate-limit signals: [legal-search-plan] Gemini query expansion fallback: {"error":{"code":429,"message":"Resource exhausted. Please try again later. Please refer to https://cloud.google.com/vertex-ai/generative-ai/docs/error-code-429 for more details.","status":"RESOURCE_EXHAUSTED"}}

### ticaret-marka-iltibas (partial)
- Query: Marka hakkına tecavüz, iltibas, karıştırılma ihtimali ve haksız rekabet
- Expected: ticaret / H11 / 11. Hukuk Dairesi
- Got: ticaret / H11
- Must hits: 1/3 -> 33%
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
- Rate limited: yes
- Forbidden hits: none
- Source coverage: n/a
- Zero result reason: n/a
- Rate-limit signals: [LEGAL_SEARCH] search_bedesten_semantic response: {"status":"success","query":"Konkordato ve iflas surecinde alacakli durumu ve tasdik kosullari","original_query":"Konkordato ve iflas surecinde alacakli durumu ve tasdik kosullari","initial_keyword":"konkordato alacakli tasdik","original_initial_keyword":"konkordato alacakli tasdik","inferred_domain":"unknown","total_documents_processed":12,"embedding_dimension":3072,"results":[{"document_id":"1197404600","title":"11. Hukuk Dairesi - Esas: 2026/514 - Karar: 2026/429 - Tarih: 2025-06-26","similar

### icra-itirazin-iptali (partial)
- Query: İİK 67 itirazın iptali, cari hesap alacağı, ticari defterler
- Expected: icra / H11 / 11. Hukuk Dairesi
- Got: icra / H11
- Must hits: 2/3 -> 67%
- Rate limited: yes
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a
- Rate-limit signals: [YARGI_CLI] spawn:error {"pid":10648,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [YARGI_CLI] spawn:error {"pid":14504,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [YARGI_CLI] spawn:error {"pid":10160,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [YARGI_CLI] spawn:error {"pid":8888,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [YARGI_CLI] spawn:error {"pid":15032,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [YARGI_CLI] spawn:error {"pid":11028,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [YARGI_CLI] spawn:error {"pid":16908,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [YARGI_CLI] spawn:error {"pid":9636,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""}

### icra-menfi-tespit (partial)
- Query: Menfi tespit, istirdat, icra takibine konu borcun bulunmadığı iddiası
- Expected: icra / H11 / 11. Hukuk Dairesi
- Got: icra / H11
- Must hits: 0/3 -> 0%
- Rate limited: yes
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a
- Rate-limit signals: [YARGI_CLI] spawn:error {"pid":16828,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1116ms | [YARGI_CLI] spawn:error {"pid":1428,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [YARGI_CLI] spawn:error {"pid":11704,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1173ms | [throttle] 429 attempt=1 delay=1015ms | [YARGI_CLI] spawn:error {"pid":5644,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=2 delay=2368ms

### icra-haciz-meskeniyet (partial)
- Query: Haczedilmezlik şikayeti, meskeniyet, icra mahkemesi kararı
- Expected: icra / H12 / 12. Hukuk Dairesi
- Got: n/a / n/a
- Must hits: 0/3 -> 0%
- Rate limited: yes
- Forbidden hits: none
- Source coverage: n/a
- Zero result reason: n/a
- Rate-limit signals: [YARGI_CLI] spawn:error {"pid":14076,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=1 delay=1100ms | [YARGI_CLI] spawn:error {"pid":15580,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=2 delay=2236ms | [YARGI_CLI] spawn:error {"pid":6824,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [throttle] 429 attempt=3 delay=4333ms | [YARGI_CLI] spawn:error {"pid":5152,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""} | [YARGI_CLI] spawn:error {"pid":3296,"code":"yargi_cli_command_failed","message":"HTTP 429: Too Many Requests","stdoutChunks":1,"stderrChunks":0,"stdoutPreview":"{ \"error\": \"HTTP 429: Too Many Requests\" }","stderrPreview":""}

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
- Must hits: 2/3 -> 67%
- Rate limited: no
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a

### idare-imar-para-cezasi (partial)
- Query: İmar para cezası, orantılılık, ruhsatsız yapı ve iptal davası
- Expected: idare / D6 / 6. Daire
- Got: idare / D6
- Must hits: 2/3 -> 67%
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
- Must hits: 2/3 -> 67%
- Rate limited: no
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a

### vergi-kdv-sahte-fatura (partial)
- Query: Sahte fatura, KDV indirimi, vergi inceleme raporu ve vergi ziyaı
- Expected: vergi / D3 / 3. Daire
- Got: vergi / D3
- Must hits: 2/3 -> 67%
- Rate limited: yes
- Forbidden hits: none
- Source coverage: ok
- Zero result reason: n/a
- Rate-limit signals: [legal-search-plan] Gemini query expansion fallback: {"error":{"code":429,"message":"Resource exhausted. Please try again later. Please refer to https://cloud.google.com/vertex-ai/generative-ai/docs/error-code-429 for more details.","status":"RESOURCE_EXHAUSTED"}}

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

### anayasa-bireysel-makul-sure (partial)
- Query: Bireysel başvuru, makul sürede yargılanma hakkı, manevi tazminat
- Expected: anayasa / n/a / Anayasa Mahkemesi
- Got: anayasa / n/a
- Must hits: 2/3 -> 67%
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
