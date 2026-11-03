(() => {
  const shape = (className, width, height) => {
    const node = document.createElement("span");
    node.className = `skeleton-shape ${className || ""}`.trim();
    if (width) node.style.width = width;
    if (height) node.style.height = height;
    node.setAttribute("aria-hidden", "true");
    return node;
  };

  const courtCards = (count = 4) => Array.from({ length: count }, () => {
    const card = document.createElement("article");
    card.className = "court-card skeleton-court-card";
    card.setAttribute("aria-hidden", "true");
    const image = document.createElement("div");
    image.className = "court-image skeleton-court-image";
    image.append(shape("skeleton-image-label", "42%", "10px"), shape("skeleton-image-arrow", "28px", "28px"));
    const bottom = document.createElement("div");
    bottom.className = "court-card-bottom skeleton-court-bottom";
    const detail = document.createElement("div");
    detail.append(shape("", "112px", "16px"), shape("", "145px", "9px"));
    const rate = document.createElement("div");
    rate.className = "skeleton-rate";
    rate.append(shape("", "88px", "14px"), shape("", "100px", "9px"));
    bottom.append(detail, rate);
    card.append(image, bottom);
    return card;
  });

  const courtOptions = (count = 4) => Array.from({ length: count }, () => {
    const row = document.createElement("div");
    row.className = "booking-court-option skeleton-court-option";
    row.setAttribute("aria-hidden", "true");
    row.append(shape("skeleton-checkbox", "16px", "16px"), shape("", "78%", "11px"));
    return row;
  });

  const availabilityTable = (columns = 4, rows = 24) => {
    const table = document.createElement("div");
    table.className = "skeleton-availability-table";
    table.style.setProperty("--court-count", String(columns));
    table.setAttribute("aria-hidden", "true");
    for (let rowIndex = 0; rowIndex <= rows; rowIndex += 1) {
      const row = document.createElement("div");
      row.className = `availability-hour-row${rowIndex === 0 ? " availability-hour-header" : ""}`;
      const cellCount = columns + 1;
      for (let column = 0; column < cellCount; column += 1) {
        const cell = document.createElement("span");
        cell.className = `availability-hour-cell${column === 0 && rowIndex > 0 ? " availability-hour-time" : ""}`;
        cell.append(shape("", column === 0 ? "56%" : "70%", rowIndex === 0 ? "10px" : "14px"));
        row.append(cell);
      }
      table.append(row);
    }
    return table;
  };

  const statusLine = (message, width = "230px") => {
    const fragment = document.createDocumentFragment();
    const accessible = document.createElement("span");
    accessible.className = "skeleton-visually-hidden";
    accessible.textContent = message;
    fragment.append(accessible, shape("skeleton-status-line", width, "12px"));
    return fragment;
  };

  window.PickleRallySkeleton = { courtCards, courtOptions, availabilityTable, statusLine, shape };
})();
