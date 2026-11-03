# Booking email with Brevo

The public and staff booking forms now collect an email address instead of a phone number. A Supabase Edge Function checks the booking ID and cancellation token, then sends the reference and secure cancellation link through Brevo's transactional email API. The Brevo API key stays in Supabase Function Secrets; it is never placed in browser code.

## Finish the Brevo setup

### Website URL: local for now, public after hosting

The website does not have a domain or hosting yet; those will be set up soon. While developing locally, set `PUBLIC_SITE_URL` to the local address used to open the site, including its port (for example, `http://localhost:5500`). Replace that example with your actual local address if the port is different.

The email function accepts browser requests only from this exact origin. After deployment, set `PUBLIC_SITE_URL` to the canonical public site origin, then test from that hostname and redeploy the Edge Function. The origin check is a browser restriction, not authentication; the function also verifies the booking ID and cancellation token against Supabase.

The booking reference email can still be tested locally, but its cancellation link will only open on the same computer running the local site. Clients cannot use a `localhost` link. Once the site is hosted, change `PUBLIC_SITE_URL` in Supabase Function Secrets to the public website origin (for example, `https://your-domain.com`, without a trailing slash). No domain is needed just to prepare the code; a verified sender address is still needed to send email through Brevo.

1. Create or sign in to a Brevo account and enable Transactional Email.
2. Add and verify the sender address or sending domain in Brevo. Use an address on a domain you control for best delivery.
3. Create a Brevo API key with transactional email permission. Do not paste it into this repository or into chat.
4. In Supabase Dashboard → Edge Functions → Secrets, add:

   - `BREVO_API_KEY` — the key from Brevo.
   - `BREVO_SENDER_EMAIL` — the verified sender address.
   - `BREVO_SENDER_NAME` — for example, `PickleRally`.
   - `PUBLIC_SITE_URL` — use the local site URL while testing locally; change it to the public website origin after hosting.

5. Apply the updated `supabase/schema.sql` in Supabase SQL Editor. Review it first; it changes booking phone fields to optional, makes email the promo redemption identity, and changes the admin booking and cancellation RPCs.
6. Link the local folder to the intended Supabase project, then deploy the function:

   ```powershell
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase functions deploy send-booking-reference-email
   ```

7. Submit a test booking using an inbox you control. Check that the email contains the booking reference and that the secure cancellation link works within 48 hours.

Brevo requires a registered sender and an API key for `POST https://api.brevo.com/v3/smtp/email`. See [Brevo's transactional email guide](https://developers.brevo.com/docs/send-a-transactional-email) and [Supabase Edge Function secrets guide](https://supabase.com/docs/guides/functions/secrets).
