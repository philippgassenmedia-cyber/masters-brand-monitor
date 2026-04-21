# Masters Brand Monitor

Wöchentliches, KI-gestütztes Monitoring der Marke **„MASTER"** im Immobilienkontext.
Durchsucht das Web via Google Custom Search, extrahiert Impressum-Daten, lässt jeden
Treffer von Gemini bewerten und stellt alles in einem Next.js-Dashboard bereit.

## Architektur

```
Supabase Cron ─▶ /api/cron/weekly-scan ─▶ Google CSE ─▶ Dedup ─▶ Impressum-Scraper
                                                                      │
                                                                      ▼
                                               Gemini (Score + Begründung + Empfehlung)
                                                                      │
                                                                      ▼
                                                Supabase (hits, scan_runs, hit_events)
                                                                      │
                                                                      ▼
                                                 Next.js Dashboard (Supabase Auth)
```

## Setup

### 1. Supabase-Projekt

1. Auf <https://supabase.com> Projekt anlegen (Region EU Frankfurt empfohlen).
2. Im SQL-Editor den Inhalt von [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) ausführen.
3. Unter **Project Settings → API** notieren:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (geheim, nie ins Frontend)
4. Unter **Authentication → Users** einen Nutzer für Masters anlegen (E-Mail + Passwort).

### 2. Google Custom Search Engine

1. Auf <https://programmablesearchengine.google.com> → **Add** → „Search the entire web".
2. Nach dem Erstellen: **Search engine ID** kopieren → `GOOGLE_CSE_CX`.
3. Auf <https://console.cloud.google.com/apis/credentials> einen API-Key erstellen und
   die **Custom Search API** aktivieren → `GOOGLE_CSE_API_KEY`.
4. Free-Tier: 100 Queries/Tag reichen für 6 Suchbegriffe × 3 Seiten = 18 Calls/Woche.

### 3. Gemini API

1. Auf <https://aistudio.google.com/app/apikey> API-Key erzeugen → `GEMINI_API_KEY`.
2. Default-Modell ist `gemini-2.0-flash` (günstig, schnell, JSON-Mode).

### 4. Lokale Entwicklung

```bash
cp .env.example .env.local
# .env.local ausfüllen
pnpm install
pnpm dev
```

Dashboard läuft unter <http://localhost:3000>. Login über die in Schritt 1.4 angelegten
Credentials.

### 5. Deployment auf Vercel

1. GitHub-Repo pushen und in Vercel importieren.
2. Alle Variablen aus `.env.example` unter **Project Settings → Environment Variables**
   hinterlegen.
3. Deploy.

### 6. Wöchentlicher Deep-Scan via Supabase pg_cron

Der Deep-Scan läuft automatisch **Montags 07:00 Europe/Berlin** und analysiert alle
24 Städte mit vollem Impressum-Scraping (kann 1h+ dauern). Der Endpunkt ist durch
`CRON_SECRET` abgesichert.

```sql
-- einmalig
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Montags 07:00 Europe/Berlin = 05:00 UTC (Sommerzeit: 05:00, Winterzeit: 06:00 UTC;
-- nimm 05:00 UTC als Kompromiss oder nutze zwei Einträge)
select cron.schedule(
  'masters-brand-monitor-deep-weekly',
  '0 5 * * 1',
  $$
  select net.http_post(
    url      := 'https://DEINE-VERCEL-DOMAIN.vercel.app/api/cron/weekly-scan',
    headers  := '{"x-cron-secret": "DEIN_CRON_SECRET"}'::jsonb,
    body     := '{}'::jsonb,
    timeout_milliseconds := 3600000
  );
  $$
);
```

> `DEIN_CRON_SECRET` muss mit `CRON_SECRET` in den Vercel-Envs übereinstimmen.
> Der `timeout_milliseconds`-Wert darf hoch sein, weil pg_cron nur den HTTP-Request
> absetzt — die tatsächliche Laufzeit der Pipeline ist durch das Server-Runtime-Limit
> begrenzt (Vercel: `maxDuration = 800s` im Route-Handler).

**Quick-Scan** läuft on-demand über das Dashboard → „Live-Scan öffnen" → Modus „Quick"
(≤ 15 Min, 8 größte Städte, max 40 Treffer, ohne Impressum-Scraping für rascheres
Feedback).

### 7. Manueller Testlauf

```bash
curl -X POST "https://DEINE-DOMAIN/api/cron/weekly-scan" \
  -H "x-cron-secret: DEIN_CRON_SECRET"
```

## Projektstruktur

```
src/
  app/
    page.tsx                 # Dashboard (Treffer-Liste, Filter)
    login/page.tsx           # Supabase Auth Login
    hits/[id]/page.tsx       # Treffer-Detail mit Profil + KI-Bewertung
    api/
      cron/weekly-scan/      # Cron-Endpoint (Secret-geschützt)
      hits/[id]/              # PATCH Status/Notizen
      export/                 # CSV-Export für Anwalt
  lib/
    pipeline.ts              # Orchestriert Scan → Scrape → Analyze → Persist
    google-cse.ts            # Google Custom Search Client
    impressum-scraper.ts     # Cheerio-basierter Impressum-Parser
    gemini.ts                # Gemini JSON-Mode Analyse
    supabase/                # Browser- + Server-Clients (SSR + Service-Role)
    types.ts
supabase/migrations/0001_init.sql
```

## Erfolgskriterien (aus Brief)

- [x] Wöchentlicher Scan-Job vollautomatisch
- [x] KI-Bewertung: Verletzung ja/nein · Score 1–10 · Begründung · Empfehlung
- [x] Verletzer-Profil: Name · Adresse · E-Mail · Telefon · Social-Links
- [x] Dashboard mit Filter nach Relevanz, Status, Datum
- [x] CSV-Export für Anwalts-Übergabe
- [ ] E-Mail-Alert bei neuem High-Score-Treffer *(optional, `RESEND_API_KEY` vorgesehen)*
