cancellationForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!cancellationForm.reportValidity()) return;

  const submitButton = cancellationForm.querySelector('[type="submit"]');
  submitButton.disabled = true;
  cancellationMessage.className = "cancellation-message";
  cancellationMessage.textContent = "Checking your cancellation request…";
  try {
    const cancelled = await window.PickleRallyDB.cancelBooking(
      cancellationReference.value.trim(),
      cancellationEmail.value.trim(),
      cancellationToken,
    );
    if (!cancelled) {
      if (cancellationToken) {
        cancellationEmail.closest("label").hidden = false;
        cancellationEmail.required = true;
      }
      cancellationMessage.classList.add("is-error");
      cancellationMessage.textContent = "We couldn't cancel this booking. Check the reference and email address or use the secure email link. Website cancellations are available only within 48 hours of submitting the request.";
      return;
    }

    cancellationToken = null;
    cancellationForm.reset();
    cancellationEmail.required = true;
    cancellationEmail.closest("label").hidden = false;
    cancellationMessage.classList.add("is-success");
    cancellationMessage.textContent = "Your booking was cancelled. The court is now available for a new booking request.";
  } catch (error) {
    if (cancellationToken) {
      cancellationEmail.closest("label").hidden = false;
      cancellationEmail.required = true;
    }
    cancellationMessage.classList.add("is-error");
    cancellationMessage.textContent = `The booking could not be cancelled. ${error.message}`;
    console.error("Unable to cancel booking:", error);
  } finally {
    submitButton.disabled = false;
  }
});

const loadCancellationLink = () => {
  const cancellationLink = window.location.hash.match(/^#cancel-booking\?reference=([0-9a-f-]{36})&token=([a-f0-9]{64})$/i);
  if (!cancellationLink) return;

  cancellationReference.value = cancellationLink[1];
  cancellationToken = cancellationLink[2];
  cancellationEmail.required = false;
  cancellationEmail.closest("label").hidden = true;
  cancellationMessage.textContent = "Secure email link ready. Select Cancel booking to confirm.";
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#cancel-booking`);
  document.querySelector("#cancel-booking").scrollIntoView({ behavior: "smooth" });
};

window.addEventListener("hashchange", loadCancellationLink);
loadCancellationLink();
