import { endpoints, unwrap } from "./api.js?v=login-punch-fix-20260427-8";

const app = document.querySelector("#app");

const state = {
  route: location.hash.replace("#", "") || "dashboard",
  user: null,
  message: "",
  error: "",
  sidebarCollapsed: localStorage.getItem("hr.sidebarCollapsed") === "true",
  sidebarScrollTop: Number(sessionStorage.getItem("hr.sidebarScrollTop") || 0),
  loginIdentifier: localStorage.getItem("hr.login.lastIdentifier") || "",
  loginPassword: "",
  lastLoginFailed: false,
};

const navGroups = [
  ["الرئيسية", [["dashboard", "لوحة المتابعة"], ["realtime", "لوحة Live"], ["employee-punch", "بصمة الموظف"], ["attendance", "الحضور"], ["attendance-calendar", "تقويم الحضور"]]],
  ["الأفراد", [["employees", "الأشخاص والموظفون"], ["users", "المستخدمون"], ["org-chart", "الهيكل الوظيفي"]]],
  ["الصلاحيات", [["roles", "الأدوار والصلاحيات"]]],
  ["الطلبات", [["requests", "مركز الطلبات"], ["missions", "المأموريات"], ["leaves", "الإجازات"], ["locations", "طلبات وسجل المواقع"], ["disputes", "الشكاوى وفض الخلافات"]]],
  ["المتابعة", [["kpi", "مؤشرات الأداء"], ["ai-analytics", "تحليلات AI"], ["reports", "التقارير"], ["advanced-reports", "منشئ التقارير"], ["audit", "سجل التدقيق"], ["notifications", "الإشعارات"]]],
  ["النظام", [["settings", "الإعدادات"], ["route-access", "صلاحيات الواجهة"], ["integrations", "التكاملات"], ["access-control", "الأجهزة والبوابات"], ["offline-sync", "Offline Sync"], ["health", "حالة النظام"], ["backup", "نسخ واستيراد"]]],
];

const routePermissions = {
  dashboard: ["dashboard:view"],
  realtime: ["realtime:view", "dashboard:view", "reports:export"],
  employees: ["employees:view", "employees:write", "users:manage"],
  "employee-profile": ["employees:view", "employees:write", "users:manage"],
  users: ["users:manage"],
  "org-chart": ["employees:view"],
  roles: ["users:manage"],
  "employee-punch": ["dashboard:view", "attendance:self", "attendance:manage"],
  attendance: ["attendance:manage", "employees:write"],
  "attendance-calendar": ["attendance:manage", "employees:view"],
  requests: ["requests:approve", "attendance:manage"],
  missions: ["dashboard:view"],
  leaves: ["dashboard:view"],
  locations: ["dashboard:view", "attendance:self", "attendance:manage", "requests:approve"],
  disputes: ["dashboard:view", "disputes:manage", "requests:approve", "users:manage"],
  kpi: ["kpi:manage", "kpi:team", "kpi:self", "reports:export"],
  reports: ["reports:export"],
  "advanced-reports": ["reports:export"],
  "ai-analytics": ["ai:view", "reports:export"],
  audit: ["audit:view"],
  notifications: ["dashboard:view"],
  settings: ["settings:manage"],
  "route-access": ["settings:manage", "users:manage"],
  health: ["settings:manage", "audit:view"],
  backup: ["settings:manage", "reports:export"],
  integrations: ["integrations:manage", "settings:manage"],
  "access-control": ["access_control:manage", "attendance:manage"],
  "offline-sync": ["offline:manage", "settings:manage", "attendance:self"],
};

const FULL_ACCESS_ROLE_KEYS = new Set([
  "admin",
  "super-admin",
  "super_admin",
  "role-admin",
  "executive",
  "role-executive",
  "executive-secretary",
  "role-executive-secretary",
  "hr-manager",
  "role-hr",
  "مدير النظام",
  "المدير التنفيذي",
  "السكرتير التنفيذي",
  "مدير موارد بشرية",
]);

function safeList(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeDashboardPayload(value = {}) {
  const dashboard = value && typeof value === "object" ? value : {};
  const cards = dashboard.cards && typeof dashboard.cards === "object" ? dashboard.cards : {};
  const metrics = safeList(dashboard.metrics);
  const attendanceBreakdown = safeList(dashboard.attendanceBreakdown);
  const attendanceTrends = safeList(dashboard.attendanceTrends);
  const fallbackMetrics = [
    { label: "الموظفون", value: cards.employees ?? 0, helper: "إجمالي الملفات المتاحة" },
    { label: "حضور اليوم", value: cards.presentToday ?? 0, helper: "الحركات المسجلة اليوم" },
    { label: "طلبات معلقة", value: cards.pendingRequests ?? 0, helper: "تحتاج مراجعة" },
    { label: "إجازات اليوم", value: cards.leavesToday ?? 0, helper: "الموافق عليها اليوم" },
  ];
  const fallbackBreakdown = [
    { label: "حضور", value: cards.presentToday ?? 0 },
    { label: "طلبات", value: cards.pendingRequests ?? 0 },
    { label: "إجازات", value: cards.leavesToday ?? 0 },
  ];
  const normalizedBreakdown = attendanceBreakdown.length ? attendanceBreakdown : fallbackBreakdown;
  const normalizedTrends = attendanceTrends.length
    ? attendanceTrends
    : normalizedBreakdown.map((item) => ({ label: item.label, present: Number(item.value || 0), late: 0, mission: 0 }));
  return {
    ...dashboard,
    metrics: metrics.length ? metrics : fallbackMetrics,
    attendanceBreakdown: normalizedBreakdown,
    attendanceTrends: normalizedTrends,
    latestEvents: safeList(dashboard.latestEvents),
    latestAudit: safeList(dashboard.latestAudit),
  };
}

function normalizePermissionList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try { return normalizePermissionList(JSON.parse(trimmed)); } catch { return trimmed.split(/[،,\s]+/).map((item) => item.trim()).filter(Boolean); }
  }
  if (value && typeof value === "object") {
    if (Array.isArray(value.permissions)) return normalizePermissionList(value.permissions);
    if (Array.isArray(value.scopes)) return normalizePermissionList(value.scopes);
    return Object.entries(value).filter(([, enabled]) => enabled === true || enabled === "true" || enabled === 1 || enabled === "1").map(([scope]) => scope);
  }
  return [];
}

function roleMeta(user = state.user) {
  const role = user?.role;
  if (role && typeof role === "object") {
    return {
      id: role.id || user?.roleId || "",
      key: role.key || role.slug || role.code || "",
      slug: role.slug || role.key || "",
      name: role.name || role.label || user?.roleName || user?.role || "",
      permissions: normalizePermissionList(role.permissions),
    };
  }
  return {
    id: user?.roleId || "",
    key: user?.roleKey || user?.roleSlug || user?.role || "",
    slug: user?.roleSlug || user?.roleKey || user?.role || "",
    name: user?.roleName || user?.role || user?.employee?.role?.name || "",
    permissions: normalizePermissionList(user?.employee?.role?.permissions),
  };
}

function currentPermissions(user = state.user) {
  return new Set([
    ...normalizePermissionList(user?.permissions),
    ...normalizePermissionList(user?.permissionScopes),
    ...normalizePermissionList(user?.scopes),
    ...normalizePermissionList(user?.profile?.permissions),
    ...roleMeta(user).permissions,
  ]);
}

function hasFullAccess(user = state.user) {
  const role = roleMeta(user);
  const rawKeys = [role.id, role.key, role.slug, role.name].filter(Boolean).map(String);
  const lowerKeys = rawKeys.map((item) => item.toLowerCase());
  const permissions = currentPermissions(user);
  return permissions.has("*") || rawKeys.some((key) => FULL_ACCESS_ROLE_KEYS.has(key)) || lowerKeys.some((key) => FULL_ACCESS_ROLE_KEYS.has(key));
}

function hasAnyPermission(scopes = []) {
  const permissions = currentPermissions();
  if (!scopes.length || hasFullAccess()) return true;
  return scopes.some((scope) => permissions.has(scope));
}

function roleLabel(user = state.user) {
  const role = roleMeta(user);
  return role.name || role.key || role.slug || "بدون دور محدد";
}

function activeNavKey(key = routeKey()) {
  if (key === "employee-profile") return "employees";
  return key;
}

function canRoute(key) {
  return hasAnyPermission(routePermissions[key] || []);
}

window.addEventListener("hashchange", () => {
  state.route = location.hash.replace("#", "") || "dashboard";
  render();
});

function routeKey() {
  return state.route.split("?")[0];
}

function routeParams() {
  return new URLSearchParams(state.route.split("?")[1] || "");
}

function inputDate(value = new Date()) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function setRouteQuery(key, values = {}) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([name, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") params.set(name, String(value));
  });
  const query = params.toString();
  location.hash = query ? `${key}?${query}` : key;
}

function attendanceFiltersFromRoute() {
  const params = routeParams();
  const today = inputDate(new Date());
  const monthAgo = inputDate(addDays(new Date(), -30));
  const limit = Math.min(Math.max(Number(params.get("limit") || 500), 100), 5000);
  return {
    from: params.get("from") || monthAgo,
    to: params.get("to") || today,
    employeeId: params.get("employeeId") || "",
    type: params.get("type") || "",
    review: params.get("review") || "",
    limit,
  };
}

function eventDay(event) {
  return String(event?.eventAt || event?.createdAt || event?.date || "").slice(0, 10);
}

function filterAttendanceEvents(events = [], filters = {}) {
  return events.filter((event) => {
    const day = eventDay(event);
    return (!filters.from || !day || day >= filters.from)
      && (!filters.to || !day || day <= filters.to)
      && (!filters.employeeId || event.employeeId === filters.employeeId)
      && (!filters.type || event.type === filters.type)
      && (!filters.review || (filters.review === "review" ? Boolean(event.requiresReview) : !event.requiresReview));
  }).sort((a, b) => new Date(b.eventAt || b.createdAt || 0) - new Date(a.eventAt || a.createdAt || 0));
}

function routeDisplayName(key) {
  for (const [, routes] of navGroups) {
    const found = routes.find(([routeKey]) => routeKey === key);
    if (found) return found[1];
  }
  if (key === "employee-profile") return "ملف الموظف";
  return key;
}

function setMessage(message = "", error = "") {
  state.message = message;
  state.error = error;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function date(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString("ar-EG");
}

function dateOnly(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value).slice(0, 10) : parsed.toLocaleDateString("ar-EG");
}

function statusLabel(value) {
  return {
    ACTIVE: "نشط",
    INACTIVE: "غير مفعل",
    INVITED: "دعوة مؤقتة",
    LOCKED: "مغلق",
    TERMINATED: "منتهي",
    SUSPENDED: "موقوف",
    DISABLED: "معطل",
    ON_LEAVE: "إجازة",
    LEAVE: "إجازة",
    REMOTE: "عن بعد",
    PRESENT: "حاضر",
    PRESENT_REVIEW: "حضور للمراجعة",
    LATE: "متأخر",
    ABSENT: "غائب",
    MISSION: "مأمورية",
    CHECK_IN: "حضور",
    CHECK_OUT: "انصراف",
    CHECKOUT_REVIEW: "انصراف للمراجعة",
    APPROVED: "معتمد",
    REJECTED: "مرفوض",
    DRAFT: "مسودة",
    PENDING: "قيد المراجعة",
    SUBMITTED: "تم التسليم",
    IN_REVIEW: "قيد فحص اللجنة",
    OPEN: "مفتوحة",
    RESOLVED: "تم الحل",
    CLOSED: "مغلقة",
    ESCALATED: "مرفوعة للإدارة التنفيذية",
    MEDIUM: "متوسطة",
    HIGH: "عالية",
    LOW: "منخفضة",
    COMPLETED: "مكتمل",
    READ: "مقروء",
    UNREAD: "جديد",
    INFO: "معلومة",
    SUCCESS: "نجاح",
    verified: "تحقق ناجح",
    not_checked: "بدون تحقق",
    failed: "فشل التحقق",
    inside_branch: "داخل الفرع",
    outside_branch: "خارج النطاق",
    inside_mission: "داخل مأمورية",
    location_unavailable: "الموقع غير متاح",
    permission_denied: "صلاحية الموقع مرفوضة",
    branch_unknown: "مجمع غير محدد",
    branch_location_missing: "عنوان الفرع غير مضبوط",
    location_low_accuracy: "دقة الموقع ضعيفة",
    unknown: "غير معروف",
  }[value] || value || "-";
}

function badge(value) {
  return `<span class="status ${escapeHtml(value)}">${escapeHtml(statusLabel(value))}</span>`;
}

function initials(name) {
  return String(name || "?").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("") || "?";
}

function avatar(person, size = "") {
  const src = person?.photoUrl || person?.avatarUrl;
  if (src) return `<img class="avatar ${size}" src="${escapeHtml(src)}" alt="${escapeHtml(person.fullName || person.name || "")}" loading="lazy" />`;
  return `<span class="avatar fallback ${size}">${escapeHtml(initials(person?.fullName || person?.name))}</span>`;
}

function userAvatarSubject(user = state.user) {
  const employee = user?.employee || {};
  return {
    ...employee,
    fullName: employee.fullName || user?.fullName || user?.name || user?.email || "مستخدم",
    name: employee.fullName || user?.name || user?.fullName || user?.email || "مستخدم",
    photoUrl: user?.avatarUrl || user?.photoUrl || employee.photoUrl || employee.avatarUrl || "",
    avatarUrl: user?.avatarUrl || user?.photoUrl || employee.photoUrl || employee.avatarUrl || "",
  };
}
function isStrongPassword(value) {
  return new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{10,}$").test(String(value || ""));
}

function readForm(form, options = {}) {
  const values = Object.fromEntries(new FormData(form));
  const errors = [];
  const emailPattern = new RegExp("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
  const phonePattern = new RegExp("^01[0-9]{9}$");
  const passwordPolicy = options.passwordPolicy || form.dataset.passwordPolicy || "none";
  for (const [name, value] of Object.entries(values)) {
    const text = String(value || "").trim();
    if (["email", "mail"].includes(name) && text && !emailPattern.test(text)) errors.push("البريد الإلكتروني غير صحيح.");
    if (["phone", "mobile"].includes(name) && text && !phonePattern.test(text.replace(/\s+/g, ""))) errors.push("رقم الموبايل يجب أن يكون رقمًا مصريًا صحيحًا يبدأ بـ 01.");
    const shouldValidatePassword = name === "newPassword" || (name === "password" && passwordPolicy === "strong");
    if (shouldValidatePassword && text && !isStrongPassword(text)) errors.push("كلمة المرور الجديدة يجب ألا تقل عن 10 أحرف وتحتوي على حرف كبير وصغير ورقم ورمز.");
  }
  if (errors.length) throw new Error([...new Set(errors)].join("\n"));
  return values;
}

function optionList(items = [], selected = "", empty = "") {
  return `${empty ? `<option value="">${escapeHtml(empty)}</option>` : ""}${items.map((item) => {
    const value = item.id ?? item.value ?? item.name;
    return `<option value="${escapeHtml(value)}" ${String(selected || "") === String(value || "") ? "selected" : ""}>${escapeHtml(item.name ?? item.label ?? value)}</option>`;
  }).join("")}`;
}

function table(headers, rows, className = "") {
  return `
    <div class="table-wrap ${className}">
      <table>
        <thead><tr>${headers.map((item) => `<th>${escapeHtml(item)}</th>`).join("")}</tr></thead>
        <tbody>${rows.length ? rows.join("") : `<tr><td colspan="${headers.length}" class="empty">لا توجد بيانات مطابقة</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function enhanceResponsiveTables(scope = app) {
  scope.querySelectorAll(".table-wrap table").forEach((tableElement) => {
    const headers = [...tableElement.querySelectorAll("thead th")].map((th) => th.textContent.trim());
    tableElement.querySelectorAll("tbody tr").forEach((row) => {
      [...row.children].forEach((cell, index) => {
        if (!cell.dataset.label && headers[index]) cell.dataset.label = headers[index];
      });
    });
  });
}

function simpleForm(id, fields, submitText) {
  return `<form id="${id}" class="form-grid compact-form">${fields.map(([name, label, type = "text", opts = "", value = ""]) => `<label>${escapeHtml(label)}${type === "select" ? `<select name="${name}">${opts}</select>` : type === "textarea" ? `<textarea name="${name}">${escapeHtml(value)}</textarea>` : `<input name="${name}" type="${type}" value="${escapeHtml(value)}" ${type !== "checkbox" ? "required" : ""}/>`}</label>`).join("")}<div class="form-actions"><button class="button primary" type="submit">${escapeHtml(submitText)}</button></div></form>`;
}

function confirmAction({ title = "تأكيد العملية", message = "هل تريد المتابعة؟", confirmLabel = "تأكيد", cancelLabel = "إلغاء", danger = false } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-backdrop";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
      <div class="confirm-modal">
        <div class="panel-head"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p></div></div>
        <div class="form-actions">
          <button class="button ghost" type="button" data-cancel>${escapeHtml(cancelLabel)}</button>
          <button class="button ${danger ? "danger" : "primary"}" type="button" data-confirm>${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;
    const cleanup = (answer) => { overlay.remove(); document.removeEventListener("keydown", onKey); resolve(answer); };
    const onKey = (event) => { if (event.key === "Escape") cleanup(false); };
    overlay.addEventListener("click", (event) => { if (event.target === overlay) cleanup(false); });
    overlay.querySelector("[data-cancel]").addEventListener("click", () => cleanup(false));
    overlay.querySelector("[data-confirm]").addEventListener("click", () => cleanup(true));
    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);
    overlay.querySelector("[data-confirm]").focus();
  });
}

