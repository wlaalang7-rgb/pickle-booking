const publicCourtList = document.querySelector("#public-court-list");
if (publicCourtList && window.PickleRallySkeleton) {
  publicCourtList.querySelector(".court-skeleton-cards")?.replaceWith(...window.PickleRallySkeleton.courtCards());
}

const formatBookingCurrency = (amount) => new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
}).format(amount);

const getSelectedBookingCourts = () => (
  [...bookingCourtOptions.querySelectorAll('input[name="courts"]:checked')].map((input) => input.value)
);

bookingResultClose.addEventListener("click", () => bookingResultDialog.close());
bookingResultDone.addEventListener("click", () => bookingResultDialog.close());
bookingResultDialog.addEventListener("click", (event) => {
  if (event.target === bookingResultDialog) bookingResultDialog.close();
});
bookingResultDialog.querySelector(".booking-result-contact").addEventListener("click", () => {
  bookingResultDialog.close();
});

const updateBookingCourtSelection = () => {
  const selectedCount = getSelectedBookingCourts().length;
  bookingCourtSelectedCount.textContent = `${selectedCount} selected`;
  bookingCourtHelp.textContent = selectedCount
    ? `${selectedCount} court${selectedCount === 1 ? "" : "s"} selected · all use the same date and time.`
    : "Choose one or more courts. All selections share the same date and time.";
};

const getBookingStartHour = (time) => {
  const match = String(time || "").match(/^(\d{1,2}):\d{2}\s*(AM|PM)/i);
  if (!match) return null;
  return Number(match[1]) % 12 + (match[2].toUpperCase() === "PM" ? 12 : 0);
};

const getBookingSubtotal = (courts, duration, time) => {
  const startHour = getBookingStartHour(time);
  if (!courts.length || !duration || startHour === null) return null;
  const rateKey = startHour >= 17 ? "night_rate" : "day_rate";
  const ratesByCourt = new Map(courtRates.map((rate) => [rate.court, rate]));
  const selectedRates = courts.map((court) => ratesByCourt.get(court)?.[rateKey]);
  if (selectedRates.some((rate) => !Number.isInteger(rate))) return null;
  return selectedRates.reduce((total, rate) => total + rate * duration, 0);
};

const currentPromoKey = () => [
  getSelectedBookingCourts().sort().join(","),
  bookingDuration.value,
  bookingTime.value,
  promoInput.value.trim().toUpperCase(),
  bookingEmail.value.trim().toLowerCase(),
].join("|");

const promoEligibilityMessage = (error) => {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("already been used")) return "This code has already been used with this email address.";
  if (message.includes("redemption limit")) return "This code has reached its redemption limit.";
  if (message.includes("expired")) return "This promo code has expired.";
  if (message.includes("invalid or inactive")) return "This promo code is invalid or inactive.";
  return "";
};

const updateBookingEstimate = () => {
  const courts = getSelectedBookingCourts();
  const duration = Number(bookingDuration.value);
  const subtotal = getBookingSubtotal(courts, duration, bookingTime.value);
  if (!subtotal) {
    bookingEstimate.textContent = "Choose court(s), duration & time";
    bookingPriceBreakdown.textContent = "";
    return;
  }

  if (verifiedPromo && verifiedPromo.key === currentPromoKey()) {
    bookingEstimate.textContent = formatBookingCurrency(verifiedPromo.estimated_total);
    bookingPriceBreakdown.textContent = `Before discount ${formatBookingCurrency(verifiedPromo.subtotal)} · You save ${formatBookingCurrency(verifiedPromo.discount_amount)}`;
    return;
  }

  bookingEstimate.textContent = formatBookingCurrency(subtotal);
  const rateLabel = getBookingStartHour(bookingTime.value) >= 17 ? "Night rate" : "Day rate";
  bookingPriceBreakdown.textContent = `${rateLabel} · ${courts.length} court${courts.length === 1 ? "" : "s"} · ${duration} hour${duration === 1 ? "" : "s"}`
    + (promoInput.value.trim() ? ` · Before discount ${formatBookingCurrency(subtotal)}` : "");
};

