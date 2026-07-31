export interface InlineFormOptions {
  formSelector: string;
  triggerSelector: string;
  cancelSelector: string;
  statusSelector: string;
  focusSelector: string;
  method: "POST" | "PATCH";
  pendingMessage: string;
  fallbackError: string;
  navigation: "assign" | "smart" | "replace";
}

interface FormResponse {
  error?: string;
  location?: string;
}

function navigate(location: string, mode: InlineFormOptions["navigation"]): void {
  if (mode === "assign") {
    window.location.assign(location);
    return;
  }
  const target = new URL(location, window.location.href);
  if (mode === "replace" || target.pathname === window.location.pathname) {
    history.replaceState(null, "", `${target.pathname}${target.search}${target.hash}`);
    window.location.reload();
    return;
  }
  window.location.assign(target.href);
}

export function initializeInlineForms(options: InlineFormOptions): void {
  document.querySelectorAll<HTMLFormElement>(options.formSelector).forEach((form) => {
    if (form.dataset.ready === "true") return;
    form.dataset.ready = "true";

    const article = form.closest<HTMLElement>("[data-post]");
    const display = article?.querySelector<HTMLElement>("[data-post-display]");
    const trigger = article?.querySelector<HTMLButtonElement>(options.triggerSelector);
    const focusTarget = form.querySelector<HTMLElement>(options.focusSelector);
    const body = form.querySelector<HTMLTextAreaElement>("[name=bodyMarkdown]");
    const status = form.querySelector<HTMLElement>(options.statusSelector);
    const submitButton = form.querySelector<HTMLButtonElement>("[type=submit]");
    const cancelButton = form.querySelector<HTMLButtonElement>(options.cancelSelector);
    let submitting = false;

    const resizeBody = () => {
      if (!body || form.hidden) return;
      body.style.height = "auto";
      body.style.height = `${Math.max(body.scrollHeight, window.innerHeight * 0.5)}px`;
    };

    trigger?.addEventListener("click", () => {
      if (!display) return;
      display.hidden = true;
      form.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      resizeBody();
      focusTarget?.focus();
    });
    body?.addEventListener("input", resizeBody);

    cancelButton?.addEventListener("click", () => {
      if (submitting || !display) return;
      form.hidden = true;
      display.hidden = false;
      trigger?.setAttribute("aria-expanded", "false");
      trigger?.focus();
    });

    form.addEventListener("keydown", (event) => {
      if (!submitting && (event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        form.requestSubmit();
      }
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (submitting || !submitButton || !status) return;
      submitting = true;
      submitButton.disabled = true;
      if (cancelButton) cancelButton.disabled = true;
      status.dataset.error = "false";
      status.textContent = options.pendingMessage;

      try {
        const response = await fetch(form.action, {
          method: options.method,
          body: new FormData(form),
          headers: { Accept: "application/json" },
        });
        const result = await response.json() as FormResponse;
        if (!response.ok || !result.location) {
          throw new Error(result.error ?? options.fallbackError);
        }
        navigate(result.location, options.navigation);
      } catch (error) {
        status.dataset.error = "true";
        status.textContent = error instanceof Error ? error.message : options.fallbackError;
        submitting = false;
        submitButton.disabled = false;
        if (cancelButton) cancelButton.disabled = false;
      }
    });
  });
}
