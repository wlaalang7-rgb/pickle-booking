  const updateNewPromoValueLimit = () => {
    const isPercentage = newPromoType.value === "percentage";
    newPromoValue.max = isPercentage ? "99" : "100000";
    newPromoValueLabel.firstChild.textContent = isPercentage ? "Discount value (%) " : "Discount amount (₱) ";
  };
  const generatePromoCode = () => {
    if (!window.crypto || typeof window.crypto.getRandomValues !== "function") {
      addPromoCodeStatus.classList.add("is-error");
      addPromoCodeStatus.textContent = "Secure code generation is unavailable in this browser. Use HTTPS or a supported browser.";
      return;
    }
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const randomBytes = window.crypto.getRandomValues(new Uint8Array(8));
    const code = Array.from(randomBytes, (value) => alphabet[value % alphabet.length]).join("");
    newPromoCodeInput.value = `RALLY-${code}`;
    addPromoCodeStatus.classList.remove("is-error");
    addPromoCodeStatus.textContent = "Random code generated. Set its discount and optional limits, then add it.";
  };
  const toIsoTimestamp = (value) => value ? new Date(`${value}:00+08:00`).toISOString() : null;
  newPromoType.addEventListener("change", updateNewPromoValueLimit);
  generatePromoCodeButton.addEventListener("click", generatePromoCode);
  newPromoExpiry.min = toDateTimeLocal(new Date().toISOString());
  updateNewPromoValueLimit();

  promoCodeAddForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!promoCodeAddForm.reportValidity()) return;
    const formData = new FormData(promoCodeAddForm);
    const code = String(formData.get("code") || "").trim().toUpperCase();
    const discountType = String(formData.get("discount_type"));
    const discountValue = Number(formData.get("discount_value"));
    const expiryValue = String(formData.get("expires_at") || "");
    const maxRedemptionsValue = String(formData.get("max_redemptions") || "");
    if (!code) {
      addPromoCodeStatus.classList.add("is-error");
      addPromoCodeStatus.textContent = "Generate a promo code before adding it.";
      generatePromoCodeButton.focus();
      return;
    }
    const expiresAt = toIsoTimestamp(expiryValue);
    const maxRedemptions = maxRedemptionsValue ? Number(maxRedemptionsValue) : null;
    if (!Number.isInteger(discountValue)
      || (maxRedemptions !== null && (!Number.isInteger(maxRedemptions) || maxRedemptions < 1 || maxRedemptions > 1000000))) {
      addPromoCodeStatus.classList.add("is-error");
      addPromoCodeStatus.textContent = "Enter a whole discount value and a redemption limit between 1 and 1,000,000.";
      return;
    }

    addPromoCodeButton.disabled = true;
    addPromoCodeStatus.classList.remove("is-error");
    addPromoCodeStatus.textContent = "Adding promo code…";
    try {
      const createdPromo = await database.createPromoCode(code, discountType, discountValue, expiresAt, maxRedemptions);
      promoCodes = [...promoCodes, createdPromo].sort((first, second) => first.code.localeCompare(second.code));
      renderPromoCodes();
      promoCodeAddForm.reset();
      newPromoCodeInput.value = "";
      updateNewPromoValueLimit();
      addPromoCodeStatus.textContent = `${createdPromo.code} added.`;
      promoCodesFeedback.textContent = `${promoCodes.length} promo code${promoCodes.length === 1 ? "" : "s"} available to manage.`;
    } catch (error) {
      addPromoCodeStatus.classList.add("is-error");
      addPromoCodeStatus.textContent = `Promo code not added. ${error.message}`;
      if (error.message.includes("session has expired")) showLogin(error.message);
    } finally {
      addPromoCodeButton.disabled = false;
    }
  });

  promoCodeList.addEventListener("submit", async (event) => {
    const form = event.target.closest(".admin-promo-row");
    if (!form) return;
    event.preventDefault();
    if (!form.reportValidity()) return;

    const discountType = form.elements.namedItem("discount_type").value;
    const discountValue = Number(form.elements.namedItem("discount_value").value);
    const expiryValue = form.elements.namedItem("expires_at").value;
    const maxRedemptionsValue = form.elements.namedItem("max_redemptions").value;
    const expiresAt = toIsoTimestamp(expiryValue);
    const maxRedemptions = maxRedemptionsValue ? Number(maxRedemptionsValue) : null;
    const active = form.elements.namedItem("active").checked;
    if (!Number.isInteger(discountValue)
      || (maxRedemptions !== null && (!Number.isInteger(maxRedemptions) || maxRedemptions < 1 || maxRedemptions > 1000000))) return;
    const saveButton = form.querySelector('button[type="submit"]');
    const status = form.querySelector(".admin-rate-status");
    saveButton.disabled = true;
    status.classList.remove("is-error");
    status.textContent = "Saving…";
    try {
      const updatedPromo = await database.savePromoCode(
        form.dataset.code,
        discountType,
        discountValue,
        expiresAt,
        maxRedemptions,
        active,
      );
      promoCodes = promoCodes.map((promo) => promo.code === updatedPromo.code ? updatedPromo : promo);
      renderPromoCodes();
      promoCodesFeedback.textContent = `${updatedPromo.code} updated.`;
    } catch (error) {
      status.classList.add("is-error");
      status.textContent = `Promo code not saved. ${error.message}`;
      if (error.message.includes("session has expired")) showLogin(error.message);
    } finally {
      saveButton.disabled = false;
    }
  });

  promoCodeList.addEventListener("click", async (event) => {
    const deleteButton = event.target.closest(".admin-promo-delete");
    if (!deleteButton) return;
    const form = deleteButton.closest(".admin-promo-row");
    if (!form || !window.confirm(`Delete promo code ${form.dataset.code}? Existing bookings will keep their saved totals.`)) return;

    deleteButton.disabled = true;
    const status = form.querySelector(".admin-rate-status");
    status.classList.remove("is-error");
    status.textContent = "Deleting…";
    try {
      await database.deletePromoCode(form.dataset.code);
      promoCodes = promoCodes.filter((promo) => promo.code !== form.dataset.code);
      renderPromoCodes();
      promoCodesFeedback.textContent = `${form.dataset.code} deleted.`;
    } catch (error) {
      deleteButton.disabled = false;
      status.classList.add("is-error");
      status.textContent = `Promo code not deleted. ${error.message}`;
      if (error.message.includes("session has expired")) showLogin(error.message);
    }
  });

  courtRateList.addEventListener("submit", async (event) => {
    const form = event.target.closest(".admin-rate-row");
    if (!form) return;
    event.preventDefault();

    const nameInput = form.querySelector('input[name="court"]');
    const dayRateInput = form.querySelector('input[name="day_rate"]');
    const nightRateInput = form.querySelector('input[name="night_rate"]');
    const imageInput = form.querySelector('input[name="image_path"]');
    const imageField = courtImageFields.get(form);
    const fileInput = imageField.fileInput;
    const court = form.dataset.court;
    const saveButton = form.querySelector('button[type="submit"]');
    const status = form.querySelector(".admin-rate-status");
    const newCourt = nameInput.value.trim();
    const dayRate = parsePesoRate(dayRateInput);
    const nightRate = parsePesoRate(nightRateInput);
    const imagePath = imageInput.value;
    nameInput.setCustomValidity(newCourt.length < 2 || newCourt.length > 60
      ? "Court names must be between 2 and 60 characters."
      : "");
    if (!form.reportValidity()) return;
    if (![dayRate, nightRate].every((rate) => Number.isInteger(rate) && rate >= 1 && rate <= 100000)) return;

    const existingRate = courtRates.find((rate) => rate.court === court);
    if (!court || !existingRate) {
      status.classList.add("is-error");
      status.textContent = "This court is no longer available. Refresh and try again.";
      return;
    }
    if (newCourt === court && dayRate === existingRate.day_rate
      && nightRate === existingRate.night_rate
      && imagePath === existingRate.image_path && !fileInput.files.length) {
      status.classList.remove("is-error");
      status.textContent = "No changes to save.";
      return;
    }

    status.classList.remove("is-error");
    saveButton.disabled = true;
    status.textContent = "Saving…";
    nameInput.disabled = true;
    dayRateInput.disabled = true;
    nightRateInput.disabled = true;
    imageInput.disabled = true;
    fileInput.disabled = true;
    let uploadedImagePath = "";
    let settingsSaved = false;
    try {
      if (fileInput.files[0]) {
        status.textContent = "Uploading court photo…";
        uploadedImagePath = await database.uploadCourtImage(fileInput.files[0]);
      }
      status.textContent = "Saving changes…";
      const updatedRate = await database.saveCourtSettings(
        court,
        newCourt,
        dayRate,
        nightRate,
        uploadedImagePath || imagePath,
      );
      settingsSaved = true;
      courtRates = courtRates.map((rate) => rate.court === court ? updatedRate : rate);
      bookings = bookings.map((booking) => booking.court === court
        ? { ...booking, court: newCourt }
        : booking);
      if (uploadedImagePath) imageField.setPath(uploadedImagePath);
      form.dataset.court = newCourt;
      nameInput.value = newCourt;
      dayRateInput.setAttribute("aria-label", `${newCourt} day rate / hour in Philippine pesos`);
      nightRateInput.setAttribute("aria-label", `${newCourt} night rate / hour in Philippine pesos`);
      let saveMessage = court === newCourt
        ? `Saved · Day ₱${new Intl.NumberFormat("en-PH").format(dayRate)}/hr · Night ₱${new Intl.NumberFormat("en-PH").format(nightRate)}/hr`
        : `Saved · ${newCourt} · Day ₱${new Intl.NumberFormat("en-PH").format(dayRate)}/hr · Night ₱${new Intl.NumberFormat("en-PH").format(nightRate)}/hr`;
      if (updatedRate.image_path !== existingRate.image_path
        && database.isUploadedCourtImage(existingRate.image_path)) {
        try {
          await database.deleteCourtImage(existingRate.image_path);
        } catch (cleanupError) {
          console.error(`Unable to remove the previous photo for ${newCourt}:`, cleanupError);
          saveMessage += ` The previous photo could not be removed: ${cleanupError.message}`;
        }
      }
      status.textContent = saveMessage;
      renderAdminBookingOptions();
      updateAdminBookingTimes();
      renderBookings();
      renderOverviewAnalytics();
      setFeedback(`${court === newCourt
        ? `${court} day and night rates updated.`
        : `${court} renamed and its day/night rates updated. Existing booking totals are unchanged.`}${saveMessage.includes("previous photo") ? " The previous photo could not be removed." : ""}`);
    } catch (error) {
      let failure = error;
      if (uploadedImagePath && !settingsSaved) {
        try {
          await database.deleteCourtImage(uploadedImagePath);
        } catch (cleanupError) {
          console.error(`Unable to remove the unsaved photo for ${court}:`, cleanupError);
          failure = new Error(`${error.message} The uploaded photo could not be cleaned up: ${cleanupError.message}`, { cause: error });
        }
      }
      status.classList.add("is-error");
      status.textContent = `Changes not saved. ${failure.message}`;
      console.error(`Unable to save settings for ${court}:`, failure);
      if (failure.message.includes("session has expired")) showLogin(failure.message);
    } finally {
      nameInput.disabled = false;
      dayRateInput.disabled = false;
      nightRateInput.disabled = false;
      imageInput.disabled = false;
      fileInput.disabled = false;
      saveButton.disabled = false;
    }
  });
  courtRateList.addEventListener("click", async (event) => {
    const deleteButton = event.target.closest(".admin-rate-delete");
    if (!deleteButton) return;
    const form = deleteButton.closest(".admin-rate-row");
    const status = form.querySelector(".admin-rate-status");
    const court = form.dataset.court;
    const existingRate = courtRates.find((rate) => rate.court === court);
    if (!court) return;

    if (bookings.some((booking) => booking.court === court)) {
      status.classList.add("is-error");
      status.textContent = "This court has booking history and cannot be deleted.";
      return;
    }
    if (courtRates.length <= 1) {
      status.classList.add("is-error");
      status.textContent = "At least one court must remain available.";
      return;
    }
    if (!window.confirm(`Delete ${court}? This cannot be undone.`)) return;

    status.classList.remove("is-error");
    deleteButton.disabled = true;
    status.textContent = "Deleting…";
    try {
      await database.deleteCourt(court);
      courtRates = courtRates.filter((rate) => rate.court !== court);
      renderCourtRates();
      renderAdminBookingOptions();
      renderOverviewAnalytics();
      updateCourtRatesSummary();
      let cleanupNotice = "";
      if (existingRate && database.isUploadedCourtImage(existingRate.image_path)) {
        try {
          await database.deleteCourtImage(existingRate.image_path);
        } catch (cleanupError) {
          console.error(`Unable to remove the photo for deleted court ${court}:`, cleanupError);
          cleanupNotice = ` The court was deleted, but its photo could not be removed: ${cleanupError.message}`;
        }
      }
      setFeedback(`${court} deleted.${cleanupNotice}`);
      if (cleanupNotice) {
        courtRatesFeedback.classList.add("is-error");
        courtRatesFeedback.textContent += cleanupNotice;
      }
    } catch (error) {
      status.classList.add("is-error");
      status.textContent = `Court not deleted. ${error.message}`;
      console.error(`Unable to delete ${court}:`, error);
      if (error.message.includes("session has expired")) showLogin(error.message);
    } finally {
      deleteButton.disabled = false;
    }
  });
  const addCourtImagePath = courtRateAddForm.elements.namedItem("image_path");
  const addCourtImageFile = courtRateAddForm.elements.namedItem("image_file");
  const addCourtImagePreview = courtRateAddForm.querySelector(".admin-rate-image-preview");
  const addCourtImageHint = courtRateAddForm.querySelector(".admin-rate-image-hint");
  const addCourtImageField = bindCourtImageField(
    addCourtImagePath,
    addCourtImageFile,
    addCourtImagePreview,
    addCourtImageHint,
  );
  courtRateAddForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const nameInput = courtRateAddForm.elements.namedItem("court");
    const dayRateInput = courtRateAddForm.elements.namedItem("day_rate");
    const nightRateInput = courtRateAddForm.elements.namedItem("night_rate");
    const imageInput = courtRateAddForm.elements.namedItem("image_path");
    const fileInput = courtRateAddForm.elements.namedItem("image_file");
    const court = nameInput.value.trim();
    const dayRate = parsePesoRate(dayRateInput);
    const nightRate = parsePesoRate(nightRateInput);
    const imagePath = imageInput.value;
    nameInput.setCustomValidity(court.length < 2 || court.length > 60
      ? "Court names must be between 2 and 60 characters."
      : "");
    if (!courtRateAddForm.reportValidity()) return;
    if (![dayRate, nightRate].every((rate) => Number.isInteger(rate) && rate >= 1 && rate <= 100000)) return;

    addCourtButton.disabled = true;
    addCourtStatus.classList.remove("is-error");
    addCourtStatus.textContent = "Adding…";
    nameInput.disabled = true;
    dayRateInput.disabled = true;
    nightRateInput.disabled = true;
    imageInput.disabled = true;
    fileInput.disabled = true;
    let uploadedImagePath = "";
    let courtAdded = false;
    try {
      if (fileInput.files[0]) {
        addCourtStatus.textContent = "Uploading court photo…";
        uploadedImagePath = await database.uploadCourtImage(fileInput.files[0]);
      }
      addCourtStatus.textContent = "Saving court…";
      const newRate = await database.addCourt(court, dayRate, nightRate, uploadedImagePath || imagePath);
      courtAdded = true;
      courtRates = [...courtRates, newRate].sort((a, b) => a.sort_order - b.sort_order);
      renderCourtRates();
      renderAdminBookingOptions();
      renderOverviewAnalytics();
      courtRateAddForm.reset();
      addCourtImageField.reset();
      updateCourtRatesSummary();
      addCourtStatus.textContent = `${court} added · Day ₱${new Intl.NumberFormat("en-PH").format(dayRate)}/hr · Night ₱${new Intl.NumberFormat("en-PH").format(nightRate)}/hr.`;
      setFeedback(`${court} added to the court list.`);
    } catch (error) {
      let failure = error;
      if (uploadedImagePath && !courtAdded) {
        try {
          await database.deleteCourtImage(uploadedImagePath);
        } catch (cleanupError) {
          console.error(`Unable to remove the unsaved photo for ${court}:`, cleanupError);
          failure = new Error(`${error.message} The uploaded photo could not be cleaned up: ${cleanupError.message}`, { cause: error });
        }
      }
      addCourtStatus.classList.add("is-error");
      addCourtStatus.textContent = `Court not added. ${failure.message}`;
      console.error(`Unable to add ${court}:`, failure);
      if (failure.message.includes("session has expired")) showLogin(failure.message);
    } finally {
      nameInput.disabled = false;
      dayRateInput.disabled = false;
      nightRateInput.disabled = false;
      imageInput.disabled = false;
      fileInput.disabled = false;
      addCourtButton.disabled = false;
    }
  });
  bookingDuration.addEventListener("change", loadAdminBookingAvailability);
  bookingDuration.addEventListener("change", updateAdminBookingTotal);
  bookingDuration.addEventListener("change", scheduleAdminPromoValidation);
  bookingDate.addEventListener("change", loadAdminBookingAvailability);
  bookingDate.addEventListener("change", scheduleAdminPromoValidation);
  bookingCourts.addEventListener("change", () => {
    updateAdminBookingCourtOptions();
    updateAdminBookingTimes();
    updateAdminBookingTotal();
    scheduleAdminPromoValidation();
  });
  bookingTime.addEventListener("change", updateAdminBookingTotal);
  bookingTime.addEventListener("change", scheduleAdminPromoValidation);
  bookingPromoInput.addEventListener("input", scheduleAdminPromoValidation);
  bookingEmail.addEventListener("input", scheduleAdminPromoValidation);
  document.querySelector("#open-admin-booking").addEventListener("click", () => {
    bookingFormFeedback.textContent = "";
    if (!bookingDate.value) bookingDate.value = localDateValue();
    bookingDialog.showModal();
    loadAdminBookingAvailability();
    bookingForm.querySelector("input[name='name']").focus();
  });
  document.querySelector("#admin-booking-close").addEventListener("click", () => bookingDialog.close());
  bookingDialog.addEventListener("click", (event) => {
    if (event.target === bookingDialog) bookingDialog.close();
  });
  bookingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const selectedCourts = getSelectedAdminCourts();
    if (!selectedCourts.length) {
      bookingFormFeedback.textContent = "Choose at least one court.";
      bookingCourts.querySelector('input[name="courts"]')?.focus();
      return;
    }
    if (!bookingForm.reportValidity()) return;

    const formData = new FormData(bookingForm);
    const promoCode = String(formData.get("promo") || "").trim().toUpperCase();
    window.clearTimeout(adminPromoValidationTimer);
    adminPromoValidationRequestId += 1;
    const booking = {
      name: String(formData.get("name") || "").trim(),
      email: String(formData.get("email") || "").trim().toLowerCase(),
      courts: selectedCourts,
      players: String(formData.get("players") || ""),
      duration: Number(formData.get("duration")),
      date: String(formData.get("date") || ""),
      time: String(formData.get("time") || ""),
      estimated_total: getAdminBookingSubtotal(selectedCourts, Number(formData.get("duration")), String(formData.get("time") || "")) || 0,
      promo: promoCode,
    };

    if (!booking.name || !booking.email || !booking.estimated_total || booking.date < localDateValue()) {
      bookingFormFeedback.textContent = "Enter a valid player name and email address, choose court(s), and select a valid booking date.";
      return;
    }
    if (!booking.time || bookingAvailabilityError
      || bookingAvailabilityKey !== `${booking.date}|${booking.duration}`
      || !getAdminAvailableSlots(selectedCourts).some(({ time }) => time === booking.time)) {
      bookingFormFeedback.textContent = bookingAvailabilityError
        ? `${bookingAvailabilityError.message} Choose another date.`
        : "Choose available courts and a time after checking availability.";
      loadAdminBookingAvailability();
      return;
    }

    bookingSubmit.disabled = true;
    bookingFormFeedback.textContent = promoCode ? "Checking promo code and court availability…" : "Checking court availability…";
    try {
      if (promoCode) {
        const promo = await database.validatePromoCode(
          booking.courts,
          booking.duration,
          booking.time,
          promoCode,
          booking.email,
        );
        booking.estimated_total = promo.estimated_total;
        verifiedAdminPromo = {
          ...promo,
          key: [booking.courts.slice().sort().join(","), booking.duration, booking.time, promoCode, booking.email].join("|"),
        };
        bookingPromoFeedback.classList.add("is-success");
        bookingPromoFeedback.classList.remove("is-error");
        bookingPromoFeedback.textContent = `${promo.code} applied · Save ₱${new Intl.NumberFormat("en-PH").format(promo.discount_amount)}.`;
        updateAdminBookingTotal();
      } else {
        verifiedAdminPromo = null;
        bookingPromoFeedback.classList.remove("is-error", "is-success");
        bookingPromoFeedback.textContent = "";
      }

      const latestBookings = await database.listBookings();
      bookings = latestBookings;
      if (hasBookingConflict(booking, latestBookings)) {
        renderBookings();
        bookingFormFeedback.textContent = "One of those courts is already booked during this time. Choose another court or time.";
        await loadAdminBookingAvailability();
        return;
      }

      const createdBooking = await database.createAdminBooking(booking);
      let confirmationSent = true;
      try {
        await database.sendBookingReferenceEmail(createdBooking.booking_id, createdBooking.cancellation_token);
      } catch (emailError) {
        confirmationSent = false;
        console.error("Admin booking saved, but the Brevo email could not be sent:", emailError);
      }
      bookings = await database.listBookings();
      activePage = 1;
      renderBookings();
      await loadPromoCodes();
      setFeedback(confirmationSent
        ? `Booking for ${booking.name} created and reference emailed to ${booking.email}.`
        : `Booking for ${booking.name} created, but its reference email could not be sent. Reference: ${createdBooking.booking_id}`);
      bookingAvailabilityRequestId += 1;
      bookingForm.reset();
      verifiedAdminPromo = null;
      bookingPromoFeedback.classList.remove("is-error", "is-success");
      bookingPromoFeedback.textContent = "";
      bookingDate.min = localDateValue();
      bookingAvailabilityKey = "";
      bookingAvailabilityByCourt = new Map();
      bookingAvailabilityError = null;
      bookingAvailabilityLoading = false;
      updateAdminBookingCourtOptions();
      updateAdminBookingTimes();
      updateAdminBookingTotal();
      bookingDialog.close();
    } catch (error) {
      if (error.message.includes("time has just become unavailable")) {
        bookingFormFeedback.textContent = "One of those courts is already booked during this time. Choose another court or time.";
        await loadAdminBookingAvailability();
      } else {
        bookingFormFeedback.textContent = error.message;
      }
      if (error.message.toLowerCase().includes("promo code")) {
        verifiedAdminPromo = null;
        bookingPromoFeedback.classList.add("is-error");
        bookingPromoFeedback.classList.remove("is-success");
        bookingPromoFeedback.textContent = promoEligibilityMessage(error)
          || "We couldn't verify the promo code. Please refresh the estimate and try again.";
        updateAdminBookingTotal();
      }
      if (error.message.includes("session has expired")) {
        bookingDialog.close();
        showLogin(error.message);
      }
    } finally {
      bookingSubmit.disabled = false;
    }
  });

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      activePage = 1;
      filterButtons.forEach((filterButton) => {
        const isActive = filterButton === button;
        filterButton.classList.toggle("is-active", isActive);
        filterButton.setAttribute("aria-pressed", String(isActive));
      });
      renderBookings();
    });
  });

  const resetPageAndRender = () => {
    activePage = 1;
    renderBookings();
  };

  searchInput.addEventListener("input", resetPageAndRender);
  dateFilter.addEventListener("change", resetPageAndRender);
  courtFilter.addEventListener("change", resetPageAndRender);
  previousPageButton.addEventListener("click", () => {
    if (activePage === 1) return;
    activePage -= 1;
    renderBookings();
  });
  nextPageButton.addEventListener("click", () => {
    activePage += 1;
    renderBookings();
  });
  refreshButton.addEventListener("click", loadBookings);
  const updateBlockoutAllDayFields = () => {
    const allDay = calendarBlockoutAllDay.checked;
    calendarBlockoutStart.disabled = allDay;
    calendarBlockoutEnd.disabled = allDay;
    calendarBlockoutStart.closest("label").hidden = allDay;
    calendarBlockoutEnd.closest("label").hidden = allDay;
    calendarBlockoutSubmit.textContent = allDay ? "Block all day" : "Block time";
  };
  calendarBlockoutAllDay.addEventListener("change", updateBlockoutAllDayFields);
  updateBlockoutAllDayFields();
  calendarBlockoutCourtOptions.addEventListener("change", updateBlockoutSelectionSummary);
  calendarBlockoutWholeClub.addEventListener("change", renderBlockoutCourtOptions);
  calendarBlockoutSelectedCourts.addEventListener("change", renderBlockoutCourtOptions);
  calendarBlockoutForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!calendarBlockoutForm.reportValidity()) return;

    const blockedDate = calendarBlockoutDate.value;
    const blockType = calendarBlockoutType.value;
    const selectedCourts = [...calendarBlockoutCourtOptions.querySelectorAll('input[name="block_courts"]:checked')]
      .map((input) => input.value);
    if (calendarBlockoutSelectedCourts.checked && selectedCourts.length === 0) {
      calendarBlockoutFeedback.classList.add("is-error");
      calendarBlockoutFeedback.textContent = "Choose Whole club or select at least one court.";
      return;
    }
    const courts = calendarBlockoutWholeClub.checked ? null : selectedCourts;
    const startTime = calendarBlockoutAllDay.checked ? "00:00" : calendarBlockoutStart.value;
    const endTime = calendarBlockoutAllDay.checked ? "24:00" : calendarBlockoutEnd.value;
    const reason = calendarBlockoutReason.value.trim();
    calendarBlockoutSubmit.disabled = true;
    calendarBlockoutFeedback.classList.remove("is-error");
    calendarBlockoutFeedback.textContent = `Saving ${blockType === "maintenance" ? "maintenance" : "club closure"} for ${courts ? courts.join(", ") : "the whole club"}…`;
    try {
      await database.createBookingDateBlock(blockedDate, blockType, courts, startTime, endTime, reason);
      calendarBlockoutFeedback.textContent = `${formatBlockRange({
        start_time: `${startTime}:00`,
        end_time: `${endTime}:00`,
      })} blocked for ${reason} · ${courts ? courts.join(", ") : "whole club"}.`;
      await loadCalendarBlocks({ force: true, silent: true });
      renderAdminCalendar();
      setFeedback(`${blockedDate}, ${formatBlockRange({
        start_time: `${startTime}:00`,
        end_time: `${endTime}:00`,
      })} blocked for ${courts ? courts.join(", ") : "the whole club"}.`);
    } catch (error) {
      calendarBlockoutFeedback.classList.add("is-error");
      calendarBlockoutFeedback.textContent = error.message;
      console.error("Unable to block booking date:", error);
      if (error.message.includes("session has expired")) showLogin(error.message);
    } finally {
      calendarBlockoutSubmit.disabled = false;
    }
  });
  calendarBlockList.addEventListener("click", async (event) => {
    const removeButton = event.target.closest("button[data-block-id]");
    if (!removeButton) return;
    const dateBlock = (calendarBlocksByDate.get(calendarSelectedDate) || [])
      .find((block) => block.id === removeButton.dataset.blockId);
    if (!dateBlock) return;
    const blockType = dateBlock.block_type === "maintenance" ? "maintenance" : "closure";
    if (!window.confirm(`Remove the ${blockType} block for ${formatBlockScope(dateBlock)} on ${calendarSelectedDate} from ${formatBlockRange(dateBlock)} (${dateBlock.reason})?`)) return;

    removeButton.disabled = true;
    calendarBlockoutFeedback.classList.remove("is-error");
    calendarBlockoutFeedback.textContent = "Removing the blocked time…";
    try {
      await database.deleteBookingDateBlock(dateBlock.id);
      calendarBlockoutFeedback.textContent = "Time block removed. Customers can request this time again.";
      await loadCalendarBlocks({ force: true, silent: true });
      renderAdminCalendar();
      setFeedback(`The ${formatBlockRange(dateBlock)} block was removed for ${calendarSelectedDate}.`);
    } catch (error) {
      calendarBlockoutFeedback.classList.add("is-error");
      calendarBlockoutFeedback.textContent = error.message;
      console.error("Unable to remove booking date block:", error);
      if (error.message.includes("session has expired")) showLogin(error.message);
    } finally {
      removeButton.disabled = false;
    }
  });
  calendarCourtFilter.addEventListener("change", renderAdminCalendar);
  document.querySelector("#calendar-day-close").addEventListener("click", () => calendarDayDialog.close());
  calendarDayDialog.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    calendarDayDialog.close();
  });
  calendarDayDialog.addEventListener("click", (event) => {
    if (event.target === calendarDayDialog) calendarDayDialog.close();
  });
  document.querySelector("#calendar-previous-month").addEventListener("click", () => {
    const selectedDate = new Date(`${calendarSelectedDate}T00:00:00`);
    const nextMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
    const selectedDay = Math.min(
      selectedDate.getDate(),
      new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate(),
    );
    calendarMonth = nextMonth;
    calendarSelectedDate = formatCalendarDateKey(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), selectedDay));
    renderAdminCalendar();
    loadCalendarBlocks();
  });
  document.querySelector("#calendar-next-month").addEventListener("click", () => {
    const selectedDate = new Date(`${calendarSelectedDate}T00:00:00`);
    const nextMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
    const selectedDay = Math.min(
      selectedDate.getDate(),
      new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate(),
    );
    calendarMonth = nextMonth;
    calendarSelectedDate = formatCalendarDateKey(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), selectedDay));
    renderAdminCalendar();
    loadCalendarBlocks();
  });
  document.querySelector("#calendar-today").addEventListener("click", () => {
    calendarSelectedDate = localDateValue();
    const today = new Date(`${calendarSelectedDate}T00:00:00`);
    calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    renderAdminCalendar();
    loadCalendarBlocks();
  });
  sidebarLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const target = link.getAttribute("href").slice(1);
      window.history.replaceState(null, "", `#${target}`);
      setActiveView(target);
    });
  });
