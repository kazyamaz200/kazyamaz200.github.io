// This public site identifier is not an API credential.
const analyticsWindow = window as typeof window & {
  __boundaryAnalyticsLoaded?: boolean;
};

// Keep the beacon alive across Astro navigation and out of private previews.
// Cloudflare's built-in SPA tracking records subsequent page views.
if (
  import.meta.env.PROD &&
  window.location.origin === "https://kazyamaz200.github.io" &&
  !analyticsWindow.__boundaryAnalyticsLoaded
) {
  analyticsWindow.__boundaryAnalyticsLoaded = true;
  const beacon = document.createElement("script");
  beacon.type = "module";
  beacon.src = "https://static.cloudflareinsights.com/beacon.min.js";
  beacon.dataset.cfBeacon = JSON.stringify({
    token: "3bcd4f7a1b3b468084e9e81b25419272",
  });
  document.head.append(beacon);
}
