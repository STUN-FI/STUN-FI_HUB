document.addEventListener("click", function (event) {
  const overlay = event.target.closest(".modal-overlay");
  if (!overlay) return;
  if (event.target !== overlay) return;

  overlay.classList.remove("active", "show");
});

document.addEventListener("keydown", function (event) {
  if (event.key !== "Escape") return;
  document.querySelectorAll(".modal-overlay.active, .modal-overlay.show").forEach((overlay) => {
    overlay.classList.remove("active", "show");
  });
});
