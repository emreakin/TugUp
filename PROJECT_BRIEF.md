# TugUp — Kapsamlı Proje Brifingi

> Bu doküman, projeye sıfırdan dahil olan bir yapay zekâ ajanının veya geliştiricinin
> kod tabanını okumadan bağlam kurabilmesi için hazırlanmıştır. Tüm sayılar ve dosya
> yolları koddan doğrulanarak çıkarılmıştır.
>
> **Son güncelleme:** 15 Eylül 2026 · **Depo kökü:** `/Users/emreakin/TugUp Game`

---

## 1. Ürün özeti

**TugUp**, halat çekme (tug of war) temalı bir mobil oyundur. Üç oyun modu var:

| Mod | Ne | Rakip |
|---|---|---|
| **Hızlı Oyun** (Quick Game) | 15 seviyeli tek oyunculu kampanya | Giderek ağırlaşan cisimler (bowling topu → vinç) |
| **1v1** | Gerçek zamanlı kafa kafaya | Başka bir oyuncu (rastgele eşleşme veya davet linki) |
| **Online** | Haftalık takım oylaması | Global oyuncu kitlesi (Galatasaray vs Fenerbahçe gibi rekabetler) |

- **Platform:** Android öncelikli (`com.tugup.game`, versionCode 23), iOS yapılandırması hazır ama test ID'leriyle
- **Sürüm:** `0.1.4`
- **Diller:** Türkçe + İngilizce (cihaz diline göre; `tr` ise Türkçe, değilse İngilizce)
- **Para kazanma:** AdMob (rewarded + banner) + coin ekonomisi
- **Canlı API:** `https://tugup-api.onrender.com`
- **Git remote:** `git@github.com:emreakin/TugUp.git`, tek dal: `main`

---

## 2. Depo yapısı (pnpm monorepo)

```
/Users/emreakin/TugUp Game/
├── artifacts/
│   ├── api-server/          ← AKTİF: Express 5 API → Render
│   ├── tug-of-war-mobile/   ← AKTİF: Expo 54 mobil uygulama (asıl ürün)
│   ├── tug-of-war/          ← LEGACY: Vite + React web prototipi
│   └── mockup-sandbox/      ← LEGACY: Replit tasarım kanvası
├── lib/
│   ├── db/                  ← Drizzle şema + PostgreSQL pool + ensureSchema
│   ├── api-zod/             ← Üretilmiş Zod şemaları (sunucu doğrulama)
│   ├── api-client-react/    ← Üretilmiş React Query hook'ları (sadece web)
│   └── api-spec/            ← OpenAPI kaynağı + Orval codegen
├── scripts/                 ← Placeholder + post-merge hook
├── render.yaml              ← Render deploy blueprint
├── pnpm-workspace.yaml
└── replit.md                ← Kısmen şablon kalmış operasyon notları
```

- **Paket yöneticisi:** `pnpm@10.15.1`, **Node:** `22.14.0` (`.node-version`, Render ve EAS profillerinde sabit)
- `pnpm-workspace.yaml` içinde `lib/integrations/*` glob'u tanımlı ama **o dizin yok**
- Kök `package.json` scriptleri: `typecheck:libs` (`tsc --build`), `typecheck`, `build`

**Önemli:** Mobil uygulama `@workspace/api-client-react` paketini **kullanmıyor**. Kendi elle yazılmış fetch katmanı var (`artifacts/tug-of-war-mobile/lib/api.ts`). Üretilmiş client sadece legacy web artifact'ına bağlı. OpenAPI spec'i yalnızca `/healthz` ve `/votes/{matchupId}` uçlarını kapsıyor; auth/friends/game/coins/matchups/suggestions spec dışında.

---

## 3. Teknik yığın

### Mobil (`artifacts/tug-of-war-mobile`)

| Alan | Teknoloji |
|---|---|
| Çerçeve | Expo SDK `~54.0.35`, React Native `0.81.5`, React `19.1.0` |
| Yönlendirme | `expo-router ~6.0.24` (dosya tabanlı Stack), `typedRoutes: true` |
| Animasyon | `react-native-reanimated ~4.1.7`, RN `Animated` API, `react-native-worklets` |
| Jest/dokunma | `react-native-gesture-handler ~2.28.0` |
| Depolama | `@react-native-async-storage/async-storage 2.2.0` |
| i18n | `i18next ^26.3.6` + `react-i18next` + `expo-localization` |
| Ses/titreşim | `expo-av ^16.0.8`, `expo-haptics` |
| Reklam | `react-native-google-mobile-ads ^16.4.0` |
| Veri | `@tanstack/react-query ^5.90.21` (provider kurulu, aktif kullanım sınırlı) |
| Fontlar | Bebas Neue (display) + Inter 400/600/700 |
| Derleyici | `reactCompiler: true`, `newArchEnabled: true` |

### Backend (`artifacts/api-server`)

