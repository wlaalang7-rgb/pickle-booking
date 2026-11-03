# PickleRally

Static court booking site and staff dashboard.

## Structure

- `public/` — deployable website.
- `public/css/` — public and admin styles.
- `public/js/` — browser code, grouped by feature.
- `public/assets/` — images, icons, and fonts.
- `supabase/` — database schema and Edge Function source/configuration.
- `docs/` — Supabase and Brevo setup guides.

### Public JavaScript modules

- `site-state.js` — shared DOM references and page state.
- `site-ui.js` — navigation, scroll behavior, and reveal effects.
- `availability.js` — public court calendar and blocked-time display.
- `booking.js` — court rates, booking availability, pricing, and form submission.
- `cancellation.js` — secure booking cancellation flow.
- `site-extras.js` — gallery, loyalty demo, and QR dialog.

`index.html` loads these classic scripts in dependency order. Shared state remains in `site-state.js`; keep feature code in its matching module.

### Admin JavaScript modules

- `admin-state.js` — dashboard state and DOM references.
- `admin-analytics.js` — overview metrics and charts.
- `admin-booking.js` — admin booking availability and pricing helpers.
- `admin-courts.js` — court rates, images, and promo-code display.
- `admin-calendar.js` — calendar, maintenance blocks, and date helpers.
- `admin-bookings.js` — booking list, rendering, loading, and sign-in flow.
- `admin-actions.js` — dashboard form actions and mutations.
- `admin-navigation-export.js` — page navigation and CSV/Excel exports.

`admin.html` loads these scripts in dependency order. Keep their order intact when editing the script list.

## Credentials and public files

The Supabase project URL and **anon** key in `public/js/supabase-config.js` are browser credentials and are public by design. Supabase access must be limited by database policies; never put a `service_role` key, Brevo API key, staff password, or other privileged credential in `public/`. Brevo and service-role credentials belong in Supabase Edge Function Secrets. `.gitignore` excludes local environment files and private key files.

## Local development

Serve the `public/` directory with a static HTTP server. In VS Code, Live Server can open `public/index.html`. The admin dashboard is at `/admin.html`.

## Cloudflare Pages

Connect the repository to Cloudflare Pages, leave the build command blank, and set the build output directory to `public`. Cloudflare reads the security headers in `public/_headers`. Enable **Always Use HTTPS** and connect the custom domain before sharing the site. The booking database and transactional email run through Supabase. After deployment, set the Supabase Edge Function secret `PUBLIC_SITE_URL` to the live website origin.

Before accepting live bookings, disable public Supabase sign-ups, create staff accounts manually, confirm the latest `supabase/schema.sql` is applied, configure the production Auth Site URL/redirect allowlist, and add the Brevo secrets in Supabase Edge Function Secrets. Customer booking creation is limited to 5 requests/hour and 10/day per email, plus 10/hour and 30/day per IP. Add Turnstile with server-side token verification before a large public promotion for another layer against bots.

See [Supabase setup](docs/SUPABASE-SETUP.md) and [Brevo setup](docs/BREVO-SETUP.md).

## Guides

- [User Guide](docs/USER-GUIDE.md) — booking, availability, and cancellation instructions for players.
- [Admin Manual](docs/ADMIN-MANUAL.md) — staff dashboard operations, access, and deployment notes.

### Keeping the guides current

When a system change affects customer workflows, dashboard behavior, permissions, booking rules, rates, promotions, or deployment, update the relevant guide in the same change. Update both guides when the change affects both players and staff. Verify instructions against the implemented UI and backend behavior; update the Supabase or Brevo setup guides as well when configuration steps change.
