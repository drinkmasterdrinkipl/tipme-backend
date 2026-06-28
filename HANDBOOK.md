# TIP FOR ME — Praktyczny Book Aplikacji

> Kompletna dokumentacja projektu do odtworzenia kontekstu w razie utraty danych / nowej sesji.
> **Ostatnia aktualizacja:** 2026-06-28
> **Status ogólny:** Aplikacja iOS **w recenzji Apple** → backend i kod natywny **zamrożone** (nie ruszamy płatności/SDK do czasu akceptacji).

> ⚠️ **BEZPIECZEŃSTWO:** Ten plik leży w repozytorium git z remote na GitHub. **NIE wpisuj tu haseł, kluczy ani sekretów.** Sekrety trzymaj w menedżerze haseł i w panelu Render (env vars). Poniżej są tylko *nazwy* i *lokalizacje* sekretów, nie ich wartości.

---

## 1. Czym jest aplikacja

**Tip For Me** — mobilna aplikacja (iOS) do przyjmowania **napiwków kartą bezpośrednio na telefonie** przez **Tap to Pay on iPhone** (bez dodatkowego terminala/czytnika). Klient przykłada kartę/telefon do iPhone'a kelnera → napiwek trafia na konto Stripe odbiorcy. Wypłata na konto bankowe w ~7 dni roboczych.

- **Grupa docelowa:** kelnerzy, barmani, fryzjerzy, dostawcy, usługi — każdy kto przyjmuje napiwki.
- **Model:** odbiorca zakłada konto → przechodzi onboarding Stripe Connect (weryfikacja tożsamości/konta) → włącza Tap to Pay → przyjmuje napiwki.
- **Minimalna kwota napiwku:** 5 zł.
- **Strona WWW:** https://tipforme.app

### Dane firmy (działalność ZAREJESTROWANA)
- Nazwa: **Tip For Me Adrian Chwaściński**
- NIP: **6582004736**
- REGON: **544609441**
- Kontakt: kontakt@adrianchwascinski.pl / chwascinski@icloud.com

---

## 2. Gdzie się znajduje (lokalizacje na dysku)

| Element | Ścieżka |
|---|---|
| **Cały projekt** | `/Users/adrianchwascinski/tipme-project/` |
| Aplikacja mobilna (Expo/RN) | `/Users/adrianchwascinski/tipme-project/app/` |
| Backend (Node/Express) | `/Users/adrianchwascinski/tipme-project/backend/` |
| Strona WWW (kopia w repo) | `/Users/adrianchwascinski/tipme-project/web/` |
| Robocza kopia strony (do FTP) | `/tmp/tipweb/` (uwaga: `/tmp` znika po restarcie!) |
| Dokumentacja Stripe | `/Users/adrianchwascinski/tipme-project/docs/stripe-setup.md` |

- **Repozytorium git:** lokalne repo z remote `origin` = `https://github.com/drinkmasterdrinkipl/tipme-backend.git`
- **Render auto-deployuje backend z tego repo przy `git push`** (gałąź `main`).

---

## 3. Stack technologiczny

**Aplikacja (`app/`):**
- React Native + **Expo SDK 54** (EAS Build), TypeScript
- Nawigacja: React Navigation v7 (native-stack + bottom-tabs)
- Płatności: **@stripe/stripe-terminal-react-native `0.0.1-beta.29`** (Tap to Pay)
- AsyncStorage (lokalne dane: stripeAccountId, locationId, flagi TTP)
- Cel iOS: **iOS 18.0+** (wymóg Tap to Pay), buildNumber w `app.json`

**Backend (`backend/`):**
- Node.js + **Express 4**
- **Stripe SDK ^14** (Connect + Terminal + PaymentIntents)
- Auth: **JWT** (jsonwebtoken) + **bcryptjs** (hash hasła)
- Mail: **nodemailer** (SMTP) — potwierdzenia/paragony, reset hasła
- Rate limiting: `express-rate-limit` + własne limity w pamięci
- Hosting: **Render.com** (web service)

**Strona WWW (`web/` → FTP):**
- Statyczny HTML/CSS/JS, hosting nazwa.pl

---

## 4. Architektura (jak to działa razem)

```
[iPhone kelnera: aplikacja Tip For Me]
        │  (JWT, HTTPS)
        ▼
[Backend Express na Render]  ──►  [Stripe: Connect + Terminal + PaymentIntents]
        │                                      ▲
        │  (webhook /api/webhook)              │
        └──────────────────────────────────────┘
```

