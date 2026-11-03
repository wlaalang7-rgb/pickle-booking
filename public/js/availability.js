const today = new Date();
const dateFormatter = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
const weekdayFormatter = new Intl.DateTimeFormat("en", { weekday: "short" });
const monthFormatter = new Intl.DateTimeFormat("en", { month: "short" });
const scheduleMonth = document.querySelector("#schedule-month");
const previousMonth = document.querySelector("#previous-month");
const nextMonth = document.querySelector("#next-month");
const availabilityDialog = document.querySelector("#availability-dialog");
const availabilityDialogTitle = document.querySelector("#availability-dialog-title");
const availabilityDetailSlots = document.querySelector("#availability-detail-slots");
const availabilityDialogClose = document.querySelector("#availability-dialog-close");
const calendarBookingsByDate = new Map();
const calendarDateBlocksByDate = new Map();
let calendarCourts = [];
let calendarLoadId = 0;
let calendarLoaded = false;
let calendarLoadError = null;
let selectedAvailabilityDate = null;

const weekdays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];


const formatBookingHour = (hour) => {
  const displayHour = hour % 12 || 12;
  const period = hour < 12 ? "AM" : "PM";
  return `${displayHour}:00 ${period}`;
};

let displayedMonth = new Date(today.getFullYear(), today.getMonth(), 1);

const showAvailability = (date, selectedButton) => {
  scheduleGrid.querySelectorAll(".calendar-date-button[aria-pressed='true']").forEach((button) => {
    button.setAttribute("aria-pressed", "false");
  });
  selectedButton.setAttribute("aria-pressed", "true");
  selectedAvailabilityDate = date;
  availabilityDialogTitle.textContent = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
  renderAvailabilityDetails(date);
  if (!availabilityDialog.open) availabilityDialog.showModal();
};

const renderAvailabilityDetails = (date) => {
  availabilityDetailSlots.replaceChildren();
  if (!calendarLoaded) {
    availabilityDetailSlots.setAttribute("role", calendarLoadError ? "alert" : "status");
    availabilityDetailSlots.setAttribute("aria-busy", String(!calendarLoadError));
    if (!calendarLoadError && window.PickleRallySkeleton) {
      const accessible = document.createElement("p");
      accessible.className = "skeleton-visually-hidden";
      accessible.textContent = "Loading hourly court availability";
      availabilityDetailSlots.append(accessible, window.PickleRallySkeleton.availabilityTable(calendarCourts.length || 4));
      return;
    }
    const message = document.createElement("p");
    message.className = `availability-load-message${calendarLoadError ? " is-error" : ""}`;
    message.setAttribute("role", calendarLoadError ? "alert" : "status");
    message.textContent = calendarLoadError
      ? `Could not load court reservations. ${calendarLoadError.message || String(calendarLoadError)}`
      : "Loading court reservations…";
    availabilityDetailSlots.append(message);
    return;
  }

  availabilityDetailSlots.setAttribute("role", "table");
  availabilityDetailSlots.setAttribute("aria-busy", "false");
  availabilityDetailSlots.style.setProperty("--court-count", String(calendarCourts.length));
  const bookings = calendarBookingsByDate.get(formatDateValue(date)) || [];
  const header = document.createElement("div");
  header.className = "availability-hour-row availability-hour-header";
  header.setAttribute("role", "row");
  ["TIME", ...calendarCourts].forEach((label) => {
    const cell = document.createElement("span");
    cell.className = "availability-hour-cell";
    cell.setAttribute("role", "columnheader");
    cell.textContent = label;
    header.append(cell);
  });
  availabilityDetailSlots.append(header);

  for (let hour = 0; hour < 24; hour += 1) {
    const row = document.createElement("div");
    row.className = "availability-hour-row";
    row.setAttribute("role", "row");
    const timeCell = document.createElement("span");
    timeCell.className = "availability-hour-cell availability-hour-time";
    timeCell.setAttribute("role", "rowheader");
    timeCell.textContent = `${formatCalendarHour(hour)} – ${formatCalendarHour(hour + 1)}`;
    row.append(timeCell);

    calendarCourts.forEach((courtName) => {
      const cell = document.createElement("span");
      cell.className = "availability-hour-cell";
      cell.setAttribute("role", "cell");
      const status = getCourtHourStatus(date, hour, courtName, bookings);
      const dateBlock = getCourtHourBlock(date, hour, courtName);
      const badge = document.createElement("span");
      badge.className = `availability-hour-status slot-${status.toLowerCase().replace(" ", "-")}`;
      badge.textContent = dateBlock
        ? `${status} · ${Array.isArray(dateBlock.courts) ? "This court" : "Whole club"}`
        : status;
      cell.setAttribute("aria-label", `${courtName.replace(/\s+—\s+₱[\d,]+\/hour$/, "")}, ${timeCell.textContent}: ${status}${dateBlock ? `, ${formatBlockScope(dateBlock)}, ${dateBlock.reason}` : ""}`);
      if (dateBlock) badge.title = `${dateBlock.reason} · ${formatBlockRange(dateBlock)}`;
      cell.append(badge);
      row.append(cell);
    });
    availabilityDetailSlots.append(row);
  }
};