function downloadFile(name, content, type = "text/plain;charset=utf-8") {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

function toCsv(rows) {
  return rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
}

function exportHtmlTable(name, headers, rows) {
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8" /><style>body{font-family:Arial,sans-serif;direction:rtl}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:8px;text-align:right}th{background:#f3f4f6}</style></head><body><table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
  downloadFile(name, html, "application/vnd.ms-excel;charset=utf-8");
}

function printReport(title, headers, rows) {
  const win = window.open("", "_blank", "width=1100,height=800");
  if (!win) return;
  win.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;padding:24px;direction:rtl;color:#111827}h1{font-size:22px}table{border-collapse:collapse;width:100%;margin-top:16px}th,td{border:1px solid #d1d5db;padding:8px;text-align:right;font-size:12px}th{background:#f3f4f6}.meta{color:#6b7280;margin-bottom:12px}@media print{button{display:none}}</style></head><body><button onclick="print()">طباعة / حفظ PDF</button><h1>${escapeHtml(title)}</h1><div class="meta">تاريخ التقرير: ${new Date().toLocaleString("ar-EG")}</div><table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`);
  win.document.close();
}

async function getBrowserLocation() {
  if (!navigator.geolocation) return { locationPermission: "unavailable", accuracyMeters: null };
  return await new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const accuracyMeters = Math.round(Number(position.coords.accuracy || 0));
        resolve({
          locationPermission: "granted",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: accuracyMeters,
          accuracyMeters,
          capturedAt: new Date().toISOString(),
        });
      },
      (error) => resolve({ locationPermission: error.code === error.PERMISSION_DENIED ? "denied" : "unknown", accuracyMeters: null }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

async function referenceData() {
  const safe = async (reader, fallback = []) => {
    try {
      return unwrap(await reader());
    } catch {
      return fallback;
    }
  };
  const fallbackEmployee = state.user?.employee ? [state.user.employee] : [];
  const fallbackRole = state.user?.role ? [state.user.role] : [];
  const fallbackBranch = state.user?.branch ? [state.user.branch] : state.user?.employee?.branch ? [state.user.employee.branch] : [];
  const fallbackDepartment = state.user?.department ? [state.user.department] : state.user?.employee?.department ? [state.user.employee.department] : [];
  const fallbackGovernorate = state.user?.governorate ? [state.user.governorate] : state.user?.employee?.governorate ? [state.user.employee.governorate] : [];
  const fallbackComplex = state.user?.complex ? [state.user.complex] : state.user?.employee?.complex ? [state.user.employee.complex] : [];
  const [roles, branches, departments, governorates, complexes, employees, shifts, permissions] = await Promise.all([
    safe(() => endpoints.roles(), fallbackRole),
    safe(() => endpoints.branches(), fallbackBranch),
    safe(() => endpoints.departments(), fallbackDepartment),
    safe(() => endpoints.governorates(), fallbackGovernorate),
    safe(() => endpoints.complexes(), fallbackComplex),
    safe(() => endpoints.employees(), fallbackEmployee),
    safe(() => endpoints.shifts(), []),
    safe(() => endpoints.permissions(), []),
  ]);
  return { roles, branches, departments, governorates, complexes, employees, shifts, permissions };
}

function shell(content, title, description = "") {
  const previousSidebar = app.querySelector(".sidebar");
  if (previousSidebar) {
    state.sidebarScrollTop = previousSidebar.scrollTop;
    sessionStorage.setItem("hr.sidebarScrollTop", String(state.sidebarScrollTop));
  }
  const current = activeNavKey(routeKey());
  document.body.classList.remove("nav-open");
  document.body.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  app.innerHTML = `
    <div class="app-shell">
      <div class="sidebar-overlay" data-action="nav-close"></div>
      <aside class="sidebar ${state.sidebarCollapsed ? "is-collapsed" : ""}">
        <button class="sidebar-close" type="button" data-action="nav-close" aria-label="إغلاق القائمة">×</button>
        <div class="brand">
          <img src="./assets/images/ahla-shabab-logo.png" alt="" onerror="this.style.display='none'" />
          <div><strong>نظام الحضور</strong><span>HR Operations SaaS</span></div>
        </div>
        <nav class="nav" aria-label="القائمة الرئيسية">
          ${navGroups.map(([group, routes]) => `
            <section class="nav-group">
              <p>${escapeHtml(group)}</p>
              ${routes.filter(([key]) => canRoute(key)).map(([key, label]) => `<button class="${current === key ? "is-active" : ""}" data-route="${key}" aria-current="${current === key ? "page" : "false"}"><span>${escapeHtml(label)}</span></button>`).join("")}
            </section>
          `).join("")}
        </nav>
        <button class="collapse-button" type="button" data-action="collapse-sidebar">${state.sidebarCollapsed ? "توسيع القائمة" : "طي القائمة"}</button>
      </aside>
      <button class="nav-fab" type="button" data-action="sidebar-expand" aria-label="فتح القائمة" title="فتح القائمة">☰</button>
      <main class="main">
        <header class="topbar">
          <button class="button ghost mobile-menu" type="button" data-action="nav-open" aria-expanded="false">القائمة</button>
          <div class="page-title"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>
          <div class="toolbar">
            <span class="user-chip" title="${escapeHtml(roleLabel())}">${avatar(userAvatarSubject(), "tiny")}<span>${escapeHtml(state.user?.name || state.user?.fullName || "مستخدم")}</span></span>
            <span class="role-chip ${hasFullAccess() ? "is-admin" : ""}" title="حسب الدور الحالي">${hasFullAccess() ? "صلاحيات كاملة" : "حسب دورك"}: ${escapeHtml(roleLabel())}</span>
            <button class="button ghost" data-action="refresh">تحديث</button>
            <button class="button danger" data-action="logout">خروج</button>
          </div>
        </header>
        ${state.user?.mustChangePassword ? `<div class="message warning">كلمة المرور الحالية مؤقتة. افتح الإعدادات وغير كلمة المرور قبل الاعتماد على الحساب.</div>` : ""}
        ${state.message ? `<div class="message">${escapeHtml(state.message)}</div>` : ""}
        ${state.error ? `<div class="message error">${escapeHtml(state.error)}</div>` : ""}
        ${content}
      </main>
    </div>
  `;

  enhanceResponsiveTables(app);
  const sidebar = app.querySelector(".sidebar");
  if (sidebar) {
    requestAnimationFrame(() => { sidebar.scrollTop = Number(state.sidebarScrollTop || 0); });
    sidebar.addEventListener("scroll", () => {
      state.sidebarScrollTop = sidebar.scrollTop;
      sessionStorage.setItem("hr.sidebarScrollTop", String(state.sidebarScrollTop));
    }, { passive: true });
  }

  const closeMobileNav = () => {
    document.body.classList.remove("nav-open");
    app.querySelectorAll('[data-action="nav-open"]').forEach((button) => button.setAttribute("aria-expanded", "false"));
  };
  const openMobileNav = () => {
    document.body.classList.add("nav-open");
    app.querySelectorAll('[data-action="nav-open"]').forEach((button) => button.setAttribute("aria-expanded", "true"));
  };
  app.querySelectorAll("[data-route]").forEach((button) => button.addEventListener("click", () => {
    const currentSidebar = app.querySelector(".sidebar");
    if (currentSidebar) {
      state.sidebarScrollTop = currentSidebar.scrollTop;
      sessionStorage.setItem("hr.sidebarScrollTop", String(state.sidebarScrollTop));
    }
    closeMobileNav();
    location.hash = button.dataset.route;
  }));
  app.querySelectorAll('[data-action="nav-open"]').forEach((button) => button.addEventListener("click", openMobileNav));
  app.querySelectorAll('[data-action="nav-close"]').forEach((button) => button.addEventListener("click", closeMobileNav));
  app.querySelectorAll('[data-action="sidebar-expand"]').forEach((button) => button.addEventListener("click", () => {
    if (window.matchMedia("(max-width: 1180px)").matches) {
      openMobileNav();
      return;
    }
    state.sidebarCollapsed = false;
    localStorage.setItem("hr.sidebarCollapsed", "false");
    render();
  }));
  app.querySelector('[data-action="collapse-sidebar"]')?.addEventListener("click", () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    localStorage.setItem("hr.sidebarCollapsed", String(state.sidebarCollapsed));
    render();
  });
  app.querySelector('[data-action="refresh"]')?.addEventListener("click", render);
  app.querySelector('[data-action="logout"]')?.addEventListener("click", async () => {
    await endpoints.logout();
    state.user = null;
    renderLogin();
  });
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") document.body.classList.remove("nav-open");
});

async function renderLogin() {
  const identifierValue = state.loginIdentifier || "";
  const passwordValue = state.loginPassword || "";
  app.innerHTML = `
    <div class="login-screen">
      <form class="login-panel" id="login-form" data-password-policy="none" novalidate>
        <div class="login-mark">HR</div>
        <h1>تسجيل الدخول</h1>
        <p>اكتب بريدك وكلمة المرور. عند حدوث خطأ لن يتم مسح البيانات التي أدخلتها.</p>
        ${state.error ? `<div class="message error">${escapeHtml(state.error)}</div>` : ""}
        ${state.lastLoginFailed ? `<div class="message warning compact">لو نسيت كلمة المرور اضغط على "نسيت كلمة السر" وسيتم إرسال رابط إعادة تعيين إلى بريدك.</div>` : ""}
        <label>البريد أو الاسم<input name="identifier" value="${escapeHtml(identifierValue)}" autocomplete="username" required /></label>
        <label>كلمة المرور<input name="password" type="password" value="${escapeHtml(passwordValue)}" autocomplete="current-password" required /></label>
        <button class="button primary full" type="submit">دخول</button>
        <button class="button ghost full forgot-password-btn" type="button" data-forgot-password>نسيت كلمة السر؟ أرسل رابط إعادة التعيين</button>
        <div class="login-help-note">لن يتم استبدال البريد أو كلمة المرور المكتوبة عند فشل الدخول.</div>
      </form>
    </div>
  `;
  const form = app.querySelector("#login-form");
  form.addEventListener("input", () => {
    const values = readForm(form);
    state.loginIdentifier = values.identifier || "";
    state.loginPassword = values.password || "";
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = readForm(event.currentTarget);
    state.loginIdentifier = values.identifier || "";
    state.loginPassword = values.password || "";
    if (state.loginIdentifier) localStorage.setItem("hr.login.lastIdentifier", state.loginIdentifier);
    try {
      state.user = unwrap(await endpoints.login(values.identifier, values.password));
      state.loginPassword = "";
      state.lastLoginFailed = false;
      setMessage("تم تسجيل الدخول.", "");
      render();
    } catch (error) {
      state.lastLoginFailed = true;
      setMessage("", error.message || "تعذر تسجيل الدخول.");
      renderLogin();
    }
  });
  app.querySelector("[data-forgot-password]").addEventListener("click", async () => {
    const values = readForm(form);
    state.loginIdentifier = values.identifier || state.loginIdentifier || "";
    state.loginPassword = values.password || state.loginPassword || "";
    if (!state.loginIdentifier) {
      setMessage("", "اكتب البريد أولًا ثم اضغط نسيت كلمة السر.");
      renderLogin();
      return;
    }
    try {
      await endpoints.forgotPassword(state.loginIdentifier);
      state.lastLoginFailed = false;
      setMessage("تم إرسال رابط إعادة تعيين كلمة المرور إلى البريد المسجل، راجع Inbox أو Spam.", "");
      renderLogin();
    } catch (error) {
      state.lastLoginFailed = true;
      setMessage("", error.message || "تعذر إرسال رابط إعادة التعيين.");
      renderLogin();
    }
  });
}

async function renderDashboard() {
  const dashboard = normalizeDashboardPayload(unwrap(await endpoints.dashboard()));
  const trends = safeList(dashboard.attendanceTrends);
  const breakdown = safeList(dashboard.attendanceBreakdown);
  const latestEvents = safeList(dashboard.latestEvents);
  const latestAudit = safeList(dashboard.latestAudit);
  const max = Math.max(1, ...trends.map((item) => Number(item.present || 0) + Number(item.late || 0) + Number(item.mission || 0)));
  shell(
    `<section class="grid dashboard-grid">
      ${safeList(dashboard.metrics).map((metric) => `<article class="metric"><span>${escapeHtml(metric.label)}</span><strong>${escapeHtml(metric.value)}</strong><small>${escapeHtml(metric.helper || "")}</small></article>`).join("")}
      <article class="panel span-7">
        <div class="panel-head"><div><h2>توزيع الحضور حسب القسم</h2><p>مقارنة تشغيلية سريعة</p></div><span>اليوم</span></div>
        <div class="chart">${trends.map((item) => `<div class="bar"><div class="bar-fill" style="height:${((Number(item.present || 0) + Number(item.late || 0) + Number(item.mission || 0)) / max) * 150}px"></div><span>${escapeHtml(item.label)}</span></div>`).join("") || `<div class="empty-state">لا توجد بيانات اتجاهات بعد.</div>`}</div>
      </article>
      <article class="panel span-5">
        <div class="panel-head"><div><h2>ملخص اليوم</h2><p>حالات الحضور المسجلة</p></div></div>
        ${table(["الحالة", "العدد"], breakdown.map((item) => `<tr><td>${escapeHtml(item.label)}</td><td><strong>${escapeHtml(item.value)}</strong></td></tr>`))}
      </article>
      <article class="panel span-8">
        <div class="panel-head"><div><h2>آخر أحداث الحضور</h2><p>آخر الحركات المسجلة</p></div><button class="button ghost" data-route="attendance">فتح الحضور</button></div>
        ${table(["الموظف", "النوع", "الوقت", "المصدر"], latestEvents.map((event) => `<tr><td class="person-cell">${avatar(event.employee, "tiny")}<span>${escapeHtml(event.employee?.fullName || event.employeeId || "-")}</span></td><td>${badge(event.type)}</td><td>${date(event.eventAt)}</td><td>${escapeHtml(event.source || "-")}</td></tr>`))}
      </article>
      <article class="panel span-4">
        <div class="panel-head"><div><h2>آخر عمليات النظام</h2><p>Audit Log</p></div><button class="button ghost" data-route="audit">عرض الكل</button></div>
        ${table(["العملية", "الكيان", "الوقت"], latestAudit.map((item) => `<tr><td>${escapeHtml(item.action)}</td><td>${escapeHtml(item.entityType)}</td><td>${date(item.createdAt)}</td></tr>`))}
      </article>
    </section>`,
    "لوحة المتابعة",
    "لوحة قيادة تشغيلية تجمع الحضور والطلبات وسجل العمليات.",
  );
}

function employeeFilters(ref) {
  return `
    <form class="filters" id="employee-filters">
      <input name="q" placeholder="بحث بالاسم أو الهاتف أو البريد أو المسمى الوظيفي" />
      <select name="departmentId">${optionList(ref.departments, "", "كل الأقسام")}</select>
      <select name="managerEmployeeId">${optionList(ref.employees.map((item) => ({ id: item.id, name: item.fullName })), "", "كل المديرين")}</select>
    </form>`;
}

function filterEmployees(employees) {
  const values = readForm(app.querySelector("#employee-filters"));
  const q = (values.q || "").trim().toLowerCase();
  return employees.filter((employee) => {
    const text = [employee.fullName, employee.phone, employee.email, employee.jobTitle].join(" ").toLowerCase();
    return (!q || text.includes(q))
      && (!values.departmentId || employee.departmentId === values.departmentId)
      && (!values.managerEmployeeId || employee.managerEmployeeId === values.managerEmployeeId);
  });
}

async function renderEmployees() {
  const [employees, ref] = await Promise.all([endpoints.employees().then(unwrap), referenceData()]);
  shell(
    `<section class="stack">
      <article class="panel">
        <div class="panel-head">
          <div><h2>قائمة الأشخاص والموظفين</h2><p>إدارة بيانات الموظفين الأساسية والربط بالحسابات والبصمة.</p></div>
          <div class="toolbar"><button class="button primary" data-action="new-employee">إضافة موظف</button><button class="button ghost" data-export-employees>تصدير CSV</button><button class="button ghost" data-export-employees-xls>Excel</button><button class="button ghost" data-print-employees>طباعة</button></div>
        </div>
        ${employeeFilters(ref)}
        <div class="bulk-bar" id="employees-bulk-bar">
          <label class="check-row"><input type="checkbox" id="employee-select-all" /> تحديد النتائج الظاهرة</label>
          <span id="employee-selected-count">لم يتم تحديد موظفين</span>
          <button class="button danger ghost" data-bulk-employee-delete disabled>حذف منطقي للمحدد</button>
        </div>
        <div id="employees-list" class="people-grid"></div>
      </article>
      <article id="employee-editor" class="panel hidden"></article>
    </section>`,
    "الأشخاص والموظفون",
    "ملفات فعلية قابلة للإضافة والتعديل والربط بالحضور والمأموريات والإجازات.",
  );

  const selectedEmployees = new Set();
  const updateBulkBar = () => {
    const count = selectedEmployees.size;
    app.querySelector("#employee-selected-count").textContent = count ? `تم تحديد ${count} موظف` : "لم يتم تحديد موظفين";
    app.querySelectorAll("[data-bulk-employee-delete]").forEach((button) => { button.disabled = count === 0; });
  };

  const draw = () => {
    const filtered = filterEmployees(employees);
    const visibleIds = new Set(filtered.map((employee) => employee.id));
    [...selectedEmployees].forEach((id) => { if (!visibleIds.has(id)) selectedEmployees.delete(id); });
    app.querySelector("#employees-list").innerHTML = filtered.map((employee) => `
      <article class="person-card ${selectedEmployees.has(employee.id) ? "is-selected" : ""}">
        <label class="select-card" title="تحديد الموظف"><input type="checkbox" data-select-employee="${employee.id}" ${selectedEmployees.has(employee.id) ? "checked" : ""} /><span>تحديد</span></label>
        <button class="avatar-button" data-view="${employee.id}" title="عرض ملف وموقع الموظف">${avatar(employee)}</button>
        <div class="person-main">
          <h3>${escapeHtml(employee.fullName)}</h3>
          <p>${escapeHtml(employee.jobTitle || "-")}</p>
          <div class="meta-row"><span>${escapeHtml(employee.phone || "-")}</span><span>${escapeHtml(employee.email || "-")}</span></div>
          <div class="meta-row"><span>${escapeHtml(employee.department?.name || "-")}</span><span>المدير: ${escapeHtml(employee.manager?.fullName || "بدون")}</span></div>
        </div>
        <div class="person-actions">
          <button class="button ghost" data-view="${employee.id}">عرض</button>
          <button class="button ghost" data-edit="${employee.id}">تعديل</button>
          <button class="button danger ghost" data-delete="${employee.id}">حذف منطقي</button>
        </div>
      </article>
    `).join("") || `<div class="empty-box">لا توجد نتائج مطابقة.</div>`;
    bindEmployeeActions(ref);
    app.querySelectorAll("[data-select-employee]").forEach((input) => input.addEventListener("change", () => {
      if (input.checked) selectedEmployees.add(input.dataset.selectEmployee);
      else selectedEmployees.delete(input.dataset.selectEmployee);
      input.closest(".person-card")?.classList.toggle("is-selected", input.checked);
      updateBulkBar();
    }));
    const selectAll = app.querySelector("#employee-select-all");
    if (selectAll) selectAll.checked = filtered.length > 0 && filtered.every((employee) => selectedEmployees.has(employee.id));
    updateBulkBar();
  };

  app.querySelector("#employee-filters").addEventListener("input", draw);
  app.querySelector("#employee-select-all").addEventListener("change", (event) => {
    const filtered = filterEmployees(employees);
    filtered.forEach((employee) => event.target.checked ? selectedEmployees.add(employee.id) : selectedEmployees.delete(employee.id));
    draw();
  });
  app.querySelector("[data-bulk-employee-delete]").addEventListener("click", async () => {
    if (!await confirmAction({ title: "حذف منطقي جماعي", message: `سيتم حذف ${selectedEmployees.size} موظف منطقيًا وتعطيل حساباتهم المرتبطة.`, confirmLabel: "حذف المحدد", danger: true })) return;
    await Promise.all([...selectedEmployees].map((id) => endpoints.deleteEmployee(id)));
    setMessage(`تم حذف ${selectedEmployees.size} موظف منطقيًا.`, "");
    render();
  });
  app.querySelector('[data-action="new-employee"]').addEventListener("click", () => showEmployeeEditor(ref));
  const employeeExportRows = () => filterEmployees(employees).map((e) => [e.fullName, e.phone, e.email, e.jobTitle, e.department?.name, e.manager?.fullName || ""]);
  const employeeExportHeaders = ["الاسم","الهاتف","البريد","المسمى الوظيفي","القسم","المدير المباشر"];
  app.querySelector("[data-export-employees]").addEventListener("click", () => {
    downloadFile("employees.csv", `\ufeff${toCsv([employeeExportHeaders, ...employeeExportRows()])}`, "text/csv;charset=utf-8");
  });
  app.querySelector("[data-export-employees-xls]").addEventListener("click", () => exportHtmlTable("employees.xls", employeeExportHeaders, employeeExportRows()));
  app.querySelector("[data-print-employees]").addEventListener("click", () => printReport("تقرير الموظفين", employeeExportHeaders, employeeExportRows()));
  draw();
}

