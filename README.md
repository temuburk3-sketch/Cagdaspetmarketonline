# 🌐 Çağdaş Online Satış & Pazaryeri Muhasebe Merkezi (Bağımsız GitHub Projesi)

Bu proje, **Çağdaş Pet Market** ana mağaza kasa programından tamamen ayrılmış, **kendi bağımsız Kâr/Zarar ve Komisyon muhasebesine** sahip olan **Online Satış & Pazaryeri Uygulamasıdır**.

## 🛡️ Muhasebe ve Stok Mimarisi (Nasıl Çalışır?)

İki program aynı **Supabase** veritabanına bağlanır ancak **Kâr/Zarar hesapları birbirine asla karışmaz**:

1. **Ortak Stok & Ürün Havuzu (`id = 'cagdas_main'`)**:
   - Ürün isimleri, barkodlar, alış fiyatları ve mağaza/depo stok adetleri ortaktır.
   - Online satış yapıldığında ürünün stoğu Supabase üzerinden otomatik düşer, böylece mağaza kasasında da güncel stok görünür.
2. **Bağımsız Online Kâr/Zarar & Komisyon (`id = 'cagdas_online_data'`)**:
   - Trendyol, Hepsiburada, GetirÇarşı ve Yemeksepeti siparişleri, komisyon oranları, kargo kesintileri, hizmet bedelleri ve saf online net kâr **yalnızca bu projede (`cagdas_online_data`)** tutulur.
   - Ana mağazanın **FIFO ve Vergi Kâr/Zarar** raporlarına online satışlar veya komisyonlar kesinlikle dahil edilmez.

## 🚀 Yeni GitHub Deposuna Yükleme Adımları

1. GitHub'da yeni bir repo açın (Örn: `cagdas-online-satis`).
2. Bu ZIP dosyasının içindeki tüm dosya ve klasörleri (`index.html`, `css/`, `js/`, `server.js`, `package.json`, `netlify.toml`, `vercel.json`) yeni GitHub deponuza yükleyin (Upload files -> Commit changes).
3. **Canlıya Alma (Ücretsiz Hosting)**:
   - **Netlify / Vercel**: Yeni GitHub deponuzu bağlayın, anında çalışır.
   - **Render / Railway / Node.js Sunucu**: `npm install && npm start` komutu ile Pazaryeri API Proxy destekli olarak çalışır.
