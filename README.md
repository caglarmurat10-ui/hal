# HAL Takip v8

HAL Takip, eski Vercel/Next.js + Windows dosya sistemi mimarisinden ayrılarak Cloudflare ve Android için yeniden kurulmuştur.

## Mimari

- **React + Vite** mobil öncelikli arayüz
- **Cloudflare Worker API**
- **Cloudflare D1** kalıcı veritabanı
- **Çevrimdışı önbellek + işlem kuyruğu**
- **Idempotent ve seri tahsilat işleme**: bağlantı kopması veya iki cihazdan eşzamanlı istek çift tahsilat üretmez
- **Muhasebe geçmişi koruması**: tahsilat bağlanmış satış doğrudan silinemez
- **Kasım-Haziran üretim sezonu**: Temmuz-Ekim satış kaydı hem arayüzde hem Worker API'de engellenir
- **Sezon karşılaştırma analizi**
- **Capacitor 8** Android uygulaması
- Özel HAL adaptif Android ikon/splash üretimi
- `HAL_API_KEY` ile API erişim koruması
- CSV ve JSON dışa aktarma

## Temiz başlangıç

Production verisi eski Google/Apps Script kayıtlarından taşınmaz. Yeni Cloudflare D1 veritabanı **0 satış / 0 tahsilat** ile başlar.

Tarayıcıdaki eski test verilerinin production'a karışmaması için yeni localStorage veri alanı kullanılır. Eski Google veri içe aktarma endpoint'i ve arayüz butonu kaldırılmıştır.

## Cloudflare kurulumu — Windows tek komut

> `wrangler.jsonc` içindeki `REPLACE_WITH_D1_DATABASE_ID` bilinçli bir güvenlik kilididir. Bootstrap gerçek D1'i bulduğunda/oluşturduğunda bu değer yalnızca yerel çalışma kopyasında doldurulur.

Repo klasöründe:

```powershell
npm run cloudflare:bootstrap
```

`scripts/cloudflare-bootstrap.ps1` otomatik olarak:

1. bağımlılıkları kurar,
2. Cloudflare oturumunu kontrol eder ve gerekirse `wrangler login` açar,
3. `hal-takip-db` D1 veritabanını bulur veya Eastern Europe konum ipucuyla oluşturur,
4. `wrangler.jsonc` içindeki D1 ID kilidini yerelde doldurur,
5. D1 migration'larını uygular,
6. veritabanının **0 satış / 0 tahsilat** olduğunu doğrular; boş değilse hiçbir veri silmeden durur,
7. kriptografik rastgele `HAL_API_KEY` üretir ve Cloudflare secret olarak yükler,
8. Worker'ı deploy eder,
9. `/api/health` kontrolünü yapar,
10. API adresi ve erişim anahtarını git tarafından yok sayılan `.hal-cloudflare.local.txt` dosyasına kaydeder.

Bu dosyadaki `API_BASE_URL` ve `HAL_API_KEY`, HAL Takip **Ayarlar** ekranına bir kez girilir. Secret repoya yazılmaz.

### Manuel kurulum gerekirse

```powershell
npm install
npx wrangler login
npx wrangler d1 create hal-takip-db --location eeur
# Çıkan database_id değerini wrangler.jsonc içine yerelde yazın.
npm run db:migrate:remote
npx wrangler secret put HAL_API_KEY
npm run deploy
```

Ardından `/api/health` ve `/api/state` doğrulanır. İlk `/api/state` sonucu boş `sales` ve `payments` dizileri içermelidir.

## Android

GitHub Actions içindeki **Build Android APK** workflow'u ilgili değişikliklerde:

- runtime dependency güvenlik kontrolü,
- TypeScript kontrolü,
- D1 migration doğrulaması,
- Android web build,
- Capacitor Android üretimi,
- HAL ikon/splash üretimi,
- Gradle APK build

çalıştırır ve `HAL-Takip-APK` artifact'ını üretir.

Production Android sürümüne Cloudflare API adresi otomatik verilecekse GitHub Actions repository variable olarak `HAL_API_BASE_URL` tanımlanabilir. `HAL_API_KEY` kaynak koda veya APK build dosyalarına gömülmez; uygulamaya ilk kurulumda güvenli ayarlar ekranından girilir.

Yerelde Android projesini açmak için:

```bash
npm install
npm run build:android-web
npx cap add android
npx cap sync android
npm run android:assets
npm run android:open
```

## Vercel'den çıkış sırası

Vercel yalnızca geçici önizleme/geri dönüş noktasıdır. Şu kontroller tamamlanmadan kaldırılmaz:

1. Cloudflare Worker deploy başarılı,
2. D1 migration başarılı ve başlangıç verisi 0/0,
3. web üzerinden gerçek bir satış + tahsilat testi başarılı,
4. ikinci tarayıcı/telefon senkron testi başarılı,
5. Android sürümü aynı Cloudflare verisini okuyup yazabiliyor.

Bunlar doğrulandıktan sonra Vercel kaldırılır ve Cloudflare kalıcı üretim ortamı olur.

## Veri güvenliği

D1 tek kalıcı veri kaynağıdır. Windows'a özel `C:\\Users\\...` yolları, Vercel Server Actions ve eski Google veri içe aktarma akışı artık production mimarisinde yoktur. Cihazdaki localStorage yalnızca çevrimdışı önbellek, bağlantı ayarı ve yeniden oynatılabilir işlem kuyruğu olarak kullanılır.