function bindEmployeeActions(ref) {
  app.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => (location.hash = `employee-profile?id=${button.dataset.view}`)));
  app.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", async () => showEmployeeEditor(ref, await endpoints.employee(button.dataset.edit))));
  app.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", async () => {
    if (!await confirmAction({ title: "حذف موظف", message: "سيتم حذف الموظف منطقيًا وتعطيل حسابه المرتبط دون حذف السجل التاريخي.", confirmLabel: "حذف منطقي", danger: true })) return;
    await endpoints.deleteEmployee(button.dataset.delete);
    setMessage("تم حذف الموظف منطقيًا.", "");
    render();
  }));
}

function defaultEmployeeRefs(ref = {}, employee = null) {
  const defaultBranch = ref.branches?.[0] || {};
  const defaultRole = ref.roles?.find((role) => ["employee", "role-employee", "staff"].includes(String(role.slug || role.key || "").toLowerCase())) || ref.roles?.at(-1) || {};
  return {
    employeeCode: employee?.employeeCode || `EMP-${Date.now()}`,
    roleId: employee?.roleId || defaultRole.id || "",
    branchId: employee?.branchId || defaultBranch.id || "",
    governorateId: employee?.governorateId || defaultBranch.governorateId || ref.governorates?.[0]?.id || "",
    complexId: employee?.complexId || defaultBranch.complexId || ref.complexes?.[0]?.id || "",
    shiftId: "",
    status: "ACTIVE",
  };
}

function showEmployeeEditor(ref, employee = null) {
  const editor = app.querySelector("#employee-editor");
  const defaults = defaultEmployeeRefs(ref, employee);
  const managerOptions = ref.employees
    .filter((item) => item.id !== employee?.id)
    .map((item) => ({ id: item.id, name: `${item.fullName}${item.jobTitle ? " — " + item.jobTitle : ""}` }));
  editor.classList.remove("hidden");
  editor.innerHTML = `
    <div class="panel-head"><div><h2>${employee ? "تعديل موظف" : "إضافة موظف جديد"}</h2><p>تم تبسيط البيانات لأن النظام يعمل على فرع ومجمع واحد، والحالة دائمًا نشط.</p></div><button class="button ghost" data-close-editor>إغلاق</button></div>
    <form id="employee-form" class="editor-grid" data-password-policy="strong">
      <div class="photo-box"><div id="photo-preview">${avatar(employee || { fullName: "موظف جديد" })}</div><label>الصورة الشخصية<input name="photo" type="file" accept="image/*" /></label></div>
      <label>الاسم الكامل<input name="fullName" required value="${escapeHtml(employee?.fullName || "")}" /></label>
      <label>رقم الموبايل<input name="phone" value="${escapeHtml(employee?.phone || "")}" /></label>
      <label>البريد الإلكتروني<input name="email" type="email" value="${escapeHtml(employee?.email || "")}" /></label>
      <label>المسمى الوظيفي<input name="jobTitle" value="${escapeHtml(employee?.jobTitle || "")}" /></label>
      <label>القسم<select name="departmentId">${optionList(ref.departments, employee?.departmentId, "بدون")}</select></label>
      <label>المدير المباشر<select name="managerEmployeeId">${optionList(managerOptions, employee?.managerEmployeeId, "بدون مدير")}</select></label>
      <input type="hidden" name="employeeCode" value="${escapeHtml(defaults.employeeCode)}" />
      <input type="hidden" name="roleId" value="${escapeHtml(defaults.roleId)}" />
      <input type="hidden" name="branchId" value="${escapeHtml(defaults.branchId)}" />
      <input type="hidden" name="governorateId" value="${escapeHtml(defaults.governorateId)}" />
      <input type="hidden" name="complexId" value="${escapeHtml(defaults.complexId)}" />
      <input type="hidden" name="shiftId" value="" />
      <input type="hidden" name="status" value="ACTIVE" />
      ${employee ? "" : `<label class="check-row"><input type="checkbox" name="createUser" checked /> إنشاء حساب مستخدم مرتبط</label><label>كلمة مرور مؤقتة<input name="password" value="" placeholder="اكتب كلمة مرور قوية أو اتركه لإنشاء عشوائية" /></label>`}
      <div class="message compact span-2">تم إخفاء الفرع، المجمع، المحافظة، الكود، الدور، الحالة، والوردية من الواجهة. يتم ضبطها تلقائيًا داخليًا للحفاظ على توافق قاعدة البيانات.</div>
      <div class="form-actions wide"><button class="button primary" type="submit">حفظ الملف</button></div>
    </form>
  `;
  editor.scrollIntoView({ behavior: "smooth", block: "start" });
  const photoInput = editor.querySelector('[name="photo"]');
  photoInput.addEventListener("change", async () => {
    const file = photoInput.files?.[0];
    if (!file) return;
    const url = await endpoints.uploadAvatar(file);
    editor.querySelector("#photo-preview").innerHTML = `<img class="avatar large" src="${url}" alt="" />`;
    photoInput.dataset.uploadedUrl = url;
  });
  editor.querySelector("[data-close-editor]").addEventListener("click", () => editor.classList.add("hidden"));
  editor.querySelector("#employee-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const values = readForm(event.currentTarget);
      values.photoUrl = photoInput.dataset.uploadedUrl || employee?.photoUrl || "";
      values.status = "ACTIVE";
      values.shiftId = "";
      values.employeeCode = values.employeeCode || employee?.employeeCode || `EMP-${Date.now()}`;
      delete values.photo;
      if (employee) await endpoints.updateEmployee(employee.id, values);
      else await endpoints.createEmployee(values);
      setMessage(employee ? "تم تعديل ملف الموظف." : "تم إنشاء ملف الموظف.", "");
      render();
    } catch (error) {
      setMessage("", error.message);
      render();
    }
  });
}

