  const updateSyncStatus = (message, isError = false) => {
    syncStatus.textContent = message;
    syncStatus.classList.toggle("is-error", isError);
  };

  const updateBookingNotification = () => {
    const unreadPending = bookings.filter((booking) => (
      booking.status === "pending" && !seenBookingIds.has(booking.id)
    ));
    const unreadCancellations = bookings.filter((booking) => (
      booking.status === "cancelled" && !seenCancellationIds.has(booking.id)
    ));
    const unreadTotal = unreadPending.length + unreadCancellations.length;
    bookingNotification.textContent = String(unreadTotal);
    bookingNotification.hidden = unreadTotal === 0;
    const notificationLabel = [
      unreadPending.length ? `${unreadPending.length} new booking ${unreadPending.length === 1 ? "request" : "requests"}` : "",
      unreadCancellations.length ? `${unreadCancellations.length} new cancellation${unreadCancellations.length === 1 ? "" : "s"}` : "",
    ].filter(Boolean).join(" and ");
    bookingNotification.setAttribute(
      "aria-label",
      notificationLabel || "No new booking requests or cancellations",
    );
    sidebarLinks.find((link) => link.getAttribute("href") === "#bookings")
      ?.setAttribute("aria-label", unreadTotal
        ? `Bookings, ${notificationLabel}`
        : "Bookings");
  };

  const markPendingBookingsAsSeen = () => {
    let hasNewlySeenBookings = false;
    let hasNewlySeenCancellations = false;
    bookings.forEach((booking) => {
      if (booking.status === "pending" && typeof booking.id === "string" && !seenBookingIds.has(booking.id)) {
        seenBookingIds.add(booking.id);
        hasNewlySeenBookings = true;
      }
      if (booking.status === "cancelled" && typeof booking.id === "string" && !seenCancellationIds.has(booking.id)) {
        seenCancellationIds.add(booking.id);
        hasNewlySeenCancellations = true;
      }
    });
    if (!hasNewlySeenBookings && !hasNewlySeenCancellations) return;
    if (hasNewlySeenBookings) {
      try {
        localStorage.setItem(seenBookingsStorageKey, JSON.stringify([...seenBookingIds]));
      } catch (error) {
        updateSyncStatus("Notifications may reappear after reload", true);
        console.error("Unable to save seen booking notifications:", error);
      }
    }
    if (hasNewlySeenCancellations) {
      try {
        localStorage.setItem(seenCancellationsStorageKey, JSON.stringify([...seenCancellationIds]));
      } catch (error) {
        updateSyncStatus("Cancellation alerts may reappear after reload", true);
        console.error("Unable to save seen cancellation notifications:", error);
      }
    }
    updateBookingNotification();
  };

  const startPolling = () => {
    window.clearInterval(pollingTimer);
    pollingTimer = window.setInterval(() => {
      if (!document.hidden) {
        loadBookings({ silent: true });
        if (!calendarSection.hidden) loadCalendarBlocks({ force: true, silent: true });
      }
    }, 5000);
    updateSyncStatus("Live · checking every 5 sec");
  };

  const stopPolling = () => {
    window.clearInterval(pollingTimer);
    updateSyncStatus("Waiting for staff sign-in");
  };

  const setFeedback = (message) => {
    feedback.textContent = message;
  };

  const updateCourtRatesSummary = () => {
    courtRatesFeedback.textContent = `${courtRates.length} court${courtRates.length === 1 ? "" : "s"} available. Renaming updates existing bookings without changing their totals.`;
  };

  const renderPerformanceChart = ({ animate = false } = {}) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const period = performancePeriod.value;
    const getDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const getMonthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    let buckets;
    let periodLabel;

    if (period === "yearly") {
      buckets = Array.from({ length: 12 }, (_, index) => {
        const date = new Date(today.getFullYear(), today.getMonth() - 11 + index, 1);
        return { date, key: getMonthKey(date), count: 0 };
      });
      periodLabel = "last 12 months";
    } else {
      const dayCount = period === "monthly" ? 30 : 7;
      buckets = Array.from({ length: dayCount }, (_, index) => {
        const date = new Date(today);
        date.setDate(today.getDate() - dayCount + 1 + index);
        return { date, key: getDateKey(date), count: 0 };
      });
      periodLabel = period === "monthly" ? "last 30 days" : "last 7 days";
    }

    const countsByKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
    bookings.forEach((booking) => {
      if (!booking.created_at) return;
      const createdAt = new Date(booking.created_at);
      if (Number.isNaN(createdAt.getTime())) return;
      const key = period === "yearly" ? getMonthKey(createdAt) : getDateKey(createdAt);
      const bucket = countsByKey.get(key);
      if (bucket) bucket.count += 1;
    });

    const maximum = Math.max(1, ...buckets.map((bucket) => bucket.count));
    performanceChart.dataset.period = period;
    performanceChart.style.setProperty("--chart-columns", String(buckets.length));
    const dateFormat = period === "yearly" ? { month: "long", year: "numeric" } : { dateStyle: "long" };
    const chartDescription = buckets.map(({ date, count }) => (
      `${new Intl.DateTimeFormat("en", dateFormat).format(date)}: ${count} booking${count === 1 ? "" : "s"}`
    )).join(", ");
    const totalBookings = buckets.reduce((total, bucket) => total + bucket.count, 0);
    document.querySelector("#performance-chart-summary").textContent = totalBookings
      ? `${totalBookings} booking request${totalBookings === 1 ? "" : "s"} created in the ${periodLabel}. Each bar is one date; its exact count is shown above.`
      : `No booking requests were created in the ${periodLabel}. Each bar is one date; its count is shown above.`;
    performanceChart.setAttribute("aria-label", `Booking activity for the ${periodLabel}: ${chartDescription}`);
    performanceChart.replaceChildren(...buckets.map(({ date, count }, index) => {
      const column = document.createElement("div");
      column.className = "admin-chart-column";
      const value = document.createElement("span");
      value.className = "admin-chart-value";
      value.textContent = String(count);
      value.setAttribute("aria-hidden", "true");
      const track = document.createElement("div");
      track.className = "admin-chart-track";
      const bar = document.createElement("div");
      bar.className = "admin-chart-bar";
      bar.style.height = `${count ? Math.max(8, (count / maximum) * 100) : 0}%`;
      if (animate && count) {
        bar.classList.add("is-animating");
        bar.style.setProperty("--bar-delay", `${Math.min(index * 12, 240)}ms`);
      }
      track.append(bar);
      const label = document.createElement("span");
      label.className = "admin-chart-label";
      label.textContent = period === "yearly"
        ? new Intl.DateTimeFormat("en", { month: "short" }).format(date)
        : period === "monthly"
          ? String(date.getDate())
          : new Intl.DateTimeFormat("en", { weekday: "short" }).format(date);
      column.append(value, track, label);
      column.setAttribute("aria-label", `${new Intl.DateTimeFormat("en", dateFormat).format(date)}: ${count} booking${count === 1 ? "" : "s"}`);
      return column;
    }));
  };
  renderPerformanceChart();

  const renderRevenueAnalytics = () => {
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    const daysSinceMonday = (todayStart.getDay() + 6) % 7;
    weekStart.setDate(todayStart.getDate() - daysSinceMonday);
    const nextWeekStart = new Date(weekStart);
    nextWeekStart.setDate(weekStart.getDate() + 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const nextYearStart = new Date(now.getFullYear() + 1, 0, 1);
    const totals = { daily: 0, weekly: 0, monthly: 0, yearly: 0 };

    bookings.forEach((booking) => {
      if (booking.status !== "confirmed" || !booking.date) return;
      const amount = Number(booking.estimated_total);
      if (!Number.isFinite(amount)) return;
      const bookingDate = new Date(`${booking.date}T00:00:00`);
      if (Number.isNaN(bookingDate.getTime())) return;

      if (booking.date === todayKey) totals.daily += amount;
      if (bookingDate >= weekStart && bookingDate < nextWeekStart) totals.weekly += amount;
      if (bookingDate >= monthStart && bookingDate < nextMonthStart) totals.monthly += amount;
      if (bookingDate >= yearStart && bookingDate < nextYearStart) totals.yearly += amount;
    });

    const currencyFormatter = new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    });
    Object.entries(totals).forEach(([period, total]) => {
      document.querySelector(`#revenue-${period}`).textContent = currencyFormatter.format(total);
    });
  };

  const renderAdditionalMetrics = () => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(todayStart.getDate() - ((todayStart.getDay() + 6) % 7));
    const nextWeekStart = new Date(weekStart);
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const activeBookings = bookings.filter((booking) => booking.status !== "cancelled");
    const bookingDate = (booking) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(booking.date || "")) return null;
      const date = new Date(`${booking.date}T00:00:00`);
      return Number.isNaN(date.getTime()) ? null : date;
    };
    const inRange = (booking, start, end) => {
      const date = bookingDate(booking);
      return date && date >= start && date < end;
    };
    const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const todayKey = dateKey(todayStart);
    const dailyCount = activeBookings.filter((booking) => booking.date === todayKey).length;
    const weeklyCount = activeBookings.filter((booking) => inRange(booking, weekStart, nextWeekStart)).length;
    const monthlyBookings = activeBookings.filter((booking) => inRange(booking, monthStart, nextMonthStart));
    document.querySelector("#booking-count-daily").textContent = String(dailyCount);
    document.querySelector("#booking-count-weekly").textContent = String(weeklyCount);
    document.querySelector("#booking-count-monthly").textContent = String(monthlyBookings.length);

    const statusCounts = {
      pending: bookings.filter((booking) => booking.status === "pending").length,
      confirmed: bookings.filter((booking) => booking.status === "confirmed").length,
      cancelled: bookings.filter((booking) => booking.status === "cancelled").length,
    };
    const bookingTotal = bookings.length;
    document.querySelector("#booking-status-total").textContent = String(bookingTotal);

    const statusEntries = Object.entries(statusCounts);
    const circumference = 2 * Math.PI * 40;
    let offset = 0;
    const statusColors = {
      pending: "var(--status-pending)",
      confirmed: "var(--status-confirmed)",
      cancelled: "var(--status-cancelled)",
    };
    statusSegments.replaceChildren(...statusEntries
      .filter(([, count]) => count > 0 && bookingTotal > 0)
      .map(([status, count]) => {
        const segmentLength = (count / bookingTotal) * circumference;
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", "50");
        circle.setAttribute("cy", "50");
        circle.setAttribute("r", "40");
        circle.setAttribute("fill", "none");
        circle.setAttribute("stroke", statusColors[status]);
        circle.setAttribute("stroke-width", "12");
        circle.setAttribute("stroke-dasharray", `${Math.max(0, segmentLength - 2)} ${circumference}`);
        circle.setAttribute("stroke-dashoffset", String(-offset));
        circle.setAttribute("aria-hidden", "true");
        offset += segmentLength;
        return circle;
      }));
    statusChart.setAttribute("aria-label", `Booking status: ${statusEntries.map(([status, count]) => (
      `${status}: ${count} (${bookingTotal ? Math.round((count / bookingTotal) * 100) : 0}%)`
    )).join(", ")}`);
    statusBreakdown.replaceChildren(...statusEntries.map(([status, count]) => {
      const row = document.createElement("div");
      row.className = "admin-status-row";
      const marker = document.createElement("span");
      marker.className = `admin-status-dot is-${status}`;
      marker.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "admin-status-label";
      label.textContent = status[0].toUpperCase() + status.slice(1);
      const value = document.createElement("strong");
      value.id = `status-count-${status}`;
      value.textContent = String(count);
      const share = document.createElement("small");
      share.textContent = `${bookingTotal ? Math.round((count / bookingTotal) * 100) : 0}%`;
      row.append(marker, label, value, share);
      return row;
    }));

    const courts = courtRates.map(({ court }) => court);
    const courtCounts = courts.map((court) => ({
      court,
      count: monthlyBookings.filter((booking) => booking.court === court).length,
    }));
    const maxCourtCount = Math.max(1, ...courtCounts.map(({ count }) => count));
    const monthlyCourtBookingTotal = courtCounts.reduce((total, { count }) => total + count, 0);
    document.querySelector("#court-booking-summary").textContent =
      `${monthlyCourtBookingTotal} non-cancelled booking${monthlyCourtBookingTotal === 1 ? "" : "s"} this month · shared scale starts at 0`;
    const courtAxis = document.querySelector("#court-booking-axis");
    const courtAxisValues = maxCourtCount > 1
      ? [0, Math.floor(maxCourtCount / 2), maxCourtCount]
      : [0, maxCourtCount];
    courtAxis.replaceChildren(...courtAxisValues.map((value, index) => {
      const tick = document.createElement("span");
      tick.textContent = String(value);
      tick.className = index === 1 && courtAxisValues.length === 3
        ? "is-middle"
        : index === courtAxisValues.length - 1 ? "is-end" : "";
      return tick;
    }));
    const courtBreakdown = document.querySelector("#court-booking-breakdown");
    courtBreakdown.setAttribute("role", "list");
    courtBreakdown.setAttribute("aria-label", `Bookings per court this month: ${courtCounts.map(({ court, count }) => (
      `${court}: ${count}`
    )).join(", ")}`);
    courtBreakdown.replaceChildren(...courtCounts.map(({ court, count }) => {
      const row = document.createElement("div");
      row.className = "admin-court-row";
      row.setAttribute("role", "listitem");
      const name = document.createElement("span");
      name.className = "admin-court-name";
      name.textContent = court;
      const value = document.createElement("strong");
      value.textContent = String(count);
      const rowHeading = document.createElement("div");
      rowHeading.className = "admin-court-row-heading";
      rowHeading.append(name, value);
      const plot = document.createElement("div");
      plot.className = "admin-court-plot";
      plot.setAttribute("role", "img");
      plot.setAttribute("aria-label", `${name.textContent}: ${count} booking${count === 1 ? "" : "s"} this month on a scale from 0 to ${maxCourtCount}`);
      const point = document.createElement("span");
      point.className = "admin-court-point";
      point.style.left = `${(count / maxCourtCount) * 100}%`;
      plot.append(point);
      row.append(rowHeading, plot);
      return row;
    }));

    const occupiedHours = activeBookings
      .filter((booking) => inRange(booking, weekStart, nextWeekStart))
      .reduce((total, booking) => {
        const duration = Number(booking.duration);
        return total + (Number.isFinite(duration) && duration > 0 ? duration : 0);
      }, 0);
    const weeklyCourtCapacity = courts.length * 15 * 7;
    const occupancy = weeklyCourtCapacity ? (occupiedHours / weeklyCourtCapacity) * 100 : 0;
    document.querySelector("#occupancy-rate").textContent = `${occupancy.toFixed(1)}%`;
    document.querySelector("#occupancy-detail").textContent = `${occupiedHours} of ${weeklyCourtCapacity} court hours booked`;

    const totalValue = activeBookings.reduce((total, booking) => {
      const amount = Number(booking.estimated_total);
      return total + (Number.isFinite(amount) ? amount : 0);
    }, 0);
    const averageValue = activeBookings.length ? totalValue / activeBookings.length : 0;
    document.querySelector("#average-booking-value").textContent = new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(averageValue);
  };

  const renderRevenueChart = ({ animate = false } = {}) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const period = revenueChartPeriod.value;
    const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const yearKey = (date) => String(date.getFullYear());
    const getPeriodKey = (date) => {
      if (period === "yearly") return yearKey(date);
      if (period === "monthly") return monthKey(date);
      if (period === "weekly") {
        return dateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7)));
      }
      return dateKey(date);
    };
    const confirmedDates = bookings
      .filter((booking) => booking.status === "confirmed" && /^\d{4}-\d{2}-\d{2}$/.test(booking.date || ""))
      .map((booking) => new Date(`${booking.date}T00:00:00`))
      .filter((date) => !Number.isNaN(date.getTime()));
    const latestConfirmedDate = confirmedDates.reduce(
      (latest, date) => date > latest ? date : latest,
      today,
    );
    let buckets;
    let periodLabel;
    let formatLabel;

    if (period === "yearly") {
      const firstYear = today.getFullYear() - 4;
      const lastYear = Math.max(today.getFullYear(), latestConfirmedDate.getFullYear());
      buckets = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => {
        const date = new Date(firstYear + index, 0, 1);
        return { date, key: yearKey(date), total: 0, count: 0 };
      });
      periodLabel = `yearly totals from ${firstYear} through ${lastYear}`;
      formatLabel = { year: "numeric" };
    } else if (period === "monthly") {
      const firstMonth = new Date(today.getFullYear(), today.getMonth() - 11, 1);
      const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const latestBookingMonth = new Date(
        latestConfirmedDate.getFullYear(),
        latestConfirmedDate.getMonth(),
        1,
      );
      const lastMonth = latestBookingMonth > currentMonth ? latestBookingMonth : currentMonth;
      const monthCount = (lastMonth.getFullYear() - firstMonth.getFullYear()) * 12
        + lastMonth.getMonth() - firstMonth.getMonth() + 1;
      buckets = Array.from({ length: monthCount }, (_, index) => {
        const date = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + index, 1);
        return { date, key: monthKey(date), total: 0, count: 0 };
      });
      periodLabel = `monthly totals from ${new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(firstMonth)} through ${new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(lastMonth)}`;
      formatLabel = { month: "long", year: "numeric" };
    } else if (period === "weekly") {
      const currentWeek = new Date(today);
      currentWeek.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      const firstWeek = new Date(currentWeek);
      firstWeek.setDate(firstWeek.getDate() - 49);
      const lastWeek = new Date(latestConfirmedDate);
      lastWeek.setDate(lastWeek.getDate() - ((lastWeek.getDay() + 6) % 7));
      const weekCount = Math.floor((lastWeek - firstWeek) / (7 * 24 * 60 * 60 * 1000)) + 1;
      buckets = Array.from({ length: weekCount }, (_, index) => {
        const date = new Date(firstWeek);
        date.setDate(firstWeek.getDate() + (7 * index));
        return { date, key: dateKey(date), total: 0, count: 0 };
      });
      periodLabel = `weekly totals from ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(firstWeek)} onward`;
      formatLabel = { month: "short", day: "numeric" };
    } else {
      const firstDay = new Date(today);
      firstDay.setDate(today.getDate() - 6);
      const dayCount = Math.floor((latestConfirmedDate - firstDay) / (24 * 60 * 60 * 1000)) + 1;
      buckets = Array.from({ length: dayCount }, (_, index) => {
        const date = new Date(firstDay);
        date.setDate(firstDay.getDate() + index);
        return { date, key: dateKey(date), total: 0, count: 0 };
      });
      periodLabel = `daily totals from ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(firstDay)} onward`;
      formatLabel = { dateStyle: "long" };
    }

    const bucketByKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
    bookings.forEach((booking) => {
      if (booking.status !== "confirmed" || !booking.date) return;
      const bookedOn = new Date(`${booking.date}T00:00:00`);
      if (Number.isNaN(bookedOn.getTime())) return;
      const bucket = bucketByKey.get(getPeriodKey(bookedOn));
      const amount = Number(booking.estimated_total);
      if (bucket && Number.isFinite(amount)) {
        bucket.total += amount;
        bucket.count += 1;
      }
    });

    const rawMaximum = Math.max(0, ...buckets.map(({ total }) => total));
    const axisIntervalCount = 5;
    const rawTickStep = rawMaximum / axisIntervalCount;
    const tickPower = 10 ** Math.floor(Math.log10(rawTickStep || 1));
    const normalizedTickStep = rawTickStep / tickPower;
    const niceTickStep = [1, 2, 2.5, 5, 10].find((step) => step > normalizedTickStep) || 10;
    const axisTickStep = Math.max(1, niceTickStep * tickPower);
    const axisMaximum = rawMaximum ? axisTickStep * axisIntervalCount : 0;
    const confirmedBookingCount = buckets.reduce((total, bucket) => total + bucket.count, 0);
    const compactCurrencyFormatter = new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: rawMaximum < 10000 ? 1 : 0,
      notation: "compact",
    });
    const fullCurrencyFormatter = new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    });
    const periodTotal = buckets.reduce((total, bucket) => total + bucket.total, 0);
    const outOfRangeConfirmedCount = bookings.filter((booking) => {
      if (booking.status !== "confirmed" || !booking.date) return false;
      const bookedOn = new Date(`${booking.date}T00:00:00`);
      if (Number.isNaN(bookedOn.getTime())) return false;
      return !bucketByKey.has(getPeriodKey(bookedOn));
    }).length;
    document.querySelector("#revenue-chart-summary").textContent = confirmedBookingCount
      ? `${fullCurrencyFormatter.format(periodTotal)} from ${confirmedBookingCount} confirmed booking${confirmedBookingCount === 1 ? "" : "s"} (${periodLabel}).${outOfRangeConfirmedCount ? ` ${outOfRangeConfirmedCount} older confirmed booking${outOfRangeConfirmedCount === 1 ? " is" : "s are"} outside this range.` : ""}`
      : outOfRangeConfirmedCount
        ? `No confirmed bookings in the ${periodLabel}; ${outOfRangeConfirmedCount} older confirmed booking${outOfRangeConfirmedCount === 1 ? " is" : "s are"} outside this range.`
        : `No confirmed bookings in the ${periodLabel}. Only bookings marked Confirmed are included.`;
    revenueChart.dataset.period = period;
    const minimumChartWidth = period === "monthly" ? 700 : period === "weekly" ? 600 : 620;
    revenueChart.style.minWidth = `${Math.max(minimumChartWidth, buckets.length * 84)}px`;
    revenueChart.setAttribute("aria-label", `Estimated revenue from confirmed bookings, ${periodLabel}: ${buckets.map(({ date, total }) => (
      `${new Intl.DateTimeFormat("en", formatLabel).format(date)}: ${fullCurrencyFormatter.format(total)}`
    )).join(", ")}`);
    const svgNamespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNamespace, "svg");
    const viewWidth = Math.max(320, revenueChart.clientWidth);
    const viewHeight = 280;
    const plot = { left: 64, right: viewWidth - 16, top: 20, bottom: 228 };
    const pointX = (index) => plot.left + (index / Math.max(1, buckets.length - 1)) * (plot.right - plot.left);
    const pointY = (total) => axisMaximum
      ? plot.bottom - (total / axisMaximum) * (plot.bottom - plot.top)
      : plot.bottom;
    const points = buckets.map(({ total }, index) => `${pointX(index)},${pointY(total)}`);

    svg.setAttribute("viewBox", `0 0 ${viewWidth} ${viewHeight}`);
    svg.setAttribute("role", "presentation");
    svg.setAttribute("focusable", "false");
    const tickCount = axisMaximum ? axisIntervalCount : 0;
    for (let index = 0; index <= tickCount; index += 1) {
      const value = axisTickStep * index;
      const y = pointY(value);
      const gridline = document.createElementNS(svgNamespace, "line");
      gridline.setAttribute("x1", String(plot.left));
      gridline.setAttribute("x2", String(plot.right));
      gridline.setAttribute("y1", String(y));
      gridline.setAttribute("y2", String(y));
      gridline.setAttribute("class", "admin-revenue-gridline");
      svg.append(gridline);

      const tick = document.createElementNS(svgNamespace, "text");
      tick.setAttribute("x", String(plot.left - 12));
      tick.setAttribute("y", String(y + 4));
      tick.setAttribute("text-anchor", "end");
      tick.setAttribute("class", "admin-revenue-y-label");
      tick.textContent = compactCurrencyFormatter.format(value);
      svg.append(tick);
    }

    if (rawMaximum) {
      const area = document.createElementNS(svgNamespace, "path");
      area.setAttribute("d", `M ${points.join(" L ")} L ${plot.right} ${plot.bottom} L ${plot.left} ${plot.bottom} Z`);
      area.setAttribute("class", "admin-revenue-area");
      svg.append(area);
    }

    const line = document.createElementNS(svgNamespace, "polyline");
    line.setAttribute("points", points.join(" "));
    line.setAttribute("pathLength", "1");
    line.setAttribute("class", "admin-revenue-line");
    if (animate && confirmedBookingCount) line.classList.add("is-animating");
    svg.append(line);

    const visibleLabelCount = Math.min(7, buckets.length);
    const labelIndexes = new Set(Array.from({ length: visibleLabelCount }, (_, index) => (
      Math.round((index / Math.max(1, visibleLabelCount - 1)) * (buckets.length - 1))
    )));
    labelIndexes.forEach((index) => {
      const date = buckets[index].date;
      const tick = document.createElementNS(svgNamespace, "text");
      tick.setAttribute("x", String(pointX(index)));
      tick.setAttribute("y", "258");
      tick.setAttribute("text-anchor", index === 0 ? "start" : index === buckets.length - 1 ? "end" : "middle");
      tick.setAttribute("class", "admin-revenue-x-label");
      tick.textContent = period === "yearly"
        ? new Intl.DateTimeFormat("en", { year: "numeric" }).format(date)
        : period === "monthly"
          ? new Intl.DateTimeFormat("en", { month: "short" }).format(date)
          : period === "weekly"
            ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date)
            : new Intl.DateTimeFormat("en", { weekday: "short" }).format(date);
      svg.append(tick);
    });

    buckets.forEach(({ date, total, count }, index) => {
      if (!count) return;
      const point = document.createElementNS(svgNamespace, "circle");
      point.setAttribute("cx", String(pointX(index)));
      point.setAttribute("cy", String(pointY(total)));
      point.setAttribute("r", "4");
      point.setAttribute("class", "admin-revenue-point");
      point.setAttribute("aria-hidden", "true");
      const title = document.createElementNS(svgNamespace, "title");
      title.textContent = `${new Intl.DateTimeFormat("en", formatLabel).format(date)}: ${fullCurrencyFormatter.format(total)} from ${count} confirmed booking${count === 1 ? "" : "s"}`;
      point.append(title);
      svg.append(point);
    });
    revenueChart.replaceChildren(svg);
  };

  const renderOverviewAnalytics = () => {
    const animate = !hasAnimatedAnalyticsCharts && bookings.length > 0;
    renderRevenueAnalytics();
    renderAdditionalMetrics();
    renderPerformanceChart({ animate });
    renderRevenueChart({ animate });
    if (animate) hasAnimatedAnalyticsCharts = true;
  };