const formatDateValue = (date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, "0"),
  String(date.getDate()).padStart(2, "0"),
].join("-");

const nextDateValue = (dateValue) => {
  const [year, month, day] = dateValue.split("-").map(Number);
  return formatDateValue(new Date(year, month - 1, day + 1));
};

const timeToMinutes = (match) => {
  const hour = Number(match[1]) % 12 + (match[3].toUpperCase() === "PM" ? 12 : 0);
  return hour * 60 + Number(match[2]);
};

const bookingTimeRange = (time) => {
  const matches = [...String(time).matchAll(/(\d{1,2}):(\d{2})\s*(AM|PM)/gi)];
  if (matches.length < 2) return null;
  const start = timeToMinutes(matches[0]);
  const end = timeToMinutes(matches[1]);
  return end > start ? [start, end] : null;
};

const formatCalendarHour = (hour) => {
  const normalizedHour = hour % 24;
  return `${normalizedHour % 12 || 12}:00 ${normalizedHour < 12 ? "AM" : "PM"}`;
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

const blockOverlapsRange = (dateBlock, range) => {
  const blockRange = blockTimeRange(dateBlock);
  return blockRange && range[0] < blockRange[1] && blockRange[0] < range[1];
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
    ? `Affected courts: ${dateBlock.courts.join(", ")}`
    : "Whole club"
);

const getCourtHourBlock = (date, hour, court) => {
  const dateBlocks = calendarDateBlocksByDate.get(formatDateValue(date)) || [];
  return dateBlocks.find((dateBlock) => (
    (!Array.isArray(dateBlock.courts) || dateBlock.courts.includes(court))
    && blockOverlapsRange(dateBlock, [hour * 60, (hour + 1) * 60])
  ));
};

const getCourtHourStatus = (date, hour, court, bookings) => {
  const dateBlock = getCourtHourBlock(date, hour, court);
  if (dateBlock) return dateBlock.block_type === "maintenance" ? "MAINTENANCE" : "CLOSED";
  const hourStart = hour * 60;
  const hourEnd = hourStart + 60;
  const hasReservedBooking = bookings.some((booking) => {
    if (booking.court !== court) return false;
    const range = bookingTimeRange(booking.time);
    return range && hourStart < range[1] && range[0] < hourEnd;
  });
  if (hasReservedBooking) return "BOOKED";

  const weekday = date.getDay();
  if (hour >= 7 && hour < 10 && (weekday === 3 || weekday === 6)) return "OPEN PLAY";
  if (hour >= 10 && hour < 16 && weekday === 2) return "MAINTENANCE";
  if (hour >= 16 && hour < 22 && (weekday === 4 || weekday === 0)) return "OPEN PLAY";
  return "OPEN";
};

const renderCalendar = () => {
  scheduleGrid.replaceChildren();
  scheduleMonth.textContent = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(displayedMonth);

  const weekdayHeader = document.createElement("div");
  weekdayHeader.className = "calendar-weekdays";
  weekdayHeader.setAttribute("role", "row");
  weekdays.forEach((weekday) => {
    const heading = document.createElement("div");
    heading.className = "calendar-weekday";
    heading.setAttribute("role", "columnheader");
    heading.textContent = weekday;
    weekdayHeader.append(heading);
  });
  scheduleGrid.append(weekdayHeader);

  const daysInMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 0).getDate();
  const leadingEmptyDays = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), 1).getDay();
  const trailingEmptyDays = (7 - ((leadingEmptyDays + daysInMonth) % 7)) % 7;

  for (let index = 0; index < leadingEmptyDays; index += 1) {
    const emptyDay = document.createElement("div");
    emptyDay.className = "calendar-day calendar-day-empty";
    emptyDay.setAttribute("role", "presentation");
    scheduleGrid.append(emptyDay);
  }

  for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber += 1) {
    const date = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth(), dayNumber);
    const dayCard = document.createElement("div");
    dayCard.className = "calendar-day";
    dayCard.dataset.weekday = String(date.getDay());
    dayCard.setAttribute("role", "gridcell");
    if (date.toDateString() === today.toDateString()) {
      dayCard.classList.add("today");
    }

    const dateHeading = document.createElement("div");
    dateHeading.className = "calendar-day-heading";
    const weekdayName = document.createElement("span");
    weekdayName.className = "calendar-day-weekday";
    weekdayName.textContent = weekdayFormatter.format(date).toUpperCase();
    const dateNumber = document.createElement("span");
    const dateButton = document.createElement("button");
    dateButton.className = "calendar-date-button";
    dateButton.type = "button";
    dateButton.setAttribute("aria-label", `Show hourly court status for ${weekdayFormatter.format(date)} ${dateFormatter.format(date)}`);
    dateButton.setAttribute("aria-pressed", String(
      selectedAvailabilityDate && formatDateValue(selectedAvailabilityDate) === formatDateValue(date),
    ));
    dateButton.addEventListener("click", () => showAvailability(date, dateButton));
    dateNumber.className = "calendar-date";
    dateNumber.textContent = String(dayNumber);
    dateButton.append(dateNumber);
    dateHeading.append(weekdayName, dateButton);
    dayCard.append(dateHeading);

    const bookingCount = calendarBookingsByDate.get(formatDateValue(date))?.length || 0;
    const dateBlocks = calendarDateBlocksByDate.get(formatDateValue(date)) || [];
    const wholeClubBlocked = dateBlocks.some((dateBlock) => !Array.isArray(dateBlock.courts));
    const courtScopeLabel = wholeClubBlocked
      ? "Whole club"
      : [...new Set(dateBlocks.flatMap((dateBlock) => dateBlock.courts || []))].join(", ");
    const allDayBlock = dateBlocks.some((dateBlock) => (
      blockTimeMinutes(dateBlock.start_time) === 0 && blockTimeMinutes(dateBlock.end_time) === 1440
    ));
    const bookingBadge = document.createElement("span");
    bookingBadge.className = `calendar-booking-count${bookingCount ? " has-bookings" : ""}${wholeClubBlocked ? " is-closed" : dateBlocks.length ? " has-blocks" : ""}`;
    bookingBadge.textContent = dateBlocks.length
      ? wholeClubBlocked ? "Whole club" : [...new Set(dateBlocks.flatMap((dateBlock) => dateBlock.courts || []))].join(", ")
      : calendarLoaded && bookingCount ? `${bookingCount} booked` : "";
    if (dateBlocks.length && !wholeClubBlocked) bookingBadge.title = courtScopeLabel;
    const dateLabel = `${weekdayFormatter.format(date)} ${dateFormatter.format(date)}`;
    const todayLabel = date.toDateString() === today.toDateString() ? "Today, " : "";
    const bookingLabel = calendarLoaded && bookingCount
      ? `, ${bookingCount} active ${bookingCount === 1 ? "booking" : "bookings"}`
      : "";
    dayCard.classList.toggle("is-closed", wholeClubBlocked && allDayBlock);
    const blockedLabel = dateBlocks.length
      ? `, blocked for ${courtScopeLabel || "Whole club"}`
      : "";
    dayCard.setAttribute("aria-label", `${todayLabel}${dateLabel}${blockedLabel || bookingLabel}`);
    dayCard.append(bookingBadge);
    scheduleGrid.append(dayCard);
  }

  for (let index = 0; index < trailingEmptyDays; index += 1) {
    const emptyDay = document.createElement("div");
    emptyDay.className = "calendar-day calendar-day-empty";
    emptyDay.setAttribute("role", "presentation");
    scheduleGrid.append(emptyDay);
  }

  previousMonth.disabled = displayedMonth.getFullYear() === today.getFullYear()
    && displayedMonth.getMonth() === today.getMonth();
};