async function renderEmployeeProfile() {
  const employee = await endpoints.employee(routeParams().get("id"));
  const attachments = await endpoints.attachments?.("EMPLOYEE", employee.id).catch(() => employee.attachments || []) || employee.attachments || [];
  const totalLate = (employee.attendanceDaily || []).reduce((sum, item) => sum + Number(item.lateMinutes || 0), 0);
  const locations = await endpoints.locations().then(unwrap).catch(() => []);
  const latestLocation = (locations || []).filter((item) => item.employeeId === employee.id && item.latitude && item.longitude).sort((a, b) => new Date(b.date || b.requestedAt || 0) - new Date(a.date || a.requestedAt || 0))[0];
  shell(
    `<section class="profile-layout">
      <article class="panel profile-card">
        ${avatar(employee, "large")}
        <h2>${escapeHtml(employee.fullName)}</h2>
        <p>${escapeHtml(employee.jobTitle || "-")}</p>
        <div class="profile-actions"><button class="button" data-route="employees">رجوع للقائمة</button></div>
      </article>
      <article class="panel profile-details">
        <div class="panel-head"><h2>الموقع الحالي</h2></div>
        <div class="status-location-card">
          <strong>آخر موقع مسجل</strong>
          <p>${latestLocation ? `آخر موقع مرسل: ${date(latestLocation.date || latestLocation.requestedAt)}` : "لم يرسل الموظف موقعًا حديثًا بعد."}</p>
          ${latestLocation ? `<div class="meta-grid"><span>Latitude: ${escapeHtml(latestLocation.latitude)}</span><span>Longitude: ${escapeHtml(latestLocation.longitude)}</span><span>الدقة: ${escapeHtml(latestLocation.accuracyMeters || "-")} متر</span><span>المصدر: ${escapeHtml(latestLocation.source || latestLocation.purpose || "-")}</span></div><a class="button ghost" target="_blank" rel="noopener" href="https://maps.google.com/?q=${escapeHtml(latestLocation.latitude)},${escapeHtml(latestLocation.longitude)}">فتح على الخريطة</a>` : ""}
        </div>
      </article>
      <article class="panel profile-details">
        <div class="panel-head"><h2>البيانات الأساسية</h2><span>${escapeHtml(employee.jobTitle || "")}</span></div>
        ${table(["البند", "القيمة"], [
          ["الهاتف", employee.phone], ["البريد", employee.email], ["المسمى الوظيفي", employee.jobTitle], ["القسم", employee.department?.name], ["المدير المباشر", employee.manager?.fullName], ["حساب المستخدم", employee.user ? employee.user.email : "غير مرتبط"], ["إجمالي التأخير", `${totalLate} دقيقة`],
        ].map(([key, value]) => `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(value || "-")}</td></tr>`))}
      </article>
      <article class="panel span-4"><h2>الحضور اليومي</h2>${table(["اليوم", "الحالة", "تأخير"], (employee.attendanceDaily || []).map((item) => `<tr><td>${dateOnly(item.date)}</td><td>${badge(item.status)}</td><td>${escapeHtml(item.lateMinutes || 0)} د</td></tr>`))}</article>
      <article class="panel span-4"><h2>المأموريات</h2>${table(["العنوان", "الحالة"], (employee.missions || []).map((item) => `<tr><td>${escapeHtml(item.title)}</td><td>${badge(item.status)}</td></tr>`))}</article>
      <article class="panel span-4"><h2>الإجازات والاستثناءات</h2>${table(["النوع", "الحالة"], [...(employee.leaves || []).map((item) => ({ name: item.leaveType?.name, status: item.status })), ...(employee.exceptions || []).map((item) => ({ name: item.title, status: item.status }))].map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${badge(item.status)}</td></tr>`))}</article>
      <article class="panel span-12">
        <div class="panel-head"><div><h2>المرفقات</h2><p>عقود، بطاقات، شهادات، أو أي مستند مرتبط بالموظف.</p></div><div class="toolbar"><input type="file" id="employee-attachment" /><button class="button" id="upload-employee-attachment">رفع مرفق</button></div></div>
        ${table(["الملف", "النوع", "الحجم", "التاريخ"], attachments.map((item) => `<tr><td>${item.url || item.filePath ? `<a href="${escapeHtml(item.url || item.filePath)}" target="_blank" rel="noopener">${escapeHtml(item.originalName || item.fileName)}</a>` : escapeHtml(item.originalName || item.fileName)}</td><td>${escapeHtml(item.mimeType || item.scope || "-")}</td><td>${Math.round(Number(item.sizeBytes || 0) / 1024)} KB</td><td>${date(item.createdAt)}</td></tr>`))}
      </article>
    </section>`,
    "ملف الموظف",
    "مركز موحد للبيانات الأساسية والحضور والطلبات.",
  );
  app.querySelector("[data-route=employees]")?.addEventListener("click", () => { location.hash = "employees"; });
  app.querySelector("#upload-employee-attachment")?.addEventListener("click", async () => {
    const file = app.querySelector("#employee-attachment")?.files?.[0];
    if (!file) return setMessage("", "اختر ملفًا أولًا.");
    await endpoints.uploadAttachment(file, { scope: "EMPLOYEE", entityId: employee.id, employeeId: employee.id });
    setMessage("تم رفع المرفق.", "");
    render();
  });
}

async function renderUsers() {
  const [users, ref] = await Promise.all([endpoints.users().then(unwrap), referenceData()]);
  shell(
    `<section class="stack">
      <article class="panel">
        <div class="panel-head"><div><h2>إدارة المستخدمين</h2><p>إنشاء وتعديل وتعطيل الحسابات وربطها بالموظفين والأدوار.</p></div><button class="button primary" data-new-user>إضافة مستخدم</button></div>
        <form class="filters" id="user-filters"><input name="q" placeholder="بحث بالاسم أو البريد" /><select name="roleId">${optionList(ref.roles, "", "كل الأدوار")}</select><select name="status">${optionList([{ id: "ACTIVE", name: "نشط" }, { id: "DISABLED", name: "معطل" }, { id: "LOCKED", name: "مغلق" }], "", "كل الحالات")}</select></form>
        <div id="users-table"></div>
      </article>
      <article id="user-editor" class="panel hidden"></article>
    </section>`,
    "المستخدمون",
    "إدارة حسابات الدخول مع كلمة مرور مؤقتة ودعم passkey كحالة محفوظة.",
  );
  const draw = () => {
    const values = readForm(app.querySelector("#user-filters"));
    const q = (values.q || "").toLowerCase();
    const filtered = users.filter((user) => (!q || [user.name, user.email].join(" ").toLowerCase().includes(q)) && (!values.roleId || user.roleId === values.roleId) && (!values.status || user.status === values.status));
    app.querySelector("#users-table").innerHTML = table(["المستخدم", "الدور", "الموظف", "النطاق", "آخر دخول", "الحالة", "إجراءات"], filtered.map((user) => `
      <tr>
        <td class="person-cell">${avatar(userAvatarSubject(user), "tiny")}<span>${escapeHtml(user.name || user.fullName || "مستخدم")}<small>${escapeHtml(user.email)}</small></span></td>
        <td>${escapeHtml(user.role?.name || "-")}</td>
        <td>${escapeHtml(user.employee?.fullName || "غير مرتبط")}</td>
        <td>${escapeHtml(user.branch?.name || "-")} / ${escapeHtml(user.department?.name || "-")}</td>
        <td>${date(user.lastLoginAt)}</td>
        <td>${badge(user.status)} ${user.temporaryPassword ? badge("INVITED") : ""}</td>
        <td><button class="button ghost" data-edit-user="${user.id}">تعديل</button><button class="button ghost" data-toggle-user="${user.id}">${user.status === "ACTIVE" ? "تعطيل" : "تنشيط"}</button></td>
      </tr>`));
    bindUserActions(ref);
  };
  app.querySelector("#user-filters").addEventListener("input", draw);
  app.querySelector("[data-new-user]").addEventListener("click", () => showUserEditor(ref));
  draw();
}

function bindUserActions(ref) {
  app.querySelectorAll("[data-edit-user]").forEach((button) => button.addEventListener("click", async () => {
    const users = await endpoints.users();
    showUserEditor(ref, users.find((user) => user.id === button.dataset.editUser));
  }));
  app.querySelectorAll("[data-toggle-user]").forEach((button) => button.addEventListener("click", async () => {
    const users = await endpoints.users();
    const user = users.find((item) => item.id === button.dataset.toggleUser);
    await endpoints.setUserStatus(user.id, user.status === "ACTIVE" ? "DISABLED" : "ACTIVE");
    setMessage("تم تحديث حالة المستخدم.", "");
    render();
  }));
}

function showUserEditor(ref, user = null) {
  const editor = app.querySelector("#user-editor");
  editor.classList.remove("hidden");
  editor.innerHTML = `
    <div class="panel-head"><h2>${user ? "تعديل مستخدم" : "إضافة مستخدم"}</h2><button class="button ghost" data-close-user>إغلاق</button></div>
    <form id="user-form" class="editor-grid" data-password-policy="strong">
      <div class="photo-box user-avatar-editor">
        <div id="user-avatar-preview">${avatar(userAvatarSubject(user || { name: "مستخدم جديد" }), "large")}</div>
        <label>صورة المستخدم / Avatar<input name="avatar" type="file" accept="image/png,image/jpeg,image/webp,image/gif" /></label>
        <small>يفضل صورة مربعة أقل من 2MB. تُحفظ في Bucket avatars عند استخدام Supabase.</small>
      </div>
      <label>الاسم<input name="name" required value="${escapeHtml(user?.name || user?.fullName || "")}" /></label>
      <label>البريد<input name="email" type="email" required value="${escapeHtml(user?.email || "")}" /></label>
      <label>كلمة المرور المؤقتة<input name="password" value="" placeholder="${user ? "اتركه فارغًا للإبقاء عليها" : "اكتب كلمة مرور قوية أو اتركه لإنشاء عشوائية"}" /></label>
      <label>الموظف المرتبط<select name="employeeId">${optionList(ref.employees.map((employee) => ({ id: employee.id, name: `${employee.employeeCode} - ${employee.fullName}` })), user?.employeeId, "بدون")}</select></label>
      <label>الدور<select name="roleId">${optionList(ref.roles, user?.roleId)}</select></label>
      <label>الفرع<select name="branchId">${optionList(ref.branches, user?.branchId, "بدون")}</select></label>
      <label>القسم<select name="departmentId">${optionList(ref.departments, user?.departmentId, "بدون")}</select></label>
      <label>المحافظة<select name="governorateId">${optionList(ref.governorates, user?.governorateId, "بدون")}</select></label>
      <label>المجمع<select name="complexId">${optionList(ref.complexes, user?.complexId, "بدون")}</select></label>
      <label>الحالة<select name="status">${optionList([{ id: "ACTIVE", name: "نشط" }, { id: "DISABLED", name: "معطل" }, { id: "LOCKED", name: "مغلق" }], user?.status || "ACTIVE")}</select></label>
      <label class="check-row"><input type="checkbox" name="temporaryPassword" ${user?.temporaryPassword ?? true ? "checked" : ""} /> كلمة مرور مؤقتة</label>
      <label class="check-row"><input type="checkbox" name="passkeyEnabled" ${user?.passkeyEnabled ? "checked" : ""} /> Passkey مفعلة</label>
      <div class="form-actions wide"><button class="button primary" type="submit">حفظ المستخدم</button></div>
    </form>
  `;
  editor.scrollIntoView({ behavior: "smooth", block: "start" });
  const avatarInput = editor.querySelector('[name="avatar"]');
  avatarInput?.addEventListener("change", async () => {
    try {
      const file = avatarInput.files?.[0];
      if (!file) return;
      const url = await endpoints.uploadAvatar(file);
      editor.querySelector("#user-avatar-preview").innerHTML = `<img class="avatar large" src="${escapeHtml(url)}" alt="صورة المستخدم" />`;
      avatarInput.dataset.uploadedUrl = url;
      setMessage("تم تجهيز صورة المستخدم. اضغط حفظ المستخدم لتثبيتها.", "");
    } catch (error) {
      setMessage("", error.message);
    }
  });
  editor.querySelector("[data-close-user]").addEventListener("click", () => editor.classList.add("hidden"));
  editor.querySelector("#user-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const values = readForm(event.currentTarget);
      values.avatarUrl = avatarInput?.dataset?.uploadedUrl || user?.avatarUrl || user?.photoUrl || "";
      delete values.avatar;
      if (!values.password) delete values.password;
      if (user) await endpoints.updateUser(user.id, values);
      else await endpoints.createUser(values);
      setMessage(user ? "تم تعديل المستخدم." : "تم إنشاء المستخدم.", "");
      render();
    } catch (error) {
      setMessage("", error.message);
      render();
    }
  });
}

async function enableBrowserNotifications() {
  if (!("Notification" in window)) throw new Error("الإشعارات غير مدعومة في هذا المتصفح.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("لم يتم السماح بالإشعارات.");
  await endpoints.subscribePush({ endpoint: "browser-local", permission });
  new Notification("تم تفعيل إشعارات الحضور", { body: "ستصلك تنبيهات الحضور والانصراف والطلبات المهمة." });
}

async function registerBrowserPasskey() {
  if (!window.PublicKeyCredential || !navigator.credentials?.create) throw new Error("هذا المتصفح أو هذا البروتوكول لا يدعم WebAuthn. استخدم localhost أو HTTPS.");
  const userName = state.user?.email || state.user?.fullName || "hr-user";
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "نظام الحضور والانصراف" },
      user: { id: userId, name: userName, displayName: state.user?.fullName || userName },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { userVerification: "required", residentKey: "required" },
      timeout: 60000,
      attestation: "none",
    },
  });
  const rawId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  await endpoints.registerPasskey({ credentialId: rawId, label: "مفتاح مرور لهذا الجهاز", platform: navigator.platform || "browser" });
  return rawId;
}

async function requestBrowserPasskeyForPunch() {
  if (!window.PublicKeyCredential || !navigator.credentials?.get) {
    throw new Error("بصمة الإصبع/Passkey غير مدعومة هنا. افتح النظام من موبايل يدعم البصمة أو من Chrome على localhost/HTTPS.");
  }
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  let credential;
  try {
    credential = await navigator.credentials.get({
      publicKey: {
        challenge,
        timeout: 60000,
        userVerification: "required",
      },
    });
  } catch (error) {
    throw new Error("لم يتم تأكيد بصمة الإصبع أو تم إلغاء التحقق.");
  }
  if (!credential?.rawId) throw new Error("لم يتم استلام تأكيد البصمة من الجهاز.");
  return btoa(String.fromCharCode(...new Uint8Array(credential.rawId))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function cleanAddressText(value = "") {
  const text = String(value || "").replace(/https?:\/\/\S+/gi, "").replace(/Google Maps\s*[:：]?/gi, "").replace(/[—-]\s*$/g, "").trim();
  return text || "مجمع منيل شيحة";
}

function mapsUrlForAddress(address = {}) {
  const lat = Number(address.latitude);
  const lng = Number(address.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

async function renderEmployeePunch() {
  let address;
  let events = [];
  try {
    [address, events] = await Promise.all([
      endpoints.attendanceAddress().then(unwrap),
      endpoints.myAttendanceEvents().then(unwrap).catch(() => []),
    ]);
  } catch (error) {
    shell(
      `<section class="panel empty-state-panel">
        <h2>لا يمكن فتح بصمة الموظف لهذا الحساب</h2>
        <p>${escapeHtml(error.message || "هذا الحساب غير مرتبط بملف موظف.")}</p>
        <div class="message warning">اربط هذا المستخدم بموظف من صفحة المستخدمين، أو افتح صفحة الأشخاص والموظفين وأنشئ ملف موظف بنفس البريد الإلكتروني.</div>
        <div class="toolbar spaced">
          <button class="button primary" data-route="users">فتح المستخدمين</button>
          <button class="button ghost" data-route="employees">فتح الموظفين</button>
          <button class="button ghost" data-route="route-access">فحص الصلاحيات</button>
        </div>
      </section>`,
      "بصمة الموظف",
      "يلزم ربط الحساب بملف موظف قبل تسجيل الحضور والانصراف.",
    );
    return;
  }
  const employee = address.employee || state.user?.employee || {};
  const branch = address.branch || employee.branch || {};
  const employeeEvents = (events || []).filter((event) => event.employeeId === employee.id).slice(0, 10);
  shell(
    `<section class="grid punch-page">
      <article class="panel span-6 punch-hero">
        <div class="person-cell large">${avatar(employee, "large")}<span><strong>${escapeHtml(employee.fullName || state.user?.fullName || "الموظف")}</strong><small>${escapeHtml(employee.jobTitle || "")}</small></span></div>
        <div class="address-card">
          <h2>نطاق المجمع المعتمد للبصمة</h2>
          <p>${escapeHtml(branch.name || "مجمع غير محدد")}</p>
          <strong>${escapeHtml(cleanAddressText(address.address || branch.address || "مجمع منيل شيحة"))}</strong>
          <div class="meta-grid">
            <span>Latitude: ${escapeHtml(address.latitude ?? "-")}</span>
            <span>Longitude: ${escapeHtml(address.longitude ?? "-")}</span>
            <span>النطاق: ${escapeHtml(address.radiusMeters || branch.radiusMeters || 300)} متر</span>
            <span>أقصى دقة GPS: ${escapeHtml(address.maxAccuracyMeters || 2000)} متر</span>
          </div>
          ${mapsUrlForAddress(address) ? `<a class="button ghost map-open-btn" target="_blank" rel="noopener" href="${escapeHtml(mapsUrlForAddress(address))}">فتح المجمع على Google Maps</a>` : ""}
        </div>
        <label>ملاحظات اختيارية<input id="self-punch-notes" placeholder="مثال: حضور من البوابة الرئيسية" /></label>
        <div class="biometric-box"><strong>التحقق المطلوب: بصمة الإصبع / Passkey</strong><p>لا يتم استخدام صورة سيلفي. عند الضغط على حضور أو انصراف سيطلب المتصفح بصمة الجهاز أولًا، ثم يقرأ GPS ويحفظ الموقع مع البصمة.</p><button class="button ghost" type="button" data-register-passkey>تسجيل/تحديث بصمة الجهاز</button></div>
        <div class="toolbar spaced punch-actions">
          <button class="button ghost" data-test-location>اختبار موقعي</button>
          <button class="button primary" data-self-punch="checkIn">بصمة حضور</button>
          <button class="button" data-self-punch="checkOut">بصمة انصراف</button>
        </div>
        <div id="self-punch-result" class="risk-box ${address.hasConfiguredAddress === false ? "" : "hidden"}">${address.hasConfiguredAddress === false ? "يجب ضبط إحداثيات المجمع قبل السماح بالبصمة." : ""}</div>
      </article>
      <article class="panel span-6 latest-punches-panel">
        <div class="panel-head"><div><h2>آخر بصماتي</h2><p>الحضور والانصراف لا يُحفظان إلا داخل نطاق المجمع.</p></div></div>
        ${table(["النوع", "الموقع", "المسافة", "الوقت"], employeeEvents.map((event) => `<tr><td>${badge(event.type)}</td><td>${badge(event.geofenceStatus || "unknown")}</td><td>${event.distanceFromBranchMeters != null ? `${escapeHtml(event.distanceFromBranchMeters)} متر` : "-"}</td><td>${date(event.eventAt)}</td></tr>`))}
      </article>
      <article class="panel span-12 guidance-panel">
        <h2>قواعد البصمة</h2>
        <div class="steps"><span>1. افتح الصفحة من الموبايل أو جهاز يدعم Passkey.</span><span>2. اضغط تسجيل/تحديث بصمة الجهاز أول مرة فقط.</span><span>3. عند الحضور أو الانصراف أكّد ببصمة الإصبع.</span><span>4. اسمح للمتصفح بقراءة GPS.</span><span>5. طالما أنت داخل المجمع يتم حفظ البصمة حتى لو قبل أو بعد وقت الدوام الرسمي 10ص إلى 6م.</span></div>
      </article>
    </section>`,
    "بصمة الموظف",
    "تسجيل حضور وانصراف ذاتي داخل نطاق المجمع فقط.",
  );
  const resultBox = app.querySelector("#self-punch-result");
  app.querySelector("[data-register-passkey]")?.addEventListener("click", async () => {
    try {
      await registerBrowserPasskey();
      setMessage("تم تسجيل بصمة الجهاز/Passkey بنجاح.", "");
    } catch (error) {
      setMessage("", error.message);
    }
  });
  const showResult = (title, evaluation = {}, error = false) => {
    resultBox.classList.remove("hidden");
    resultBox.innerHTML = `<strong>${escapeHtml(title)}</strong><div class="toolbar spaced">${badge(evaluation.geofenceStatus || evaluation.status || "unknown")}${evaluation.allowed || evaluation.canRecord ? badge("APPROVED") : badge("REJECTED")}</div><p>${escapeHtml(evaluation.message || evaluation.blockReason || "")}</p>${evaluation.distanceFromBranchMeters != null || evaluation.distanceMeters != null ? `<p>المسافة عن العنوان: ${escapeHtml(evaluation.distanceFromBranchMeters ?? evaluation.distanceMeters)} متر.</p>` : ""}`;
    resultBox.classList.toggle("danger-box", Boolean(error));
  };
  const readLocationAndEvaluate = async () => {
    resultBox.classList.remove("hidden");
    resultBox.textContent = "جاري قراءة الموقع الحالي بدقة عالية...";
    let current = await getBrowserLocation();
    if (current.accuracyMeters == null || Number(current.accuracyMeters) > Number(address.maxAccuracyMeters || 2000)) {
      resultBox.textContent = "دقة GPS ضعيفة، جاري إعادة المحاولة خلال ثوانٍ...";
      await new Promise((resolve) => setTimeout(resolve, 1800));
      const retry = await getBrowserLocation();
      if ((Number(retry.accuracyMeters || 999999) < Number(current.accuracyMeters || 999999)) || !current.latitude) current = retry;
    }
    const evaluation = await endpoints.evaluateGeofence({ ...current, employeeId: employee.id });
    showResult(evaluation.allowed || evaluation.canRecord ? "موقعك مقبول للبصمة" : "موقعك غير مقبول للبصمة", evaluation, !(evaluation.allowed || evaluation.canRecord));
    return { current, evaluation };
  };
  app.querySelector("[data-test-location]").addEventListener("click", () => readLocationAndEvaluate().catch((error) => showResult(error.message, { message: error.message }, true)));
  app.querySelectorAll("[data-self-punch]").forEach((button) => button.addEventListener("click", async () => {
    try {
      showResult("جاري تأكيد بصمة الإصبع", { message: "استخدم بصمة الجهاز أو Passkey لإكمال التسجيل.", geofenceStatus: "biometric_pending", allowed: true }, false);
      const passkeyCredentialId = await requestBrowserPasskeyForPunch();
      const { current, evaluation } = await readLocationAndEvaluate();
      if (!evaluation.allowed && !evaluation.canRecord) return;
      const body = { ...current, notes: app.querySelector("#self-punch-notes").value, verificationStatus: "verified", biometricMethod: "passkey", passkeyCredentialId };
      const response = button.dataset.selfPunch === "checkIn" ? await endpoints.selfCheckIn(body) : await endpoints.selfCheckOut(body);
      showResult(button.dataset.selfPunch === "checkIn" ? "تم تسجيل بصمة الحضور" : "تم تسجيل بصمة الانصراف", response.evaluation || evaluation, false);
      setMessage(button.dataset.selfPunch === "checkIn" ? "تم حفظ بصمة الحضور داخل نطاق المجمع." : "تم حفظ بصمة الانصراف داخل نطاق المجمع.", "");
      window.setTimeout(render, 900);
    } catch (error) {
      showResult("تم رفض البصمة", { message: error.message, geofenceStatus: "REJECTED" }, true);
      setMessage("", error.message);
    }
  }));
}


async function renderAttendance() {
  const filters = attendanceFiltersFromRoute();
  const queryFilters = { ...filters, limit: Math.min(filters.limit + 1, 20000) };
  const [employees, eventsPayload] = await Promise.all([endpoints.employees().then(unwrap), endpoints.attendanceEvents(queryFilters).then(unwrap)]);
  const events = filterAttendanceEvents(eventsPayload || [], filters);
  const visibleEvents = events.slice(0, filters.limit);
  const hasMore = events.length > filters.limit || (eventsPayload || []).length >= queryFilters.limit;
  const employeeOptions = employees.map((employee) => ({ id: employee.id, name: `${employee.fullName}${employee.jobTitle ? " — " + employee.jobTitle : ""}` }));
  const employeeSelect = optionList(employeeOptions);
  const employeeFilterSelect = optionList(employeeOptions, filters.employeeId, "كل الموظفين");
  const typeFilterSelect = optionList([
    { id: "CHECK_IN", name: "حضور" },
    { id: "CHECK_OUT", name: "انصراف" },
    { id: "MANUAL_ADJUSTMENT", name: "تعديل يدوي" },
    { id: "PRESENT", name: "حاضر" },
    { id: "LATE", name: "متأخر" },
    { id: "MISSION", name: "مأمورية" },
  ], filters.type, "كل الأنواع");
  const reviewFilterSelect = optionList([{ id: "approved", name: "المعتمد فقط" }, { id: "review", name: "يحتاج مراجعة" }], filters.review, "كل حالات المراجعة");
  shell(
    `<section class="grid">
      <article class="panel span-4">
        <div class="panel-head"><div><h2>تسجيل سريع</h2><p>يسجل الحركة مع الموقع الجغرافي وحالة التحقق.</p></div></div>
        <label>الموظف<select id="attendance-employee">${employeeSelect}</select></label>
        <label>ملاحظات<input id="attendance-notes" placeholder="اختياري: سبب أو توضيح" /></label>
        <label>حالة التحقق<select id="attendance-verification"><option value="verified">تم التحقق من الجهاز</option><option value="not_checked">بدون تحقق</option><option value="failed">فشل التحقق</option></select></label>
        <div class="toolbar spaced"><button class="button primary" data-attendance="checkIn">حضور</button><button class="button" data-attendance="checkOut">انصراف</button></div>
        <div id="attendance-result" class="risk-box hidden"></div>
      </article>
      <article class="panel span-8">
        <div class="panel-head"><div><h2>سجل الحضور</h2><p>التحميل الافتراضي آخر 30 يوم لتقليل الحمل، ويمكن توسيع الفترة من الفلاتر.</p></div><div class="toolbar"><button class="button ghost" data-regenerate-attendance>إعادة حساب اليوميات</button><button class="button ghost" data-export-attendance>تصدير CSV</button></div></div>
        <form id="attendance-filters" class="filters attendance-filters">
          <label>من<input name="from" type="date" value="${escapeHtml(filters.from)}" /></label>
          <label>إلى<input name="to" type="date" value="${escapeHtml(filters.to)}" /></label>
          <label>الموظف<select name="employeeId">${employeeFilterSelect}</select></label>
          <label>نوع الحركة<select name="type">${typeFilterSelect}</select></label>
          <label>المراجعة<select name="review">${reviewFilterSelect}</select></label>
          <div class="form-actions"><button class="button primary" type="submit">تطبيق الفلتر</button><button class="button ghost" type="button" data-reset-attendance-filters>آخر 30 يوم</button></div>
        </form>
        <div class="table-summary"><strong>يعرض ${escapeHtml(visibleEvents.length)} من ${escapeHtml(events.length)} حركة</strong><span>المدى: ${escapeHtml(filters.from)} إلى ${escapeHtml(filters.to)}</span></div>
        ${table(["الموظف", "النوع", "الموقع", "المراجعة", "المخاطر", "الوقت"], visibleEvents.map((event) => `<tr><td class="person-cell">${avatar(event.employee, "tiny")}<span>${escapeHtml(event.employee?.fullName || event.employeeId)}<small>${escapeHtml(event.notes || "")}</small></span></td><td>${badge(event.type)}</td><td>${badge(event.geofenceStatus || "unknown")}<small>${event.distanceFromBranchMeters != null ? `${event.distanceFromBranchMeters} متر` : ""}</small></td><td>${event.requiresReview ? badge("PENDING") : badge("APPROVED")}</td><td>${(event.riskFlags || []).length ? event.riskFlags.map((flag) => `<span class="status">${escapeHtml(flag)}</span>`).join(" ") : `<span class="status ACTIVE">آمن</span>`}</td><td>${date(event.eventAt)}</td></tr>`), "attendance-table")}
        ${hasMore ? `<div class="load-more-row"><button class="button ghost" data-attendance-more>عرض 500 حركة أخرى</button><small>استخدم فلاتر أضيق عند السجلات الكبيرة جدًا.</small></div>` : ""}
      </article>
      <article class="panel span-12">
        <div class="panel-head"><div><h2>طلب تعديل حضور</h2><p>يتم حفظه في مركز الطلبات وسجل التدقيق</p></div></div>
        ${simpleForm("adjust-form", [["employeeId", "الموظف", "select", employeeSelect], ["title", "نوع الطلب", "select", optionList([{ name: "نسيان بصمة حضور" }, { name: "نسيان بصمة انصراف" }, { name: "تعديل تأخير" }])], ["reason", "السبب", "textarea"]], "إرسال الطلب")}
        <hr class="soft-separator" />
        <h3>تعديل يدوي مباشر بصلاحية HR</h3>
        <form id="manual-attendance-form" class="form-grid compact-form"><label>الموظف<select name="employeeId">${employeeSelect}</select></label><label>نوع الحركة<select name="type"><option value="CHECK_IN">حضور</option><option value="CHECK_OUT">انصراف</option><option value="MANUAL_ADJUSTMENT">تعديل يدوي</option></select></label><label>التاريخ والوقت<input type="datetime-local" name="eventAt" /></label><label>السبب<input name="reason" required /></label><div class="form-actions"><button class="button">حفظ تعديل يدوي</button></div></form>
      </article>
    </section>`,
    "الحضور",
    "تسجيل ومراجعة أحداث الحضور مع تقييم الموقع والقواعد.",
  );
  app.querySelector("#attendance-filters").addEventListener("submit", (event) => {
    event.preventDefault();
    setRouteQuery("attendance", { ...readForm(event.currentTarget), limit: 500 });
  });
  app.querySelector("[data-reset-attendance-filters]").addEventListener("click", () => setRouteQuery("attendance", {}));
  app.querySelector("[data-attendance-more]")?.addEventListener("click", () => setRouteQuery("attendance", { ...filters, limit: filters.limit + 500 }));

  const recordAttendance = async (action) => {
    const resultBox = app.querySelector("#attendance-result");
    try {
      resultBox.classList.remove("hidden");
      resultBox.classList.remove("danger-box");
      resultBox.textContent = "جاري قراءة الموقع وتقييم الحركة...";
      const location = await getBrowserLocation();
      const body = { employeeId: app.querySelector("#attendance-employee").value, notes: app.querySelector("#attendance-notes").value, verificationStatus: app.querySelector("#attendance-verification").value, ...location };
      const response = action === "checkIn" ? await endpoints.checkIn(body) : await endpoints.checkOut(body);
      const evaluation = response.evaluation || response.event?.evaluation || {};
      resultBox.innerHTML = `<strong>${evaluation.requiresReview ? "الحركة تحتاج مراجعة" : "الحركة مقبولة داخل نطاق المجمع"}</strong><div class="toolbar spaced">${badge(evaluation.type || response.type)}${badge(evaluation.geofenceStatus || response.geofenceStatus)}${badge(evaluation.verificationStatus || response.verificationStatus)}</div><p>${evaluation.distanceFromBranchMeters != null || response.distanceFromBranchMeters != null ? `المسافة عن الفرع: ${escapeHtml(evaluation.distanceFromBranchMeters ?? response.distanceFromBranchMeters)} متر.` : "تم التحقق من نطاق المجمع."}</p>`;
      setMessage(action === "checkIn" ? "تم تسجيل الحضور داخل نطاق المجمع." : "تم تسجيل الانصراف داخل نطاق المجمع.", "");
      window.setTimeout(render, 900);
    } catch (error) {
      resultBox.classList.remove("hidden");
      resultBox.classList.add("danger-box");
      resultBox.innerHTML = `<strong>تم رفض البصمة</strong><p>${escapeHtml(error.message)}</p>`;
      setMessage("", error.message);
    }
  };

  app.querySelector('[data-attendance="checkIn"]').addEventListener("click", () => recordAttendance("checkIn"));
  app.querySelector('[data-attendance="checkOut"]').addEventListener("click", () => recordAttendance("checkOut"));
  app.querySelector("#adjust-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await endpoints.adjustAttendance(readForm(event.currentTarget));
    setMessage("تم إرسال طلب تعديل الحضور.", "");
    render();
  });
  app.querySelector("#manual-attendance-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await endpoints.manualAttendance(readForm(event.currentTarget));
    setMessage("تم حفظ التعديل اليدوي وإعادة حساب اليوميات.", "");
    render();
  });
  app.querySelector("[data-regenerate-attendance]").addEventListener("click", async () => {
    const result = await endpoints.regenerateAttendance({});
    setMessage(`تمت إعادة حساب ${result.generated || 0} سجل يومي.`, "");
    render();
  });
  app.querySelector("[data-export-attendance]").addEventListener("click", () => {
    const rows = [["الموظف","النوع","الوقت","الموقع","المراجعة"], ...events.map((e) => [e.employee?.fullName || e.employeeId, statusLabel(e.type), e.eventAt, statusLabel(e.geofenceStatus), e.requiresReview ? "نعم" : "لا"])];
    downloadFile(`attendance-${filters.from || "all"}-${filters.to || "all"}.csv`, `\ufeff${toCsv(rows)}`, "text/csv;charset=utf-8");
  });
}

async function renderAttendanceCalendar() {
  const [employees, daily, events] = await Promise.all([endpoints.employees().then(unwrap), endpoints.attendanceDaily().then(unwrap), endpoints.attendanceEvents().then(unwrap)]);
  const employeeId = routeParams().get("employeeId") || employees[0]?.id || "";
  const employee = employees.find((item) => item.id === employeeId);
  const days = Array.from({ length: 31 }).map((_, index) => {
    const d = new Date();
    d.setDate(d.getDate() - (30 - index));
    const key = d.toISOString().slice(0, 10);
    const record = daily.find((item) => item.employeeId === employeeId && String(item.date).startsWith(key));
    const event = events.find((item) => item.employeeId === employeeId && String(item.eventAt).startsWith(key));
    return { key, status: record?.status || event?.type || "ABSENT", lateMinutes: record?.lateMinutes || event?.lateMinutes || 0 };
  });
  shell(
    `<section class="stack">
      <article class="panel">
        <div class="panel-head"><div><h2>تقويم حضور ${escapeHtml(employee?.fullName || "")}</h2><p>آخر 31 يوم</p></div><select id="calendar-employee">${optionList(employees.map((e) => ({ id: e.id, name: `${e.employeeCode} - ${e.fullName}` })), employeeId)}</select></div>
        <div class="calendar-grid">${days.map((day) => `<div class="calendar-day ${day.status}"><strong>${dateOnly(day.key)}</strong>${badge(day.status)}<small>${day.lateMinutes ? `${day.lateMinutes} دقيقة تأخير` : ""}</small></div>`).join("")}</div>
      </article>
    </section>`,
    "تقويم الحضور",
    "رؤية شهرية سريعة لحضور كل موظف.",
  );
  app.querySelector("#calendar-employee").addEventListener("change", (event) => {
    location.hash = `attendance-calendar?employeeId=${event.target.value}`;
  });
}

async function renderMissions() {
  const [employees, missions] = await Promise.all([endpoints.employees().then(unwrap), endpoints.missions().then(unwrap)]);
  const employeeSelect = optionList(employees.map((employee) => ({ id: employee.id, name: `${employee.employeeCode} - ${employee.fullName}` })));
  shell(
    `<section class="grid">
      <article class="panel span-4"><h2>مأمورية جديدة</h2>${simpleForm("mission-form", [["employeeId", "الموظف", "select", employeeSelect], ["title", "العنوان"], ["destinationName", "الوجهة"], ["plannedStart", "البداية", "datetime-local"], ["plannedEnd", "النهاية", "datetime-local"]], "إنشاء")}</article>
      <article class="panel span-8"><h2>المأموريات</h2>${table(["العنوان", "الموظف", "الوجهة", "الحالة", "إجراءات"], missions.map((mission) => `<tr><td>${escapeHtml(mission.title)}</td><td>${escapeHtml(mission.employee?.fullName || "-")}</td><td>${escapeHtml(mission.destinationName)}</td><td>${badge(mission.status)}</td><td><button class="button ghost" data-mission="${mission.id}" data-action-name="approve">اعتماد</button><button class="button ghost" data-mission="${mission.id}" data-action-name="complete">إكمال</button><button class="button danger ghost" data-mission="${mission.id}" data-action-name="reject">رفض</button></td></tr>`))}</article>
    </section>`,
    "المأموريات",
    "إنشاء واعتماد وإكمال المأموريات مع Timeline داخلي.",
  );
  app.querySelector("#mission-form").addEventListener("submit", submitForm(endpoints.createMission, "تم إنشاء المأمورية."));
  app.querySelectorAll("[data-mission]").forEach((button) => button.addEventListener("click", async () => {
    await endpoints.updateMission(button.dataset.mission, button.dataset.actionName);
    setMessage("تم تحديث المأمورية.", "");
    render();
  }));
}

async function renderLeaves() {
  const [employees, leaves] = await Promise.all([endpoints.employees().then(unwrap), endpoints.leaves().then(unwrap)]);
  const employeeSelect = optionList(employees.map((employee) => ({ id: employee.id, name: `${employee.employeeCode} - ${employee.fullName}` })));
  shell(
    `<section class="grid">
      <article class="panel span-4"><h2>طلب إجازة</h2>${simpleForm("leave-form", [["employeeId", "الموظف", "select", employeeSelect], ["leaveType", "نوع الإجازة", "select", optionList([{ name: "اعتيادية" }, { name: "مرضية" }, { name: "طارئة" }])], ["startDate", "من", "date"], ["endDate", "إلى", "date"], ["reason", "السبب"]], "إرسال")}</article>
      <article class="panel span-8"><h2>طلبات الإجازة</h2>${table(["الموظف", "النوع", "من", "إلى", "الحالة", "إجراءات"], leaves.map((leave) => `<tr><td>${escapeHtml(leave.employee?.fullName || "-")}</td><td>${escapeHtml(leave.leaveType?.name)}</td><td>${dateOnly(leave.startDate)}</td><td>${dateOnly(leave.endDate)}</td><td>${badge(leave.status)}</td><td><button class="button ghost" data-leave="${leave.id}" data-action-name="approve">اعتماد</button><button class="button danger ghost" data-leave="${leave.id}" data-action-name="reject">رفض</button></td></tr>`))}</article>
    </section>`,
    "الإجازات",
    "إرسال واعتماد ورفض طلبات الإجازة.",
  );
  app.querySelector("#leave-form").addEventListener("submit", submitForm(endpoints.createLeave, "تم إرسال طلب الإجازة."));
  app.querySelectorAll("[data-leave]").forEach((button) => button.addEventListener("click", async () => {
    await endpoints.updateLeave(button.dataset.leave, button.dataset.actionName);
    setMessage("تم تحديث طلب الإجازة.", "");
    render();
  }));
}

async function renderRequests() {
  const [leaves, missions, exceptions, locations] = await Promise.all([endpoints.leaves().then(unwrap), endpoints.missions().then(unwrap), endpoints.exceptions().then(unwrap), endpoints.locations().then(unwrap)]);
  const rows = [
    ...leaves.map((item) => ({ ...item, kind: "leave", label: item.leaveType?.name || "إجازة" })),
    ...missions.map((item) => ({ ...item, kind: "mission", label: item.title || "مأمورية" })),
    ...exceptions.map((item) => ({ ...item, kind: "exception", label: item.title || "استثناء حضور" })),
    ...locations.filter((item) => item.purpose).map((item) => ({ ...item, kind: "location", label: item.purpose || "طلب موقع" })),
  ].sort((a, b) => new Date(b.createdAt || b.requestedAt || 0) - new Date(a.createdAt || a.requestedAt || 0));
  shell(
    `<section class="panel">
      <div class="panel-head"><div><h2>مركز الطلبات</h2><p>Workflow موحد للإجازات والمأموريات والاستثناءات وطلبات الموقع</p></div></div>
      ${table(["النوع", "العنوان", "الموظف", "الحالة", "Timeline", "إجراءات"], rows.map((item) => `<tr><td>${escapeHtml(item.kind)}</td><td>${escapeHtml(item.label)}</td><td>${escapeHtml(item.employee?.fullName || "-")}</td><td>${badge(item.status)}</td><td>${(item.workflow || []).slice(-3).map((step) => `<small>${escapeHtml(step.action)} - ${date(step.at)}</small>`).join("<br>")}</td><td>${item.status === "PENDING" ? `<button class="button ghost" data-request="${item.kind}:${item.id}" data-action-name="approve">اعتماد</button><button class="button danger ghost" data-request="${item.kind}:${item.id}" data-action-name="reject">رفض</button>` : ""}</td></tr>`))}
    </section>`,
    "مركز الطلبات",
    "مراجعة واعتماد ورفض كل الطلبات من مكان واحد.",
  );
  app.querySelectorAll("[data-request]").forEach((button) => button.addEventListener("click", async () => {
    const [kind, id] = button.dataset.request.split(":");
    const action = button.dataset.actionName;
    if (kind === "leave") await endpoints.updateLeave(id, action);
    else if (kind === "mission") await endpoints.updateMission(id, action);
    else if (kind === "exception") await endpoints.updateException(id, action);
    else if (kind === "location") await endpoints.updateLocationRequest(id, { status: action === "reject" ? "REJECTED" : "APPROVED" });
    setMessage("تم تحديث الطلب.", "");
    render();
  }));
}

async function renderOrganization() {
  const ref = await referenceData();
  const config = [
    ["governorates", "المحافظات", ref.governorates, [["code","الكود"], ["name","الاسم"]]],
    ["complexes", "المجمعات", ref.complexes, [["code","الكود"], ["name","الاسم"], ["governorateId","المحافظة","select", optionList(ref.governorates)]]],
    ["branches", "الفروع", ref.branches, [["code","الكود"], ["name","الاسم"], ["governorateId","المحافظة","select", optionList(ref.governorates)], ["complexId","المجمع","select", optionList(ref.complexes)], ["address","العنوان"], ["latitude","Lat","number"], ["longitude","Lng","number"], ["geofenceRadiusMeters","نطاق الحضور/متر","number"]]],
    ["departments", "الأقسام", ref.departments, [["code","الكود"], ["name","الاسم"], ["branchId","الفرع","select", optionList(ref.branches)], ["managerEmployeeId","المدير","select", optionList(ref.employees.map((e) => ({ id: e.id, name: e.fullName })), "", "بدون")]]],
  ];
  shell(
    `<section class="grid">${config.map(([kind, title, items, fields]) => `
      <article class="panel span-6">
        <div class="panel-head"><div><h2>${escapeHtml(title)}</h2><p>CRUD فعلي مع حذف منطقي</p></div></div>
        ${simpleOrgForm(kind, fields)}
        ${table(["الاسم", "الكود", "الحالة", "إجراءات"], items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.code || "-")}</td><td>${badge(item.active === false ? "INACTIVE" : "ACTIVE")}</td><td><button class="button ghost" data-edit-org="${kind}:${item.id}">تعديل</button><button class="button danger ghost" data-delete-org="${kind}:${item.id}">تعطيل</button></td></tr>`))}
      </article>`).join("")}</section>`,
    "الفروع والأقسام",
    "إدارة الهيكل الإداري الأساسي: محافظات، مجمعات، فروع، أقسام.",
  );
  config.forEach(([kind, _title, _items, fields]) => {
    app.querySelector(`#form-${kind}`).addEventListener("submit", async (event) => {
      event.preventDefault();
      await endpoints.saveOrg(kind, readForm(event.currentTarget));
      setMessage("تم حفظ العنصر التنظيمي.", "");
      render();
    });
  });
  app.querySelectorAll("[data-use-current-location]").forEach((button) => button.addEventListener("click", async () => {
    try {
      const current = await getBrowserLocation();
      const form = button.closest("form");
      if (current.latitude != null && form.elements.latitude) form.elements.latitude.value = current.latitude;
      if (current.longitude != null && form.elements.longitude) form.elements.longitude.value = current.longitude;
      if (form.elements.geofenceRadiusMeters && !form.elements.geofenceRadiusMeters.value) form.elements.geofenceRadiusMeters.value = 200;
      setMessage("تم وضع موقعك الحالي كعنوان حضور للفرع. اضغط حفظ لتثبيته.", "");
    } catch (error) {
      setMessage("", error.message);
    }
  }));
  app.querySelectorAll("[data-edit-org]").forEach((button) => button.addEventListener("click", async () => {
    const [kind, id] = button.dataset.editOrg.split(":");
    const items = await endpoints.listOrg(kind);
    const item = items.find((row) => row.id === id);
    const form = app.querySelector(`#form-${kind}`);
    Object.entries(item || {}).forEach(([key, value]) => {
      if (form.elements[key]) form.elements[key].value = value ?? "";
    });
    form.elements.id.value = id;
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  }));
  app.querySelectorAll("[data-delete-org]").forEach((button) => button.addEventListener("click", async () => {
    const [kind, id] = button.dataset.deleteOrg.split(":");
    await endpoints.deleteOrg(kind, id);
    setMessage("تم تعطيل العنصر تنظيميًا.", "");
    render();
  }));
}

