# Yargi Repo Entegrasyon Notlari

Bu not, karar arama tarafinda iki repo arasindaki farki netlestirmek icin yazildi.

## 1. yargi-cli ne yapiyor

Kaynak:
- https://github.com/saidsurucu/yargi-cli

Ozet:
- Bedesten API'ye ince bir CLI katmani sagliyor.
- `yargi bedesten search "<phrase>"` ile karar ariyor.
- `yargi bedesten doc <documentId>` ile tam metni cekiyor.
- JSON cikisi veriyor.

Bu repo tek basina akilli siralama motoru degil.
Asil gucu:
- temiz Bedesten request yapisi
- birimAdi kodlarini tam ada cevirme
- dokumani markdown olarak alma

## 2. yargi-mcp ne yapiyor

Kaynak:
- https://github.com/saidsurucu/yargi-mcp

Ozet:
- MCP sunucusu olarak calisiyor.
- README'ye gore `search_bedesten_unified` ve `get_bedesten_document_markdown` araclarini sunuyor.
- Yerelde ASGI / streamable-http olarak calistirilabiliyor.

Bu repo, uygulamaya servis gibi baglanmak icin daha uygun.

## 3. Bu projede secilen entegrasyon yolu

Bu projede yeni ayar:
- `LEGAL_PRIMARY_BACKEND=simple`
- `LEGAL_PRIMARY_BACKEND=mcp`

Anlami:
- `simple`: mevcut dogrudan Bedesten yolu ana yol olur
- `mcp`: Yargi MCP ana yol olur

Ek ayar:
- `YARGI_MCP_URL=http://127.0.0.1:8000/mcp/`

Boylece lokal Yargi MCP ayaga kalktiginda uygulama remote fastmcp yerine ona yonelebilir.

## 4. Neden bu yol secildi

`yargi-cli` faydali ama daha cok:
- terminal araci
- adaptör
- elle ya da agent ile kullanilan JSON cikisli istemci

`yargi-mcp` ise:
- servis gibi calisabiliyor
- bizim mevcut MCP akisimizla dogrudan uyumlu
- kodu daha az kirarak entegre oluyor

## 5. Pratik sonuc

Karar aramada iki mod var:
- hizli dogrudan Bedesten
- servis tabanli MCP

Lokal Yargi MCP kuruldugunda `.env` icinde sadece backend modu ve URL degistirilerek test edilebilir.
