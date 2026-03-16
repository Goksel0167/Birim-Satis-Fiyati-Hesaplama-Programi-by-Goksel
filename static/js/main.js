/**
 * Birim Satış Fiyatı Hesaplayıcı - Frontend JS
 */

// ─── CONSTANTS ────────────────────────────────────────────────────
const CITIES = [
    "Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Aksaray", "Amasya", "Ankara", "Antalya",
    "Ardahan", "Artvin", "Aydın", "Balıkesir", "Bartın", "Batman", "Bayburt", "Bilecik",
    "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum",
    "Denizli", "Diyarbakır", "Düzce", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir",
    "Gaziantep", "Giresun", "Gümüşhane", "Hakkari", "Hatay", "Iğdır", "Isparta", "İstanbul",
    "İzmir", "Kahramanmaraş", "Karabük", "Karaman", "Kars", "Kastamonu", "Kayseri", "Kilis",
    "Kırıkkale", "Kırklareli", "Kırşehir", "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa",
    "Mardin", "Mersin", "Muğla", "Muş", "Nevşehir", "Niğde", "Ordu", "Osmaniye",
    "Rize", "Sakarya", "Samsun", "Şanlıurfa", "Siirt", "Sinop", "Sivas", "Şırnak",
    "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Uşak", "Van", "Yalova", "Yozgat", "Zonguldak"
];

const FACTORY_LABELS = { adana: "Adana", trabzon: "Trabzon", gebze: "Gebze" };

// ─── STATE ────────────────────────────────────────────────────────
let calculations = [];
let lastResult = null;
let historyUnit = 'kg';

// ─── HELPERS ──────────────────────────────────────────────────────
function fmtNum(n, d = 4) {
    return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtDate(iso) {
    try {
        const d = new Date(iso);
        return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

function toTcmbDate(isoDate) {
    const parts = isoDate.split('-');
    if (parts.length !== 3) return '';
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

// ─── INIT ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initCityDropdown();
    initDateField();
    initSlider();
    initTabs();
    initHistoryTabs();
    fetchRates();
    fetchCalculations();
    bindEvents();
});

function initCityDropdown() {
    const select = document.getElementById('shippingCity');
    CITIES.forEach(city => {
        const opt = document.createElement('option');
        opt.value = city;
        opt.textContent = city;
        select.appendChild(opt);
    });
}

function initDateField() {
    const d = new Date();
    const iso = d.toISOString().split('T')[0];
    document.getElementById('calcDate').value = iso;
}

function initSlider() {
    const slider = document.getElementById('marginSlider');
    const display = document.getElementById('marginDisplay');
    slider.addEventListener('input', () => {
        display.textContent = `%${slider.value}`;
    });
}

function initTabs() {
    document.querySelectorAll('.result-card .tabs .tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.result-card .tabs .tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const tabId = tab.getAttribute('data-tab');
            document.getElementById('tabKg').classList.toggle('active', tabId === 'kg');
            document.getElementById('tabTon').classList.toggle('active', tabId === 'ton');
        });
    });
}

function initHistoryTabs() {
    document.querySelectorAll('.history-tabs .tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.history-tabs .tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            historyUnit = tab.getAttribute('data-htab');
            renderHistory();
        });
    });
}

function bindEvents() {
    document.getElementById('calcForm').addEventListener('submit', handleSubmit);
    document.getElementById('refreshRates').addEventListener('click', fetchRates);

    document.getElementById('calcDate').addEventListener('change', () => {
        fetchRatesForDate(document.getElementById('calcDate').value);
    });

    document.getElementById('shippingCost').addEventListener('input', updateShippingUsd);
    document.getElementById('usdRate').addEventListener('input', updateShippingUsd);

    document.getElementById('historyToggle').addEventListener('click', toggleHistory);
    document.getElementById('toggleHistoryBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleHistory();
    });

    document.getElementById('exportSinglePdf').addEventListener('click', () => exportSinglePdf());
    document.getElementById('exportSingleExcel').addEventListener('click', () => exportSingleExcel());
    document.getElementById('exportAllPdf').addEventListener('click', () => exportAllPdf());
    document.getElementById('exportAllExcel').addEventListener('click', () => exportAllExcel());
}