const schedulePromoValidation = () => {
  window.clearTimeout(promoValidationTimer);
  const requestId = ++promoValidationRequestId;
  verifiedPromo = null;
  promoFeedback.classList.remove("is-error", "is-success");
  const code = promoInput.value.trim();
  if (!code) {
    promoFeedback.textContent = "";
    updateBookingEstimate();
    return;
  }
  const courts = getSelectedBookingCourts();
  if (!courts.length || !bookingDuration.value || !bookingTime.value) {
    promoFeedback.textContent = "Choose court(s), duration, and time to check this code.";
    updateBookingEstimate();
    return;
  }
  if (!bookingEmail.validity.valid || !bookingEmail.value.trim()) {
    promoFeedback.textContent = "Enter a valid email address to check this code.";
    updateBookingEstimate();
    return;
  }

  promoFeedback.textContent = "Checking promo code…";
  updateBookingEstimate();
  promoValidationTimer = window.setTimeout(async () => {
    try {
      const promo = await window.PickleRallyDB.validatePromoCode(
        courts,
        Number(bookingDuration.value),
        bookingTime.value,
        code,
        bookingEmail.value,
      );
      if (requestId !== promoValidationRequestId) return;
      verifiedPromo = { ...promo, key: currentPromoKey() };
      promoFeedback.classList.add("is-success");
      promoFeedback.textContent = `${promo.code} applied · You save ${formatBookingCurrency(promo.discount_amount)}.`;
      updateBookingEstimate();
    } catch (error) {
      if (requestId !== promoValidationRequestId) return;
      promoFeedback.classList.add("is-error");
      const eligibilityMessage = promoEligibilityMessage(error);
      promoFeedback.textContent = eligibilityMessage || "We couldn't check this promo code. Please try again.";
      if (!eligibilityMessage) {
        console.error("Unable to validate promo code:", error);
      }
      updateBookingEstimate();
    }
  }, 350);
};

const loadCourtRates = async () => {
  const selectedCourts = new Set(getSelectedBookingCourts());
  courtRatesLoaded = false;
  bookingCourtPicker.disabled = true;
  bookingSubmit.disabled = true;
  if (publicCourtList) {
    publicCourtList.setAttribute("aria-busy", "true");
    const accessible = document.createElement("span");
    accessible.className = "skeleton-visually-hidden";
    accessible.textContent = "Loading courts and rates";
    publicCourtList.replaceChildren(accessible, ...window.PickleRallySkeleton.courtCards());
  }
  bookingCourtOptions.setAttribute("aria-busy", "true");
  bookingCourtOptions.replaceChildren(...window.PickleRallySkeleton.courtOptions());
  document.querySelector(".booking-estimate").setAttribute("aria-busy", "true");
  const estimateStatus = document.createElement("span");
  estimateStatus.className = "skeleton-visually-hidden";
  estimateStatus.textContent = "Loading court rates";
  bookingEstimate.replaceChildren(window.PickleRallySkeleton.shape("skeleton-estimate-value", "132px", "16px"), estimateStatus);
  try {
    const rates = await window.PickleRallyDB.listCourtRates();
    if (!rates.length
      || rates.some((rate) => rate.court.trim().length < 2
        || rate.court.length > 60
        || !Number.isInteger(rate.day_rate) || rate.day_rate < 1 || rate.day_rate > 100000
        || !Number.isInteger(rate.night_rate) || rate.night_rate < 1 || rate.night_rate > 100000)) {
      throw new Error("The court rate list is empty or contains invalid entries.");
    }
    courtRatesLoaded = true;
    courtRates = rates;
    calendarCourts = rates.map(({ court }) => court);
    renderPublicCourtCards(rates);
    bookingCourtOptions.replaceChildren(...rates.map(({ court, day_rate: dayRate, night_rate: nightRate }) => {
      const label = document.createElement("label");
      label.className = "booking-court-option";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "courts";
      checkbox.value = court;
      checkbox.checked = selectedCourts.has(court);
      const details = document.createElement("span");
      details.className = "booking-court-option-details";
      const name = document.createElement("strong");
      name.className = "booking-court-option-name";
      name.textContent = court;
      const rates = document.createElement("span");
      rates.className = "booking-court-rate-row";
      const day = document.createElement("span");
      day.className = "booking-court-rate";
      const dayLabel = document.createElement("small");
      dayLabel.textContent = "Day";
      const dayValue = document.createElement("strong");
      dayValue.textContent = `${formatBookingCurrency(dayRate)}/hr`;
      const night = document.createElement("span");
      night.className = "booking-court-rate";
      const nightLabel = document.createElement("small");
      nightLabel.textContent = "Night";
      const nightValue = document.createElement("strong");
      nightValue.textContent = `${formatBookingCurrency(nightRate)}/hr`;
      day.append(dayLabel, dayValue);
      night.append(nightLabel, nightValue);
      rates.append(day, night);
      details.append(name, rates);
      label.append(checkbox, details);
      return label;
    }));
    updateBookingCourtSelection();
    bookingCourtPicker.disabled = false;
    bookingCourtOptions.setAttribute("aria-busy", "false");
    document.querySelector(".booking-estimate").setAttribute("aria-busy", "false");
    bookingSubmit.disabled = false;
    bookingMessage.textContent = "";
    updateBookingTimes();
    if (selectedAvailabilityDate) renderAvailabilityDetails(selectedAvailabilityDate);
    loadCalendarBookings();
  } catch (error) {
    bookingCourtOptions.replaceChildren(Object.assign(document.createElement("p"), {
      textContent: "Court rates unavailable.",
    }));
    bookingCourtOptions.setAttribute("aria-busy", "false");
    document.querySelector(".booking-estimate").setAttribute("aria-busy", "false");
    const publicCourtList = document.querySelector("#public-court-list");
    if (publicCourtList) {
      const message = document.createElement("p");
      message.className = "court-list-message is-error";
      message.setAttribute("role", "alert");
      message.textContent = "Court information is currently unavailable. Please try again later.";
      publicCourtList.replaceChildren(message);
      publicCourtList.setAttribute("aria-busy", "false");
    }
    bookingMessage.className = "form-message is-error";
    bookingMessage.setAttribute("role", "alert");
    bookingMessage.textContent = "Court rates are currently unavailable. Online booking is paused; please contact the club or try again later.";
    console.error("Unable to load court rates:", error);
    bookingEstimate.textContent = "Rates unavailable";
  }
};

