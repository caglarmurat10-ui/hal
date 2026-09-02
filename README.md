# HAL Takip v8

HAL Takip, eski Vercel/Next.js + Windows dosya sistemi mimarisinden ayrılarak Cloudflare ve Android için yeniden kurulmuştur.

## Mimari

- **React + Vite** mobil öncelikli arayüz
- **Cloudflare Worker API**
- **Cloudflare D1** kalıcı veritabanı
- **Çevrimdışı önbellek + işlem kuyruğu**
- **Idempotent ve seri tahsilat işleme**: bağlantı kopması veya iki cihazdan eşzamanlı istek çift tahsilat üretmez
- **Muhasebe geçmişi koruması**: tahsilat bağlanmış satış doğrudan silinemez
- **Capacitor 8** Android APK
- Özel HAL adaptif Android ikon/splash üretimi
- `HAL_API_KEY` ile API erişim koruması
- Eski Google Apps Script verisini Worker üzerinden tek seferlik ve tekrar çalıştırılabilir içe aktarma
- CSV ve JSON dışa aktarma

## Cloudflare kurulumu

> `wrangler.jsonc` içindeki `REPLACE_WITH_D1_DATABASE_ID` bilinçli bir güvenlik kilididir. Gerçek D1 oluşturulmadan yanlışlıkla production deploy yapılmasını engeller.

1. `npm install`
2. Cloudflare oturumu yoksa `npx wrangler login`
3. `npx wrangler d1 create hal-takip-db`
4. Komutun verdiği `database_id` değerini `wrangler.jsonc` içindeki `REPLACE_WITH_D1_DATABASE_ID` yerine yazın.
5. `npm run db:migrate:remote`
6. Güçlü bir erişim anahtarını `npx wrangler secret put HAL_API_KEY` ile ekleyin. Secret değeri repoya **asla** yazılmaz.
7. `npm run deploy`
8. `/api/health` yanıtını ve uygulamadaki senkron durumunu doğrulayın.

Cloudflare Workers Builds kullanılacaksa GitHub reposu `hal-takip` Worker'ına bağlanabilir. D1 binding adı `DB`, Worker adı `hal-takip` olarak korunmalıdır.

## Eski veriyi taşıma

Cloudflare sürümü çalıştıktan sonra uygulamada **Ayarlar → Eski Google Verisini İçe Aktar** kullanılır. Telefon doğrudan Google Apps Script'e bağlanmaz; Worker eski kaynağı sunucu tarafında okur ve D1'e upsert eder. Aynı eski ID tekrar içe aktarılırsa ikinci kayıt oluşturulmaz.

Taşıma sonrasında toplam kayıt, net ciro, tahsilat ve kalan bakiye eski sistemle karşılaştırılmadan Vercel kapatılmamalıdır.

## Android APK

GitHub Actions içindeki **Build Android APK** workflow'u her ilgili değişiklikte:

- runtime dependency güvenlik kontrolü,
- TypeScript kontrolü,
- D1 migration doğrulaması,
- Android web build,
- Capacitor Android üretimi,
- HAL ikon/splash üretimi,
- Gradle APK build

çalıştırır ve `HAL-Takip-APK` artifact'ını üretir.

APK'nın Cloudflare API adresini otomatik bilmesi için GitHub Actions repository variable olarak `HAL_API_BASE_URL` tanımlanabilir. Tanımlı değilse adres uygulamanın Ayarlar ekranına girilebilir. `HAL_API_KEY` uygulamaya ilk kurulumda bir kez girilir; APK içine kaynak kod secret'ı gömülmez.

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

Vercel deployment'ı yeni sistem production doğrulamasına kadar geri dönüş noktası olarak tutulur. D1 migration, eski veri aktarımı, Cloudflare Worker/API testi ve en az bir gerçek cihaz APK senkron testi başarılı olduktan sonra Vercel projesi kapatılır ve `main` yeni Cloudflare sürümüne geçirilir.

## Veri güvenliği

Eski `data/entries.json` artık uygulama veritabanı değildir. Windows'a özel `C:\\Users\\...` yolları ve Vercel Server Actions kaldırılmıştır. D1 tek kalıcı kaynak; cihazdaki localStorage yalnızca çevrimdışı önbellek, bağlantı ayarı ve yeniden oynatılabilir işlem kuyruğu olarak kullanılır.