function simpleOrgForm(kind, fields) {
  const locationButton = kind === "branches" ? `<button class="button ghost" type="button" data-use-current-location="${kind}">استخدم موقعي الحالي كعنوان للفرع</button>` : "";
  return `<form id="form-${kind}" class="form-grid compact-form"><input type="hidden" name="id" />${fields.map(([name, label, type = "text", opts = ""]) => `<label>${escapeHtml(label)}${type === "select" ? `<select name="${name}">${opts}</select>` : `<input name="${name}" type="${type}" step="any" />`}</label>`).join("")}<div class="form-actions">${locationButton}<button class="button primary" type="submit">حفظ</button></div></form>`;
}

async function renderRoles() {
  const [roles, rawPermissions] = await Promise.all([endpoints.roles().then(unwrap), endpoints.permissions().then(unwrap)]);
  const permissions = rawPermissions.filter((p) => !String(p.scope || "").includes("payroll"));
  shell(
    `<section class="grid">
      <article class="panel span-5">
        <div class="panel-head"><div><h2>دور جديد / تعديل</h2><p>صلاحيات دقيقة قابلة للتخصيص</p></div></div>
        <form id="role-form" class="form-grid">
          <input type="hidden" name="id" />
          <label>اسم الدور<input name="name" required /></label>
          <label>الكود<input name="key" required /></label>
          <label>الوصف<input name="description" /></label>
          <div class="permissions-list">${permissions.map((p) => `<label class="check-row"><input type="checkbox" name="perm" value="${escapeHtml(p.scope)}" /> ${escapeHtml(p.name)}</label>`).join("")}</div>
          <div class="form-actions"><button class="button primary" type="submit">حفظ الدور</button></div>
        </form>
      </article>
      <article class="panel span-7">
        <h2>الأدوار الحالية</h2>
        ${table(["الدور", "الكود", "عدد الصلاحيات", "إجراءات"], roles.map((role) => `<tr><td>${escapeHtml(role.name)}</td><td>${escapeHtml(role.key || role.slug)}</td><td>${escapeHtml(role.permissions?.length || 0)}</td><td><button class="button ghost" data-edit-role="${role.id}">تعديل</button></td></tr>`))}
      </article>
    </section>`,
    "الأدوار والصلاحيات",
    "RBAC عملي لاستخدامه في تنظيم الوصول للنظام.",
  );
  app.querySelector("#role-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = readForm(form);
    values.permissions = [...form.querySelectorAll('[name="perm"]:checked')].map((input) => input.value);
    await endpoints.saveRole(values);
    setMessage("تم حفظ الدور والصلاحيات.", "");
    render();
  });
  app.querySelectorAll("[data-edit-role]").forEach((button) => button.addEventListener("click", () => {
    const role = roles.find((item) => item.id === button.dataset.editRole);
    const form = app.querySelector("#role-form");
    form.elements.id.value = role.id;
    form.elements.name.value = role.name || "";
    form.elements.key.value = role.key || role.slug || "";
    form.elements.description.value = role.description || "";
    form.querySelectorAll('[name="perm"]').forEach((input) => { input.checked = (role.permissions || []).includes(input.value); });
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  }));
}