// ─── EXCHANGE RATES ───────────────────────────────────────────────
async function fetchRates() {
    try {
        const res = await fetch('/api/exchange-rates/today');
        if (!res.ok) throw new Error('API error');
        const data = await res.json();
        applyRates(data);
    } catch (err) {
        showToast('Döviz kurları alınamadı', 'error');
    }
}

async function fetchRatesForDate(isoDate) {
    const tcmbDate = toTcmbDate(isoDate);
    if (!tcmbDate) return;
    try {
        const res = await fetch(`/api/exchange-rates/${tcmbDate}`);
        if (!res.ok) throw new Error('API error');
        const data = await res.json();
        applyRates(data);
        showToast(`${data.date || isoDate} kurları yüklendi`, 'success');
    } catch (err) {
        showToast('Bu tarih için kur bulunamadı', 'error');
    }
}

function applyRates(data) {
    document.getElementById('rateUsd').textContent = fmtNum(data.usd, 4);
    document.getElementById('rateEur').textContent = fmtNum(data.eur, 4);
    document.getElementById('rateChf').textContent = fmtNum(data.chf, 4);
    document.getElementById('ratesDate').textContent = data.date ? `(${data.date})` : '';

    document.getElementById('usdRate').value = data.usd;
    document.getElementById('eurRate').value = data.eur;
    document.getElementById('chfRate').value = data.chf;

    updateShippingUsd();
}

function updateShippingUsd() {
    const shipping = parseFloat(document.getElementById('shippingCost').value) || 0;
    const usdRate = parseFloat(document.getElementById('usdRate').value) || 0;
    const display = document.getElementById('shippingUsdDisplay');
    const valueEl = document.getElementById('shippingUsdValue');

    if (shipping > 0 && usdRate > 0) {
        valueEl.textContent = fmtNum(shipping / usdRate, 4);
        display.style.display = 'block';
    } else {
        display.style.display = 'none';
    }
}

// ─── CALCULATIONS ─────────────────────────────────────────────────
async function fetchCalculations() {
    try {
        const res = await fetch('/api/calculations');
        if (!res.ok) throw new Error('API error');
        calculations = await res.json();
        document.getElementById('historyCount').textContent = calculations.length;
        renderHistory();
    } catch (err) {
        console.error('Hesaplamalar yüklenemedi:', err);
    }
}

