  const parsePesoRate = (input) => {
    const raw = input.value.trim().replace(/,/g, "");
    if (!/^\d+$/.test(raw)) return Number.NaN;
    const value = Number(raw);
    input.setCustomValidity(value < 1 || value > 100000
      ? "Enter a whole-peso rate from ₱1 to ₱100,000 per hour."
      : "");
    return value;
  };

  const bindPesoRateInput = (input) => {
    input.type = "text";
    input.inputMode = "numeric";
    input.autocomplete = "off";
    input.maxLength = 8;
    input.pattern = "[0-9,]+";
    input.setAttribute("aria-describedby", "court-rates-note");
    input.addEventListener("beforeinput", (event) => {
      if (event.inputType.startsWith("insert") && event.data && /\D/.test(event.data)) {
        event.preventDefault();
      }
    });
    input.addEventListener("paste", (event) => {
      const pastedText = event.clipboardData?.getData("text") ?? "";
      if (!/^\d+$/.test(pastedText)) event.preventDefault();
    });
    input.addEventListener("focus", () => {
      const cursor = input.selectionStart ?? input.value.length;
      const removed = (input.value.slice(0, cursor).match(/,/g) || []).length;
      input.value = input.value.replace(/,/g, "");
      input.setSelectionRange(Math.max(0, cursor - removed), Math.max(0, cursor - removed));
    });
    input.addEventListener("input", () => {
      const cursor = input.selectionStart ?? input.value.length;
      const cleanedValue = input.value.replace(/\D/g, "");
      if (cleanedValue !== input.value) {
        const cleanedCursor = input.value.slice(0, cursor).replace(/\D/g, "").length;
        input.value = cleanedValue;
        input.setSelectionRange(cleanedCursor, cleanedCursor);
      }
      const value = parsePesoRate(input);
      if (Number.isNaN(value)) {
        input.setCustomValidity(input.value.trim() && !/^[\d,]+$/.test(input.value)
          ? "Use digits only and enter a whole-peso rate."
          : "Enter a whole-peso rate from ₱1 to ₱100,000 per hour.");
      }
    });
    input.addEventListener("blur", () => {
      const value = parsePesoRate(input);
      if (!Number.isNaN(value)) input.value = new Intl.NumberFormat("en-PH").format(value);
    });
    const initialValue = parsePesoRate(input);
    if (!Number.isNaN(initialValue)) input.value = new Intl.NumberFormat("en-PH").format(initialValue);
    return input;
  };

  document.querySelectorAll("#new-court-day-rate, #new-court-night-rate").forEach(bindPesoRateInput);

  const bindCourtImageField = (imagePathInput, fileInput, preview, hint) => {
    let previewUrl = "";
    const clearPreviewUrl = () => {
      if (!previewUrl) return;
      URL.revokeObjectURL(previewUrl);
      previewUrl = "";
    };
    const resetFile = () => {
      clearPreviewUrl();
      fileInput.value = "";
      fileInput.setCustomValidity("");
      hint.textContent = "JPG, PNG, or WebP · up to 5 MB.";
      hint.classList.remove("is-error");
      preview.src = database.getCourtImageUrl(imagePathInput.value);
    };
    const setPath = (path) => {
      imagePathInput.value = path;
      resetFile();
    };
    fileInput.addEventListener("change", () => {
      clearPreviewUrl();
      const file = fileInput.files[0];
      fileInput.setCustomValidity("");
      if (!file) {
        hint.textContent = "JPG, PNG, or WebP · up to 5 MB.";
        hint.classList.remove("is-error");
        preview.src = database.getCourtImageUrl(imagePathInput.value);
        return;
      }
      const validationError = database.validateCourtImageFile(file);
      fileInput.setCustomValidity(validationError);
      if (validationError) {
        hint.textContent = validationError;
        hint.classList.add("is-error");
        preview.src = database.getCourtImageUrl(imagePathInput.value);
        return;
      }
      previewUrl = URL.createObjectURL(file);
      preview.src = previewUrl;
      hint.textContent = `Ready to upload: ${file.name}`;
      hint.classList.remove("is-error");
    });
    return {
      cleanup: clearPreviewUrl,
      reset: resetFile,
      setPath,
    };
  };

  const createCourtImageField = (id, name, imagePath) => {
    const fields = document.createElement("div");
    fields.className = "admin-rate-photo-fields";
    const imagePathInput = document.createElement("input");
    imagePathInput.id = id;
    imagePathInput.name = name;
    imagePathInput.type = "hidden";
    imagePathInput.value = imagePath;
    const previewLabel = document.createElement("span");
    previewLabel.className = "admin-rate-image-preview-label";
    previewLabel.textContent = "Photo preview";
    const preview = document.createElement("img");
    preview.className = "admin-rate-image-preview";
    preview.src = database.getCourtImageUrl(imagePathInput.value);
    preview.alt = "Current court photo";
    preview.loading = "lazy";
    preview.decoding = "async";
    const previewField = document.createElement("div");
    previewField.className = "admin-rate-image-preview-field";
    previewField.append(previewLabel, preview);

    const uploadLabel = document.createElement("label");
    const uploadId = `${id}-upload`;
    uploadLabel.htmlFor = uploadId;
    uploadLabel.textContent = "Upload image";
    const fileInput = document.createElement("input");
    fileInput.id = uploadId;
    fileInput.name = "image_file";
    fileInput.type = "file";
    fileInput.accept = "image/jpeg,image/png,image/webp";
    fileInput.setAttribute("aria-describedby", `${uploadId}-hint`);
    const hint = document.createElement("span");
    hint.id = `${uploadId}-hint`;
    hint.className = "admin-rate-image-hint";
    hint.textContent = "JPG, PNG, or WebP · up to 5 MB.";
    hint.setAttribute("role", "status");
    uploadLabel.append(fileInput, hint);
    fields.append(previewField, uploadLabel, imagePathInput);
    const imageField = bindCourtImageField(imagePathInput, fileInput, preview, hint);
    return { field: fields, imagePathInput, fileInput, ...imageField };
  };

  const createCourtRateInput = (id, name, labelText, court, value) => {
    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = labelText;
    const control = document.createElement("div");
    control.className = "admin-rate-control";
    const prefix = document.createElement("span");
    prefix.setAttribute("aria-hidden", "true");
    prefix.className = "admin-rate-currency";
    prefix.textContent = "₱";
    const input = document.createElement("input");
    input.id = id;
    input.name = name;
    input.type = "text";
    input.value = String(value);
    input.required = true;
    input.setAttribute("aria-label", `${court} ${labelText.toLowerCase()} in Philippine pesos`);
    bindPesoRateInput(input);
    const unit = document.createElement("span");
    unit.className = "admin-rate-unit";
    unit.setAttribute("aria-hidden", "true");
    unit.textContent = "/hr";
    control.append(prefix, input, unit);
    label.append(control);
    return { label, input };
  };

  const renderCourtRates = () => {
    renderBlockoutCourtOptions();
    courtRateList.setAttribute("aria-busy", "false");
    courtImagePreviewCleanups.forEach((cleanup) => cleanup());
    courtImagePreviewCleanups = [];
    courtRateList.replaceChildren(...courtRates.map(({ court, day_rate: dayRate, night_rate: nightRate, image_path: imagePath }, index) => {
      const row = document.createElement("form");
      row.className = "admin-rate-row";
      row.dataset.court = court;

      const nameLabel = document.createElement("label");
      nameLabel.htmlFor = `court-name-${index}`;
      nameLabel.textContent = "Court name";
      const nameInput = document.createElement("input");
      nameInput.id = `court-name-${index}`;
      nameInput.name = "court";
      nameInput.type = "text";
      nameInput.minLength = 2;
      nameInput.maxLength = 60;
      nameInput.value = court;
      nameInput.required = true;
      nameInput.autocomplete = "off";
      nameLabel.append(nameInput);

      const dayRateField = createCourtRateInput(`court-day-rate-${index}`, "day_rate", "Day rate / hour", court, dayRate);
      const nightRateField = createCourtRateInput(`court-night-rate-${index}`, "night_rate", "Night rate / hour", court, nightRate);
      const imageField = createCourtImageField(`court-image-${index}`, "image_path", imagePath);
      courtImagePreviewCleanups.push(imageField.cleanup);
      courtImageFields.set(row, imageField);
      const actions = document.createElement("div");
      actions.className = "admin-rate-actions";
      const save = document.createElement("button");
      save.className = "button button-dark";
      save.type = "submit";
      save.textContent = "Save changes";
      const remove = document.createElement("button");
      remove.className = "button admin-rate-delete";
      remove.type = "button";
      remove.textContent = "Delete";
      remove.setAttribute("aria-label", `Delete ${court}`);
      actions.append(save, remove);
      const status = document.createElement("span");
      status.className = "admin-rate-status";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      row.append(nameLabel, dayRateField.label, nightRateField.label, imageField.field, actions, status);
      return row;
    }));
  };

  const renderAdminBookingOptions = () => {
    const selectedCourts = new Set(getSelectedAdminCourts());
    bookingCourts.replaceChildren(...courtRates.map(({ court, day_rate: dayRate, night_rate: nightRate }) => {
      const label = document.createElement("label");
      label.className = "admin-booking-court-option";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "courts";
      checkbox.value = court;
      checkbox.checked = selectedCourts.has(court);
      const details = document.createElement("span");
      details.textContent = `${court} · Day ₱${new Intl.NumberFormat("en-PH").format(dayRate)}/hr · Night ₱${new Intl.NumberFormat("en-PH").format(nightRate)}/hr`;
      label.append(checkbox, details);
      return label;
    }));
    bookingCourtPicker.disabled = courtRates.length === 0;
    updateAdminBookingTotal();
  };

  const loadCourtRates = async () => {
    if (courtRatesLoading) return;
    courtRatesLoading = true;
    courtRatesFeedback.classList.remove("is-error");
    courtRatesFeedback.textContent = "Loading court rates…";
    courtRateList.setAttribute("aria-busy", "true");
    try {
      const rates = await database.listCourtRates();
      if (!rates.length
        || rates.some((rate) => rate.court.trim().length < 2
          || rate.court.length > 60
          || rate.day_rate < 1 || rate.day_rate > 100000
          || rate.night_rate < 1 || rate.night_rate > 100000)) {
        throw new Error("The court rate list is empty or contains invalid entries.");
      }
      courtRates = rates;
      renderBlockoutCourtOptions();
      renderCourtRates();
      renderAdminBookingOptions();
      openAdminBookingButton.disabled = false;
      addCourtButton.disabled = false;
      updateCourtRatesSummary();
      renderOverviewAnalytics();
    } catch (error) {
      courtRates = [];
      courtRateList.setAttribute("aria-busy", "false");
      const message = document.createElement("p");
      message.textContent = `Court rates could not be loaded. Run the latest supabase/schema.sql and try again. ${error.message}`;
      courtRateList.replaceChildren(message);
      bookingCourts.replaceChildren(Object.assign(document.createElement("p"), {
        textContent: "Court rates unavailable.",
      }));
      bookingCourtPicker.disabled = true;
      openAdminBookingButton.disabled = true;
      addCourtButton.disabled = true;
      courtRatesFeedback.classList.add("is-error");
      courtRatesFeedback.textContent = "New bookings are disabled until current court rates load.";
      console.error("Unable to load court rates:", error);
      if (error.message.includes("session has expired")) showLogin(error.message);
    } finally {
      courtRatesLoading = false;
    }
  };

  const toDateTimeLocal = (timestamp) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
  };

  const renderPromoCodes = () => {
    promoCodeList.setAttribute("aria-busy", "false");
    if (!promoCodes.length) {
      const empty = document.createElement("p");
      empty.textContent = "No promo codes yet. Add one above to let customers apply a discount.";
      promoCodeList.replaceChildren(empty);
      return;
    }

    promoCodeList.replaceChildren(...promoCodes.map((promo) => {
      const row = document.createElement("form");
      row.className = "admin-promo-row";
      row.dataset.code = promo.code;

      const codeLabel = document.createElement("label");
      codeLabel.textContent = "Promo code";
      const codeInput = document.createElement("input");
      codeInput.type = "text";
      codeInput.value = promo.code;
      codeInput.readOnly = true;
      codeLabel.append(codeInput);

      const typeLabel = document.createElement("label");
      typeLabel.textContent = "Discount type";
      const typeInput = document.createElement("select");
      typeInput.name = "discount_type";
      typeInput.required = true;
      typeInput.add(new Option("Percentage", "percentage"));
      typeInput.add(new Option("Fixed amount", "fixed"));
      typeInput.value = promo.discount_type;
      typeLabel.append(typeInput);

      const valueLabel = document.createElement("label");
      valueLabel.textContent = promo.discount_type === "percentage" ? "Discount value (%)" : "Discount amount (₱)";
      const valueInput = document.createElement("input");
      valueInput.name = "discount_value";
      valueInput.type = "number";
      valueInput.min = "1";
      valueInput.max = promo.discount_type === "percentage" ? "99" : "100000";
      valueInput.step = "1";
      valueInput.value = String(promo.discount_value);
      valueInput.required = true;
      valueInput.inputMode = "numeric";
      valueLabel.append(valueInput);
      typeInput.addEventListener("change", () => {
        const isPercentage = typeInput.value === "percentage";
        valueLabel.firstChild.textContent = isPercentage ? "Discount value (%)" : "Discount amount (₱)";
        valueInput.max = isPercentage ? "99" : "100000";
        if (isPercentage && Number(valueInput.value) > 99) valueInput.value = "99";
      });

      const expiryLabel = document.createElement("label");
      expiryLabel.textContent = "Expires at · PHT";
      const expiryInput = document.createElement("input");
      expiryInput.name = "expires_at";
      expiryInput.type = "datetime-local";
      expiryInput.value = toDateTimeLocal(promo.expires_at);
      expiryLabel.append(expiryInput);

      const limitLabel = document.createElement("label");
      limitLabel.textContent = "Max redemptions";
      const limitInput = document.createElement("input");
      limitInput.name = "max_redemptions";
      limitInput.type = "number";
      limitInput.min = "1";
      limitInput.max = "1000000";
      limitInput.step = "1";
      limitInput.inputMode = "numeric";
      limitInput.value = promo.max_redemptions === null ? "" : String(promo.max_redemptions);
      limitLabel.append(limitInput);

      const activeLabel = document.createElement("label");
      activeLabel.className = "admin-promo-active";
      const activeInput = document.createElement("input");
      activeInput.name = "active";
      activeInput.type = "checkbox";
      activeInput.checked = promo.active;
      activeLabel.append(activeInput, document.createTextNode("Active"));

      const actions = document.createElement("div");
      actions.className = "admin-rate-actions";
      const save = document.createElement("button");
      save.className = "button button-dark";
      save.type = "submit";
      save.textContent = "Save changes";
      const remove = document.createElement("button");
      remove.className = "button admin-rate-delete admin-promo-delete";
      remove.type = "button";
      remove.textContent = "Delete";
      remove.setAttribute("aria-label", `Delete promo code ${promo.code}`);
      actions.append(save, remove);

      const status = document.createElement("span");
      status.className = "admin-rate-status";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      const usage = document.createElement("span");
      usage.className = "admin-promo-usage";
      usage.textContent = promo.max_redemptions === null
        ? `${promo.used_count} successful redemption${promo.used_count === 1 ? "" : "s"} · no limit`
        : `${promo.used_count} of ${promo.max_redemptions} redemptions used`;
      row.append(codeLabel, typeLabel, valueLabel, expiryLabel, limitLabel, activeLabel, actions, usage, status);
      return row;
    }));
  };

  const loadPromoCodes = async () => {
    if (promoCodesLoading) return;
    promoCodesLoading = true;
    promoCodesFeedback.classList.remove("is-error");
    promoCodesFeedback.textContent = "Loading promo codes…";
    promoCodeList.setAttribute("aria-busy", "true");
    try {
      promoCodes = await database.listPromoCodes();
      renderPromoCodes();
      promoCodesFeedback.textContent = `${promoCodes.length} promo code${promoCodes.length === 1 ? "" : "s"} available to manage.`;
    } catch (error) {
      promoCodes = [];
      const message = document.createElement("p");
      message.textContent = `Promo codes could not be loaded. Run the latest supabase/schema.sql and try again. ${error.message}`;
      promoCodeList.replaceChildren(message);
      promoCodeList.setAttribute("aria-busy", "false");
      promoCodesFeedback.classList.add("is-error");
      promoCodesFeedback.textContent = "Promo-code management is unavailable until the database schema is updated.";
      console.error("Unable to load promo codes:", error);
      if (error.message.includes("session has expired")) showLogin(error.message);
    } finally {
      promoCodesLoading = false;
    }
  };