const loadCalendarBookings = async () => {
  const loadId = ++calendarLoadId;
  const monthStart = formatDateValue(displayedMonth);
  const nextMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 1);
  const monthEnd = formatDateValue(nextMonth);
  calendarLoaded = false;
  calendarLoadError = null;
  calendarBookingsByDate.clear();
  calendarDateBlocksByDate.clear();
  scheduleGrid.setAttribute("aria-busy", "true");
  calendarMessage.setAttribute("aria-busy", "true");
  calendarMessage.replaceChildren(window.PickleRallySkeleton.statusLine("Loading court reservations and blocked times", "260px"));
  calendarMessage.classList.remove("is-error");
  if (selectedAvailabilityDate) renderAvailabilityDetails(selectedAvailabilityDate);
  renderCalendar();
  try {
    const [bookings, dateBlocks] = await Promise.all([
      window.PickleRallyDB.listPublicBookings(monthStart, monthEnd),
      window.PickleRallyDB.listBookingDateBlocks(monthStart, monthEnd),
    ]);
    if (loadId !== calendarLoadId) return;
    if (!Array.isArray(bookings)) throw new Error("The calendar returned an invalid booking list.");
    if (!Array.isArray(dateBlocks)) throw new Error("The calendar returned an invalid blocked-time list.");
    bookings.forEach((booking) => {
      if (typeof booking.date !== "string" || typeof booking.court !== "string" || typeof booking.time !== "string") {
        throw new Error("The calendar returned a booking with missing schedule details.");
      }
      const dayBookings = calendarBookingsByDate.get(booking.date) || [];
      dayBookings.push(booking);
      calendarBookingsByDate.set(booking.date, dayBookings);
    });
    dateBlocks.forEach((dateBlock) => {
      if (typeof dateBlock.blocked_date !== "string"
        || !["maintenance", "closed"].includes(dateBlock.block_type)
        || (dateBlock.courts !== null && (!Array.isArray(dateBlock.courts) || dateBlock.courts.some((court) => typeof court !== "string")))) {
        throw new Error("The calendar returned an invalid blocked time.");
      }
      const blocksForDate = calendarDateBlocksByDate.get(dateBlock.blocked_date) || [];
      blocksForDate.push(dateBlock);
      calendarDateBlocksByDate.set(dateBlock.blocked_date, blocksForDate);
    });
    calendarBookingsByDate.forEach((dayBookings) => {
      dayBookings.sort((first, second) => {
        const firstStart = bookingTimeRange(first.time)?.[0] ?? Number.POSITIVE_INFINITY;
        const secondStart = bookingTimeRange(second.time)?.[0] ?? Number.POSITIVE_INFINITY;
        return firstStart - secondStart;
      });
    });
    calendarLoaded = true;
    scheduleGrid.setAttribute("aria-busy", "false");
    calendarMessage.setAttribute("aria-busy", "false");
    calendarMessage.textContent = "Select a date to see hourly availability. Blocked times show the affected court or whole club.";
    if (selectedAvailabilityDate) renderAvailabilityDetails(selectedAvailabilityDate);
    renderCalendar();
  } catch (error) {
    if (loadId !== calendarLoadId) return;
    calendarLoadError = error;
    scheduleGrid.setAttribute("aria-busy", "false");
    calendarMessage.setAttribute("aria-busy", "false");
    calendarBookingsByDate.clear();
    calendarDateBlocksByDate.clear();
    calendarMessage.textContent = `Could not load court reservations or blocked times. ${error.message}`;
    calendarMessage.classList.add("is-error");
    console.error("Unable to load public calendar bookings:", error);
    if (selectedAvailabilityDate) renderAvailabilityDetails(selectedAvailabilityDate);
    renderCalendar();
  }
};

previousMonth.addEventListener("click", () => {
  if (availabilityDialog.open) availabilityDialog.close();
  selectedAvailabilityDate = null;
  displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() - 1, 1);
  loadCalendarBookings();
});
nextMonth.addEventListener("click", () => {
  if (availabilityDialog.open) availabilityDialog.close();
  selectedAvailabilityDate = null;
  displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 1);
  loadCalendarBookings();
});
availabilityDialogClose.addEventListener("click", () => availabilityDialog.close());
availabilityDialog.addEventListener("click", (event) => {
  if (event.target === availabilityDialog) availabilityDialog.close();
});
availabilityDialog.addEventListener("keydown", (event) => {
  if (event.key === "Escape") availabilityDialog.close();
});
loadCalendarBookings();
window.setInterval(() => {
  if (!document.hidden) loadCalendarBookings();
}, 60_000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) loadCalendarBookings();
});

if (bookingDate) {
  const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  bookingDate.min = localToday;
}

