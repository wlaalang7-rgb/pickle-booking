const corsHeadersForOrigin = (origin: string | null): Record<string, string> => {
  const siteUrl = Deno.env.get("PUBLIC_SITE_URL");
  let allowedOrigin = "";
  if (origin && siteUrl) {
    try {
      if (new URL(origin).origin === new URL(siteUrl).origin) allowedOrigin = origin;
    } catch {
      allowedOrigin = undefined;
    }
  }
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
};

const json = (body: Record<string, unknown>, status = 200, corsHeaders: Record<string, string> = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]));

const sha256Hex = async (value: string) => [...new Uint8Array(await crypto.subtle.digest(
  "SHA-256",
  new TextEncoder().encode(value),
))].map((byte) => byte.toString(16).padStart(2, "0")).join("");

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  const corsHeaders = corsHeadersForOrigin(origin);
  const allowedOrigin = Boolean(corsHeaders["Access-Control-Allow-Origin"]);
  if (request.method === "OPTIONS") {
    return new Response(origin && !allowedOrigin ? "Origin not allowed." : "ok", {
      status: origin && !allowedOrigin ? 403 : 200,
      headers: corsHeaders,
    });
  }
  if (origin && !allowedOrigin) return json({ error: "Origin not allowed." }, 403, corsHeaders);
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, corsHeaders);

  try {
    const { booking_id: bookingId, cancellation_token: cancellationToken } = await request.json();
    if (typeof bookingId !== "string" || !/^[0-9a-f-]{36}$/i.test(bookingId)
      || typeof cancellationToken !== "string" || !/^[0-9a-f]{64}$/i.test(cancellationToken)) {
      return json({ error: "Invalid booking confirmation details." }, 400, corsHeaders);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    const senderEmail = Deno.env.get("BREVO_SENDER_EMAIL");
    const senderName = Deno.env.get("BREVO_SENDER_NAME") || "PickleRally";
    const publicSiteUrl = Deno.env.get("PUBLIC_SITE_URL")?.replace(/\/$/, "");
    if (!supabaseUrl || !serviceRoleKey || !brevoApiKey || !senderEmail || !publicSiteUrl) {
      console.error("Booking email function is missing required environment settings.");
      return json({ error: "Booking email is not configured yet." }, 503, corsHeaders);
    }

    const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
    const bookingQuery = new URLSearchParams({
      select: "id,booking_group_id,name,email,court,date,time,estimated_total,status,cancellation_token_hash",
      id: `eq.${bookingId}`,
      limit: "1",
    });
    const bookingResponse = await fetch(`${supabaseUrl}/rest/v1/bookings?${bookingQuery}`, { headers });
    if (!bookingResponse.ok) throw new Error("Could not verify the booking.");
    const [booking] = await bookingResponse.json();
    if (!booking || !booking.email || !booking.cancellation_token_hash
      || booking.cancellation_token_hash !== await sha256Hex(cancellationToken)
      || !["pending", "confirmed"].includes(booking.status)) {
      return json({ error: "Booking confirmation details could not be verified." }, 403, corsHeaders);
    }

    let bookings = [booking];
    if (booking.booking_group_id) {
      const groupQuery = new URLSearchParams({
        select: "court,date,time,estimated_total",
        booking_group_id: `eq.${booking.booking_group_id}`,
        status: `eq.${booking.status}`,
        order: "court.asc",
      });
      const groupResponse = await fetch(`${supabaseUrl}/rest/v1/bookings?${groupQuery}`, { headers });
      if (groupResponse.ok) bookings = await groupResponse.json();
    }

    const reference = booking.id;
    const cancellationUrl = `${publicSiteUrl}/#cancel-booking?reference=${encodeURIComponent(reference)}&token=${encodeURIComponent(cancellationToken)}`;
    const courtLines = bookings.map((item: { court: string; date: string; time: string; estimated_total: number }) => (
      `<li>${escapeHtml(item.court)} — ${escapeHtml(item.date)} at ${escapeHtml(item.time)} · ₱${Number(item.estimated_total).toLocaleString("en-PH")}</li>`
    )).join("");
    const htmlContent = `<!doctype html><html><body style="margin:0;background:#f5f5ef;color:#20271e;font-family:Arial,sans-serif"><main style="max-width:560px;margin:32px auto;padding:32px;background:#fffefa;border:1px solid #dfe4d8"><p style="font-size:12px;letter-spacing:2px;color:#63715b">PICKLERALLY · BOOKING REQUEST</p><h1 style="font-size:28px">You're on your way to the court.</h1><p>Hi ${escapeHtml(booking.name)}, we received your booking request.</p><p><strong>Reference:</strong> ${escapeHtml(reference)}</p><ul>${courtLines}</ul><p>Your request is pending until our team confirms it. No payment has been taken.</p><p style="margin:28px 0"><a href="${escapeHtml(cancellationUrl)}" style="display:inline-block;padding:13px 18px;background:#253321;color:#fff;text-decoration:none">Cancel this booking</a></p><p style="font-size:12px;color:#63715b">This secure cancellation link is valid for 48 hours. Keep this email for your reference.</p></main></body></html>`;
    const textContent = [
      `Hi ${booking.name}, we received your PickleRally booking request.`,
      `Reference: ${reference}`,
      ...bookings.map((item: { court: string; date: string; time: string; estimated_total: number }) => `${item.court} — ${item.date} at ${item.time} · ₱${Number(item.estimated_total).toLocaleString("en-PH")}`),
      "Your request is pending until our team confirms it. No payment has been taken.",
      `Secure cancellation link (valid for 48 hours): ${cancellationUrl}`,
    ].join("\n\n");

    const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": brevoApiKey, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email: booking.email, name: booking.name }],
        subject: `PickleRally booking reference ${reference}`,
        htmlContent,
        textContent,
        tags: ["booking-reference"],
      }),
    });
    if (!brevoResponse.ok) {
      console.error("Brevo rejected a booking reference email with status", brevoResponse.status);
      return json({ error: "Brevo could not send the booking email. Check the sender and API settings." }, 502, corsHeaders);
    }
    return json({ success: true }, 200, corsHeaders);
  } catch (error) {
    console.error("Booking reference email failed:", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "The booking email could not be sent." }, 500, corsHeaders);
  }
});
