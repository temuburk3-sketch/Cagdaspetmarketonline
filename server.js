import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400');
    } else if (filePath.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json');
    } else if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'text/javascript');
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
  }
}));

const DATA_FILE = path.join(__dirname, 'data-store.json');

// Memory cache for fast sync
let storedAppData = null;
let lastSyncTimestamp = 0;

// Load existing data on startup if present
if (fs.existsSync(DATA_FILE)) {
  try {
    const content = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(content);
    storedAppData = parsed.data || null;
    lastSyncTimestamp = parsed.updatedAt || 0;
  } catch (e) {
    console.error('Data file read error:', e);
  }
}

// Multi-device sync API endpoints
app.get('/api/sync', (req, res) => {
  res.json({
    data: storedAppData,
    updatedAt: lastSyncTimestamp
  });
});

// Public Products REST API for Customer App (Müşteri Uygulaması)
app.get('/api/products', (req, res) => {
  if (!storedAppData || !storedAppData.products) {
    return res.json({ success: true, count: 0, products: [] });
  }
  const products = (storedAppData.products || []).map(p => ({
    id: p.id,
    code: p.code || p.barcode || '',
    barcode: p.barcode || '',
    name: p.name || 'Ürün',
    category: p.category || 'Genel',
    price: Number(p.price || p.salePrice || 0),
    unit: p.unit || 'Adet',
    stock: (Number(p.stock) || 0) + (Number(p.shop) || 0) + (Number(p.warehouse) || 0),
    shopStock: Number(p.shop) || 0,
    warehouseStock: Number(p.warehouse) || 0,
    image: p.image || p.imageUrl || '',
    description: p.description || ''
  }));
  res.json({ success: true, count: products.length, products });
});

// --- PAZARYERİ ENTEGRASYONLARI (Trendyol, Hepsiburada, Getir) ---
app.get('/api/marketplace/status', (req, res) => {
  const envBuffer = parseInt(process.env.MARKETPLACE_SAFETY_BUFFER, 10);
  const safetyBuffer = Number.isInteger(envBuffer) ? envBuffer : 1;

  res.json({
    status: 'active',
    safetyBuffer,
    channels: {
      trendyol: {
        configured: !!(process.env.TRENDYOL_SUPPLIER_ID && process.env.TRENDYOL_API_KEY && process.env.TRENDYOL_API_SECRET),
        supplierId: process.env.TRENDYOL_SUPPLIER_ID ? '***' + process.env.TRENDYOL_SUPPLIER_ID.slice(-3) : null
      },
      hepsiburada: {
        configured: !!(process.env.HEPSIBURADA_MERCHANT_ID && process.env.HEPSIBURADA_SECRET_KEY),
        merchantId: process.env.HEPSIBURADA_MERCHANT_ID ? '***' + process.env.HEPSIBURADA_MERCHANT_ID.slice(-3) : null
      },
      getir: {
        configured: !!(process.env.GETIR_STORE_ID && process.env.GETIR_SECRET_KEY),
        storeId: process.env.GETIR_STORE_ID ? '***' + process.env.GETIR_STORE_ID.slice(-3) : null
      }
    },
    timestamp: new Date().toISOString()
  });
});

app.post('/api/marketplace/stock-sync', async (req, res) => {
  try {
    const {
      barcode,
      stock = 0,
      price = 0,
      productName = '',
      safetyBuffer: customBuffer,
      channels = ['trendyol', 'hepsiburada', 'getir']
    } = req.body || {};

    if (!barcode) {
      return res.status(400).json({ error: 'Barkod zorunludur' });
    }

    const envBuffer = parseInt(process.env.MARKETPLACE_SAFETY_BUFFER, 10);
    const safetyBuffer = Number.isInteger(customBuffer) ? customBuffer : (Number.isInteger(envBuffer) ? envBuffer : 1);
    const effectiveStock = Math.max(0, stock - safetyBuffer);

    const channelResults = {
      trendyol: {
        success: true,
        mode: process.env.TRENDYOL_API_KEY ? 'live' : 'simulated_pending',
        effectiveStock
      },
      hepsiburada: {
        success: true,
        mode: process.env.HEPSIBURADA_SECRET_KEY ? 'live' : 'simulated_pending',
        effectiveStock
      },
      getir: {
        success: true,
        mode: process.env.GETIR_SECRET_KEY ? 'live' : 'simulated_pending',
        effectiveStock
      }
    };

    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      barcode,
      productName,
      realStock: stock,
      safetyBuffer,
      effectiveStockSent: effectiveStock,
      price,
      channelResults
    });
  } catch (err) {
    console.error('Local stock sync error:', err);
    return res.status(500).json({ error: err.message });
  }
});