| Alan | Teknoloji |
|---|---|
| Çerçeve | Express 5 |
| ORM | Drizzle ORM + `node-postgres` (`pg.Pool`) |
| Log | Pino + `pino-http` (dev'de `pino-pretty`) |
| Doğrulama | Zod (`@workspace/api-zod`) |
| Bundle | esbuild → `dist/index.mjs` |
| WS | `socket.io` kurulu ama **devre dışı** (bkz. §17) |

---

## 4. Mimari ve veri akışı

```
┌──────────────────────────────┐
│ Expo mobil uygulama          │
│ (com.tugup.game, v0.1.4)     │
└───────────┬──────────────────┘
            │ HTTPS + polling (WebSocket YOK)
            ▼
┌──────────────────────────────┐
│ Express API (Render, free)   │
│ tugup-api.onrender.com       │
│ region: frankfurt            │
└───────────┬──────────────────┘
            ▼
┌──────────────────────────────┐
│ PostgreSQL (Aiven uyumlu SSL)│
│ 14 tablo                     │
└──────────────────────────────┘
```

**Kritik mimari not:** Gerçek zamanlı gibi görünen her şey (1v1, online oylama) **HTTP polling** ile çalışıyor. 1v1 için 500 ms, online oylama için 1000 ms aralıkla `GET` isteği atılıyor. Sunucuda tick döngüsü yok; durum yalnızca istemci isteği geldiğinde ilerliyor (geri sayım geçişi state sorgusunda tetikleniyor).

---

## 5. Backend endpoint referansı

Tüm uçlar `/api` ön ekiyle mount edilir (`src/routes/index.ts`).

### Sağlık

| Metot | Yol | Auth | Notlar |
|---|---|---|---|
| GET | `/api/healthz` | — | `{ status: "ok" }`. DB'ye dokunmaz, cold start prewarm hedefi |

### Auth (`src/routes/auth.ts`)

| Metot | Yol | Auth | Notlar |
|---|---|---|---|
| POST | `/api/auth/guest` | — | Body: `{ displayName?, resumeToken?, playerToken? }` → `{ token, user, playerToken }` |
| GET | `/api/auth/me` | Bearer | Kullanıcı + `playerToken` |
| PATCH | `/api/auth/me` | Bearer | `{ displayName }`, maks 24 karakter |

**Oturum devralma önceliği:** `resumeToken` (süresi geçmiş token kabul edilir) → `playerToken` → yeni misafir kullanıcı.

### Coins (`src/routes/coins.ts`) — hepsi Bearer ister

| Metot | Yol | Notlar |
|---|---|---|
| GET | `/api/coins` | `{ balance, dailyStreak, lastDailyClaimDate, canClaimToday, nextReward, nextStreak, jokerCost }` |
| POST | `/api/coins/daily-claim` | `{ claimed: true, reward, streak, balance }` veya `{ claimed: false, reason: "already_claimed", ... }` |
| POST | `/api/coins/purchase-joker` | 25 coin düşer, `reason: "joker_purchase"` |

### Friends (`src/routes/friends.ts`)

| Metot | Yol | Auth | Notlar |
|---|---|---|---|
| GET | `/api/friends` | Bearer | Arkadaş listesi |
| POST | `/api/friends/invite-link` | Bearer | Tek kullanımlık davet, **7 gün** TTL |
| GET | `/api/friends/invite/:inviteId` | — | Önizleme. 404 yok, 410 kullanılmış/süresi geçmiş |
| POST | `/api/friends/accept/:inviteId` | Bearer | Idempotent; davet edene referans ödülü verir |
| DELETE | `/api/friends/:friendId` | Bearer | Kendini silmeye 400 |

### Matchups (`src/routes/matchups.ts`)

| Metot | Yol | Auth | Notlar |
|---|---|---|---|
| GET | `/api/matchups` | — | `sortOrder` sıralı tüm satırlar |

Boot'ta 3 varsayılan rekabet seed edilir (idempotent, `onConflictDoNothing`): `galatasaray-fenerbahce` (⚽), `tesla-edison` (⚡), `android-ios` (📱). Hepsi `source: "default"`, `winThreshold: 100`.

### Votes — online oylama (`src/routes/votes.ts`)

| Metot | Yol | Auth | Notlar |
|---|---|---|---|
| GET | `/api/votes/:matchupId` | — | `{ matchupId, offset, leftPulls, rightPulls, voteDate, winThreshold }` |
| POST | `/api/votes/:matchupId` | — | `{ side }`. Rate limit'te de **200** döner, `accepted: false` + `cooldownSeconds` |
| GET | `/api/votes/:matchupId/reward-limit` | — | `{ used, remaining, max: 3 }` |
| POST | `/api/votes/:matchupId/reward` | — | Reklam sonrası cooldown temizler. Limit aşılırsa **429** |

IP, `X-Forwarded-For` ilk atlamasından veya `req.ip`'ten alınıp SHA-256 ile hash'lenir.

### Suggestions (`src/routes/suggestions.ts`) — UI'da gizli

| Metot | Yol | Auth | Notlar |
|---|---|---|---|
| GET | `/api/suggestions` | — | Oy sayısına göre azalan |
| POST | `/api/suggestions` | — | `{ leftTeam, rightTeam }`, her biri 1–50 karakter |
| POST | `/api/suggestions/:id/vote` | — | IP başına 1 oy; tekrarda `{ accepted: false }` |

### Game — 1v1 (`src/routes/game.ts`)

| Metot | Yol | Auth | Notlar |
|---|---|---|---|
| POST | `/api/game/join` | — | Public eşleşme. Bekleyen odaya sağ oyuncu olarak katılır ya da yeni oda kurar |
| GET | `/api/game/state/:roomId` | — | `?playerToken=`. Geri sayım bitmişse `playing`'e geçirir |
| POST | `/api/game/pull/:roomId` | — | `{ playerToken, side }`. Offset ±1 |
| POST | `/api/game/leave/:roomId` | — | Bekleyen tek kişilik oda silinir; rakip varsa ayrılan kaybeder |
| POST | `/api/game/create-invite` | Bearer | Özel oda + davet linki, **30 dk** TTL |
| POST | `/api/game/join-invite/:inviteId` | Bearer | 404 geçersiz, 400 kendi daveti, 409 oda dolu |

### Router dışı uçlar (`src/app.ts`)

| Metot | Yol | Notlar |
|---|---|---|
| GET | `/.well-known/assetlinks.json` | Android App Links. Fingerprint env boşsa **503** |
| GET | `/invite/friend/:id` | HTTPS → deep link köprüsü (meta refresh + JS) |
| GET | `/invite/game/:id` | Aynı köprü |
| GET | `/api/privacy-policy` | Statik Türkçe HTML |

---

## 6. Veritabanı şeması (14 tablo)

Tek kaynak: `lib/db/src/schema/index.ts`

| Tablo | Amaç | Öne çıkan kolonlar / kısıtlar |
|---|---|---|
| `matchups` | Aktif rekabet kaydı | PK `id` (text), `emoji`, `leftWins`/`rightWins`, `sortOrder`, `isActive`, `source`, `winThreshold` (varsayılan 100), `promotedFromSuggestionId` |
| `matchup_votes` | Haftalık oy durumu | Unique `(matchup_id, vote_date)`, `offset`, `leftPulls`, `rightPulls`, `weekWinner` |
| `vote_rate_limits` | IP bazlı oy cooldown | Index `(ip_hash, matchup_id)`, `lastVoteAt` |
| `matchup_suggestions` | Kullanıcı önerileri | `source` (`user`/`demoted`), `promotedAt` |
| `suggestion_votes` | Öneri oyları | **FK** → suggestions (CASCADE), unique `(suggestion_id, ip_hash)` |
| `weekly_processing` | Haftalık iş imleci | Tek satır; `lastProcessedWeek` |
| `game_rooms` | 1v1 oda durumu | PK text `id` (`r_{ts}_{5 char}`), `status`, `offset`, token'lar, `isPrivate`, `hostUserId`, `countdownStartedAt` |
| `users` | Oyuncu hesapları | Unique: `player_token`, `friend_code`, `(auth_provider, auth_subject)` |
| `friendships` | Arkadaşlık çiftleri | Unique `(user_low_id, user_high_id)` — kanonik sıralı |
| `friend_invites` | Arkadaş davet linkleri | `expiresAt`, `usedBy`, `usedAt` |
| `game_invites` | 1v1 davet linkleri | `roomId`, `expiresAt`, tek kullanım |
| `weekly_results` | Haftalık arşiv | `weekStartDate`, `totalPulls`, `winnerSide` |
| `daily_ad_rewards` | Günlük reklam limiti | Unique `(ip_hash, reward_date)`, `count` |
| `user_wallets` | Coin cüzdanı | PK `user_id`, **FK** → users (CASCADE), `balance`, `dailyStreak`, `lastDailyClaimDate` |
| `coin_transactions` | Append-only defter | **FK** → users (CASCADE), `amount`, `reason`, `balanceAfter`, index `(user_id, created_at)` |

**Sadece 3 foreign key gerçekten zorlanıyor:** `suggestion_votes → matchup_suggestions`, `user_wallets → users`, `coin_transactions → users`. Diğer tüm ilişkiler uygulama seviyesinde (örn. `game_rooms.matchup_id`, `friendships.user_*_id`).

### Şema yönetimi — üç ayrı mekanizma

| Yol | Ne zaman | Kapsam |
|---|---|---|
| `lib/db/migrations/0000_core.sql`, `0001_social.sql`, `0002_coins.sql` | Elle (`psql -f`) | Artımlı, elle yazılmış SQL. **Migration journal yok** |
| `ensureSchema()` (`lib/db/src/ensureSchema.ts`) | **Her sunucu başlangıcında** | Üç migration'ın birleşimi tek `CORE_SQL` string'i, tamamen idempotent (`IF NOT EXISTS`) |
| `drizzle-kit push` | Elle (`pnpm --filter @workspace/db run push`) | Drizzle şemasından senkron |

`ensureSchema` neden var: yorumda yazdığı gibi, `drizzle-kit push` hiç çalıştırılmamış production DB'lerinin kendini onarması için. Yeni kolon eklerken **hem** `schema/index.ts` **hem** `ensureSchema.ts` güncellenmeli, yoksa production'da kolon oluşmaz.

**Bağlantı:** `DATABASE_URL` **import anında** zorunlu — yoksa süreç ayağa kalkmaz. URL'de `aivencloud.com` varsa veya `DATABASE_SSL_REJECT_UNAUTHORIZED=false` ise `sslmode` URL'den sökülüp `ssl: { rejectUnauthorized: false }` uygulanır. Pool limiti yapılandırılmamış (pg varsayılanı).

---

## 7. Auth modeli

Sadece **misafir (guest)** akışı uygulanmış. Şema Google OAuth'a hazır (`authProvider`, `authSubject` unique index) ama **route yok**.

Üç ayrı kimlik katmanı var — karıştırmamak önemli:

| Token | Ne için | Format | Nerede |
|---|---|---|---|
| **Auth token** | API yetkisi (coins, friends, özel oyun) | `base64url({userId}.{issuedAt}.{hmac-sha256})` — **standart JWT değil**, TTL 365 gün | İstemcide, her istekte doğrulanır |
| **Player token** | Oyun odası kimliği | 32 karakter hex | DB `users.player_token`; anonim katılımda geçici üretilir |
| **Friend code** | Paylaşım/görüntüleme | `TUG-XXXX` (I/O/0/1 harfsiz alfabe) | DB unique; 8 deneme, sonra UUID fallback |

- `JWT_SECRET` env yoksa varsayılan `"tugup-dev-secret-change-in-production"` kullanılıyor — **production'da mutlaka ayarlı olmalı** (Render blueprint'te `generateValue: true`)
- `requireAuth` middleware Bearer zorunlu kılar; `optionalAuth` tanımlı ama **hiçbir route'ta kullanılmıyor**
- Friend code ile arkadaş ekleme endpoint'i **yok** — arkadaşlık sadece davet linkiyle kuruluyor