async function renderOrgChart() {
  const employees = await endpoints.employees().then(unwrap);
  const roots = employees.filter((e) => !e.managerEmployeeId);
  const childrenOf = (id) => employees.filter((e) => e.managerEmployeeId === id);
  const node = (employee, depth = 0) => `<div class="org-node" style="--depth:${depth}">${avatar(employee, "tiny")}<span><strong>${escapeHtml(employee.fullName)}</strong><small>${escapeHtml(employee.jobTitle || "")}</small></span></div>${childrenOf(employee.id).map((child) => node(child, depth + 1)).join("")}`;
  shell(`<section class="panel"><div class="panel-head"><div><h2>الهيكل الوظيفي</h2><p>حسب المدير المباشر المسجل في ملفات الموظفين</p></div></div><div class="org-chart">${roots.map((employee) => node(employee)).join("")}</div></section>`, "الهيكل الوظيفي", "عرض علاقات المديرين والفرق.");
}

async function renderLocations() {
  const [employees, rawLocations] = await Promise.all([endpoints.employees().then(unwrap), endpoints.locations().then(unwrap).catch(() => [])]);
  const locations = safeList(rawLocations);
  const byEmployee = new Map(employees.map((employee) => [employee.id, employee]));
  const enrichedLocations = locations.map((item) => ({ ...item, employee: item.employee || byEmployee.get(item.employeeId) || null }));
  const latestFor = (employeeId) => enrichedLocations
    .filter((item) => item.employeeId === employeeId && item.latitude && item.longitude)
    .sort((a, b) => new Date(b.date || b.createdAt || b.requestedAt || 0) - new Date(a.date || a.createdAt || a.requestedAt || 0))[0];
  const pendingFor = (employeeId) => enrichedLocations
    .filter((item) => item.employeeId === employeeId && String(item.status || "").toUpperCase() === "PENDING")
    .sort((a, b) => new Date(b.requestedAt || b.createdAt || 0) - new Date(a.requestedAt || a.createdAt || 0))[0];
  const currentEmployeeId = state.user?.employeeId || state.user?.employee?.id || "";
  const employeeCards = employees.map((employee) => {
    const latest = latestFor(employee.id);
    const pending = pendingFor(employee.id);
    const employeeEvents = enrichedLocations
      .filter((item) => item.employeeId === employee.id)
      .sort((a, b) => new Date(b.date || b.createdAt || b.requestedAt || 0) - new Date(a.date || a.createdAt || a.requestedAt || 0))
      .slice(0, 8);
    return `<article class="employee-location-card" data-location-card="${escapeHtml(employee.id)}">
      <button class="location-card-head" type="button" data-toggle-location-details="${escapeHtml(employee.id)}">
        ${avatar(employee, "medium")}
        <span><strong>${escapeHtml(employee.fullName || "-")}</strong><small>${escapeHtml(employee.jobTitle || employee.phone || "")}</small></span>
        ${pending ? badge("طلب مفتوح") : badge(latest ? "آخر موقع موجود" : "لا يوجد موقع")}
      </button>
      <div class="location-card-actions">
        <button class="button primary" type="button" data-request-live-location="${escapeHtml(employee.id)}">إشعار فتح الموقع وإرسال اللوكيشن</button>
        ${employee.id === currentEmployeeId ? `<button class="button ghost" type="button" data-send-my-location>إرسال موقعي الآن</button>` : ""}
      </div>
      <div class="location-details hidden" id="location-details-${escapeHtml(employee.id)}">
        <div class="meta-grid">
          <span>الاسم: ${escapeHtml(employee.fullName || "-")}</span>
          <span>المسمى: ${escapeHtml(employee.jobTitle || "-")}</span>
          <span>الهاتف: ${escapeHtml(employee.phone || "-")}</span>
          <span>البريد: ${escapeHtml(employee.email || "-")}</span>
          <span>المدير المباشر: ${escapeHtml(employee.manager?.fullName || "-")}</span>
          <span>آخر تحديث: ${latest ? date(latest.date || latest.createdAt || latest.requestedAt) : "لا يوجد"}</span>
        </div>
        ${latest ? `<div class="map-line"><span>Lat: ${escapeHtml(latest.latitude)}</span><span>Lng: ${escapeHtml(latest.longitude)}</span><span>الدقة: ${escapeHtml(latest.accuracyMeters || "-")} متر</span><a class="button ghost" target="_blank" rel="noopener" href="https://maps.google.com/?q=${escapeHtml(latest.latitude)},${escapeHtml(latest.longitude)}">فتح على Google Maps</a></div>` : `<div class="empty-box">لم يرسل هذا الموظف موقعًا مباشرًا بعد.</div>`}
        ${table(["النوع", "الحالة", "الوقت", "الموقع"], employeeEvents.map((item) => `<tr><td>${escapeHtml(item.latitude ? "موقع مباشر" : "طلب موقع")}</td><td>${badge(item.status || "ACTIVE")}</td><td>${date(item.date || item.createdAt || item.requestedAt)}</td><td>${item.latitude && item.longitude ? `${escapeHtml(item.latitude)}, ${escapeHtml(item.longitude)}` : "بانتظار الإرسال"}</td></tr>`))}
      </div>
    </article>`;
  }).join("");
  shell(
    `<section class="grid locations-page">
      <article class="panel span-12 accent-panel">
        <div class="panel-head"><div><h2>طلبات وسجل المواقع</h2><p>كل موظف يظهر باسمه وصورته. اضغط على الموظف لعرض التفاصيل وآخر المواقع.</p></div></div>
        <div class="message compact">لا يتم طلب سبب أو غرض. الإجراء يرسل إشعارًا مباشرًا للموظف لفتح صفحة الموقع وإرسال اللوكيشن الحالي.</div>
        ${currentEmployeeId ? `<div class="toolbar spaced"><button class="button primary" type="button" data-send-my-location>إرسال موقعي الحالي الآن</button></div>` : ""}
      </article>
      <article class="panel span-12">
        <div class="employee-location-grid">${employeeCards || `<div class="empty-state">لا يوجد موظفون مسجلون.</div>`}</div>
      </article>
    </section>`,
    "طلبات وسجل المواقع",
    "إشعار الموظفين لإرسال اللوكيشن المباشر ومراجعة سجل المواقع بدون سبب أو غرض.",
  );
  app.querySelectorAll("[data-toggle-location-details]").forEach((button) => button.addEventListener("click", () => {
    const id = button.dataset.toggleLocationDetails;
    app.querySelector(`#location-details-${CSS.escape(id)}`)?.classList.toggle("hidden");
  }));
  const sendMyLocation = async () => {
    const employeeId = state.user?.employeeId || state.user?.employee?.id;
    if (!employeeId) throw new Error("هذا الحساب غير مربوط بملف موظف لإرسال الموقع.");
    const current = await getBrowserLocation();
    if (!current.latitude || !current.longitude) throw new Error("تعذر قراءة الموقع الحالي. فعّل GPS ثم حاول مرة أخرى.");
    await endpoints.recordLocation({ ...current, employeeId, source: "direct_live_location", status: "ACTIVE" });
    setMessage("تم إرسال موقعك الحالي بنجاح.", "");
    render();
  };
  app.querySelectorAll("[data-send-my-location]").forEach((button) => button.addEventListener("click", () => sendMyLocation().catch((error) => setMessage("", error.message))));
  app.querySelectorAll("[data-request-live-location]").forEach((button) => button.addEventListener("click", async () => {
    const employee = byEmployee.get(button.dataset.requestLiveLocation);
    await endpoints.createLocationRequest({
      employeeId: button.dataset.requestLiveLocation,
      purpose: "فتح الموقع وإرسال اللوكيشن المباشر",
      title: "فتح الموقع وإرسال اللوكيشن المباشر",
      requestReason: "",
      status: "PENDING",
    });
    setMessage(`تم إرسال إشعار فتح الموقع وإرسال اللوكيشن إلى ${employee?.fullName || "الموظف"}.`, "");
    render();
  }));
}

async function renderKpi() {
  const payload = unwrap(await endpoints.kpi());
  const ref = await referenceData();
  const employees = (payload.accessMode === "all" ? ref.employees : (ref.employees || []).filter((employee) => employee.id === payload.currentEmployeeId || (payload.pendingEmployees || []).some((item) => item.id === employee.id) || (payload.evaluations || []).some((item) => item.employeeId === employee.id))) || [];
  const policy = payload.policy || {};
  const cycle = payload.cycle || {};
  const criteria = payload.criteria || [];
  const evaluations = payload.evaluations || payload.summaries || [];
  const pendingEmployees = payload.pendingEmployees || [];
  const isSelf = payload.accessMode === "self";
  const isTeam = payload.accessMode === "team";
  const employeeOptions = optionList(employees.map((employee) => ({ id: employee.id, name: `${employee.employeeCode || ""} - ${employee.fullName}` })), isSelf ? payload.currentEmployeeId : "", isSelf ? "" : "اختر الموظف");
  const managerOptions = optionList(ref.employees.map((employee) => ({ id: employee.id, name: `${employee.employeeCode || ""} - ${employee.fullName}` })), state.user?.employeeId || "", "المدير المباشر من ملف الموظف");
  const metricCards = (payload.metrics || []).map((metric) => `<article class="metric span-3"><span>${escapeHtml(metric.label)}</span><strong>${escapeHtml(metric.value)}</strong><small>${escapeHtml(metric.helper || "")}</small></article>`).join("");
  shell(
    `<section class="grid kpi-page">
      <article class="panel span-12 accent-panel">
        <div class="panel-head">
          <div>
            <h2>${isSelf ? "تقييمي الذاتي الشهري" : isTeam ? "تقييمات الفريق المباشر" : "نموذج تقييم الأداء الشهري المعتمد"}</h2>
            <p>${escapeHtml(policy.description || "يبدأ التقييم من يوم 20 وينتهي يوم 25 من نفس الشهر.")}</p>
          </div>
          ${payload.accessMode === "all" ? `<button class="button primary" id="recompute-kpi">تجهيز تقييمات ناقصة</button>` : ""}
        </div>
        <div class="kpi-policy-strip">
          <span>بداية التقييم: يوم ${escapeHtml(policy.evaluationStartDay || 20)}</span>
          <span>نهاية التقييم: يوم ${escapeHtml(policy.evaluationEndDay || 25)}</span>
          <span>آخر موعد للتسليم: يوم ${escapeHtml(policy.submissionDeadlineDay || 25)}</span>
          <span>الموظف يرفع تقييمه للمدير المباشر ثم يعتمد المدير أو يعدل قبل التسليم</span>
        </div>
      </article>
      ${metricCards}
      <article class="panel span-5">
        <h2>${isSelf ? "إرسال تقييمي لمديري المباشر" : "إدخال / تعديل تقييم"}</h2>
        <form id="kpi-form" class="form-grid compact-form">
          <label>الموظف<select name="employeeId" required ${isSelf ? "disabled" : ""}>${employeeOptions}</select></label>
          ${isSelf ? `<input type="hidden" name="employeeId" value="${escapeHtml(payload.currentEmployeeId || "")}" />` : ""}
          <label>المدير المباشر<select name="managerEmployeeId" ${isSelf ? "disabled" : ""}>${managerOptions}</select></label>
          ${isSelf ? `<input type="hidden" name="managerEmployeeId" value="${escapeHtml(state.user?.employee?.managerEmployeeId || "")}" />` : ""}
          <label>تاريخ الجلسة<input name="evaluationDate" type="date" value="${escapeHtml(cycle.startsOn || new Date().toISOString().slice(0, 10))}" required /></label>
          <label>حالة التقييم<select name="status">${optionList(isSelf ? [{ value: "SUBMITTED", name: "رفع للمدير المباشر" }] : [{ value: "DRAFT", name: "مسودة" }, { value: "SUBMITTED", name: "تم الاستلام من الموظف" }, { value: "APPROVED", name: "اعتماد وتسليم" }], isSelf ? "SUBMITTED" : "APPROVED")}</select></label>
          <label>تحقيق الأهداف / 40<input name="targetScore" type="number" min="0" max="40" step="0.5" value="0" /></label>
          <label>الكفاءة في أداء المهام / 20<input name="efficiencyScore" type="number" min="0" max="20" step="0.5" value="0" /></label>
          <label>الالتزام بمواعيد العمل / 20<input name="attendanceScore" type="number" min="0" max="20" step="0.5" placeholder="يحسب تلقائيًا إن تُرك فارغًا" /></label>
          <label>حسن التعامل / 5<input name="conductScore" type="number" min="0" max="5" step="0.5" value="0" /></label>
          <label>الصلاة في المسجد / 5<input name="prayerScore" type="number" min="0" max="5" step="0.5" value="0" /></label>
          <label>حلقة الشيخ وليد يوسف / 5<input name="quranCircleScore" type="number" min="0" max="5" step="0.5" value="0" /></label>
          <label>التبرعات والمبادرات / 5<input name="initiativesScore" type="number" min="0" max="5" step="0.5" value="0" /></label>
          <label class="span-2">${isSelf ? "ملاحظات الموظف" : "ملاحظات المدير"}<textarea name="${isSelf ? "employeeNotes" : "managerNotes"}" placeholder="${isSelf ? "اكتب ملخص تقييمك الذاتي وما تم الاتفاق عليه مع المدير" : "ملخص جلسة التقييم ونقاط التحسين"}"></textarea></label>
          <label class="checkbox-row"><input name="meetingHeld" type="checkbox" checked /> تمت جلسة التقييم بين الموظف ومديره المباشر</label>
          <div class="form-actions"><button class="button primary" type="submit">${isSelf ? "رفع التقييم للمدير" : "حفظ / اعتماد التقييم"}</button></div>
        </form>
      </article>
      <article class="panel span-7">
        <div class="panel-head"><div><h2>معايير التقييم</h2><p>إجمالي النموذج 100 درجة</p></div><strong>${escapeHtml(cycle.name || "الدورة الحالية")}</strong></div>
        ${table(["المعيار", "الدرجة", "النوع", "الوصف"], criteria.map((item) => `<tr><td><strong>${escapeHtml(item.name)}</strong></td><td>${escapeHtml(item.maxScore || item.weight || item.weightPercentage)} درجة</td><td>${escapeHtml(item.parentCode || item.scoringType || "-")}</td><td>${escapeHtml(item.description || "-")}</td></tr>`))}
      </article>
      <article class="panel span-12">
        <div class="panel-head"><div><h2>${isSelf ? "تقييمي الحالي" : "تقييمات الدورة الحالية"}</h2><p>آخر موعد لتسليم التقييمات يوم 25 من الشهر</p></div>${payload.accessMode !== "self" ? `<button class="button ghost" id="export-kpi-csv">تصدير CSV</button>` : ""}</div>
        ${table(["الترتيب", "الموظف", "المدير", "الأهداف", "الكفاءة", "الحضور", "السلوكيات", "المبادرات", "الإجمالي", "التقدير", "الحالة", "إجراءات"], evaluations.map((item) => `<tr>
          <td>${escapeHtml(item.rank || "-")}</td>
          <td>${escapeHtml(item.employee?.fullName || item.employeeId)}</td>
          <td>${escapeHtml(item.manager?.fullName || item.managerEmployeeId || "-")}</td>
          <td>${escapeHtml(item.targetScore ?? "-")}/40</td>
          <td>${escapeHtml(item.efficiencyScore ?? "-")}/20</td>
          <td>${escapeHtml(item.attendanceScore ?? "-")}/20</td>
          <td>${escapeHtml((Number(item.conductScore || 0) + Number(item.prayerScore || 0) + Number(item.quranCircleScore || 0)).toFixed(1))}/15</td>
          <td>${escapeHtml(item.initiativesScore ?? "-")}/5</td>
          <td><strong>${escapeHtml(item.totalScore ?? "-")}/100</strong></td>
          <td>${escapeHtml(item.rating || item.grade || "-")}</td>
          <td>${badge(item.status || "DRAFT")}</td>
          <td>${payload.accessMode === "self" ? "-" : `<button class="button ghost" data-kpi-action="approve" data-id="${escapeHtml(item.id)}">اعتماد وتسليم</button>`}</td>
        </tr>`))}
      </article>
      <article class="panel span-12">
        <h2>${isSelf ? "الخطوة التالية" : "موظفون لم يتم تقييمهم بعد"}</h2>
        <div class="chips">${isSelf ? `<span class="chip">بعد رفع تقييمك، يظهر للمدير المباشر لاعتماده أو تعديله ثم تسليمه.</span>` : pendingEmployees.length ? pendingEmployees.map((employee) => `<span class="chip">${escapeHtml(employee.fullName)} - ${escapeHtml(employee.jobTitle || "")}</span>`).join("") : `<span class="chip success">لا توجد تقييمات ناقصة</span>`}</div>
      </article>
    </section>`,
    "مؤشرات وتقييم الأداء",
    isSelf ? "الموظف يرى تقييمه فقط ويرفعه لمديره المباشر." : "نموذج KPI شهري يبدأ من 20 إلى 25 ويتطلب جلسة بين الموظف ومديره المباشر.",
  );
  app.querySelector("#kpi-form").addEventListener("submit", submitForm(endpoints.saveKpiEvaluation, isSelf ? "تم رفع تقييمك للمدير المباشر." : "تم حفظ تقييم الأداء."));
  app.querySelector("#recompute-kpi")?.addEventListener("click", async () => {
    const result = await endpoints.recomputeKpi({});
    setMessage(`تم تجهيز ${result.recomputed || 0} تقييم ناقص.`, "");
    render();
  });
  app.querySelectorAll("[data-kpi-action]").forEach((button) => button.addEventListener("click", async () => {
    await endpoints.updateKpiEvaluation(button.dataset.id, { status: "APPROVED" });
    setMessage("تم اعتماد التقييم وتسليمه.", "");
    render();
  }));
  app.querySelector("#export-kpi-csv")?.addEventListener("click", () => {
    const rows = [["الموظف", "المدير", "الأهداف", "الكفاءة", "الحضور", "السلوكيات", "المبادرات", "الإجمالي", "الحالة"], ...evaluations.map((item) => [item.employee?.fullName || item.employeeId, item.manager?.fullName || "", item.targetScore, item.efficiencyScore, item.attendanceScore, Number(item.conductScore || 0) + Number(item.prayerScore || 0) + Number(item.quranCircleScore || 0), item.initiativesScore, item.totalScore, statusLabel(item.status)])];
    downloadFile("monthly-kpi-evaluations.csv", `\ufeff${toCsv(rows)}`, "text/csv;charset=utf-8");
  });
}

