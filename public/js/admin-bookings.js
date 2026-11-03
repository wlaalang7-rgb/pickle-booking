  const createCell = (className, text) => {
    const cell = document.createElement("td");
    if (className) cell.className = className;
    cell.textContent = text;
    return cell;
  };

  const renderBooking = (booking) => {
    const row = document.createElement("tr");
    const playerCell = document.createElement("td");
    playerCell.dataset.label = "Player";
    const playerName = document.createElement("strong");
    playerName.className = "booking-player";
    playerName.textContent = booking.name || "Unnamed player";
    playerCell.append(playerName);
    if (booking.email) {
      const email = document.createElement("span");
      email.className = "booking-phone";
      email.textContent = booking.email;
      playerCell.append(email);
    }
    if (booking.notes || booking.promo) {
      const extra = document.createElement("span");
      extra.className = "booking-extra";
      if (booking.notes) {
        const noteLabel = document.createElement("span");
        noteLabel.className = "booking-extra-label";
        noteLabel.textContent = "Note: ";
        const noteText = document.createElement("mark");
        noteText.className = "booking-note-text";
        noteText.textContent = booking.notes;
        extra.append(noteLabel, noteText);
      }
      if (booking.notes && booking.promo) {
        extra.append(document.createTextNode(" · "));
      }
      if (booking.promo) {
        const promoText = document.createElement("span");
        const discountAmount = Number(booking.discount_amount);
        promoText.textContent = discountAmount > 0
          ? `Promo: ${booking.promo} · Saved ₱${new Intl.NumberFormat("en-PH").format(discountAmount)}`
          : `Promo: ${booking.promo}`;
        extra.append(promoText);
      }
      playerCell.append(extra);
    }
    row.append(playerCell);

    const slotCell = document.createElement("td");
    slotCell.dataset.label = "Court and time";
    const court = document.createElement("strong");
    court.className = "booking-detail";
    court.textContent = booking.court || "Court not specified";
    const dateAndTime = document.createElement("span");
    dateAndTime.className = "booking-meta";
    const date = booking.date ? new Date(`${booking.date}T00:00:00`) : null;
    const formattedDate = date && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date)
      : "Date not specified";
    dateAndTime.textContent = `${formattedDate} · ${booking.time || "Time not specified"}`;
    slotCell.append(court, dateAndTime);
    row.append(slotCell);

    const playersCell = createCell("", `${booking.players || "-"} · ${booking.duration || "-"} hr`);
    playersCell.dataset.label = "Players";
    row.append(playersCell);
    const totalCell = createCell("", new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(booking.estimated_total || 0));
    totalCell.dataset.label = "Estimated total";
    row.append(totalCell);

    const statusCell = document.createElement("td");
    statusCell.dataset.label = "Status";
    const statusSelect = document.createElement("select");
    statusSelect.className = `booking-status status-${booking.status}`;
    statusSelect.setAttribute("aria-label", `Status for ${booking.name || "booking"}`);
    ["pending", "confirmed", "cancelled"].forEach((status) => {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = status[0].toUpperCase() + status.slice(1);
      option.selected = booking.status === status;
      statusSelect.append(option);
    });
    statusSelect.addEventListener("change", async () => {
      const nextStatus = statusSelect.value;
      statusSelect.disabled = true;
      setFeedback("Saving booking status…");
      try {
        const updatedBookings = await database.updateBookingStatus(booking, nextStatus);
        const updatedById = new Map(updatedBookings.map((updatedBooking) => [updatedBooking.id, updatedBooking]));
        bookings = bookings.map((currentBooking) => {
          const updatedBooking = updatedById.get(currentBooking.id);
          return updatedBooking ? { ...currentBooking, status: updatedBooking.status } : currentBooking;
        });
        renderOverviewAnalytics();
        renderBookings();
        const groupSize = booking.booking_group_id
          ? bookings.filter((currentBooking) => currentBooking.booking_group_id === booking.booking_group_id).length
          : 1;
        setFeedback(`Booking request for ${booking.name || "player"}${groupSize > 1 ? ` across ${groupSize} courts` : ""} marked ${nextStatus}.`);
      } catch (error) {
        if (error.message.includes("session has expired")) showLogin(error.message);
        else {
          renderBookings();
          const message = error.code === "23514" && /status/i.test(error.message)
            ? "The database does not allow this booking status yet. Run the latest supabase/schema.sql in the Supabase SQL Editor, then try again."
            : error.message;
          setFeedback(message);
        }
      }
    });
    statusCell.append(statusSelect);
    row.append(statusCell);

    const actionCell = document.createElement("td");
    const deleteButton = document.createElement("button");
    deleteButton.className = "booking-delete";
    deleteButton.type = "button";
    deleteButton.textContent = "×";
    deleteButton.setAttribute("aria-label", `Delete booking for ${booking.name || "player"}`);
    deleteButton.addEventListener("click", async () => {
      const groupSize = booking.booking_group_id
        ? bookings.filter((currentBooking) => currentBooking.booking_group_id === booking.booking_group_id).length
        : 1;
      const courtScope = groupSize > 1 ? ` for all ${groupSize} courts` : "";
      if (!window.confirm(`Delete the booking request${courtScope} for ${booking.name || "this player"}? This cannot be undone.`)) return;
      deleteButton.disabled = true;
      setFeedback("Deleting booking request…");
      try {
        await database.deleteBooking(booking);
        setFeedback(`Booking request${courtScope} deleted.`);
        await loadBookings();
      } catch (error) {
        setFeedback(error.message);
        if (error.message.includes("session has expired")) showLogin(error.message);
        else deleteButton.disabled = false;
      }
    });
    actionCell.append(deleteButton);
    row.append(actionCell);
    return row;
  };

  const renderBookings = () => {
    const pending = bookings.filter((booking) => booking.status === "pending").length;
    const confirmed = bookings.filter((booking) => booking.status === "confirmed").length;
    const cancelled = bookings.filter((booking) => booking.status === "cancelled").length;
    if (!bookingsSection.hidden) markPendingBookingsAsSeen();
    else updateBookingNotification();
    document.querySelector("#count-all").textContent = String(bookings.length);
    document.querySelector("#count-pending").textContent = String(pending);
    document.querySelector("#count-confirmed").textContent = String(confirmed);
    document.querySelector("#count-cancelled").textContent = String(cancelled);
    if (!overviewSection.hidden) renderOverviewAnalytics();
    renderAdminCalendar();

    const query = searchInput.value.trim().toLocaleLowerCase();
    const selectedDate = dateFilter.value;
    const courts = [...new Set(bookings.map((booking) => booking.court).filter(Boolean))]
      .sort((first, second) => first.localeCompare(second));
    const previousCourt = courtFilter.value;
    courtFilter.replaceChildren(new Option("All courts", ""));
    courts.forEach((court) => courtFilter.add(new Option(court, court)));
    courtFilter.value = courts.includes(previousCourt) ? previousCourt : "";
    const selectedCourt = courtFilter.value;

    const filtered = bookings
      .filter((booking) => activeFilter === "all" || booking.status === activeFilter)
      .filter((booking) => !selectedDate || booking.date === selectedDate)
      .filter((booking) => !selectedCourt || booking.court === selectedCourt)
      .filter((booking) => !query || [booking.name, booking.phone, booking.email, booking.court, booking.date, booking.time]
        .some((value) => String(value || "").toLocaleLowerCase().includes(query)));
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    activePage = Math.min(activePage, totalPages);
    const firstIndex = (activePage - 1) * pageSize;
    const pageBookings = filtered.slice(firstIndex, firstIndex + pageSize);
    bookingList.replaceChildren(...pageBookings.map(renderBooking));
    bookingEmpty.hidden = filtered.length !== 0;
    pagination.hidden = filtered.length === 0;
    paginationSummary.textContent = `Showing ${firstIndex + 1}–${Math.min(firstIndex + pageSize, filtered.length)} of ${filtered.length} requests`;
    pageNumber.textContent = `Page ${activePage} of ${totalPages}`;
    previousPageButton.disabled = activePage === 1;
    nextPageButton.disabled = activePage === totalPages;
    document.querySelector("#booking-empty-title").textContent = bookings.length
      ? "No matching bookings."
      : "No booking requests yet.";
    document.querySelector("#booking-empty-message").textContent = bookings.length
      ? "Try another search or adjust the date, court, or status filters."
      : "Booking requests submitted on the website will appear here, or create one from the staff dashboard.";
  };

  async function loadBookings({ silent = false } = {}) {
    if (loading) return;
    loading = true;
    refreshButton.disabled = true;
    if (!silent) setFeedback("Loading booking requests…");
    try {
      const updatedBookings = await database.listBookings();
      if (updatedBookings.some((booking) => booking.status === "paid")) {
        updateSyncStatus("Schema update required", true);
        setFeedback("The database still has Paid bookings. Run the latest supabase/schema.sql to convert them to Confirmed before continuing.");
        return;
      }
      const bookingsChanged = !hasLoadedBookings
        || JSON.stringify(updatedBookings) !== JSON.stringify(bookings);
      if (bookingsChanged) {
        bookings = updatedBookings;
      }
      hasLoadedBookings = true;
      if (bookingsChanged) {
        renderBookings();
        if (!promoCodesSection.hidden) await loadPromoCodes();
      }
      updateSyncStatus(`Live · updated ${new Intl.DateTimeFormat("en", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date())}`);
      setFeedback(bookings.length ? "" : "No booking requests yet.");
    } catch (error) {
      updateSyncStatus("Couldn't sync · retrying", true);
      if (!silent) setFeedback(error.message);
      if (error.message.includes("session has expired")) showLogin(error.message);
    } finally {
      loading = false;
      refreshButton.disabled = false;
      if (!hasLoadedBookings && !calendarSection.hidden) renderAdminCalendar();
    }
  }

  if (!database?.isConfigured()) {
    showLogin("Database setup required: add your Supabase project URL and anon key to public/js/supabase-config.js, then run supabase/schema.sql in the Supabase SQL Editor.");
    loginForm.querySelector("button[type='submit']").disabled = true;
  } else {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitButton = loginForm.querySelector("button[type='submit']");
      submitButton.disabled = true;
      loginFeedback.textContent = "Signing in…";
      try {
        await database.signIn(emailInput.value.trim(), passwordInput.value);
        const user = await database.getSession();
        if (!user) throw new Error("Sign-in could not be verified. Please try again.");
        setSignedIn();
        await Promise.all([loadBookings(), loadCourtRates(), loadPromoCodes()]);
      } catch (error) {
        loginFeedback.textContent = error.message;
        passwordInput.value = "";
        passwordInput.focus();
      } finally {
        submitButton.disabled = false;
      }
    });

    signOutButton.addEventListener("click", async () => {
      signOutButton.disabled = true;
      try {
        await database.signOut();
        showLogin("You have been signed out.");
      } catch (error) {
        showLogin(error.message);
      } finally {
        signOutButton.disabled = false;
      }
    });

    database.getSession()
      .then((user) => {
        if (!user) {
          showLogin();
          return;
        }
        setSignedIn();
        return Promise.all([loadBookings(), loadCourtRates(), loadPromoCodes()]);
      })
      .catch((error) => showLogin(error.message));
  }

  bookingDate.min = localDateValue();