const renderPublicCourtCards = (rates) => {
  const courtList = document.querySelector("#public-court-list");
  if (!courtList) return;
  courtList.replaceChildren(...rates.map(({ court, day_rate: dayRate, night_rate: nightRate, image_path: imagePath }, index) => {
    const card = document.createElement("article");
    card.className = "court-card";
    const image = document.createElement("div");
    image.className = `court-image court-image-${["one", "two", "three", "four"][index % 4]}`;
    const photo = document.createElement("img");
    photo.src = window.PickleRallyDB.getCourtImageUrl(imagePath);
    photo.alt = `${court} court at PickleRally`;
    photo.loading = "lazy";
    photo.decoding = "async";
    const label = document.createElement("span");
    label.className = "image-label";
    label.textContent = `${String(index + 1).padStart(2, "0")} — ${court.toUpperCase()}`;
    const arrow = document.createElement("span");
    arrow.className = "image-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "↗";
    image.append(photo, label, arrow);

    const bottom = document.createElement("div");
    bottom.className = "court-card-bottom";
    const details = document.createElement("div");
    const name = document.createElement("h3");
    name.textContent = court;
    const description = document.createElement("p");
    description.textContent = "Court rental · Up to 4 players";
    details.append(name, description);
    const rate = document.createElement("div");
    rate.className = "rate";
    const amount = document.createElement("strong");
    amount.textContent = `Day ₱${new Intl.NumberFormat("en-PH").format(dayRate)}`;
    const unit = document.createElement("span");
    unit.textContent = `/ hr · Night ₱${new Intl.NumberFormat("en-PH").format(nightRate)}/hr`;
    rate.append(amount, unit);
    bottom.append(details, rate);
    card.append(image, bottom);
    return card;
  }));
  courtList.setAttribute("aria-busy", "false");
};


