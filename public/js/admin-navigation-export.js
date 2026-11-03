  const setActiveView = (view) => {
    const showBookings = view === "bookings";
    const showCalendar = view === "calendar";
    const showCourtRates = view === "court-rates";
    const showPromoCodes = view === "promo-codes";
    overviewSection.hidden = showBookings || showCalendar || showCourtRates || showPromoCodes;
    bookingsSection.hidden = !showBookings;
    calendarSection.hidden = !showCalendar;
    courtRatesSection.hidden = !showCourtRates;
    promoCodesSection.hidden = !showPromoCodes;
    if (showBookings) {
      markPendingBookingsAsSeen();
      renderBookings();
    } else if (showCalendar) {
      renderAdminCalendar();
      loadCalendarBlocks();
    } else if (!showCourtRates && !showPromoCodes) {
      if (!dashboard.hidden) initializeAnalyticsReveal();
      renderOverviewAnalytics();
    }
    sidebarLinks.forEach((link) => {
      const isActive = link.getAttribute("href") === `#${view}`;
      link.classList.toggle("is-active", isActive);
      if (isActive) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  };
  const syncActiveView = () => {
    setActiveView(window.location.hash === "#bookings"
      ? "bookings"
      : window.location.hash === "#calendar" ? "calendar"
        : window.location.hash === "#court-rates" ? "court-rates"
          : window.location.hash === "#promo-codes" ? "promo-codes" : "overview");
  };
  window.addEventListener("hashchange", syncActiveView);
  syncActiveView();

  performancePeriod.addEventListener("change", () => renderPerformanceChart({ animate: true }));
  revenueChartPeriod.addEventListener("change", () => renderRevenueChart({ animate: true }));
  window.addEventListener("resize", () => renderRevenueChart());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !login.hidden) loadBookings({ silent: true });
  });

  const exportHeaders = ["Name", "Email", "Court", "Players", "Duration", "Date", "Time", "Estimated total", "Promo savings", "Status", "Promo", "Notes"];
  const getExportRows = () => bookings.map((booking) => [
    booking.name, booking.email, booking.court, booking.players, booking.duration,
    booking.date, booking.time, booking.estimated_total, booking.discount_amount || 0, booking.status,
    booking.promo, booking.notes,
  ]);
  const escapeCsv = (value) => {
    const safeValue = String(value ?? "").replace(/^[=+\-@]/, "'$&");
    return `"${safeValue.replace(/"/g, '""')}"`;
  };

  document.querySelector("#export-bookings").addEventListener("click", () => {
    const rows = getExportRows().map((row) => row.map(escapeCsv).join(","));
    const csv = [exportHeaders.map(escapeCsv).join(","), ...rows].join("\r\n");
    const file = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const downloadUrl = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = "picklerally-bookings.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
    setFeedback(`${bookings.length} booking${bookings.length === 1 ? "" : "s"} exported.`);
  });

  const xmlEscape = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

  const columnName = (index) => {
    let name = "";
    for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
      name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
    }
    return name;
  };

  const crc32 = (bytes) => {
    let crc = 0xffffffff;
    bytes.forEach((byte) => {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
      }
    });
    return (crc ^ 0xffffffff) >>> 0;
  };

  const createWorkbook = (rows) => {
    const encoder = new TextEncoder();
    const allRows = [exportHeaders, ...rows];
    const worksheetRows = allRows.map((row, rowIndex) => {
      const cells = row.map((value, columnIndex) => {
        const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
        if (rowIndex > 0 && [4, 7].includes(columnIndex)
          && value !== null && value !== undefined && value !== ""
          && Number.isFinite(Number(value))) {
          return `<c r="${reference}"><v>${Number(value)}</v></c>`;
        }
        return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
      }).join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    }).join("");
    const files = [
      ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
      ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
      ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Bookings" sheetId="1" r:id="rId1"/></sheets></workbook>`],
      ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
      ["xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${worksheetRows}</sheetData></worksheet>`],
    ].map(([name, content]) => ({ name: encoder.encode(name), data: encoder.encode(content) }));

    const localParts = [];
    const centralParts = [];
    let localOffset = 0;
    files.forEach(({ name, data }) => {
      const checksum = crc32(data);
      const localHeader = new Uint8Array(30 + name.length);
      const localView = new DataView(localHeader.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0x0800, true);
      localView.setUint32(14, checksum, true);
      localView.setUint32(18, data.length, true);
      localView.setUint32(22, data.length, true);
      localView.setUint16(26, name.length, true);
      localHeader.set(name, 30);
      localParts.push(localHeader, data);

      const centralHeader = new Uint8Array(46 + name.length);
      const centralView = new DataView(centralHeader.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0x0800, true);
      centralView.setUint32(16, checksum, true);
      centralView.setUint32(20, data.length, true);
      centralView.setUint32(24, data.length, true);
      centralView.setUint16(28, name.length, true);
      centralView.setUint32(42, localOffset, true);
      centralHeader.set(name, 46);
      centralParts.push(centralHeader);
      localOffset += localHeader.length + data.length;
    });

    const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
    const endRecord = new Uint8Array(22);
    const endView = new DataView(endRecord.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, localOffset, true);
    return new Blob([...localParts, ...centralParts, endRecord], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  };

  document.querySelector("#export-excel").addEventListener("click", () => {
    try {
      const file = createWorkbook(getExportRows());
      const downloadUrl = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = "picklerally-bookings.xlsx";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
      setFeedback(`${bookings.length} booking${bookings.length === 1 ? "" : "s"} exported to Excel.`);
    } catch (error) {
      console.error("Unable to export bookings to Excel:", error);
      setFeedback(`Excel export failed. ${error.message || String(error)}`);
    }
  });
