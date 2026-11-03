  const showLogin = (message = "") => {
    stopPolling();
    dashboard.hidden = true;
    login.hidden = false;
    signOutButton.hidden = true;
    openAdminBookingButton.disabled = true;
    loginFeedback.textContent = message;
  };

  const initializeAnalyticsReveal = () => {
    if (analyticsRevealObserver || !("IntersectionObserver" in window)
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const revealTargets = overviewSection.querySelectorAll([
      ".admin-intro",
      ".admin-revenue",
      ".admin-dashboard-grid > .admin-chart-card",
      ".admin-dashboard-grid > .admin-analytics-side > .admin-metric-card",
      ".admin-dashboard-grid > .admin-analytics-side > .admin-side-metrics",
    ].join(", "));
    if (!revealTargets.length) return;

    overviewSection.classList.add("has-analytics-reveal");
    revealTargets.forEach((target, index) => {
      target.dataset.analyticsReveal = "";
      target.style.setProperty("--analytics-reveal-delay", `${Math.min(index, 5) * 60}ms`);
    });

    analyticsRevealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-analytics-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -5% 0px" });
    revealTargets.forEach((target) => analyticsRevealObserver.observe(target));
  };

  const setSignedIn = () => {
    login.hidden = true;
    dashboard.hidden = false;
    signOutButton.hidden = false;
    if (!overviewSection.hidden) initializeAnalyticsReveal();
    startPolling();
  };

  const localDateValue = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  };

  const formatBookingHour = (hour) => `${hour % 12 || 12}:00 ${hour < 12 ? "AM" : "PM"}`;

  const getSelectedAdminCourts = () => (
    [...bookingCourts.querySelectorAll('input[name="courts"]:checked')].map((input) => input.value)
  );

  const getAdminBookingSlots = (duration) => {
    const slots = [];
    for (let startHour = 7; startHour + duration <= 22; startHour += 1) {
      const time = `${formatBookingHour(startHour)} – ${formatBookingHour(startHour + duration)}`;
      slots.push({ startHour, endHour: startHour + duration, time });
    }
    return slots;
  };

  const isAdminSlotAvailable = (courts, slot) => courts.every((court) => {
    if (bookingAvailabilityDateBlocks.some((dateBlock) => blockOverlapsRange(dateBlock, [
      slot.startHour * 60,
      slot.endHour * 60,
    ]))) return false;
    const unavailableTimes = bookingAvailabilityByCourt.get(court) || [];
    return !unavailableTimes.some((time) => {
      const unavailableRange = timeRange(time);
      return unavailableRange
        && slot.startHour * 60 < unavailableRange[1]
        && unavailableRange[0] < slot.endHour * 60;
    });
  });

  const getAdminAvailableSlots = (courts) => (
    getAdminBookingSlots(Number(bookingDuration.value))
      .filter((slot) => isAdminSlotAvailable(courts, slot))
  );

  const getAdminBookingSubtotal = (courts, duration, time) => {
    const startMinute = timeRange(time)?.[0];
    if (!courts.length || !duration || startMinute === undefined) return null;
    const rateKey = startMinute >= 1020 ? "night_rate" : "day_rate";
    const ratesByCourt = new Map(courtRates.map((rate) => [rate.court, rate]));
    const rates = courts.map((court) => ratesByCourt.get(court)?.[rateKey]);
    if (rates.some((rate) => !Number.isInteger(rate))) return null;
    return rates.reduce((total, rate) => total + rate * duration, 0);
  };

  const updateAdminBookingCourtOptions = () => {
    const currentKey = `${bookingDate.value}|${Number(bookingDuration.value)}`;
    const ready = bookingDate.value && bookingDuration.value
      && bookingAvailabilityKey === currentKey
      && !bookingAvailabilityLoading
      && !bookingAvailabilityError;
    bookingCourts.querySelectorAll('input[name="courts"]').forEach((input) => {
      const available = ready && getAdminAvailableSlots([input.value]).length > 0;
      input.disabled = Boolean(ready && !available);
      if (input.disabled) input.checked = false;
    });
    bookingCourtPicker.disabled = courtRates.length === 0;
  };

  const loadAdminBookingAvailability = async () => {
    const requestId = ++bookingAvailabilityRequestId;
    const date = bookingDate.value;
    const duration = Number(bookingDuration.value);
    const requestKey = `${date}|${duration}`;
    bookingAvailabilityKey = requestKey;
    bookingAvailabilityByCourt = new Map();
    bookingAvailabilityDateBlocks = [];
    bookingAvailabilityError = null;
    bookingAvailabilityLoading = Boolean(date && duration);
    updateAdminBookingCourtOptions();
    updateAdminBookingTimes();

    if (!date || !duration) {
      bookingAvailabilityKey = "";
      updateAdminBookingCourtOptions();
      updateAdminBookingTimes();
      return;
    }

    try {
      const dateBlocks = await database.listBookingDateBlocks(date, nextCalendarDateKey(date));
      if (requestId !== bookingAvailabilityRequestId) return;
      bookingAvailabilityDateBlocks = dateBlocks;
      const results = await Promise.all(courtRates.map(async ({ court }) => (
        [court, await database.listUnavailableBookingTimes(date, court)]
      )));
      if (requestId !== bookingAvailabilityRequestId) return;
      bookingAvailabilityByCourt = new Map(results);
    } catch (error) {
      if (requestId !== bookingAvailabilityRequestId) return;
      bookingAvailabilityError = error;
    } finally {
      if (requestId === bookingAvailabilityRequestId) {
        bookingAvailabilityLoading = false;
        updateAdminBookingCourtOptions();
        updateAdminBookingTimes();
      }
    }
  };

  const updateAdminBookingTimes = () => {
    const duration = Number(bookingDuration.value);
    const courts = getSelectedAdminCourts();
    const previousTime = bookingTime.value;
    const currentKey = `${bookingDate.value}|${duration}`;
    const availabilityReady = Boolean(duration && bookingDate.value)
      && bookingAvailabilityKey === currentKey
      && !bookingAvailabilityLoading
      && !bookingAvailabilityError
      && courts.length > 0
      && courts.every((court) => bookingAvailabilityByCourt.has(court));
    bookingTime.replaceChildren(new Option(
      !duration ? "Choose a duration first"
        : !bookingDate.value ? "Choose a date first"
          : bookingAvailabilityLoading || bookingAvailabilityKey !== currentKey ? "Checking availability…"
            : bookingAvailabilityError ? "Check failed — change court, date, or duration to retry"
              : !courts.length ? "Choose court(s) first"
                : "Choose an available time",
      "",
    ));
    if (!availabilityReady) {
      bookingTime.disabled = true;
      updateAdminBookingTotal();
      return;
    }

    bookingTime.disabled = false;
    getAdminBookingSlots(duration).forEach((slot) => {
      const { time } = slot;
      const isAvailable = isAdminSlotAvailable(courts, slot);
      const option = new Option(
        isAvailable ? time : `${time} — Unavailable`,
        time,
        false,
        isAvailable && time === previousTime,
      );
      option.disabled = !isAvailable;
      bookingTime.add(option);
    });
    updateAdminBookingTotal();
  };

  const updateAdminBookingTotal = () => {
    const courts = getSelectedAdminCourts();
    const duration = Number(bookingDuration.value);
    const subtotal = getAdminBookingSubtotal(courts, duration, bookingTime.value);
    const promoKey = [
      courts.slice().sort().join(","),
      bookingDuration.value,
      bookingTime.value,
      bookingPromoInput.value.trim().toUpperCase(),
      bookingEmail.value.trim().toLowerCase(),
    ].join("|");
    const total = verifiedAdminPromo?.key === promoKey
      ? verifiedAdminPromo.estimated_total
      : subtotal;
    bookingTotal.textContent = total
      ? new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(total)
      : "Choose court(s), duration & time";
  };

  const promoEligibilityMessage = (error) => {
    const message = String(error?.message || "").toLowerCase();
    if (message.includes("already been used")) return "This code has already been used with this email address.";
    if (message.includes("redemption limit")) return "This code has reached its redemption limit.";
    if (message.includes("expired")) return "This promo code has expired.";
    if (message.includes("invalid or inactive")) return "This promo code is invalid or inactive.";
    return "";
  };

  const scheduleAdminPromoValidation = () => {
    window.clearTimeout(adminPromoValidationTimer);
    const requestId = ++adminPromoValidationRequestId;
    verifiedAdminPromo = null;
    bookingPromoFeedback.classList.remove("is-error", "is-success");
    const code = bookingPromoInput.value.trim();
    if (!code) {
      bookingPromoFeedback.textContent = "";
      updateAdminBookingTotal();
      return;
    }
    const courts = getSelectedAdminCourts();
    if (!courts.length || !bookingDuration.value || !bookingTime.value) {
      bookingPromoFeedback.textContent = "Choose court(s), duration, and time to check this code.";
      updateAdminBookingTotal();
      return;
    }
    if (!bookingEmail.validity.valid || !bookingEmail.value.trim()) {
      bookingPromoFeedback.textContent = "Enter a valid email address to check this code.";
      updateAdminBookingTotal();
      return;
    }

    bookingPromoFeedback.textContent = "Checking promo code…";
    updateAdminBookingTotal();
    adminPromoValidationTimer = window.setTimeout(async () => {
      try {
        const promo = await database.validatePromoCode(
          courts,
          Number(bookingDuration.value),
          bookingTime.value,
          code,
          bookingEmail.value,
        );
        if (requestId !== adminPromoValidationRequestId) return;
        verifiedAdminPromo = {
          ...promo,
          key: [courts.slice().sort().join(","), bookingDuration.value, bookingTime.value, code.toUpperCase(), bookingEmail.value.trim().toLowerCase()].join("|"),
        };
        bookingPromoFeedback.classList.add("is-success");
        bookingPromoFeedback.textContent = `${promo.code} applied · Save ₱${new Intl.NumberFormat("en-PH").format(promo.discount_amount)}.`;
        updateAdminBookingTotal();
      } catch (error) {
        if (requestId !== adminPromoValidationRequestId) return;
        bookingPromoFeedback.classList.add("is-error");
        const eligibilityMessage = promoEligibilityMessage(error);
        bookingPromoFeedback.textContent = eligibilityMessage || "We couldn't check this promo code. Please try again.";
        if (!eligibilityMessage) {
          console.error("Unable to validate staff booking promo code:", error);
        }
        updateAdminBookingTotal();
      }
    }, 350);
  };