---

## 8. Oynanış: Hızlı Oyun (Quick Game)

Dosya: `artifacts/tug-of-war-mobile/app/quick-game.tsx` (~2500 satır, projedeki en büyük dosya)

### 8.1 15 seviye

| # | Cisim | Ağırlık (kg) | Süre (s) | unitPerTap | Vurgu rengi | Sahne | displayScale |
|---|---|---|---|---|---|---|---|
| 1 | Bowling topu | 6 | 8 | 8 | `#22c55e` | bowling-alley | 0.42 |
| 2 | Kanepe | 50 | 8 | 4.5 | `#f59e0b` | home-living | 0.58 |
| 3 | Çamaşır makinesi | 100 | 8 | 4 | `#3b82f6` | laundry-room | 0.62 |
| 4 | Buzdolabı | 200 | 10 | 3.5 | `#06b6d4` | kitchen | 1.0 |
| 5 | ATV | 300 | 10 | 2 | `#ef4444` | dirt-trail | 1.0 |
| 6 | Boğa | 1000 | 10 | 1.5 | `#92400e` | farm-pasture | 1.35 |
| 7 | Araba | 1500 | 10 | 1.2 | `#8b5cf6` | city-road | 1.5 |
| 8 | SUV | 2500 | 10 | 0.9 | `#ec4899` | mountain-highway | 1.65 |
| 9 | Kamyonet | 3500 | 10 | 0.8 | `#14b8a6` | work-yard | 1.8 |
| 10 | Fil | 5000 | 10 | 0.7 | `theme.textDim` | savanna | 1.95 |
| 11 | T-Rex | 7500 | 12 | 0.5 | `#dc2626` | prehistoric | 2.15 |
| 12 | Balina | 10000 | 12 | 0.45 | `#1e40af` | ocean-pier | 2.05 |
| 13 | Otobüs | 12000 | 12 | 0.4 | `#f97316` | bus-depot | 2.3 |
| 14 | Yat | 15000 | 15 | 0.35 | `#0891b2` | marina | 2.45 |
| 15 | Vinç | 20000 | 15 | 0.3 | `#eab308` | construction-site | 2.7 |

Tasarım formülü (yorumda): `unitPerTap ≈ round(180 / ağırlık^0.45, 1)`

### 8.2 Fizik

- **Pozisyon:** `0` = başlangıç, **`100` = kazanma** (`WIN_THRESHOLD = 100`)
- **Her çekiş:** `position = min(100, position + unitPerTap × multiplier)`; `multiplier` turbo aktifse 2, değilse 1
- **Geri itme (burst-back):** Seviye 1–5'te her **3000 ms**, seviye 6+'da her **5000 ms** bir `position -= 10` (minimum 0)
- **Timer:** 1000 ms aralıkla 1 saniye düşer. Son 3 saniyede acil titreşim/ses
- **Girdi:** "ÇEK!" butonuna dokunma **veya** sola kaydırma (`SWIPE_PIXELS_PER_PULL = 36` px başına bir çekiş, aktivasyon eşiği −15 px)
- **Görsel eşleme:** `offset = -(pos/100) × 100`, progress bar 0.5'ten 0'a gider

> ⚠️ **Ölü yapılandırma:** Her seviyede `driftPerSec` (0.5–8.0) tanımlı ama **hiçbir yerde okunmuyor**. Gerçek mekanik yukarıdaki −10 burst. Aynı şekilde `TICK_MS = 50` tanımlı ama kullanılmıyor.

### 8.3 Kazanma / kaybetme / rekor