async function renderReports() {
  const payload = await endpoints.reports();
  const jobs = payload.jobs || [];
  shell(
    `<section class="grid">
      <article class="panel span-4"><h2>طلب تقرير</h2>${simpleForm("report-form", [["title", "العنوان"], ["reportKey", "النوع", "select", optionList([{ name: "attendance" }, { name: "employees" }, { name: "requests" }])], ["format", "الصيغة", "select", optionList([{ name: "csv" }, { name: "json" }])]], "إنشاء")}</article>
      <article class="panel span-8"><div class="panel-head"><h2>التقارير</h2><div class="toolbar"><button class="button ghost" id="export-att-csv">حضور CSV</button><button class="button ghost" id="export-att-xls">حضور Excel</button><button class="button ghost" id="print-attendance">طباعة/PDF</button><button class="button ghost" id="export-system-json">Backup JSON</button></div></div>${table(["العنوان", "النوع", "الصيغة", "الحالة", "التاريخ"], jobs.map((job) => `<tr><td>${escapeHtml(job.title)}</td><td>${escapeHtml(job.reportKey)}</td><td>${escapeHtml(job.format)}</td><td>${badge(job.status)}</td><td>${date(job.createdAt)}</td></tr>`))}</article>
    </section>`,
    "التقارير",
    "إنشاء تقارير وتصدير CSV/JSON.",
  );
  app.querySelector("#report-form").addEventListener("submit", submitForm(endpoints.createReport, "تم إنشاء التقرير."));
  app.querySelector("#export-att-csv").addEventListener("click", exportAttendanceCsv);
  app.querySelector("#export-att-xls").addEventListener("click", exportAttendanceExcel);
  app.querySelector("#print-attendance").addEventListener("click", printAttendanceReport);
  app.querySelector("#export-system-json").addEventListener("click", async () => downloadFile("hr-backup.json", JSON.stringify(await endpoints.backup(), null, 2), "application/json;charset=utf-8"));
}

async function renderAudit() {
  const logs = await endpoints.auditLogs().then(unwrap);
  shell(
    `<section class="panel">
      <div class="panel-head"><div><h2>سجل التدقيق</h2><p>كل العمليات المهمة تحفظ هنا للمراجعة</p></div><button class="button ghost" id="export-audit">تصدير</button></div>
      ${table(["العملية", "الكيان", "المعرف", "المستخدم", "التاريخ"], logs.map((log) => `<tr><td>${escapeHtml(log.action)}</td><td>${escapeHtml(log.entityType)}</td><td>${escapeHtml(log.entityId)}</td><td>${escapeHtml(log.actor || log.actorUserId || "-")}</td><td>${date(log.createdAt)}</td></tr>`))}
    </section>`,
    "سجل التدقيق",
    "Audit Log للعمليات المهمة.",
  );
  app.querySelector("#export-audit").addEventListener("click", () => downloadFile("audit-log.csv", `\ufeff${toCsv([["action","entity","id","actor","date"], ...logs.map((l) => [l.action, l.entityType, l.entityId, l.actor, l.createdAt])])}`, "text/csv;charset=utf-8"));
}

async function renderNotifications() {
  const items = await endpoints.notifications().then(unwrap);
  shell(
    `<section class="panel"><div class="panel-head"><div><h2>الإشعارات</h2><p>مركز تنبيه داخلي</p></div></div>
    ${table(["العنوان", "المحتوى", "الحالة", "التاريخ", "إجراءات"], items.map((item) => `<tr><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.body || "")}</td><td>${badge(item.isRead ? "READ" : "UNREAD")}</td><td>${date(item.createdAt)}</td><td>${item.isRead ? "" : `<button class="button ghost" data-read="${item.id}">تعليم كمقروء</button>`}</td></tr>`))}</section>`,
    "الإشعارات",
    "تنبيهات النظام والطلبات.",
  );
  app.querySelectorAll("[data-read]").forEach((button) => button.addEventListener("click", async () => {
    await endpoints.markNotificationRead(button.dataset.read);
    render();
  }));
}

function renderRouteAccess() {
  const permissions = [...currentPermissions()].sort();
  const rows = Object.entries(routePermissions).map(([key, scopes]) => {
    const allowed = canRoute(key);
    const matched = hasFullAccess() ? ["*"] : scopes.filter((scope) => currentPermissions().has(scope));
    return `<tr>
      <td><strong>${escapeHtml(routeDisplayName(key))}</strong><small>${escapeHtml(key)}</small></td>
      <td><div class="scope-list">${scopes.length ? scopes.map((scope) => `<span>${escapeHtml(scope)}</span>`).join("") : `<span>عام</span>`}</div></td>
      <td><div class="scope-list matched">${matched.length ? matched.map((scope) => `<span>${escapeHtml(scope)}</span>`).join("") : `<span>لا يوجد تطابق</span>`}</div></td>
      <td>${allowed ? badge("APPROVED") : badge("REJECTED")}</td>
    </tr>`;
  });
  shell(
    `<section class="grid">
      <article class="panel span-4">
        <h2>ملخص دورك الحالي</h2>
        <div class="meta-grid">
          <span><strong>الدور</strong>${escapeHtml(roleLabel())}</span>
          <span><strong>نوع الوصول</strong>${hasFullAccess() ? "صلاحيات كاملة" : "حسب الصلاحيات"}</span>
          <span><strong>عدد الصلاحيات المقروءة</strong>${escapeHtml(permissions.length)}</span>
        </div>
        <div class="scope-list all-scopes">${permissions.length ? permissions.map((scope) => `<span>${escapeHtml(scope)}</span>`).join("") : `<span>لا توجد صلاحيات مباشرة؛ راجع ربط الدور بالملف.</span>`}</div>
      </article>
      <article class="panel span-8">
        <div class="panel-head"><div><h2>سبب ظهور أو اختفاء الصفحات</h2><p>هذه الصفحة تساعدك على معرفة الـ Route المطلوب والصلاحية التي تسمح بفتحه.</p></div></div>
        ${table(["الصفحة", "الصلاحيات المطلوبة", "المتطابق مع حسابك", "الحالة"], rows, "route-access-table")}
      </article>
    </section>`,
    "صلاحيات الواجهة",
    "تشخيص واضح لمسارات النظام بناءً على الدور والصلاحيات الحالية.",
  );
}

async function renderSettings() {
  const [health, settingsPayload] = await Promise.all([endpoints.health(), endpoints.settings().then(unwrap)]);
  const settingsRows = Array.isArray(settingsPayload)
    ? settingsPayload
    : Object.entries(settingsPayload || {}).map(([key, value]) => ({ key, value: typeof value === "object" ? JSON.stringify(value) : value }));
  shell(
    `<section class="grid">
      <article class="panel span-6"><h2>حالة التشغيل السريعة</h2>${table(["البند", "القيمة"], [`<tr><td>التطبيق</td><td>${escapeHtml(health.app || health.mode || "HR")}</td></tr>`, `<tr><td>قاعدة البيانات</td><td>${escapeHtml(health.database?.mode || health.database || "-")} / متصلة</td></tr>`, `<tr><td>الجلسات</td><td>${health.authEnforced ? "مفعلة" : "اختيارية"}</td></tr>`, `<tr><td>الإصدار</td><td>${escapeHtml(health.version || "-")}</td></tr>`])}</article>
      <article class="panel span-6 account-avatar-panel"><div class="panel-head"><div><h2>صورة حسابي</h2><p>تعديل Avatar المستخدم الحالي ويظهر في أعلى النظام وقائمة المستخدمين.</p></div>${avatar(userAvatarSubject(), "large")}</div><div class="toolbar spaced"><input type="file" id="current-user-avatar" accept="image/png,image/jpeg,image/webp,image/gif" /><button class="button primary" id="save-current-avatar" type="button">حفظ صورة الحساب</button></div></article>
      <article class="panel span-6"><h2>تعديل الإعدادات</h2><form id="settings-form" class="form-grid">${settingsRows.map((item) => `<label>${escapeHtml(item.key)}<input name="${escapeHtml(item.key)}" value="${escapeHtml(item.value)}" /></label>`).join("")}<div class="form-actions"><button class="button primary">حفظ الإعدادات</button></div></form></article>
      <article class="panel span-6"><h2>تغيير كلمة المرور</h2><form id="password-form" class="form-grid"><label>كلمة المرور الحالية<input type="password" name="currentPassword" required /></label><label>كلمة المرور الجديدة<input type="password" name="newPassword" minlength="8" required /></label><div class="form-actions"><button class="button primary">تغيير كلمة المرور</button></div></form></article>
      <article class="panel span-12"><h2>سياسات الأمان المقترحة</h2>${table(["السياسة", "الحالة"], [["قفل الحساب بعد محاولات فاشلة", "مفعل عند تشغيل Backend"], ["تغيير كلمة المرور المؤقتة", "مدعوم عبر mustChangePassword"], ["سجل آخر IP وجهاز", "مدعوم في قاعدة البيانات"], ["Passkeys", "جاهز كنموذج بيانات وينتظر HTTPS/Domain"]].map(([a,b]) => `<tr><td>${escapeHtml(a)}</td><td>${escapeHtml(b)}</td></tr>`))}</article>
    </section>`,
    "الإعدادات",
    "إعدادات عامة قابلة للتعديل.",
  );
  app.querySelector("#save-current-avatar")?.addEventListener("click", async () => {
    try {
      const file = app.querySelector("#current-user-avatar")?.files?.[0];
      if (!file) return setMessage("", "اختر صورة أولًا.");
      const url = await endpoints.uploadAvatar(file);
      await endpoints.updateUser(state.user.id, { avatarUrl: url, name: state.user.name || state.user.fullName || state.user.email });
      state.user = { ...state.user, avatarUrl: url, photoUrl: url };
      setMessage("تم تحديث صورة الحساب.", "");
      render();
    } catch (error) {
      setMessage("", error.message);
      render();
    }
  });
  app.querySelector("#settings-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await endpoints.updateSettings(readForm(event.currentTarget));
    setMessage("تم حفظ الإعدادات.", "");
    render();
  });
  app.querySelector("#password-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await endpoints.changePassword(readForm(event.currentTarget));
    event.currentTarget.reset();
    setMessage("تم تغيير كلمة المرور بنجاح.", "");
    render();
  });
}

async function renderHealth() {
  const health = await endpoints.health();
  shell(
    `<section class="grid">
      <article class="panel span-5"><h2>ملخص الحالة</h2>${table(["البند", "القيمة"], Object.entries(health.counts || {}).map(([key, value]) => `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(value)}</td></tr>`))}</article>
      <article class="panel span-7"><h2>الفحوصات</h2>${table(["الفحص", "الحالة"], (health.checks || []).map((check) => `<tr><td>${escapeHtml(check.label)}</td><td>${check.ok ? badge("APPROVED") : badge("PENDING")}</td></tr>`))}</article>
    </section>`,
    "حالة النظام",
    "System Health للتأكد من جاهزية التشغيل.",
  );
}

async function renderBackup() {
  shell(
    `<section class="grid">
      <article class="panel span-4"><h2>نسخة احتياطية</h2><p>تصدير كل بيانات النظام بصيغة JSON.</p><button class="button primary" id="download-backup">تحميل Backup</button></article>
      <article class="panel span-4"><h2>استرجاع Backup</h2><input type="file" id="backup-file" accept="application/json" /><button class="button" id="restore-backup">استرجاع</button></article>
      <article class="panel span-4"><h2>استيراد موظفين</h2><p>ارفع JSON Array للموظفين أو CSV بسيط.</p><input type="file" id="employees-import" accept=".json,.csv,text/csv,application/json" /><button class="button" id="import-employees">استيراد</button></article>
      <article class="panel span-12"><h2>إعادة ضبط</h2><p>ترجع البيانات الأولية للنسخة المحلية.</p><button class="button danger" id="reset-data">استرجاع البيانات الأولية</button></article>
    </section>`,
    "نسخ واستيراد",
    "Backup/Restore و Import للموظفين.",
  );
  app.querySelector("#download-backup").addEventListener("click", async () => downloadFile("hr-system-backup.json", JSON.stringify(await endpoints.backup(), null, 2), "application/json;charset=utf-8"));
  app.querySelector("#restore-backup").addEventListener("click", async () => {
    const file = app.querySelector("#backup-file").files?.[0];
    if (!file) return setMessage("", "اختر ملف Backup أولًا.");
    const db = JSON.parse(await file.text());
    await endpoints.restoreBackup(db);
    setMessage("تم استرجاع النسخة الاحتياطية.", "");
    render();
  });
  app.querySelector("#import-employees").addEventListener("click", async () => {
    const file = app.querySelector("#employees-import").files?.[0];
    if (!file) return setMessage("", "اختر ملف الاستيراد أولًا.");
    const text = await file.text();
    let rows;
    if (file.name.endsWith(".json")) rows = JSON.parse(text);
    else {
      const [head, ...lines] = text.split(/\r?\n/).filter(Boolean);
      const keys = head.split(",").map((x) => x.replaceAll('"', "").trim());
      rows = lines.map((line) => Object.fromEntries(line.split(",").map((cell, index) => [keys[index], cell.replaceAll('"', "").trim()])));
    }
    const result = await endpoints.importEmployees(rows);
    setMessage(`تم استيراد ${result.created} موظف.`, "");
    render();
  });
  app.querySelector("#reset-data").addEventListener("click", async () => {
    if (!await confirmAction({ title: "إعادة ضبط البيانات", message: "سيتم حذف بيانات المتصفح المحلية واسترجاع البيانات الأولية.", confirmLabel: "إعادة الضبط", danger: true })) return;
    await endpoints.reset();
    setMessage("تم استرجاع البيانات الأولية.", "");
    render();
  });
}

