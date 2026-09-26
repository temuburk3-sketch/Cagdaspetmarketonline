// ========== CORE STATE & DATA ENGINE ==========
        // ========== STATE ==========
        var state = {
            screen: 'login',
            user: null,
            users: [
                { id: 1, username: 'admin', password: 'admin123', role: 'admin', name: 'Yönetici', email: 'admin@cagdas.com', phone: '05001234567' },
                { id: 2, username: 'kasa1', password: 'kasa123', role: 'cashier', name: 'Kasa', email: 'kasa@cagdas.com', phone: '05002345678' }
            ],
            categories: {
                products: ['Mama', 'Oyuncak', 'Aksesuar', 'İlaç', 'Hijyen', 'Kıyafet'],
                customers: ['Normal', 'VIP', 'Toptan', 'Veteriner'],
                expenses: ['Kira', 'Elektrik', 'Su', 'Pazarlama', 'Personel', 'Taşıma', 'Diğer'],
                returns: ['Arızalı Ürün', 'Müşteri Memnuniyetsizliği', 'Yanlış Ürün', 'Diğer']
            },
            categoryEmojis: {
                'Mama': '🍖',
                'Oyuncak': '🎾',
                'Aksesuar': '🧴',
                'İlaç': '💊',
                'Hijyen': '🧼',
                'Kıyafet': '👕',
                'Normal': '👤',
                'VIP': '👑',
                'Toptan': '📦',
                'Veteriner': '🐾',
                'Kira': '🏠',
                'Elektrik': '⚡',
                'Su': '💧',
                'Pazarlama': '📢',
                'Personel': '👨‍💼',
                'Taşıma': '🚚',
                'Diğer': '📌',
                'Arızalı Ürün': '❌',
                'Müşteri Memnuniyetsizliği': '😞',
                'Yanlış Ürün': '🔄',
            },
            products: [
                { id: 1, name: 'Köpek Maması 10kg', sku: '2026-12-31', barcode: '8680000000001', category: 'Mama', buyPrice: 150, sellPrice: 250, shop: 20, warehouse: 50, emoji: '🐕', image64: null, stockLots: [], criticalLimit: 5 },
                { id: 2, name: 'Kedi Konservesi 400g', sku: '2027-04-15', barcode: '8680000000002', category: 'Mama', buyPrice: 20, sellPrice: 45, shop: 3, warehouse: 30, emoji: '🐈', image64: null, stockLots: [], criticalLimit: 5 },
                { id: 3, name: 'Köpek Oyuncağı', sku: '', barcode: '8680000000003', category: 'Oyuncak', buyPrice: 30, sellPrice: 60, shop: 10, warehouse: 25, emoji: '🎾', image64: null, stockLots: [], criticalLimit: 5 }
            ],
            customers: [],
            suppliers: [],
            sales: [],
            expenses: [],
            returns: [],
            cart: [],
            debts: [],
            stockLog: [],
            cashLog: [],
            notifications: [],
            auditLog: [],
            settings: {
                safetyBuffer: 1
            },
            store: {
                name: 'ÇAĞDAŞ PET MARKET VE AKVARYUM DÜNYASI',
                taxOffice: 'Kadıköy Vergi Dairesi',
                taxNumber: '1234567890',
                address: 'Bağdat Caddesi No: 124/A Kadıköy / İSTANBUL',
                phone: '0216 345 67 89',
                mobile: '0532 123 45 67',
                email: 'info@cagdaspetmarket.com',
                mersis: '0123456789000001',
                web: 'www.cagdaspetmarket.com'
            },
            users: [
                { id: 1, username: 'admin', password: 'admin123', role: 'admin', name: 'Yönetici', email: 'admin@cagdas.com', phone: '05001234567', status: 'active' },
                { id: 2, username: 'kasa1', password: 'kasa123', role: 'cashier', name: 'Kasa 1', email: 'kasa@cagdas.com', phone: '05002345678', status: 'active' }
            ]
        };

        // Load data
        try {
            const saved = localStorage.getItem('cagdas');
            if (saved) Object.assign(state, JSON.parse(saved));
        } catch(e) {}

        // Store profile fallback & normalization
        if (!state.store || !state.store.name) {
            state.store = {
                name: 'ÇAĞDAŞ PET MARKET VE AKVARYUM DÜNYASI',
                taxOffice: 'Kadıköy Vergi Dairesi',
                taxNumber: '1234567890',
                address: 'Bağdat Caddesi No: 124/A Kadıköy / İSTANBUL',
                phone: '0216 345 67 89',
                mobile: '0532 123 45 67',
                email: 'info@cagdaspetmarket.com',
                mersis: '0123456789000001',
                web: 'www.cagdaspetmarket.com'
            };
        }
        if (!state.settings) {
            state.settings = { safetyBuffer: 1 };
        } else if (state.settings.safetyBuffer === undefined) {
            state.settings.safetyBuffer = 1;
        }

        window.getStoreProfile = function() {
            return state.store;
        };

        window.saveStoreProfile = function(updatedProfile) {
            if (!state.store) state.store = {};
            Object.assign(state.store, updatedProfile);
            try {
                localStorage.setItem('cagdas_store_profile', JSON.stringify(state.store));
            } catch(e) {}
            saveData(true);
        };

        window.state = state;

        var _saveDebounceTimer = null;

        function saveData(immediate = false) {
            window.state = state;
            
            if (immediate) {
                if (_saveDebounceTimer) {
                    clearTimeout(_saveDebounceTimer);
                    _saveDebounceTimer = null;
                }
                try { localStorage.setItem('cagdas', JSON.stringify(state)); } catch(e) {}
                if (typeof window.syncStateToCloud === 'function') {
                    window.syncStateToCloud(true);
                }
                return;
            }

            if (_saveDebounceTimer) clearTimeout(_saveDebounceTimer);
            _saveDebounceTimer = setTimeout(() => {
                _saveDebounceTimer = null;
                try { localStorage.setItem('cagdas', JSON.stringify(state)); } catch(e) {}
                if (typeof window.syncStateToCloud === 'function') {
                    window.syncStateToCloud(false);
                }
            }, 150);
        }
        window.saveData = saveData;
        window.saveDataImmediate = () => saveData(true);

        // Guard against corrupted/incompatible saved data breaking list rendering
        ['products', 'customers', 'suppliers', 'sales', 'expenses', 'returns', 'cart', 'debts', 'stockLog', 'cashLog', 'notifications', 'users'].forEach(key => {
            if (!Array.isArray(state[key])) state[key] = [];
        });
        if (state.users.length === 0) {
            state.users = [
                { id: 1, username: 'admin', password: 'admin123', role: 'admin', name: 'Yönetici', email: 'admin@cagdas.com', phone: '05001234567', status: 'active' },
                { id: 2, username: 'kasa1', password: 'kasa123', role: 'cashier', name: 'Kasa 1', email: 'kasa@cagdas.com', phone: '05002345678', status: 'active' }
            ];
        }

        // Kullanıcı nesnelerini standartlaştırma helper'ı
        function normalizeUsersList() {
            if (!Array.isArray(state.users)) state.users = [];
            state.users.forEach((u, i) => {
                if (!u.id) u.id = Date.now() + i;
                if (!u.username) u.username = (u.name || ('user' + u.id)).toLowerCase().replace(/\s+/g, '');
                if (!u.name) u.name = u.username;
                if (!u.role) u.role = 'cashier';
                if (!u.password) u.password = '123456';
                if (!u.status) u.status = 'active';
            });
        }
        window.normalizeUsersList = normalizeUsersList;
        normalizeUsersList();

        // Aynı Alış, Satış Fiyatına ve SKT'ye Sahip Stok Partilerini Birleştirme Helper'ı
        function mergeIdenticalStockLots(product) {
            if (!product || !Array.isArray(product.stockLots) || product.stockLots.length <= 1) return;

            const merged = [];
            product.stockLots.forEach(lot => {
                const bp = (parseFloat(lot.buyPrice) > 0) ? parseFloat(lot.buyPrice) : (parseFloat(product.buyPrice) || 0);
                const sp = (parseFloat(lot.sellPrice) > 0) ? parseFloat(lot.sellPrice) : (parseFloat(product.sellPrice) || 0);
                const qty = parseFloat(lot.quantity) || 0;
                const initQty = (parseFloat(lot.initialQuantity) > 0) ? parseFloat(lot.initialQuantity) : qty;
                const lotSku = (lot.sku || product.sku || '').trim();

                if (qty <= 0) return;

                // Hem fiyatlar hem de SKT (son kullanma tarihi) aynı ise birleştir; SKT farklıysa partiyi ayır!
                const existing = merged.find(m => 
                    Math.abs((parseFloat(m.buyPrice) || 0) - bp) < 0.01 && 
                    Math.abs((parseFloat(m.sellPrice) || 0) - sp) < 0.01 &&
                    ((m.sku || '').trim() === lotSku)
                );

                if (existing) {
                    existing.quantity = (parseFloat(existing.quantity) || 0) + qty;
                    existing.initialQuantity = (parseFloat(existing.initialQuantity) || 0) + initQty;
                } else {
                    merged.push({
                        id: lot.id || ('lot-' + Date.now() + '-' + Math.floor(Math.random() * 1000)),
                        buyPrice: bp,
                        sellPrice: sp,
                        quantity: qty,
                        initialQuantity: initQty,
                        sku: lotSku,
                        date: lot.date || 'İlk Stok'
                    });
                }
            });
            product.stockLots = merged;
        }

        // FIFO: Stok partilerini Son Kullanma Tarihi (SKT) ve Giriş Tarihine göre sırala
        // En yakın SKT'li parti en başa gelir, böylece satışta ilk o parti tüketilir
        function sortStockLotsFIFO(product) {
            if (!product || !Array.isArray(product.stockLots) || product.stockLots.length <= 1) return;

            product.stockLots.sort((a, b) => {
                const aSku = (a.sku || product.sku || '').trim();
                const bSku = (b.sku || product.sku || '').trim();

                // Eğer iki partinin de SKT'si varsa en yakın tarih önce gelsin
                if (aSku && bSku) {
                    const dateA = new Date(aSku);
                    const dateB = new Date(bSku);
                    if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
                        return dateA.getTime() - dateB.getTime();
                    }
                }
                // SKT'si olan parti SKT'si olmayandan önce gelsin
                if (aSku && !bSku) return -1;
                if (!aSku && bSku) return 1;

                // SKT aynı veya yoksa ID/Giriş sırasına göre stabil FIFO
                return (a.id || '').localeCompare(b.id || '');
            });
        }
        window.sortStockLotsFIFO = sortStockLotsFIFO;

        // Aynı Alış ve Satış Fiyatına Sahip Ürün ve Partileri Birleştirme
        function mergeIdenticalProducts() {
            let mergedProductsCount = 0;
            let mergedLotsCount = 0;

            // 1. Her ürünün parti stoklarındaki aynı fiyatlı partileri birleştir
            state.products.forEach(p => {
                if (!Array.isArray(p.stockLots)) p.stockLots = [];
                const prevCount = p.stockLots.length;
                mergeIdenticalStockLots(p);
                const newCount = p.stockLots.length;
                if (prevCount > newCount) {
                    mergedLotsCount += (prevCount - newCount);
                }
            });

            // 2. Aynı ad/barkod ve aynı alış/satış fiyatına sahip mükerrer ürün kartlarını birleştir
            const uniqueProductsMap = [];

            for (let i = 0; i < state.products.length; i++) {
                const p = state.products[i];
                ensureStockLots(p);

                const pName = (p.name || '').trim().toLowerCase();
                const pBarcode = (p.barcode || '').trim();
                const pBuy = parseFloat(p.buyPrice) || 0;
                const pSell = parseFloat(p.sellPrice) || 0;

                const match = uniqueProductsMap.find(u => {
                    const samePrices = Math.abs((parseFloat(u.buyPrice) || 0) - pBuy) < 0.01 && Math.abs((parseFloat(u.sellPrice) || 0) - pSell) < 0.01;
                    const sameName = pName && (u.name || '').trim().toLowerCase() === pName;
                    const sameBarcode = pBarcode && (u.barcode || '').trim() === pBarcode;
                    return samePrices && (sameName || sameBarcode);
                });

                if (match) {
                    match.shop = (parseFloat(match.shop) || 0) + (parseFloat(p.shop) || 0);
                    match.warehouse = (parseFloat(match.warehouse) || 0) + (parseFloat(p.warehouse) || 0);

                    if (Array.isArray(p.stockLots)) {
                        match.stockLots = (match.stockLots || []).concat(p.stockLots);
                        mergeIdenticalStockLots(match);
                    }

                    mergedProductsCount++;
                } else {
                    uniqueProductsMap.push(p);
                }
            }

            state.products = uniqueProductsMap;
            saveData();

            return { mergedProductsCount, mergedLotsCount };
        }

        // FIFO Stok Partisi Garanti Helper'ı
        function ensureStockLots(product) {
            if (!product) return;
            if (!Array.isArray(product.stockLots)) product.stockLots = [];

            product.shop = parseFloat(product.shop) || 0;
            product.warehouse = parseFloat(product.warehouse) || 0;
            product.buyPrice = parseFloat(product.buyPrice) || 0;
            product.sellPrice = parseFloat(product.sellPrice) || 0;

            const totalStock = product.shop + product.warehouse;

            // Eğer fiziki stok 0 veya altındaysa tüm partileri temizle
            if (totalStock <= 0) {
                product.stockLots = [];
                return;
            }

            // Partilerdeki geçersiz veya 0 olan alış/satış fiyatlarını ve SKT'leri düzelt
            product.stockLots.forEach(lot => {
                if (!lot.buyPrice || parseFloat(lot.buyPrice) <= 0) {
                    lot.buyPrice = product.buyPrice;
                }
                if (!lot.sellPrice || parseFloat(lot.sellPrice) <= 0) {
                    lot.sellPrice = product.sellPrice;
                }
                if (!lot.sku && product.sku) {
                    lot.sku = product.sku;
                }
            });

            // Eğer parti listesi boş ama fiziki stok varsa, ilk parti olarak ekle
            if (product.stockLots.length === 0 && totalStock > 0) {
                product.stockLots.push({
                    id: 'lot-init-' + (product.id || Date.now()),
                    buyPrice: product.buyPrice,
                    sellPrice: product.sellPrice,
                    quantity: totalStock,
                    initialQuantity: totalStock,
                    sku: product.sku || '',
                    date: 'İlk Stok'
                });
            } else if (product.stockLots.length > 0) {
                // Parti stokları toplamını kontrol et
                const sumLots = product.stockLots.reduce((s, lot) => s + (parseFloat(lot.quantity) || 0), 0);
                if (totalStock > sumLots) {
                    // Fiziki stok parti toplamından fazlaysa aradaki fark kadar yeni parti oluştur
                    const diff = totalStock - sumLots;
                    product.stockLots.push({
                        id: 'lot-adj-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
                        buyPrice: product.buyPrice,
                        sellPrice: product.sellPrice,
                        quantity: diff,
                        initialQuantity: diff,
                        sku: product.sku || '',
                        date: new Date().toLocaleString('tr-TR')
                    });
                } else if (totalStock < sumLots) {
                    // Fiziki stok parti toplamından azsa en son partilerden fazlalığı buda
                    let toRemove = sumLots - totalStock;
                    for (let i = product.stockLots.length - 1; i >= 0 && toRemove > 0; i--) {
                        let lot = product.stockLots[i];
                        let removeAmount = Math.min(parseFloat(lot.quantity) || 0, toRemove);
                        lot.quantity = (parseFloat(lot.quantity) || 0) - removeAmount;
                        toRemove -= removeAmount;
                        if (lot.quantity <= 0) {
                            product.stockLots.splice(i, 1);
                        }
                    }
                }
            }
            mergeIdenticalStockLots(product);
            sortStockLotsFIFO(product);
        }

        // FIFO Doğrultusunda Partilerden ve Dükkan/Depo Stoklarından Düşüş Yapıcı
        function deductFifoQuantity(product, quantityToDeduct) {
            if (!product || quantityToDeduct <= 0) return { deducted: 0, costTotal: 0, consumedLots: [] };
            
            ensureStockLots(product);
            sortStockLotsFIFO(product);

            let remaining = parseFloat(quantityToDeduct) || 0;
            let totalCost = 0;
            const consumedLots = [];

            // 1. Partilerden en eski / en yakın SKT'li partiden başlayarak düş
            if (Array.isArray(product.stockLots)) {
                for (let i = 0; i < product.stockLots.length && remaining > 0; i++) {
                    const lot = product.stockLots[i];
                    const lotQty = parseFloat(lot.quantity) || 0;
                    if (lotQty <= 0) continue;

                    const take = Math.min(lotQty, remaining);
                    const lotBuyPrice = (parseFloat(lot.buyPrice) > 0) ? parseFloat(lot.buyPrice) : (parseFloat(product.buyPrice) || 0);

                    lot.quantity = lotQty - take;
                    remaining -= take;
                    totalCost += (take * lotBuyPrice);

                    consumedLots.push({
                        lotId: lot.id,
                        sku: lot.sku || product.sku || '',
                        quantity: take,
                        buyPrice: lotBuyPrice
                    });
                }
                // Sıfırlanan partileri temizle
                product.stockLots = product.stockLots.filter(l => (parseFloat(l.quantity) || 0) > 0);
            }

            // 2. Fiziki stoktan düşüş (Önce dükkan, yetmezse depodan)
            const actualDeducted = (parseFloat(quantityToDeduct) || 0) - remaining;
            const targetQty = parseFloat(quantityToDeduct) || 0;
            
            const currentShop = parseFloat(product.shop) || 0;
            const fromShop = Math.min(targetQty, currentShop);
            const fromWarehouse = Math.max(0, targetQty - fromShop);

            product.shop = Math.max(0, currentShop - fromShop);
            product.warehouse = Math.max(0, (parseFloat(product.warehouse) || 0) - fromWarehouse);

            // Eğer partiler yetersiz kaldıysa geri kalan miktarın maliyetini ürünün ana alış fiyatından hesapla
            if (remaining > 0) {
                totalCost += (remaining * (parseFloat(product.buyPrice) || 0));
            }

            ensureStockLots(product);
            return {
                deducted: targetQty,
                costTotal: totalCost,
                consumedLots: consumedLots,
                remainingShop: product.shop,
                remainingWarehouse: product.warehouse
            };
        }

        // Yüklenen ürünlerde FIFO stok partilerini garantiye al ve birleştir
        state.products.forEach(p => ensureStockLots(p));
        mergeIdenticalProducts();

        window.quickStockTransferModal = function(id) {
            const p = state.products.find(x => x.id === id);
            if (!p) {
                alert("⚠️ Ürün bulunamadı!");
                return;
            }
            const currentShop = parseFloat(p.shop) || 0;
            const currentWarehouse = parseFloat(p.warehouse) || 0;

            const amountStr = prompt(
                `⚡ HIZLI STOK TRANSFERİ (Depo ➡️ Dükkan)\n\nÜrün: "${p.name}"\nMevcut Dükkan Stoğu: ${currentShop} Adet\nMevcut Depo Stoğu: ${currentWarehouse} Adet\n\nDepo'dan Dükkan'a kaç adet transfer edilsin?`,
                "5"
            );

            if (amountStr === null) return;
            const amount = parseFloat(amountStr);

            if (isNaN(amount) || amount <= 0) {
                alert("⚠️ Geçersiz miktar girdiniz!");
                return;
            }

            if (currentWarehouse < amount) {
                const confirmOver = confirm(
                    `⚠️ Depodaki miktar (${currentWarehouse} Adet) transfer edilmek istenen miktardan (${amount} Adet) az.\n\nYine de dükkan stoğuna ${amount} adet eklensin mi?`
                );
                if (!confirmOver) return;
            }

            p.shop = currentShop + amount;
            if (currentWarehouse >= amount) {
                p.warehouse = currentWarehouse - amount;
            } else {
                p.warehouse = 0;
            }

            if (!Array.isArray(state.stockLog)) state.stockLog = [];
            state.stockLog.push({
                id: Date.now(),
                productName: p.name,
                quantity: amount,
                type: 'in',
                date: new Date().toLocaleString('tr-TR'),
                user: (state.user && state.user.name) ? state.user.name : 'Sistem',
                note: `⚡ Hızlı Transfer (Depo ➡️ Dükkan)`
            });

            saveData();
            if (typeof renderScreen === 'function') {
                renderScreen();
            }
            alert(`✅ "${p.name}" dükkan stoğu ${p.shop} adete yükseltildi!`);
        };

        // ========== TARİH DÖNÜŞTÜRÜCÜ HELPER ==========
        function parseToYYYYMMDD(dateVal) {
            if (!dateVal) return null;

            // Sayısal timestamp veya string timestamp (örn: 1785000000000)
            if (typeof dateVal === 'number' || (/^\d+$/.test(String(dateVal).trim()) && String(dateVal).trim().length >= 10)) {
                const d = new Date(Number(dateVal));
                if (!isNaN(d.getTime())) {
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    return `${y}-${m}-${day}`;
                }
            }

            const str = String(dateVal).trim();

            // ISO formatı YYYY-MM-DD veya YYYY/MM/DD
            const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
            if (isoMatch) {
                const y = isoMatch[1];
                const m = isoMatch[2].padStart(2, '0');
                const d = isoMatch[3].padStart(2, '0');
                return `${y}-${m}-${d}`;
            }

            // Türkçe/Avrupa formatı DD.MM.YYYY veya DD/MM/YYYY (örn: "26.07.2026 09:59:23", "26.07.2026, 09:59:23")
            const trMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
            if (trMatch) {
                const d = trMatch[1].padStart(2, '0');
                const m = trMatch[2].padStart(2, '0');
                const y = trMatch[3];
                return `${y}-${m}-${d}`;
            }

            // Genel JS Date parsing yedek
            const parsedDate = new Date(str);
            if (!isNaN(parsedDate.getTime())) {
                const y = parsedDate.getFullYear();
                const m = String(parsedDate.getMonth() + 1).padStart(2, '0');
                const d = String(parsedDate.getDate()).padStart(2, '0');
                return `${y}-${m}-${d}`;
            }

            return null;
        }

        // ========== RENDER ==========

function renderEmojiOrImage(categoryName, size = '20px') {
    if (!window.state || !window.state.categoryEmojis) return `<span style="font-size: ${size};">📌</span>`;
    const value = window.state.categoryEmojis[categoryName] || '📌';
    if (typeof value === 'string' && value.startsWith('data:image')) {
        return `<img src="${value}" style="width: ${size}; height: ${size}; border-radius: 4px; object-fit: cover; display: inline-block;" title="${categoryName}" />`;
    }
    return `<span style="font-size: ${size};">${value}</span>`;
}

// Export State globals
if (typeof window !== 'undefined') {
    window.state = state;
    window.saveData = saveData;
    window.saveState = saveData;
    window.deductFifoQuantity = deductFifoQuantity;
    window.ensureStockLots = ensureStockLots;
    window.renderEmojiOrImage = renderEmojiOrImage;
}
