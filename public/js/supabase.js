(() => {
  const sessionKey = "picklerallySupabaseSession";
  const config = window.PICKLERALLY_SUPABASE || {};
  const projectUrl = String(config.url || "")
    .replace(/\/+$/, "")
    .replace(/\/rest\/v1$/i, "");
  const anonKey = String(config.anonKey || config.key || "");
  const courtImageBucket = "court-images";
  const bundledCourtImages = new Set([
    "assets/pickleball-court-real-01.jpg",
    "assets/pickleball-court-real-02.jpg",
    "assets/pickleball-court-real-03.jpg",
    "assets/pickleball-court-real-04.jpg",
  ]);
  const uploadedCourtImagePattern = /^courts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
  const courtImageMimeTypes = new Map([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
  ]);
  const courtImageMaxBytes = 5 * 1024 * 1024;
  const isCourtImagePath = (path) => bundledCourtImages.has(path) || uploadedCourtImagePattern.test(path);
  const isUploadedCourtImage = (path) => uploadedCourtImagePattern.test(path);

  const requireConfig = () => {
    if (!projectUrl || !anonKey) {
      throw new Error("The database is not configured yet. Add your Supabase project URL and anon key in public/js/supabase-config.js.");
    }
  };

  const readSession = () => {
    try {
      const session = JSON.parse(localStorage.getItem(sessionKey) || "null");
      return session && typeof session.access_token === "string" ? session : null;
    } catch (error) {
      throw new Error("Could not read the saved sign-in session from this browser.", { cause: error });
    }
  };

  const saveSession = (session) => {
    try {
      localStorage.setItem(sessionKey, JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: Date.now() + Number(session.expires_in || 3600) * 1000,
      }));
    } catch (error) {
      throw new Error("Could not save your sign-in session. Enable browser storage and try again.", { cause: error });
    }
  };

  const removeSession = () => {
    try {
      localStorage.removeItem(sessionKey);
    } catch (error) {
      throw new Error("Could not clear the saved sign-in session.", { cause: error });
    }
  };

  const parseResponse = async (response) => {
    const responseText = await response.text();
    if (!responseText) return null;
    try {
      return JSON.parse(responseText);
    } catch {
      return responseText;
    }
  };

  const throwResponseError = (response, responseBody, fallback) => {
    const detail = typeof responseBody === "string"
      ? responseBody
      : responseBody?.message || responseBody?.msg || responseBody?.error_description || responseBody?.error;
    const error = new Error(detail || `${fallback} (${response.status}).`);
    error.status = response.status;
    error.code = typeof responseBody === "object" ? responseBody?.code : undefined;
    throw error;
  };

  const request = async (path, { method = "GET", body, accessToken, headers = {} } = {}) => {
    requireConfig();
    const response = await fetch(`${projectUrl}${path}`, {
      method,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken || anonKey}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const responseBody = await parseResponse(response);
    if (!response.ok) throwResponseError(response, responseBody, "Database request failed");
    return responseBody;
  };

  const storageRequest = async (path, { method = "GET", body, accessToken, headers = {} } = {}) => {
    requireConfig();
    const response = await fetch(`${projectUrl}/storage/v1${path}`, {
      method,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken || anonKey}`,
        ...headers,
      },
      ...(body === undefined ? {} : { body }),
    });
    const responseBody = await parseResponse(response);
    if (!response.ok) throwResponseError(response, responseBody, "Image storage request failed");
    return responseBody;
  };

  const refreshSession = async (session) => {
    if (!session?.refresh_token) {
      removeSession();
      return null;
    }
    try {
      const refreshed = await request("/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        body: { refresh_token: session.refresh_token },
      });
      saveSession(refreshed);
      return refreshed;
    } catch (error) {
      if ([400, 401, 403].includes(error.status)) {
        removeSession();
        throw new Error("Your admin session expired. Please sign in again.", { cause: error });
      }
      throw new Error("Could not refresh your admin session. Check your connection and try again.", { cause: error });
    }
  };

  const getAccessToken = async () => {
    const session = readSession();
    if (!session) return null;
    if (Number(session.expires_at) < Date.now() + 60_000) {
      const refreshed = await refreshSession(session);
      return refreshed?.access_token || null;
    }
    return session.access_token;
  };

  const authenticatedRequest = async (path, options = {}) => {
    let accessToken = await getAccessToken();
    if (!accessToken) throw new Error("Your admin session has expired. Please sign in again.");
    try {
      return await request(path, { ...options, accessToken });
    } catch (error) {
      if (error.status !== 401) throw error;
      const currentSession = readSession();
      const refreshed = await refreshSession(currentSession);
      accessToken = refreshed?.access_token;
      if (!accessToken) throw new Error("Your admin session has expired. Please sign in again.");
      return request(path, { ...options, accessToken });
    }
  };

  const authenticatedStorageRequest = async (path, options = {}) => {
    let accessToken = await getAccessToken();
    if (!accessToken) throw new Error("Your admin session has expired. Please sign in again.");
    try {
      return await storageRequest(path, { ...options, accessToken });
    } catch (error) {
      if (error.status !== 401) throw error;
      const refreshed = await refreshSession(readSession());
      accessToken = refreshed?.access_token;
      if (!accessToken) throw new Error("Your admin session has expired. Please sign in again.");
      return storageRequest(path, { ...options, accessToken });
    }
  };

  const encodeStoragePath = (path) => path.split("/").map(encodeURIComponent).join("/");

  window.PickleRallyDB = {
    isConfigured: () => Boolean(projectUrl && anonKey),
    getCourtImageUrl: (path) => {
      if (bundledCourtImages.has(path)) return path;
      if (!isUploadedCourtImage(path)) throw new Error("The court photo path is invalid.");
      return `${projectUrl}/storage/v1/object/public/${courtImageBucket}/${encodeStoragePath(path)}`;
    },
    isUploadedCourtImage,
    validateCourtImageFile: (file) => {
      if (!file || !courtImageMimeTypes.has(file.type)) {
        return "Choose a JPG, PNG, or WebP image.";
      }
      if (file.size > courtImageMaxBytes) {
        return "Court photos must be 5 MB or smaller.";
      }
      return "";
    },
    uploadCourtImage: async (file) => {
      const validationError = window.PickleRallyDB.validateCourtImageFile(file);
      if (validationError) throw new Error(validationError);
      if (!window.crypto?.randomUUID) {
        throw new Error("Secure image uploads require the site to be opened over HTTPS.");
      }
      const path = `courts/${window.crypto.randomUUID()}.${courtImageMimeTypes.get(file.type)}`;
      const encodedPath = encodeStoragePath(path);
      const result = await authenticatedStorageRequest(
        `/object/${courtImageBucket}/${encodedPath}`,
        {
          method: "POST",
          body: file,
          headers: { "Content-Type": file.type, "x-upsert": "false" },
        },
      );
      if (!result || result.Key !== `${courtImageBucket}/${path}`) {
        throw new Error("The uploaded court photo could not be verified.");
      }
      return path;
    },
    deleteCourtImage: async (path) => {
      if (!isUploadedCourtImage(path)) return;
      await authenticatedStorageRequest(`/object/${courtImageBucket}`, {
        method: "DELETE",
        body: JSON.stringify({ prefixes: [path] }),
        headers: { "Content-Type": "application/json" },
      });
    },
    listCourtRates: async () => {
      const rates = await request("/rest/v1/court_rates?select=court,day_rate,night_rate,sort_order,image_path&order=sort_order.asc");
      if (!Array.isArray(rates) || rates.some((rate) => (
        typeof rate.court !== "string"
        || !Number.isInteger(rate.day_rate) || rate.day_rate < 1
        || !Number.isInteger(rate.night_rate) || rate.night_rate < 1
        || !Number.isInteger(rate.sort_order)
        || typeof rate.image_path !== "string"
        || !isCourtImagePath(rate.image_path)
      ))) {
        throw new Error("The court rates returned an invalid response.");
      }
      return rates;
    },
    listPromoCodes: async () => {
      const promoCodes = await authenticatedRequest("/rest/v1/rpc/list_promo_codes", {
        method: "POST",
        body: {},
      });
      if (!Array.isArray(promoCodes) || promoCodes.some((promo) => (
        typeof promo.code !== "string"
        || !["percentage", "fixed"].includes(promo.discount_type)
        || !Number.isInteger(promo.discount_value)
        || typeof promo.active !== "boolean"
        || (promo.expires_at !== null && typeof promo.expires_at !== "string")
        || (promo.max_redemptions !== null && (!Number.isInteger(promo.max_redemptions) || promo.max_redemptions < 1))
        || !Number.isInteger(promo.used_count) || promo.used_count < 0
        || typeof promo.updated_at !== "string"
      ))) {
        throw new Error("The promo-code list returned an invalid response.");
      }
      return promoCodes;
    },
    createPromoCode: async (code, discountType, discountValue, expiresAt, maxRedemptions) => {
      const normalizedCode = code.trim().toUpperCase();
      const timestampMatches = (value) => expiresAt === null
        ? value === null
        : typeof value === "string" && Date.parse(value) === Date.parse(expiresAt);
      const result = await authenticatedRequest("/rest/v1/rpc/create_promo_code", {
        method: "POST",
        body: {
          p_code: normalizedCode,
          p_discount_type: discountType,
          p_discount_value: discountValue,
          p_expires_at: expiresAt,
          p_max_redemptions: maxRedemptions,
        },
      });
      if (!Array.isArray(result) || result.length !== 1
        || result[0].code !== normalizedCode
        || result[0].discount_type !== discountType
        || result[0].discount_value !== discountValue
        || result[0].active !== true
        || !timestampMatches(result[0].expires_at)
        || result[0].max_redemptions !== maxRedemptions
        || !Number.isInteger(result[0].used_count)
        || typeof result[0].updated_at !== "string") {
        throw new Error("The promo code was not created. Refresh the page and try again.");
      }
      return result[0];
    },
    savePromoCode: async (code, discountType, discountValue, expiresAt, maxRedemptions, active) => {
      const normalizedCode = code.trim().toUpperCase();
      const timestampMatches = (value) => expiresAt === null
        ? value === null
        : typeof value === "string" && Date.parse(value) === Date.parse(expiresAt);
      const result = await authenticatedRequest("/rest/v1/rpc/save_promo_code", {
        method: "POST",
        body: {
          p_code: normalizedCode,
          p_discount_type: discountType,
          p_discount_value: discountValue,
          p_expires_at: expiresAt,
          p_max_redemptions: maxRedemptions,
          p_active: active,
        },
      });
      if (!Array.isArray(result) || result.length !== 1
        || result[0].code !== normalizedCode
        || result[0].discount_type !== discountType
        || result[0].discount_value !== discountValue
        || !timestampMatches(result[0].expires_at)
        || result[0].max_redemptions !== maxRedemptions
        || result[0].active !== active
        || !Number.isInteger(result[0].used_count)
        || typeof result[0].updated_at !== "string") {
        throw new Error("The promo code was not saved. Refresh the page and try again.");
      }
      return result[0];
    },
    deletePromoCode: async (code) => {
      const deleted = await authenticatedRequest("/rest/v1/rpc/delete_promo_code", {
        method: "POST",
        body: { p_code: code },
      });
      if (deleted !== true) {
        throw new Error("The promo code was not deleted. Refresh the page and try again.");
      }
    },
    validatePromoCode: async (courts, duration, time, promo, email) => {
      const result = await request("/rest/v1/rpc/validate_promo_code", {
        method: "POST",
        body: {
          p_courts: courts,
          p_duration: duration,
          p_time: time,
          p_promo: promo.trim().toUpperCase(),
          p_email: email.trim(),
        },
      });
      if (!result || typeof result.code !== "string"
        || result.code !== promo.trim().toUpperCase()
        || !Array.isArray(result.courts)
        || result.courts.length !== courts.length
        || result.courts.some((court, index) => court !== courts[index])
        || result.duration !== duration
        || result.time !== time
        || !["percentage", "fixed"].includes(result.discount_type)
        || !Number.isInteger(result.discount_value)
        || !Number.isInteger(result.subtotal)
        || !Number.isInteger(result.discount_amount)
        || !Number.isInteger(result.estimated_total)
        || result.discount_amount < 0
        || result.discount_amount >= result.subtotal
        || result.estimated_total < 1
        || result.subtotal - result.discount_amount !== result.estimated_total
        || (result.discount_type === "percentage" && (result.discount_value < 1 || result.discount_value > 99))
        || (result.discount_type === "fixed" && (result.discount_value < 1 || result.discount_value > 100000))) {
        throw new Error("The promo-code check returned an invalid response.");
      }
      return result;
    },
    addCourt: async (court, dayRate, nightRate, imagePath) => {
      const result = await authenticatedRequest("/rest/v1/rpc/add_court", {
        method: "POST",
        body: {
          p_court: court,
          p_day_rate: dayRate,
          p_night_rate: nightRate,
          p_image_path: imagePath,
        },
      });
      if (!Array.isArray(result) || result.length !== 1
        || result[0].court !== court || result[0].day_rate !== dayRate
        || result[0].night_rate !== nightRate || !Number.isInteger(result[0].sort_order)
        || result[0].image_path !== imagePath) {
        throw new Error("The court was not added. Refresh the page and try again.");
      }
      return result[0];
    },
    renameCourt: async (oldCourt, newCourt) => {
      const result = await authenticatedRequest("/rest/v1/rpc/rename_court", {
        method: "POST",
        body: { p_old_court: oldCourt, p_new_court: newCourt },
      });
      if (!Array.isArray(result) || result.length !== 1
        || result[0].court !== newCourt || !Number.isInteger(result[0].day_rate)
        || !Number.isInteger(result[0].night_rate)
        || !Number.isInteger(result[0].sort_order)) {
        throw new Error("The court name was not updated. Refresh the page and try again.");
      }
      return result[0];
    },
    saveCourtSettings: async (oldCourt, newCourt, dayRate, nightRate, imagePath) => {
      const result = await authenticatedRequest("/rest/v1/rpc/save_court_settings", {
        method: "POST",
        body: {
          p_old_court: oldCourt,
          p_new_court: newCourt,
          p_day_rate: dayRate,
          p_night_rate: nightRate,
          p_image_path: imagePath,
        },
      });
      if (!Array.isArray(result) || result.length !== 1
        || result[0].court !== newCourt || result[0].day_rate !== dayRate
        || result[0].night_rate !== nightRate
        || !Number.isInteger(result[0].sort_order) || result[0].image_path !== imagePath) {
        throw new Error("Court changes were not saved. Refresh the page and try again.");
      }
      return result[0];
    },
    deleteCourt: async (court) => {
      const deleted = await authenticatedRequest("/rest/v1/rpc/delete_court", {
        method: "POST",
        body: { p_court: court },
      });
      if (deleted !== true) {
        throw new Error("The court was not deleted. Refresh the page and try again.");
      }
    },
    listPublicBookings: async (startDate, endDate) => {
      const bookings = await request(
        "/rest/v1/rpc/list_public_bookings",
        {
          method: "POST",
          body: { p_start_date: startDate, p_end_date: endDate },
        },
      );
      if (!Array.isArray(bookings)) {
        throw new Error("The calendar returned an invalid booking list.");
      }
      return bookings;
    },
    listBookingDateBlocks: async (startDate, endDate) => {
      const dateBlocks = await request("/rest/v1/rpc/list_booking_date_blocks", {
        method: "POST",
        body: { p_start_date: startDate, p_end_date: endDate },
      });
      if (!Array.isArray(dateBlocks) || dateBlocks.some((block) => (
        typeof block.id !== "string"
        || typeof block.blocked_date !== "string"
        || !["maintenance", "closed"].includes(block.block_type)
        || (block.courts !== null && (!Array.isArray(block.courts) || block.courts.some((court) => typeof court !== "string")))
        || typeof block.start_time !== "string"
        || typeof block.end_time !== "string"
        || typeof block.reason !== "string"
      ))) {
        throw new Error("The calendar returned an invalid list of blocked times.");
      }
      return dateBlocks;
    },
    createBookingDateBlock: async (date, blockType, courts, startTime, endTime, reason) => {
      const result = await authenticatedRequest("/rest/v1/rpc/create_booking_date_block", {
        method: "POST",
        body: {
          p_blocked_date: date,
          p_block_type: blockType,
          p_courts: courts,
          p_start_time: startTime,
          p_end_time: endTime,
          p_reason: reason,
        },
      });
      if (!Array.isArray(result) || result.length !== 1
        || result[0].blocked_date !== date || result[0].block_type !== blockType
        || JSON.stringify(result[0].courts) !== JSON.stringify(courts)
        || typeof result[0].id !== "string"
        || result[0].start_time?.slice(0, 5) !== startTime
        || result[0].end_time?.slice(0, 5) !== endTime
        || result[0].reason !== reason) {
        throw new Error("The selected time was not blocked. Refresh the calendar and try again.");
      }
      return result[0];
    },
    deleteBookingDateBlock: async (id) => {
      const deleted = await authenticatedRequest("/rest/v1/rpc/delete_booking_date_block", {
        method: "POST",
        body: { p_block_id: id },
      });
      if (deleted !== true) {
        throw new Error("The blocked time was not removed. Refresh the calendar and try again.");
      }
    },
    listUnavailableBookingTimes: async (date, court) => {
      const bookings = await request("/rest/v1/rpc/list_unavailable_booking_times", {
        method: "POST",
        body: { p_booking_date: date, p_court: court },
      });
      if (!Array.isArray(bookings) || bookings.some((booking) => typeof booking.time !== "string")) {
        throw new Error("The booking availability check returned an invalid response.");
      }
      return bookings.map((booking) => booking.time);
    },
    createBooking: async (booking) => {
      const result = await request("/rest/v1/rpc/create_customer_booking", {
        method: "POST",
        body: {
          p_name: booking.name,
          p_email: booking.email,
          p_courts: booking.courts,
          p_players: booking.players,
          p_duration: booking.duration,
          p_date: booking.date,
          p_time: booking.time,
          p_estimated_total: booking.estimated_total,
          p_promo: booking.promo,
          p_notes: booking.notes,
        },
      });
      if (!result || typeof result.booking_id !== "string" || typeof result.cancellation_token !== "string") {
        throw new Error("The booking response did not include valid cancellation details. Please contact the club before submitting another request.");
      }
      return result;
    },
    sendBookingReferenceEmail: async (bookingId, cancellationToken) => {
      const result = await request("/functions/v1/send-booking-reference-email", {
        method: "POST",
        body: { booking_id: bookingId, cancellation_token: cancellationToken },
      });
      if (!result?.success) {
        throw new Error("The booking confirmation email could not be sent.");
      }
    },
    cancelBooking: async (bookingId, email, cancellationToken = null) => {
      const result = await request("/rest/v1/rpc/cancel_customer_booking", {
        method: "POST",
        body: {
          p_booking_id: bookingId,
          p_email: email || null,
          p_token: cancellationToken,
        },
      });
      if (typeof result !== "boolean") {
        throw new Error("The cancellation request returned an invalid response.");
      }
      return result;
    },
    createAdminBooking: async (booking) => {
      const result = await authenticatedRequest("/rest/v1/rpc/create_admin_booking", {
        method: "POST",
        body: {
          p_name: booking.name,
          p_email: booking.email,
          p_courts: booking.courts,
          p_players: booking.players,
          p_duration: booking.duration,
          p_date: booking.date,
          p_time: booking.time,
          p_estimated_total: booking.estimated_total,
          p_promo: booking.promo,
        },
      });
      if (!result || typeof result.booking_id !== "string"
        || typeof result.booking_group_id !== "string") {
        throw new Error("The booking was not created. Please refresh and try again.");
      }
      return result;
    },
    signIn: async (email, password) => {
      const session = await request("/auth/v1/token?grant_type=password", {
        method: "POST",
        body: { email, password },
      });
      saveSession(session);
      return session;
    },
    getSession: async () => {
      const accessToken = await getAccessToken();
      if (!accessToken) return null;
      try {
        return await request("/auth/v1/user", { accessToken });
      } catch (error) {
        if ([401, 403].includes(error.status)) {
          removeSession();
          throw new Error("Your admin session expired. Please sign in again.", { cause: error });
        }
        throw error;
      }
    },
    signOut: async () => {
      const accessToken = await getAccessToken();
      try {
        if (accessToken) await request("/auth/v1/logout", { method: "POST", accessToken });
      } catch (error) {
        removeSession();
        throw new Error("Your local session was cleared, but Supabase could not confirm sign-out.", { cause: error });
      }
      removeSession();
    },
    listBookings: () => authenticatedRequest("/rest/v1/bookings?select=*&order=created_at.desc"),
    updateBookingStatus: async (booking, status) => {
      try {
        const filter = booking.booking_group_id
          ? `booking_group_id=eq.${encodeURIComponent(booking.booking_group_id)}`
          : `id=eq.${encodeURIComponent(booking.id)}`;
        const result = await authenticatedRequest(`/rest/v1/bookings?${filter}&select=id,status`, {
          method: "PATCH",
          body: { status },
          headers: { Prefer: "return=representation" },
        });
        if (!Array.isArray(result) || result.length === 0
          || result.some((updatedBooking) => typeof updatedBooking?.id !== "string" || updatedBooking.status !== status)) {
          throw new Error("The database did not confirm the requested status for every court in this request.");
        }
        return result;
      } catch (error) {
        if (error.code === "23514" && /status/i.test(error.message)) {
          throw new Error("The database does not allow this booking status yet. Run the latest supabase/schema.sql to migrate existing Paid bookings to Confirmed and allow pending, confirmed, or cancelled statuses, then try again.");
        }
        throw error;
      }
    },
    deleteBooking: async (booking) => {
      const filter = booking.booking_group_id
        ? `booking_group_id=eq.${encodeURIComponent(booking.booking_group_id)}`
        : `id=eq.${encodeURIComponent(booking.id)}`;
      const result = await authenticatedRequest(`/rest/v1/bookings?${filter}&select=id`, {
        method: "DELETE",
        headers: { Prefer: "return=representation" },
      });
      if (!Array.isArray(result) || result.length === 0
        || result.some((deletedBooking) => typeof deletedBooking?.id !== "string")) {
        throw new Error("The booking request was not deleted. It may already have been removed.");
      }
    },
  };
})();
