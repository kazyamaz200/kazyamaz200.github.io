const GISCUS_ORIGIN = "https://giscus.app";

class BoundaryGiscus extends HTMLElement {
  private observer?: MutationObserver;
  private client?: HTMLScriptElement;

  private themeURL(): string {
    const theme =
      document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    return `${this.dataset.themeBase}${theme}.css`;
  }

  private syncTheme = (): void => {
    const theme = this.themeURL();
    if (this.client) this.client.dataset.theme = theme;
    this.querySelector<HTMLIFrameElement>(
      "iframe.giscus-frame"
    )?.contentWindow?.postMessage(
      { giscus: { setConfig: { theme } } },
      GISCUS_ORIGIN
    );
  };

  connectedCallback(): void {
    const container = this.querySelector<HTMLElement>(".giscus");
    if (!container || this.client) return;
    const client = document.createElement("script");
    client.src = `${GISCUS_ORIGIN}/client.js`;
    client.async = true;
    client.crossOrigin = "anonymous";
    Object.assign(client.dataset, {
      repo: "kazyamaz200/kazyamaz200.github.io",
      repoId: "R_kgDOVb-n0A",
      category: "Announcements",
      categoryId: "DIC_kwDOVb-n0M4DKMpn",
      mapping: "pathname",
      strict: "1",
      reactionsEnabled: "1",
      emitMetadata: "0",
      inputPosition: "top",
      theme: this.themeURL(),
      lang: "ja",
      loading: "lazy",
    });
    this.client = client;
    this.addEventListener("load", this.syncTheme, true);
    this.observer = new MutationObserver(this.syncTheme);
    this.observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    container.append(client);
  }

  disconnectedCallback(): void {
    this.observer?.disconnect();
    this.removeEventListener("load", this.syncTheme, true);
    this.querySelector(".giscus")?.replaceChildren();
    this.client = undefined;
  }
}

if (!customElements.get("boundary-giscus")) {
  customElements.define("boundary-giscus", BoundaryGiscus);
}
