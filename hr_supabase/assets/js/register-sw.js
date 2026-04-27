const HR_SW_VERSION = "login-punch-fix-20260427-8";

async function clearOldHrCaches() {
  if (!("caches" in window)) return;
  const keep = `hr-attendance-${HR_SW_VERSION}`;
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith("hr-attendance") && key !== keep).map((key) => caches.delete(key)));
}

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", async () => {
    try {
      await clearOldHrCaches();
      const registration = await navigator.serviceWorker.register(`./sw.js?v=${HR_SW_VERSION}`, { updateViaCache: "none" });
      await registration.update();
    } catch (error) {
      console.warn("تعذر تحديث Service Worker:", error);
    }
  });
}

window.HR_CLEAR_APP_CACHE = async function HR_CLEAR_APP_CACHE() {
  if ("serviceWorker" in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((reg) => reg.unregister()));
  }
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  location.reload();
};
