// إعدادات Supabase — جمعية خواطر أحلى شباب الخيرية
// تم ضبطها على مشروع Supabase الحقيقي المرسل من الإدارة.
// يحتوي هذا الملف على anon/publishable key فقط. لا تضع service_role key هنا أبدًا.
window.HR_SUPABASE_CONFIG = Object.freeze({
  enabled: true,
  strict: true,
  projectId: "ahla-shabab-hr",
  projectRef: "yemradvxmwadlldnxtpz",
  url: "https://yemradvxmwadlldnxtpz.supabase.co",
  anonKey: "sb_publishable_zd51Cc4KSDbUzrQ53maaOw_NbjHC__T",
  storage: {
    avatarsBucket: "avatars",
    punchSelfiesBucket: "punch-selfies",
    attachmentsBucket: "employee-attachments",
  },
  realtime: {
    enabled: true,
  },
  cacheVersion: "uiux-audit-fix-20260427-2",
});

window.__HR_SUPABASE_CONFIG_LOADED__ = true;
window.__HR_SUPABASE_CONFIG_VERSION__ = "uiux-audit-fix-20260427-2";

(function showSupabaseModeBanner() {
  const cfg = window.HR_SUPABASE_CONFIG || {};
  const configured = Boolean(cfg.enabled === true && /^https:\/\/[^\s]+\.supabase\.co$/.test(String(cfg.url || "")) && String(cfg.anonKey || "").length > 20);
  if (configured) {
    document.documentElement.dataset.supabaseMode = "enabled";
    return;
  }
  document.documentElement.dataset.supabaseMode = "local";
  const render = () => {
    if (document.getElementById("supabase-mode-banner")) return;
    const banner = document.createElement("div");
    banner.id = "supabase-mode-banner";
    banner.setAttribute("role", "status");
    banner.style.cssText = "position:sticky;top:0;z-index:99999;background:#f59e0b;color:#1c1917;padding:10px 14px;text-align:center;font-weight:800;box-shadow:0 8px 24px rgba(0,0,0,.25)";
    banner.textContent = "⚠️ وضع تجريبي — Supabase غير مفعّل. البيانات المحلية ليست قاعدة الإنتاج. فعّل الإعدادات في assets/js/supabase-config.js";
    document.body.prepend(banner);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render, { once: true });
  else render();
})();
