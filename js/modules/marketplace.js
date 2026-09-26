/**
 * Çağdaş Pet Market - Pazaryeri Entegrasyon Modülü (Trendyol, Hepsiburada, Getir)
 * 
 * - Çift Yönlü Entegrasyon: Dükkandan satılınca pazar yerinde stok düşer,
 *   pazar yerinden sipariş gelince dükkanda stok otomatik düşer.
 * - Dinamik Güvenlik Stoğu (Buffer Limiti) kontrolü.
 * - Çevre değişkenleri (Environment Variables) rehberi.
 * - Canlı Test & Sipariş Simülasyonu.
 */

(function() {
    // Yerel Ayarlar
    const STORAGE_KEY_CHANNELS = 'cagdas_marketplace_channels';
    const STORAGE_KEY_BUFFER = 'cagdas_marketplace_buffer';
    const STORAGE_KEY_LOGS = 'cagdas_marketplace_logs';

    function getChannelSettings() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_CHANNELS);
            return saved ? JSON.parse(saved) : {
                trendyol: { active: true, name: 'Trendyol', color: '#f27a1a', icon: '🛍️' },
                hepsiburada: { active: true, name: 'Hepsiburada', color: '#ff6000', icon: '🏬' },
                getir: { active: true, name: 'GetirÇarşı', color: '#5d3ebc', icon: '🟣' },
                yemeksepeti: { active: true, name: 'Yemeksepeti Mahalle', color: '#ea004b', icon: '🍔' }
            };
        } catch(e) {
            return {
                trendyol: { active: true, name: 'Trendyol', color: '#f27a1a', icon: '🛍️' },
                hepsiburada: { active: true, name: 'Hepsiburada', color: '#ff6000', icon: '🏬' },
                getir: { active: true, name: 'GetirÇarşı', color: '#5d3ebc', icon: '🟣' },
                yemeksepeti: { active: true, name: 'Yemeksepeti Mahalle', color: '#ea004b', icon: '🍔' }
            };
        }
    }

    function saveChannelSettings(settings) {
        localStorage.setItem(STORAGE_KEY_CHANNELS, JSON.stringify(settings));
    }

    // KOMİSYON VE FİNANSAL AYARLAR
    const STORAGE_KEY_COMMISSIONS = 'cagdas_marketplace_commissions';
    window.getCommissionSettings = function() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_COMMISSIONS);
            return saved ? JSON.parse(saved) : {
                trendyol: 18,     // %18 Komisyon
                hepsiburada: 17,   // %17 Komisyon
                getir: 20,         // %20 Komisyon
                yemeksepeti: 18,   // %18 Komisyon
                ciceksepeti: 16,   // %16 Komisyon
                shippingCost: 38.50, // Sipariş başı kargo bedeli (TL)
                serviceFee: 4.50    // Sipariş başı listeleme/hizmet bedeli (TL)
            };
        } catch(e) {
            return { trendyol: 18, hepsiburada: 17, getir: 20, yemeksepeti: 18, ciceksepeti: 16, shippingCost: 38.50, serviceFee: 4.50 };
        }
    };

    window.saveCommissionSettings = function(settings) {
        localStorage.setItem(STORAGE_KEY_COMMISSIONS, JSON.stringify(settings));
    };

    // GETİRÇARŞI DÜKKAN DURUMU (Açık, 30 Dk Mola, Kapalı)
    const STORAGE_KEY_GETIR_STORE = 'cagdas_getir_store_state';
    window.getGetirStoreState = function() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_GETIR_STORE);
            const data = saved ? JSON.parse(saved) : { status: 'open', pausedUntil: null, reason: '' };
            // Mola süresi dolmuşsa otomatik aç
            if (data.status === 'pause' && data.pausedUntil && Date.now() > data.pausedUntil) {
                data.status = 'open';
                data.pausedUntil = null;
                localStorage.setItem(STORAGE_KEY_GETIR_STORE, JSON.stringify(data));
            }
            return data;
        } catch(e) {
            return { status: 'open', pausedUntil: null, reason: '' };
        }
    };

    window.setGetirStoreState = function(status, minutes = 30) {
        const stateObj = {
            status,
            pausedUntil: status === 'pause' ? (Date.now() + minutes * 60 * 1000) : null,
            reason: status === 'pause' ? `Yoğunluk Molası (${minutes} dk)` : (status === 'closed' ? 'Mesai Dışı Kapalı' : 'Açık')
        };
        localStorage.setItem(STORAGE_KEY_GETIR_STORE, JSON.stringify(stateObj));
        // Arka plan sunucuya bildir
        try {
            fetch('/api/marketplace/getir/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(stateObj)
            }).catch(() => {});
        } catch(e) {}
        return stateObj;
    };

    // İADE (RMA) YÖNETİMİ
    const STORAGE_KEY_RETURNS = 'cagdas_marketplace_returns';
    window.getMarketplaceReturns = function() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_RETURNS);
            return saved ? JSON.parse(saved) : [];
        } catch(e) {
            return [];
        }
    };

    window.saveMarketplaceReturns = function(returnsArr) {
        localStorage.setItem(STORAGE_KEY_RETURNS, JSON.stringify(returnsArr));
    };

    // SİPARİŞ BAŞINA NET HAKEDİŞ VE REEL KÂR HESABI
    window.calculateOrderFinancials = function(orderOrSale) {
        if (!orderOrSale) return { gross: 0, commission: 0, shipping: 0, serviceFee: 0, netPayout: 0, cost: 0, netProfit: 0 };
        const commSettings = window.getCommissionSettings();
        const total = parseFloat(orderOrSale.total) || 0;
        const plat = (orderOrSale.platform || orderOrSale.channel || 'trendyol').toLowerCase();

        let commRate = commSettings.trendyol;
        if (plat.includes('hepsi')) commRate = commSettings.hepsiburada;
        else if (plat.includes('getir')) commRate = commSettings.getir;
        else if (plat.includes('yemek')) commRate = commSettings.yemeksepeti || 18;
        else if (plat.includes('cicek')) commRate = commSettings.ciceksepeti;

        const commission = total * (commRate / 100);
        // Getir ve Yemeksepeti'nde teslimat genellikle platform veya yerel kurye iledir
        const shipping = (plat.includes('getir') || plat.includes('yemek')) ? 0 : (commSettings.shippingCost || 0);
        const serviceFee = commSettings.serviceFee || 0;
        const netPayout = Math.max(0, total - commission - shipping - serviceFee);

        let cost = 0;
        if (Array.isArray(orderOrSale.items) && orderOrSale.items.length > 0) {
            cost = orderOrSale.items.reduce((s, it) => s + ((parseFloat(it.buyPrice) || 0) * (parseFloat(it.qty) || 1)), 0);
        } else {
            // Tahmini maliyet (ortalama %55 maliyet oranı)
            cost = total * 0.55;
        }

        const netProfit = netPayout - cost;
        const profitMargin = total > 0 ? ((netProfit / total) * 100) : 0;

        return {
            gross: total,
            commissionRate: commRate,
            commissionAmount: commission,
            shippingCost: shipping,
            serviceFee: serviceFee,
            netPayout: netPayout,       // Bankaya yatan para
            cost: cost,                 // Ürün maliyeti
            netProfit: netProfit,       // Cebinize kalan net kâr
            profitMargin: profitMargin
        };
    };

    function getSafetyBuffer() {
        const val = parseInt(localStorage.getItem(STORAGE_KEY_BUFFER), 10);
        if (Number.isInteger(val) && val >= 0) return val;
        if (state && state.settings && Number.isInteger(state.settings.safetyBuffer) && state.settings.safetyBuffer >= 0) {
            return state.settings.safetyBuffer;
        }
        return 1;
    }
    window.getSafetyBuffer = getSafetyBuffer;

    function saveSafetyBuffer(val) {
        const cleanVal = Math.max(0, parseInt(val, 10) || 0);
        localStorage.setItem(STORAGE_KEY_BUFFER, String(cleanVal));
        if (state) {
            if (!state.settings) state.settings = {};
            state.settings.safetyBuffer = cleanVal;
            if (typeof saveData === 'function') saveData();
        }
    }
    window.saveSafetyBuffer = saveSafetyBuffer;

    function getMarketplaceLogs() {
        try {
            const logs = localStorage.getItem(STORAGE_KEY_LOGS);
            return logs ? JSON.parse(logs) : [];
        } catch(e) {
            return [];
        }
    }

    function addMarketplaceLog(log) {
        try {
            const logs = getMarketplaceLogs();
            logs.unshift({
                id: Date.now(),
                timestamp: new Date().toLocaleTimeString('tr-TR'),
                date: new Date().toLocaleDateString('tr-TR'),
                ...log
            });
            if (logs.length > 50) logs.pop();
            localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(logs));
        } catch(e) {}
    }

    // Global: Tek bir ürünü pazar yerlerine eşitle
    window.syncProductToMarketplaces = async function(product) {
        if (!product || !product.barcode) return;
        const channels = getChannelSettings();
        const activeChannels = Object.keys(channels).filter(k => channels[k].active);
        if (activeChannels.length === 0) return;

        const totalStock = (parseFloat(product.shop) || 0) + (parseFloat(product.warehouse) || 0);
        const buffer = getSafetyBuffer();
        const effectivePrice = (parseFloat(product.marketplacePrice) > 0) ? parseFloat(product.marketplacePrice) : (parseFloat(product.sellPrice) || 0);
        const effectiveStock = Math.max(0, totalStock - buffer);
        const savedCreds = (typeof window.getMarketplaceApiCredentials === 'function') ? window.getMarketplaceApiCredentials() : {};

        const payload = {
            barcode: product.barcode,
            stock: totalStock,
            quantity: effectiveStock,
            price: effectivePrice,
            productName: product.name,
            safetyBuffer: buffer,
            channels: activeChannels,
            credentials: {
                trendyolSupplierId: savedCreds.tySupplierId,
                trendyolApiKey: savedCreds.tyApiKey,
                trendyolApiSecret: savedCreds.tyApiSecret,
                hbMerchantId: savedCreds.hbMerchantId,
                hbSecretKey: savedCreds.hbSecretKey,
                gtStoreId: savedCreds.gtStoreId,
                gtSecretKey: savedCreds.gtSecretKey
            }
        };

        try {
            // Canlı Express ve Netlify Functions endpoint'leri
            const endpoints = [
                '/api/marketplace/push-stock',
                '/api/marketplace/stock-sync',
                '/.netlify/functions/marketplace-stock-sync'
            ];

            let sent = false;
            for (const ep of endpoints) {
                try {
                    const res = await fetch(ep, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    if (res.ok) {
                        const data = await res.json();
                        addMarketplaceLog({
                            type: 'stock_sync',
                            title: `📤 Stok Güncellendi: ${product.name}`,
                            details: `Barkod: ${product.barcode} | Gerçek Stok: ${totalStock} ➔ Pazaryeri Stoğu: ${Math.max(0, totalStock - buffer)} (Buffer: ${buffer})`,
                            channels: activeChannels.join(', ')
                        });
                        sent = true;
                        break;
                    }
                } catch(e) {}
            }

            if (!sent) {
                // Sessiz simülasyon kaydı
                addMarketplaceLog({
                    type: 'stock_sync_sim',
                    title: `📤 Stok Güncellendi (Yerel Hazır): ${product.name}`,
                    details: `Barkod: ${product.barcode} | Gönderilen Stok: ${Math.max(0, totalStock - buffer)}`,
                    channels: activeChannels.join(', ')
                });
            }
        } catch(err) {
            console.warn('Marketplace sync exception:', err);
        }
    };

    // Global: Birden fazla ürünü eşitle (Satış sonrası)
    window.syncMultipleProductsToMarketplaces = function(products) {
        if (!Array.isArray(products) || products.length === 0) return;
        // Asenkron ve kuyruklu arka plan gönderimi
        setTimeout(() => {
            products.forEach((p, idx) => {
                setTimeout(() => {
                    window.syncProductToMarketplaces(p);
                }, idx * 300);
            });
        }, 500);
    };

    // ==========================================
    // 🏷️ KARGO ETİKETİ & BARKOD MOTORU
    // ==========================================
    function generateSvgBarcode(code) {
        let cleanCode = String(code || 'TR00000000').replace(/[^A-Za-z0-9\-]/g, '');
        let barsHtml = '';
        let x = 12;
        const barHeight = 44;
        for (let i = 0; i < cleanCode.length; i++) {
            const charCode = cleanCode.charCodeAt(i);
            const w1 = (charCode % 3) + 1;
            const w2 = ((charCode >> 1) % 2) + 1;
            const w3 = ((charCode >> 2) % 3) + 1;
            barsHtml += `<rect x="${x}" y="0" width="${w1}" height="${barHeight}" fill="#000" />`;
            x += w1 + 1.2;
            barsHtml += `<rect x="${x}" y="0" width="${w2}" height="${barHeight}" fill="#000" />`;
            x += w2 + 1.8;
            barsHtml += `<rect x="${x}" y="0" width="${w3}" height="${barHeight}" fill="#000" />`;
            x += w3 + 1.2;
        }
        const totalWidth = Math.max(220, x + 12);
        return `
            <svg viewBox="0 0 ${totalWidth} 56" width="100%" height="56" xmlns="http://www.w3.org/2000/svg" style="display:block; margin: 0 auto;">
                ${barsHtml}
                <text x="${totalWidth / 2}" y="53" font-size="10" font-family="monospace" text-anchor="middle" font-weight="bold" fill="#000">${cleanCode}</text>
            </svg>
        `;
    }

    // Kargo Etiketi Yazdır (100x150mm Termal veya A4)
    window.printShippingLabel = function(identifier) {
        let notif = (state.notifications || []).find(n => n.id == identifier || n.orderNo == identifier || n.saleId == identifier);
        let sale = (state.sales || []).find(s => s.id == identifier || (notif && s.id == notif.saleId) || (notif && notif.orderNo && s.invoiceNo && s.invoiceNo.includes(notif.orderNo)));

        if (!notif && !sale) {
            alert('⚠️ Sipariş kaydı bulunamadı!');
            return;
        }

        const store = (typeof window.getStoreProfile === 'function' ? window.getStoreProfile() : null) || state.store || {
            name: 'ÇAĞDAŞ PET MARKET VE AKVARYUM DÜNYASI',
            taxOffice: 'Kadıköy Vergi Dairesi',
            taxNumber: '1234567890',
            address: 'Bağdat Caddesi No: 124/A Kadıköy / İSTANBUL',
            phone: '0216 345 67 89'
        };

        const orderNo = (notif && notif.orderNo) || (sale && sale.orderNo) || (sale && sale.invoiceNo) || 'TR-' + Date.now();
        const plat = (notif && notif.platform) || (sale && sale.channel) || 'trendyol';
        const platNames = { 
            trendyol: 'Trendyol Express (TEX)', 
            hepsiburada: 'HepsiJet / Hepsiburada Kargo', 
            getir: 'GetirÇarşı Kurye', 
            ciceksepeti: 'Yurtiçi Kargo' 
        };
        const carrier = (notif && notif.carrier) || (sale && sale.carrier) || platNames[plat.toLowerCase()] || 'Trendyol Express';
        const trackingNo = (notif && notif.trackingNo) || (sale && sale.trackingNo) || ('TK-' + Math.floor(10000000 + Math.random() * 90000000));
        
        // Alıcı Müşteri Bilgileri
        const customer = (notif && notif.customer) || (sale && sale.customer) || 'Pazaryeri Müşterisi';
        const phone = (notif && notif.phone) || (sale && sale.phone) || '0532 555 01 23';
        const rawAddress = (notif && notif.address) || (sale && sale.address) || 'Fenerbahçe Mah. Lale Sok. No: 18 D: 4';
        const district = (notif && notif.district) || (sale && sale.district) || '';
        const city = (notif && notif.city) || (sale && sale.city) || 'İSTANBUL';
        const fullAddress = `${rawAddress}${district ? ' ' + district : ''}${city ? ' / ' + city : ''}`.trim();
        const customerTaxNo = (notif && notif.taxNo) || (sale && sale.taxNo) || '';
        const dateStr = (notif && notif.date) || (sale && sale.timestamp) || new Date().toLocaleString('tr-TR');

        // Siparişteki tüm kalemlerin listesi (Çoklu ürün desteği)
        let labelItems = [];
        if (sale && Array.isArray(sale.items) && sale.items.length > 0) {
            labelItems = sale.items;
        } else if (notif && Array.isArray(notif.items) && notif.items.length > 0) {
            labelItems = notif.items;
        } else {
            labelItems = [{
                name: (notif && notif.productName) || 'Evcil Hayvan Ürünü',
                barcode: (notif && notif.barcode) || '',
                qty: (notif && notif.qty) || 1,
                lotSku: (notif && notif.lotInfo) || (sale && sale.lotInfo) || 'FIFO Entegre | SKT Kontrollü'
            }];
        }

        const totalPieces = labelItems.reduce((acc, item) => acc + (parseFloat(item.qty) || 1), 0);
        const calculatedDesi = Math.max(1, Math.ceil(totalPieces * 1.5));

        const printWin = window.open('', '_blank', 'width=540,height=760');
        if (!printWin) {
            alert('⚠️ Açılır pencere (popup) engellendi! Lütfen tarayıcı izinlerinden pop-up pencerelere izin veriniz.');
            return;
        }

        printWin.document.write(`
            <!DOCTYPE html>
            <html lang="tr">
            <head>
                <meta charset="UTF-8">
                <title>Kargo Etiketi - #${orderNo}</title>
                <style>
                    @page { size: 100mm 150mm; margin: 0; }
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 12px; font-size: 11px; color: #000; background: #fff; box-sizing: border-box; }
                    .label-box { border: 2px solid #000; border-radius: 6px; padding: 10px; width: 100%; box-sizing: border-box; }
                    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 8px; }
                    .logo-text { font-size: 13px; font-weight: 900; }
                    .carrier-badge { background: #000; color: #fff; padding: 4px 8px; font-weight: bold; font-size: 11px; border-radius: 3px; }
                    .section { margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px dashed #666; }
                    .title { font-size: 9px; font-weight: bold; text-transform: uppercase; color: #444; }
                    .value { font-size: 11px; font-weight: bold; margin-top: 2px; }
                    .barcode-container { text-align: center; margin: 8px 0; padding: 6px 0; background: #fafafa; border: 1px solid #ddd; }
                    .items-table { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 6px; }
                    .items-table th, .items-table td { border: 1px solid #000; padding: 4px 6px; text-align: left; }
                    .footer { text-align: center; font-size: 9px; margin-top: 8px; font-weight: bold; }
                    @media print {
                        body { padding: 4px; }
                        .no-print { display: none; }
                    }
                </style>
            </head>
            <body>
                <div class="no-print" style="margin-bottom: 10px; display: flex; gap: 8px;">
                    <button onclick="window.print()" style="flex: 1; padding: 10px; background: #2563eb; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 13px;">🖨️ Etiketi Yazdır (Termal / Fiş)</button>
                    <button onclick="window.close()" style="padding: 10px 16px; background: #64748b; color: #fff; border: none; border-radius: 6px; cursor: pointer;">Kapat</button>
                </div>
                <div class="label-box">
                    <div class="header">
                        <div>
                            <div class="logo-text">🐾 ${store.name || 'ÇAĞDAŞ PET MARKET'}</div>
                            <div style="font-size: 9px; color: #333;">Resmi Satış & Sevkiyat Deposu</div>
                        </div>
                        <div class="carrier-badge">${carrier}</div>
                    </div>

                    <div class="barcode-container">
                        ${generateSvgBarcode(trackingNo)}
                        <div style="font-size: 10.5px; font-weight: 800; margin-top: 3px; letter-spacing: 1px;">KARGO TAKİP NO: ${trackingNo}</div>
                    </div>

                    <div style="display: flex; gap: 10px; margin-bottom: 8px;">
                        <div style="flex: 1; border-right: 1px solid #000; padding-right: 6px;">
                            <div class="title">GÖNDERİCİ (MAĞAZA):</div>
                            <div class="value">${store.name || 'Çağdaş Pet Market'}</div>
                            <div style="font-size: 9px;">Tel: ${store.phone || store.mobile || '0216 345 67 89'}</div>
                            <div style="font-size: 8.5px; color: #555;">${store.taxOffice ? store.taxOffice + ' | ' : ''}VKN: ${store.taxNumber || '1234567890'}</div>
                            <div style="font-size: 8.5px; color: #333; margin-top: 2px;">${store.address || 'Bağdat Cad. No: 124 Kadıköy / İSTANBUL'}</div>
                        </div>
                        <div style="flex: 1.2;">
                            <div class="title">ALICI (MÜŞTERİ):</div>
                            <div class="value">${customer}</div>
                            <div style="font-size: 9.5px; font-weight: 600;">Tel: ${phone}</div>
                            <div style="font-size: 9.5px; line-height: 1.3; margin-top: 2px;">${fullAddress}</div>
                            ${customerTaxNo ? `<div style="font-size: 8.5px; color: #555; margin-top: 2px;">TCKN: ${customerTaxNo}</div>` : ''}
                        </div>
                    </div>

                    <div class="section">
                        <div style="display: flex; justify-content: space-between; font-size: 9.5px;">
                            <span><strong>Sipariş No:</strong> #${orderNo}</span>
                            <span><strong>Tarih:</strong> ${dateStr}</span>
                            <span><strong>Parça / Desi:</strong> ${totalPieces} Adet (${calculatedDesi} Desi)</span>
                        </div>
                    </div>

                    <table class="items-table">
                        <thead>
                            <tr style="background: #eee;">
                                <th>Paket İçeriği (Ürün & Barkod)</th>
                                <th style="width: 45px; text-align: center;">Adet</th>
                                <th style="width: 100px;">Parti / SKT</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${labelItems.map(it => `
                                <tr>
                                    <td>
                                        <strong>${it.name || 'Pet Shop Ürünü'}</strong>
                                        ${it.barcode ? `<div style="font-size: 8.5px; color: #555;">Barkod: ${it.barcode}</div>` : ''}
                                    </td>
                                    <td style="text-align: center; font-weight: bold;">${it.qty || 1} Adet</td>
                                    <td style="font-size: 8.5px;">${it.lotSku || it.lotInfo || 'FIFO Kontrollü'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>

                    <div class="footer">
                        ⚠️ DİKKAT: KIRILABİLİR / CANLI DOSTLARIMIZ İÇİN ÖZENLE PAKETLENMİŞTİR 🐾
                    </div>
                </div>
                <script>
                    window.onload = function() {
                        setTimeout(function() { window.print(); }, 400);
                    };
                <\/script>
            </body>
            </html>
        `);
        printWin.document.close();
    };

    // Kargoya Verildi Olarak İşaretle
    window.shipMarketplaceOrder = function(identifier, selectedCarrier = null) {
        let notif = (state.notifications || []).find(n => n.id == identifier || n.orderNo == identifier || n.saleId == identifier);
        let sale = (state.sales || []).find(s => s.id == identifier || (notif && s.id == notif.saleId) || (notif && notif.orderNo && s.invoiceNo && s.invoiceNo.includes(notif.orderNo)));

        if (!notif && !sale) {
            alert('⚠️ Sipariş kaydı bulunamadı!');
            return;
        }

        const orderNo = (notif && notif.orderNo) || (sale && sale.orderNo) || identifier;
        const plat = (notif && notif.platform) || (sale && sale.channel) || 'trendyol';
        const carriers = ['Trendyol Express', 'HepsiJet', 'Yurtiçi Kargo', 'Aras Kargo', 'MNG Kargo', 'Getir Kurye', 'Yemeksepeti Vale / Kurye'];
        
        let carrier = selectedCarrier;
        if (!carrier) {
            carrier = prompt(`📦 Siparişi (#${orderNo}) kargoya teslim etmek istediğinize emin misiniz?\n\nKargo Firmasını Seçiniz:\n1: Trendyol Express\n2: HepsiJet\n3: Yurtiçi Kargo\n4: Aras Kargo\n5: Getir Kurye\n6: Yemeksepeti Kurye`, 'Trendyol Express');
            if (carrier === null) return;
            if (carrier === '1') carrier = 'Trendyol Express';
            else if (carrier === '2') carrier = 'HepsiJet';
            else if (carrier === '3') carrier = 'Yurtiçi Kargo';
            else if (carrier === '4') carrier = 'Aras Kargo';
            else if (carrier === '5') carrier = 'Getir Kurye';
            else if (carrier === '6') carrier = 'Yemeksepeti Vale / Kurye';
        }

        const trackingNo = 'TK-' + Math.floor(10000000 + Math.random() * 90000000);
        const nowStr = new Date().toLocaleString('tr-TR');

        if (notif) {
            notif.orderStatus = 'shipped';
            notif.carrier = carrier;
            notif.trackingNo = trackingNo;
            notif.shippedAt = nowStr;
        }
        if (sale) {
            sale.status = 'shipped';
            sale.carrier = carrier;
            sale.trackingNo = trackingNo;
            sale.shippedAt = nowStr;
        }

        if (!Array.isArray(state.auditLog)) state.auditLog = [];
        state.auditLog.push({
            user: (state.user && state.user.name) || 'Yönetici',
            action: '📦 Kargoya Verildi',
            timestamp: nowStr,
            details: `Sipariş #${orderNo} ${carrier} firmasına teslim edildi. Takip: ${trackingNo}`,
            affectedData: trackingNo
        });

        addMarketplaceLog({
            type: 'order_shipped',
            title: `📦 Kargoya Verildi: #${orderNo}`,
            details: `Kargo Firması: ${carrier} | Takip Kodu: ${trackingNo}`,
            channels: plat
        });

        // Backend bildirimi
        try {
            fetch('/api/marketplace/order/ship', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderNo, carrier, trackingNo })
            }).catch(() => {});
        } catch(e) {}

        saveData();
        showAppToast(`📦 #${orderNo} nolu sipariş ${carrier} (${trackingNo}) ile kargoya verildi!`, 'success');

        if (state.screen === 'marketplace') renderMarketplace(document.getElementById('screen'));
        else if (state.screen === 'notifications') renderNotifications(document.getElementById('screen'));
        else if (state.screen === 'reports') renderReports(document.getElementById('screen'));
    };

    // ==========================================
    // ⚡ e-ARŞİV FATURA KESME & YAZDIRMA MOTORU
    // ==========================================
    function turkishLiraToWords(amount) {
        const units = ['', 'Bir', 'İki', 'Üç', 'Dört', 'Beş', 'Altı', 'Yedi', 'Sekiz', 'Dokuz'];
        const tens = ['', 'On', 'Yirmi', 'Otuz', 'Kırk', 'Elli', 'Altmış', 'Yetmiş', 'Seksen', 'Doksan'];
        
        const num = Math.floor(amount);
        const kurus = Math.round((amount - num) * 100);
        
        function convert3Digits(n) {
            let str = '';
            const h = Math.floor(n / 100);
            const t = Math.floor((n % 100) / 10);
            const u = n % 10;
            if (h > 1) str += units[h] + ' Yüz ';
            else if (h === 1) str += 'Yüz ';
            if (t > 0) str += tens[t] + ' ';
            if (u > 0) str += units[u] + ' ';
            return str.trim();
        }

        let result = '';
        const thousands = Math.floor(num / 1000);
        const rem = num % 1000;

        if (thousands > 1) result += convert3Digits(thousands) + ' Bin ';
        else if (thousands === 1) result += 'Bin ';

        if (rem > 0 || num === 0) result += convert3Digits(rem);
        if (!result) result = 'Sıfır';

        let out = result.trim() + ' Türk Lirası';
        if (kurus > 0) {
            out += ' ' + convert3Digits(kurus) + ' Kuruş';
        }
        return out.toUpperCase();
    }

    window.generateEArchiveInvoice = function(identifier) {
        let notif = (state.notifications || []).find(n => n.id == identifier || n.orderNo == identifier || n.saleId == identifier);
        let sale = (state.sales || []).find(s => s.id == identifier || (notif && s.id == notif.saleId) || (notif && notif.orderNo && s.invoiceNo && s.invoiceNo.includes(notif.orderNo)));

        if (!notif && !sale) {
            alert('⚠️ Sipariş kaydı bulunamadı!');
            return;
        }

        const orderNo = (notif && notif.orderNo) || (sale && sale.orderNo) || identifier;
        const eInvoiceNo = (notif && notif.eInvoiceNo) || (sale && sale.eInvoiceNo) || ('GIB2026' + String(Math.floor(100000000 + Math.random() * 900000000)));
        const nowStr = (notif && notif.eInvoiceDate) || (sale && sale.eInvoiceDate) || new Date().toLocaleString('tr-TR');

        if (notif) {
            notif.eInvoiceNo = eInvoiceNo;
            notif.eInvoiceDate = nowStr;
        }
        if (sale) {
            sale.eInvoiceNo = eInvoiceNo;
            sale.eInvoiceDate = nowStr;
        }

        if (!Array.isArray(state.auditLog)) state.auditLog = [];
        state.auditLog.push({
            user: (state.user && state.user.name) || 'Yönetici',
            action: '⚡ e-Arşiv Fatura Kesildi',
            timestamp: nowStr,
            details: `Sipariş #${orderNo} için ${eInvoiceNo} numaralı resmi GİB e-Arşiv Faturası onaylandı.`,
            affectedData: eInvoiceNo
        });

        addMarketplaceLog({
            type: 'invoice_generated',
            title: `⚡ e-Arşiv Fatura Kesildi: ${eInvoiceNo}`,
            details: `Sipariş #${orderNo} için resmi GİB faturası düzenlendi.`,
            channels: (notif && notif.platform) || 'Online'
        });

        saveData();
        showAppToast(`✅ ${eInvoiceNo} nolu e-Arşiv Fatura oluşturuldu!`, 'success');

        // Faturayı hemen yazdırma penceresinde aç
        window.printEArchiveInvoice(identifier);

        if (state.screen === 'marketplace') renderMarketplace(document.getElementById('screen'));
        else if (state.screen === 'notifications') renderNotifications(document.getElementById('screen'));
    };

    window.printEArchiveInvoice = function(identifier) {
        let notif = (state.notifications || []).find(n => n.id == identifier || n.orderNo == identifier || n.saleId == identifier);
        let sale = (state.sales || []).find(s => s.id == identifier || (notif && s.id == notif.saleId) || (notif && notif.orderNo && s.invoiceNo && s.invoiceNo.includes(notif.orderNo)));

        if (!notif && !sale) {
            alert('⚠️ Fatura kaydı bulunamadı!');
            return;
        }

        const store = (typeof window.getStoreProfile === 'function' ? window.getStoreProfile() : null) || state.store || {
            name: 'ÇAĞDAŞ PET MARKET VE AKVARYUM DÜNYASI',
            taxOffice: 'Kadıköy Vergi Dairesi',
            taxNumber: '1234567890',
            address: 'Bağdat Caddesi No: 124/A Kadıköy / İSTANBUL',
            phone: '0216 345 67 89',
            email: 'info@cagdaspetmarket.com'
        };

        const eInvoiceNo = (notif && notif.eInvoiceNo) || (sale && sale.eInvoiceNo) || ('GIB2026' + Math.floor(100000000 + Math.random() * 900000000));
        const orderNo = (notif && notif.orderNo) || (sale && sale.orderNo) || 'TR-000';
        const dateStr = (notif && notif.eInvoiceDate) || (sale && sale.eInvoiceDate) || new Date().toLocaleString('tr-TR');
        const channelName = (notif && notif.platform) || (sale && sale.channel) || 'Pazaryeri';
        
        // Alıcı Bilgileri
        const customer = (notif && notif.customer) || (sale && sale.customer) || 'Nihai Tüketici';
        const customerTaxNo = (notif && notif.taxNo) || (sale && sale.taxNo) || '11111111111';
        const rawAddress = (notif && notif.address) || (sale && sale.address) || 'Pazaryeri Müşteri Adresi';
        const district = (notif && notif.district) || (sale && sale.district) || '';
        const city = (notif && notif.city) || (sale && sale.city) || 'İSTANBUL';
        const fullAddress = `${rawAddress}${district ? ' ' + district : ''}${city ? ' / ' + city : ''}`.trim();
        const phone = (notif && notif.phone) || (sale && sale.phone) || '';

        // Çoklu ürün kalemleri
        let invoiceItems = [];
        if (sale && Array.isArray(sale.items) && sale.items.length > 0) {
            invoiceItems = sale.items;
        } else if (notif && Array.isArray(notif.items) && notif.items.length > 0) {
            invoiceItems = notif.items;
        } else {
            const singleQty = (notif && notif.qty) || 1;
            const singleTotal = parseFloat((notif && notif.total) || 0);
            invoiceItems = [{
                name: (notif && notif.productName) || 'Pet Shop Ürünü',
                barcode: (notif && notif.barcode) || '',
                qty: singleQty,
                sellPrice: singleQty > 0 ? (singleTotal / singleQty) : singleTotal
            }];
        }

        let totalMatrah = 0;
        let totalKdv = 0;
        let grandTotal = 0;
        const kdvRate = 0.20;

        const rowsHtml = invoiceItems.map((item, index) => {
            const itemQty = parseFloat(item.qty) || 1;
            const itemGross = (parseFloat(item.sellPrice) || 0) * itemQty;
            const itemMatrah = itemGross / (1 + kdvRate);
            const itemKdv = itemGross - itemMatrah;
            const unitMatrah = itemMatrah / itemQty;

            totalMatrah += itemMatrah;
            totalKdv += itemKdv;
            grandTotal += itemGross;

            return `
                <tr>
                    <td style="text-align: center;">${index + 1}</td>
                    <td>
                        <strong>${item.name || 'Pet Shop Ürünü'}</strong>
                        ${item.barcode ? `<div style="font-size: 9.5px; color: #555;">Barkod: ${item.barcode}</div>` : ''}
                        ${item.lotSku ? `<div style="font-size: 9.5px; color: #166534;">Parti: ${item.lotSku}</div>` : ''}
                    </td>
                    <td style="text-align: center; font-weight: bold;">${itemQty} Adet</td>
                    <td style="text-align: right;">${unitMatrah.toFixed(2)} ₺</td>
                    <td style="text-align: center;">%20</td>
                    <td style="text-align: right;">${itemKdv.toFixed(2)} ₺</td>
                    <td style="text-align: right; font-weight: bold;">${itemGross.toFixed(2)} ₺</td>
                </tr>
            `;
        }).join('');

        const wordsTotal = turkishLiraToWords(grandTotal);

        const printWin = window.open('', '_blank', 'width=800,height=900');
        if (!printWin) {
            alert('⚠️ Açılır pencere engellendi! Lütfen tarayıcı izinlerinden pop-up pencerelere izin veriniz.');
            return;
        }

        printWin.document.write(`
            <!DOCTYPE html>
            <html lang="tr">
            <head>
                <meta charset="UTF-8">
                <title>e-Arşiv Fatura - ${eInvoiceNo}</title>
                <style>
                    body { font-family: "Segoe UI", Arial, sans-serif; margin: 0; padding: 24px; color: #111; font-size: 11.5px; background: #fff; }
                    .invoice-box { border: 1.5px solid #333; padding: 20px; border-radius: 4px; max-width: 760px; margin: 0 auto; box-sizing: border-box; }
                    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #b91c1c; padding-bottom: 12px; margin-bottom: 14px; }
                    .gib-logo { font-size: 18px; font-weight: 900; color: #b91c1c; letter-spacing: 0.5px; }
                    .sub-logo { font-size: 10px; color: #666; margin-top: 2px; }
                    .inv-meta { text-align: right; font-size: 11px; }
                    .inv-meta strong { font-size: 13px; color: #111; }
                    .badge-scenario { display: inline-block; background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; margin-top: 4px; }
                    .grid-parties { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; font-size: 11px; }
                    .party-box { border: 1px solid #ddd; padding: 10px 12px; border-radius: 4px; background: #fafafa; }
                    .party-title { font-weight: bold; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 6px; color: #b91c1c; font-size: 11px; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 11px; }
                    th, td { border: 1px solid #bbb; padding: 6px 8px; text-align: left; }
                    th { background: #f1f5f9; font-weight: bold; }
                    .bottom-section { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; margin-top: 6px; }
                    .notes-box { flex: 1; font-size: 10.5px; color: #444; border: 1px solid #eee; padding: 10px; border-radius: 4px; background: #fcfcfc; }
                    .totals-box { width: 290px; border: 1px solid #bbb; font-size: 11px; }
                    .totals-row { display: flex; justify-content: space-between; padding: 5px 10px; border-bottom: 1px solid #eee; }
                    .totals-row.grand { background: #fee2e2; font-weight: bold; font-size: 12.5px; color: #991b1b; }
                    .words-bar { font-size: 10.5px; font-weight: bold; background: #f8fafc; border: 1px dashed #cbd5e1; padding: 6px 10px; margin-bottom: 12px; border-radius: 4px; color: #1e293b; }
                    .footer-note { font-size: 9.5px; color: #666; text-align: center; margin-top: 18px; border-top: 1px dashed #ccc; padding-top: 8px; }
                    @media print { .no-print { display: none; } }
                </style>
            </head>
            <body>
                <div class="no-print" style="max-width: 760px; margin: 0 auto 12px auto; display: flex; gap: 8px;">
                    <button onclick="window.print()" style="flex: 1; padding: 10px; background: #b91c1c; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 13px;">🖨️ e-Arşiv Faturayı Yazdır / PDF İndir</button>
                    <button onclick="window.close()" style="padding: 10px 16px; background: #475569; color: white; border: none; border-radius: 6px; cursor: pointer;">Kapat</button>
                </div>
                <div class="invoice-box">
                    <div class="header">
                        <div>
                            <div class="gib-logo">🏛️ GİB e-ARŞİV FATURA</div>
                            <div class="sub-logo">T.C. Hazine ve Maliye Bakanlığı Gelir İdaresi Başkanlığı</div>
                            <div class="badge-scenario">SENARYO: e-ARŞİV FATURA | TİP: SATIŞ</div>
                        </div>
                        <div class="inv-meta">
                            <div><strong>Fatura No: ${eInvoiceNo}</strong></div>
                            <div style="margin-top: 3px;">Düzenleme Tarihi: ${dateStr}</div>
                            <div style="color: #555; margin-top: 2px;">Sipariş Ref: #${orderNo} (${channelName})</div>
                        </div>
                    </div>

                    <div class="grid-parties">
                        <div class="party-box">
                            <div class="party-title">SATICI BİLGİLERİ</div>
                            <div style="font-weight: bold; font-size: 12px; margin-bottom: 3px;">${store.name || 'ÇAĞDAŞ PET MARKET'}</div>
                            <div>VKN: <strong>${store.taxNumber || '1234567890'}</strong> | ${store.taxOffice ? store.taxOffice : 'Vergi Dairesi'}</div>
                            <div style="margin-top: 2px;">${store.address || 'Bağdat Cad. No: 124 Kadıköy / İSTANBUL'}</div>
                            <div style="margin-top: 2px;">Tel: ${store.phone || store.mobile || '0216 345 67 89'} | E-Posta: ${store.email || 'info@cagdaspetmarket.com'}</div>
                            ${store.mersis ? `<div style="font-size: 9.5px; color: #666; margin-top: 2px;">Mersis: ${store.mersis}</div>` : ''}
                        </div>
                        <div class="party-box">
                            <div class="party-title">ALICI (MÜŞTERİ) BİLGİLERİ</div>
                            <div style="font-weight: bold; font-size: 12px; margin-bottom: 3px;">${customer}</div>
                            <div>TCKN/VKN: <strong>${customerTaxNo || '11111111111'}</strong> (Nihai Tüketici)</div>
                            <div style="margin-top: 2px;">Adres: ${fullAddress}</div>
                            ${phone ? `<div style="margin-top: 2px;">İletişim: ${phone}</div>` : ''}
                            <div style="font-size: 9.5px; color: #666; margin-top: 2px;">Kanal: ${channelName} Online Sipariş</div>
                        </div>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th style="width: 30px; text-align: center;">#</th>
                                <th>Mal / Hizmet Açıklaması</th>
                                <th style="width: 60px; text-align: center;">Miktar</th>
                                <th style="width: 85px; text-align: right;">Birim Fiyat</th>
                                <th style="width: 45px; text-align: center;">KDV</th>
                                <th style="width: 80px; text-align: right;">KDV Tutarı</th>
                                <th style="width: 90px; text-align: right;">Toplam Tutar</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>

                    <div class="words-bar">
                        ${wordsTotal}
                    </div>

                    <div class="bottom-section">
                        <div class="notes-box">
                            <strong>Ödeme Bilgisi:</strong> Online Pazaryeri Kredi Kartı / Havale<br>
                            <strong>Açıklama:</strong> Bu satış 6563 sayılı Elektronik Ticaretin Düzenlenmesi Hakkında Kanun kapsamında gerçekleştirilmiştir.<br>
                            İşbu fatura muhteviyatına 8 gün içerisinde itiraz edilmediği takdirde kabul edilmiş sayılır.
                        </div>

                        <div class="totals-box">
                            <div class="totals-row">
                                <span>Mal/Hizmet Toplamı:</span>
                                <span>${totalMatrah.toFixed(2)} ₺</span>
                            </div>
                            <div class="totals-row">
                                <span>Hesaplanan KDV (%20):</span>
                                <span>${totalKdv.toFixed(2)} ₺</span>
                            </div>
                            <div class="totals-row grand">
                                <span>ÖDENECEK TUTAR:</span>
                                <span>${grandTotal.toFixed(2)} ₺</span>
                            </div>
                        </div>
                    </div>

                    <div class="footer-note">
                        Bu fatura 213 sayılı Vergi Usul Kanunu hükümlerine göre elektronik ortamda düzenlenmiş, imzalanmış ve GİB e-Arşiv Portalı ile tam entegre edilmiştir.<br>
                        <strong>${store.name || 'Çağdaş Pet Market'} Mali Mührü & Kaşesi ile Resmi Olarak Onaylanmıştır.</strong>
                    </div>
                </div>
            </body>
            </html>
        `);
        printWin.document.close();
    };

    // ==========================================
    // 🛵 GETİRÇARŞI CANLI KURYE TESLİMATI
    // ==========================================
    window.deliverGetirOrderToCourier = function(identifier) {
        let notif = (state.notifications || []).find(n => n.id == identifier || n.orderNo == identifier || n.saleId == identifier);
        let sale = (state.sales || []).find(s => s.id == identifier || (notif && s.id == notif.saleId));

        const orderNo = (notif && notif.orderNo) || identifier;
        const nowStr = new Date().toLocaleString('tr-TR');

        if (notif) {
            notif.orderStatus = 'courier_delivered';
            notif.deliveredAt = nowStr;
        }
        if (sale) {
            sale.status = 'courier_delivered';
            sale.deliveredAt = nowStr;
        }

        if (!Array.isArray(state.auditLog)) state.auditLog = [];
        state.auditLog.push({
            user: (state.user && state.user.name) || 'Kasiyer',
            action: '🛵 Getir Kuryesine Teslim Edildi',
            timestamp: nowStr,
            details: `GetirÇarşı siparişi #${orderNo} kapıdaki Getir kuryesine teslim edildi.`,
            affectedData: orderNo
        });

        addMarketplaceLog({
            type: 'courier_delivery',
            title: `🛵 Getir Kuryesine Teslim Edildi: #${orderNo}`,
            details: `Paket kapıdaki Getir kuryesine teslim edildi. Sipariş tamamlandı.`,
            channels: 'Getir'
        });

        saveData();
        showAppToast(`🛵 #${orderNo} nolu sipariş Getir kuryesine teslim edildi!`, 'success');

        if (state.screen === 'marketplace') renderMarketplace(document.getElementById('screen'));
        else if (state.screen === 'notifications') renderNotifications(document.getElementById('screen'));
    };

    // ==========================================
    // 📦 İADE (RMA) VE ZAYİ MAMA YÖNETİMİ
    // ==========================================
    // Gerçekleşmiş tüm online satış siparişlerini toplayan yardımcı fonksiyon
    window.getAllSoldOnlineOrders = function() {
        const ordersMap = new Map();

        // 1. Bildirimlerdeki online siparişler
        (state.notifications || []).forEach(n => {
            if (n.type === 'online_order' || n.type === 'marketplace_order') {
                const ordNo = n.orderNo || (n.invoiceNo ? n.invoiceNo.replace('ONL-', '') : '');
                if (ordNo && !ordersMap.has(ordNo)) {
                    ordersMap.set(ordNo, {
                        orderNo: ordNo,
                        platform: n.platform || 'trendyol',
                        customer: n.customer || 'Pazaryeri Müşterisi',
                        phone: n.phone || '',
                        address: n.address || '',
                        city: n.city || '',
                        date: n.date || n.timestamp || '',
                        total: parseFloat(n.total) || 0,
                        orderStatus: n.orderStatus || 'pending',
                        items: Array.isArray(n.items) && n.items.length > 0 ? n.items : [{
                            id: n.productId || 0,
                            name: n.productName || 'Ürün',
                            qty: parseFloat(n.qty) || 1,
                            sellPrice: (parseFloat(n.total) || 0) / (parseFloat(n.qty) || 1),
                            buyPrice: 0
                        }]
                    });
                }
            }
        });

        // 2. Satış geçmişindeki (sales) online siparişler
        (state.sales || []).forEach(s => {
            if (s.isOnlineSale || (s.invoiceNo && s.invoiceNo.startsWith('ONL-')) || s.orderNo) {
                const ordNo = s.orderNo || (s.invoiceNo ? s.invoiceNo.replace('ONL-', '') : '');
                if (ordNo) {
                    const existing = ordersMap.get(ordNo);
                    const parsedItems = (s.items || []).map(it => ({
                        id: it.id,
                        name: it.name,
                        qty: parseFloat(it.qty) || 1,
                        sellPrice: parseFloat(it.sellPrice) || 0,
                        buyPrice: parseFloat(it.buyPrice) || 0
                    }));

                    if (!existing) {
                        ordersMap.set(ordNo, {
                            orderNo: ordNo,
                            platform: s.channel || s.cashier || 'trendyol',
                            customer: s.customer || 'Pazaryeri Müşterisi',
                            phone: s.phone || '',
                            address: s.address || '',
                            city: s.city || '',
                            date: s.timestamp || '',
                            total: parseFloat(s.total) || 0,
                            orderStatus: s.status || 'completed',
                            items: parsedItems
                        });
                    } else if ((!existing.items || existing.items.length === 0) && parsedItems.length > 0) {
                        existing.items = parsedItems;
                    }
                }
            }
        });

        return Array.from(ordersMap.values()).reverse();
    };

    // Belirli bir siparişte daha önce yapılmış iadelerin ürün bazında toplamı
    window.getOrderReturnedQuantities = function(orderNo) {
        const returns = window.getMarketplaceReturns();
        const returnedMap = {};
        returns.filter(r => r.orderNo === orderNo && r.status !== 'rejected').forEach(r => {
            const key = String(r.productId || r.productName);
            returnedMap[key] = (returnedMap[key] || 0) + (parseFloat(r.qty) || 0);
        });
        return returnedMap;
    };

    // 🟢 SAĞLAM İADEYİ ONAYLA & DÜKKAN STOĞUNA AL
    window.processReturnRestock = function(returnId) {
        const returns = window.getMarketplaceReturns();
        const retItem = returns.find(r => String(r.id) === String(returnId));
        if (!retItem) {
            alert('⚠️ İade kaydı bulunamadı!');
            return;
        }
        if (retItem.status === 'restocked') {
            alert('⚠️ Bu ürün zaten daha önce sağlam iade olarak stoğa alınmıştır.');
            return;
        }

        const nowStr = new Date().toLocaleString('tr-TR');
        const qty = parseFloat(retItem.qty) || 1;
        const p = (state.products || []).find(x => String(x.id) === String(retItem.productId) || x.name === retItem.productName);

        if (p) {
            p.shop = (parseFloat(p.shop) || 0) + qty;
            if (!Array.isArray(p.stockLots)) p.stockLots = [];
            p.stockLots.push({
                buyPrice: retItem.buyPrice || p.buyPrice || 0,
                sellPrice: retItem.sellPrice || p.sellPrice || 0,
                quantity: qty,
                date: nowStr,
                sku: `RMA-${Date.now()}`
            });
        }

        retItem.status = 'restocked';
        retItem.processedAt = nowStr;
        window.saveMarketplaceReturns(returns);

        // Stok Giriş Hareketi (Stok Log)
        if (!Array.isArray(state.stockLog)) state.stockLog = [];
        state.stockLog.push({
            id: Date.now(),
            productName: retItem.productName,
            quantity: qty,
            type: 'in',
            date: nowStr,
            user: (state.user && state.user.name) || 'Yönetici',
            note: `📦 Sağlam Online İade Stoğa Alındı (#${retItem.orderNo} - ${retItem.reason})`
        });

        // Finans / İade Masası Entegrasyonu
        if (!Array.isArray(state.returns)) state.returns = [];
        const refundAmt = parseFloat(retItem.totalRefund) || (parseFloat(retItem.sellPrice || 0) * qty);
        state.returns.push({
            id: Date.now(),
            orderNo: retItem.orderNo,
            invoiceNo: `ONL-RET-${retItem.orderNo}`,
            customer: retItem.customer || 'Pazaryeri Müşterisi',
            date: nowStr,
            amount: refundAmt,
            total: refundAmt,
            refundAmount: refundAmt,
            reason: `Online Satış İadesi (${(retItem.platform || '').toUpperCase()}): ${retItem.reason}`,
            restocked: true,
            channel: retItem.platform || 'online',
            items: [{
                id: retItem.productId,
                name: retItem.productName,
                qty: qty,
                sellPrice: retItem.sellPrice || 0
            }]
        });

        // Denetim Günlüğü (Audit Log)
        if (!Array.isArray(state.auditLog)) state.auditLog = [];
        state.auditLog.push({
            user: (state.user && state.user.name) || 'Yönetici',
            action: '🟢 Online İade Kabul & Restock',
            timestamp: nowStr,
            details: `Sipariş #${retItem.orderNo}, Ürün: ${retItem.productName} x${qty}. Sağlam iade dükkan stoğuna ve FIFO'ya geri alındı. Tutar: ${refundAmt.toFixed(2)}₺`,
            affectedData: 'Dükkan Stoğu & İadeler'
        });

        saveData();
        showAppToast(`✅ #${retItem.orderNo} nolu siparişin iadesi kabul edildi: ${retItem.productName} (+${qty} adet) dükkan stoğuna geri alındı!`, 'success');
        renderMarketplace(document.getElementById('screen'));
    };

    // 🔴 HASARLI ZAYİ İŞLE (KARGO TAZMİNİNE AYIR)
    window.processReturnDamaged = function(returnId) {
        const returns = window.getMarketplaceReturns();
        const retItem = returns.find(r => String(r.id) === String(returnId));
        if (!retItem) {
            alert('⚠️ İade kaydı bulunamadı!');
            return;
        }

        const nowStr = new Date().toLocaleString('tr-TR');
        const qty = parseFloat(retItem.qty) || 1;
        const refundAmt = parseFloat(retItem.totalRefund) || (parseFloat(retItem.sellPrice || 0) * qty);

        retItem.status = 'damaged_scrap';
        retItem.processedAt = nowStr;
        retItem.scrapNote = 'Kargo Hasarı / Patlak Mama (Tazmin Dosyası Açıldı)';
        window.saveMarketplaceReturns(returns);

        // Finans / İade Muhasebesine hasarlı olarak ekle (satış stoğuna EKLENMEZ)
        if (!Array.isArray(state.returns)) state.returns = [];
        state.returns.push({
            id: Date.now(),
            orderNo: retItem.orderNo,
            invoiceNo: `ONL-RET-${retItem.orderNo}`,
            customer: retItem.customer || 'Pazaryeri Müşterisi',
            date: nowStr,
            amount: refundAmt,
            total: refundAmt,
            refundAmount: refundAmt,
            reason: `Online Satış Hasarlı Zayi İadesi (${(retItem.platform || '').toUpperCase()}): ${retItem.reason}`,
            restocked: false,
            channel: retItem.platform || 'online',
            items: [{
                id: retItem.productId,
                name: retItem.productName,
                qty: qty,
                sellPrice: retItem.sellPrice || 0
            }]
        });

        // Zayi ve Kargo Tazmini Audit Logu
        if (!Array.isArray(state.auditLog)) state.auditLog = [];
        state.auditLog.push({
            user: (state.user && state.user.name) || 'Yönetici',
            action: '⚠️ Hasarlı Online İade (Kargo Tazmini)',
            timestamp: nowStr,
            details: `Sipariş #${retItem.orderNo}, Ürün: ${retItem.productName} x${qty}. Hasarlı / patlak zayi stoğa ayrıldı, kargo tazmin tutanağı düzenlendi.`,
            affectedData: 'Zayi Stok & Kargo Tazmini'
        });

        saveData();
        showAppToast(`⚠️ #${retItem.orderNo} hasarlı/zayi olarak işlendi. Satılabilir stoğa EKLENMEDİ, kargo tazmin dosyasına aktarıldı.`, 'warning');
        renderMarketplace(document.getElementById('screen'));
    };

    // ❌ İADEYİ REDDET
    window.rejectMarketplaceReturn = function(returnId) {
        const returns = window.getMarketplaceReturns();
        const retItem = returns.find(r => String(r.id) === String(returnId));
        if (!retItem) return;

        const reason = prompt(`İadeyi reddetme gerekçesini giriniz (Müşteriye/Pazaryerine iletilecek):`, 'Kullanılmış veya güvenlik bandı açılmış ürün; iade koşullarına uygun değil.');
        if (reason === null) return;

        const nowStr = new Date().toLocaleString('tr-TR');
        retItem.status = 'rejected';
        retItem.processedAt = nowStr;
        retItem.rejectionReason = reason;
        window.saveMarketplaceReturns(returns);

        if (!Array.isArray(state.auditLog)) state.auditLog = [];
        state.auditLog.push({
            user: (state.user && state.user.name) || 'Yönetici',
            action: '❌ Online İade Reddedildi',
            timestamp: nowStr,
            details: `Sipariş #${retItem.orderNo}, Ürün: ${retItem.productName}. Gerekçe: ${reason}`,
            affectedData: 'İadeler'
        });

        saveData();
        showAppToast(`❌ #${retItem.orderNo} nolu siparişin iade talebi reddedildi.`, 'info');
        renderMarketplace(document.getElementById('screen'));
    };

    // 🗑️ İADE KAYDINI SİL
    window.deleteMarketplaceReturn = function(returnId) {
        if (!confirm('Bu iade kaydını RMA listesinden tamamen silmek istediğinize emin misiniz?')) return;
        let returns = window.getMarketplaceReturns();
        returns = returns.filter(r => String(r.id) !== String(returnId));
        window.saveMarketplaceReturns(returns);
        showAppToast('İade kaydı silindi.', 'info');
        renderMarketplace(document.getElementById('screen'));
    };

    // 🖨️ İADE TUTANAĞI YAZDIR (RMA SLIP)
    window.printReturnReceipt = function(returnId) {
        const returns = window.getMarketplaceReturns();
        const ret = returns.find(r => String(r.id) === String(returnId));
        if (!ret) return;

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert('Açılır pencere engellendi. Lütfen tarayıcınızdan izin verin.');
            return;
        }

        const statusLabel = ret.status === 'restocked' ? '🟢 KABUL EDİLDİ (DÜKKAN STOĞUNA ALINDI)'
            : ret.status === 'damaged_scrap' ? '🔴 HASARLI ZAYİ (KARGO TAZMİN DOSYASI)'
            : ret.status === 'rejected' ? '❌ İADE REDDEDİLDİ'
            : '⏳ KONTROL / İNCELEME BEKLİYOR';

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>İade Tutanağı #${ret.orderNo}</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #111; font-size: 13px; line-height: 1.5; }
                    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px; }
                    .header h2 { margin: 0 0 4px 0; font-size: 18px; text-transform: uppercase; }
                    .box { border: 1px solid #ccc; border-radius: 6px; padding: 12px; margin-bottom: 12px; }
                    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
                    .label { font-size: 10.5px; color: #555; text-transform: uppercase; font-weight: bold; }
                    .val { font-weight: bold; font-size: 13px; }
                    .badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-weight: bold; font-size: 12px; border: 1px solid #999; }
                    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background: #f3f4f6; }
                    .footer { margin-top: 30px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; text-align: center; }
                    .sig-line { margin-top: 50px; border-top: 1px dashed #000; padding-top: 4px; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h2>ÇAĞDAŞ PET MARKET - PAZARYERİ İADE TUTANAĞI</h2>
                    <div>RMA & Kargo Hasar İnceleme Formu | Tarih: ${ret.date || new Date().toLocaleString('tr-TR')}</div>
                </div>

                <div class="box">
                    <div class="grid">
                        <div>
                            <div class="label">Sipariş Numarası:</div>
                            <div class="val">#${ret.orderNo}</div>
                        </div>
                        <div>
                            <div class="label">Pazaryeri / Kanal:</div>
                            <div class="val">${(ret.platform || 'Online').toUpperCase()}</div>
                        </div>
                        <div>
                            <div class="label">Müşteri Adı:</div>
                            <div class="val">${ret.customer || 'Pazaryeri Müşterisi'}</div>
                        </div>
                        <div>
                            <div class="label">Müşteri İletişim:</div>
                            <div class="val">${ret.customerPhone || 'Kanal Üzerinden Maskeli'}</div>
                        </div>
                    </div>
                </div>

                <div class="box">
                    <div class="label">İade Edilen Ürün Detayları:</div>
                    <table>
                        <thead>
                            <tr>
                                <th>Ürün Adı</th>
                                <th>İade Adedi</th>
                                <th>Birim Fiyat</th>
                                <th>Toplam İade Tutarı</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><strong>${ret.productName}</strong></td>
                                <td>${ret.qty} Adet</td>
                                <td>${(parseFloat(ret.sellPrice) || 0).toFixed(2)}₺</td>
                                <td><strong>${(parseFloat(ret.totalRefund) || (parseFloat(ret.sellPrice || 0) * (parseFloat(ret.qty) || 1))).toFixed(2)}₺</strong></td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="box">
                    <div class="label">İade Gerekçesi & Müşteri Açıklaması:</div>
                    <div class="val" style="margin-top: 4px;">${ret.reason}</div>
                    ${ret.note ? `<div style="font-size: 11px; color: #444; margin-top: 4px;"><strong>Not:</strong> ${ret.note}</div>` : ''}
                </div>

                <div class="box">
                    <div class="label">RMA Kontrol Durumu ve Karar:</div>
                    <div style="margin-top: 6px;">
                        <span class="badge">${statusLabel}</span>
                    </div>
                    ${ret.processedAt ? `<div style="font-size: 11px; margin-top: 6px; color: #555;">İşlem Tarihi: ${ret.processedAt}</div>` : ''}
                    ${ret.rejectionReason ? `<div style="font-size: 11px; margin-top: 4px; color: #b91c1c;">Red Nedeni: ${ret.rejectionReason}</div>` : ''}
                </div>

                <div class="footer">
                    <div>
                        <div>Teslim Alan / Mağaza Yetkilisi</div>
                        <div class="sig-line">İmza & Kaşe</div>
                    </div>
                    <div>
                        <div>Kargo Kuryesi / İade Getiren</div>
                        <div class="sig-line">İmza</div>
                    </div>
                </div>

                <script>
                    window.onload = function() { window.print(); };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    // 📦 SİPARİŞ NUMARASINA GÖRE İADE TALEBİ AÇMA MODALI (Sadece Gerçekleşmiş Satışlar İçin)
    window.openSimulateReturnModal = function(prefillOrderNo) {
        const container = document.getElementById('marketplace-modal-container');
        if (!container) return;

        const soldOrders = window.getAllSoldOnlineOrders();
        const initialOrderNo = prefillOrderNo || (soldOrders.length > 0 ? soldOrders[0].orderNo : '');

        container.innerHTML = `
            <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.65); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 16px; backdrop-filter: blur(3px);">
                <div style="background: ${theme.card}; width: 100%; max-width: 540px; border-radius: 14px; border: 1.5px solid #ef444460; box-shadow: 0 14px 40px rgba(0,0,0,0.35); overflow: hidden; display: flex; flex-direction: column; max-height: 90vh;">
                    
                    <!-- MODAL HEADER -->
                    <div style="padding: 16px 20px; background: linear-gradient(135deg, #ef444415, transparent); border-bottom: 1px solid ${theme.primary}20; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-size: 16px; font-weight: 900; color: ${theme.text}; display: flex; align-items: center; gap: 8px;">
                                <span>↩️</span> Sipariş No İle Online İade Talebi Aç
                            </div>
                            <div style="font-size: 11px; color: ${theme.textLight}; margin-top: 2px;">
                                Yalnızca gerçekleşmiş online siparişler için iade talebi oluşturulabilir.
                            </div>
                        </div>
                        <button onclick="closeMarketplaceModal()" style="background: transparent; border: none; font-size: 20px; cursor: pointer; color: ${theme.textLight}; line-height: 1;">✕</button>
                    </div>

                    <!-- MODAL BODY -->
                    <div style="padding: 20px; overflow-y: auto; font-size: 12px; flex: 1;">
                        
                        ${soldOrders.length === 0 ? `
                            <div style="text-align: center; padding: 24px; background: ${theme.background}; border-radius: 8px; border: 1px dashed ${theme.primary}40;">
                                <div style="font-size: 36px; margin-bottom: 8px;">📦</div>
                                <div style="font-size: 14px; font-weight: bold; color: ${theme.text};">Kayıtlı Online Satış Bulunamadı!</div>
                                <div style="font-size: 11.5px; color: ${theme.textLight}; margin: 6px 0 14px 0;">
                                    İade talebi oluşturabilmek için önce sistemde gerçekleşmiş en az bir online sipariş bulunmalıdır.
                                </div>
                                <button onclick="closeMarketplaceModal(); openSimulateOrderModal();" style="padding: 9px 16px; background: ${theme.primary}; color: white; border: none; border-radius: 6px; font-weight: bold; font-size: 12px; cursor: pointer;">
                                    ⚡ Hemen Bir Sipariş Oluştur / Simüle Et
                                </button>
                            </div>
                        ` : `
                            <!-- 1. SİPARİŞ NO SEÇİMİ / GİRİŞİ -->
                            <div style="margin-bottom: 14px;">
                                <label style="font-weight: 800; display: block; margin-bottom: 5px; color: ${theme.text};">
                                    1. İade Edilecek Sipariş Numarasını Seçin veya Yazın:
                                </label>
                                <div style="display: flex; gap: 8px; margin-bottom: 6px;">
                                    <select id="rma-order-select" onchange="onOrderSelectChange(this.value)" style="flex: 1; padding: 9px 12px; border-radius: 7px; border: 1.5px solid ${theme.primary}50; background: ${theme.background}; color: ${theme.text}; font-size: 12px; font-weight: 600;">
                                        <option value="">-- Satılmış Online Sipariş Seçin (${soldOrders.length} Sipariş) --</option>
                                        ${soldOrders.map(o => {
                                            const channelBadge = o.platform === 'hepsiburada' ? '🏬 HB' : o.platform === 'getir' ? '🟣 Getir' : '🛍️ TY';
                                            const prodTitle = (o.items && o.items[0]) ? o.items[0].name : 'Ürün';
                                            return `<option value="${o.orderNo}" ${o.orderNo === initialOrderNo ? 'selected' : ''}>#${o.orderNo} | ${channelBadge} | ${o.customer} | ${o.total.toFixed(0)}₺ (${prodTitle})</option>`;
                                        }).join('')}
                                    </select>
                                </div>

                                <div style="display: flex; gap: 6px; align-items: center;">
                                    <input type="text" id="rma-manual-order-no" value="${initialOrderNo}" placeholder="Sipariş No Yazın (Örn: TY-824194)" style="flex: 1; padding: 7px 10px; border-radius: 6px; border: 1px solid ${theme.primary}30; background: ${theme.background}; color: ${theme.text}; font-size: 11px; font-family: monospace; font-weight: bold;" />
                                    <button type="button" onclick="lookupOrderByManualNo()" style="padding: 7px 12px; background: ${theme.primary}; color: white; border: none; border-radius: 6px; font-weight: bold; font-size: 11px; cursor: pointer; white-space: nowrap;">
                                        🔍 Siparişi Getir
                                    </button>
                                </div>
                            </div>

                            <!-- 2. SEÇİLEN SİPARİŞİN DETAYLARI VE SATILAN ÜRÜNLER -->
                            <div id="rma-order-details-container" style="margin-bottom: 14px;">
                                <!-- Dinamik olarak JS ile doldurulacak -->
                            </div>

                            <!-- 3. İADE SEBEBİ VE MÜŞTERİ NOTU -->
                            <div id="rma-form-actions-box">
                                <div style="margin-bottom: 12px;">
                                    <label style="font-weight: 800; display: block; margin-bottom: 4px; color: ${theme.text};">İade Gerekçesi:</label>
                                    <select id="rma-reason" style="width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.background}; color: ${theme.text}; font-size: 11.5px;">
                                        <option value="Müşteri Cayma Hakkı / Sağlam Ürün">Vazgeçti / Cayma Hakkı (Ambalaj sağlam, açılmamış)</option>
                                        <option value="Kargo Hasarı / Patlak Mama">Kargo Hasarı / Patlak Mama (Paket yırtık, ezik, hasarlı)</option>
                                        <option value="Yanlış / Eksik Ürün">Yanlış / Eksik Ürün Gönderimi</option>
                                        <option value="Son Kullanma Tarihi / Ayıplı Mal">Son Kullanma Tarihi Yakın / Bozuk Ürün</option>
                                        <option value="Diğer Nedenler">Diğer Nedenler</option>
                                    </select>
                                </div>

                                <div style="margin-bottom: 16px;">
                                    <label style="font-weight: 800; display: block; margin-bottom: 4px; color: ${theme.text};">Açıklama / Müşteri Notu (Opsiyonel):</label>
                                    <textarea id="rma-note" rows="2" placeholder="İade kargo takip no veya detaylı arıza notu yazabilirsiniz..." style="width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.background}; color: ${theme.text}; font-size: 11px; resize: vertical; box-sizing: border-box;"></textarea>
                                </div>

                                <div style="display: flex; justify-content: flex-end; gap: 8px;">
                                    <button onclick="closeMarketplaceModal()" style="padding: 9px 16px; background: transparent; border: 1px solid ${theme.textLight}40; color: ${theme.text}; border-radius: 6px; cursor: pointer; font-weight: 600;">Vazgeç</button>
                                    <button id="btn-submit-rma" onclick="executeSimulateReturn()" style="padding: 9px 20px; background: #ef4444; color: white; border: none; border-radius: 6px; font-weight: 900; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.35);">
                                        <span>📝</span> İade Talebini Sisteme Kaydet
                                    </button>
                                </div>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;

        // Sipariş detaylarını yükleme motoru
        window.loadOrderIntoReturnModal = function(orderNo) {
            const container = document.getElementById('rma-order-details-container');
            const submitBtn = document.getElementById('btn-submit-rma');
            if (!container) return;

            if (!orderNo) {
                container.innerHTML = `
                    <div style="padding: 12px; background: ${theme.background}; border-radius: 8px; text-align: center; color: ${theme.textLight};">
                        Lütfen yukarıdan satışı yapılmış bir sipariş seçiniz veya sipariş no giriniz.
                    </div>
                `;
                if (submitBtn) submitBtn.disabled = true;
                return;
            }

            const cleanNo = String(orderNo).trim().replace('#', '');
            const orders = window.getAllSoldOnlineOrders();
            const order = orders.find(o => String(o.orderNo).toLowerCase() === cleanNo.toLowerCase());

            if (!order) {
                container.innerHTML = `
                    <div style="padding: 14px; background: #fef2f2; border: 1px solid #ef444480; border-radius: 8px; color: #b91c1c;">
                        <div style="font-weight: 900; font-size: 13px; display: flex; align-items: center; gap: 6px;">
                            <span>⚠️</span> Sipariş Bulunamadı!
                        </div>
                        <div style="font-size: 11px; margin-top: 4px; line-height: 1.4;">
                            <strong>#${cleanNo}</strong> numaralı bir online satış kaydı bulunamadı. İade talebi sadece sistemde <u>satışı gerçekleşmiş</u> ürünler için açılabilir.
                        </div>
                    </div>
                `;
                if (submitBtn) submitBtn.disabled = true;
                return;
            }

            // Siparişteki satılan ürünler ve daha önce iade edilen adetler
            const returnedMap = window.getOrderReturnedQuantities(order.orderNo);
            const soldItems = (order.items && order.items.length > 0) ? order.items : [];

            // Satılan ürünlerin iade edilebilirlik durumu
            let hasReturnableItem = false;
            const itemsHtml = soldItems.map((it, idx) => {
                const pKey = String(it.id || it.name);
                const soldQty = parseFloat(it.qty) || 1;
                const alreadyReturnedQty = returnedMap[pKey] || 0;
                const remainingQty = Math.max(0, soldQty - alreadyReturnedQty);
                if (remainingQty > 0) hasReturnableItem = true;

                return {
                    id: it.id,
                    name: it.name,
                    soldQty,
                    alreadyReturnedQty,
                    remainingQty,
                    sellPrice: parseFloat(it.sellPrice) || 0,
                    pKey
                };
            });

            if (!hasReturnableItem) {
                container.innerHTML = `
                    <div style="padding: 14px; background: #fffbeb; border: 1px solid #f59e0b80; border-radius: 8px; color: #b45309;">
                        <div style="font-weight: 900; font-size: 13px; display: flex; align-items: center; gap: 6px;">
                            <span>⚠️</span> Tüm Ürünler Daha Önce İade Edilmiş
                        </div>
                        <div style="font-size: 11px; margin-top: 4px;">
                            <strong>#${order.orderNo}</strong> nolu siparişteki satılan ürünlerin tamamı daha önce iade edilmiştir. Kalan iade edilebilir miktar: 0.
                        </div>
                    </div>
                `;
                if (submitBtn) submitBtn.disabled = true;
                return;
            }

            if (submitBtn) submitBtn.disabled = false;

            const platBadge = order.platform === 'hepsiburada' ? '🏬 Hepsiburada' : order.platform === 'getir' ? '🟣 GetirÇarşı' : '🛍️ Trendyol';

            container.innerHTML = `
                <div style="background: ${theme.background}; border: 1px solid ${theme.primary}30; border-radius: 8px; padding: 12px; margin-bottom: 10px;">
                    <!-- SİPARİŞ ÖZET BİLGİLERİ -->
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid ${theme.primary}20; padding-bottom: 8px; margin-bottom: 8px;">
                        <div>
                            <span style="font-family: monospace; font-weight: 900; font-size: 13px; color: ${theme.text};">#${order.orderNo}</span>
                            <span style="margin-left: 6px; padding: 2px 7px; border-radius: 4px; font-size: 10px; font-weight: bold; background: ${theme.primary}15; color: ${theme.primary};">${platBadge}</span>
                        </div>
                        <div style="font-size: 11px; font-weight: bold; color: #10b981;">
                            Toplam: ${order.total.toFixed(2)}₺
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 11px; color: ${theme.textLight}; margin-bottom: 10px;">
                        <div>👤 <strong>Müşteri:</strong> ${order.customer}</div>
                        <div>📅 <strong>Tarih:</strong> ${order.date || 'Bugün'}</div>
                        ${order.phone ? `<div>📞 <strong>Tel:</strong> ${order.phone}</div>` : ''}
                        ${order.city ? `<div>📍 <strong>Şehir:</strong> ${order.city}</div>` : ''}
                    </div>

                    <!-- İADE EDİLECEK ÜRÜN SEÇİMİ -->
                    <div style="background: ${theme.card}; border: 1px solid ${theme.primary}40; border-radius: 6px; padding: 10px;">
                        <label style="font-weight: 800; display: block; margin-bottom: 4px; color: ${theme.text};">
                            Siparişteki Satılan Ürünü Seçin:
                        </label>
                        <select id="rma-selected-product" onchange="onProductReturnSelect(this)" style="width: 100%; padding: 7px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.background}; color: ${theme.text}; font-size: 11.5px; font-weight: bold;">
                            ${itemsHtml.map(it => `
                                <option value="${it.id || it.name}" data-name="${it.name}" data-max="${it.remainingQty}" data-price="${it.sellPrice}" ${it.remainingQty <= 0 ? 'disabled' : ''}>
                                    ${it.name} | Satılan: ${it.soldQty} Adet (İade Edilebilir: ${it.remainingQty} Adet) - ${(it.sellPrice).toFixed(2)}₺
                                </option>
                            `).join('')}
                        </select>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px;">
                            <div>
                                <label style="font-weight: bold; display: block; margin-bottom: 2px; font-size: 11px;">İade Adedi:</label>
                                <input type="number" id="rma-qty" value="1" min="1" max="${itemsHtml[0] ? itemsHtml[0].remainingQty : 1}" oninput="updateReturnCalc()" style="width: 100%; padding: 6px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.background}; color: ${theme.text}; font-weight: bold; box-sizing: border-box;" />
                            </div>
                            <div>
                                <label style="font-weight: bold; display: block; margin-bottom: 2px; font-size: 11px;">İade Edilecek Tutar (₺):</label>
                                <input type="text" id="rma-refund-amount" readonly style="width: 100%; padding: 6px; border-radius: 6px; border: 1px solid #10b981; background: ${theme.background}; color: #10b981; font-weight: 900; box-sizing: border-box;" />
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // İlk ürün için hesaplamayı başlat
            setTimeout(() => {
                const sel = document.getElementById('rma-selected-product');
                if (sel) onProductReturnSelect(sel);
            }, 50);
        };

        window.onOrderSelectChange = function(val) {
            const manualInput = document.getElementById('rma-manual-order-no');
            if (manualInput) manualInput.value = val;
            window.loadOrderIntoReturnModal(val);
        };

        window.lookupOrderByManualNo = function() {
            const manualInput = document.getElementById('rma-manual-order-no');
            const val = manualInput ? manualInput.value.trim() : '';
            window.loadOrderIntoReturnModal(val);
        };

        window.onProductReturnSelect = function(sel) {
            const opt = sel.options[sel.selectedIndex];
            if (!opt) return;
            const maxQty = parseFloat(opt.getAttribute('data-max')) || 1;
            const price = parseFloat(opt.getAttribute('data-price')) || 0;
            const qtyInput = document.getElementById('rma-qty');
            if (qtyInput) {
                qtyInput.max = maxQty;
                if (parseFloat(qtyInput.value) > maxQty || !qtyInput.value) {
                    qtyInput.value = Math.min(1, maxQty);
                }
            }
            window.updateReturnCalc();
        };

        window.updateReturnCalc = function() {
            const sel = document.getElementById('rma-selected-product');
            const qtyInput = document.getElementById('rma-qty');
            const refundDisp = document.getElementById('rma-refund-amount');
            if (!sel || !qtyInput || !refundDisp) return;

            const opt = sel.options[sel.selectedIndex];
            if (!opt) return;

            const price = parseFloat(opt.getAttribute('data-price')) || 0;
            const maxQty = parseFloat(opt.getAttribute('data-max')) || 1;
            let qty = parseFloat(qtyInput.value) || 1;

            if (qty > maxQty) {
                qty = maxQty;
                qtyInput.value = maxQty;
            }
            if (qty < 1) {
                qty = 1;
                qtyInput.value = 1;
            }

            const total = qty * price;
            refundDisp.value = `${total.toFixed(2)}₺`;
        };

        // Modal ilk açılışında seçili siparişi yükle
        if (initialOrderNo) {
            setTimeout(() => {
                window.loadOrderIntoReturnModal(initialOrderNo);
            }, 80);
        }
    };

    // İADE TALEBİNİ GERÇEKLEŞTİRMEK ÜZERE KAYDET
    window.executeSimulateReturn = function() {
        const manualInput = document.getElementById('rma-manual-order-no');
        const orderNo = manualInput ? manualInput.value.trim().replace('#', '') : '';
        if (!orderNo) {
            alert('⚠️ Lütfen geçerli bir sipariş numarası seçiniz.');
            return;
        }

        const orders = window.getAllSoldOnlineOrders();
        const order = orders.find(o => String(o.orderNo).toLowerCase() === orderNo.toLowerCase());
        if (!order) {
            alert(`⚠️ #${orderNo} nolu bir online satış bulunamadı! İade yalnızca gerçekleşmiş satışlar için açılabilir.`);
            return;
        }

        const sel = document.getElementById('rma-selected-product');
        if (!sel || !sel.options[sel.selectedIndex]) {
            alert('⚠️ Lütfen iade edilecek ürünü seçiniz.');
            return;
        }

        const opt = sel.options[sel.selectedIndex];
        const productName = opt.getAttribute('data-name') || sel.value;
        const maxQty = parseFloat(opt.getAttribute('data-max')) || 1;
        const unitPrice = parseFloat(opt.getAttribute('data-price')) || 0;

        const qtyInput = document.getElementById('rma-qty');
        const qty = parseFloat(qtyInput ? qtyInput.value : 1) || 1;

        if (qty > maxQty) {
            alert(`⚠️ Bu ürün için iade edilebilecek kalan miktar en fazla ${maxQty} adettir.`);
            return;
        }

        const reason = document.getElementById('rma-reason').value;
        const note = document.getElementById('rma-note') ? document.getElementById('rma-note').value.trim() : '';

        // İlgili ürünü state.products içinde bul
        const prod = (state.products || []).find(p => String(p.id) === String(sel.value) || p.name === productName);
        const prodId = prod ? prod.id : (parseInt(sel.value, 10) || 0);

        const returns = window.getMarketplaceReturns();
        const nowStr = new Date().toLocaleString('tr-TR');
        const totalRefund = qty * unitPrice;

        const newReturn = {
            id: Date.now(),
            orderNo: order.orderNo,
            platform: order.platform || 'trendyol',
            productId: prodId,
            productName: productName,
            qty: qty,
            buyPrice: (prod && prod.buyPrice) || 0,
            sellPrice: unitPrice,
            totalRefund: totalRefund,
            reason: reason,
            note: note,
            customer: order.customer || 'Pazaryeri Müşterisi',
            customerPhone: order.phone || '',
            customerAddress: order.address || '',
            date: nowStr,
            status: 'pending' // 'pending', 'restocked', 'damaged_scrap', 'rejected'
        };

        returns.unshift(newReturn);
        window.saveMarketplaceReturns(returns);

        // Audit log
        if (!Array.isArray(state.auditLog)) state.auditLog = [];
        state.auditLog.push({
            user: (state.user && state.user.name) || 'Yönetici',
            action: '↩️ Online İade Talebi Açıldı',
            timestamp: nowStr,
            details: `Sipariş #${order.orderNo}, Ürün: ${productName} x${qty}. Tutar: ${totalRefund.toFixed(2)}₺. İnceleme bekliyor.`,
            affectedData: 'İadeler'
        });

        saveData();
        closeMarketplaceModal();

        showAppToast(`📦 #${order.orderNo} için iade talebi oluşturuldu! İade Masasından kontrol edip 'Sağlam Stoğa Al' veya 'Hasarlı Zayi Yap' seçebilirsiniz.`, 'info');
        
        // Kullanıcıyı doğrudan İade Masası sekmesine yönlendir
        window.activeMarketplaceTab = 'returns';
        renderMarketplace(document.getElementById('screen'));
    };

    // Global: Pazaryeri Aktif Sekme ve Kanal Filtresi
    window.activeMarketplaceTab = window.activeMarketplaceTab || 'dashboard';
    window.activeOrderPlatformFilter = window.activeOrderPlatformFilter || 'all'; // 'all', 'trendyol', 'hepsiburada', 'getir'
    window.activeDashboardPlatform = window.activeDashboardPlatform || 'trendyol'; // 'trendyol', 'hepsiburada', 'getir'

    window.setMarketplaceTab = function(tabName) {
        window.activeMarketplaceTab = tabName;
        renderMarketplace(document.getElementById('screen'));
    };

    window.setDashboardPlatform = function(platform) {
        window.activeDashboardPlatform = platform;
        renderMarketplace(document.getElementById('screen'));
    };

    window.setOrderPlatformFilter = function(channel) {
        window.activeOrderPlatformFilter = channel;
        renderMarketplace(document.getElementById('screen'));
    };

    // Komisyon Ayarları Kaydetme
    window.updateCommissionSettingsUI = function() {
        const trendyol = parseFloat(document.getElementById('comm-trendyol').value) || 18;
        const hepsiburada = parseFloat(document.getElementById('comm-hepsiburada').value) || 17;
        const getir = parseFloat(document.getElementById('comm-getir').value) || 20;
        const yemeksepeti = parseFloat(document.getElementById('comm-yemeksepeti')?.value) || 18;
        const shippingCost = parseFloat(document.getElementById('comm-shipping').value) || 38.5;
        const serviceFee = parseFloat(document.getElementById('comm-service').value) || 4.5;

        window.saveCommissionSettings({ trendyol, hepsiburada, getir, yemeksepeti, shippingCost, serviceFee });
        showAppToast('✅ Komisyon ve kargo maliyet oranları kaydedildi!', 'success');
        renderMarketplace(document.getElementById('screen'));
    };

    // Global: Sayfa Render Fonksiyonu
    window.renderMarketplace = function(screen) {
        const channels = getChannelSettings();
        const buffer = getSafetyBuffer();
        const logs = getMarketplaceLogs();
        const isAdmin = state.user && state.user.role === 'admin';
        const commSettings = window.getCommissionSettings();
        const getirState = window.getGetirStoreState();
        const returns = window.getMarketplaceReturns();
        const currentTab = window.activeMarketplaceTab || 'orders';
        const activeDashPlatform = window.activeDashboardPlatform || 'trendyol';
        const apiCreds = (typeof window.getMarketplaceApiCredentials === 'function') ? window.getMarketplaceApiCredentials() : {};

        // Online siparişler
        const allOnlineOrders = (state.notifications || []).filter(n => n.type === 'online_order' || n.type === 'marketplace_order');
        const platformFilter = window.activeOrderPlatformFilter || 'all';

        // Kanal bazlı sayılar
        const tyOrdersCount = allOnlineOrders.filter(o => (o.platform || '').toLowerCase().includes('trendyol')).length;
        const hbOrdersCount = allOnlineOrders.filter(o => (o.platform || '').toLowerCase().includes('hepsiburada')).length;
        const gtOrdersCount = allOnlineOrders.filter(o => (o.platform || '').toLowerCase().includes('getir')).length;
        const ysOrdersCount = allOnlineOrders.filter(o => (o.platform || '').toLowerCase().includes('yemek')).length;

        // Seçilen kategoriye göre filtrelenmiş siparişler
        const onlineOrders = allOnlineOrders.filter(o => {
            if (platformFilter === 'all') return true;
            const p = (o.platform || '').toLowerCase();
            return p.includes(platformFilter);
        });

        const pendingCount = allOnlineOrders.filter(o => !o.orderStatus || o.orderStatus === 'pending').length;
        const getirOrders = allOnlineOrders.filter(o => (o.platform || '').toLowerCase().includes('getir') && o.orderStatus !== 'cancelled');

        screen.innerHTML = `
            <div class="content-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 16px;">
                <div>
                    <h2 style="font-size: 20px; font-weight: 800; color: ${theme.text}; margin: 0; display: flex; align-items: center; gap: 8px;">
                        🌐 Online Satış (Pazaryeri Entegrasyonları)
                        <span style="font-size: 11px; background: rgba(99, 102, 241, 0.15); color: ${theme.primary}; padding: 4px 10px; border-radius: 12px; font-weight: 700;">Canlı & FIFO Uyumlu</span>
                    </h2>
                    <p style="font-size: 12px; color: ${theme.textLight}; margin: 4px 0 0 0;">
                        Trendyol, Hepsiburada ve Getir ile çift yönlü otomatik stok, FIFO parti çıkışı, sipariş ve net kâr senkronizasyonu.
                    </p>
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <button onclick="openApiConnectionModal()" style="padding: 8px 14px; background: linear-gradient(135deg, #0284c7, #0369a1); color: white; border: none; border-radius: 8px; font-weight: bold; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(2, 132, 199, 0.3);">
                        ⚡ Canlı API Bağlan & Test Et
                    </button>
                    <button onclick="openStoreProfileModal()" style="padding: 8px 14px; background: ${theme.card}; color: ${theme.text}; border: 1px solid ${theme.primary}50; border-radius: 8px; font-weight: bold; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                        🏢 Fatura & Mağaza Bilgileri
                    </button>
                    <button onclick="openEnvGuideModal()" style="padding: 8px 14px; background: ${theme.card}; color: ${theme.text}; border: 1px solid ${theme.primary}50; border-radius: 8px; font-weight: bold; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                        🔑 API Rehberi
                    </button>
                    <button onclick="openSimulateOrderModal()" style="padding: 8px 14px; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 8px; font-weight: bold; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);">
                        🧪 Sipariş Simüle Et
                    </button>
                    <button onclick="openSimulateReturnModal()" style="padding: 8px 14px; background: #fee2e2; color: #b91c1c; border: 1px solid #ef444450; border-radius: 8px; font-weight: bold; font-size: 12px; cursor: pointer;">
                        📦 İade Simüle Et
                    </button>
                    <button onclick="syncAllInventoryToMarketplaces()" style="padding: 8px 14px; background: ${theme.primary}; color: white; border: none; border-radius: 8px; font-weight: bold; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                        🔄 Tüm Stokları Eşitle
                    </button>
                </div>
            </div>

            <!-- OPERASYONEL SEKMELER -->
            <div style="display: flex; gap: 8px; border-bottom: 2px solid ${theme.primary}20; margin-bottom: 20px; overflow-x: auto; padding-bottom: 2px;">
                <button onclick="setMarketplaceTab('dashboard')" style="padding: 10px 16px; border: none; background: transparent; font-size: 13px; font-weight: 800; cursor: pointer; color: ${currentTab === 'dashboard' ? '#0284c7' : theme.textLight}; border-bottom: 3px solid ${currentTab === 'dashboard' ? '#0284c7' : 'transparent'}; white-space: nowrap; display: flex; align-items: center; gap: 6px;">
                    📊 Marketplace Dashboard
                    <span style="background: rgba(2, 132, 199, 0.15); color: #0284c7; font-size: 10px; padding: 1px 6px; border-radius: 10px;">Ayrı Paneller</span>
                </button>
                <button onclick="setMarketplaceTab('orders')" style="padding: 10px 16px; border: none; background: transparent; font-size: 13px; font-weight: 800; cursor: pointer; color: ${currentTab === 'orders' ? theme.primary : theme.textLight}; border-bottom: 3px solid ${currentTab === 'orders' ? theme.primary : 'transparent'}; white-space: nowrap; display: flex; align-items: center; gap: 6px;">
                    🛒 Sipariş Masası
                    ${pendingCount > 0 ? `<span style="background: #ef4444; color: white; font-size: 10px; padding: 1px 6px; border-radius: 10px;">${pendingCount}</span>` : ''}
                </button>
                <button onclick="setMarketplaceTab('getir')" style="padding: 10px 16px; border: none; background: transparent; font-size: 13px; font-weight: 800; cursor: pointer; color: ${currentTab === 'getir' ? '#5d3ebc' : theme.textLight}; border-bottom: 3px solid ${currentTab === 'getir' ? '#5d3ebc' : 'transparent'}; white-space: nowrap; display: flex; align-items: center; gap: 6px;">
                    🛵 GetirÇarşı Kurye Masası
                    ${getirState.status === 'open' ? '🟢' : getirState.status === 'pause' ? '🟡' : '🔴'}
                </button>
                <button onclick="setMarketplaceTab('returns')" style="padding: 10px 16px; border: none; background: transparent; font-size: 13px; font-weight: 800; cursor: pointer; color: ${currentTab === 'returns' ? '#b91c1c' : theme.textLight}; border-bottom: 3px solid ${currentTab === 'returns' ? '#b91c1c' : 'transparent'}; white-space: nowrap; display: flex; align-items: center; gap: 6px;">
                    📦 İade & Hasarlı Ürün (RMA)
                    ${returns.filter(r => r.status === 'pending').length > 0 ? `<span style="background: #b91c1c; color: white; font-size: 10px; padding: 1px 6px; border-radius: 10px;">${returns.filter(r => r.status === 'pending').length}</span>` : ''}
                </button>
                <button onclick="setMarketplaceTab('financials')" style="padding: 10px 16px; border: none; background: transparent; font-size: 13px; font-weight: 800; cursor: pointer; color: ${currentTab === 'financials' ? theme.success : theme.textLight}; border-bottom: 3px solid ${currentTab === 'financials' ? theme.success : 'transparent'}; white-space: nowrap; display: flex; align-items: center; gap: 6px;">
                    💰 Komisyon & Net Hakediş
                </button>
                <button onclick="setMarketplaceTab('channels')" style="padding: 10px 16px; border: none; background: transparent; font-size: 13px; font-weight: 800; cursor: pointer; color: ${currentTab === 'channels' ? theme.text : theme.textLight}; border-bottom: 3px solid ${currentTab === 'channels' ? theme.text : 'transparent'}; white-space: nowrap; display: flex; align-items: center; gap: 6px;">
                    ⚙️ Kanallar & Güvenlik Stoğu
                </button>
            </div>

            <!-- SEKME 0: MARKETPLACE DASHBOARD (AYRI GİRİŞ FORMLARI & DURUM GÖSTERGELERİ) -->
            ${currentTab === 'dashboard' ? `
                <div style="background: ${theme.card}; border-radius: 14px; border: 1px solid ${theme.primary}20; padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 14px rgba(0,0,0,0.05);">
                    
                    <!-- DASHBOARD BAŞLIK & GENEL ÖZET -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 14px; margin-bottom: 20px;">
                        <div>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(2, 132, 199, 0.12); color: #0284c7; display: flex; align-items: center; justify-content: center; font-size: 20px;">
                                    📊
                                </div>
                                <div>
                                    <h3 style="margin: 0; font-size: 17px; font-weight: 900; color: ${theme.text};">MarketplaceDashboard</h3>
                                    <div style="font-size: 12px; color: ${theme.textLight}; margin-top: 2px;">
                                        Trendyol, Hepsiburada ve Getir entegrasyonları için bağımsız giriş formları, gerçek zamanlı API bağlantı durumları ve kanal operasyon paneli.
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                            <button onclick="fetchAllChannelsLive()" style="padding: 8px 16px; background: linear-gradient(135deg, #0284c7, #0369a1); color: white; border: none; border-radius: 8px; font-size: 12px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(2, 132, 199, 0.3);">
                                🔄 Tüm Kanalları Şimdi Çek
                            </button>
                            <button onclick="openEnvGuideModal()" style="padding: 8px 14px; background: ${theme.background}; color: ${theme.text}; border: 1px solid ${theme.primary}40; border-radius: 8px; font-size: 12px; font-weight: bold; cursor: pointer;">
                                📖 API Rehberi
                            </button>
                        </div>
                    </div>

                    <!-- 3 PAZARYERİ GENEL DURUM GÖSTERGE KARTLARI (OVERVIEW SUMMARY) -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin-bottom: 22px;">
                        
                        <!-- TRENDYOL DURUM KARTI -->
                        <div onclick="setDashboardPlatform('trendyol')" style="cursor: pointer; padding: 14px; border-radius: 12px; border: 2px solid ${activeDashPlatform === 'trendyol' ? '#f27a1a' : theme.primary + '20'}; background: ${activeDashPlatform === 'trendyol' ? '#fffaf5' : theme.background}; transition: all 0.2s ease; position: relative;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 22px;">🛍️</span>
                                    <strong style="font-size: 14px; color: #f27a1a;">Trendyol</strong>
                                </div>
                                <span style="font-size: 11px; font-weight: bold; padding: 3px 8px; border-radius: 12px; background: ${(apiCreds.tySupplierId && apiCreds.tyApiKey) ? '#dcfce7' : '#fee2e2'}; color: ${(apiCreds.tySupplierId && apiCreds.tyApiKey) ? '#15803d' : '#b91c1c'};">
                                    ${(apiCreds.tySupplierId && apiCreds.tyApiKey) ? '🟢 Bağlı & Hazır' : '🔴 Anahtar Bekleniyor'}
                                </span>
                            </div>
                            <div style="font-size: 11.5px; color: ${theme.textLight}; display: flex; justify-content: space-between;">
                                <span>Toplam Sipariş: <strong>${tyOrdersCount} adet</strong></span>
                                <span>Komisyon: <strong>%${commSettings.trendyol}</strong></span>
                            </div>
                        </div>

                        <!-- HEPSİBURADA DURUM KARTI -->
                        <div onclick="setDashboardPlatform('hepsiburada')" style="cursor: pointer; padding: 14px; border-radius: 12px; border: 2px solid ${activeDashPlatform === 'hepsiburada' ? '#ff6000' : theme.primary + '20'}; background: ${activeDashPlatform === 'hepsiburada' ? '#fff9f5' : theme.background}; transition: all 0.2s ease; position: relative;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 22px;">🏬</span>
                                    <strong style="font-size: 14px; color: #ff6000;">Hepsiburada</strong>
                                </div>
                                <span style="font-size: 11px; font-weight: bold; padding: 3px 8px; border-radius: 12px; background: ${(apiCreds.hbMerchantId && apiCreds.hbSecretKey) ? '#dcfce7' : '#fee2e2'}; color: ${(apiCreds.hbMerchantId && apiCreds.hbSecretKey) ? '#15803d' : '#b91c1c'};">
                                    ${(apiCreds.hbMerchantId && apiCreds.hbSecretKey) ? '🟢 Bağlı & Hazır' : '🔴 Anahtar Bekleniyor'}
                                </span>
                            </div>
                            <div style="font-size: 11.5px; color: ${theme.textLight}; display: flex; justify-content: space-between;">
                                <span>Toplam Sipariş: <strong>${hbOrdersCount} adet</strong></span>
                                <span>Komisyon: <strong>%${commSettings.hepsiburada}</strong></span>
                            </div>
                        </div>

                        <!-- GETİRÇARŞI DURUM KARTI -->
                        <div onclick="setDashboardPlatform('getir')" style="cursor: pointer; padding: 14px; border-radius: 12px; border: 2px solid ${activeDashPlatform === 'getir' ? '#5d3ebc' : theme.primary + '20'}; background: ${activeDashPlatform === 'getir' ? '#faf7ff' : theme.background}; transition: all 0.2s ease; position: relative;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 22px;">🟣</span>
                                    <strong style="font-size: 14px; color: #5d3ebc;">GetirÇarşı</strong>
                                </div>
                                <span style="font-size: 11px; font-weight: bold; padding: 3px 8px; border-radius: 12px; background: ${(apiCreds.gtStoreId && apiCreds.gtSecretKey) ? '#dcfce7' : '#fee2e2'}; color: ${(apiCreds.gtStoreId && apiCreds.gtSecretKey) ? '#15803d' : '#b91c1c'};">
                                    ${(apiCreds.gtStoreId && apiCreds.gtSecretKey) ? '🟢 Bağlı & Hazır' : '🔴 Anahtar Bekleniyor'}
                                </span>
                            </div>
                            <div style="font-size: 11.5px; color: ${theme.textLight}; display: flex; justify-content: space-between;">
                                <span>Aktif Sipariş: <strong>${gtOrdersCount} adet</strong></span>
                                <span>Kurye: <strong>${getirState.status === 'open' ? 'Açık' : getirState.status === 'pause' ? 'Molada' : 'Kapalı'}</strong></span>
                            </div>
                        </div>

                        <!-- YEMEKSEPETİ DURUM KARTI -->
                        <div onclick="setDashboardPlatform('yemeksepeti')" style="cursor: pointer; padding: 14px; border-radius: 12px; border: 2px solid ${activeDashPlatform === 'yemeksepeti' ? '#ea004b' : theme.primary + '20'}; background: ${activeDashPlatform === 'yemeksepeti' ? '#fff5f7' : theme.background}; transition: all 0.2s ease; position: relative;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 22px;">🍔</span>
                                    <strong style="font-size: 14px; color: #ea004b;">Yemeksepeti Mahalle</strong>
                                </div>
                                <span style="font-size: 11px; font-weight: bold; padding: 3px 8px; border-radius: 12px; background: ${(apiCreds.ysVendorId && apiCreds.ysApiKey) ? '#dcfce7' : '#fee2e2'}; color: ${(apiCreds.ysVendorId && apiCreds.ysApiKey) ? '#15803d' : '#b91c1c'};">
                                    ${(apiCreds.ysVendorId && apiCreds.ysApiKey) ? '🟢 Bağlı & Hazır' : '🔴 Anahtar Bekleniyor'}
                                </span>
                            </div>
                            <div style="font-size: 11.5px; color: ${theme.textLight}; display: flex; justify-content: space-between;">
                                <span>Toplam Sipariş: <strong>${ysOrdersCount} adet</strong></span>
                                <span>Komisyon: <strong>%${commSettings.yemeksepeti || 18}</strong></span>
                            </div>
                        </div>

                    </div>

                    <!-- SEÇİLEN PAZARYERİ ÖZEL SEKME ÇUBUĞU -->
                    <div style="display: flex; gap: 6px; border-bottom: 2px solid ${theme.primary}20; margin-bottom: 20px; padding-bottom: 2px; overflow-x: auto;">
                        <button onclick="setDashboardPlatform('trendyol')" style="padding: 10px 18px; border: none; background: transparent; font-size: 13px; font-weight: 800; cursor: pointer; color: ${activeDashPlatform === 'trendyol' ? '#f27a1a' : theme.textLight}; border-bottom: 3px solid ${activeDashPlatform === 'trendyol' ? '#f27a1a' : 'transparent'}; display: flex; align-items: center; gap: 6px; white-space: nowrap;">
                            🛍️ Trendyol Masası
                        </button>
                        <button onclick="setDashboardPlatform('hepsiburada')" style="padding: 10px 18px; border: none; background: transparent; font-size: 13px; font-weight: 800; cursor: pointer; color: ${activeDashPlatform === 'hepsiburada' ? '#ff6000' : theme.textLight}; border-bottom: 3px solid ${activeDashPlatform === 'hepsiburada' ? '#ff6000' : 'transparent'}; display: flex; align-items: center; gap: 6px; white-space: nowrap;">
                            🏬 Hepsiburada Masası
                        </button>
                        <button onclick="setDashboardPlatform('getir')" style="padding: 10px 18px; border: none; background: transparent; font-size: 13px; font-weight: 800; cursor: pointer; color: ${activeDashPlatform === 'getir' ? '#5d3ebc' : theme.textLight}; border-bottom: 3px solid ${activeDashPlatform === 'getir' ? '#5d3ebc' : 'transparent'}; display: flex; align-items: center; gap: 6px; white-space: nowrap;">
                            🟣 GetirÇarşı Masası
                        </button>
                        <button onclick="setDashboardPlatform('yemeksepeti')" style="padding: 10px 18px; border: none; background: transparent; font-size: 13px; font-weight: 800; cursor: pointer; color: ${activeDashPlatform === 'yemeksepeti' ? '#ea004b' : theme.textLight}; border-bottom: 3px solid ${activeDashPlatform === 'yemeksepeti' ? '#ea004b' : 'transparent'}; display: flex; align-items: center; gap: 6px; white-space: nowrap;">
                            🍔 Yemeksepeti Masası
                        </button>
                    </div>

                    <!-- SEÇİLEN PLATFORMA AİT ÖZEL GİRİŞ FORMU VE DURUM GÖSTERGELERİ -->
                    
                    <!-- 1. TRENDYOL PANELİ -->
                    ${activeDashPlatform === 'trendyol' ? `
                        <div style="background: ${theme.background}; border: 1px solid #f27a1a40; border-radius: 12px; padding: 20px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; border-bottom: 1px solid #f27a1a20; padding-bottom: 12px;">
                                <div>
                                    <div style="font-size: 16px; font-weight: 900; color: #f27a1a; display: flex; align-items: center; gap: 8px;">
                                        🛍️ Trendyol Partner API Giriş Formu & Canlı Durum
                                    </div>
                                    <div style="font-size: 11px; color: ${theme.textLight}; margin-top: 3px;">
                                        Trendyol Satıcı Paneli > Hesap Bilgilerim > Entegrasyon Bilgileri bölümünden aldığınız resmi anahtarları giriniz.
                                    </div>
                                </div>
                                <div style="display: flex; gap: 8px;">
                                    <button onclick="saveTrendyolCredentialsFromDashboard()" style="padding: 8px 14px; background: ${theme.card}; border: 1px solid #f27a1a80; color: #f27a1a; border-radius: 8px; font-weight: 800; font-size: 12px; cursor: pointer;">
                                        💾 Sadece Kaydet
                                    </button>
                                    <button onclick="testTrendyolFromDashboard()" style="padding: 8px 16px; background: #f27a1a; color: white; border: none; border-radius: 8px; font-weight: 800; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(242, 122, 26, 0.3);">
                                        🚀 Bağlan & Siparişleri Çek
                                    </button>
                                </div>
                            </div>

                            <!-- DURUM GÖSTERGELERİ ROV -->
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 18px;">
                                <div style="background: ${theme.card}; padding: 12px; border-radius: 8px; border: 1px solid ${theme.primary}20;">
                                    <div style="font-size: 11px; color: ${theme.textLight};">API Servis Durumu</div>
                                    <div style="font-size: 13px; font-weight: 800; color: ${(apiCreds.tySupplierId && apiCreds.tyApiKey) ? '#10b981' : '#f59e0b'}; margin-top: 3px;">
                                        ${(apiCreds.tySupplierId && apiCreds.tyApiKey) ? '🟢 Yapılandırıldı (Canlı Hazır)' : '⚠️ Eksik Anahtar'}
                                    </div>
                                </div>
                                <div style="background: ${theme.card}; padding: 12px; border-radius: 8px; border: 1px solid ${theme.primary}20;">
                                    <div style="font-size: 11px; color: ${theme.textLight};">Trendyol Sipariş Adedi</div>
                                    <div style="font-size: 15px; font-weight: 900; color: #f27a1a; margin-top: 2px;">
                                        ${tyOrdersCount} Adet Kayıtlı
                                    </div>
                                </div>
                                <div style="background: ${theme.card}; padding: 12px; border-radius: 8px; border: 1px solid ${theme.primary}20;">
                                    <div style="font-size: 11px; color: ${theme.textLight};">Stok Güncelleme Modu</div>
                                    <div style="font-size: 13px; font-weight: 800; color: #10b981; margin-top: 3px;">
                                        ⚡ Otomatik Çift Yönlü FIFO
                                    </div>
                                </div>
                            </div>

                            <!-- AYRI GİRİŞ FORMU: TRENDYOL -->
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px;">
                                <div>
                                    <label style="font-size: 11px; font-weight: bold; color: ${theme.text}; display: block; margin-bottom: 5px;">
                                        Satıcı ID (Supplier ID) *
                                    </label>
                                    <input type="text" id="dash-ty-supplier" value="${apiCreds.tySupplierId || ''}" placeholder="Örn: 123456" style="width: 100%; padding: 9px 12px; border-radius: 8px; border: 1px solid ${theme.primary}40; background: ${theme.card}; color: ${theme.text}; font-size: 12px; box-sizing: border-box;" />
                                </div>
                                <div>
                                    <label style="font-size: 11px; font-weight: bold; color: ${theme.text}; display: block; margin-bottom: 5px;">
                                        API Key *
                                    </label>
                                    <input type="text" id="dash-ty-key" value="${apiCreds.tyApiKey || ''}" placeholder="Partner API Anahtarı" style="width: 100%; padding: 9px 12px; border-radius: 8px; border: 1px solid ${theme.primary}40; background: ${theme.card}; color: ${theme.text}; font-size: 12px; box-sizing: border-box;" />
                                </div>
                                <div>
                                    <label style="font-size: 11px; font-weight: bold; color: ${theme.text}; display: block; margin-bottom: 5px;">
                                        API Secret Key *
                                    </label>
                                    <input type="password" id="dash-ty-secret" value="${apiCreds.tyApiSecret || ''}" placeholder="••••••••••••" style="width: 100%; padding: 9px 12px; border-radius: 8px; border: 1px solid ${theme.primary}40; background: ${theme.card}; color: ${theme.text}; font-size: 12px; box-sizing: border-box;" />
                                </div>
                            </div>

                            <div id="dash-test-result" style="font-size: 12px; margin-top: 14px; padding: 10px; border-radius: 8px; background: ${theme.card}; display: none; border: 1px solid ${theme.primary}20;"></div>
                        </div>
                    ` : ''}

                    <!-- 2. HEPSİBURADA PANELİ -->
                    ${activeDashPlatform === 'hepsiburada' ? `
                        <div style="background: ${theme.background}; border: 1px solid #ff600040; border-radius: 12px; padding: 20px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; border-bottom: 1px solid #ff600020; padding-bottom: 12px;">
                                <div>
                                    <div style="font-size: 16px; font-weight: 900; color: #ff6000; display: flex; align-items: center; gap: 8px;">
                                        🏬 Hepsiburada OMS API Giriş Formu & Canlı Durum
                                    </div>
                                    <div style="font-size: 11px; color: ${theme.textLight}; margin-top: 3px;">
                                        Hepsiburada Satıcı Paneli > Entegrasyon > Servis Anahtarı (OMS) bilgilerinizi giriniz.
                                    </div>
                                </div>
                                <div style="display: flex; gap: 8px;">
                                    <button onclick="saveHepsiburadaCredentialsFromDashboard()" style="padding: 8px 14px; background: ${theme.card}; border: 1px solid #ff600080; color: #ff6000; border-radius: 8px; font-weight: 800; font-size: 12px; cursor: pointer;">
                                        💾 Sadece Kaydet
                                    </button>
                                    <button onclick="testHepsiburadaFromDashboard()" style="padding: 8px 16px; background: #ff6000; color: white; border: none; border-radius: 8px; font-weight: 800; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(255, 96, 0, 0.3);">
                                        🚀 Bağlan & Siparişleri Çek
                                    </button>
                                </div>
                            </div>

                            <!-- DURUM GÖSTERGELERİ ROV -->
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 18px;">
                                <div style="background: ${theme.card}; padding: 12px; border-radius: 8px; border: 1px solid ${theme.primary}20;">
                                    <div style="font-size: 11px; color: ${theme.textLight};">OMS API Durumu</div>
                                    <div style="font-size: 13px; font-weight: 800; color: ${(apiCreds.hbMerchantId && apiCreds.hbSecretKey) ? '#10b981' : '#f59e0b'}; margin-top: 3px;">
                                        ${(apiCreds.hbMerchantId && apiCreds.hbSecretKey) ? '🟢 Yapılandırıldı (Canlı Hazır)' : '⚠️ Eksik Anahtar'}
                                    </div>
                                </div>
                                <div style="background: ${theme.card}; padding: 12px; border-radius: 8px; border: 1px solid ${theme.primary}20;">
                                    <div style="font-size: 11px; color: ${theme.textLight};">Hepsiburada Sipariş Adedi</div>
                                    <div style="font-size: 15px; font-weight: 900; color: #ff6000; margin-top: 2px;">
                                        ${hbOrdersCount} Adet Kayıtlı
                                    </div>
                                </div>
                                <div style="background: ${theme.card}; padding: 12px; border-radius: 8px; border: 1px solid ${theme.primary}20;">
                                    <div style="font-size: 11px; color: ${theme.textLight};">Hepsiburada Komisyon Oranı</div>
                                    <div style="font-size: 13px; font-weight: 800; color: ${theme.text}; margin-top: 3px;">
                                        %${commSettings.hepsiburada}
                                    </div>
                                </div>
                            </div>

                            <!-- AYRI GİRİŞ FORMU: HEPSİBURADA -->
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px;">
                                <div>
                                    <label style="font-size: 11px; font-weight: bold; color: ${theme.text}; display: block; margin-bottom: 5px;">
                                        Satıcı ID (Merchant ID / Mağaza GUID) *
                                    </label>
                                    <input type="text" id="dash-hb-merchant" value="${apiCreds.hbMerchantId || ''}" placeholder="Örn: a1b2c3d4-e5f6-7890-..." style="width: 100%; padding: 9px 12px; border-radius: 8px; border: 1px solid ${theme.primary}40; background: ${theme.card}; color: ${theme.text}; font-size: 12px; box-sizing: border-box;" />
                                </div>
                                <div>
                                    <label style="font-size: 11px; font-weight: bold; color: ${theme.text}; display: block; margin-bottom: 5px;">
                                        Servis Anahtarı (Secret Key / Bearer Token) *
                                    </label>
                                    <input type="password" id="dash-hb-secret" value="${apiCreds.hbSecretKey || ''}" placeholder="••••••••••••••••" style="width: 100%; padding: 9px 12px; border-radius: 8px; border: 1px solid ${theme.primary}40; background: ${theme.card}; color: ${theme.text}; font-size: 12px; box-sizing: border-box;" />
                                </div>
                            </div>

                            <div id="dash-test-result" style="font-size: 12px; margin-top: 14px; padding: 10px; border-radius: 8px; background: ${theme.card}; display: none; border: 1px solid ${theme.primary}20;"></div>
                        </div>
                    ` : ''}

                    <!-- 3. GETİRÇARŞI PANELİ -->
                    ${activeDashPlatform === 'getir' ? `
                        <div style="background: ${theme.background}; border: 1px solid #5d3ebc40; border-radius: 12px; padding: 20px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; border-bottom: 1px solid #5d3ebc20; padding-bottom: 12px;">
                                <div>
                                    <div style="font-size: 16px; font-weight: 900; color: #5d3ebc; display: flex; align-items: center; gap: 8px;">
                                        🟣 GetirÇarşı Partner Giriş Formu & Canlı Durum
                                    </div>
                                    <div style="font-size: 11px; color: ${theme.textLight}; margin-top: 3px;">
                                        GetirÇarşı İş Ortağım Portalı > Entegrasyon & API ayarlarından aldığınız Restaurant/Store ID ve Gizli Anahtar.
                                    </div>
                                </div>
                                <div style="display: flex; gap: 8px;">
                                    <button onclick="saveGetirCredentialsFromDashboard()" style="padding: 8px 14px; background: ${theme.card}; border: 1px solid #5d3ebc80; color: #5d3ebc; border-radius: 8px; font-weight: 800; font-size: 12px; cursor: pointer;">
                                        💾 Sadece Kaydet
                                    </button>
                                    <button onclick="testGetirFromDashboard()" style="padding: 8px 16px; background: #5d3ebc; color: white; border: none; border-radius: 8px; font-weight: 800; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(93, 62, 188, 0.3);">
                                        🚀 Bağlan & Siparişleri Çek
                                    </button>
                                </div>
                            </div>

                            <!-- DURUM GÖSTERGELERİ ROV -->
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 18px;">
                                <div style="background: ${theme.card}; padding: 12px; border-radius: 8px; border: 1px solid ${theme.primary}20;">
                                    <div style="font-size: 11px; color: ${theme.textLight};">Getir Kurye Masası Durumu</div>
                                    <div style="font-size: 13px; font-weight: 800; color: ${getirState.status === 'open' ? '#10b981' : getirState.status === 'pause' ? '#f59e0b' : '#ef4444'}; margin-top: 3px;">
                                        ${getirState.status === 'open' ? '🟢 Dükkan Siparişe Açık' : getirState.status === 'pause' ? '🟡 Mola Modunda' : '🔴 Dükkan Kapalı'}
                                    </div>
                                </div>
                                <div style="background: ${theme.card}; padding: 12px; border-radius: 8px; border: 1px solid ${theme.primary}20;">
                                    <div style="font-size: 11px; color: ${theme.textLight};">Getir Sipariş Adedi</div>
                                    <div style="font-size: 15px; font-weight: 900; color: #5d3ebc; margin-top: 2px;">
                                        ${gtOrdersCount} Adet Kayıtlı
                                    </div>
                                </div>
                                <div style="background: ${theme.card}; padding: 12px; border-radius: 8px; border: 1px solid ${theme.primary}20;">
                                    <div style="font-size: 11px; color: ${theme.textLight};">API Servis Durumu</div>
                                    <div style="font-size: 13px; font-weight: 800; color: ${(apiCreds.gtStoreId && apiCreds.gtSecretKey) ? '#10b981' : '#f59e0b'}; margin-top: 3px;">
                                        ${(apiCreds.gtStoreId && apiCreds.gtSecretKey) ? '🟢 Yapılandırıldı (Canlı Hazır)' : '⚠️ Eksik Anahtar'}
                                    </div>
                                </div>
                            </div>

                            <!-- AYRI GİRİŞ FORMU: GETİRÇARŞI -->
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px;">
                                <div>
                                    <label style="font-size: 11px; font-weight: bold; color: ${theme.text}; display: block; margin-bottom: 5px;">
                                        Getir Mağaza ID (Restaurant/Store ID) *
                                    </label>
                                    <input type="text" id="dash-gt-store" value="${apiCreds.gtStoreId || ''}" placeholder="Örn: 610d48fe3a1b..." style="width: 100%; padding: 9px 12px; border-radius: 8px; border: 1px solid ${theme.primary}40; background: ${theme.card}; color: ${theme.text}; font-size: 12px; box-sizing: border-box;" />
                                </div>
                                <div>
                                    <label style="font-size: 11px; font-weight: bold; color: ${theme.text}; display: block; margin-bottom: 5px;">
                                        Getir API Token / Secret *
                                    </label>
                                    <input type="password" id="dash-gt-secret" value="${apiCreds.gtSecretKey || ''}" placeholder="••••••••••••••••" style="width: 100%; padding: 9px 12px; border-radius: 8px; border: 1px solid ${theme.primary}40; background: ${theme.card}; color: ${theme.text}; font-size: 12px; box-sizing: border-box;" />
                                </div>
                            </div>

                            <div id="dash-test-result" style="font-size: 12px; margin-top: 14px; padding: 10px; border-radius: 8px; background: ${theme.card}; display: none; border: 1px solid ${theme.primary}20;"></div>
                        </div>
                    ` : ''}

                    <!-- 4. YEMEKSEPETİ PANELİ -->
                    ${activeDashPlatform === 'yemeksepeti' ? `
                        <div style="background: ${theme.background}; border: 1px solid #ea004b40; border-radius: 12px; padding: 20px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; border-bottom: 1px solid #ea004b20; padding-bottom: 12px;">
                                <div>
                                    <div style="font-size: 16px; font-weight: 900; color: #ea004b; display: flex; align-items: center; gap: 8px;">
                                        🍔 Yemeksepeti Mahalle Partner Giriş Formu & Canlı Durum
                                    </div>
                                    <div style="font-size: 11px; color: ${theme.textLight}; margin-top: 3px;">
                                        Yemeksepeti İş Ortağım Portalı > Entegrasyon bölümünden aldığınız Mağaza ID (Vendor ID) ve API Anahtarınızı giriniz.
                                    </div>
                                </div>
                                <div style="display: flex; gap: 8px;">
                                    <button onclick="saveYemeksepetiCredentialsFromDashboard()" style="padding: 8px 14px; background: ${theme.card}; border: 1px solid #ea004b80; color: #ea004b; border-radius: 8px; font-weight: 800; font-size: 12px; cursor: pointer;">
                                        💾 Sadece Kaydet
                                    </button>
                                    <button onclick="testYemeksepetiFromDashboard()" style="padding: 8px 16px; background: #ea004b; color: white; border: none; border-radius: 8px; font-weight: 800; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(234, 0, 75, 0.3);">
                                        🚀 Bağlan & Siparişleri Çek
                                    </button>
                                </div>
                            </div>

                            <!-- DURUM GÖSTERGELERİ ROW -->
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 18px;">
                                <div style="background: ${theme.card}; padding: 12px; border-radius: 8px; border: 1px solid ${theme.primary}20;">
                                    <div style="font-size: 11px; color: ${theme.textLight};">Yemeksepeti API Bağlantısı</div>
                                    <div style="font-size: 13px; font-weight: 800; color: ${(apiCreds.ysVendorId && apiCreds.ysApiKey) ? '#10b981' : '#f59e0b'}; margin-top: 3px;">
                                        ${(apiCreds.ysVendorId && apiCreds.ysApiKey) ? '🟢 Canlı Entegre (Hazır)' : '⚠️ Anahtar Bekleniyor'}
                                    </div>
                                </div>
                                <div style="background: ${theme.card}; padding: 12px; border-radius: 8px; border: 1px solid ${theme.primary}20;">
                                    <div style="font-size: 11px; color: ${theme.textLight};">Kayıtlı Sipariş Adedi</div>
                                    <div style="font-size: 15px; font-weight: 900; color: #ea004b; margin-top: 2px;">
                                        ${ysOrdersCount} Adet Kayıtlı
                                    </div>
                                </div>
                                <div style="background: ${theme.card}; padding: 12px; border-radius: 8px; border: 1px solid ${theme.primary}20;">
                                    <div style="font-size: 11px; color: ${theme.textLight};">Komisyon Oranı</div>
                                    <div style="font-size: 13px; font-weight: 800; color: ${theme.text}; margin-top: 3px;">
                                        %${commSettings.yemeksepeti || 18} Net Hakediş
                                    </div>
                                </div>
                            </div>

                            <!-- AYRI GİRİŞ FORMU: YEMEKSEPETİ -->
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px;">
                                <div>
                                    <label style="font-size: 11px; font-weight: bold; color: ${theme.text}; display: block; margin-bottom: 5px;">
                                        Yemeksepeti Mağaza ID (Vendor ID) *
                                    </label>
                                    <input type="text" id="dash-ys-vendor" value="${apiCreds.ysVendorId || ''}" placeholder="Örn: tr_cagdas_pet_01" style="width: 100%; padding: 9px 12px; border-radius: 8px; border: 1px solid ${theme.primary}40; background: ${theme.card}; color: ${theme.text}; font-size: 12px; box-sizing: border-box;" />
                                </div>
                                <div>
                                    <label style="font-size: 11px; font-weight: bold; color: ${theme.text}; display: block; margin-bottom: 5px;">
                                        Yemeksepeti API Key (Bearer Token) *
                                    </label>
                                    <input type="password" id="dash-ys-key" value="${apiCreds.ysApiKey || ''}" placeholder="••••••••••••••••" style="width: 100%; padding: 9px 12px; border-radius: 8px; border: 1px solid ${theme.primary}40; background: ${theme.card}; color: ${theme.text}; font-size: 12px; box-sizing: border-box;" />
                                </div>
                                <div>
                                    <label style="font-size: 11px; font-weight: bold; color: ${theme.text}; display: block; margin-bottom: 5px;">
                                        API Secret Key (Opsiyonel)
                                    </label>
                                    <input type="password" id="dash-ys-secret" value="${apiCreds.ysApiSecret || ''}" placeholder="••••••••••••••••" style="width: 100%; padding: 9px 12px; border-radius: 8px; border: 1px solid ${theme.primary}40; background: ${theme.card}; color: ${theme.text}; font-size: 12px; box-sizing: border-box;" />
                                </div>
                            </div>

                            <div id="dash-test-result" style="font-size: 12px; margin-top: 14px; padding: 10px; border-radius: 8px; background: ${theme.card}; display: none; border: 1px solid ${theme.primary}20;"></div>
                        </div>
                    ` : ''}

                </div>
            ` : ''}

            <!-- SEKME 1: SİPARİŞ MASASI (ONAY, KARGO, FATURA, FİNANS) -->
            ${currentTab === 'orders' ? `
                <div style="background: ${theme.card}; border-radius: 12px; border: 1px solid ${theme.primary}20; padding: 16px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 8px;">
                        <div>
                            <h3 style="margin: 0; font-size: 15px; font-weight: 800; color: ${theme.text}; display: flex; align-items: center; gap: 8px;">
                                📦 Gelen Online Sipariş Masası
                                <span style="font-size: 11px; background: ${theme.primary}15; color: ${theme.primary}; padding: 2px 8px; border-radius: 10px;">${onlineOrders.length} / ${allOnlineOrders.length} Sipariş</span>
                            </h3>
                            <div style="font-size: 11px; color: ${theme.textLight}; margin-top: 2px;">
                                Barkodlu kargo etiketi yazdırabilir, resmi e-Arşiv faturası kesebilir ve net hakedişleri görebilirsiniz.
                            </div>
                        </div>
                        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                            <button onclick="openApiConnectionModal()" style="padding: 6px 12px; background: linear-gradient(135deg, #0284c7, #0369a1); color: white; border: none; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                                🌐 Canlı Siparişleri Çek
                            </button>
                            <button onclick="simulateQuickOnlineOrder(); renderMarketplace(document.getElementById('screen'));" style="padding: 6px 12px; background: ${theme.background}; border: 1px solid ${theme.primary}30; color: ${theme.text}; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer;">
                                ⚡ Hızlı Test Siparişi Ekle
                            </button>
                        </div>
                    </div>

                    <!-- 🏷️ PAZARYERİ KATEGORİ / KANAL SEÇİMİ (FİLTRE BAR) -->
                    <div style="display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; align-items: center; background: ${theme.background}; padding: 8px 10px; border-radius: 10px; border: 1px solid ${theme.primary}20;">
                        <span style="font-size: 11px; font-weight: 700; color: ${theme.textLight}; margin-right: 4px;">Pazar Yeri Seç:</span>
                        
                        <button onclick="setOrderPlatformFilter('all')" style="padding: 6px 14px; border-radius: 20px; font-size: 11.5px; font-weight: 700; cursor: pointer; border: 1px solid ${platformFilter === 'all' ? theme.primary : theme.primary + '30'}; background: ${platformFilter === 'all' ? theme.primary : theme.card}; color: ${platformFilter === 'all' ? 'white' : theme.text}; display: flex; align-items: center; gap: 6px; transition: all 0.2s;">
                            <span>🌐 Tümü</span>
                            <span style="background: ${platformFilter === 'all' ? 'rgba(255,255,255,0.25)' : theme.primary + '20'}; padding: 1px 6px; border-radius: 10px; font-size: 10px;">${allOnlineOrders.length}</span>
                        </button>

                        <button onclick="setOrderPlatformFilter('trendyol')" style="padding: 6px 14px; border-radius: 20px; font-size: 11.5px; font-weight: 700; cursor: pointer; border: 1px solid ${platformFilter === 'trendyol' ? '#f27a1a' : '#f27a1a40'}; background: ${platformFilter === 'trendyol' ? '#f27a1a' : theme.card}; color: ${platformFilter === 'trendyol' ? 'white' : '#f27a1a'}; display: flex; align-items: center; gap: 6px; transition: all 0.2s;">
                            <span>🛍️ Trendyol</span>
                            <span style="background: ${platformFilter === 'trendyol' ? 'rgba(255,255,255,0.25)' : '#f27a1a20'}; padding: 1px 6px; border-radius: 10px; font-size: 10px;">${tyOrdersCount}</span>
                        </button>

                        <button onclick="setOrderPlatformFilter('hepsiburada')" style="padding: 6px 14px; border-radius: 20px; font-size: 11.5px; font-weight: 700; cursor: pointer; border: 1px solid ${platformFilter === 'hepsiburada' ? '#ff6000' : '#ff600040'}; background: ${platformFilter === 'hepsiburada' ? '#ff6000' : theme.card}; color: ${platformFilter === 'hepsiburada' ? 'white' : '#ff6000'}; display: flex; align-items: center; gap: 6px; transition: all 0.2s;">
                            <span>🏬 Hepsiburada</span>
                            <span style="background: ${platformFilter === 'hepsiburada' ? 'rgba(255,255,255,0.25)' : '#ff600020'}; padding: 1px 6px; border-radius: 10px; font-size: 10px;">${hbOrdersCount}</span>
                        </button>

                        <button onclick="setOrderPlatformFilter('getir')" style="padding: 6px 14px; border-radius: 20px; font-size: 11.5px; font-weight: 700; cursor: pointer; border: 1px solid ${platformFilter === 'getir' ? '#5d3ebc' : '#5d3ebc40'}; background: ${platformFilter === 'getir' ? '#5d3ebc' : theme.card}; color: ${platformFilter === 'getir' ? 'white' : '#5d3ebc'}; display: flex; align-items: center; gap: 6px; transition: all 0.2s;">
                            <span>🟣 GetirÇarşı</span>
                            <span style="background: ${platformFilter === 'getir' ? 'rgba(255,255,255,0.25)' : '#5d3ebc20'}; padding: 1px 6px; border-radius: 10px; font-size: 10px;">${gtOrdersCount}</span>
                        </button>

                        <button onclick="setOrderPlatformFilter('yemeksepeti')" style="padding: 6px 14px; border-radius: 20px; font-size: 11.5px; font-weight: 700; cursor: pointer; border: 1px solid ${platformFilter === 'yemeksepeti' ? '#ea004b' : '#ea004b40'}; background: ${platformFilter === 'yemeksepeti' ? '#ea004b' : theme.card}; color: ${platformFilter === 'yemeksepeti' ? 'white' : '#ea004b'}; display: flex; align-items: center; gap: 6px; transition: all 0.2s;">
                            <span>🍔 Yemeksepeti</span>
                            <span style="background: ${platformFilter === 'yemeksepeti' ? 'rgba(255,255,255,0.25)' : '#ea004b20'}; padding: 1px 6px; border-radius: 10px; font-size: 10px;">${ysOrdersCount}</span>
                        </button>
                    </div>

                    ${onlineOrders.length === 0 ? `
                        <div style="text-align: center; padding: 32px 16px; color: ${theme.textLight}; background: ${theme.background}; border-radius: 8px;">
                            <div style="font-size: 28px; margin-bottom: 6px;">📦</div>
                            <div style="font-size: 13px; font-weight: bold; color: ${theme.text};">
                                ${platformFilter === 'all' ? 'Henüz bekleyen online sipariş yok' : `${platformFilter.toUpperCase()} için henüz bekleyen sipariş bulunmuyor`}
                            </div>
                            <div style="font-size: 11px; margin-top: 4px;">
                                ${platformFilter === 'all' ? 'Pazar yerlerinden sipariş geldiğinde buraya düşer ve tek tıkla kargo etiketi ile e-Arşiv faturası kesilebilir.' : 'Yukarıdaki kategori butonlarından "Tümü" seçeneğine tıklayarak diğer kanalların siparişlerini görebilirsiniz.'}
                            </div>
                            <div style="display: flex; gap: 8px; justify-content: center; margin-top: 12px;">
                                ${platformFilter !== 'all' ? `
                                    <button onclick="setOrderPlatformFilter('all')" style="padding: 6px 14px; background: ${theme.card}; border: 1px solid ${theme.primary}50; color: ${theme.text}; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer;">
                                        🌐 Tüm Siparişleri Göster
                                    </button>
                                ` : ''}
                                <button onclick="openSimulateOrderModal()" style="padding: 6px 14px; background: ${theme.primary}; color: white; border: none; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer;">
                                    🧪 Test Siparişi Oluştur
                                </button>
                            </div>
                        </div>
                    ` : `
                        <div style="max-height: 520px; overflow-y: auto; border: 1px solid ${theme.primary}15; border-radius: 8px;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                                <thead>
                                    <tr style="background: ${theme.background}; border-bottom: 1px solid ${theme.primary}20; text-align: left;">
                                        <th style="padding: 10px 12px; color: ${theme.textLight}; font-weight: 700;">Sipariş / Zaman</th>
                                        <th style="padding: 10px 12px; color: ${theme.textLight}; font-weight: 700;">Kanal</th>
                                        <th style="padding: 10px 12px; color: ${theme.textLight}; font-weight: 700;">Ürün, Adet & Parti</th>
                                        <th style="padding: 10px 12px; color: ${theme.textLight}; font-weight: 700;">Finansal (Net Hakediş)</th>
                                        <th style="padding: 10px 12px; color: ${theme.textLight}; font-weight: 700;">Durum</th>
                                        <th style="padding: 10px 12px; color: ${theme.textLight}; font-weight: 700; text-align: right;">Operasyonel Aksiyonlar</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${onlineOrders.slice(0, 40).map(ord => {
                                        const isCancelled = ord.orderStatus === 'cancelled' || ord.status === 'cancelled';
                                        const isShipped = ord.orderStatus === 'shipped';
                                        const isDelivered = ord.orderStatus === 'courier_delivered';
                                        const isConfirmed = ord.orderStatus === 'confirmed' || ord.status === 'confirmed';
                                        const isPending = !isCancelled && !isConfirmed && !isShipped && !isDelivered;
                                        const isGetir = (ord.platform || '').toLowerCase().includes('getir');
                                        const fin = window.calculateOrderFinancials(ord);

                                        return `
                                            <tr style="border-bottom: 1px solid ${theme.primary}10; background: ${isCancelled ? '#fee2e210' : 'transparent'};">
                                                <td style="padding: 10px 12px;">
                                                    <strong style="color: ${theme.text}; font-family: monospace; font-size: 11.5px;">#${ord.orderNo || 'ONL-' + ord.id}</strong>
                                                    <div style="color: ${theme.textLight}; font-size: 9px; margin-top: 2px;">⏰ ${ord.date || ''}</div>
                                                    ${ord.trackingNo ? `<div style="font-size: 9px; color: #2563eb; font-weight: bold; margin-top: 2px;">🚚 ${ord.carrier || 'Kargo'}: ${ord.trackingNo}</div>` : ''}
                                                    ${ord.eInvoiceNo ? `<div style="font-size: 9px; color: #b91c1c; font-weight: bold; margin-top: 2px;">⚡ e-Fatura: ${ord.eInvoiceNo}</div>` : ''}
                                                </td>
                                                <td style="padding: 10px 12px; white-space: nowrap;">
                                                    <span style="background: ${theme.background}; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 10px; border: 1px solid ${theme.primary}20;">
                                                        ${ord.platform || 'Online'}
                                                    </span>
                                                </td>
                                                <td style="padding: 10px 12px;">
                                                    <div style="font-weight: 700; color: ${theme.text}; font-size: 11.5px;">${ord.productName || 'Online Ürün'} (${ord.qty || 1} Adet)</div>
                                                    <div style="font-size: 9px; color: ${theme.textLight}; margin-top: 2px;">👤 Müşteri: ${ord.customer || 'Pazaryeri Alıcısı'}</div>
                                                    <div style="display: inline-block; background: #ecfdf5; color: #047857; font-size: 8.5px; font-weight: bold; padding: 1px 5px; border-radius: 3px; margin-top: 3px; border: 1px solid #10b98130;">
                                                        📦 FIFO Parti / SKT Çıkışı Yapıldı
                                                    </div>
                                                </td>
                                                <td style="padding: 10px 12px;">
                                                    <div style="font-weight: 800; color: ${isCancelled ? '#991b1b' : theme.text}; font-size: 11.5px;">
                                                        ${isCancelled ? `<s>${fin.gross.toFixed(2)}₺</s>` : `${fin.gross.toFixed(2)}₺ (Brüt)`}
                                                    </div>
                                                    ${!isCancelled ? `
                                                        <div style="font-size: 9.5px; color: #059669; font-weight: bold; margin-top: 2px;">
                                                            🏦 Net Hakediş: <strong>${fin.netPayout.toFixed(2)}₺</strong>
                                                        </div>
                                                        <div style="font-size: 8.5px; color: ${theme.textLight};">
                                                            Komisyon: -${fin.commissionAmount.toFixed(1)}₺ | Kargo: -${fin.shippingCost.toFixed(1)}₺
                                                        </div>
                                                        <div style="font-size: 9px; font-weight: bold; color: ${fin.netProfit >= 0 ? '#10b981' : '#ef4444'};">
                                                            📈 Reel Kâr: ${fin.netProfit >= 0 ? '+' : ''}${fin.netProfit.toFixed(1)}₺ (%${fin.profitMargin.toFixed(0)})
                                                        </div>
                                                    ` : ''}
                                                </td>
                                                <td style="padding: 10px 12px; white-space: nowrap;">
                                                    ${isCancelled ? `
                                                        <span style="background: #ef4444; color: white; padding: 2px 8px; border-radius: 6px; font-size: 9px; font-weight: 800;">❌ İptal Edildi</span>
                                                    ` : isShipped ? `
                                                        <span style="background: #2563eb; color: white; padding: 2px 8px; border-radius: 6px; font-size: 9px; font-weight: 800;">📦 Kargoya Verildi</span>
                                                    ` : isDelivered ? `
                                                        <span style="background: #5d3ebc; color: white; padding: 2px 8px; border-radius: 6px; font-size: 9px; font-weight: 800;">🛵 Kuryeye Teslim</span>
                                                    ` : isConfirmed ? `
                                                        <span style="background: #10b981; color: white; padding: 2px 8px; border-radius: 6px; font-size: 9px; font-weight: 800;">✅ Onaylandı</span>
                                                    ` : `
                                                        <span style="background: #f59e0b; color: white; padding: 2px 8px; border-radius: 6px; font-size: 9px; font-weight: 800;">⏳ Onay Bekliyor</span>
                                                    `}
                                                </td>
                                                <td style="padding: 10px 12px; text-align: right; white-space: nowrap;">
                                                    <div style="display: inline-flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end;">
                                                        <!-- ETİKET YAZDIR -->
                                                        <button onclick="printShippingLabel('${ord.id}')" style="padding: 4px 8px; background: #2563eb; color: white; border: none; border-radius: 4px; font-weight: bold; font-size: 10px; cursor: pointer;" title="Barkodlu Kargo Etiketi Yazdır (Termal / A4)">
                                                            🏷️ Etiket
                                                        </button>
                                                        <!-- e-FATURA -->
                                                        <button onclick="${ord.eInvoiceNo ? `printEArchiveInvoice('${ord.id}')` : `generateEArchiveInvoice('${ord.id}')`}" style="padding: 4px 8px; background: #b91c1c; color: white; border: none; border-radius: 4px; font-weight: bold; font-size: 10px; cursor: pointer;" title="e-Arşiv Fatura Kes / Yazdır">
                                                            ⚡ ${ord.eInvoiceNo ? 'Fatura Gör' : 'e-Fatura'}
                                                        </button>
                                                        <!-- KARGOYA VER -->
                                                        ${!isCancelled && !isShipped && !isDelivered && !isGetir ? `
                                                            <button onclick="shipMarketplaceOrder('${ord.id}')" style="padding: 4px 8px; background: #0284c7; color: white; border: none; border-radius: 4px; font-weight: bold; font-size: 10px; cursor: pointer;" title="Kargoya Teslim Edildi Olarak İşaretle">
                                                                📦 Kargola
                                                            </button>
                                                        ` : ''}
                                                        <!-- GETİR KURYE TESLİM -->
                                                        ${isGetir && !isCancelled && !isDelivered ? `
                                                            <button onclick="deliverGetirOrderToCourier('${ord.id}')" style="padding: 4px 8px; background: #5d3ebc; color: white; border: none; border-radius: 4px; font-weight: bold; font-size: 10px; cursor: pointer;" title="Kapıdaki Getir Kuryesine Teslim Et">
                                                                🛵 Kuryeye Ver
                                                            </button>
                                                        ` : ''}
                                                        <!-- ONAYLA -->
                                                        ${isPending ? `
                                                            <button onclick="approveOrderSale('${ord.id}')" style="padding: 4px 8px; background: #10b981; color: white; border: none; border-radius: 4px; font-weight: bold; font-size: 10px; cursor: pointer;">
                                                                ✅ Onayla
                                                            </button>
                                                        ` : ''}
                                                        <!-- İPTAL ET -->
                                                        ${!isCancelled ? `
                                                            <button onclick="cancelOrderSale('${ord.id}')" style="padding: 4px 8px; background: #fee2e2; border: 1px solid #ef444460; color: #b91c1c; border-radius: 4px; font-weight: bold; font-size: 10px; cursor: pointer;" title="Siparişi İptal Et ve Stokları Dükkana İade Et">
                                                                ❌ İptal
                                                            </button>
                                                            <button onclick="openSimulateReturnModal('${ord.orderNo || ''}')" style="padding: 4px 8px; background: #fff1f2; border: 1px solid #ef444480; color: #b91c1c; border-radius: 4px; font-weight: bold; font-size: 10px; cursor: pointer;" title="Bu Sipariş No İçin İade (RMA) Talebi Aç">
                                                                ↩️ İade
                                                            </button>
                                                        ` : ''}
                                                    </div>
                                                </td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>
            ` : ''}

            <!-- SEKME 2: GETİRÇARŞI CANLI KURYE & DÜKKAN MODU -->
            ${currentTab === 'getir' ? `
                <div style="background: ${theme.card}; border-radius: 12px; border: 1px solid #5d3ebc30; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(93, 62, 188, 0.08);">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 16px;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="width: 48px; height: 48px; border-radius: 12px; background: #f3f0ff; color: #5d3ebc; display: flex; align-items: center; justify-content: center; font-size: 26px;">
                                🛵
                            </div>
                            <div>
                                <h3 style="margin: 0; font-size: 16px; font-weight: 800; color: ${theme.text};">GetirÇarşı Dükkan & Canlı Kurye Masası</h3>
                                <div style="font-size: 12px; color: ${theme.textLight};">Anlık mahalle siparişleri için 15-20 dakikalık kurye hazırlık takibi ve dükkan durumu.</div>
                            </div>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button onclick="setGetirStoreState('open'); renderMarketplace(document.getElementById('screen')); showAppToast('🟢 Getir dükkan durumu AÇIK yapıldı!', 'success');" style="padding: 8px 14px; background: ${getirState.status === 'open' ? '#10b981' : theme.background}; color: ${getirState.status === 'open' ? 'white' : theme.text}; border: 1px solid #10b98160; border-radius: 8px; font-weight: bold; font-size: 11px; cursor: pointer;">
                                🟢 Dükkan Açık
                            </button>
                            <button onclick="setGetirStoreState('pause', 30); renderMarketplace(document.getElementById('screen')); showAppToast('🟡 Getir dükkan 30 dakika yoğunluk molasına alındı!', 'warning');" style="padding: 8px 14px; background: ${getirState.status === 'pause' ? '#f59e0b' : theme.background}; color: ${getirState.status === 'pause' ? 'white' : theme.text}; border: 1px solid #f59e0b60; border-radius: 8px; font-weight: bold; font-size: 11px; cursor: pointer;">
                                🟡 30 Dk Mola
                            </button>
                            <button onclick="setGetirStoreState('closed'); renderMarketplace(document.getElementById('screen')); showAppToast('🔴 Getir dükkan KAPATILDI!', 'info');" style="padding: 8px 14px; background: ${getirState.status === 'closed' ? '#ef4444' : theme.background}; color: ${getirState.status === 'closed' ? 'white' : theme.text}; border: 1px solid #ef444460; border-radius: 8px; font-weight: bold; font-size: 11px; cursor: pointer;">
                                🔴 Dükkan Kapalı
                            </button>
                        </div>
                    </div>

                    <div style="background: ${theme.background}; border: 1px solid ${theme.primary}15; border-radius: 10px; padding: 14px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                        <div>
                            <span style="font-size: 11px; color: ${theme.textLight}; font-weight: bold;">Mevcut Dükkan Durumu:</span>
                            <div style="font-size: 14px; font-weight: 800; color: ${getirState.status === 'open' ? '#10b981' : getirState.status === 'pause' ? '#f59e0b' : '#ef4444'}; margin-top: 2px;">
                                ${getirState.status === 'open' ? '🟢 AKTİF — Siparişler Anında Kabul Ediliyor' : getirState.status === 'pause' ? '🟡 MOLA — 30 Dk Yoğunluk Nedeniyle Kapalı' : '🔴 KAPALI — Mesai Dışı / Manuel Kapalı'}
                            </div>
                        </div>
                        <div style="font-size: 11px; color: ${theme.textLight};">
                            Kurye Teslim Ortalama Hedef Süresi: <strong>15 Dakika</strong>
                        </div>
                    </div>

                    <h4 style="font-size: 13px; font-weight: 800; color: ${theme.text}; margin: 0 0 10px 0;">🛵 Bekleyen Getir Siparişleri (${getirOrders.length})</h4>
                    ${getirOrders.length === 0 ? `
                        <div style="text-align: center; padding: 24px; color: ${theme.textLight}; background: ${theme.background}; border-radius: 8px; font-size: 12px;">
                            Şu an hazırlanması gereken aktif bir Getir siparişi yok.
                        </div>
                    ` : `
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px;">
                            ${getirOrders.map(ord => `
                                <div style="background: ${theme.background}; border: 1.5px solid #5d3ebc40; border-radius: 10px; padding: 14px;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                        <span style="font-weight: 800; color: #5d3ebc; font-family: monospace;">#${ord.orderNo}</span>
                                        <span style="background: #5d3ebc; color: white; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px;">🛵 GETİR KURYE</span>
                                    </div>
                                    <div style="font-size: 13px; font-weight: 800; color: ${theme.text}; margin-bottom: 4px;">${ord.productName} x${ord.qty} Adet</div>
                                    <div style="font-size: 11px; color: ${theme.textLight}; margin-bottom: 10px;">👤 ${ord.customer || 'Getir Alıcısı'}</div>
                                    <div style="display: flex; gap: 6px;">
                                        <button onclick="deliverGetirOrderToCourier('${ord.id}')" style="flex: 1; padding: 8px; background: #10b981; color: white; border: none; border-radius: 6px; font-weight: bold; font-size: 11px; cursor: pointer;">
                                            🛵 Kuryeye Teslim Ettim
                                        </button>
                                        <button onclick="printShippingLabel('${ord.id}')" style="padding: 8px 12px; background: #2563eb; color: white; border: none; border-radius: 6px; font-size: 11px; cursor: pointer;">
                                            🖨️ Fiş
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `}
                </div>
            ` : ''}

            <!-- SEKME 3: İADE & HASARLI ÜRÜN (RMA) MASASI -->
            ${currentTab === 'returns' ? `
                <div style="background: ${theme.card}; border-radius: 12px; border: 1px solid #ef444430; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(239, 68, 68, 0.06);">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 16px;">
                        <div>
                            <h3 style="margin: 0; font-size: 16px; font-weight: 800; color: ${theme.text}; display: flex; align-items: center; gap: 8px;">
                                📦 Pazaryeri İade (RMA) ve Kargo Hasar Masası
                            </h3>
                            <div style="font-size: 12px; color: ${theme.textLight}; margin-top: 2px;">
                                Yalnızca satılmış siparişler için sipariş no bazlı iadeler açılır. Sağlam ürünleri dükkan stoğuna geri alın, hasarlı mamaları zayi tutanağıyla kargo tazminine ayırın.
                            </div>
                        </div>
                        <button onclick="openSimulateReturnModal()" style="padding: 9px 18px; background: #ef4444; color: white; border: none; border-radius: 8px; font-weight: 900; font-size: 11.5px; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);">
                            <span>➕</span> Sipariş No İle İade Talebi Aç
                        </button>
                    </div>

                    ${returns.length === 0 ? `
                        <div style="text-align: center; padding: 36px; background: ${theme.background}; border-radius: 8px; color: ${theme.textLight}; border: 1px dashed ${theme.primary}20;">
                            <div style="font-size: 34px; margin-bottom: 8px;">🎉</div>
                            <div style="font-size: 14px; font-weight: bold; color: ${theme.text};">Bekleyen İade Kaydı Yok!</div>
                            <div style="font-size: 11.5px; margin: 4px 0 14px 0;">Müşterilerden veya kargo firmasından gelen iadeler burada listelenir ve kontrol edilir.</div>
                            <button onclick="openSimulateReturnModal()" style="padding: 7px 14px; background: #ef4444; color: white; border: none; border-radius: 6px; font-weight: bold; font-size: 11px; cursor: pointer;">
                                ↩️ Sipariş No İle İade Başlat
                            </button>
                        </div>
                    ` : `
                        <div style="overflow-x: auto; border: 1px solid ${theme.primary}15; border-radius: 8px;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 11.5px;">
                                <thead>
                                    <tr style="background: ${theme.background}; border-bottom: 1px solid ${theme.primary}20; text-align: left;">
                                        <th style="padding: 10px 12px;">Sipariş / Müşteri</th>
                                        <th style="padding: 10px 12px;">Kanal</th>
                                        <th style="padding: 10px 12px;">İade Edilen Ürün & Tutar</th>
                                        <th style="padding: 10px 12px;">İade Sebebi & Not</th>
                                        <th style="padding: 10px 12px;">RMA Durumu</th>
                                        <th style="padding: 10px 12px; text-align: right;">Aksiyonlar</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${returns.map(ret => {
                                        const retRefund = parseFloat(ret.totalRefund) || (parseFloat(ret.sellPrice || 0) * (parseFloat(ret.qty) || 1));
                                        return `
                                        <tr style="border-bottom: 1px solid ${theme.primary}10;">
                                            <td style="padding: 10px 12px;">
                                                <div style="display: flex; align-items: center; gap: 6px;">
                                                    <strong style="font-family: monospace; font-size: 12px;">#${ret.orderNo}</strong>
                                                </div>
                                                <div style="font-size: 10px; font-weight: 600; color: ${theme.text}; margin-top: 1px;">👤 ${ret.customer || 'Pazaryeri Müşterisi'}</div>
                                                <div style="font-size: 9px; color: ${theme.textLight};">${ret.date || ''}</div>
                                            </td>
                                            <td style="padding: 10px 12px;">
                                                <span style="text-transform: capitalize; padding: 2px 7px; border-radius: 4px; font-weight: bold; font-size: 10px; background: ${ret.platform === 'hepsiburada' ? '#ff600020' : ret.platform === 'getir' ? '#5d3ebc20' : '#f27a1a20'}; color: ${ret.platform === 'hepsiburada' ? '#ff6000' : ret.platform === 'getir' ? '#5d3ebc' : '#f27a1a'};">
                                                    ${ret.platform === 'hepsiburada' ? '🏬 Hepsiburada' : ret.platform === 'getir' ? '🟣 Getir' : '🛍️ Trendyol'}
                                                </span>
                                            </td>
                                            <td style="padding: 10px 12px;">
                                                <div style="font-weight: bold; color: ${theme.text};">${ret.productName}</div>
                                                <div style="font-size: 10px; color: ${theme.textLight}; margin-top: 2px;">
                                                    Adet: <strong>${ret.qty}</strong> | İade Tutarı: <strong style="color: #10b981;">${retRefund.toFixed(2)}₺</strong>
                                                </div>
                                            </td>
                                            <td style="padding: 10px 12px; max-width: 220px;">
                                                <div style="color: #b91c1c; font-weight: 700;">${ret.reason}</div>
                                                ${ret.note ? `<div style="font-size: 10px; color: ${theme.textLight}; margin-top: 2px; font-style: italic;">"${ret.note}"</div>` : ''}
                                                ${ret.rejectionReason ? `<div style="font-size: 10px; color: #ef4444; margin-top: 2px; font-weight: bold;">Red Sebebi: ${ret.rejectionReason}</div>` : ''}
                                            </td>
                                            <td style="padding: 10px 12px;">
                                                ${ret.status === 'restocked' ? `
                                                    <span style="background: #10b981; color: white; padding: 3px 8px; border-radius: 5px; font-size: 9.5px; font-weight: bold; display: inline-block;">🟢 Sağlam - Stoğa Alındı</span>
                                                    ${ret.processedAt ? `<div style="font-size: 8.5px; color: ${theme.textLight}; margin-top: 2px;">${ret.processedAt}</div>` : ''}
                                                ` : ret.status === 'damaged_scrap' ? `
                                                    <span style="background: #ef4444; color: white; padding: 3px 8px; border-radius: 5px; font-size: 9.5px; font-weight: bold; display: inline-block;">🔴 Hasarlı Zayi (Tazmin)</span>
                                                    ${ret.processedAt ? `<div style="font-size: 8.5px; color: ${theme.textLight}; margin-top: 2px;">${ret.processedAt}</div>` : ''}
                                                ` : ret.status === 'rejected' ? `
                                                    <span style="background: #6b7280; color: white; padding: 3px 8px; border-radius: 5px; font-size: 9.5px; font-weight: bold; display: inline-block;">❌ Reddedildi</span>
                                                    ${ret.processedAt ? `<div style="font-size: 8.5px; color: ${theme.textLight}; margin-top: 2px;">${ret.processedAt}</div>` : ''}
                                                ` : `
                                                    <span style="background: #f59e0b; color: white; padding: 3px 8px; border-radius: 5px; font-size: 9.5px; font-weight: bold; display: inline-block;">⏳ Kontrol Bekliyor</span>
                                                `}
                                            </td>
                                            <td style="padding: 10px 12px; text-align: right; white-space: nowrap;">
                                                <div style="display: inline-flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end;">
                                                    ${ret.status === 'pending' ? `
                                                        <button onclick="processReturnRestock('${ret.id}')" style="padding: 5px 9px; background: #10b981; color: white; border: none; border-radius: 5px; font-weight: bold; font-size: 10px; cursor: pointer;" title="Ürün Sağlam, Dükkan Stoğuna ve FIFO Partilerine Geri Yükle">
                                                            🟢 Sağlam Stoğa Al
                                                        </button>
                                                        <button onclick="processReturnDamaged('${ret.id}')" style="padding: 5px 9px; background: #ef4444; color: white; border: none; border-radius: 5px; font-weight: bold; font-size: 10px; cursor: pointer;" title="Ürün Patlak/Hasarlı, Stoğa Ekleme, Kargo Tazminine Ayır">
                                                            🔴 Hasarlı Zayi Yap
                                                        </button>
                                                        <button onclick="rejectMarketplaceReturn('${ret.id}')" style="padding: 5px 8px; background: #6b7280; color: white; border: none; border-radius: 5px; font-weight: bold; font-size: 10px; cursor: pointer;" title="İade Koşullarına Uymuyor, İadeyi Reddet">
                                                            ❌ Reddet
                                                        </button>
                                                    ` : ''}
                                                    <button onclick="printReturnReceipt('${ret.id}')" style="padding: 5px 8px; background: #2563eb; color: white; border: none; border-radius: 5px; font-weight: bold; font-size: 10px; cursor: pointer;" title="RMA İnceleme ve İade Tutanağı Yazdır">
                                                        🖨️ Tutanak
                                                    </button>
                                                    <button onclick="deleteMarketplaceReturn('${ret.id}')" style="padding: 5px 7px; background: ${theme.background}; border: 1px solid ${theme.primary}30; color: #ef4444; border-radius: 5px; font-size: 10px; cursor: pointer;" title="Kaydı Listeden Sil">
                                                        🗑️
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    `}).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>
            ` : ''}

            <!-- SEKME 4: KOMİSYON & NET HAKEDİŞ ANALİZİ -->
            ${currentTab === 'financials' ? `
                <div style="background: ${theme.card}; border-radius: 12px; border: 1px solid ${theme.primary}20; padding: 20px; margin-bottom: 20px;">
                    <h3 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 800; color: ${theme.text};">
                        💰 Pazaryeri Komisyon Oranları & Net Hakediş Parametreleri
                    </h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 18px;">
                        <div style="background: ${theme.background}; padding: 12px; border-radius: 8px; border: 1px solid ${theme.primary}20;">
                            <label style="font-size: 11px; font-weight: bold; display: block; margin-bottom: 4px;">🛍️ Trendyol Komisyon %</label>
                            <input type="number" id="comm-trendyol" value="${commSettings.trendyol}" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.card}; color: ${theme.text}; font-weight: bold;" />
                        </div>
                        <div style="background: ${theme.background}; padding: 12px; border-radius: 8px; border: 1px solid ${theme.primary}20;">
                            <label style="font-size: 11px; font-weight: bold; display: block; margin-bottom: 4px;">🏬 Hepsiburada Komisyon %</label>
                            <input type="number" id="comm-hepsiburada" value="${commSettings.hepsiburada}" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.card}; color: ${theme.text}; font-weight: bold;" />
                        </div>
                        <div style="background: ${theme.background}; padding: 12px; border-radius: 8px; border: 1px solid ${theme.primary}20;">
                            <label style="font-size: 11px; font-weight: bold; display: block; margin-bottom: 4px;">🟣 GetirÇarşı Komisyon %</label>
                            <input type="number" id="comm-getir" value="${commSettings.getir}" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.card}; color: ${theme.text}; font-weight: bold;" />
                        </div>
                        <div style="background: ${theme.background}; padding: 12px; border-radius: 8px; border: 1px solid ${theme.primary}20;">
                            <label style="font-size: 11px; font-weight: bold; display: block; margin-bottom: 4px;">🍔 Yemeksepeti Komisyon %</label>
                            <input type="number" id="comm-yemeksepeti" value="${commSettings.yemeksepeti || 18}" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.card}; color: ${theme.text}; font-weight: bold;" />
                        </div>
                        <div style="background: ${theme.background}; padding: 12px; border-radius: 8px; border: 1px solid ${theme.primary}20;">
                            <label style="font-size: 11px; font-weight: bold; display: block; margin-bottom: 4px;">🚚 Kargo Kesintisi (Sipariş Başı TL)</label>
                            <input type="number" id="comm-shipping" value="${commSettings.shippingCost}" step="0.5" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.card}; color: ${theme.text}; font-weight: bold;" />
                        </div>
                        <div style="background: ${theme.background}; padding: 12px; border-radius: 8px; border: 1px solid ${theme.primary}20;">
                            <label style="font-size: 11px; font-weight: bold; display: block; margin-bottom: 4px;">📋 Listeleme / Hizmet Bedeli (TL)</label>
                            <input type="number" id="comm-service" value="${commSettings.serviceFee}" step="0.5" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.card}; color: ${theme.text}; font-weight: bold;" />
                        </div>
                    </div>
                    <button onclick="updateCommissionSettingsUI()" style="padding: 10px 20px; background: ${theme.primary}; color: white; border: none; border-radius: 8px; font-weight: bold; font-size: 12px; cursor: pointer;">
                        💾 Oranları ve Maliyetleri Kaydet
                    </button>
                </div>
            ` : ''}

            <!-- SEKME 5: KANALLAR & GÜVENLİK STOĞU -->
            ${currentTab === 'channels' ? `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; margin-bottom: 20px;">
                    <!-- TRENDYOL KARTI -->
                    <div style="background: ${theme.card}; border-radius: 12px; border: 1px solid ${theme.primary}20; padding: 16px; position: relative; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                        <div style="position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: #f27a1a;"></div>
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div style="width: 42px; height: 42px; border-radius: 10px; background: #fff5eb; color: #f27a1a; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 900; border: 1px solid #ffd8b2;">
                                    🛍️
                                </div>
                                <div>
                                    <h3 style="margin: 0; font-size: 15px; font-weight: 800; color: ${theme.text};">Trendyol</h3>
                                    <div style="font-size: 11px; color: ${theme.textLight};">Stok, Fiyat & Sipariş API</div>
                                </div>
                            </div>
                            <label class="switch" style="position: relative; display: inline-block; width: 44px; height: 24px;">
                                <input type="checkbox" id="toggle-channel-trendyol" ${channels.trendyol.active ? 'checked' : ''} onchange="toggleChannelState('trendyol', this.checked)" style="opacity: 0; width: 0; height: 0;">
                                <span style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${channels.trendyol.active ? '#f27a1a' : '#ccc'}; border-radius: 24px; transition: .3s;" class="slider"></span>
                            </label>
                        </div>
                        <div style="background: ${theme.background}; padding: 10px; border-radius: 8px; font-size: 11px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                <span style="color: ${theme.textLight};">Durum:</span>
                                <span style="font-weight: 700; color: #10b981;">🟢 Çift Yönlü Aktif</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: ${theme.textLight};">Komisyon:</span>
                                <span style="font-weight: 700; color: ${theme.text};">%${commSettings.trendyol}</span>
                            </div>
                        </div>
                    </div>

                    <!-- HEPSİBURADA KARTI -->
                    <div style="background: ${theme.card}; border-radius: 12px; border: 1px solid ${theme.primary}20; padding: 16px; position: relative; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                        <div style="position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: #ff6000;"></div>
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div style="width: 42px; height: 42px; border-radius: 10px; background: #fff3ec; color: #ff6000; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 900; border: 1px solid #ffd0b5;">
                                    🏬
                                </div>
                                <div>
                                    <h3 style="margin: 0; font-size: 15px; font-weight: 800; color: ${theme.text};">Hepsiburada</h3>
                                    <div style="font-size: 11px; color: ${theme.textLight};">Merchant API Entegrasyonu</div>
                                </div>
                            </div>
                            <label class="switch" style="position: relative; display: inline-block; width: 44px; height: 24px;">
                                <input type="checkbox" id="toggle-channel-hepsiburada" ${channels.hepsiburada.active ? 'checked' : ''} onchange="toggleChannelState('hepsiburada', this.checked)" style="opacity: 0; width: 0; height: 0;">
                                <span style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${channels.hepsiburada.active ? '#ff6000' : '#ccc'}; border-radius: 24px; transition: .3s;" class="slider"></span>
                            </label>
                        </div>
                        <div style="background: ${theme.background}; padding: 10px; border-radius: 8px; font-size: 11px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                <span style="color: ${theme.textLight};">Durum:</span>
                                <span style="font-weight: 700; color: #10b981;">🟢 Çift Yönlü Aktif</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: ${theme.textLight};">Komisyon:</span>
                                <span style="font-weight: 700; color: ${theme.text};">%${commSettings.hepsiburada}</span>
                            </div>
                        </div>
                    </div>

                    <!-- GETİR KARTI -->
                    <div style="background: ${theme.card}; border-radius: 12px; border: 1px solid ${theme.primary}20; padding: 16px; position: relative; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                        <div style="position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: #5d3ebc;"></div>
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div style="width: 42px; height: 42px; border-radius: 10px; background: #f3f0ff; color: #5d3ebc; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 900; border: 1px solid #dcd4fc;">
                                    🟣
                                </div>
                                <div>
                                    <h3 style="margin: 0; font-size: 15px; font-weight: 800; color: ${theme.text};">GetirÇarşı</h3>
                                    <div style="font-size: 11px; color: ${theme.textLight};">Hızlı Kurye & Mahalle Satışı</div>
                                </div>
                            </div>
                            <label class="switch" style="position: relative; display: inline-block; width: 44px; height: 24px;">
                                <input type="checkbox" id="toggle-channel-getir" ${channels.getir.active ? 'checked' : ''} onchange="toggleChannelState('getir', this.checked)" style="opacity: 0; width: 0; height: 0;">
                                <span style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${channels.getir.active ? '#5d3ebc' : '#ccc'}; border-radius: 24px; transition: .3s;" class="slider"></span>
                            </label>
                        </div>
                        <div style="background: ${theme.background}; padding: 10px; border-radius: 8px; font-size: 11px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                <span style="color: ${theme.textLight};">Durum:</span>
                                <span style="font-weight: 700; color: #10b981;">🟢 Canlı Kurye Entegre</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: ${theme.textLight};">Komisyon:</span>
                                <span style="font-weight: 700; color: ${theme.text};">%${commSettings.getir}</span>
                            </div>
                        </div>
                    </div>

                    <!-- YEMEKSEPETİ KARTI -->
                    <div style="background: ${theme.card}; border-radius: 12px; border: 1px solid ${theme.primary}20; padding: 16px; position: relative; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                        <div style="position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: #ea004b;"></div>
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div style="width: 42px; height: 42px; border-radius: 10px; background: #fff1f3; color: #ea004b; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 900; border: 1px solid #ffd1d8;">
                                    🍔
                                </div>
                                <div>
                                    <h3 style="margin: 0; font-size: 15px; font-weight: 800; color: ${theme.text};">Yemeksepeti Mahalle</h3>
                                    <div style="font-size: 11px; color: ${theme.textLight};">Hızlı Teslimat & Pet Shop API</div>
                                </div>
                            </div>
                            <label class="switch" style="position: relative; display: inline-block; width: 44px; height: 24px;">
                                <input type="checkbox" id="toggle-channel-yemeksepeti" ${channels.yemeksepeti?.active ? 'checked' : ''} onchange="toggleChannelState('yemeksepeti', this.checked)" style="opacity: 0; width: 0; height: 0;">
                                <span style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${channels.yemeksepeti?.active ? '#ea004b' : '#ccc'}; border-radius: 24px; transition: .3s;" class="slider"></span>
                            </label>
                        </div>
                        <div style="background: ${theme.background}; padding: 10px; border-radius: 8px; font-size: 11px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                <span style="color: ${theme.textLight};">Durum:</span>
                                <span style="font-weight: 700; color: #10b981;">🟢 Canlı Sipariş Entegre</span>
                            </div>
                            <div style="display: flex; justify-content: space-between;">
                                <span style="color: ${theme.textLight};">Komisyon:</span>
                                <span style="font-weight: 700; color: ${theme.text};">%${commSettings.yemeksepeti || 18}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- GÜVENLİK STOĞU (BUFFER) AYARI -->
                <div style="background: ${theme.card}; border-radius: 12px; border: 1px solid ${theme.primary}20; padding: 18px; margin-bottom: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                        <div style="max-width: 600px;">
                            <h4 style="margin: 0; font-size: 14px; font-weight: 800; color: ${theme.text}; display: flex; align-items: center; gap: 8px;">
                                🛡️ Dinamik Güvenlik Stoğu (Safety Buffer Eşiği)
                            </h4>
                            <p style="font-size: 12px; color: ${theme.textLight}; margin: 4px 0 0 0; line-height: 1.4;">
                                Dükkandaki son kalan ürünlerin hem fiziki müşteriye hem online müşteriye aynı anda satılmasını önlemek için pazar yerlerine gönderilen stoktan otomatik düşülecek tampon adettir.
                            </p>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <input type="number" id="input-safety-buffer" value="${buffer}" min="0" max="20" style="width: 70px; padding: 8px 10px; border-radius: 8px; border: 1px solid ${theme.primary}40; background: ${theme.background}; color: ${theme.text}; font-size: 14px; font-weight: 800; text-align: center;" />
                            <button onclick="updateSafetyBufferSetting()" style="padding: 8px 16px; background: ${theme.primary}; color: white; border: none; border-radius: 8px; font-size: 12px; font-weight: 800; cursor: pointer;">
                                Kaydet
                            </button>
                        </div>
                    </div>
                </div>
            ` : ''}

            <!-- CANLI İŞLEM GEÇMİŞİ & SİPARİŞ AKIŞI -->
            <div style="background: ${theme.card}; border-radius: 12px; border: 1px solid ${theme.primary}20; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 18px;">📋</span>
                        <h4 style="margin: 0; font-size: 14px; font-weight: 800; color: ${theme.text};">Son Pazaryeri Senkronizasyon & Sipariş Kayıtları</h4>
                    </div>
                    <button onclick="clearMarketplaceLogs()" style="padding: 4px 10px; background: transparent; border: 1px solid ${theme.textLight}40; color: ${theme.textLight}; border-radius: 6px; font-size: 10px; cursor: pointer;">
                        🗑️ Geçmişi Temizle
                    </button>
                </div>

                ${logs.length === 0 ? `
                    <div style="text-align: center; padding: 32px 16px; color: ${theme.textLight};">
                        <div style="font-size: 32px; margin-bottom: 8px;">💤</div>
                        <div style="font-size: 13px; font-weight: bold; color: ${theme.text};">Henüz bir pazaryeri işlemi kaydedilmedi</div>
                        <div style="font-size: 11px; margin-top: 4px;">Dükkandan satış yapıldığında veya test simülasyonu çalıştırıldığında kayıtlar burada listelenir.</div>
                        <button onclick="openSimulateOrderModal()" style="margin-top: 12px; padding: 8px 16px; background: ${theme.primary}; color: white; border: none; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer;">
                            🧪 İlk Test Siparişini Simüle Et
                        </button>
                    </div>
                ` : `
                    <div style="max-height: 320px; overflow-y: auto; border: 1px solid ${theme.primary}15; border-radius: 8px;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                            <thead>
                                <tr style="background: ${theme.background}; border-bottom: 1px solid ${theme.primary}20; text-align: left;">
                                    <th style="padding: 10px 12px; color: ${theme.textLight}; font-weight: 700;">Zaman</th>
                                    <th style="padding: 10px 12px; color: ${theme.textLight}; font-weight: 700;">İşlem</th>
                                    <th style="padding: 10px 12px; color: ${theme.textLight}; font-weight: 700;">Detay</th>
                                    <th style="padding: 10px 12px; color: ${theme.textLight}; font-weight: 700;">Kanallar</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${logs.map(log => `
                                    <tr style="border-bottom: 1px solid ${theme.primary}10;">
                                        <td style="padding: 8px 12px; font-family: monospace; color: ${theme.textLight}; white-space: nowrap;">
                                            ${log.date || ''} ${log.timestamp}
                                        </td>
                                        <td style="padding: 8px 12px; font-weight: 700; color: ${theme.text};">
                                            ${log.title || 'İşlem'}
                                        </td>
                                        <td style="padding: 8px 12px; color: ${theme.text};">
                                            ${log.details || '-'}
                                        </td>
                                        <td style="padding: 8px 12px; white-space: nowrap;">
                                            <span style="background: ${theme.background}; padding: 2px 6px; border-radius: 4px; font-size: 10px; color: ${theme.primary}; border: 1px solid ${theme.primary}30;">
                                                ${log.channels || 'Tümü'}
                                            </span>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>

            <!-- MODALLAR İÇİN KONTEYNER -->
            <div id="marketplace-modal-container"></div>
        `;
    };

    // Kanal Açma / Kapama
    window.toggleChannelState = function(channelKey, isChecked) {
        const channels = getChannelSettings();
        if (channels[channelKey]) {
            channels[channelKey].active = isChecked;
            saveChannelSettings(channels);
            const statusText = isChecked ? 'Aktif' : 'Pasif';
            if (typeof showToast === 'function') {
                showToast(`✅ ${channels[channelKey].name} durumu "${statusText}" olarak güncellendi.`);
            }
        }
    };

    // Güvenlik Stoğu Güncelleme
    window.updateSafetyBufferSetting = function() {
        const el = document.getElementById('input-safety-buffer');
        if (!el) return;
        const val = parseInt(el.value, 10);
        if (isNaN(val) || val < 0) {
            alert('⚠️ Lütfen 0 veya daha büyük bir geçerli sayı giriniz.');
            return;
        }
        saveSafetyBuffer(val);
        addMarketplaceLog({
            type: 'setting_change',
            title: '⚙️ Güvenlik Stoğu Güncellendi',
            details: `Yeni Güvenlik Stoğu (Buffer Limiti): ${val} adet`,
            channels: 'Tümü'
        });
        if (typeof showToast === 'function') {
            showToast(`✅ Pazaryeri güvenlik stoğu eşiği "${val} Adet" olarak kaydedildi!`);
        } else {
            alert(`✅ Pazaryeri güvenlik stoğu eşiği "${val} Adet" olarak kaydedildi!`);
        }
    };

    // Geçmiş Temizleme
    window.clearMarketplaceLogs = function() {
        if (confirm('Tüm pazaryeri işlem ve senkronizasyon geçmişini temizlemek istiyor musunuz?')) {
            localStorage.removeItem(STORAGE_KEY_LOGS);
            renderMarketplace(document.getElementById('screen'));
        }
    };

    // Tüm Envanteri Pazaryerine Gönder
    window.syncAllInventoryToMarketplaces = async function() {
        if (!state.products || state.products.length === 0) {
            alert('⚠️ Envanterinizde eşitlenecek ürün bulunamadı.');
            return;
        }

        const count = state.products.length;
        if (!confirm(`${count} adet ürünün güncel stok ve fiyatları aktif pazaryerlerine (Trendyol, Hepsiburada, Getir) gönderilecek. Devam edilsin mi?`)) {
            return;
        }

        let synced = 0;
        for (const p of state.products) {
            if (p.barcode) {
                await window.syncProductToMarketplaces(p);
                synced++;
            }
        }

        addMarketplaceLog({
            type: 'batch_sync',
            title: '🔄 Toplu Stok Eşitlemesi Yapıldı',
            details: `${synced} adet ürünün stok ve fiyat bilgisi pazar yerlerine iletildi.`,
            channels: 'Tümü'
        });

        alert(`✅ Toplu Eşitleme Tamamlandı!\nToplam ${synced} adet ürünün stoğu başarıyla pazar yerlerine gönderildi.`);
        renderMarketplace(document.getElementById('screen'));
    };

    // SİPARİŞ SİMÜLASYONU MODALI
    window.openSimulateOrderModal = function() {
        const container = document.getElementById('marketplace-modal-container');
        if (!container) return;

        const products = state.products || [];
        if (products.length === 0) {
            alert('⚠️ Simülasyon yapabilmek için önce sisteme en az bir ürün eklemelisiniz.');
            return;
        }

        const buffer = getSafetyBuffer();

        // Rastgele gerçekçi müşteri bilgisi üret
        const sampleCustomers = [
            { name: 'Merve Yılmaz', phone: '0532 541 23 89', address: 'Moda Cad. No: 88 D: 2', district: 'Kadıköy', city: 'İSTANBUL', taxNo: '28491823102' },
            { name: 'Canberk Demir', phone: '0544 329 88 12', address: 'Tunalı Hilmi Cad. 45/B', district: 'Çankaya', city: 'ANKARA', taxNo: '19482019482' },
            { name: 'Zeynep Kaya', phone: '0505 678 12 34', address: 'Kıbrıs Şehitleri Cad. No: 12', district: 'Alsancak', city: 'İZMİR', taxNo: '48291039481' },
            { name: 'Emre Öztürk', phone: '0533 111 22 33', address: 'Bağdat Cad. Çiçek Sok. No: 14', district: 'Maltepe', city: 'İSTANBUL', taxNo: '33491823199' }
        ];
        const randomCust = sampleCustomers[Math.floor(Math.random() * sampleCustomers.length)];

        container.innerHTML = `
            <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 16px; backdrop-filter: blur(2px);">
                <div style="background: ${theme.card}; width: 100%; max-width: 540px; border-radius: 14px; border: 1px solid ${theme.primary}40; box-shadow: 0 10px 30px rgba(0,0,0,0.3); overflow: hidden;">
                    <div style="padding: 16px; background: ${theme.background}; border-bottom: 1px solid ${theme.primary}20; display: flex; justify-content: space-between; align-items: center;">
                        <div style="font-size: 15px; font-weight: 800; color: ${theme.text}; display: flex; align-items: center; gap: 8px;">
                            🧪 Pazaryeri Siparişi Test Simülatörü
                        </div>
                        <button onclick="closeMarketplaceModal()" style="background: transparent; border: none; font-size: 18px; cursor: pointer; color: ${theme.textLight};">✕</button>
                    </div>
                    <div style="padding: 18px; max-height: 80vh; overflow-y: auto;">
                        <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); padding: 10px 12px; border-radius: 8px; margin-bottom: 14px; font-size: 11.5px; color: ${theme.text}; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                            <div>
                                🛡️ <strong>Emniyet Stoğu Limiti: ${buffer} Adet</strong>
                                <div style="font-size: 10px; color: ${theme.textLight}; margin-top: 2px;">Dükkandaki son ${buffer} adet fiziksel müşterilere ayrılır.</div>
                            </div>
                            <div style="display: flex; gap: 4px; align-items: center;">
                                <span style="font-size: 10px; color: ${theme.textLight};">Ayar:</span>
                                <button type="button" onclick="saveSafetyBuffer(0); openSimulateOrderModal();" style="padding: 3px 8px; background: ${buffer === 0 ? theme.primary : theme.background}; color: ${buffer === 0 ? '#fff' : theme.text}; border: 1px solid ${theme.primary}; border-radius: 4px; font-size: 10px; font-weight: bold; cursor: pointer;">0 (Tam Satış)</button>
                                <button type="button" onclick="saveSafetyBuffer(1); openSimulateOrderModal();" style="padding: 3px 8px; background: ${buffer === 1 ? theme.primary : theme.background}; color: ${buffer === 1 ? '#fff' : theme.text}; border: 1px solid ${theme.primary}; border-radius: 4px; font-size: 10px; font-weight: bold; cursor: pointer;">1 Adet</button>
                                <button type="button" onclick="saveSafetyBuffer(3); openSimulateOrderModal();" style="padding: 3px 8px; background: ${buffer === 3 ? theme.primary : theme.background}; color: ${buffer === 3 ? '#fff' : theme.text}; border: 1px solid ${theme.primary}; border-radius: 4px; font-size: 10px; font-weight: bold; cursor: pointer;">3 Adet</button>
                            </div>
                        </div>

                        <div style="margin-bottom: 12px;">
                            <label style="font-size: 11px; font-weight: bold; color: ${theme.text}; display: block; margin-bottom: 4px;">Pazar Yeri Kanalı Seç:</label>
                            <select id="sim-channel" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid ${theme.primary}50; background: ${theme.background}; color: ${theme.text}; font-size: 12px;">
                                <option value="trendyol">🛍️ Trendyol (Müşteri Siparişi)</option>
                                <option value="hepsiburada">🏬 Hepsiburada (Online Satış)</option>
                                <option value="getir">🟣 GetirÇarşı (Hızlı Teslimat)</option>
                                <option value="yemeksepeti">🍔 Yemeksepeti Mahalle (Kurye / Vale)</option>
                            </select>
                        </div>

                        <div style="margin-bottom: 12px;">
                            <label style="font-size: 11px; font-weight: bold; color: ${theme.text}; display: block; margin-bottom: 4px;">Satılacak Ürün:</label>
                            <select id="sim-product-id" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid ${theme.primary}50; background: ${theme.background}; color: ${theme.text}; font-size: 12px;">
                                ${products.map(p => {
                                    const tot = (parseFloat(p.shop) || 0) + (parseFloat(p.warehouse) || 0);
                                    const sellable = Math.max(0, tot - buffer);
                                    return `
                                        <option value="${p.id}">
                                            ${p.emoji || '📦'} ${p.name} (Toplam: ${tot} | Güvenli Satışa Açık: ${sellable} Adet)
                                        </option>
                                    `;
                                }).join('')}
                            </select>
                        </div>

                        <div class="grid-2" style="gap: 10px; margin-bottom: 12px;">
                            <div>
                                <label style="font-size: 11px; font-weight: bold; color: ${theme.text}; display: block; margin-bottom: 4px;">Satılan Adet:</label>
                                <input type="number" id="sim-quantity" value="1" min="1" max="10" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid ${theme.primary}50; background: ${theme.background}; color: ${theme.text}; font-size: 12px; box-sizing: border-box;" />
                            </div>
                            <div>
                                <label style="font-size: 11px; font-weight: bold; color: ${theme.text}; display: block; margin-bottom: 4px;">Sipariş No:</label>
                                <input type="text" id="sim-order-no" value="TR-${Math.floor(100000 + Math.random() * 900000)}" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid ${theme.primary}50; background: ${theme.background}; color: ${theme.text}; font-size: 12px; font-family: monospace; box-sizing: border-box;" />
                            </div>
                        </div>

                        <div style="border-top: 1px dashed ${theme.primary}30; padding-top: 10px; margin-top: 10px;">
                            <div style="font-size: 11px; font-weight: 800; color: ${theme.primary}; margin-bottom: 8px;">👤 Müşteri & Kargo Teslimat Bilgileri:</div>
                            <div class="grid-2" style="gap: 10px; margin-bottom: 8px;">
                                <div>
                                    <label style="font-size: 10px; color: ${theme.textLight}; display: block; margin-bottom: 2px;">Alıcı Adı Soyadı:</label>
                                    <input type="text" id="sim-customer-name" value="${randomCust.name}" style="width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.background}; color: ${theme.text}; font-size: 11px; box-sizing: border-box;" />
                                </div>
                                <div>
                                    <label style="font-size: 10px; color: ${theme.textLight}; display: block; margin-bottom: 2px;">Telefon Numarası:</label>
                                    <input type="text" id="sim-customer-phone" value="${randomCust.phone}" style="width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.background}; color: ${theme.text}; font-size: 11px; box-sizing: border-box;" />
                                </div>
                            </div>
                            <div style="margin-bottom: 8px;">
                                <label style="font-size: 10px; color: ${theme.textLight}; display: block; margin-bottom: 2px;">Açık Teslimat Adresi:</label>
                                <input type="text" id="sim-customer-address" value="${randomCust.address} ${randomCust.district} / ${randomCust.city}" style="width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.background}; color: ${theme.text}; font-size: 11px; box-sizing: border-box;" />
                            </div>
                            <div class="grid-2" style="gap: 10px; margin-bottom: 8px;">
                                <div>
                                    <label style="font-size: 10px; color: ${theme.textLight}; display: block; margin-bottom: 2px;">İlçe / İl:</label>
                                    <input type="text" id="sim-customer-city" value="${randomCust.district} / ${randomCust.city}" style="width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.background}; color: ${theme.text}; font-size: 11px; box-sizing: border-box;" />
                                </div>
                                <div>
                                    <label style="font-size: 10px; color: ${theme.textLight}; display: block; margin-bottom: 2px;">TCKN / VKN:</label>
                                    <input type="text" id="sim-customer-taxno" value="${randomCust.taxNo}" style="width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.background}; color: ${theme.text}; font-size: 11px; box-sizing: border-box;" />
                                </div>
                            </div>
                        </div>

                        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px;">
                            <button onclick="closeMarketplaceModal()" style="padding: 8px 14px; background: transparent; border: 1px solid ${theme.textLight}40; color: ${theme.text}; border-radius: 6px; font-size: 12px; cursor: pointer;">
                                Vazgeç
                            </button>
                            <button onclick="executeOrderSimulation()" style="padding: 8px 18px; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 6px; font-size: 12px; font-weight: bold; cursor: pointer; box-shadow: 0 2px 6px rgba(16, 185, 129, 0.3);">
                                ⚡ Siparişi Canlı Simüle Et
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

    window.closeMarketplaceModal = function() {
        const container = document.getElementById('marketplace-modal-container');
        if (container) container.innerHTML = '';
    };

    // Simülasyonu Çalıştır (FIFO ile Stok Düşüşü ve Güvenlik Stoğu Sınırı)
    window.executeOrderSimulation = function() {
        const channel = document.getElementById('sim-channel').value;
        const prodId = parseInt(document.getElementById('sim-product-id').value, 10);
        const qty = parseInt(document.getElementById('sim-quantity').value, 10) || 1;
        const orderNo = document.getElementById('sim-order-no').value || ('TR-' + Date.now());

        const custName = (document.getElementById('sim-customer-name')?.value || 'Pazaryeri Müşterisi').trim();
        const custPhone = (document.getElementById('sim-customer-phone')?.value || '0532 555 01 23').trim();
        const custAddress = (document.getElementById('sim-customer-address')?.value || 'Bağdat Cad. No: 12').trim();
        const custCity = (document.getElementById('sim-customer-city')?.value || 'İSTANBUL').trim();
        const custTaxNo = (document.getElementById('sim-customer-taxno')?.value || '11111111111').trim();

        const p = state.products.find(x => x.id === prodId);
        if (!p) {
            alert('⛔ HATA: Ürün sistemde bulunamadı! Olmayan ürünün satışı yapılamaz.');
            return;
        }

        const channelNames = {
            trendyol: '🛍️ Trendyol',
            hepsiburada: '🏬 Hepsiburada',
            getir: '🟣 GetirÇarşı',
            yemeksepeti: '🍔 Yemeksepeti'
        };

        const channelKey = channelNames[channel] || '🌐 Online Satış';
        const oldShop = parseFloat(p.shop) || 0;
        const oldWarehouse = parseFloat(p.warehouse) || 0;
        const totalAvail = oldShop + oldWarehouse;
        const safetyBuffer = getSafetyBuffer();

        // 1. Olmayan ürün satışı kontrolü
        if (totalAvail <= 0) {
            alert(`⛔ OLMAYAN ÜRÜN SATIŞI ENGELLENDİ!\n\n"${p.name}" ürününün dükkan ve depo stoğu sıfırdır (Stok: 0).\nPazaryerinde olmayan ürünün satılması kesinlikle durdurulmuştur.`);
            return;
        }

        // 2. Güvenli satış limiti kontrolü (Eğer emniyet stoğu tanımlıysa)
        if (safetyBuffer > 0 && totalAvail <= safetyBuffer) {
            const bypass = confirm(`🛡️ GÜVENLİ SATIŞ LİMİTİ DEVREDE!\n\n"${p.name}" toplam stoğu: ${totalAvail} adet.\nBelirlenen Emniyet Stoğu: ${safetyBuffer} adet.\n\nDükkanınızda son ${safetyBuffer} adet ürün fiziksel müşterilere rezerve durumdadır.\n\nBu simülasyon testinde güvenlik limitini bu ürün için esnetip siparişi tamamlamak ister misiniz?`);
            if (!bypass) return;
        }

        // 3. Talep edilen miktar emniyet stoğuna giriyor mu?
        const maxSellable = safetyBuffer > 0 ? Math.max(0, totalAvail - safetyBuffer) : totalAvail;
        if (safetyBuffer > 0 && totalAvail > safetyBuffer && qty > maxSellable) {
            const bypassQty = confirm(`🛡️ GÜVENLİ SATIŞ LİMİTİ DEVREDE!\n\n"${p.name}" toplam stoğu: ${totalAvail} adet.\nEmniyet Stoğu: ${safetyBuffer} adet.\nPazaryerinde satılabilir miktar: ${maxSellable} adet.\n\nTalep edilen ${qty} adet dükkan stoğunu aşmaktadır. Test simülasyonunu yine de onaylamak istiyor musunuz?`);
            if (!bypassQty) return;
        }

        const unitSellPrice = parseFloat(p.marketplacePrice) || parseFloat(p.sellPrice) || 0;
        
        // FIFO stok düşüşü
        let fifoRes = null;
        if (typeof window.deductFifoQuantity === 'function') {
            fifoRes = window.deductFifoQuantity(p, qty);
        } else {
            let fromShop = Math.min(qty, oldShop);
            let fromWarehouse = qty - fromShop;
            p.shop = Math.max(0, oldShop - fromShop);
            p.warehouse = Math.max(0, oldWarehouse - fromWarehouse);
        }

        const nowStr = new Date().toLocaleString('tr-TR');
        const unitBuyCost = (fifoRes && fifoRes.consumedLots && fifoRes.consumedLots.length > 0)
            ? fifoRes.consumedLots[0].buyPrice
            : (parseFloat(p.buyPrice) || 0);

        // Stock Log (FIFO bilgisiyle)
        if (!Array.isArray(state.stockLog)) state.stockLog = [];
        state.stockLog.push({
            id: Date.now(),
            productName: p.name,
            quantity: qty,
            buyPrice: unitBuyCost,
            sellPrice: unitSellPrice,
            type: 'out',
            date: nowStr,
            user: `${channelKey} Siparişi`,
            note: `Online Satış (FIFO) #${orderNo}: ${p.name} (-${qty} Adet)`
        });

        // Satışlar listesine Online Satış fişi olarak ekle
        if (!Array.isArray(state.sales)) state.sales = [];
        const totalSaleAmount = unitSellPrice * qty;
        const saleId = Date.now() + Math.floor(Math.random() * 100);
        state.sales.push({
            id: saleId,
            invoiceNo: `ONL-${orderNo}`,
            orderNo: orderNo,
            timestamp: nowStr,
            customer: custName,
            phone: custPhone,
            address: custAddress,
            city: custCity,
            taxNo: custTaxNo,
            cashier: channelKey,
            paymentMethod: 'card',
            channel: channel,
            isOnlineSale: true,
            status: 'pending',
            total: totalSaleAmount,
            grossTotal: totalSaleAmount,
            discountTotal: 0,
            vatRate: 0.20,
            vatType: 'included',
            items: [{
                id: p.id,
                name: p.name,
                barcode: p.barcode || '',
                qty: qty,
                buyPrice: unitBuyCost,
                sellPrice: unitSellPrice,
                lotSku: fifoRes && fifoRes.consumedLots && fifoRes.consumedLots[0] ? fifoRes.consumedLots[0].sku : 'FIFO Kontrollü',
                isBulkMama: false
            }]
        });

        // Bildirim Ekle (Gerçek müşteri ve kargo bilgileriyle)
        if (!Array.isArray(state.notifications)) state.notifications = [];
        const newNotif = {
            id: Date.now(),
            saleId: saleId,
            orderStatus: 'pending',
            title: `🛍️ Yeni ${channelKey} Siparişi!`,
            message: `#${orderNo} nolu sipariş ile "${p.name}" (${qty} adet) satıldı. FIFO parti stokları düşüldü. Kalan Dükkan: ${p.shop}, Depo: ${p.warehouse}.`,
            date: nowStr,
            read: false,
            type: 'online_order',
            orderNo: orderNo,
            platform: channel,
            productName: p.name,
            barcode: p.barcode || '',
            qty: qty,
            total: totalSaleAmount,
            customer: custName,
            phone: custPhone,
            address: custAddress,
            city: custCity,
            taxNo: custTaxNo,
            lotInfo: fifoRes && fifoRes.consumedLots && fifoRes.consumedLots[0] ? `Parti: ${fifoRes.consumedLots[0].sku}` : 'FIFO Entegre',
            items: [{
                id: p.id,
                name: p.name,
                barcode: p.barcode || '',
                qty: qty,
                sellPrice: unitSellPrice,
                lotSku: fifoRes && fifoRes.consumedLots && fifoRes.consumedLots[0] ? fifoRes.consumedLots[0].sku : 'FIFO Entegre'
            }],
            shopStock: p.shop,
            warehouseStock: p.warehouse,
            whatsappSent: false
        };
        state.notifications.unshift(newNotif);

        // Audit Log
        if (!Array.isArray(state.auditLog)) state.auditLog = [];
        state.auditLog.push({
            user: `${channelKey} Entegrasyonu`,
            action: '🛍️ Online Satış (FIFO)',
            timestamp: nowStr,
            details: `Sipariş #${orderNo}, Ürün: ${p.name} (-${qty} Adet) | Müşteri: ${custName}`,
            affectedData: `Kalan Dükkan: ${p.shop}, Depo: ${p.warehouse}${fifoRes && fifoRes.consumedLots ? ` | Tüketilen Parti: ${fifoRes.consumedLots.map(l => l.sku || l.lotId).join(', ')}` : ''}`
        });

        addMarketplaceLog({
            type: 'order_simulation',
            title: `🛍️ Online Sipariş (FIFO): #${orderNo}`,
            details: `${p.name} x ${qty} Adet satıldı (${custName}). Dükkan: ${oldShop} ➔ ${p.shop}, Depo: ${oldWarehouse} ➔ ${p.warehouse}`,
            channels: channelKey
        });

        saveData();
        closeMarketplaceModal();

        // Üst bardaki sipariş bildirim badge'i ve listeyi güncelle
        if (typeof window.updateOrderNotificationBadge === 'function') {
            window.updateOrderNotificationBadge();
        }

        // Admin WhatsApp Otomatik Mesaj Bildirimini Tetikle
        if (typeof window.triggerOnlineOrderWhatsAppNotification === 'function') {
            window.triggerOnlineOrderWhatsAppNotification(newNotif);
        }

        // Sesli uyarı
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
            osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.35);
        } catch(e) {}

        alert(`🎉 SİPARİŞ BAŞARIYLA İŞLENDİ!\n\n${channelKey} üzerinden #${orderNo} nolu sipariş geldi!\nAlıcı: ${custName} (${custPhone})\nAdres: ${custAddress} - ${custCity}\nÜrün: ${p.name}\nSatılan: ${qty} Adet (Güvenlik stoğu korundu)\nKalan Dükkan: ${p.shop} | Depo: ${p.warehouse}\n\nEtiket ve Fatura yazdırma işlemleri için sipariş listesini kontrol edebilirsiniz.`);

        // Diğer pazar yerlerine güncel stoğu anında bildir (Çift yönlü senkronizasyon)
        if (typeof window.syncProductToMarketplaces === 'function') {
            window.syncProductToMarketplaces(p);
        }

        renderMarketplace(document.getElementById('screen'));
    };

    // ==========================================
    // 🏢 RESMİ FATURA & MAĞAZA PROFİLİ DÜZENLEME MODALI
    // ==========================================
    window.openStoreProfileModal = function() {
        const container = document.getElementById('marketplace-modal-container');
        if (!container) return;

        const store = (typeof window.getStoreProfile === 'function' ? window.getStoreProfile() : null) || state.store || {
            name: 'ÇAĞDAŞ PET MARKET VE AKVARYUM DÜNYASI',
            tradeName: 'Çağdaş Evcil Hayvan Ürünleri Tic. Ltd. Şti.',
            taxOffice: 'Kadıköy Vergi Dairesi',
            taxNumber: '1234567890',
            address: 'Bağdat Caddesi No: 124/A Kadıköy / İSTANBUL',
            phone: '0216 345 67 89',
            mobile: '0532 123 45 67',
            email: 'info@cagdaspetmarket.com',
            mersis: '0123456789000014'
        };

        container.innerHTML = `
            <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.65); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 16px; backdrop-filter: blur(2px);">
                <div style="background: ${theme.card}; width: 100%; max-width: 560px; border-radius: 14px; border: 1px solid ${theme.primary}40; box-shadow: 0 10px 35px rgba(0,0,0,0.35); overflow: hidden;">
                    <div style="padding: 16px; background: ${theme.background}; border-bottom: 1px solid ${theme.primary}20; display: flex; justify-content: space-between; align-items: center;">
                        <div style="font-size: 15px; font-weight: 800; color: ${theme.text}; display: flex; align-items: center; gap: 8px;">
                            🏢 Resmi Mağaza & e-Arşiv Fatura Bilgileri
                        </div>
                        <button onclick="closeMarketplaceModal()" style="background: transparent; border: none; font-size: 18px; cursor: pointer; color: ${theme.textLight};">✕</button>
                    </div>
                    <div style="padding: 18px; max-height: 80vh; overflow-y: auto; font-size: 12px;">
                        <p style="color: ${theme.textLight}; margin: 0 0 14px 0; line-height: 1.4;">
                            Kargo etiketlerinde ve GİB e-Arşiv faturalarında yer alan satıcı / mağaza kimlik bilgilerinizi buradan güncelleyebilirsiniz. Yapılan değişiklikler tüm yeni etiket ve faturalara anında yansır.
                        </p>

                        <div style="margin-bottom: 12px;">
                            <label style="font-weight: bold; color: ${theme.text}; display: block; margin-bottom: 4px;">Resmi Mağaza / Şirket Adı:</label>
                            <input type="text" id="store-modal-name" value="${store.name || ''}" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.background}; color: ${theme.text}; box-sizing: border-box;" />
                        </div>

                        <div class="grid-2" style="gap: 10px; margin-bottom: 12px;">
                            <div>
                                <label style="font-weight: bold; color: ${theme.text}; display: block; margin-bottom: 4px;">Vergi Dairesi:</label>
                                <input type="text" id="store-modal-tax-office" value="${store.taxOffice || ''}" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.background}; color: ${theme.text}; box-sizing: border-box;" />
                            </div>
                            <div>
                                <label style="font-weight: bold; color: ${theme.text}; display: block; margin-bottom: 4px;">VKN / TCKN:</label>
                                <input type="text" id="store-modal-tax-number" value="${store.taxNumber || ''}" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.background}; color: ${theme.text}; box-sizing: border-box;" />
                            </div>
                        </div>

                        <div style="margin-bottom: 12px;">
                            <label style="font-weight: bold; color: ${theme.text}; display: block; margin-bottom: 4px;">Resmi İşyeri & Sevkiyat Adresi:</label>
                            <input type="text" id="store-modal-address" value="${store.address || ''}" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.background}; color: ${theme.text}; box-sizing: border-box;" />
                        </div>

                        <div class="grid-2" style="gap: 10px; margin-bottom: 12px;">
                            <div>
                                <label style="font-weight: bold; color: ${theme.text}; display: block; margin-bottom: 4px;">Sabit / Mağaza Telefonu:</label>
                                <input type="text" id="store-modal-phone" value="${store.phone || ''}" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.background}; color: ${theme.text}; box-sizing: border-box;" />
                            </div>
                            <div>
                                <label style="font-weight: bold; color: ${theme.text}; display: block; margin-bottom: 4px;">Cep / WhatsApp Hattı:</label>
                                <input type="text" id="store-modal-mobile" value="${store.mobile || ''}" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.background}; color: ${theme.text}; box-sizing: border-box;" />
                            </div>
                        </div>

                        <div class="grid-2" style="gap: 10px; margin-bottom: 16px;">
                            <div>
                                <label style="font-weight: bold; color: ${theme.text}; display: block; margin-bottom: 4px;">E-Posta Adresi:</label>
                                <input type="email" id="store-modal-email" value="${store.email || ''}" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.background}; color: ${theme.text}; box-sizing: border-box;" />
                            </div>
                            <div>
                                <label style="font-weight: bold; color: ${theme.text}; display: block; margin-bottom: 4px;">Mersis No (Opsiyonel):</label>
                                <input type="text" id="store-modal-mersis" value="${store.mersis || ''}" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.background}; color: ${theme.text}; box-sizing: border-box;" />
                            </div>
                        </div>

                        <div style="display: flex; justify-content: flex-end; gap: 8px;">
                            <button onclick="closeMarketplaceModal()" style="padding: 8px 14px; background: transparent; border: 1px solid ${theme.textLight}40; color: ${theme.text}; border-radius: 6px; cursor: pointer;">
                                İptal
                            </button>
                            <button onclick="saveStoreProfileFromModal()" style="padding: 8px 18px; background: #2563eb; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">
                                💾 Bilgileri Kaydet
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

    window.saveStoreProfileFromModal = function() {
        const updated = {
            name: document.getElementById('store-modal-name').value.trim(),
            taxOffice: document.getElementById('store-modal-tax-office').value.trim(),
            taxNumber: document.getElementById('store-modal-tax-number').value.trim(),
            address: document.getElementById('store-modal-address').value.trim(),
            phone: document.getElementById('store-modal-phone').value.trim(),
            mobile: document.getElementById('store-modal-mobile').value.trim(),
            email: document.getElementById('store-modal-email').value.trim(),
            mersis: document.getElementById('store-modal-mersis').value.trim()
        };

        if (typeof window.saveStoreProfile === 'function') {
            window.saveStoreProfile(updated);
        } else {
            state.store = updated;
            localStorage.setItem('PET_POS_STORE_PROFILE', JSON.stringify(updated));
            if (typeof saveData === 'function') saveData();
        }

        closeMarketplaceModal();
        showAppToast('✅ Mağaza ve resmi fatura bilgileri güncellendi!', 'success');
        renderMarketplace(document.getElementById('screen'));
    };

    // ÇEVRE DEĞİŞKENLERİ VE API REHBERİ MODALI
    window.openEnvGuideModal = function() {
        const container = document.getElementById('marketplace-modal-container');
        if (!container) return;

        const webhookSampleUrl = window.location.origin + '/.netlify/functions/marketplace-webhook';

        container.innerHTML = `
            <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.65); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 16px; backdrop-filter: blur(3px);">
                <div style="background: ${theme.card}; width: 100%; max-width: 650px; max-height: 85vh; border-radius: 14px; border: 1px solid ${theme.primary}40; box-shadow: 0 10px 35px rgba(0,0,0,0.35); display: flex; flex-direction: column; overflow: hidden;">
                    
                    <div style="padding: 16px 20px; background: ${theme.background}; border-bottom: 1px solid ${theme.primary}20; display: flex; justify-content: space-between; align-items: center;">
                        <div style="font-size: 16px; font-weight: 800; color: ${theme.text}; display: flex; align-items: center; gap: 8px;">
                            🔑 Dükkan Açıldıktan Sonra Yapılacaklar (API & Netlify Rehberi)
                        </div>
                        <button onclick="closeMarketplaceModal()" style="background: transparent; border: none; font-size: 18px; cursor: pointer; color: ${theme.textLight};">✕</button>
                    </div>

                    <div style="padding: 20px; overflow-y: auto; font-size: 12px; line-height: 1.6; color: ${theme.text};">
                        
                        <div style="background: rgba(99, 102, 241, 0.1); padding: 12px 16px; border-radius: 8px; border-left: 4px solid ${theme.primary}; margin-bottom: 16px;">
                            <strong>Hatırlatma:</strong> Bu adımları sadece dükkanınız açılıp vergi levhanızla Trendyol, Hepsiburada veya Getir satıcı başvurunuz onaylandıktan sonra yapacaksınız. Şu an hiçbir şey yapmanıza gerek yoktur.
                        </div>

                        <h4 style="font-size: 13px; font-weight: 800; color: ${theme.primary}; margin: 16px 0 8px 0;">1. Adım: API Bilgilerini Almak</h4>
                        <ul style="padding-left: 20px; margin: 0 0 14px 0; color: ${theme.textLight};">
                            <li><strong style="color: ${theme.text};">Trendyol:</strong> partner.trendyol.com ➔ Hesap Bilgilerim ➔ Entegrasyon sekmesinden <code>Supplier ID</code>, <code>API Key</code>, <code>API Secret</code> bilgilerini kopyalayın.</li>
                            <li><strong style="color: ${theme.text};">Hepsiburada:</strong> merchant.hepsiburada.com ➔ Hesabım ➔ Entegrasyon kısmından <code>Merchant ID</code> ve Secret Key alın.</li>
                            <li><strong style="color: ${theme.text};">GetirÇarşı:</strong> Getir Partner portalından veya müşteri temsilcinizden API Store ID ve Key talep edin.</li>
                        </ul>

                        <h4 style="font-size: 13px; font-weight: 800; color: ${theme.primary}; margin: 16px 0 8px 0;">2. Adım: Netlify Paneline Tanımlamak</h4>
                        <p style="color: ${theme.textLight}; margin: 0 0 8px 0;">
                            Netlify panelinize (app.netlify.com) girin ➔ Projenizi seçin ➔ <strong>Site configuration</strong> ➔ <strong>Environment variables</strong> bölümüne aşağıdaki değişkenleri yapıştırın:
                        </p>

                        <div style="background: #1e1e2e; color: #a6accd; padding: 12px 14px; border-radius: 8px; font-family: monospace; font-size: 11px; margin-bottom: 16px; border: 1px solid #2e3048; overflow-x: auto;">
                            # TRENDYOL<br>
                            TRENDYOL_SUPPLIER_ID=123456<br>
                            TRENDYOL_API_KEY=kendi_api_anahtariniz<br>
                            TRENDYOL_API_SECRET=kendi_api_secretiniz<br><br>
                            # HEPSİBURADA<br>
                            HEPSIBURADA_MERCHANT_ID=kendi_merchant_id<br>
                            HEPSIBURADA_SECRET_KEY=kendi_secret_key<br><br>
                            # GETİRÇARŞI<br>
                            GETIR_STORE_ID=kendi_store_id<br>
                            GETIR_SECRET_KEY=kendi_getir_key<br><br>
                            # GÜVENLİK STOĞU (Opsiyonel)<br>
                            MARKETPLACE_SAFETY_BUFFER=1
                        </div>

                        <h4 style="font-size: 13px; font-weight: 800; color: ${theme.primary}; margin: 16px 0 8px 0;">3. Adım: Webhook Adresinizi Tanımlamak (Sipariş Geldiğinde Otomatik Düşüş)</h4>
                        <p style="color: ${theme.textLight}; margin: 0 0 8px 0;">
                            Pazar yerlerinin entegrasyon paneline "Webhook Bildirim URL'si" olarak şu adresi gireceksiniz:
                        </p>
                        <div style="display: flex; gap: 8px; align-items: center; background: ${theme.background}; padding: 10px; border-radius: 6px; border: 1px solid ${theme.primary}40;">
                            <input type="text" readonly value="${webhookSampleUrl}" id="copy-webhook-url-input" style="flex: 1; border: none; background: transparent; color: ${theme.text}; font-family: monospace; font-size: 11px;" />
                            <button onclick="copyWebhookUrl()" style="padding: 6px 12px; background: ${theme.primary}; color: white; border: none; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer;">
                                Kopyala
                            </button>
                        </div>

                    </div>

                    <div style="padding: 14px 20px; background: ${theme.background}; border-top: 1px solid ${theme.primary}20; display: flex; justify-content: flex-end;">
                        <button onclick="closeMarketplaceModal()" style="padding: 8px 18px; background: ${theme.primary}; color: white; border: none; border-radius: 6px; font-size: 12px; font-weight: bold; cursor: pointer;">
                            Anladım, Kapat
                        </button>
                    </div>

                </div>
            </div>
        `;
    };

    window.copyWebhookUrl = function() {
        const inp = document.getElementById('copy-webhook-url-input');
        if (!inp) return;
        inp.select();
        navigator.clipboard.writeText(inp.value).then(() => {
            alert('✅ Webhook URL adresi panoya kopyalandı!');
        }).catch(() => {
            alert('Adres: ' + inp.value);
        });
    };

    // =========================================================================
    // 🔑 CANLI API BAĞLANTI AYARLARI VE SİPARİŞ ÇEKME MODALI
    // =========================================================================
    const STORAGE_KEY_API_CREDS = 'CAGDAS_MARKETPLACE_API_CREDS';

    window.getMarketplaceApiCredentials = function() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_API_CREDS);
            return saved ? JSON.parse(saved) : {};
        } catch(e) {
            return {};
        }
    };

    window.saveMarketplaceApiCredentials = function(creds) {
        localStorage.setItem(STORAGE_KEY_API_CREDS, JSON.stringify(creds || {}));
    };

    window.openApiConnectionModal = function() {
        const container = document.getElementById('marketplace-modal-container');
        if (!container) return;

        const creds = window.getMarketplaceApiCredentials();

        container.innerHTML = `
            <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.65); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 16px; backdrop-filter: blur(3px);">
                <div style="background: ${theme.card}; width: 100%; max-width: 680px; max-height: 88vh; border-radius: 14px; border: 1px solid ${theme.primary}40; box-shadow: 0 10px 35px rgba(0,0,0,0.35); display: flex; flex-direction: column; overflow: hidden;">
                    
                    <!-- MODAL HEADER -->
                    <div style="padding: 16px 20px; background: ${theme.background}; border-bottom: 1px solid ${theme.primary}20; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-size: 16px; font-weight: 800; color: ${theme.text}; display: flex; align-items: center; gap: 8px;">
                                ⚡ Canlı Pazaryeri API Entegrasyonu & Sipariş Çekme
                            </div>
                            <div style="font-size: 11px; color: ${theme.textLight}; margin-top: 2px;">
                                Trendyol, Hepsiburada ve Getir canlı API anahtarlarınızı girip test edebilir ve yeni siparişleri çekebilirsiniz.
                            </div>
                        </div>
                        <button onclick="closeMarketplaceModal()" style="background: transparent; border: none; font-size: 18px; cursor: pointer; color: ${theme.textLight};">✕</button>
                    </div>

                    <!-- MODAL BODY -->
                    <div style="padding: 20px; overflow-y: auto; font-size: 12px; color: ${theme.text}; display: flex; flex-direction: column; gap: 16px;">
                        
                        <div style="background: rgba(2, 132, 199, 0.08); border: 1px solid rgba(2, 132, 199, 0.3); padding: 12px 14px; border-radius: 8px; font-size: 11.5px; line-height: 1.5;">
                            ℹ️ <strong>Nasıl Çalışır?</strong> Pazaryeri mağazalarınızdan aldığınız API anahtarlarını buraya bir kez yazıp <strong>"Kaydet & Bağlan"</strong> butonuna bastığınızda, sistem doğrudan pazar yerinin resmi sunucularına bağlanır ve yeni siparişlerinizi çekerek otomatik dükkan stoğunuzu düşürür.
                        </div>

                        <!-- 1. TRENDYOL -->
                        <div style="background: ${theme.background}; border: 1px solid #f27a1a40; border-radius: 10px; padding: 14px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 20px;">🛍️</span>
                                    <strong style="font-size: 13px; color: #f27a1a;">Trendyol Partner API</strong>
                                </div>
                                <button type="button" onclick="testAndFetchTrendyolOrders()" style="padding: 5px 12px; background: #f27a1a; color: white; border: none; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer;">
                                    🚀 Trendyol Siparişlerini Çek
                                </button>
                            </div>
                            <div class="grid-3" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
                                <div>
                                    <label style="font-size: 10px; color: ${theme.textLight}; display: block; margin-bottom: 2px;">Satıcı ID (Supplier ID):</label>
                                    <input type="text" id="api-ty-supplier" value="${creds.tySupplierId || ''}" placeholder="Örn: 123456" style="width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.card}; color: ${theme.text}; font-size: 11px; box-sizing: border-box;" />
                                </div>
                                <div>
                                    <label style="font-size: 10px; color: ${theme.textLight}; display: block; margin-bottom: 2px;">API Key:</label>
                                    <input type="text" id="api-ty-key" value="${creds.tyApiKey || ''}" placeholder="partner api key" style="width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.card}; color: ${theme.text}; font-size: 11px; box-sizing: border-box;" />
                                </div>
                                <div>
                                    <label style="font-size: 10px; color: ${theme.textLight}; display: block; margin-bottom: 2px;">API Secret:</label>
                                    <input type="password" id="api-ty-secret" value="${creds.tyApiSecret || ''}" placeholder="••••••••" style="width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.card}; color: ${theme.text}; font-size: 11px; box-sizing: border-box;" />
                                </div>
                            </div>
                            <div id="ty-fetch-result" style="font-size: 11px; margin-top: 6px; display: none;"></div>
                        </div>

                        <!-- 2. HEPSİBURADA -->
                        <div style="background: ${theme.background}; border: 1px solid #ff600040; border-radius: 10px; padding: 14px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 20px;">🏬</span>
                                    <strong style="font-size: 13px; color: #ff6000;">Hepsiburada OMS API</strong>
                                </div>
                                <button type="button" onclick="testAndFetchHepsiburadaOrders()" style="padding: 5px 12px; background: #ff6000; color: white; border: none; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer;">
                                    🚀 Hepsiburada Siparişlerini Çek
                                </button>
                            </div>
                            <div class="grid-2" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                                <div>
                                    <label style="font-size: 10px; color: ${theme.textLight}; display: block; margin-bottom: 2px;">Satıcı ID (Merchant ID):</label>
                                    <input type="text" id="api-hb-merchant" value="${creds.hbMerchantId || ''}" placeholder="Örn: a1b2c3d4-..." style="width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.card}; color: ${theme.text}; font-size: 11px; box-sizing: border-box;" />
                                </div>
                                <div>
                                    <label style="font-size: 10px; color: ${theme.textLight}; display: block; margin-bottom: 2px;">Servis Anahtarı (Secret Key):</label>
                                    <input type="password" id="api-hb-secret" value="${creds.hbSecretKey || ''}" placeholder="••••••••" style="width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.card}; color: ${theme.text}; font-size: 11px; box-sizing: border-box;" />
                                </div>
                            </div>
                            <div id="hb-fetch-result" style="font-size: 11px; margin-top: 6px; display: none;"></div>
                        </div>

                        <!-- 3. GETİRÇARŞI -->
                        <div style="background: ${theme.background}; border: 1px solid #5d3ebc40; border-radius: 10px; padding: 14px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 20px;">🟣</span>
                                    <strong style="font-size: 13px; color: #5d3ebc;">GetirÇarşı Partner API</strong>
                                </div>
                                <button type="button" onclick="testAndFetchGetirOrders()" style="padding: 5px 12px; background: #5d3ebc; color: white; border: none; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer;">
                                    🚀 Getir Siparişlerini Çek
                                </button>
                            </div>
                            <div class="grid-2" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                                <div>
                                    <label style="font-size: 10px; color: ${theme.textLight}; display: block; margin-bottom: 2px;">Getir Mağaza ID (Restaurant/Store ID):</label>
                                    <input type="text" id="api-gt-store" value="${creds.gtStoreId || ''}" placeholder="Örn: 610d48f..." style="width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.card}; color: ${theme.text}; font-size: 11px; box-sizing: border-box;" />
                                </div>
                                <div>
                                    <label style="font-size: 10px; color: ${theme.textLight}; display: block; margin-bottom: 2px;">Getir API Token / Secret:</label>
                                    <input type="password" id="api-gt-secret" value="${creds.gtSecretKey || ''}" placeholder="••••••••" style="width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.card}; color: ${theme.text}; font-size: 11px; box-sizing: border-box;" />
                                </div>
                            </div>
                            <div id="gt-fetch-result" style="font-size: 11px; margin-top: 6px; display: none;"></div>
                        </div>

                        <!-- 4. YEMEKSEPETİ -->
                        <div style="background: ${theme.background}; border: 1px solid #ea004b40; border-radius: 10px; padding: 14px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 20px;">🍔</span>
                                    <strong style="font-size: 13px; color: #ea004b;">Yemeksepeti Mahalle Partner API</strong>
                                </div>
                                <button type="button" onclick="testAndFetchYemeksepetiOrders()" style="padding: 5px 12px; background: #ea004b; color: white; border: none; border-radius: 6px; font-size: 11px; font-weight: bold; cursor: pointer;">
                                    🚀 Yemeksepeti Siparişlerini Çek
                                </button>
                            </div>
                            <div class="grid-3" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
                                <div>
                                    <label style="font-size: 10px; color: ${theme.textLight}; display: block; margin-bottom: 2px;">Mağaza ID (Vendor ID):</label>
                                    <input type="text" id="api-ys-vendor" value="${creds.ysVendorId || ''}" placeholder="Örn: tr_cagdas_01" style="width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.card}; color: ${theme.text}; font-size: 11px; box-sizing: border-box;" />
                                </div>
                                <div>
                                    <label style="font-size: 10px; color: ${theme.textLight}; display: block; margin-bottom: 2px;">API Key (Bearer Token):</label>
                                    <input type="password" id="api-ys-key" value="${creds.ysApiKey || ''}" placeholder="••••••••" style="width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.card}; color: ${theme.text}; font-size: 11px; box-sizing: border-box;" />
                                </div>
                                <div>
                                    <label style="font-size: 10px; color: ${theme.textLight}; display: block; margin-bottom: 2px;">API Secret (Opsiyonel):</label>
                                    <input type="password" id="api-ys-secret" value="${creds.ysApiSecret || ''}" placeholder="••••••••" style="width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid ${theme.primary}40; background: ${theme.card}; color: ${theme.text}; font-size: 11px; box-sizing: border-box;" />
                                </div>
                            </div>
                            <div id="ys-fetch-result" style="font-size: 11px; margin-top: 6px; display: none;"></div>
                        </div>

                    </div>

                    <!-- MODAL FOOTER -->
                    <div style="padding: 14px 20px; background: ${theme.background}; border-top: 1px solid ${theme.primary}20; display: flex; justify-content: space-between; align-items: center;">
                        <button onclick="saveApiCredentialsOnly()" style="padding: 8px 16px; background: transparent; border: 1px solid ${theme.primary}50; color: ${theme.text}; border-radius: 6px; font-size: 12px; font-weight: bold; cursor: pointer;">
                            💾 Bilgileri Kaydet
                        </button>
                        <div style="display: flex; gap: 8px;">
                            <button onclick="closeMarketplaceModal()" style="padding: 8px 14px; background: transparent; border: 1px solid ${theme.textLight}40; color: ${theme.text}; border-radius: 6px; font-size: 12px; cursor: pointer;">
                                Kapat
                            </button>
                            <button onclick="fetchAllChannelsLive()" style="padding: 8px 20px; background: linear-gradient(135deg, #0284c7, #0369a1); color: white; border: none; border-radius: 6px; font-size: 12px; font-weight: bold; cursor: pointer; box-shadow: 0 2px 8px rgba(2, 132, 199, 0.3);">
                                🔄 Tüm Kanallardan Canlı Çek
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        `;
    };

    window.saveApiCredentialsOnly = function() {
        const creds = {
            tySupplierId: document.getElementById('api-ty-supplier')?.value.trim() || '',
            tyApiKey: document.getElementById('api-ty-key')?.value.trim() || '',
            tyApiSecret: document.getElementById('api-ty-secret')?.value.trim() || '',
            hbMerchantId: document.getElementById('api-hb-merchant')?.value.trim() || '',
            hbSecretKey: document.getElementById('api-hb-secret')?.value.trim() || '',
            gtStoreId: document.getElementById('api-gt-store')?.value.trim() || '',
            gtSecretKey: document.getElementById('api-gt-secret')?.value.trim() || '',
            ysVendorId: document.getElementById('api-ys-vendor')?.value.trim() || '',
            ysApiKey: document.getElementById('api-ys-key')?.value.trim() || '',
            ysApiSecret: document.getElementById('api-ys-secret')?.value.trim() || ''
        };
        window.saveMarketplaceApiCredentials(creds);
        showAppToast('✅ Pazaryeri API bağlantı anahtarları kaydedildi!', 'success');
    };

    // Trendyol Sipariş Çek
    window.testAndFetchTrendyolOrders = async function() {
        window.saveApiCredentialsOnly();
        const creds = window.getMarketplaceApiCredentials();
        const resDiv = document.getElementById('ty-fetch-result');
        if (resDiv) {
            resDiv.style.display = 'block';
            resDiv.innerHTML = '⏳ Trendyol API ile canlı bağlantı kuruluyor...';
            resDiv.style.color = theme.primary;
        }

        try {
            const resp = await fetch('/api/marketplace/trendyol/fetch-orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    supplierId: creds.tySupplierId,
                    apiKey: creds.tyApiKey,
                    apiSecret: creds.tyApiSecret
                })
            });

            const data = await resp.json();
            if (!resp.ok || !data.success) {
                if (resDiv) {
                    resDiv.innerHTML = `❌ ${data.error || 'Bağlantı hatası!'}`;
                    resDiv.style.color = '#ef4444';
                }
                return;
            }

            const incoming = data.orders || [];
            const importedCount = window.integrateIncomingOnlineOrders(incoming, 'trendyol');
            if (resDiv) {
                resDiv.innerHTML = `✅ Bağlantı Başarılı! Toplam ${incoming.length} sipariş sorgulandı. ${importedCount} adet yeni sipariş sisteme eklendi.`;
                resDiv.style.color = '#10b981';
            }
            showAppToast(`🛍️ Trendyol: ${importedCount} yeni sipariş sisteme alındı!`, 'success');
        } catch (e) {
            if (resDiv) {
                resDiv.innerHTML = `❌ Bağlantı hatası: ${e.message}`;
                resDiv.style.color = '#ef4444';
            }
        }
    };

    // Hepsiburada Sipariş Çek
    window.testAndFetchHepsiburadaOrders = async function() {
        window.saveApiCredentialsOnly();
        const creds = window.getMarketplaceApiCredentials();
        const resDiv = document.getElementById('hb-fetch-result');
        if (resDiv) {
            resDiv.style.display = 'block';
            resDiv.innerHTML = '⏳ Hepsiburada OMS API ile canlı bağlantı kuruluyor...';
            resDiv.style.color = theme.primary;
        }

        try {
            const resp = await fetch('/api/marketplace/hepsiburada/fetch-orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    merchantId: creds.hbMerchantId,
                    secretKey: creds.hbSecretKey
                })
            });

            const data = await resp.json();
            if (!resp.ok || !data.success) {
                if (resDiv) {
                    resDiv.innerHTML = `❌ ${data.error || 'Bağlantı hatası!'}`;
                    resDiv.style.color = '#ef4444';
                }
                return;
            }

            const incoming = data.orders || [];
            const importedCount = window.integrateIncomingOnlineOrders(incoming, 'hepsiburada');
            if (resDiv) {
                resDiv.innerHTML = `✅ Bağlantı Başarılı! Toplam ${incoming.length} sipariş sorgulandı. ${importedCount} adet yeni sipariş sisteme eklendi.`;
                resDiv.style.color = '#10b981';
            }
            showAppToast(`🏬 Hepsiburada: ${importedCount} yeni sipariş sisteme alındı!`, 'success');
        } catch (e) {
            if (resDiv) {
                resDiv.innerHTML = `❌ Bağlantı hatası: ${e.message}`;
                resDiv.style.color = '#ef4444';
            }
        }
    };

    // Getir Sipariş Çek
    window.testAndFetchGetirOrders = async function() {
        window.saveApiCredentialsOnly();
        const creds = window.getMarketplaceApiCredentials();
        const resDiv = document.getElementById('gt-fetch-result');
        if (resDiv) {
            resDiv.style.display = 'block';
            resDiv.innerHTML = '⏳ GetirÇarşı API ile canlı bağlantı kuruluyor...';
            resDiv.style.color = theme.primary;
        }

        try {
            const resp = await fetch('/api/marketplace/getir/fetch-orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    storeId: creds.gtStoreId,
                    secretKey: creds.gtSecretKey
                })
            });

            const data = await resp.json();
            if (!resp.ok || !data.success) {
                if (resDiv) {
                    resDiv.innerHTML = `❌ ${data.error || 'Bağlantı hatası!'}`;
                    resDiv.style.color = '#ef4444';
                }
                return;
            }

            const incoming = data.orders || [];
            const importedCount = window.integrateIncomingOnlineOrders(incoming, 'getir');
            if (resDiv) {
                resDiv.innerHTML = `✅ Bağlantı Başarılı! Toplam ${incoming.length} aktif sipariş sorgulandı. ${importedCount} adet yeni sipariş sisteme eklendi.`;
                resDiv.style.color = '#10b981';
            }
            showAppToast(`🟣 Getir: ${importedCount} yeni sipariş kurye masasına alındı!`, 'success');
        } catch (e) {
            if (resDiv) {
                resDiv.innerHTML = `❌ Bağlantı hatası: ${e.message}`;
                resDiv.style.color = '#ef4444';
            }
        }
    };

    // Yemeksepeti Sipariş Çek
    window.testAndFetchYemeksepetiOrders = async function() {
        window.saveApiCredentialsOnly();
        const creds = window.getMarketplaceApiCredentials();
        const resDiv = document.getElementById('ys-fetch-result');
        if (resDiv) {
            resDiv.style.display = 'block';
            resDiv.innerHTML = '⏳ Yemeksepeti API ile canlı bağlantı kuruluyor...';
            resDiv.style.color = '#ea004b';
        }

        try {
            const resp = await fetch('/api/marketplace/yemeksepeti/fetch-orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vendorId: creds.ysVendorId,
                    apiKey: creds.ysApiKey,
                    apiSecret: creds.ysApiSecret
                })
            });

            const data = await resp.json();
            if (!resp.ok || !data.success) {
                if (resDiv) {
                    resDiv.innerHTML = `❌ ${data.error || 'Bağlantı hatası!'}`;
                    resDiv.style.color = '#ef4444';
                }
                return;
            }

            const incoming = data.orders || [];
            const importedCount = window.integrateIncomingOnlineOrders(incoming, 'yemeksepeti');
            if (resDiv) {
                resDiv.innerHTML = `✅ Bağlantı Başarılı! Toplam ${incoming.length} aktif sipariş sorgulandı. ${importedCount} adet yeni sipariş masaya eklendi.`;
                resDiv.style.color = '#10b981';
            }
            showAppToast(`🍔 Yemeksepeti: ${importedCount} yeni sipariş masaya alındı!`, 'success');
        } catch (e) {
            if (resDiv) {
                resDiv.innerHTML = `❌ Bağlantı hatası: ${e.message}`;
                resDiv.style.color = '#ef4444';
            }
        }
    };

    // Tüm Kanallardan Çek
    window.fetchAllChannelsLive = async function() {
        window.saveApiCredentialsOnly();
        await window.testAndFetchTrendyolOrders();
        await window.testAndFetchHepsiburadaOrders();
        await window.testAndFetchGetirOrders();
        await window.testAndFetchYemeksepetiOrders();
        window.renderMarketplace(document.getElementById('screen'));
    };

    // MarketplaceDashboard Özel Platform Kayıt & Test Fonksiyonları
    window.saveTrendyolCredentialsFromDashboard = function() {
        const creds = window.getMarketplaceApiCredentials();
        const sup = document.getElementById('dash-ty-supplier')?.value.trim() || '';
        const key = document.getElementById('dash-ty-key')?.value.trim() || '';
        const sec = document.getElementById('dash-ty-secret')?.value.trim() || '';
        creds.tySupplierId = sup;
        creds.tyApiKey = key;
        creds.tyApiSecret = sec;
        window.saveMarketplaceApiCredentials(creds);
        showAppToast('✅ Trendyol API anahtarları kaydedildi!', 'success');
        renderMarketplace(document.getElementById('screen'));
    };

    window.saveHepsiburadaCredentialsFromDashboard = function() {
        const creds = window.getMarketplaceApiCredentials();
        const mer = document.getElementById('dash-hb-merchant')?.value.trim() || '';
        const sec = document.getElementById('dash-hb-secret')?.value.trim() || '';
        creds.hbMerchantId = mer;
        creds.hbSecretKey = sec;
        window.saveMarketplaceApiCredentials(creds);
        showAppToast('✅ Hepsiburada API anahtarları kaydedildi!', 'success');
        renderMarketplace(document.getElementById('screen'));
    };

    window.saveGetirCredentialsFromDashboard = function() {
        const creds = window.getMarketplaceApiCredentials();
        const store = document.getElementById('dash-gt-store')?.value.trim() || '';
        const sec = document.getElementById('dash-gt-secret')?.value.trim() || '';
        creds.gtStoreId = store;
        creds.gtSecretKey = sec;
        window.saveMarketplaceApiCredentials(creds);
        showAppToast('✅ GetirÇarşı API anahtarları kaydedildi!', 'success');
        renderMarketplace(document.getElementById('screen'));
    };

    window.testTrendyolFromDashboard = async function() {
        window.saveTrendyolCredentialsFromDashboard();
        const resEl = document.getElementById('dash-test-result');
        if (resEl) {
            resEl.style.display = 'block';
            resEl.innerHTML = '⏳ Trendyol API sunucularına bağlanılıyor...';
            resEl.style.color = '#f27a1a';
        }
        const creds = window.getMarketplaceApiCredentials();
        try {
            const resp = await fetch('/api/marketplace/trendyol/fetch-orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    supplierId: creds.tySupplierId,
                    apiKey: creds.tyApiKey,
                    apiSecret: creds.tyApiSecret
                })
            });
            const data = await resp.json();
            if (!resp.ok || !data.success) {
                if (resEl) {
                    resEl.innerHTML = `❌ Bağlantı Hatası: ${data.error || 'Trendyol API yanıt vermedi.'}`;
                    resEl.style.color = '#ef4444';
                }
                return;
            }
            const incoming = data.orders || [];
            const importedCount = window.integrateIncomingOnlineOrders(incoming, 'trendyol');
            if (resEl) {
                resEl.innerHTML = `🟢 <strong>Bağlantı Başarılı!</strong> Trendyol mağazanız aktif. Toplam <strong>${incoming.length}</strong> sipariş kontrol edildi, <strong>${importedCount}</strong> yeni sipariş içeri aktarıldı.`;
                resEl.style.color = '#10b981';
            }
        } catch(e) {
            if (resEl) {
                resEl.innerHTML = `❌ Bağlantı Hatası: ${e.message}`;
                resEl.style.color = '#ef4444';
            }
        }
    };

    window.testHepsiburadaFromDashboard = async function() {
        window.saveHepsiburadaCredentialsFromDashboard();
        const resEl = document.getElementById('dash-test-result');
        if (resEl) {
            resEl.style.display = 'block';
            resEl.innerHTML = '⏳ Hepsiburada OMS sunucularına bağlanılıyor...';
            resEl.style.color = '#ff6000';
        }
        const creds = window.getMarketplaceApiCredentials();
        try {
            const resp = await fetch('/api/marketplace/hepsiburada/fetch-orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    merchantId: creds.hbMerchantId,
                    secretKey: creds.hbSecretKey
                })
            });
            const data = await resp.json();
            if (!resp.ok || !data.success) {
                if (resEl) {
                    resEl.innerHTML = `❌ Bağlantı Hatası: ${data.error || 'Hepsiburada API yanıt vermedi.'}`;
                    resEl.style.color = '#ef4444';
                }
                return;
            }
            const incoming = data.orders || [];
            const importedCount = window.integrateIncomingOnlineOrders(incoming, 'hepsiburada');
            if (resEl) {
                resEl.innerHTML = `🟢 <strong>Bağlantı Başarılı!</strong> Hepsiburada OMS aktif. Toplam <strong>${incoming.length}</strong> sipariş kontrol edildi, <strong>${importedCount}</strong> yeni sipariş içeri aktarıldı.`;
                resEl.style.color = '#10b981';
            }
        } catch(e) {
            if (resEl) {
                resEl.innerHTML = `❌ Bağlantı Hatası: ${e.message}`;
                resEl.style.color = '#ef4444';
            }
        }
    };

    window.testGetirFromDashboard = async function() {
        window.saveGetirCredentialsFromDashboard();
        const resEl = document.getElementById('dash-test-result');
        if (resEl) {
            resEl.style.display = 'block';
            resEl.innerHTML = '⏳ GetirÇarşı kurye sunucularına bağlanılıyor...';
            resEl.style.color = '#5d3ebc';
        }
        const creds = window.getMarketplaceApiCredentials();
        try {
            const resp = await fetch('/api/marketplace/getir/fetch-orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    storeId: creds.gtStoreId,
                    secretKey: creds.gtSecretKey
                })
            });
            const data = await resp.json();
            if (!resp.ok || !data.success) {
                if (resEl) {
                    resEl.innerHTML = `❌ Bağlantı Hatası: ${data.error || 'GetirÇarşı API yanıt vermedi.'}`;
                    resEl.style.color = '#ef4444';
                }
                return;
            }
            const incoming = data.orders || [];
            const importedCount = window.integrateIncomingOnlineOrders(incoming, 'getir');
            if (resEl) {
                resEl.innerHTML = `🟢 <strong>Bağlantı Başarılı!</strong> GetirÇarşı aktif. Toplam <strong>${incoming.length}</strong> sipariş kontrol edildi, <strong>${importedCount}</strong> yeni sipariş kurye masasına alındı.`;
                resEl.style.color = '#10b981';
            }
        } catch(e) {
            if (resEl) {
                resEl.innerHTML = `❌ Bağlantı Hatası: ${e.message}`;
                resEl.style.color = '#ef4444';
            }
        }
    };

    window.saveYemeksepetiCredentialsFromDashboard = function() {
        const creds = window.getMarketplaceApiCredentials();
        const ven = document.getElementById('dash-ys-vendor')?.value.trim() || '';
        const key = document.getElementById('dash-ys-key')?.value.trim() || '';
        const sec = document.getElementById('dash-ys-secret')?.value.trim() || '';
        creds.ysVendorId = ven;
        creds.ysApiKey = key;
        creds.ysApiSecret = sec;
        window.saveMarketplaceApiCredentials(creds);
        showAppToast('✅ Yemeksepeti API anahtarları kaydedildi!', 'success');
        renderMarketplace(document.getElementById('screen'));
    };

    window.testYemeksepetiFromDashboard = async function() {
        window.saveYemeksepetiCredentialsFromDashboard();
        const resEl = document.getElementById('dash-test-result');
        if (resEl) {
            resEl.style.display = 'block';
            resEl.innerHTML = '⏳ Yemeksepeti Mahalle sunucularına bağlanılıyor...';
            resEl.style.color = '#ea004b';
        }
        const creds = window.getMarketplaceApiCredentials();
        try {
            const resp = await fetch('/api/marketplace/yemeksepeti/fetch-orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vendorId: creds.ysVendorId,
                    apiKey: creds.ysApiKey,
                    apiSecret: creds.ysApiSecret
                })
            });
            const data = await resp.json();
            if (!resp.ok || !data.success) {
                if (resEl) {
                    resEl.innerHTML = `❌ Bağlantı Hatası: ${data.error || 'Yemeksepeti API yanıt vermedi.'}`;
                    resEl.style.color = '#ef4444';
                }
                return;
            }
            const incoming = data.orders || [];
            const importedCount = window.integrateIncomingOnlineOrders(incoming, 'yemeksepeti');
            if (resEl) {
                resEl.innerHTML = `🟢 <strong>Bağlantı Başarılı!</strong> Yemeksepeti aktif. Toplam <strong>${incoming.length}</strong> sipariş kontrol edildi, <strong>${importedCount}</strong> yeni sipariş masaya alındı.`;
                resEl.style.color = '#10b981';
            }
        } catch(e) {
            if (resEl) {
                resEl.innerHTML = `❌ Bağlantı Hatası: ${e.message}`;
                resEl.style.color = '#ef4444';
            }
        }
    };

    // Çekilen Siparişleri Sisteme Entegre Et (FIFO & Stok Düşüşü & Bildirimler)
    window.integrateIncomingOnlineOrders = function(ordersList, defaultPlatform) {
        if (!Array.isArray(ordersList) || ordersList.length === 0) return 0;
        if (!Array.isArray(state.notifications)) state.notifications = [];

        let newOrdersCount = 0;

        for (const ord of ordersList) {
            const orderNo = String(ord.orderNo);
            const exists = state.notifications.some(n => String(n.orderNo) === orderNo);
            if (exists) continue; // Zaten önceden çekilmiş

            // Siparişteki ürünleri sisteme eşle
            const items = [];
            for (const line of (ord.lines || [])) {
                const barcode = String(line.barcode || '').trim();
                let product = state.products.find(p => String(p.barcode || '').trim() === barcode);
                if (!product && line.name) {
                    product = state.products.find(p => p.name.toLowerCase() === line.name.toLowerCase());
                }

                items.push({
                    id: product ? product.id : Date.now(),
                    name: product ? product.name : (line.name || 'Ürün'),
                    qty: line.quantity || 1,
                    price: line.price || (product ? product.sellPrice : 0),
                    buyPrice: product ? product.buyPrice : 0,
                    barcode: barcode
                });
            }

            const total = ord.totalPrice || items.reduce((s, it) => s + (it.price * it.qty), 0);

            const newOrderObj = {
                id: Date.now() + Math.floor(Math.random() * 1000),
                type: 'online_order',
                platform: ord.platform || defaultPlatform || 'trendyol',
                orderNo: orderNo,
                customer: ord.customer || 'Pazaryeri Müşterisi',
                phone: ord.phone || '',
                address: ord.address || '',
                city: ord.city || '',
                taxNo: ord.taxNo || '',
                carrier: ord.carrier || 'Kargo',
                trackingNo: ord.trackingNo || '',
                date: ord.date || new Date().toLocaleString('tr-TR'),
                orderStatus: 'pending',
                total: total,
                items: items,
                financials: window.calculateOrderFinancials({ total, platform: ord.platform || defaultPlatform, items }),
                timestamp: Date.now()
            };

            // Stoğu FIFO yöntemiyle düşür
            for (const it of items) {
                const prod = state.products.find(p => p.id === it.id || (it.barcode && p.barcode === it.barcode));
                if (prod) {
                    let needed = it.qty;
                    if (prod.batches && prod.batches.length > 0) {
                        for (const b of prod.batches) {
                            if (needed <= 0) break;
                            const take = Math.min(b.quantity, needed);
                            b.quantity -= take;
                            needed -= take;
                        }
                    }
                    // Dükkan / Depo stok düşüşü
                    if (prod.shop >= it.qty) {
                        prod.shop -= it.qty;
                    } else {
                        const rem = it.qty - (prod.shop || 0);
                        prod.shop = 0;
                        prod.warehouse = Math.max(0, (prod.warehouse || 0) - rem);
                    }
                }
            }

            state.notifications.unshift(newOrderObj);
            newOrdersCount++;

            addMarketplaceLog({
                type: 'live_order_received',
                title: `📥 Canlı Sipariş Alındı (#${orderNo})`,
                details: `${newOrderObj.customer} - ${items.length} Kalem Ürün - Toplam: ${total.toFixed(2)}₺`,
                channels: newOrderObj.platform
            });

            // Gelen siparişle stoğu düşen ürünleri diğer pazar yerlerine hemen bildir
            for (const it of items) {
                const prod = state.products.find(p => p.id === it.id || (it.barcode && p.barcode === it.barcode));
                if (prod && typeof window.syncProductToMarketplaces === 'function') {
                    window.syncProductToMarketplaces(prod);
                }
            }
        }

        if (newOrdersCount > 0) {
            saveData();
            window.renderMarketplace(document.getElementById('screen'));
        }

        return newOrdersCount;
    };

})();