- **Kazanma:** `position >= 100` → `celebrating` fazı → **2000 ms** sonra `win` modalı
- **Kaybetme:** süre 0'a düşer → aynı boru hattı → `lose` modalı
- **Rekor ölçüsü:** kazanırken **kalan saniye** (joker ile eklenen süre dahil). Daha yüksek kalan süre = daha iyi rekor
- **Edge case:** `timeLeft` 0'ken kazanılırsa "Son saniyede bitirildi!" metni gösterilir
- **Kilit açma:** kazanınca `unlockedUpTo = min(15, max(unlockedUpTo, currentLevelId + 1))`; başlangıçta sadece seviye 1 açık

### 8.4 Arena ölçekleme (taşma koruması)

Avatar + ip + cisim ekrana sığmak zorunda, ama cisim/avatar oranı her zaman tam olarak `displayScale` kalmalı. `arenaMetrics()` fonksiyonu:

```
ARENA_WIDTH          = WINDOW_WIDTH - 2×4
MAX_TRANSLATION      = round(ARENA_WIDTH × 0.28)      // sabit çekiş mesafesi
ARENA_SPRITE_BUDGET  = ARENA_WIDTH - 28 - MAX_TRANSLATION
widthScale  = ARENA_SPRITE_BUDGET / (100 × (1 + displayScale))
heightScale = round(WINDOW_HEIGHT × 0.26) / (100 × max(1, displayScale))
scale       = min(1, widthScale, heightScale)
charSize    = round(100 × scale)
objectSize  = round(100 × displayScale × scale)
```

Sonuç: büyük seviyelerde avatar da küçülüyor (390 px ekranda vinç için avatar 67 px, cisim 180 px), çekiş mesafesi her seviyede aynı kalıyor, hiçbir sprite ekran dışına taşmıyor. 320/390/430 px genişliklerde doğrulandı.

### 8.5 Jokerler

| Tip | Etki | Sayısal değer | Tur içi limit | Kilit |
|---|---|---|---|---|
| **time** | Süreye ekleme | **+2 saniye** | Stok varsa sınırsız | Yok |
| **turbo** | Çekiş gücü 2× | **3000 ms**, çarpan **2** | Aktifken tekrar açılamaz | **Seviye 5+** |
| **bomb** | Anında ilerleme | **+25 pozisyon birimi** | **Tur başına 2** | **Seviye 8+** |

- **Stok:** her tip için maks **3**, ve **tüm seviyeler arasında global** (seviye başına değil)
- **Kazanma yolu 1 — reklam:** rewarded ad → native'de joker seçim modalı; web'de otomatik olarak dolu olmayan ilk tipe eklenir (sıra: time → bomb → turbo)
- **Kazanma yolu 2 — coin:** **25 coin** (`JOKER_COIN_COST`), `POST /api/coins/purchase-joker`
- Üç tip de 3/3 ise "Joker Kazan" butonu devre dışı
- Stok her kullanım/kazanımda `AsyncStorage`'a yazılır

> ⚠️ "+%25" ismi yanıltıcı: kalan mesafenin yüzdesi değil, 100 birimlik skalada sabit **+25**.

---

## 9. Oynanış: 1v1

Dosya: `app/1v1.tsx` + sunucu `src/routes/game.ts`

**Fazlar:** `mode_select` → `name_input` → `connecting` → `waiting` → `countdown` → `playing` → `ended`