**KLUCZOWE: Nie ma osobnej bazy danych.**
- **Użytkownicy = Stripe Connected Accounts.** Konto zakładane jako Stripe account, a **hash hasła jest zapisany w `metadata.password_hash` tego konta Stripe**.
- Logowanie: email+hasło → backend szuka konta w Stripe po emailu → weryfikuje hash z metadata → wydaje JWT.
- Historia transakcji, statystyki, salda, wypłaty — **czytane na żywo ze Stripe**, nie z lokalnej bazy.
- Limity płatności (cooldown, dzienny licznik) — **w pamięci backendu** (`new Map()`), więc **resetują się przy każdym restarcie/cold-starcie Rendera**. To akceptowalne (to tylko zabezpieczenie antyspamowe), ale warto pamiętać.

---

## 5. Backend — szczegóły (`backend/server.js`)

### Endpointy (stan: 2026-06-28)
| Metoda | Ścieżka | Opis |
|---|---|---|
| POST | `/api/webhook` | Webhook Stripe (raw body przed express.json) |
| GET | `/api/health` | Health check |
| POST | `/api/create-connected-account` | Rejestracja: tworzy konto Stripe Connect + hash hasła w metadata |
| POST | `/api/auth/login` | Logowanie → JWT |
| POST | `/api/auth/forgot-password` | Wysyła link resetu na email |
| POST | `/api/auth/reset-password` | Ustawia nowe hasło z tokenu |
| GET | `/api/account-status/:accountId` | Status onboardingu Stripe |
| POST | `/api/create-location` | Lokalizacja Stripe Terminal (wymagana do Tap to Pay) |
| POST | `/api/connection-token` | Token połączenia dla Terminal SDK |
| POST | `/api/create-payment-intent` | Tworzy PaymentIntent na napiwek (tu są limity!) |
| POST | `/api/cancel-payment-intent` | Anuluje niedokończony PI (czyści dashboard) |
| POST | `/api/refund` | Zwrot (z guardem przed podwójnym zwrotem) |
| GET | `/api/transactions/:accountId` | Historia transakcji |
| GET | `/api/stats/:accountId` | Statystyki |
| POST | `/api/send-receipt` | Wysyła potwierdzenie/paragon na email |
| GET | `/api/balance/:accountId` | Saldo |
| GET | `/api/account-details/:accountId` | Dane konta |
| GET | `/api/payouts/:accountId` | Wypłaty |
| GET | `/api/payouts-annual/:accountId` | Wypłaty roczne (zestawienie) |
| GET | `/api/dashboard-link/:accountId` | Link do Stripe Express Dashboard |
| DELETE | `/api/delete-account` | Usunięcie konta |

### Ważne stałe (server.js, ~linia 189-196)
```js
const PAYMENT_COOLDOWN_MS = 3 * 1000;    // 3 s między płatnościami (było 25 s) — anty-podwójne-tapnięcie
const DAILY_PAYMENT_LIMIT = 200;         // dzienny limit / konto (było 50)
const paymentLastTime = new Map();       // accountId -> timestamp (w pamięci!)
const paymentDailyCount = new Map();     // accountId -> { count, date } (w pamięci!)
```
> Powód zmiany cooldownu: opłata Stripe (~0,40 zł) jest tylko za **faktyczną** płatność (przyłożona karta), nie za samo wybicie kwoty — długi cooldown był zbędny i blokował szybkie kolejne napiwki.