async function handleSubmit(e) {
    e.preventDefault();

    const payload = {
        product_name: document.getElementById('productName').value.trim(),
        dealer: document.getElementById('dealer').value.trim(),
        dealer_customer: document.getElementById('dealerCustomer').value.trim(),
        calculation_date: document.getElementById('calcDate').value,
        factory: document.getElementById('factory').value,
        shipping_city: document.getElementById('shippingCity').value,
        shipping_cost: parseFloat(document.getElementById('shippingCost').value) || 0,
        nts_cost: parseFloat(document.getElementById('ntsCost').value) || 0,
        margin: parseInt(document.getElementById('marginSlider').value) / 100,
        usd_rate: parseFloat(document.getElementById('usdRate').value) || 0,
        eur_rate: parseFloat(document.getElementById('eurRate').value) || 0,
        chf_rate: parseFloat(document.getElementById('chfRate').value) || 0,
    };

    // Validation
    if (!payload.product_name || !payload.dealer || !payload.factory || !payload.shipping_city) {
        showToast('Lütfen tüm zorunlu alanları doldurun', 'error');
        return;
    }
    if (payload.nts_cost <= 0) {
        showToast('NTS Maliyeti 0\'dan büyük olmalıdır', 'error');
        return;
    }
    if (payload.usd_rate <= 0 || payload.eur_rate <= 0 || payload.chf_rate <= 0) {
        showToast('Döviz kurları yüklenmedi, lütfen bekleyin', 'error');
        return;
    }

    try {
        const res = await fetch('/api/calculations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error('API error');
        const result = await res.json();
        lastResult = result;

        showResult(result);
        fetchCalculations();
        showToast('Hesaplama başarıyla kaydedildi', 'success');
    } catch (err) {
        showToast('Hesaplama kaydedilemedi', 'error');
    }
}

function showResult(calc) {
    const card = document.getElementById('resultCard');
    card.style.display = 'block';

    // KG values
    document.getElementById('resultTL').textContent = fmtNum(calc.result_tl, 2);
    document.getElementById('resultUSD').textContent = fmtNum(calc.result_usd, 4);
    document.getElementById('resultEUR').textContent = fmtNum(calc.result_eur, 4);
    document.getElementById('resultCHF').textContent = fmtNum(calc.result_chf, 4);

    // TON values
    const tlTon = calc.result_tl_ton || calc.result_tl * 1000;
    const usdTon = calc.result_usd_ton || calc.result_usd * 1000;
    const eurTon = calc.result_eur_ton || calc.result_eur * 1000;
    const chfTon = calc.result_chf_ton || calc.result_chf * 1000;

    document.getElementById('resultTLTon').textContent = fmtNum(tlTon, 2);
    document.getElementById('resultUSDTon').textContent = fmtNum(usdTon, 2);
    document.getElementById('resultEURTon').textContent = fmtNum(eurTon, 2);
    document.getElementById('resultCHFTon').textContent = fmtNum(chfTon, 2);

    // Detail
    const detail = document.getElementById('resultDetail');
    detail.style.display = 'block';
    document.getElementById('detailProduct').textContent = calc.product_name;
    document.getElementById('detailDealer').textContent = `${calc.dealer} / ${calc.dealer_customer}`;
    document.getElementById('detailFactory').textContent = FACTORY_LABELS[calc.factory] || calc.factory;
    document.getElementById('detailCity').textContent = calc.shipping_city || '—';
    document.getElementById('detailShippingTL').textContent = `${fmtNum(calc.shipping_cost, 2)} TL/kg`;

    const shippingUsd = calc.shipping_cost_usd || (calc.usd_rate > 0 ? calc.shipping_cost / calc.usd_rate : 0);
    document.getElementById('detailShippingUSD').textContent = `${fmtNum(shippingUsd, 4)} USD/kg`;

    const ntsMarj = calc.margin > 0 ? (calc.nts_cost / calc.margin) : 0;
    document.getElementById('detailFormula').textContent =
        `(${fmtNum(calc.nts_cost, 2)} / ${fmtNum(calc.margin, 2)}) + ${fmtNum(calc.shipping_cost, 2)} = ${fmtNum(calc.result_tl, 2)} TL/kg`;

    // Scroll to result
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── HISTORY ──────────────────────────────────────────────────────
function toggleHistory() {
    const body = document.getElementById('historyBody');
    const btn = document.getElementById('toggleHistoryBtn');
    const exportPdf = document.getElementById('exportAllPdf');
    const exportExcel = document.getElementById('exportAllExcel');
    const isOpen = body.style.display !== 'none';

    body.style.display = isOpen ? 'none' : 'block';
    btn.textContent = isOpen ? '▼ Aç' : '▲ Kapat';
    exportPdf.style.display = isOpen ? 'none' : 'inline-flex';
    exportExcel.style.display = isOpen ? 'none' : 'inline-flex';
}

function renderHistory() {
    const tbody = document.getElementById('historyTableBody');
    const header = document.getElementById('historyHeader');
    const empty = document.getElementById('historyEmpty');
    const table = document.getElementById('historyTable');

    if (calculations.length === 0) {
        empty.style.display = 'block';
        table.style.display = 'none';
        return;
    }

    empty.style.display = 'none';
    table.style.display = 'table';

    // Header based on unit
    if (historyUnit === 'kg') {
        header.innerHTML = `
            <th>Tarih</th><th>Ürün</th><th>Bayi</th><th>Fab.</th><th>Şehir</th>
            <th>Marj</th><th>Nakl. TL/kg</th>
            <th>USD/kg</th><th>EUR/kg</th><th>CHF/kg</th>
            <th>Excel</th><th>PDF</th><th>Sil</th>
        `;
    } else {
        header.innerHTML = `
            <th>Tarih</th><th>Ürün</th><th>Bayi</th><th>Fab.</th><th>Şehir</th>
            <th>Marj</th><th>Nakl. TL/kg</th>
            <th>USD/ton</th><th>EUR/ton</th><th>CHF/ton</th>
            <th>Excel</th><th>PDF</th><th>Sil</th>
        `;
    }

    tbody.innerHTML = '';

    calculations.forEach(c => {
        const tr = document.createElement('tr');
        const factory = FACTORY_LABELS[c.factory] || c.factory;
        const margin = `%${Math.round(c.margin * 100)}`;

        let col1, col2, col3;
        if (historyUnit === 'kg') {
            col1 = fmtNum(c.result_usd, 4);
            col2 = fmtNum(c.result_eur, 4);
            col3 = fmtNum(c.result_chf, 4);
        } else {
            const usdTon = c.result_usd_ton || c.result_usd * 1000;
            const eurTon = c.result_eur_ton || c.result_eur * 1000;
            const chfTon = c.result_chf_ton || c.result_chf * 1000;
            col1 = fmtNum(usdTon, 2);
            col2 = fmtNum(eurTon, 2);
            col3 = fmtNum(chfTon, 2);
        }

        tr.innerHTML = `
            <td>${fmtDate(c.created_at)}</td>
            <td>${c.product_name}</td>
            <td>${c.dealer}</td>
            <td>${factory}</td>
            <td>${(c.shipping_city || '').substring(0, 12)}</td>
            <td>${margin}</td>
            <td>${fmtNum(c.shipping_cost, 2)}</td>
            <td><b>${col1}</b></td>
            <td><b>${col2}</b></td>
            <td><b>${col3}</b></td>
            <td><button class="btn btn-sm btn-outline" onclick="exportRowExcel('${c.id}')">📗</button></td>
            <td><button class="btn btn-sm btn-outline" onclick="exportRowPdf('${c.id}')">📄</button></td>
            <td><button class="btn-danger" onclick="deleteCalc('${c.id}')">🗑</button></td>
        `;
        tbody.appendChild(tr);
    });
}

async function deleteCalc(id) {
    if (!confirm('Bu hesaplamayı silmek istediğinize emin misiniz?')) return;
    try {
        const res = await fetch(`/api/calculations/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('API error');
        showToast('Hesaplama silindi', 'info');
        fetchCalculations();
    } catch (err) {
        showToast('Silme işlemi başarısız', 'error');
    }
}

// ─── EXPORT FUNCTIONS ─────────────────────────────────────────────
async function exportAllPdf() {
    try {
        showToast('PDF hazırlanıyor...', 'info');
        const res = await fetch('/api/export/pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ calculations }),
        });
        if (!res.ok) throw new Error('Export error');
        const blob = await res.blob();
        downloadBlob(blob, `hesaplamalar_${new Date().toISOString().slice(0, 10)}.pdf`);
        showToast('PDF indirildi', 'success');
    } catch (err) {
        showToast('PDF oluşturulamadı', 'error');
    }
}

async function exportAllExcel() {
    try {
        showToast('Excel hazırlanıyor...', 'info');
        const res = await fetch('/api/export/excel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ calculations }),
        });
        if (!res.ok) throw new Error('Export error');
        const blob = await res.blob();
        downloadBlob(blob, `hesaplamalar_${new Date().toISOString().slice(0, 10)}.xlsx`);
        showToast('Excel indirildi', 'success');
    } catch (err) {
        showToast('Excel oluşturulamadı', 'error');
    }
}

async function exportSinglePdf() {
    if (!lastResult) return;
    try {
        showToast('PDF hazırlanıyor...', 'info');
        const res = await fetch('/api/export/pdf/single', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(lastResult),
        });
        if (!res.ok) throw new Error('Export error');
        const blob = await res.blob();
        const name = lastResult.product_name.replace(/\s+/g, '_');
        downloadBlob(blob, `hesaplama_${name}_${new Date().toISOString().slice(0, 10)}.pdf`);
        showToast('PDF indirildi', 'success');
    } catch (err) {
        showToast('PDF oluşturulamadı', 'error');
    }
}

async function exportSingleExcel() {
    if (!lastResult) return;
    try {
        showToast('Excel hazırlanıyor...', 'info');
        const res = await fetch('/api/export/excel/single', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(lastResult),
        });
        if (!res.ok) throw new Error('Export error');
        const blob = await res.blob();
        const name = lastResult.product_name.replace(/\s+/g, '_');
        downloadBlob(blob, `hesaplama_${name}_${new Date().toISOString().slice(0, 10)}.xlsx`);
        showToast('Excel indirildi', 'success');
    } catch (err) {
        showToast('Excel oluşturulamadı', 'error');
    }
}

// Export from history row
function exportRowPdf(id) {
    const calc = calculations.find(c => c.id === id);
    if (!calc) return;
    lastResult = calc;
    exportSinglePdf();
}

function exportRowExcel(id) {
    const calc = calculations.find(c => c.id === id);
    if (!calc) return;
    lastResult = calc;
    exportSingleExcel();
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
    }, 100);
}