async function renderDisputes() {
  const payload = unwrap(await endpoints.disputes());
  const ref = await referenceData();
  const employees = ref.employees || [];
  const cases = Array.isArray(payload) ? payload : (payload.cases || []);
  const committee = Array.isArray(payload) ? { members: ["لجنة حل المشاكل والخلافات"], mandate: "استقبال الشكاوى من جميع الموظفين ومراجعتها ثم إصدار قرار أو رفعها للإدارة عند الحاجة." } : (payload.committee || {});
  const currentEmployeeId = state.user?.employeeId || state.user?.employee?.id || "";
  const employeeOptions = optionList(employees.map((employee) => ({ id: employee.id, name: `${employee.fullName}${employee.jobTitle ? " — " + employee.jobTitle : ""}` })), currentEmployeeId, "اختر الموظف");
  shell(
    `<section class="grid disputes-page">
      <article class="panel span-12 accent-panel">
        <div class="panel-head"><div><h2>لجنة حل المشاكل والخلافات</h2><p>${escapeHtml(committee.mandate || "كل موظف يستطيع تسجيل شكوى مع ذكر السبب، ثم تُرفع مباشرة إلى لجنة حل المشاكل والخلافات للمراجعة والقرار.")}</p></div></div>
        <div class="chips">${(committee.members || ["لجنة حل المشاكل والخلافات"]).map((member) => `<span class="chip">${escapeHtml(member)}</span>`).join("")}</div>
      </article>
      <article class="panel span-4">
        <h2>طلب شكوى جديد</h2>
        <form id="dispute-form" class="form-grid compact-form">
          <label>عنوان الشكوى<input name="title" required placeholder="مثال: مشكلة إدارية أو خلاف عمل" /></label>
          <label>صاحب الشكوى<select name="employeeId" required>${employeeOptions}</select></label>
          <input type="hidden" name="status" value="IN_REVIEW" />
          <input type="hidden" name="severity" value="MEDIUM" />
          <label class="span-2">سبب الشكوى والتفاصيل<textarea name="description" required placeholder="اكتب السبب والتفاصيل التي تريد عرضها على اللجنة"></textarea></label>
          <div class="form-actions"><button class="button primary" type="submit">رفع الشكوى للجنة</button></div>
        </form>
      </article>
      <article class="panel span-8">
        <h2>سجل الشكاوى</h2>
        ${table(["العنوان", "صاحب الشكوى", "الحالة", "قرار اللجنة", "إجراءات"], cases.map((item) => `<tr>
          <td>${escapeHtml(item.title || "-")}</td>
          <td>${escapeHtml(item.employee?.fullName || employees.find((employee) => employee.id === item.employeeId)?.fullName || "-")}</td>
          <td>${badge(item.status || "IN_REVIEW")}</td>
          <td>${escapeHtml(item.committeeDecision || item.resolution || "لم يصدر قرار بعد")}</td>
          <td><button class="button ghost" data-dispute="${escapeHtml(item.id)}" data-status="RESOLVED">تم الحل</button><button class="button danger ghost" data-dispute="${escapeHtml(item.id)}" data-status="ESCALATED">رفع للإدارة</button></td>
        </tr>`))}
      </article>
    </section>`,
    "الشكاوى وفض الخلافات",
    "تسجيل شكوى بسبب واضح ثم إحالتها للجنة حل المشاكل والخلافات.",
  );
  app.querySelector("#dispute-form").addEventListener("submit", submitForm(endpoints.createDispute, "تم رفع الشكوى إلى لجنة حل المشاكل والخلافات."));
  app.querySelectorAll("[data-dispute]").forEach((button) => button.addEventListener("click", async () => {
    const status = button.dataset.status;
    const committeeDecision = status === "RESOLVED" ? "تم حل الشكوى بواسطة لجنة حل المشاكل والخلافات." : "تم رفع الشكوى للإدارة لاستكمال القرار.";
    await endpoints.updateDispute(button.dataset.dispute, { status, committeeDecision, escalatedToExecutive: status === "ESCALATED" });
    setMessage(status === "RESOLVED" ? "تم إغلاق الشكوى بقرار اللجنة." : "تم رفع الشكوى للإدارة.", "");
    render();
  }));
}

async function renderRealtime() {
  const snapshot = await endpoints.realtimeSnapshot();
  const data = snapshot.dashboard || snapshot;
  const locations = snapshot.locations || [];
  shell(
    `<section class="grid">
      <article class="panel span-12 accent-panel"><div class="panel-head"><div><h2>لوحة مباشرة Real-time</h2><p>تعمل عبر Supabase Realtime عند تفعيل Supabase، ومع Live Server تستخدم Snapshot محلي.</p></div><strong id="live-state">${escapeHtml(snapshot.realtime?.transport || "snapshot")}</strong></div><div class="toolbar"><button class="button ghost" id="connect-live">اتصال Realtime</button><button class="button ghost" data-route="dashboard">الداشبورد</button></div></article>
      <article class="panel span-7"><h2>خريطة حرارة الموظفين</h2><div class="heatmap-card">${(locations || []).map((loc, index) => `<span class="heat-dot" style="--x:${12 + (index * 17) % 76}%;--y:${18 + (index * 29) % 66}%" title="${escapeHtml(loc.employee?.fullName || loc.employeeId)}"></span>`).join("") || `<div class="empty-box">لا توجد مواقع حديثة بعد.</div>`}</div></article>
      <article class="panel span-5"><h2>KPIs لحظية</h2>${table(["المؤشر", "القيمة"], [["الموظفون", data.cards?.employees ?? "-"], ["الحضور اليوم", data.cards?.presentToday ?? "-"], ["طلبات معلقة", data.cards?.pendingRequests ?? "-"], ["إجازات", data.cards?.leavesToday ?? "-"]].map(([a,b]) => `<tr><td>${escapeHtml(a)}</td><td><strong>${escapeHtml(b)}</strong></td></tr>`))}</article>
    </section>`,
    "لوحة Live",
    "متابعة لحظية للحضور والمواقع والمؤشرات.",
  );
  app.querySelector("#connect-live")?.addEventListener("click", () => {
    if (!("WebSocket" in window)) return setMessage("", "المتصفح لا يدعم WebSocket.");
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}/ws/live`);
    ws.onopen = () => { app.querySelector("#live-state").textContent = "متصل"; setMessage("تم الاتصال باللوحة اللحظية.", ""); };
    ws.onerror = () => setMessage("", "تعذر الاتصال اللحظي. تأكد من تفعيل Supabase Realtime أو تشغيل الخادم المحلي.");
    ws.onmessage = (event) => { try { const msg = JSON.parse(event.data); if (msg.type === "dashboard.snapshot") app.querySelector("#live-state").textContent = `آخر تحديث ${new Date().toLocaleTimeString("ar-EG")}`; } catch {} };
  });
}

async function renderAdvancedReports() {
  const employees = await endpoints.employees().then(unwrap);
  const events = await endpoints.attendanceEvents().then(unwrap);
  const fields = ["employee", "type", "date", "source", "geofence", "notes"];
  shell(`<section class="grid"><article class="panel span-4"><h2>منشئ التقارير</h2><p>اختر الحقول المطلوبة ثم صدّر التقرير.</p><form id="report-builder" class="form-grid">${fields.map((field) => `<label class="check-row"><input type="checkbox" name="fields" value="${field}" checked /> ${field}</label>`).join("")}<label>إرسال مجدول إلى<input name="email" type="email" placeholder="manager@example.com" /></label><div class="form-actions"><button class="button primary">تجهيز CSV</button></div></form></article><article class="panel span-8"><h2>تقارير الفروقات</h2>${table(["الموظف", "ساعات فعلية", "ساعات مخططة", "الفرق"], employees.map((employee) => { const empEvents = events.filter((e) => e.employeeId === employee.id); const actual = Math.round(empEvents.length * 4 * 10) / 10; const planned = 8; return `<tr><td>${escapeHtml(employee.fullName)}</td><td>${actual}</td><td>${planned}</td><td>${actual - planned}</td></tr>`; }))}</article></section>`, "منشئ التقارير", "تصدير ذكي CSV/Excel/PDF وجدولة بريدية مبدئية.");
  app.querySelector("#report-builder").addEventListener("submit", async (event) => {
    event.preventDefault();
    const selected = [...new FormData(event.currentTarget).getAll("fields")];
    const rows = events.map((ev) => selected.map((field) => ({ employee: ev.employee?.fullName || ev.employeeId, type: statusLabel(ev.type), date: date(ev.eventAt), source: ev.source || "-", geofence: statusLabel(ev.geofenceStatus), notes: ev.notes || "" })[field]));
    downloadFile("custom-attendance-report.csv", `\ufeff${toCsv([selected, ...rows])}`, "text/csv;charset=utf-8");
  });
}

async function renderAiAnalytics() {
  const payload = await endpoints.aiAnalytics();
  const rows = payload.rows || [];
  shell(`<section class="grid"><article class="panel span-12 accent-panel"><h2>تحليلات AI</h2><p>${escapeHtml(payload.note || "تحليل تقديري يساعد الإدارة ولا يتخذ قرارات تلقائية.")}</p></article><article class="panel span-12">${table(["الموظف", "درجة خطر الغياب", "غياب", "تأخير بالدقائق", "ملاحظة"], rows.map((row) => `<tr><td class="person-cell">${avatar(row.employee, "tiny")}<span>${escapeHtml(row.employee?.fullName || row.employeeId)}</span></td><td><strong>${escapeHtml(row.riskScore)}</strong></td><td>${escapeHtml(row.absences)}</td><td>${escapeHtml(row.lateMinutes)}</td><td>${escapeHtml(row.productivityHint)}</td></tr>`))}</article></section>`, "تحليلات الذكاء الاصطناعي", "توقعات غياب وإنتاجية مبنية على سجلات الحضور.");
}

async function renderIntegrations() {
  const items = await endpoints.integrations().then(unwrap);
  shell(`<section class="grid"><article class="panel span-7"><h2>التكاملات</h2>${table(["التكامل", "المزوّد", "الحالة", "ملاحظات"], items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.provider)}</td><td>${badge(item.status)}</td><td>${escapeHtml(item.notes || "")}</td></tr>`))}</article><article class="panel span-5"><h2>WebAuthn / Passkeys</h2><p>يسمح باستخدام Touch ID / Face ID / Windows Hello / YubiKey على localhost أو HTTPS.</p><div class="toolbar"><button class="button primary" id="register-passkey">تسجيل Passkey لهذا الجهاز</button><button class="button ghost" id="enable-push">تفعيل إشعارات المتصفح</button></div><div class="message compact">التكاملات الخارجية والبوابات تحتاج API Key أو جهاز فعلي.</div></article></section>`, "التكاملات والبيومترية", "إعداد WebAuthn وPush والبوابات.");
  app.querySelector("#register-passkey")?.addEventListener("click", async () => { try { await registerBrowserPasskey(); setMessage("تم تسجيل Passkey للجهاز الحالي.", ""); render(); } catch (error) { setMessage("", error.message); } });
  app.querySelector("#enable-push")?.addEventListener("click", async () => { try { await enableBrowserNotifications(); setMessage("تم تفعيل الإشعارات.", ""); } catch (error) { setMessage("", error.message); } });
}

async function renderAccessControl() {
  const [events, employees] = await Promise.all([endpoints.accessControlEvents().then(unwrap), endpoints.employees().then(unwrap)]);
  const employeeOptions = optionList(employees.map((employee) => ({ id: employee.id, name: employee.fullName })));
  shell(`<section class="grid"><article class="panel span-4"><h2>محاكاة بوابة/باب ذكي</h2><form id="access-form" class="form-grid"><label>الموظف<select name="employeeId">${employeeOptions}</select></label><label>الجهاز<input name="deviceId" value="main-gate" /></label><label>الاتجاه<select name="direction"><option value="ENTRY">دخول</option><option value="EXIT">خروج</option></select></label><label>القرار<select name="decision"><option value="ALLOW">سماح</option><option value="DENY">رفض</option></select></label><label>السبب<input name="reason" value="تحقق مزدوج" /></label><div class="form-actions"><button class="button primary">تسجيل حدث</button></div></form></article><article class="panel span-8"><h2>سجل البوابات</h2>${table(["الموظف", "الجهاز", "الاتجاه", "القرار", "الوقت"], events.map((event) => `<tr><td>${escapeHtml(event.employee?.fullName || event.employeeId)}</td><td>${escapeHtml(event.deviceId)}</td><td>${badge(event.direction)}</td><td>${badge(event.decision)}</td><td>${date(event.date)}</td></tr>`))}</article></section>`, "تكامل الأجهزة والبوابات", "جاهز للربط مع Turnstiles أو Door API عند توفر الجهاز.");
  app.querySelector("#access-form").addEventListener("submit", submitForm(endpoints.createAccessEvent, "تم تسجيل حدث البوابة."));
}

async function renderOfflineSync() {
  const rows = await endpoints.offlineQueue().then(unwrap).catch(() => []);
  shell(`<section class="grid"><article class="panel span-5"><h2>Offline-first</h2><p>عند فشل الشبكة يتم حفظ الطلبات غير GET في قائمة محلية ثم مزامنتها عند عودة الاتصال.</p><div class="toolbar"><button class="button primary" id="sync-offline">مزامنة الآن</button><button class="button ghost" id="register-bg-sync">تفعيل Background Sync</button></div></article><article class="panel span-7"><h2>قائمة الانتظار</h2>${table(["المسار", "النوع", "الحالة", "التاريخ"], rows.map((row) => `<tr><td>${escapeHtml(row.path)}</td><td>${escapeHtml(row.method)}</td><td>${badge(row.status)}</td><td>${date(row.createdAt)}</td></tr>`))}</article></section>`, "المزامنة دون اتصال", "IndexedDB/Queue-ready مع Background Sync عبر Service Worker عند دعم المتصفح.");
  app.querySelector("#sync-offline")?.addEventListener("click", async () => { const result = await endpoints.syncOfflineQueue(); setMessage(`تمت مزامنة ${result.synced || 0} طلب.`, ""); render(); });
  app.querySelector("#register-bg-sync")?.addEventListener("click", async () => { try { const reg = await navigator.serviceWorker.ready; await reg.sync?.register?.("hr-offline-sync"); setMessage("تم تفعيل Background Sync إن كان المتصفح يدعمه.", ""); } catch (error) { setMessage("", "المتصفح لا يدعم Background Sync أو لم يتم تسجيل Service Worker."); } });
}

async function renderGeneric(title, description, loader) {
  const rows = unwrap(await loader());
  shell(`<section class="grid"><article class="panel"><h2>${escapeHtml(title)}</h2>${table(["المعرف", "العنوان/الاسم", "الموظف", "الحالة", "التاريخ"], rows.map((item) => `<tr><td>${escapeHtml(item.id || "-")}</td><td>${escapeHtml(item.title || item.name || item.fullName || item.key || "-")}</td><td>${escapeHtml(item.employee?.fullName || "-")}</td><td>${badge(item.status || item.type || "-")}</td><td>${date(item.createdAt || item.updatedAt || item.date)}</td></tr>`))}</article></section>`, title, description);
}

function submitForm(handler, successMessage) {
  return async (event) => {
    event.preventDefault();
    try {
      await handler(readForm(event.currentTarget));
      setMessage(successMessage, "");
      render();
    } catch (error) {
      setMessage("", error.message);
      render();
    }
  };
}

async function attendanceExportRows() {
  const events = await endpoints.attendanceEvents();
  return events.map((event) => [event.employee?.fullName || event.employeeId, statusLabel(event.type), date(event.eventAt), event.source || "-", statusLabel(event.geofenceStatus), event.notes || ""]);
}

async function exportAttendanceCsv() {
  const headers = ["الموظف", "النوع", "التاريخ", "المصدر", "الموقع", "ملاحظات"];
  downloadFile("attendance-report.csv", `\ufeff${toCsv([headers, ...(await attendanceExportRows())])}`, "text/csv;charset=utf-8");
}

async function exportAttendanceExcel() {
  exportHtmlTable("attendance-report.xls", ["الموظف", "النوع", "التاريخ", "المصدر", "الموقع", "ملاحظات"], await attendanceExportRows());
}

async function printAttendanceReport() {
  printReport("تقرير الحضور والانصراف", ["الموظف", "النوع", "التاريخ", "المصدر", "الموقع", "ملاحظات"], await attendanceExportRows());
}

async function render() {
  try {
    state.error = "";
    if (!state.user) state.user = await endpoints.me().then(unwrap).catch(() => null);
    if (!state.user && routeKey() !== "login") return renderLogin();

    const key = routeKey();
    if (!canRoute(key)) {
      return shell(`<section class="panel"><h2>لا توجد صلاحية</h2><p>حسابك لا يملك صلاحية فتح هذه الصفحة. اطلب من مدير النظام تعديل الدور أو الصلاحيات.</p></section>`, "صلاحيات غير كافية", "تم منع الوصول للصفحة المطلوبة.");
    }
    if (key === "dashboard") await renderDashboard();
    else if (key === "realtime") await renderRealtime();
    else if (key === "employees") await renderEmployees();
    else if (key === "employee-profile") await renderEmployeeProfile();
    else if (key === "users") await renderUsers();
    else if (key === "employee-punch") await renderEmployeePunch();
    else if (key === "attendance") await renderAttendance();
    else if (key === "attendance-calendar") await renderAttendanceCalendar();
    else if (key === "missions") await renderMissions();
    else if (key === "leaves") await renderLeaves();
    else if (key === "requests") await renderRequests();
    else if (key === "locations") await renderLocations();
    else if (key === "disputes") await renderDisputes();
    else if (key === "roles") await renderRoles();
    else if (key === "org-chart") await renderOrgChart();
    else if (key === "reports") await renderReports();
    else if (key === "advanced-reports") await renderAdvancedReports();
    else if (key === "ai-analytics") await renderAiAnalytics();
    else if (key === "settings") await renderSettings();
    else if (key === "route-access") await renderRouteAccess();
    else if (key === "integrations") await renderIntegrations();
    else if (key === "access-control") await renderAccessControl();
    else if (key === "offline-sync") await renderOfflineSync();
    else if (key === "health") await renderHealth();
    else if (key === "backup") await renderBackup();
    else if (key === "audit") await renderAudit();
    else if (key === "kpi") await renderKpi();
    else if (key === "notifications") await renderNotifications();
    else await renderDashboard();
  } catch (error) {
    console.error(error);
    setMessage("", error.message);
    shell(`<section class="panel"><h2>تعذر تحميل الصفحة</h2><p>${escapeHtml(error.message)}</p></section>`, "خطأ", "راجع البيانات أو أعد تحميل الصفحة.");
  }
}

render();
