  const timeRange = (time) => {
    const matches = [...String(time || "").matchAll(/(\d{1,2}):(\d{2})\s*(AM|PM)/gi)];
    if (matches.length < 2) return null;
    const toMinutes = (match) => {
      const hour = Number(match[1]) % 12 + (match[3].toUpperCase() === "PM" ? 12 : 0);
      return hour * 60 + Number(match[2]);
    };
    return [toMinutes(matches[0]), toMinutes(matches[1])];
  };

  const blockTimeMinutes = (time) => {
    const match = String(time || "").match(/^([0-2]\d):([0-5]\d)/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour === 24 && minute === 0) return 1440;
    if (hour > 23) return null;
    return hour * 60 + minute;
  };

  const blockTimeRange = (dateBlock) => {
    const start = blockTimeMinutes(dateBlock.start_time);
    const end = blockTimeMinutes(dateBlock.end_time);
    return start === null || end === null || start >= end ? null : [start, end];
  };

  const formatBlockTime = (time) => {
    const minutes = blockTimeMinutes(time);
    if (minutes === null) return time;
    if (minutes === 1440) return "12:00 AM";
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
  };

  const formatBlockRange = (dateBlock) => (
    blockTimeMinutes(dateBlock.start_time) === 0 && blockTimeMinutes(dateBlock.end_time) === 1440
      ? "All day"
      : `${formatBlockTime(dateBlock.start_time)}–${formatBlockTime(dateBlock.end_time)}`
  );

  const formatBlockScope = (dateBlock) => (
    Array.isArray(dateBlock.courts) && dateBlock.courts.length
      ? dateBlock.courts.join(", ")
      : "Whole club"
  );

  const updateBlockoutSelectionSummary = () => {
    const selectedCount = calendarBlockoutCourtOptions.querySelectorAll('input[name="block_courts"]:checked').length;
    calendarBlockoutSelection.textContent = calendarBlockoutWholeClub.checked
      ? `Whole club selected · all ${courtRates.length} courts will be affected.`
      : selectedCount
        ? `${selectedCount} court${selectedCount === 1 ? "" : "s"} selected · other courts stay available.`
        : "Select at least one court. Other courts will stay available.";
  };

  const renderBlockoutCourtOptions = () => {
    const selectedCourts = new Set(
      [...calendarBlockoutCourtOptions.querySelectorAll('input[name="block_courts"]:checked')]
        .map((input) => input.value)
    );
    calendarBlockoutCourtOptions.replaceChildren(...courtRates.map(({ court }) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "block_courts";
      input.value = court;
      input.checked = selectedCourts.has(court);
      input.disabled = calendarBlockoutWholeClub.checked;
      label.append(input, document.createTextNode(court));
      return label;
    }));
    calendarBlockoutCourtOptions.setAttribute("aria-disabled", String(calendarBlockoutWholeClub.checked));
    updateBlockoutSelectionSummary();
  };

  const blockOverlapsRange = (dateBlock, range) => {
    const blockRange = blockTimeRange(dateBlock);
    return blockRange && range[0] < blockRange[1] && blockRange[0] < range[1];
  };

  const hasBookingConflict = (newBooking, existingBookings) => {
    const newRange = timeRange(newBooking.time);
    const newCourts = Array.isArray(newBooking.courts) ? newBooking.courts : [newBooking.court];
    if (!newRange) throw new Error("Could not read the selected time. Please choose a time slot again.");
    return existingBookings.some((booking) => {
      if (booking.status === "cancelled" || booking.date !== newBooking.date || !newCourts.includes(booking.court)) return false;
      const existingRange = timeRange(booking.time);
      return existingRange && newRange[0] < existingRange[1] && existingRange[0] < newRange[1];
    });
  };

  const formatCalendarDateKey = (date) => (
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
  );

  const nextCalendarDateKey = (dateKey) => {
    const [year, month, day] = dateKey.split("-").map(Number);
    return formatCalendarDateKey(new Date(year, month - 1, day + 1));
  };

  const loadCalendarBlocks = async ({ force = false, silent = false } = {}) => {
    if (!calendarMonth) {
      const currentDate = new Date(`${calendarSelectedDate || localDateValue()}T00:00:00`);
      calendarMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    }

    const startDate = formatCalendarDateKey(calendarMonth);
    const endDate = formatCalendarDateKey(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1));
    const requestKey = `${startDate}|${endDate}`;
    if (!force && calendarBlocksLoadedKey === requestKey) return;
    if (!force && calendarBlocksLoading && calendarBlocksRequestKey === requestKey) return;

    const requestId = ++calendarBlocksRequestId;
    calendarBlocksRequestKey = requestKey;
    calendarBlocksLoading = true;
    calendarBlocksError = null;
    if (calendarBlocksLoadedKey !== requestKey) calendarBlocksByDate = new Map();
    if (!silent) calendarBlockoutFeedback.textContent = "Loading maintenance and closure times…";
    renderAdminCalendar();

    try {
      const dateBlocks = await database.listBookingDateBlocks(startDate, endDate);
      if (requestId !== calendarBlocksRequestId) return;
      calendarBlocksByDate = dateBlocks.reduce((blocksByDate, dateBlock) => {
        const dateBlocksForDay = blocksByDate.get(dateBlock.blocked_date) || [];
        dateBlocksForDay.push(dateBlock);
        blocksByDate.set(dateBlock.blocked_date, dateBlocksForDay);
        return blocksByDate;
      }, new Map());
      calendarBlocksLoadedKey = requestKey;
      if (calendarBlockoutFeedback.classList.contains("is-error")) {
        calendarBlockoutFeedback.classList.remove("is-error");
        calendarBlockoutFeedback.textContent = "";
      }
      if (!silent) calendarBlockoutFeedback.textContent = "";
    } catch (error) {
      if (requestId !== calendarBlocksRequestId) return;
      calendarBlocksError = error;
      calendarBlockoutFeedback.textContent = `Closed dates could not be loaded. Run the latest supabase/schema.sql. ${error.message}`;
      calendarBlockoutFeedback.classList.add("is-error");
      console.error("Unable to load calendar date blocks:", error);
    } finally {
      if (requestId === calendarBlocksRequestId) {
        calendarBlocksLoading = false;
        renderAdminCalendar();
      }
    }
  };

  const renderCalendarBookings = (selectedDateBookings, courtsForSchedule) => {
    calendarDayBookings.replaceChildren();
    const dateBlocks = calendarBlocksByDate.get(calendarSelectedDate) || [];
    if (!hasLoadedBookings) {
      const empty = document.createElement("p");
      empty.className = "admin-calendar-empty";
      empty.classList.toggle("is-error", !loading);
      empty.textContent = loading
        ? "Loading booking data…"
        : "Booking data is unavailable. Open Bookings to refresh.";
      calendarDayBookings.append(empty);
      return { bookedSlots: 0, reviewSlots: 0, totalSlots: 0 };
    }
    if (!courtsForSchedule.length) {
      const empty = document.createElement("p");
      empty.className = "admin-calendar-empty";
      empty.textContent = "No courts available to show.";
      calendarDayBookings.append(empty);
      return { bookedSlots: 0, reviewSlots: 0, totalSlots: 0 };
    }

    const openingHour = 7;
    const closingHour = 22;
    let bookedSlots = 0;
    let blockedSlots = 0;
    let reviewSlots = 0;
    courtsForSchedule.forEach((courtName) => {
      const courtBookings = selectedDateBookings.filter((booking) => booking.court === courtName);
      const courtGroup = document.createElement("section");
      courtGroup.className = "admin-calendar-court";
      courtGroup.setAttribute("aria-label", `${courtName} hourly availability`);
      const courtHeading = document.createElement("div");
      courtHeading.className = "admin-calendar-court-heading";
      const courtTitle = document.createElement("h3");
      courtTitle.textContent = courtName;
      const courtBookingsCount = document.createElement("span");
      courtBookingsCount.className = "admin-calendar-court-summary";
      const courtSlots = document.createElement("div");
      courtSlots.className = "admin-calendar-court-slots";
      let courtBookedSlots = 0;
      let courtBlockedSlots = 0;
      let courtReviewSlots = 0;

      for (let hour = openingHour; hour < closingHour; hour += 1) {
        const slotStart = hour * 60;
        const slotEnd = (hour + 1) * 60;
        const overlappingBookings = courtBookings.filter((booking) => {
          const range = timeRange(booking.time);
          return range && slotStart < range[1] && range[0] < slotEnd;
        });
        const overlappingBlock = dateBlocks.find((dateBlock) => (
          (!Array.isArray(dateBlock.courts) || dateBlock.courts.includes(courtName))
          && blockOverlapsRange(dateBlock, [slotStart, slotEnd])
        ));
        const requiresReview = courtBookings.some((booking) => !timeRange(booking.time));
        const slot = document.createElement("div");
        slot.className = "admin-calendar-slot";
        const slotTime = document.createElement("time");
        slotTime.className = "admin-calendar-slot-time";
        slotTime.textContent = `${formatBookingHour(hour)} – ${formatBookingHour(hour + 1)}`;
        const slotDetails = document.createElement("span");
        slotDetails.className = "admin-calendar-slot-details";
        const slotStatus = document.createElement("span");
        slotStatus.className = "admin-calendar-slot-status";
        if (overlappingBlock) {
          courtBlockedSlots += 1;
          blockedSlots += 1;
          slot.classList.add("is-blocked");
          slotStatus.textContent = overlappingBlock.block_type === "maintenance" ? "Maintenance" : "Closed";
          slotDetails.textContent = `${overlappingBlock.reason} · ${formatBlockRange(overlappingBlock)}`;
        } else if (overlappingBookings.length) {
          courtBookedSlots += 1;
          bookedSlots += 1;
          const booking = overlappingBookings[0];
          slot.classList.add("is-booked");
          slot.classList.add(booking.status === "pending" ? "is-pending" : "is-confirmed");
          slotStatus.textContent = "Booked";
          const bookingStatus = booking.status === "pending" ? "Pending" : "Confirmed";
          slotDetails.textContent = `${booking.time} · ${booking.name || "Player"} · ${bookingStatus}`;
        } else if (requiresReview) {
          courtReviewSlots += 1;
          reviewSlots += 1;
          slot.classList.add("needs-review");
          slotStatus.textContent = "Check booking";
          slotDetails.textContent = "Booking time could not be verified";
        } else {
          slot.classList.add("is-available");
          slotStatus.textContent = "Available";
          slotDetails.textContent = "";
        }
        slot.append(slotTime, slotDetails, slotStatus);
        courtSlots.append(slot);
      }

      courtBookingsCount.textContent = `${courtBookedSlots} hrs booked · ${courtBlockedSlots} hrs blocked · ${closingHour - openingHour - courtBookedSlots - courtBlockedSlots - courtReviewSlots} available`;
      courtHeading.append(courtTitle, courtBookingsCount);
      courtGroup.append(courtHeading, courtSlots);
      calendarDayBookings.append(courtGroup);
    });
    return {
      bookedSlots,
      blockedSlots,
      reviewSlots,
      totalSlots: courtsForSchedule.length * (closingHour - openingHour),
    };
  };

  const renderCalendarDateBlocks = () => {
    const dateBlocks = calendarBlocksByDate.get(calendarSelectedDate) || [];
    if (calendarBlocksError) {
      const message = document.createElement("p");
      message.className = "admin-calendar-empty is-error";
      message.textContent = "Blocked times could not be loaded. Refresh the calendar to try again.";
      calendarBlockList.replaceChildren(message);
      return;
    }
    if (!dateBlocks.length) {
      const message = document.createElement("p");
      message.className = "admin-calendar-empty";
      message.textContent = "No maintenance or closure windows for this date.";
      calendarBlockList.replaceChildren(message);
      return;
    }

    calendarBlockList.replaceChildren(...dateBlocks.map((dateBlock) => {
      const item = document.createElement("div");
      item.className = "admin-calendar-block-item";
      const details = document.createElement("div");
      details.className = "admin-calendar-block-details";
      const blockType = dateBlock.block_type === "maintenance" ? "Maintenance" : "Club closed";
      const metadata = document.createElement("div");
      metadata.className = "admin-calendar-block-metadata";
      const type = document.createElement("span");
      type.className = `admin-calendar-block-type${dateBlock.block_type === "closed" ? " is-closed" : ""}`;
      type.textContent = blockType;
      const scope = document.createElement("span");
      scope.className = "admin-calendar-block-scope";
      scope.textContent = formatBlockScope(dateBlock);
      const reason = document.createElement("strong");
      reason.className = "admin-calendar-block-reason";
      reason.textContent = dateBlock.reason;
      const range = document.createElement("span");
      range.className = "admin-calendar-block-range";
      range.textContent = formatBlockRange(dateBlock);
      metadata.append(type, scope);
      details.replaceChildren(metadata, reason, range);
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.dataset.blockId = dateBlock.id;
      removeButton.textContent = "Remove";
      removeButton.setAttribute("aria-label", `Remove ${blockType.toLowerCase()} ${formatBlockRange(dateBlock)}: ${dateBlock.reason}`);
      item.append(details, removeButton);
      return item;
    }));
  };

  const openCalendarDate = (dateKey) => {
    calendarSelectedDate = dateKey;
    calendarBlockoutDate.value = dateKey;
    calendarBlockoutFeedback.classList.remove("is-error");
    calendarBlockoutFeedback.textContent = "";
    calendarMonth = new Date(
      Number(dateKey.slice(0, 4)),
      Number(dateKey.slice(5, 7)) - 1,
      1,
    );
    renderAdminCalendar();
    loadCalendarBlocks({ silent: true });
    if (!calendarDayDialog.open) calendarDayDialog.showModal();
  };

  const renderAdminCalendar = () => {
    if (!calendarSelectedDate) calendarSelectedDate = localDateValue();
    if (!calendarBlockoutDate.value) calendarBlockoutDate.value = calendarSelectedDate;
    const selectedDate = new Date(`${calendarSelectedDate}T00:00:00`);
    if (Number.isNaN(selectedDate.getTime())) {
      calendarSelectedDate = localDateValue();
    }
    if (!calendarMonth) {
      const initialDate = new Date(`${calendarSelectedDate}T00:00:00`);
      calendarMonth = new Date(initialDate.getFullYear(), initialDate.getMonth(), 1);
    }

    const courts = [...new Set([
      ...courtRates.map((rate) => rate.court),
      ...bookings.map((booking) => booking.court),
    ].filter(Boolean))]
      .sort((first, second) => first.localeCompare(second));
    const previousCourt = calendarCourtFilter.value;
    calendarCourtFilter.replaceChildren(new Option("All courts", ""));
    courts.forEach((court) => calendarCourtFilter.add(new Option(court, court)));
    calendarCourtFilter.value = courts.includes(previousCourt) ? previousCourt : "";

    const selectedCourt = calendarCourtFilter.value;
    const activeBookings = bookings.filter((booking) => (
      (booking.status === "pending" || booking.status === "confirmed")
      && /^\d{4}-\d{2}-\d{2}$/.test(booking.date || "")
      && (!selectedCourt || booking.court === selectedCourt)
    ));
    const bookingsByDate = new Map();
    activeBookings.forEach((booking) => {
      const dateBookings = bookingsByDate.get(booking.date) || [];
      dateBookings.push(booking);
      bookingsByDate.set(booking.date, dateBookings);
    });

    const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const monthEnd = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
    calendarMonthTitle.textContent = new Intl.DateTimeFormat("en", {
      month: "long",
      year: "numeric",
    }).format(monthStart);
    const monthBookings = activeBookings.filter((booking) => {
      const date = new Date(`${booking.date}T00:00:00`);
      return date.getFullYear() === monthStart.getFullYear()
        && date.getMonth() === monthStart.getMonth();
    });
    const monthBlockCount = [...calendarBlocksByDate.keys()].filter((dateKey) => {
      const date = new Date(`${dateKey}T00:00:00`);
      return date.getFullYear() === monthStart.getFullYear()
        && date.getMonth() === monthStart.getMonth();
    }).length;
    calendarMonthSummary.textContent = calendarBlocksError
      ? "Blocked-time list unavailable"
      : hasLoadedBookings
        ? `${monthBookings.length} active booking${monthBookings.length === 1 ? "" : "s"} · ${monthBlockCount} date${monthBlockCount === 1 ? "" : "s"} with blocks`
        : loading ? "Loading bookings…" : "Booking data unavailable";

    const selectedDateLabel = new Intl.DateTimeFormat("en", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${calendarSelectedDate}T00:00:00`));
    calendarDayTitle.textContent = selectedDateLabel;
    const selectedDateBookings = bookingsByDate.get(calendarSelectedDate) || [];
    const selectedDateBlocks = calendarBlocksByDate.get(calendarSelectedDate) || [];
    renderCalendarDateBlocks();
    const courtsForSchedule = calendarCourtFilter.value
      ? courts.filter((court) => court === calendarCourtFilter.value)
      : courts;
    const scheduleSummary = renderCalendarBookings(selectedDateBookings, courtsForSchedule);
    calendarDaySummary.textContent = selectedDateBlocks.length
      ? `${selectedDateBlocks.length} maintenance or closure window${selectedDateBlocks.length === 1 ? "" : "s"} · ${scheduleSummary.blockedSlots} booking hours blocked`
      : calendarBlocksError ? "Closed-date status unavailable"
        : hasLoadedBookings
          ? `${scheduleSummary.bookedSlots} hrs booked · ${scheduleSummary.totalSlots - scheduleSummary.bookedSlots - scheduleSummary.blockedSlots - scheduleSummary.reviewSlots} hrs available`
          : loading ? "Loading…" : "Unavailable";

    const gridStart = new Date(monthStart);
    gridStart.setDate(monthStart.getDate() - monthStart.getDay());
    const visibleDays = Math.ceil((monthEnd.getDate() + monthStart.getDay()) / 7) * 7;
    const today = localDateValue();
    const dateFormatter = new Intl.DateTimeFormat("en", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const dateButtons = [];
    for (let index = 0; index < visibleDays; index += 1) {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      const dateKey = formatCalendarDateKey(date);
      const dateBookings = bookingsByDate.get(dateKey) || [];
      const dateBlocks = calendarBlocksByDate.get(dateKey) || [];
      const dateBlockReasons = [...new Set(dateBlocks.map((dateBlock) => dateBlock.reason))];
      const allDayBlock = dateBlocks.some((dateBlock) => (
        blockTimeMinutes(dateBlock.start_time) === 0 && blockTimeMinutes(dateBlock.end_time) === 1440
      ));
      const dayButton = document.createElement("button");
      dayButton.className = "admin-calendar-day";
      dayButton.disabled = false;
      dayButton.addEventListener("click", () => openCalendarDate(dateKey));
      if (dateBlocks.length) dayButton.classList.add("is-blocked");
      else if (dateBookings.length) dayButton.classList.add("has-bookings");
      else if (hasLoadedBookings) dayButton.classList.add("is-available");
      dayButton.type = "button";
      dayButton.dataset.date = dateKey;
      dayButton.setAttribute("aria-pressed", String(dateKey === calendarSelectedDate));
      dayButton.classList.toggle("is-outside-month", date.getMonth() !== monthStart.getMonth());
      dayButton.classList.toggle("is-today", dateKey === today);
      if (dateBlocks.length) {
        dayButton.title = dateBlocks
          .map((dateBlock) => `${dateBlock.reason} · ${formatBlockScope(dateBlock)} · ${formatBlockRange(dateBlock)}`)
          .join("; ");
      }
      const statusCounts = dateBookings.reduce((counts, booking) => {
        counts[booking.status] += 1;
        return counts;
      }, { pending: 0, confirmed: 0 });
      const bookingDescription = dateBlocks.length
        ? allDayBlock
          ? `Blocked all day: ${dateBlocks.map((dateBlock) => `${dateBlock.reason} for ${formatBlockScope(dateBlock)}`).join(", ")}`
          : `${dateBlocks.length} maintenance or closure window${dateBlocks.length === 1 ? "" : "s"}: ${dateBlocks.map((dateBlock) => `${dateBlock.reason} for ${formatBlockScope(dateBlock)}`).join(", ")}`
        : dateBookings.length
        ? `${dateBookings.length} booking${dateBookings.length === 1 ? "" : "s"}: ${statusCounts.confirmed} confirmed, ${statusCounts.pending} pending`
        : hasLoadedBookings ? "No bookings. Available" : "Booking status unavailable";
      dayButton.setAttribute("aria-label", `${dateFormatter.format(date)}. ${bookingDescription}. Tap to see hourly availability.`);
      const dayNumber = document.createElement("span");
      dayNumber.className = "admin-calendar-day-number";
      dayNumber.textContent = String(date.getDate());
      const dayCount = document.createElement("span");
      dayCount.className = `admin-calendar-day-count${dateBlocks.length ? " is-blocked" : ""}`;
      dayCount.setAttribute("aria-hidden", "true");
      dayCount.dataset.count = String(dateBookings.length);
      dayCount.textContent = dateBlocks.length
        ? dateBlockReasons.length === 1
          ? dateBlockReasons[0]
          : `${dateBlockReasons[0]} +${dateBlockReasons.length - 1}`
        : dateBookings.length
        ? `${dateBookings.length} ${dateBookings.length === 1 ? "booking" : "bookings"}`
        : hasLoadedBookings ? "Available" : "";
      dayButton.append(dayNumber, dayCount);
      dateButtons.push(dayButton);
    }
    calendarGrid.replaceChildren(...dateButtons);
  };

