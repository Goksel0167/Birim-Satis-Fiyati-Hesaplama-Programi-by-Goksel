# Birim Satış Fiyatı Hesaplayıcı

TCMB döviz kurları ile otomatik birim satış fiyatı hesaplama uygulaması.

## Özellikler

- **TCMB Entegrasyonu**: USD, EUR, CHF satış kurları otomatik alınır
- **Hafta sonu/Tatil Desteği**: Son iş gününün kurları otomatik kullanılır
- **Hesaplama Formülü**: `(NTS Maliyeti / Marj) + Nakliye = TL/kg Birim Fiyat`
- **Çoklu Döviz**: TL, USD, EUR, CHF cinsinden hesaplama
- **KG ve TON**: Hem kg hem ton bazında sonuçlar
- **Nakliye**: TL/kg ve USD/kg olarak gösterim, 81 il seçimi
- **3 Fabrika**: Adana, Trabzon, Gebze
- **Marj Ayarı**: %50 - %100 arası slider
- **Geçmiş**: Son 500 hesaplama SQLite'da saklanır
- **PDF Export**: Tek hesaplama ve tüm geçmiş PDF olarak indirilir
- **Excel Export**: Tek hesaplama (key-value detay) ve tüm geçmiş Excel olarak indirilir

## Kurulum (VSCode ile Lokal Geliştirme)

### 1. Proje klasörünü açın

```bash
cd birim-fiyat-hesaplayici
```

### 2. Virtual environment oluşturun

```bash
python -m venv venv

# Windows:
venv\Scripts\activate

# macOS/Linux:
source venv/bin/activate
```

### 3. Bağımlılıkları yükleyin

```bash
pip install -r requirements.txt
```

### 4. Uygulamayı çalıştırın

```bash
python app.py
```

Tarayıcıda [http://localhost:5000](http://localhost:5000) adresini açın.

## GitHub'a Push

```bash
git init
git add .
git commit -m "İlk commit: Birim Satış Fiyatı Hesaplayıcı"
git remote add origin https://github.com/KULLANICI_ADI/birim-fiyat-hesaplayici.git
git push -u origin main
```

## Deploy (Kolay Yol: Render / Railway)

### Render (Docker)
1. [render.com](https://render.com) adresinde "New Web Service" oluşturun.
2. GitHub repository olarak bu projeyi seçin.
3. Runtime olarak `Docker` seçin (Dockerfile otomatik algılanır).
4. Environment variables ekleyin:
	- `MAX_RECORDS=500`
	- `DATABASE_PATH=/opt/render/project/src/data/calculations.db`
	- `SECRET_KEY=<guclu-bir-key>`
5. Deploy başlatın ve uygulamayı açın.

### Railway (Docker)
1. [railway.app](https://railway.app) adresinde "New Project" -> "Deploy from GitHub repo" seçin.
2. Bu repository'yi seçin.
3. Service Variables bölümüne şunları ekleyin:
	- `MAX_RECORDS=500`
	- `DATABASE_PATH=/app/data/calculations.db`
	- `SECRET_KEY=<guclu-bir-key>`
4. Deploy sonrası verilen URL ile erişin.

### Not: Kayıtların Kalıcılığı
- Projede 500 kayıt limiti korunur, bu limit framework'ten bağımsızdır.
- Free planlarda bazı platformlarda disk kalıcı olmayabilir; bu durumda yeniden deploy/restart sonrası SQLite sıfırlanabilir.
- Kalıcı kayıt için persistent disk/volume veya harici veritabanı (PostgreSQL gibi) kullanın.

## Ortam Değişkenleri (Opsiyonel)

| Değişken | Varsayılan | Açıklama |
|----------|-----------|----------|
| `PORT` | `5000` | Uygulama portu |
| `SECRET_KEY` | (otomatik) | Flask secret key |
| `FLASK_DEBUG` | `false` | Debug modu |
| `DATABASE_PATH` | `data/calculations.db` | SQLite dosya yolu (kalıcı disk mount noktası önerilir) |
| `MAX_RECORDS` | `500` | Maksimum saklanan hesaplama sayısı |

## Teknik Detaylar

- **Backend**: Python / Flask
- **Frontend**: Vanilla HTML/CSS/JS
- **Veritabanı**: SQLite (dosya tabanlı, deploy'da persistent volume gerekir)
- **Döviz API**: TCMB XML API
- **PDF**: ReportLab
- **Excel**: OpenPyXL
- **Production**: Gunicorn