const updateBookingTimes = () => {
  const duration = Number(bookingDuration.value);
  const courts = getSelectedBookingCourts();
  const selectedTime = bookingTime.value;
  const selectedDateBlocks = bookingDateBlocks.filter((dateBlock) => (
    dateBlock.blocked_date === bookingDate.value
    && (!Array.isArray(dateBlock.courts) || courts.some((court) => dateBlock.courts.includes(court)))
  ));
  const allDayBlock = selectedDateBlocks.some((dateBlock) => (
    blockTimeMinutes(dateBlock.start_time) === 0 && blockTimeMinutes(dateBlock.end_time) === 1440
  ));
  bookingTime.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  const availabilityKey = `${bookingDate.value}|${courts.slice().sort().join(",")}`;
  placeholder.textContent = allDayBlock
    ? "Closed all day — choose another date"
    : bookingAvailabilityError
    ? "Could not check availability. Change date or courts to retry."
    : !duration
      ? "Choose a duration first"
      : !bookingDate.value || !courts.length
        ? "Choose court(s) and a date first"
        : bookingAvailabilityLoading || bookingAvailabilityKey !== availabilityKey
          ? "Checking available times…"
          : "Choose an available time";
  if (allDayBlock) {
    const allDayScopes = [...new Set(selectedDateBlocks.filter((dateBlock) => (
      blockTimeMinutes(dateBlock.start_time) === 0 && blockTimeMinutes(dateBlock.end_time) === 1440
    )).map(formatBlockScope))].join(", ");
    placeholder.textContent = `Unavailable all day for ${allDayScopes}. Choose another date.`;
  }
  bookingTime.append(placeholder);

  bookingDateAvailability.textContent = selectedDateBlocks.length
    ? allDayBlock
      ? `Unavailable all day: ${selectedDateBlocks.filter((dateBlock) => (
        blockTimeMinutes(dateBlock.start_time) === 0 && blockTimeMinutes(dateBlock.end_time) === 1440
      )).map((dateBlock) => `${formatBlockScope(dateBlock)} · ${dateBlock.reason}`).join("; ")}. Choose another date to book.`
      : `Unavailable times: ${selectedDateBlocks.map((dateBlock) => (
        `${formatBlockRange(dateBlock)} (${formatBlockScope(dateBlock)} · ${dateBlock.reason})`
      )).join("; ")}.`
    : bookingAvailabilityError
          ? "Availability could not be verified. Please change the date or try again."
          : bookingAvailabilityLoading && bookingDate.value
            ? "Checking whether this date is open…"
            : "";

  if (allDayBlock || !duration || !bookingDate.value || !courts.length
    || bookingAvailabilityLoading || bookingAvailabilityKey !== availabilityKey || bookingAvailabilityError) {
    bookingTime.disabled = true;
    updateBookingEstimate();
    return;
  }

  bookingTime.disabled = false;
  const openingHour = 7;
  const closingHour = 22;
  for (let startHour = openingHour; startHour + duration <= closingHour; startHour += 1) {
    const endHour = startHour + duration;
    const option = document.createElement("option");
    option.value = `${formatBookingHour(startHour)} – ${formatBookingHour(endHour)}`;
    const overlapsUnavailableTime = bookingAvailability.some((time) => {
      const unavailableRange = bookingTimeRange(time);
      return unavailableRange && startHour * 60 < unavailableRange[1] && unavailableRange[0] < endHour * 60;
    });
    const blockedTime = selectedDateBlocks.find((dateBlock) => blockOverlapsRange(dateBlock, [
      startHour * 60,
      endHour * 60,
    ]));
    option.disabled = overlapsUnavailableTime || Boolean(blockedTime);
    option.textContent = blockedTime
      ? `${option.value} — ${formatBlockScope(blockedTime)} · ${blockedTime.reason}`
      : overlapsUnavailableTime ? `${option.value} — Unavailable` : option.value;
    option.selected = !option.disabled && option.value === selectedTime;
    bookingTime.append(option);
  }
  updateBookingEstimate();
};