### Zmienne środowiskowe (ustawiane w Render → Environment, NIE w kodzie)
- `STRIPE_SECRET_KEY` — klucz Stripe (live)
- `STRIPE_WEBHOOK_SECRET` — sekret webhooka
- `JWT_SECRET` — podpis tokenów
- `API_SECRET` — opcjonalna ochrona API (x-api-key)
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` — konto mailowe (nodemailer)
- `NODE_ENV` = `production`, `PORT` = `10000`

### Deployment backendu
1. Edytuj `backend/server.js`.
2. `git add backend/server.js && git commit -m "..." && git push origin main`
3. **Render auto-deployuje** z gałęzi `main` (Events → widać deploy). Jak auto-deploy off → Manual Deploy.
- URL produkcyjny backendu: **https://tipme-backend-2rcv.onrender.com** (zdefiniowany w `app/config.ts` jako `API_URL`).
- Plik `render.yaml` (w repo root) opisuje serwis: `rootDir: backend`, `node server.js`.

---

## 6. Aplikacja — szczegóły (`app/`)

### Tożsamość buildu (`app/app.json`)
- name: **Tip For Me**, slug: `tipme`, version: `1.0.0`
- iOS bundleIdentifier: **com.drinki.tipme**
- buildNumber: **35** (zwiększać przy każdym nowym buildzie)
- EAS projectId: `ac00f3ac-03e3-4ff5-856e-67134992d9a3`
- Deployment target iOS: **18.0** (plugin `set-deployment-target.js`)

### Pliki kluczowe
| Plik | Rola |
|---|---|
| `app/App.tsx` | Root: providery, `StripeTerminalProvider` (tokenProvider), routing, ekrany startowe |
| `app/config.ts` | `API_URL` + helper `apiFetch` (dokleja JWT) |
| `app/theme.ts` | Kolory `C` (design system) |
| `app/types.ts` | Typy nawigacji (`StackScreenProps`) |
| `app/AppContext.tsx` | Globalny kontekst |
| `app/screens/` | Wszystkie ekrany (niżej) |
| `app/plugins/` | Config pluginy EAS (proximity reader, aps-environment, deployment target) |
| `app/patches/` | **patch-package** — patch na SDK Stripe (patrz §8) |

### Ekrany (`app/screens/`)
- `OnboardingScreen.tsx` — rejestracja/logowanie + start onboardingu Stripe
- `StripeWebViewScreen.tsx` — WebView onboardingu Stripe Connect
- `HomeScreen.tsx` — ekran główny; "warmup" Tap to Pay (discoverReaders gdy TTP włączone)
- `TapScreen.tsx` — **GŁÓWNY ekran płatności**: discover → connect → collect → confirm; obsługa błędów (`translateError`) + reconnect
- `SuccessScreen.tsx` — ekran sukcesu po płatności
- `TapToPayWelcomeScreen.tsx`, `TapToPayEducationScreen.tsx` — edukacja/aktywacja TTP (wymóg Apple)
- `HistoryScreen.tsx`, `StatsScreen.tsx`, `WalletScreen.tsx`, `AccountDetailsScreen.tsx` — historia/statystyki/portfel/dane
- `SettingsScreen.tsx` — ustawienia, wyłączenie TTP, usunięcie konta
- `ResetPasswordScreen.tsx` — reset hasła

### Build aplikacji (EAS)
- Profile w `app/eas.json`.
- Build: `eas build --platform ios --profile production` (z katalogu `app/`).
- Po buildzie: submit do App Store / TestFlight.
- **Zwiększyć `buildNumber` w `app.json` przed każdym buildem.**

---

## 7. Strona WWW (tipforme.app)

- Pliki: kopia w `web/` (repo) oraz robocza w `/tmp/tipweb/`.
- Zawartość: `index.html`, `style.css`, `script.js`, `stripe-success.html` + dokumenty prawne: `polityka-prywatnosci.html`, `regulamin.html`, `rodo.html`.
- Dokumenty prawne zawierają **zarejestrowane dane firmy** (NIP/REGON).
- **Deploy:** FTP na hosting nazwa.pl. Host FTP: `ftp.server869100.nazwa.pl`. **Dane logowania FTP — w menedżerze haseł, NIE tutaj.**

---

## 8. Stripe Terminal SDK + patch (WAŻNE dla migracji)

- Zainstalowana wersja: **`0.0.1-beta.29`**. Najnowsza dostępna: **`0.0.1-beta.31`**.
- W `app/patches/` jest plik **`@stripe+stripe-terminal-react-native+0.0.1-beta.29.patch`** (~188 KB), nakładany automatycznie przez `patch-package` (postinstall).

### Co robi ten patch (rozszyfrowane 2026-06-28)
Mimo rozmiaru pliku robi **jedną rzecz** — **leniwe + zabezpieczone tworzenie `NativeEventEmitter`**:
- `functions.js`: `if(!eventEmitter){` → `if(!eventEmitter && StripeTerminalReactNative){`
- `useListener.js`: zamiast eager `new NativeEventEmitter(NativeModules.StripeTerminalReactNative)` → leniwa funkcja `_getEmitter()` z guardem `if (!module) return;`

**Po co:** zapobiega crashowi **„`new NativeEventEmitter()` requires a non-null argument"** gdy natywny moduł nie jest gotowy przy starcie. **NIE dotyczy logiki płatności ani reconnect** — to wyłącznie stabilność startu.

### Czy beta.31 zastępuje ten patch?
**NIE.** Sprawdzono kod beta.31 — nadal tworzy emitter „na sztywno", bez guarda. Czyli **patch będzie dalej potrzebny po migracji**.

---

## 9. STATUS: co działa, co poprawione, co czeka

### ✅ Działa dobrze
- Pełny flow płatności Tap to Pay (discover→connect→collect→confirm).
- Rejestracja/logowanie (Stripe Connect + JWT + bcrypt), reset hasła przez email.
- Historia, statystyki, salda, wypłaty (na żywo ze Stripe), zestawienie roczne.
- Wysyłka paragonu/potwierdzenia na email (wymóg Apple 5.10).
- Ekrany edukacyjne Tap to Pay (wymóg Apple), wskaźnik postępu konfiguracji czytnika.
- Anulowanie niedokończonych PaymentIntent (czyści dashboard, brak "Incomplete").
- Guard przed podwójnym zwrotem.

### ✅ Poprawione w sesji 2026-06-28
- **Backend (ZDEPLOYOWANE na Render):**
  - Cooldown płatności **25 s → 3 s**; dzienny limit **50 → 200** (commit `bde3b661`).
  - Komunikat `Unauthorized` → „Brak autoryzacji." (commit `d54dc199`).
- **Aplikacja (W KODZIE, czeka na następny build):**
  - `TapScreen.translateError`: **fallback nigdy nie pokaże angielskiego** — zawsze polski „Coś poszło nie tak…"; oryginał tylko do logu. Dodane wzorce: utrata połączenia z czytnikiem, ogólny błąd czytnika/Stripe.
  - `TapScreen`: **obsługa auto-reconnect** (`onDidStartReaderReconnect` / `...Succeed...` / `...Fail...`) + baner „Ponowne łączenie z czytnikiem…". **To naprawia błąd „chodzenia z telefonem"** (przy ruchu/przeskoku sieci apka czeka na wznowienie zamiast od razu rzucać błąd).
  - `OnboardingScreen`: błędy sieci po polsku zamiast „Network request failed".

### ⏳ Czeka / do zrobienia
1. **Akceptacja Apple** obecnego buildu (build 35). Do tego czasu **NIE wysyłać nowych buildów ani nie ruszać płatności/SDK.**
2. **Następny build** (po akceptacji) — wejdą gotowe poprawki: polskie komunikaty + reconnect. Pamiętać: podnieść `buildNumber`.
3. **Migracja Stripe Terminal SDK → beta.31** (osobne, przetestowane zadanie — patrz §10). Powód: notka Stripe o deprecacji starego natywnego SDK.

### Znane drobiazgi (nie blokują)
- ~30 błędów TypeScript przy `tsc` (m.in. sygnatura `onDidReportReaderSoftwareUpdateProgress`, hoisting `initializeReader`) — **wcześniejsze, nie blokują buildu** (Metro/Babel transpiluje bez sprawdzania typów). Można posprzątać przy okazji.
- Render free/low tier → **cold start** (pierwsze żądanie wolne). Rozważyć wyższy plan.

---

## 10. Przepis na migrację do beta.31 (NA PO AKCEPCJI APPLE)

> Niskie ryzyko, bo patch jest mały i zrozumiały. **Wymaga testu na realnym iPhonie z prawdziwą kartą** (Tap to Pay nie testuje się w symulatorze).

1. `cd app && npm i @stripe/stripe-terminal-react-native@0.0.1-beta.31`
2. Zmień w `app/package.json` wersję na `0.0.1-beta.31`.
3. Nałóż ręcznie te same 2 guardy emittera na `node_modules/@stripe/stripe-terminal-react-native/lib/{commonjs,module}/functions.js` oraz `.../hooks/useListener.js`:
   - `functions.js`: dodaj warunek `&& StripeTerminalReactNative` przy tworzeniu emittera.
   - `useListener.js`: zamień eager `new NativeEventEmitter(...)` na leniwe `_getEmitter()` z guardem `if(!emitter) return;`.
4. `npx patch-package @stripe/stripe-terminal-react-native` → tworzy `@stripe+...+0.0.1-beta.31.patch`.
5. **Usuń** stary `patches/@stripe+...+0.0.1-beta.29.patch`.
6. `npx tsc` (sprawdź że nie ma nowych błędów) + `npx patch-package` (czy nakłada się czysto).
7. **Test Tap to Pay na telefonie z realną kartą.**
8. Podnieś `buildNumber`, `eas build --platform ios --profile production`, submit do Apple.

---

## 11. Powiązany projekt (kontekst)
- **Wrzuto** (`/Users/adrianchwascinski/Desktop/wrzuto`) — osobny portal PHP (narzędzia plików/PDF, monetyzacja pay-per-use Stripe). Niezwiązany z Tip For Me poza tym samym właścicielem. Ma własną dokumentację.
- W `~/CLAUDE.md` jest kontekst innego projektu (**DrinkMaster AI** / drinki.pl) — to **inny** projekt, nie mylić z Tip For Me.

---

## 12. Szybka ściąga „gdyby komputer padł"
1. Kod aplikacji i backendu: w repo git → push jest na GitHub (`drinkmasterdrinkipl/tipme-backend`). **Zrób `git push` regularnie**, żeby kod był w chmurze.
2. Sekrety (klucze Stripe, JWT, SMTP, FTP, hasła App Store/Apple ID): **menedżer haseł** + panel Render (env vars). Nie ma ich w repo.
3. Backend żyje na Render (https://tipme-backend-2rcv.onrender.com) niezależnie od Twojego komputera.
4. Strona żyje na nazwa.pl niezależnie od komputera.
5. Ten plik (`HANDBOOK.md`) = mapa całości. Trzymaj go w repo i pushuj.
