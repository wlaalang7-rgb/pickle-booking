document.querySelectorAll(".gallery-open").forEach((button) => {
  button.addEventListener("click", () => {
    const image = lightbox.querySelector("img");
    image.src = button.dataset.gallery;
    image.alt = button.querySelector("img")?.alt || button.getAttribute("aria-label") || "Pickleball court";
    lightbox.showModal();
  });
});

lightbox.querySelector(".lightbox-close").addEventListener("click", () => lightbox.close());
lightbox.addEventListener("click", (event) => {
  if (event.target === lightbox) lightbox.close();
});

let demoVisits = 7;
if (loyaltyAdd) {
  loyaltyAdd.addEventListener("click", () => {
    demoVisits = Math.min(demoVisits + 1, 10);
    loyaltyCount.textContent = String(demoVisits);
    loyaltyProgress.style.width = `${demoVisits * 10}%`;
    loyaltyStatus.textContent = demoVisits === 10
      ? "Demo reward reached! Ask the club about actual rewards."
      : `${10 - demoVisits} visits to your next reward`;
    loyaltyAdd.disabled = demoVisits === 10;
  });
}

const publicWebsiteUrl = new URL(window.location.href);
publicWebsiteUrl.hash = "";
publicWebsiteUrl.search = "";
const isPublicWebsite = ["http:", "https:"].includes(publicWebsiteUrl.protocol)
  && !["localhost", "127.0.0.1"].includes(publicWebsiteUrl.hostname);

const qrTrigger = document.querySelector("#qr-trigger");
if (qrTrigger) {
  qrTrigger.addEventListener("click", () => {
    qrImage.hidden = true;
    qrPrint.hidden = true;
    qrMessage.textContent = isPublicWebsite
      ? "Preparing a QR code for this website…"
      : "Publish this site at its final web address to create a shareable QR code.";
    qrDialog.showModal();

    if (isPublicWebsite) {
      const qrUrl = new URL("https://api.qrserver.com/v1/create-qr-code/");
      qrUrl.searchParams.set("size", "320x320");
      qrUrl.searchParams.set("format", "svg");
      qrUrl.searchParams.set("data", publicWebsiteUrl.href);
      qrImage.src = qrUrl.href;
      qrImage.hidden = false;
    }
  });
}

qrImage.addEventListener("load", () => {
  qrMessage.textContent = "Scan this code to visit the PickleCourt website.";
  qrPrint.hidden = false;
});

qrImage.addEventListener("error", () => {
  qrImage.hidden = true;
  qrPrint.hidden = true;
  qrMessage.textContent = "We couldn't load the QR code. Please try again or share the website link.";
});

qrDialog.querySelector(".qr-close").addEventListener("click", () => qrDialog.close());
qrDialog.addEventListener("click", (event) => {
  if (event.target === qrDialog) qrDialog.close();
});
qrPrint.addEventListener("click", () => window.print());