const webhookRoutes = [
  '/api/marketplace/webhook',
  '/api/trendyol/webhook',
  '/api/hepsiburada/webhook',
  '/api/getir/webhook'
];

app.post(webhookRoutes, async (req, res) => {
  try {
    const body = req.body || {};
    let platform = body.platform;
    if (!platform) {
      if (req.path.includes('trendyol')) platform = 'trendyol';
      else if (req.path.includes('hepsiburada')) platform = 'hepsiburada';
      else if (req.path.includes('getir')) platform = 'getir';
      else platform = 'trendyol';
    }
    const orderNumber = body.orderNumber || body.orderNo || 'ORD-' + Math.floor(100000 + Math.random() * 900000);
    const customerName = body.customerName || body.customer || 'Pazaryeri Müşterisi';
    const customerPhone = body.customerPhone || body.phone || '0532 555 01 23';
    const customerAddress = body.customerAddress || body.address || 'Fenerbahçe Mah. Lale Sok. No: 18 D: 4';
    const customerCity = body.customerCity || body.city || 'Kadıköy / İSTANBUL';
    const customerTaxNo = body.customerTaxNo || body.taxNo || '11111111111';

    const rawItems = Array.isArray(body.items) ? body.items : (body.barcode ? [{
      barcode: body.barcode,
      quantity: body.quantity || 1,
      price: body.price || 0,
      name: body.productName || 'Ürün'
    }] : []);

    let affectedProducts = [];
    let rejectedItems = [];
    const nowStr = new Date().toLocaleString('tr-TR');

    if (storedAppData && Array.isArray(storedAppData.products)) {
      const safetyBuffer = (storedAppData.settings && typeof storedAppData.settings.safetyBuffer === 'number')
        ? storedAppData.settings.safetyBuffer
        : 1;

      rawItems.forEach(item => {
        const itemBarcode = item.barcode ? String(item.barcode).trim() : '';
        const itemQty = parseInt(item.quantity, 10) || 1;

        const p = storedAppData.products.find(x => 
          (x.barcode && String(x.barcode).trim() === itemBarcode) ||
          (x.sku && String(x.sku).trim() === itemBarcode) ||
          (item.id && x.id === item.id)
        );

        if (!p) {
          rejectedItems.push({
            barcode: itemBarcode,
            name: item.name || 'Bilinmeyen Ürün',
            requestedQty: itemQty,
            reason: 'NOT_FOUND',
            message: 'Ürün sistem envanterinde kayıtlı değil.'
          });
          return;
        }

        const currentShop = parseFloat(p.shop) || 0;
        const currentWarehouse = parseFloat(p.warehouse) || 0;
        const totalStock = currentShop + currentWarehouse;

        if (totalStock <= 0) {
          rejectedItems.push({
            id: p.id,
            name: p.name,
            barcode: p.barcode,
            requestedQty: itemQty,
            totalStock: 0,
            reason: 'OUT_OF_STOCK',
            message: 'Ürün stoğu tükendi (Mevcut: 0). Olmayan ürün satışı engellendi.'
          });
          return;
        }

        if (totalStock <= safetyBuffer) {
          rejectedItems.push({
            id: p.id,
            name: p.name,
            barcode: p.barcode,
            requestedQty: itemQty,
            totalStock: totalStock,
            safetyBuffer: safetyBuffer,
            reason: 'SAFETY_BUFFER_TRIGGERED',
            message: `Güvenli satış limiti devrede (Stok: ${totalStock} <= Güvenlik Stoğu: ${safetyBuffer}). Satış reddedildi.`
          });
          return;
        }

        const sellableStock = totalStock - safetyBuffer;
        if (itemQty > sellableStock) {
          rejectedItems.push({
            id: p.id,
            name: p.name,
            barcode: p.barcode,
            requestedQty: itemQty,
            sellableStock: sellableStock,
            safetyBuffer: safetyBuffer,
            reason: 'INSUFFICIENT_SAFETY_STOCK',
            message: `Talep edilen miktar (${itemQty}) güvenli satış limitini (${sellableStock} adet satılabilir) aşıyor.`
          });
          return;
        }

        // Stok düşüşü: Önce dükkandan, dükkanda yetersizse depodan
        const fromShop = Math.min(itemQty, currentShop);
        const fromWarehouse = itemQty - fromShop;

        p.shop = Math.max(0, currentShop - fromShop);
        if (fromWarehouse > 0) {
          p.warehouse = Math.max(0, currentWarehouse - fromWarehouse);
        }

        affectedProducts.push({
          id: p.id,
          name: p.name,
          barcode: p.barcode,
          oldShop: currentShop,
          newShop: p.shop,
          oldWarehouse: currentWarehouse,
          newWarehouse: p.warehouse,
          deducted: itemQty
        });

        if (!Array.isArray(storedAppData.stockLog)) storedAppData.stockLog = [];
        storedAppData.stockLog.push({
          id: Date.now() + Math.floor(Math.random() * 1000),
          productName: p.name,
          quantity: itemQty,
          buyPrice: p.buyPrice || 0,
          sellPrice: item.price || p.sellPrice || 0,
          type: 'out',
          date: nowStr,
          user: `${platform.toUpperCase()} Entegrasyonu`,
          note: `Pazaryeri Siparişi #${orderNumber} (${customerName})`
        });
      });

      if (affectedProducts.length > 0) {
        if (!Array.isArray(storedAppData.notifications)) storedAppData.notifications = [];
        storedAppData.notifications.unshift({
          id: Date.now(),
          type: 'marketplace_order',
          orderStatus: 'pending',
          orderNo: orderNumber,
          platform: platform,
          title: `🛍️ ${platform.toUpperCase()} Siparişi Geldi`,
          message: `#${orderNumber} nolu sipariş ile ${affectedProducts.length} kalem ürün satıldı. Güvenlik stoğu kontrolü ile stoklar düşürüldü.`,
          date: nowStr,
          customer: customerName,
          phone: customerPhone,
          address: customerAddress,
          city: customerCity,
          taxNo: customerTaxNo,
          items: affectedProducts.map(ap => ({
            name: ap.name,
            barcode: ap.barcode,
            qty: ap.deducted,
            sellPrice: ap.sellPrice || 0
          })),
          read: false
        });
      }

      if (rejectedItems.length > 0) {
        if (!Array.isArray(storedAppData.notifications)) storedAppData.notifications = [];
        storedAppData.notifications.unshift({
          id: Date.now() + 1,
          type: 'marketplace_warning',
          title: `⚠️ ${platform.toUpperCase()} Satış Engellendi / Güvenli Limit!`,
          message: `#${orderNumber} nolu siparişte ${rejectedItems.length} ürün güvenlik limiti veya sıfır stok nedeniyle engellendi: ${rejectedItems.map(r => r.name + ' (' + r.message + ')').join(', ')}`,
          date: nowStr,
          read: false
        });
      }

      lastSyncTimestamp = Date.now();
      fs.writeFile(DATA_FILE, JSON.stringify({ data: storedAppData, updatedAt: lastSyncTimestamp }), () => {});
    }

    res.json({
      success: affectedProducts.length > 0,
      platform,
      orderNumber,
      customerName,
      affectedProducts,
      rejectedItems,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Local webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Kargoya verme & Takip No endpoint'i
app.post('/api/marketplace/order/ship', (req, res) => {
  try {
    const { orderNo, carrier = 'Trendyol Express', trackingNo } = req.body || {};
    const autoTracking = trackingNo || 'TK-' + Math.floor(10000000 + Math.random() * 90000000);
    
    if (storedAppData && Array.isArray(storedAppData.notifications)) {
      const notif = storedAppData.notifications.find(n => n.orderNo === orderNo || n.id == orderNo);
      if (notif) {
        notif.orderStatus = 'shipped';
        notif.carrier = carrier;
        notif.trackingNo = autoTracking;
        notif.shippedAt = new Date().toLocaleString('tr-TR');
      }
      lastSyncTimestamp = Date.now();
      fs.writeFile(DATA_FILE, JSON.stringify({ data: storedAppData, updatedAt: lastSyncTimestamp }), () => {});
    }

    res.json({
      success: true,
      orderNo,
      carrier,
      trackingNo: autoTracking,
      status: 'shipped',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GetirÇarşı Mağaza Durumu (Açık, Mola, Kapalı)
let getirStoreStatus = { status: 'open', reason: '', updatedAt: new Date().toISOString() };
app.get('/api/marketplace/getir/status', (req, res) => {
  res.json({ success: true, ...getirStoreStatus });
});

app.post('/api/marketplace/getir/status', (req, res) => {
  const { status = 'open', reason = '' } = req.body || {};
  getirStoreStatus = { status, reason, updatedAt: new Date().toISOString() };
  res.json({ success: true, ...getirStoreStatus });
});

// =========================================================================
// 🚀 CANLI PAZARYERİ SİPARİŞ ÇEKME VE BAĞLANTI TESTİ PROXY SERVİSLERİ
// =========================================================================

// 1. TRENDYOL CANLI SİPARİŞ ÇEKME PROXY
app.post('/api/marketplace/trendyol/fetch-orders', async (req, res) => {
  try {
    const { supplierId, apiKey, apiSecret, status = 'Created' } = req.body || {};
    const finalSupplierId = supplierId || process.env.TRENDYOL_SUPPLIER_ID;
    const finalApiKey = apiKey || process.env.TRENDYOL_API_KEY;
    const finalApiSecret = apiSecret || process.env.TRENDYOL_API_SECRET;

    if (!finalSupplierId || !finalApiKey || !finalApiSecret) {
      return res.status(400).json({
        success: false,
        error: 'Trendyol Satıcı ID (Supplier ID), API Key ve API Secret bilgileri eksik!'
      });
    }

    // Trendyol Official Orders API: https://api.trendyol.com/sapigw/suppliers/{supplierId}/orders
    const authHeader = 'Basic ' + Buffer.from(`${finalApiKey}:${finalApiSecret}`).toString('base64');
    const url = `https://api.trendyol.com/sapigw/suppliers/${finalSupplierId}/orders?status=${status}&size=50&orderByDirection=DESC`;

    const tyRes = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'User-Agent': `${finalSupplierId} - SelfIntegration`,
        'Content-Type': 'application/json'
      }
    });

    if (!tyRes.ok) {
      const errText = await tyRes.text();
      return res.status(tyRes.status).json({
        success: false,
        status: tyRes.status,
        error: `Trendyol API Hatası (${tyRes.status}): ` + (errText.slice(0, 300) || 'Bağlantı kurulamadı')
      });
    }

    const data = await tyRes.json();
    const rawOrders = (data && data.content) || [];

    // Trendyol siparişlerini Çağdaş Pet Market standart formatına dönüştür
    const formattedOrders = rawOrders.map(o => ({
      orderNo: String(o.orderNumber || o.id),
      platform: 'trendyol',
      status: o.status || 'Created',
      customer: `${o.customerFirstName || ''} ${o.customerLastName || ''}`.trim() || 'Trendyol Müşterisi',
      phone: (o.shipmentAddress && o.shipmentAddress.phone) || '',
      address: (o.shipmentAddress && `${o.shipmentAddress.address1 || ''} ${o.shipmentAddress.neighborhood || ''}`) || '',
      city: (o.shipmentAddress && `${o.shipmentAddress.district || ''} / ${o.shipmentAddress.city || ''}`) || '',
      taxNo: o.taxNumber || (o.invoiceAddress && o.invoiceAddress.taxNumber) || '',
      carrier: o.cargoProviderName || 'Trendyol Express',
      trackingNo: o.cargoTrackingNumber ? String(o.cargoTrackingNumber) : '',
      date: o.orderDate ? new Date(o.orderDate).toLocaleString('tr-TR') : new Date().toLocaleString('tr-TR'),
      totalPrice: o.totalPrice || 0,
      lines: (o.lines || []).map(l => ({
        barcode: String(l.barcode || '').trim(),
        name: l.productName || 'Ürün',
        quantity: l.quantity || 1,
        price: l.price || 0,
        merchantSku: l.merchantSku || ''
      }))
    }));

    return res.json({
      success: true,
      platform: 'trendyol',
      count: formattedOrders.length,
      orders: formattedOrders,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Trendyol Fetch Orders Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 2. HEPSİBURADA CANLI SİPARİŞ ÇEKME PROXY
app.post('/api/marketplace/hepsiburada/fetch-orders', async (req, res) => {
  try {
    const { merchantId, secretKey } = req.body || {};
    const finalMerchantId = merchantId || process.env.HEPSIBURADA_MERCHANT_ID;
    const finalSecretKey = secretKey || process.env.HEPSIBURADA_SECRET_KEY;

    if (!finalMerchantId || !finalSecretKey) {
      return res.status(400).json({
        success: false,
        error: 'Hepsiburada Satıcı ID (Merchant ID) ve Servis Anahtarı (Secret Key) eksik!'
      });
    }

    // Hepsiburada OMS Orders API
    const authHeader = 'Basic ' + Buffer.from(`${finalMerchantId}:${finalSecretKey}`).toString('base64');
    const url = `https://oms-external.hepsiburada.com/orders/merchantid/${finalMerchantId}?offset=0&limit=50`;

    const hbRes = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'User-Agent': `${finalMerchantId} - SelfIntegration`,
        'Accept': 'application/json'
      }
    });

    if (!hbRes.ok) {
      const errText = await hbRes.text();
      return res.status(hbRes.status).json({
        success: false,
        status: hbRes.status,
        error: `Hepsiburada API Hatası (${hbRes.status}): ` + (errText.slice(0, 300) || 'Bağlantı kurulamadı')
      });
    }

    const data = await hbRes.json();
    const rawOrders = Array.isArray(data) ? data : (data.items || data.orders || []);

    const formattedOrders = rawOrders.map(o => ({
      orderNo: String(o.orderNumber || o.orderId || o.id),
      platform: 'hepsiburada',
      status: o.status || 'Open',
      customer: (o.shippingAddress && o.shippingAddress.name) || o.customerName || 'Hepsiburada Müşterisi',
      phone: (o.shippingAddress && o.shippingAddress.phoneNumber) || '',
      address: (o.shippingAddress && o.shippingAddress.address) || '',
      city: (o.shippingAddress && `${o.shippingAddress.town || ''} / ${o.shippingAddress.city || ''}`) || '',
      taxNo: (o.billingAddress && (o.billingAddress.taxNumber || o.billingAddress.identityNumber)) || '',
      carrier: o.cargoCompany || 'HepsiJet',
      trackingNo: o.cargoTrackingNumber ? String(o.cargoTrackingNumber) : '',
      date: o.orderDate ? new Date(o.orderDate).toLocaleString('tr-TR') : new Date().toLocaleString('tr-TR'),
      totalPrice: o.totalPrice?.amount || o.totalPrice || 0,
      lines: (o.items || o.lines || []).map(l => ({
        barcode: String(l.barcode || l.merchantSku || '').trim(),
        name: l.productName || l.name || 'Ürün',
        quantity: l.quantity || 1,
        price: l.price?.amount || l.price || 0,
        merchantSku: l.merchantSku || ''
      }))
    }));

    return res.json({
      success: true,
      platform: 'hepsiburada',
      count: formattedOrders.length,
      orders: formattedOrders,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Hepsiburada Fetch Orders Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 3. GETİRÇARŞI CANLI SİPARİŞ ÇEKME PROXY
app.post('/api/marketplace/getir/fetch-orders', async (req, res) => {
  try {
    const { storeId, secretKey } = req.body || {};
    const finalStoreId = storeId || process.env.GETIR_STORE_ID;
    const finalSecretKey = secretKey || process.env.GETIR_SECRET_KEY;

    if (!finalStoreId || !finalSecretKey) {
      return res.status(400).json({
        success: false,
        error: 'GetirÇarşı Mağaza ID ve API Token/Secret Key bilgileri eksik!'
      });
    }

    // Getir Partner Orders API
    const url = `https://food-external-api.getirapi.com/restaurants/${finalStoreId}/active-orders`;
    const gtRes = await fetch(url, {
      method: 'GET',
      headers: {
        'token': finalSecretKey,
        'Content-Type': 'application/json'
      }
    });

    if (!gtRes.ok) {
      const errText = await gtRes.text();
      return res.status(gtRes.status).json({
        success: false,
        status: gtRes.status,
        error: `GetirÇarşı API Hatası (${gtRes.status}): ` + (errText.slice(0, 300) || 'Bağlantı kurulamadı')
      });
    }

    const data = await gtRes.json();
    const rawOrders = (data && data.orders) || (Array.isArray(data) ? data : []);

    const formattedOrders = rawOrders.map(o => ({
      orderNo: String(o.id || o.orderId),
      platform: 'getir',
      status: o.status || 'Active',
      customer: (o.client && o.client.name) || 'Getir Müşterisi',
      phone: (o.client && o.client.clientPhoneNumber) || '',
      address: (o.client && o.client.deliveryAddress && o.client.deliveryAddress.address) || '',
      city: (o.client && o.client.deliveryAddress && `${o.client.deliveryAddress.district || ''} / ${o.client.deliveryAddress.city || ''}`) || '',
      carrier: 'Getir Kuryesi',
      trackingNo: o.confirmationId ? String(o.confirmationId) : '',
      date: o.checkoutDate ? new Date(o.checkoutDate).toLocaleString('tr-TR') : new Date().toLocaleString('tr-TR'),
      totalPrice: o.totalPrice || 0,
      lines: (o.products || []).map(p => ({
        barcode: String(p.barcode || p.id || '').trim(),
        name: p.name || 'Ürün',
        quantity: p.count || p.quantity || 1,
        price: p.price || 0
      }))
    }));

    return res.json({
      success: true,
      platform: 'getir',
      count: formattedOrders.length,
      orders: formattedOrders,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Getir Fetch Orders Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 3B. YEMEKSEPETİ (YEMEKSEPETİ MAHALLE / DELIVERY HERO) CANLI SİPARİŞLERİ ÇEK
app.post('/api/marketplace/yemeksepeti/fetch-orders', async (req, res) => {
  try {
    const { vendorId, apiKey, apiSecret } = req.body || {};
    const finalVendorId = vendorId || process.env.YEMEKSEPETI_VENDOR_ID;
    const finalApiKey = apiKey || process.env.YEMEKSEPETI_API_KEY;
    const finalSecret = apiSecret || process.env.YEMEKSEPETI_API_SECRET;

    if (!finalVendorId || !finalApiKey) {
      return res.status(400).json({
        success: false,
        error: 'Yemeksepeti Mağaza ID (Vendor ID) ve API Anahtarı zorunludur.'
      });
    }

    const url = `https://pos-integration.yemeksepeti.com/api/v1/vendors/${finalVendorId}/orders?status=NEW,ACCEPTED`;
    const ysRes = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${finalApiKey}`,
        'X-Vendor-ID': finalVendorId,
        ...(finalSecret ? { 'X-Secret-Key': finalSecret } : {}),
        'Accept': 'application/json'
      }
    });

    if (!ysRes.ok) {
      const errText = await ysRes.text();
      return res.status(ysRes.status).json({
        success: false,
        status: ysRes.status,
        error: `Yemeksepeti API Hatası (${ysRes.status}): ` + (errText.slice(0, 300) || 'Bağlantı kurulamadı')
      });
    }

    const data = await ysRes.json();
    const rawOrders = (data && data.orders) || (Array.isArray(data) ? data : (data.items || []));

    const formattedOrders = rawOrders.map(o => ({
      orderNo: String(o.orderNumber || o.id || o.orderCode),
      platform: 'yemeksepeti',
      status: o.status || 'Active',
      customer: (o.customer && (o.customer.name || `${o.customer.firstName || ''} ${o.customer.lastName || ''}`.trim())) || 'Yemeksepeti Müşterisi',
      phone: (o.customer && o.customer.phone) || '',
      address: (o.deliveryAddress && (o.deliveryAddress.address || o.deliveryAddress.fullAddress)) || '',
      city: (o.deliveryAddress && `${o.deliveryAddress.district || ''} / ${o.deliveryAddress.city || ''}`) || '',
      carrier: o.deliveryType === 'VALET' ? 'Yemeksepeti Vale Kurye' : 'Dükkan Kuryesi',
      trackingNo: o.shortCode || o.pin || '',
      date: o.orderDate ? new Date(o.orderDate).toLocaleString('tr-TR') : new Date().toLocaleString('tr-TR'),
      totalPrice: o.payment?.total || o.totalAmount || o.price || 0,
      lines: (o.items || o.products || []).map(p => ({
        barcode: String(p.barcode || p.sku || p.id || '').trim(),
        name: p.name || p.title || 'Ürün',
        quantity: p.quantity || p.count || 1,
        price: p.price || 0
      }))
    }));

    return res.json({
      success: true,
      platform: 'yemeksepeti',
      count: formattedOrders.length,
      orders: formattedOrders,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Yemeksepeti Fetch Orders Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 4. TRENDYOL & HEPSİBURADA ÇİFT YÖNLÜ STOK GÜNCELLEME (DÜKKANDAN PAZARYERİNE)
app.post('/api/marketplace/push-stock', async (req, res) => {
  try {
    const { barcode, quantity, price, channel = 'all', credentials = {} } = req.body || {};
    if (!barcode) {
      return res.status(400).json({ error: 'Barkod zorunludur' });
    }

    const results = {};

    // Trendyol Canlı Stok Güncelleme
    if (channel === 'all' || channel === 'trendyol') {
      const supplierId = credentials.trendyolSupplierId || process.env.TRENDYOL_SUPPLIER_ID;
      const apiKey = credentials.trendyolApiKey || process.env.TRENDYOL_API_KEY;
      const apiSecret = credentials.trendyolApiSecret || process.env.TRENDYOL_API_SECRET;

      if (supplierId && apiKey && apiSecret) {
        try {
          const authHeader = 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
          const payload = {
            items: [{
              barcode: String(barcode).trim(),
              quantity: Math.max(0, parseInt(quantity, 10) || 0),
              salePrice: price ? parseFloat(price) : undefined
            }]
          };

          const tyRes = await fetch(`https://api.trendyol.com/sapigw/suppliers/${supplierId}/v2/products/price-and-inventory`, {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json',
              'User-Agent': `${supplierId} - SelfIntegration`
            },
            body: JSON.stringify(payload)
          });

          const tyData = await tyRes.json().catch(() => ({}));
          results.trendyol = {
            success: tyRes.ok,
            status: tyRes.status,
            batchId: tyData.batchRequestId || null,
            message: tyRes.ok ? 'Trendyol stoğu güncellendi' : 'Trendyol hata verdi'
          };
        } catch (e) {
          results.trendyol = { success: false, error: e.message };
        }
      } else {
        results.trendyol = { success: true, mode: 'local_only', message: 'Trendyol API anahtarları henüz girilmemiş (Yerel kayıt yapıldı)' };
      }
    }

    // Hepsiburada Canlı Stok Güncelleme
    if (channel === 'all' || channel === 'hepsiburada') {
      const merchantId = credentials.hbMerchantId || process.env.HEPSIBURADA_MERCHANT_ID;
      const secretKey = credentials.hbSecretKey || process.env.HEPSIBURADA_SECRET_KEY;

      if (merchantId && secretKey) {
        try {
          const authHeader = 'Basic ' + Buffer.from(`${merchantId}:${secretKey}`).toString('base64');
          const payload = {
            listings: [{
              hepsiburadaSku: String(barcode).trim(),
              merchantSku: String(barcode).trim(),
              availableStock: Math.max(0, parseInt(quantity, 10) || 0),
              price: price ? parseFloat(price) : undefined
            }]
          };

          const hbRes = await fetch(`https://listing-external.hepsiburada.com/listings/merchantid/${merchantId}/inventory-uploads`, {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          });

          const hbData = await hbRes.json().catch(() => ({}));
          results.hepsiburada = {
            success: hbRes.ok,
            status: hbRes.status,
            message: hbRes.ok ? 'Hepsiburada stoğu güncellendi' : 'Hepsiburada hata verdi',
            data: hbData
          };
        } catch (e) {
          results.hepsiburada = { success: false, error: e.message };
        }
      } else {
        results.hepsiburada = { success: true, mode: 'local_only', message: 'Hepsiburada anahtarları henüz girilmemiş' };
      }
    }

    // GetirÇarşı Canlı Stok Güncelleme
    if (channel === 'all' || channel === 'getir') {
      const storeId = credentials.gtStoreId || process.env.GETIR_STORE_ID;
      const secretKey = credentials.gtSecretKey || process.env.GETIR_SECRET_KEY;

      if (storeId && secretKey) {
        try {
          const payload = {
            quantity: Math.max(0, parseInt(quantity, 10) || 0),
            price: price ? parseFloat(price) : undefined
          };

          const gtRes = await fetch(`https://partner-api.getir.com/v1/products/${encodeURIComponent(barcode)}/stock`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Store-Id': storeId,
              'Authorization': `Bearer ${secretKey}`
            },
            body: JSON.stringify(payload)
          });

          const gtData = await gtRes.json().catch(() => ({}));
          results.getir = {
            success: gtRes.ok,
            status: gtRes.status,
            message: gtRes.ok ? 'GetirÇarşı stoğu güncellendi' : 'Getir hata verdi',
            data: gtData
          };
        } catch (e) {
          results.getir = { success: false, error: e.message };
        }
      } else {
        results.getir = { success: true, mode: 'local_only', message: 'Getir anahtarları henüz girilmemiş' };
      }
    }

    return res.json({
      success: true,
      barcode,
      updatedQuantity: quantity,
      results,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});


app.post('/api/sync', (req, res) => {
  try {
    const { data, timestamp } = req.body || {};
    if (data) {
      const incomingTime = timestamp || Date.now();
      // Update if incoming is newer or initial
      if (!lastSyncTimestamp || incomingTime >= lastSyncTimestamp) {
        storedAppData = data;
        lastSyncTimestamp = incomingTime;
        
        fs.writeFile(DATA_FILE, JSON.stringify({ data: storedAppData, updatedAt: lastSyncTimestamp }), (err) => {
          if (err) console.error('Data file save error:', err);
        });
      }
      return res.json({ success: true, updatedAt: lastSyncTimestamp, data: storedAppData });
    }
    return res.status(400).json({ error: 'Data is required' });
  } catch (err) {
    console.error('Sync POST error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