| Parametre | Değer |
|---|---|
| **Kazanma eşiği** | **10** (sunucu otoriter, `fixedMatchup()` içinde) — istemcideki 100 fallback'i asla kullanılmaz |
| Çekiş başına offset | ±1 (sol −1, sağ +1) |
| Polling aralığı | **500 ms** |
| Geri sayım | **5000 ms** (sunucu `countdownStartedAt`'a göre) |
| İsim limiti | Input `maxLength=20`, sunucuda 24 karaktere kesilir |
| Davet TTL | 30 dakika |
| Sabit renkler | sol `#ef4444`, sağ `#3b82f6` |

**Akışlar:**
- **Rastgele:** `POST /api/game/join` → bekleyen public odaya sağ oyuncu olarak katıl veya yeni oda kur (sol, bekliyor)
- **Davet:** `POST /api/game/create-invite` → özel oda + paylaşılabilir link (`FRIENDS_ENABLED` gerektirir)
- **Deep link ile katılma:** `invite/game/[id]` → `POST /api/game/join-invite/:id` → `/1v1`'e `joinRoomId` vb. parametrelerle yönlendirme
- **Yeniden katılma:** Aynı `playerToken` ile bitmemiş odaya geri dönülür

**Kopma davranışı:**

| Durum | Sonuç |
|---|---|
| Oda 404 | Polling durur, geri navigasyon |
| Uygulama arka plana / unmount | `POST /leave` → rakip varsa **ayrılan kaybeder** |
| Rakip bekleme sırasında ayrılır | Oda `waiting`'e döner |
| Bekleyen tek kişilik odada ayrılma | Oda silinir |

### Online oy modu (`app/game.tsx`)

Bu mod gerçek zamanlı PvP **değil** — global haftalık oylama.

| Parametre | Değer |
|---|---|
| Her oy | offset ±1 |
| Kazanma eşiği | matchup'ın `winThreshold` değeri (varsayılan 100) |
| **Oy cooldown'ı** | **1 saat** (IP + matchup başına), `AsyncStorage`'da `cooldown_end_${matchupId}` |
| Reklamla atlama | `POST /votes/:id/reward` cooldown'ı siler |
| **Günlük reklam limiti** | **3** (IP + UTC gün başına), aşılırsa 429 |
| Polling | 1000 ms |
| Haftalık sıfırlama | UI: yerel pazartesi 00:00'a geri sayım · Sunucu: **UTC pazartesi** |

"Tekrar Oyna" sadece **yerel** offset'i sıfırlar; global oylar değişmez.

### Geri bildirim katmanı (`lib/feedback.ts`)

| Olay | Ses (volume) | Titreşim |
|---|---|---|
| Çekiş | `pull.wav` (0.55), **45 ms throttle** | `ImpactFeedbackStyle.Light` |
| Tik | `tick.wav` (0.40) | `Medium` / acilse `Warning` |
| Kazanma | `win.wav` (0.70) | `Success` |
| Kaybetme | `lose.wav` (0.65) | `Error` |

Web'de tüm titreşimler atlanır. Ses yüklenemezse (web/Expo Go) sessizce haptik-only moda düşer.

---

## 10. Ekonomi ve business kuralları

### Coin

| Kural | Değer |
|---|---|
| Günlük giriş ödülü (streak 1→5+) | **10, 25, 50, 75, 100** coin |
| 5. gün ve sonrası | Her zaman 100 |
| Streak takvimi | **UTC günleri**; dün claim edilmişse +1, değilse 1'e sıfırlanır |
| Joker fiyatı | 25 coin |
| Referans ödülü — yeni kullanıcı | **250** coin |
| Referans ödülü — mevcut kullanıcı | **100** coin |

- "Yeni kullanıcı" tanımı: daveti kabul edenin `createdAt >= invite.createdAt`
- Tüm hareketler `coin_transactions` defterine yazılır. Sebep türleri: `daily_login`, `purchase`, `joker_purchase`, `friend_referral`, `admin`, `refund`
- Günlük claim `SELECT ... FOR UPDATE` ile transaction içinde yapılır
- Bakiye yetersizse `InsufficientCoinsError` → 400
- Referans ödülü verilemezse loglanır ama **davet kabulü başarılı sayılır**

### Haftalık döngü (promotion/demotion)

`runWeeklyProcessing()` (`src/routes/votes.ts`) — her oy isteğinde `lastProcessedWeek < currentWeekStart()` kontrolüyle tetiklenir (cron yok):

1. Önceki haftanın karara bağlanmamış oyları offset işaretine göre sonuçlandırılır (offset 0 ise **kazanan yok**)
2. Tüm sonuçlar `weekly_results`'a arşivlenir
3. Aktif matchup sayısı **≥5** ise, o hafta en az oy alan matchup önerilere düşürülür (`source: "demoted"`)
4. En çok oy alan, henüz terfi etmemiş öneri (oyu >0 olmak zorunda) matchup'a terfi ettirilir; 5 hazır renk paletinden biri atanır, emoji ⚔️
5. Tüm `leftWins`/`rightWins` sıfırlanır
6. Kullanıcı önerileri silinir (`demoted` olanlar korunur)
7. `weekly_processing.lastProcessedWeek` güncellenir

---

## 11. İstemci mimarisi

### Rotalar

```
/ (index)                 Ana menü, mod seçimi, coin, dil
├── /quick-game           15 seviyeli tek oyunculu
├── /online               Matchup listesi
│   └── /game?params      Oylama oynanışı
├── /1v1                  Gerçek zamanlı PvP
├── /friends              Arkadaşlar (FRIENDS_ENABLED ise)
├── /invite/friend/:id    Deep link: arkadaş daveti
└── /invite/game/:id      Deep link: oyun daveti → /1v1
```

`app/(tabs)/` altındaki dosyalar legacy scaffold — `/`'a yönlendiriyor.

### Context'ler

**`AuthContext`** — `user`, `token`, `playerToken`, `coinBalance`, `dailyReward`, `isLoading`. Boot'ta AsyncStorage'dan anında hidratasyon, ardından `ensureSession()` + günlük claim. `sessionLock` ref'i ile single-flight (eşzamanlı oturum isteklerini engeller).

**`LocaleContext`** — `preference` (`system`/`tr`/`en`), `@tugup/language` anahtarında saklanır.

### AsyncStorage anahtarları (tam liste)

| Anahtar | İçerik |
|---|---|
| `@tugup_auth_token` | Bearer oturum token'ı |
| `@tugup_display_name` | Görünen ad |
| `@tugup_friend_code` | Arkadaş kodu |
| `@tugup_user_id` | Kullanıcı UUID |
| `@tugup_coin_balance` | Son bilinen bakiye |
| `@tugup_daily_reward_seen` | Popup kapatılan UTC tarih |
| `@tugup/language` | Dil tercihi |
| `@tugup_onboarding_online_done` | Online onboarding tamamlandı |
| `@tugup_onboarding_1v1_done` | 1v1 onboarding tamamlandı |
| `@tugup_quickgame_tutorial` | Hızlı oyun tutorial'ı görüldü |
| `@tugup_quickgame_progress` | `{ unlockedUpTo, timeJokersLeft, bombJokersLeft, turboJokersLeft }` |
| `@tugup_quickgame_besttimes` | `{ [levelId]: kalanSaniye }` |
| `@tugup_matchups_cache` | Matchup listesi JSON (cold start için) |
| `player_token` | 1v1 oyuncu token'ı — **`@tugup_` ön eki YOK** (tutarsızlık) |
| `cooldown_end_${matchupId}` | Oy cooldown bitiş zamanı (ms) — ön ek yok |

### Bileşenler

`AppIcon` (Ionicons sarmalayıcı + `CrownIcon`/`TrophyIcon`), `IconSlot` (yuvarlak ikon kabı), `JokerIcon` (tip→ikon/renk eşlemesi), `ArenaAtmosphere` (sahne arka planı + vinyet), `HomeBannerAd` (+ `.web.tsx` no-op), `ErrorBoundary`/`ErrorFallback`, `EditNameModal`, `LanguageSwitch`, `KeyboardAwareScrollViewCompat` (şu an kullanılmıyor).

### Tasarım sistemi (`constants/theme.ts`)

Marka paleti: sıcak demir + halat tonları, genel "slate + Tailwind rainbow" değil.

| Token | Değer | Kullanım |
|---|---|---|
| `bg` / `bgMid` | `#0a0e16` / `#121826` | Arka plan |
| `surface` / `surfaceRaised` | `#171e2b` / `#1e2738` | Kart / modal |
| `border` / `borderSoft` | `#2c3648` / `#243044` | Kenarlıklar |
| `text` / `textMuted` / `textDim` | `#f2ebe3` / `#8b95a8` / `#5c6678` | Metin hiyerarşisi |
| `rope` / `ropeSoft` | `#d4a05a` / `#e8c48a` | Marka vurgusu |
| `ember` / `emberDeep` | `#e85d2a` / `#b8431c` | Birincil CTA |
| `gold` | `#e0b14a` | Coin / ödül |
| `modes.quick/oneVsOne/online` | `#e85d2a` / `#4a8fd4` / `#3fa87a` | Mod renkleri |

Tipografi presetleri: `type.display`, `screenTitle`, `sectionTitle`, `body`, `caption`, `label`, `back`, `button`. Paylaşılan stiller `constants/ui.ts`'de. `constants/colors.ts` legacy (sadece `ErrorFallback` ve `+not-found` kullanıyor).

### i18n

`locales/tr.json` + `locales/en.json` paralel yapıda. Bölümler: `home`, `profile`, `settings`, `common`, `online`, `oneVsOne`, `friends`, `invite.*`, `quickGame`, `game`. Fallback `en`; `"system"` tercihi cihaz dili `tr` ise Türkçe'ye çözülür.

### Assets

- `assets/images/` — `character.png`, `character_hero.png`, `hand_rope_tile.png`, `rope.png`, `icon.png` + 15 seviye cismi (kebab-case: `bowling-ball.png`, `washing-machine.png`, `pickup-truck.png` …)
- `assets/images/stages/` — 15 sahne arka planı, seviyelerle 1:1 eşleşiyor. **Hepsi gerçek PNG24 olmalı**: daha önce JPEG içerikli `.png` dosyaları AAPT hatası verip Android build'i kırmıştı
- `assets/sounds/` — `pull.wav`, `tick.wav`, `win.wav`, `lose.wav`
- Kodda referans verilmeyen artıklar: `fridge_ai.png`, `fridge_raw.png`

### Özellik bayrakları

| Bayrak | Değer | Yer | Etki |
|---|---|---|---|
| `FRIENDS_ENABLED` | **`true`** | `lib/features.ts` | Arkadaşlar ekranı, ana menü butonu, 1v1 davet modu, davet deep linkleri |
| `SUGGESTIONS_ENABLED` | **`false`** | `app/online.tsx` | "Mücadele Öner" formu + oylama listesi gizli. Hem UI'ı hem fetch'i tek yerden kontrol eder |

---

## 12. Reklamlar (AdMob)

| Tür | Env değişkeni | Değer |
|---|---|---|
| Rewarded | `EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID` | `ca-app-pub-5692796466438151/4906976811` (fallback: Google test ID) |
| Banner | `EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID` | `ca-app-pub-5692796466438151/1879967539` |
| App ID (Android) | `app.json` plugin | `ca-app-pub-5692796466438151~2238627042` |
| App ID (iOS) | `app.json` plugin | `ca-app-pub-3940256099942544~1458002511` — **hâlâ Google test ID'si** |

**İki rewarded kullanım noktası:**
1. Online oy modunda 1 saatlik cooldown'ı atlama (günde maks 3, sunucu taraflı)
2. Hızlı oyunda +1 joker kazanma

**Platform davranışı:**
- **Web:** `ad-helper.web.ts` no-op; reklam izlenmiş sayılır ve ödül doğrudan verilir
- **Expo Go:** Native modül bulunamaz → rewarded `onError`'a düşer, banner gizlenir. Gerçek reklam için dev client veya EAS build şart
- Banner yerleşimi: ana menü, online liste, hızlı oyun seviye ekranı, 1v1 mod seçimi/bekleme — **aktif oynanış sırasında yok**
- `initMobileAds()` başlangıçta çağrılır; max ad content rating MA, 18+ yapılandırması
- EAS post-install hook'u `scripts/patch-google-ads.js` ile Google Ads SDK'yı **24.9.0**'a sabitliyor (Kotlin/Java uyumluluğu)

---

## 13. Altyapı ve deploy

### Render (`render.yaml`)

| Alan | Değer |
|---|---|
| Servis | `tugup-api`, type `web`, runtime `node` |
| **Plan** | **`free`** |
| Bölge | `frankfurt` |
| Build | `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @workspace/api-server run build` |
| Start | `node artifacts/api-server/dist/index.mjs` |
| Health check | `/api/healthz` |
| Env | `NODE_VERSION=22.14.0`, `DATABASE_URL` (elle secret), `JWT_SECRET` (`generateValue: true`) |

### Render free plan kısıtları — projeyi doğrudan şekillendiriyor

- **15 dakika** trafik almayan servis spin-down oluyor (HTTP **ve** WebSocket mesajları trafik sayılıyor)
- Uyanma **50+ saniye** sürebiliyor (ölçülen: ~22 s). Render dashboard'u da bu uyarıyı gösteriyor
- Uyanırken router isteği bekletmek yerine **502/503/504** döndürüyor — ama o istek uyanmayı tetikliyor
- **Workspace başına ayda 750 instance-hour.** Bir ay ~730 saat; 7/24 ayakta tutmak bütçenin neredeyse tamamını yer ve ikinci bir free servisi imkânsız kılar. Limit dolarsa Render **tüm** free servisleri ay sonuna kadar askıya alır

### Keep-alive cron (kurulu)

- Servis: **cron-job.org** (ücretsiz, kredi kartsız, 1 dk minimum aralık, saat aralığı desteği)
- Hedef: `https://tugup-api.onrender.com/api/healthz`
- Zamanlama: `*/10 0,9-23 * * *`, saat dilimi **Europe/Istanbul** → TR saatiyle 09:00–01:00 arası her 10 dakika
- Maliyet: ~16 saat/gün ≈ **486 instance-hour/ay** (750'lik bütçenin ~%65'i)
- **Beklenen gürültü:** Servis uyuduktan sonraki ilk ping 503 alır ve "failed" görünür; uyanmayı yine tetikler, sonraki ping'ler 200 döner. cron-job.org ücretsiz planda isteği 30 saniyede kestiği için bu kaçınılmaz. Hata bildirimleri kapatılmalı

### Mobil build (EAS)

Yetkili dosya: `artifacts/tug-of-war-mobile/eas.json` (kökteki `eas.json` eksik bir stub).

| Profil | Ayarlar |
|---|---|
| `development` | `developmentClient: true`, internal, iOS simulator, Android APK |
| `preview` | internal, Android APK, `gradleCommand: :app:assembleRelease` |
| `production` | `autoIncrement: true`, Android APK |

Üç profilin hepsinde aynı env: `EXPO_PUBLIC_API_BASE`, iki AdMob unit ID. CLI: `requireCommit: false`, `appVersionSource: remote`. EAS projectId: `56b66774-b27c-4e86-a161-d1796f133f0d`.

> ⚠️ **`expo-updates` KURULU DEĞİL** — OTA güncelleme yok. Her JS değişikliği yeni build gerektiriyor. Hızlı istemci düzeltmeleri için EAS Update eklemek değerli olur.

---

## 14. Cold start stratejisi (mevcut durum)

Render free plan'ın 50+ saniyelik uyanma süresi, katmanlı bir savunmayla ele alındı:

**1. Ağ katmanı** (`lib/api.ts`)
- `COLD_START_TIMEOUT_MS = 75_000` — spin-up'ı bekleyecek kadar uzun timeout
- `fetchWithTimeout()` — `AbortController` ile asılı istekleri keser
- `isColdStartStatus()` — 502/503/504'ü "hata" değil "uyanıyor" olarak sınıflar
- `fetchThroughColdStart()` — 2 s'den 8 s'ye artan aralıklarla 75 saniyelik pencere boyunca yeniden dener. **Yalnızca GET/HEAD** tekrar eder; POST yeniden gönderilirse yan etki doğabilir
- `warmUpApi()` — 60 s throttle'lı, ateşle-ve-unut `/api/healthz` ping'i

**2. Prewarm** (`app/_layout.tsx`)
Uygulama açılışında ve her foreground'a dönüşte `warmUpApi()`. Kullanıcı menüde gezinirken (tipik 10-30 s) uyanma paralelde ilerliyor.

**3. Cache-first ekran** (`app/online.tsx`)
Matchup listesi `@tugup_matchups_cache`'e yazılıyor; ekran açılır açılmaz son bilinen liste boyanıyor, güncelleme arka planda `RefreshControl` göstergesiyle iniyor. Ağ hatası olur ve cache varsa kullanıcı hata ekranı **görmüyor**.

**4. Dürüst yükleme durumu**
Cache yoksa: 3 iskelet kart → 4 saniye sonra (veya ilk 503'te hemen) "Sunucu uyanıyor…" → başarısızlıkta bulut-offline ikonlu hata kutusu + "Tekrar Dene". Aşağı çekerek yenileme de var.

**5. Sunucu boot sırası** (`src/index.ts`)
Port **önce** bind edilir, şema hazırlığı sonra gelir. `/api/healthz` DB uyanmadan da 200 döner. `ensureSchema` 8 denemeye kadar, üstel backoff (maks 30 s). Kalıcı DB hatasında sunucu health check için ayakta kalır. Varsayılan matchup seed'i modül import'undan çıkarılıp şema hazır olduktan sonraya taşındı.

**Kapsanmayan kalan risk:** Cache yalnızca okunabilir/bayatlaması zararsız veriyi kurtarır. Maça girme (`/game`, `/1v1`) canlı sunucu ister; cron'un kapsamadığı 01:00–09:00 arasında, deploy sonrasında veya çökme sonrasında ilk oyuncu hâlâ ~20-25 saniye bekler (hata ekranı görmez ama bekler).

---

## 15. Bilinen sorunlar, ölü kod ve tutarsızlıklar

Bu bölüm ajan için kritik — bunları bilmeden yapılan değişiklikler yanlış varsayımlara dayanır.

### Ölü kod

| Konu | Detay |
|---|---|
| **WebSocket katmanı tamamen devre dışı** | `src/ws/matchmaking.ts` içindeki `attachWsServer()` **hiçbir yerden çağrılmıyor** (grep ile doğrulandı). Socket.IO protokolü, oda yönetimi, geri sayım yayını yazılmış ama kullanılmıyor. Production 1v1 tamamen HTTP polling. Ayrıca bu dosyadaki kazanma eşiği DB'den (100) okunuyor, oysa canlı HTTP yolu 10 kullanıyor — yeniden aktive edilirse davranış değişir |
| `socket.io-client` | Mobil `package.json`'da var, **hiç import edilmiyor** |
| `driftPerSec` | 15 seviyede tanımlı, **hiç okunmuyor**. Gerçek mekanik −10 burst |
| `TICK_MS = 50` | Tanımlı, kullanılmıyor (timer 1000 ms) |
| `STEP = 1` | `app/game.tsx`'te tanımlı, kullanılmıyor |
| `optionalAuth` | `src/lib/auth.ts`'te tanımlı, hiçbir route'ta yok |
| `areFriends()` | `src/lib/friends.ts`'te var, route'larda kullanılmıyor |
| `drizzle-zod` | `lib/db/package.json`'da bağımlılık, import edilmiyor |
| `KeyboardAwareScrollViewCompat` | Bileşen var, hiçbir ekranda kullanılmıyor |

### Yapılandırma tutarsızlıkları

| Konu | Detay |
|---|---|
| **İki EAS projectId** | Kök `app.json`: `a2ef09b5-…` · Mobil `app.json`: `56b66774-…`. **Mobil olan yetkili** |
| **İki eas.json** | Kökteki stub, env değişkeni ve node/pnpm pin'i içermiyor. Mobil olanı kullanın |
| iOS AdMob App ID | Hâlâ Google test ID'si |
| `scripts/post-merge.sh` | `pnpm --filter db push` yazıyor, paket adı `@workspace/db` → **çalışmaz** |
| `replit.md` | Kısmen doldurulmamış şablon; Node 24 diyor ama proje 22.14.0'a sabit |
| 1v1 eşik uyuşmazlığı | İstemcide 100 fallback'i var ama sunucu her zaman 10 gönderiyor. Kafa karıştırıcı |
| AsyncStorage ön ek | `player_token` ve `cooldown_end_*` anahtarları `@tugup_` ön ekini kullanmıyor |

### Uygulanmamış / eksik

| Konu | Detay |
|---|---|
| **CI yok** | `.github/workflows/` yok. Typecheck/build/test otomasyonu bulunmuyor |
| **Test yok** | Hiçbir pakette test dosyası veya test runner'ı yok |
| Yaş kısıtlaması | Sadece gizlilik politikası HTML'inde yazıyor, API'de **zorlanmıyor** |
| IP rate-limit temizliği | Gizlilik politikası haftalık silme vaat ediyor, **kod yok** |
| Bayat `game_rooms` temizliği | Terk edilmiş public bekleme odaları için TTL/cleanup job'ı yok |
| Public eşleşme yarışı | `POST /api/game/join` sorgusunda `ORDER BY` ve satır kilidi yok; iki oyuncu aynı odayı hedefleyebilir |
| Global rate limiting | Oy dışında hiçbir uçta rate limit yok (`express-rate-limit` kurulu değil) |
| 404 catch-all | Tanımsız route'lar Express varsayılan 404'üne düşüyor |
| Global error handler | Yok; her route kendi try/catch'ini yapıyor |
| Google OAuth | Şema hazır, route yok |
| Friend code ile ekleme | Endpoint yok; arkadaşlık sadece davet linkiyle |
| `cookie-parser` | Bağımlılık kurulu, kullanılmıyor |
| Haftalık iş tetikleyicisi | `runWeeklyProcessing()` sadece bir oy geldiğinde çalışıyor. Bir hafta boyunca hiç oy gelmezse işlem gecikir |

### Mevcut typecheck durumu

- **Mobil:** `npx tsc --noEmit` **temiz**
- **API server:** Lib'ler build edildikten sonra (`tsc --build`) bile **önceden var olan** hatalar mevcut:
  - `src/app.ts:43` — TS7030 "Not all code paths return a value"
  - `src/routes/friends.ts:111,169`, `src/routes/game.ts:418,471` — TS2769 Drizzle `eq()` overload hatası (`req.params` `string | string[]` tipinde)
  - `src/routes/votes.ts` — TS7006 implicit any + TS2339 property hataları
  
  Bunlar deploy'u engellemiyor (esbuild tip kontrolü yapmaz) ama temizlenmeye değer.

---

## 16. Edge case'ler (kodda açıkça ele alınanlar)

| Durum | Davranış |
|---|---|
| Aynı misafir oturumunu devralma | Mevcut oturum döner |
| Arkadaş davetini tekrar kabul | Idempotent, `{ alreadyAccepted: true }` |
| Kendi davetini kabul | 400 |
| Kullanılmış/süresi geçmiş davet | 410 |
| Oy rate limit | 200 + `accepted: false` + `cooldownSeconds` |
| Günlük reklam limiti | 429 |
| Öneriye tekrar oy | `{ accepted: false, reason: "already_voted" }` |
| Yetersiz coin | 400 |
| Geri sayım bitmeden çekiş | 400 `gameNotStarted` |
| Bitmiş oyunda çekiş | 400 |
| Yanlış player token | 403 |
| Aktif oyuna yeniden katılma | Mevcut oda döner |
| Friend code çakışması | 8 deneme, sonra UUID fallback |
| DB boot yarışı | 8 deneme, üstel backoff |
| DB kalıcı erişilemez | Sunucu healthz için ayakta kalır |
| Referans ödülü hatası | Loglanır, kabul başarılı sayılır |
| Haftalık berabere (offset 0) | Kazanan kaydedilmez |
| ≥5 aktif matchup | En az oy alan düşürülür |
| Bozuk matchup cache | Yok sayılır, ağdan taze liste gelir |
| Son saniyede kazanma | "Son saniyede bitirildi!" metni |

---

## 17. Env değişkenleri

### Sunucu

| Değişken | Zorunlu | Nerede | Amaç |
|---|---|---|---|
| `PORT` | ✅ | `src/index.ts` | Dinleme portu (Render enjekte eder) |
| `DATABASE_URL` | ✅ (import anında) | `lib/db/src/index.ts` | PostgreSQL bağlantısı |
| `JWT_SECRET` | ⚠️ (dev fallback var) | `src/lib/auth.ts` | Token imzalama |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | — | `lib/db/src/index.ts` | Aiven/bulut SSL için `"false"` |
| `NODE_ENV` | — | `logger.ts` | Pretty log |
| `LOG_LEVEL` | — | `logger.ts` | Pino seviyesi (varsayılan `info`) |
| `ANDROID_PACKAGE_NAME` | — | `src/app.ts` | assetlinks (varsayılan `com.tugup.game`) |
| `ANDROID_SHA256_FINGERPRINTS` | — | `src/app.ts` | App Links sertifika parmak izleri; boşsa 503 |
| `INVITE_PUBLIC_BASE` / `PUBLIC_API_BASE` | — | `src/lib/inviteLinks.ts` | Paylaşılabilir davet URL tabanı |

### İstemci

| Değişken | Nerede | Amaç |
|---|---|---|
| `EXPO_PUBLIC_API_BASE` | `lib/api.ts` | API host (varsayılan `https://tugup-api.onrender.com`) |
| `EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID` | `native/ad-helper.ts` | Rewarded reklam birimi |
| `EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID` | `native/ad-helper.ts` | Banner reklam birimi |
| `EXPO_PUBLIC_DOMAIN`, `EXPO_PUBLIC_REPL_ID` | dev script, `scripts/build.js` | Replit dağıtım meta verisi |

Ayrıca bir dizi `REPLIT_*` değişkeni sadece Replit içi geliştirme için kullanılıyor.

---

## 18. Geliştirme akışı

```bash
# Kurulum
cd "/Users/emreakin/TugUp Game" && pnpm install

# Tip kontrolü
pnpm run typecheck:libs                 # lib'leri build et (project references)
pnpm run typecheck                      # lib'ler + tüm artifact'lar
cd artifacts/tug-of-war-mobile && npx tsc --noEmit -p tsconfig.json

# API lokal
export PORT=8080 DATABASE_URL=... JWT_SECRET=...
pnpm --filter @workspace/api-server run dev

# DB şema push
pnpm --filter @workspace/db run push

# OpenAPI codegen
pnpm --filter @workspace/api-spec run codegen

# Mobil
cd artifacts/tug-of-war-mobile && pnpm exec expo start
```

**Gotcha'lar:**
1. Lib'ler build edilmeden api-server typecheck'i TS6305 "output file has not been built" hatası verir. Önce `tsc --build`
2. AdMob **Expo Go'da çalışmaz** — dev client veya EAS build şart
3. Telefon ile bilgisayar **aynı Wi-Fi ağında** olmalı; mobil veriyle dev client bağlanamaz (geçmişte yaşandı: telefon `10.x`, Mac `192.168.1.107`)
4. Sahne PNG'leri gerçekten PNG olmalı, uzantısı `.png` olan JPEG Android build'ini kırar
5. Yeni DB kolonu eklerken `schema/index.ts` **ve** `ensureSchema.ts` birlikte güncellenmeli
6. Depo kökünde milestone arşivleri var: `tug-of-war-milestone1.tar.gz`, `tugup-milestone2.tar.gz`

---

## 19. Git durumu ve son çalışmalar

- **Dal:** `main`, `origin/main` ile senkron
- **Son commit:** `37f2997` "cooldown and cache fixes" (15 Eyl 2026, 12:23)
- **Commit edilmemiş:** `artifacts/tug-of-war-mobile/app/online.tsx`, `artifacts/tug-of-war-mobile/lib/api.ts` — 503 dayanıklılık düzeltmesi (`fetchThroughColdStart`)

### Son commit geçmişi

| Hash | Mesaj | Tarih |
|---|---|---|
| `37f2997` | cooldown and cache fixes | 2026-09-15 |
| `2ba7ea4` | quick game scenes and ui upgrades | 2026-09-12 |
| `27013cb` | sql error fix | 2026-09-11 |
| `75e069e` | main page upgrades and quick game opponent icons | 2026-09-02 |
| `f7d2cb0` | age restriction and duplicate user record fix | 2026-08-18 |
| `02609fd` | banner add and fix daily coin popup | 2026-08-12 |
| `2e1c7b7` | coin and name from cache, main page alignments fix | 2026-08-07 |
| `c91b561` | banner ads and deep link check fix | 2026-08-06 |
| `ad01d8f` | earn coin with invite friend | 2026-08-04 |
| `58b6ed3` | coin structure | 2026-08-03 |

### Yakın dönemde tamamlanan görsel kalite çalışmaları

1. **Marka ana ekranı** — hero karakterler, wordmark, halat köprüsü
2. **Emoji → ikon geçişi** — Ionicons tabanlı `AppIcon`/`IconSlot`/`JokerIcon` sistemi
3. **Haptik + ses** — `lib/feedback.ts` + 4 WAV, üç oyun moduna bağlandı
4. **Sahne arka planları** — 15 seviyeye özel MK tarzı sahne görselleri + `ArenaAtmosphere`
5. **Tipografi + renk sistemi** — `constants/theme.ts` / `ui.ts`, hardcoded hex'ler temizlendi
6. **Arena ölçekleme** — büyük cisimlerin taşması çözüldü, oransal küçültme
7. **Joker info popup** — seviye listesinde stok pill'lerine dokununca açıklama modalı
8. **Online matchup ikonları** — DB `emoji` alanı tekrar render ediliyor
9. **Cold start dayanıklılığı** — prewarm + cache + retry + cron

### Olası sonraki adımlar (tartışmaya açık)

- `expo-updates` / EAS Update ekleyerek JS düzeltmelerini build almadan gönderme
- CI (GitHub Actions): typecheck + lint + EAS build tetikleyicisi
- API server'daki mevcut TypeScript hatalarını temizleme
- Ölü WebSocket katmanını ya aktive etme ya da kaldırma
- `game_rooms` için TTL/cleanup job'ı ve public eşleşme yarışını satır kilidiyle çözme
- Haftalık işlemi oy tetikleyicisinden bağımsız bir cron'a taşıma
- OpenAPI spec'ini tüm uçlara genişletip mobili üretilmiş client'a geçirme
- iOS AdMob App ID'sini gerçek değerle değiştirme
- Test altyapısı (en azından coins/votes business kuralları için)
