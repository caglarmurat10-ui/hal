# HAL Takip v8

HAL Takip artık Vercel/Next.js ve Windows dosya yoluna bağlı değildir. Yeni mimari:

- **React + Vite** mobil öncelikli arayüz
- **Cloudflare Worker API**
- **Cloudflare D1** kalıcı veritabanı
- **Çevrimdışı önbellek + bekleyen işlem kuyruğu**
- **Capacitor 8** ile Android APK
- `HAL_API_KEY` ile API erişim koruması
- Eski Google Apps Script verisini tek seferlik içe aktarma

## Cloudflare kurulumu

1. Bağımlılıkları kurun: `npm install`
2. D1 oluşturun: `npx wrangler d1 create hal-takip-db`
3. Dönen `database_id` değerini `wrangler.jsonc` içindeki `REPLACE_WITH_D1_DATABASE_ID` ile değiştirin.
4. Güvenlik anahtarını secret olarak ekleyin: `npx wrangler secret put HAL_API_KEY`
5. Migration: `npm run db:migrate:remote`
6. Deploy: `npm run deploy`

Cloudflare Workers Builds kullanılacaksa GitHub reposunu `hal-takip` Worker'ına bağlayın; Worker adı `wrangler.jsonc` ile aynı olmalıdır.

## Android APK

GitHub Actions içindeki **Build Android APK** workflow'u install edilebilir debug APK üretir. APK'nın Cloudflare API'yi otomatik bulması için repo variable olarak `HAL_API_BASE_URL` tanımlayın (örn. `https://hal-takip.<subdomain>.workers.dev`). İlk kurulumda erişim anahtarı uygulamanın Ayarlar ekranına bir kez girilir ve cihazda saklanır.

Yerelde:

```bash
npm install
npm run build:web
npx cap add android
npx cap sync android
npx cap open android
```

## Veri güvenliği

Eski `data/entries.json` uygulama veritabanı olarak kullanılmaz. Windows'a özel `C:\\Users\\...` yolları ve Vercel Server Actions kaldırılmıştır. D1 tek kaynak; cihazdaki localStorage yalnızca çevrimdışı önbellek ve senkron kuyruğudur.
