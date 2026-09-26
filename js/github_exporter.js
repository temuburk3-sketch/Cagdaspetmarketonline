// ========== YENİ GITHUB PROJESİ PAKETLEYİCİ (ONLINE SATIŞ & PAZARYERİ MERKEZİ) ==========
(function() {
    async function ensureJSZipLoaded() {
        if (typeof window.JSZip !== 'undefined') return window.JSZip;
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
            script.onload = () => resolve(window.JSZip);
            script.onerror = () => reject(new Error('JSZip kütüphanesi yüklenemedi.'));
            document.head.appendChild(script);
        });
    }

    async function fetchTextSafe(path) {
        try {
            const res = await fetch(path, { cache: 'no-cache' });
            if (res.ok) return await res.text();
        } catch (e) {}
        return '';
    }

    window.downloadOnlineSalesGithubZip = async function() {
        try {
            const JSZip = await ensureJSZipLoaded();
            const zip = new JSZip();

            const sbUrl = (localStorage.getItem('supabase_url') || '').trim();
            const sbKey = (localStorage.getItem('supabase_key') || '').trim();

            // Mevcut proje dosyalarını çek
            const [
                onlineHtmlRaw,
                stylesCss,
                themeJs,
                stateJs,
                marketplaceJs,
                exporterJs,
                serverJs
            ] = await Promise.all([
                fetchTextSafe('/online-satis.html'),
                fetchTextSafe('/css/styles.css'),
                fetchTextSafe('/js/theme.js'),
                fetchTextSafe('/js/state.js'),
                fetchTextSafe('/js/modules/marketplace.js'),
                fetchTextSafe('/js/github_exporter.js'),
                fetchTextSafe('/server.js')
            ]);

            // Eğer kullanıcının mevcut Supabase URL ve Key'i varsa, indirilen GitHub projesinin içine varsayılan olarak göm
            let finalIndexHtml = onlineHtmlRaw || '';
            if (sbUrl && sbKey && finalIndexHtml) {
                const preloadScript = `\n    <script>\n        if (!localStorage.getItem('supabase_url')) localStorage.setItem('supabase_url', ${JSON.stringify(sbUrl)});\n        if (!localStorage.getItem('supabase_key')) localStorage.setItem('supabase_key', ${JSON.stringify(sbKey)});\n    </script>\n`;
                finalIndexHtml = finalIndexHtml.replace('</head>', preloadScript + '</head>');
            }

            // 1. Ana Dosyalar
            zip.file('index.html', finalIndexHtml);
            zip.file('online-satis.html', finalIndexHtml);
            if (stylesCss) zip.file('css/styles.css', stylesCss);
            if (themeJs) zip.file('js/theme.js', themeJs);
            if (stateJs) zip.file('js/state.js', stateJs);
            if (marketplaceJs) zip.file('js/modules/marketplace.js', marketplaceJs);
            if (exporterJs) zip.file('js/github_exporter.js', exporterJs);
            if (serverJs) zip.file('server.js', serverJs);

            // 2. package.json (Yeni GitHub Deposu için)
            const pkgJson = {
                name: "cagdas-online-satis-pazaryeri",
                version: "1.0.0",
                type: "module",
                description: "Çağdaş Pet Market - Bağımsız Online Satış, Pazaryeri API ve Komisyon Kâr/Zarar Muhasebe Uygulaması (Supabase Senkronlu)",
                main: "server.js",
                scripts: {
                    start: "node server.js",
                    dev: "node server.js"
                },
                dependencies: {
                    express: "^4.18.2",
                    cors: "^2.8.5"
                },
                engines: {
                    node: ">=18.0.0"
                }
            };
            zip.file('package.json', JSON.stringify(pkgJson, null, 2));

            // 3. netlify.toml & vercel.json
            const netlifyToml = `[build]\n  publish = "."\n\n[[redirects]]\n  from = "/*"\n  to = "/index.html"\n  status = 200\n`;
            zip.file('netlify.toml', netlifyToml);

            const vercelJson = {
                version: 2,
                rewrites: [
                    { source: "/(.*)", destination: "/index.html" }
                ]
            };
            zip.file('vercel.json', JSON.stringify(vercelJson, null, 2));

            // 4. .gitignore
            zip.file('.gitignore', 'node_modules/\n.env\n.DS_Store\n');

            // 5. README.md (Adım Adım GitHub & Supabase Kurulum Kılavuzu)
            const readmeMd = `# 🌐 Çağdaş Online Satış & Pazaryeri Muhasebe Merkezi (Bağımsız GitHub Projesi)

Bu proje, **Çağdaş Pet Market** ana mağaza kasa programından tamamen ayrılmış, **kendi bağımsız Kâr/Zarar ve Komisyon muhasebesine** sahip olan **Online Satış & Pazaryeri Uygulamasıdır**.

## 🛡️ Muhasebe ve Stok Mimarisi (Nasıl Çalışır?)

İki program aynı **Supabase** veritabanına bağlanır ancak **Kâr/Zarar hesapları birbirine asla karışmaz**:

1. **Ortak Stok & Ürün Havuzu (\`id = 'cagdas_main'\`)**:
   - Ürün isimleri, barkodlar, alış fiyatları ve mağaza/depo stok adetleri ortaktır.
   - Online satış yapıldığında ürünün stoğu Supabase üzerinden otomatik düşer, böylece mağaza kasasında da güncel stok görünür.
2. **Bağımsız Online Kâr/Zarar & Komisyon (\`id = 'cagdas_online_data'\`)**:
   - Trendyol, Hepsiburada, GetirÇarşı ve Yemeksepeti siparişleri, komisyon oranları, kargo kesintileri, hizmet bedelleri ve saf online net kâr **yalnızca bu projede (\`cagdas_online_data\`)** tutulur.
   - Ana mağazanın **FIFO ve Vergi Kâr/Zarar** raporlarına online satışlar veya komisyonlar kesinlikle dahil edilmez.

## 🚀 Yeni GitHub Deposuna Yükleme Adımları

1. GitHub'da yeni bir repo açın (Örn: \`cagdas-online-satis\`).
2. Bu ZIP dosyasının içindeki tüm dosya ve klasörleri (\`index.html\`, \`css/\`, \`js/\`, \`server.js\`, \`package.json\`, \`netlify.toml\`, \`vercel.json\`) yeni GitHub deponuza yükleyin (Upload files -> Commit changes).
3. **Canlıya Alma (Ücretsiz Hosting)**:
   - **Netlify / Vercel**: Yeni GitHub deponuzu bağlayın, anında çalışır.
   - **Render / Railway / Node.js Sunucu**: \`npm install && npm start\` komutu ile Pazaryeri API Proxy destekli olarak çalışır.
`;
            zip.file('README.md', readmeMd);

            const blob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `cagdas-online-satis-github-projesi.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 5000);
        } catch (err) {
            alert('⚠️ GitHub proje paketi oluşturulurken hata oluştu: ' + (err.message || err));
        }
    };
})();