const loadBookingAvailability = async () => {
  const requestId = ++bookingAvailabilityRequestId;
  const date = bookingDate.value;
  const courts = getSelectedBookingCourts().sort();
  bookingAvailabilityKey = `${date}|${courts.join(",")}`;
  bookingAvailability = [];
  bookingAvailabilityError = null;
  bookingDateBlocks = [];
  bookingAvailabilityLoading = Boolean(date);
  if (!date) {
    bookingAvailabilityKey = "";
    updateBookingTimes();
    return;
  }

  updateBookingTimes();
  try {
    const dateBlocks = await window.PickleRallyDB.listBookingDateBlocks(date, nextDateValue(date));
    if (requestId !== bookingAvailabilityRequestId) return;
    bookingDateBlocks = dateBlocks;
    if (!courts.length) {
      bookingAvailabilityLoading = false;
      updateBookingTimes();
      return;
    }
    const unavailableByCourt = await Promise.all(courts.map((court) => (
      window.PickleRallyDB.listUnavailableBookingTimes(date, court)
    )));
    if (requestId !== bookingAvailabilityRequestId) return;
    bookingAvailability = unavailableByCourt.flat();
  } catch (error) {
    if (requestId !== bookingAvailabilityRequestId) return;
    bookingAvailabilityError = error;
    console.error("Unable to check booking availability:", error);
  }
  bookingAvailabilityLoading = false;
  updateBookingTimes();
};

bookingCourtOptions.addEventListener("change", () => {
  updateBookingCourtSelection();
  updateBookingTimes();
  updateBookingEstimate();
  schedulePromoValidation();
  loadBookingAvailability();
});
bookingDate.addEventListener("change", loadBookingAvailability);
bookingDate.addEventListener("change", schedulePromoValidation);
bookingDuration.addEventListener("change", updateBookingEstimate);
bookingDuration.addEventListener("change", schedulePromoValidation);
bookingDuration.addEventListener("change", updateBookingTimes);
bookingTime.addEventListener("change", updateBookingEstimate);
bookingTime.addEventListener("change", schedulePromoValidation);
bookingEmail.addEventListener("input", schedulePromoValidation);
updateBookingTimes();
loadCourtRates();


promoInput.addEventListener("input", schedulePromoValidation);

bookingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!courtRatesLoaded) return;
  const selectedCourts = getSelectedBookingCourts();
  if (!selectedCourts.length) {
    bookingMessage.className = "form-message is-error";
    bookingMessage.setAttribute("role", "alert");
    bookingMessage.textContent = "Choose at least one court.";
    bookingCourtOptions.querySelector('input[name="courts"]')?.focus();
    return;
  }
  if (!bookingForm.reportValidity()) return;
  const requestedTimeRange = bookingTimeRange(bookingTime.value);
  const overlappingDateBlock = bookingDateBlocks.find((dateBlock) => (
    dateBlock.blocked_date === bookingDate.value
    && (!Array.isArray(dateBlock.courts) || selectedCourts.some((court) => dateBlock.courts.includes(court)))
    && requestedTimeRange
    && blockOverlapsRange(dateBlock, requestedTimeRange)
  ));
  if (overlappingDateBlock) {
    bookingMessage.className = "form-message is-error";
    bookingMessage.setAttribute("role", "alert");
    bookingMessage.textContent = `${formatBlockRange(overlappingDateBlock)} is unavailable for ${formatBlockScope(overlappingDateBlock)} · ${overlappingDateBlock.reason}. Choose another time.`;
    bookingTime.focus();
    return;
  }

  const booking = Object.fromEntries(new FormData(bookingForm).entries());
  booking.courts = selectedCourts;
  const saveButton = bookingForm.querySelector('[type="submit"]');
  const originalButtonText = saveButton.firstChild.textContent;
  bookingMessage.className = "form-message is-loading";
  bookingMessage.setAttribute("role", "status");
  bookingMessage.setAttribute("aria-busy", "true");
  saveButton.disabled = true;
  saveButton.firstChild.textContent = "Sending request… ";
  bookingMessage.textContent = "Sending your booking request. Please wait.";
  let bookingRequestStarted = false;
  try {
    let estimatedTotal = getBookingSubtotal(selectedCourts, Number(booking.duration), booking.time);
    const promoCode = String(booking.promo || "").trim().toUpperCase();
    window.clearTimeout(promoValidationTimer);
    promoValidationRequestId += 1;
    if (promoCode) {
      const promoKey = currentPromoKey();
      const promo = verifiedPromo?.key === promoKey
        ? verifiedPromo
        : await window.PickleRallyDB.validatePromoCode(
          selectedCourts,
          Number(booking.duration),
          booking.time,
          promoCode,
          bookingEmail.value,
        );
      estimatedTotal = promo.estimated_total;
      verifiedPromo = { ...promo, key: promoKey };
      promoFeedback.classList.add("is-success");
      promoFeedback.classList.remove("is-error");
      promoFeedback.textContent = `${promo.code} applied · You save ${formatBookingCurrency(promo.discount_amount)}.`;
      updateBookingEstimate();
    }
    bookingRequestStarted = true;
    const bookingResult = await window.PickleRallyDB.createBooking({
      name: booking.name,
      email: booking.email,
      courts: selectedCourts,
      players: booking.players,
      duration: Number(booking.duration),
      date: booking.date,
      time: booking.time,
      estimated_total: estimatedTotal,
      promo: promoCode,
      notes: booking.notes || "",
    });
    try {
      await window.PickleRallyDB.sendBookingReferenceEmail(bookingResult.booking_id, bookingResult.cancellation_token);
      booking.emailSent = true;
    } catch (emailError) {
      console.error("Booking saved, but the Brevo email could not be sent:", emailError);
      booking.emailSent = false;
    }
    booking.reference = bookingResult.booking_id;
  } catch (error) {
    const requestWasRejected = Number.isInteger(error.status);
    const ratesChanged = error.message.includes("Court rates have changed")
      || error.message.includes("court rate or promo code changed");
    const promoRejected = error.message.toLowerCase().includes("promo code") && !ratesChanged;
    if (ratesChanged) {
      await loadCourtRates();
      if (promoInput.value.trim()) schedulePromoValidation();
    }
    if (promoRejected) {
      verifiedPromo = null;
      promoFeedback.classList.add("is-error");
      promoFeedback.classList.remove("is-success");
      promoFeedback.textContent = promoEligibilityMessage(error) || "This promo code could not be verified. Please try again.";
      updateBookingEstimate();
    }
    bookingMessage.className = "form-message is-error";
    bookingMessage.setAttribute("role", "alert");
    bookingMessage.removeAttribute("aria-busy");
    bookingMessage.textContent = ratesChanged
      ? "NOT SENT — The court rate or promo code changed while you were booking. Review the updated estimate and send your request again."
      : requestWasRejected
      ? `NOT SENT — ${error.message} Please check the details and try again.`
      : bookingRequestStarted
        ? "STATUS UNKNOWN — We couldn't confirm whether your booking request was sent because the connection was interrupted. Please contact the club before trying again."
        : "NOT SENT — We couldn't verify the promo code because the connection was interrupted. Please try again.";
    console.error("Unable to save booking request:", error);
    if (requestWasRejected && !ratesChanged) loadBookingAvailability();
    saveButton.firstChild.textContent = originalButtonText;
    saveButton.disabled = false;
    return;
  }

  bookingForm.reset();
  bookingCourtOptions.querySelectorAll('input[name="courts"]').forEach((input) => { input.checked = false; });
  verifiedPromo = null;
  promoFeedback.classList.remove("is-error", "is-success");
  updateBookingEstimate();
  updateBookingTimes();
  loadBookingAvailability();
  schedulePromoValidation();
  promoFeedback.textContent = "";
  bookingMessage.className = "form-message is-success";
  bookingMessage.setAttribute("role", "status");
  bookingMessage.removeAttribute("aria-busy");
  bookingMessage.textContent = booking.emailSent
    ? `Request sent. Reference ${booking.reference}.`
    : `Request saved, but its email could not be sent. Reference ${booking.reference}.`;
  bookingResultTitle.textContent = booking.emailSent ? "Request received" : "Request saved";
  bookingResultDescription.textContent = booking.emailSent
    ? "Your request is in our system. The reference and secure cancellation link have been sent to your email."
    : "Your request is in our system, but we couldn't send the reference email. Save this reference and contact the club; please don't submit another request.";
  bookingResultReference.textContent = booking.reference;
  bookingResultEmailStatus.textContent = booking.emailSent
    ? "Check your inbox for the booking details and secure cancellation link."
    : "No email was sent. Keep this reference so the club can find your request.";
  bookingResultDialog.classList.toggle("is-email-warning", !booking.emailSent);
  bookingResultDialog.showModal();
  saveButton.firstChild.textContent = originalButtonText;
  saveButton.disabled = false;
});
