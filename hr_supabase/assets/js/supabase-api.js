const SUPABASE_CDN = "https://esm.sh/@supabase/supabase-js@2";
const CONFIG = () => globalThis.HR_SUPABASE_CONFIG || {};
const clone = (value) => JSON.parse(JSON.stringify(value ?? null));
const now = () => new Date().toISOString();
const makeId = (prefix = "id") => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
const toInt = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let clientPromise = null;
let realtimeChannels = [];

export function shouldUseSupabase() {
  const cfg = CONFIG();
  const forced = new URLSearchParams(location.search).get("backend") === "supabase" || new URLSearchParams(location.search).get("api") === "supabase";
  return Boolean((cfg.enabled || forced) && cfg.url && cfg.anonKey);
}

export function supabaseModeIsStrict() {
  const cfg = CONFIG();
  return shouldUseSupabase() && cfg.strict !== false;
}

async function getSupabase() {
  if (!shouldUseSupabase()) return null;
  if (!clientPromise) {
    clientPromise = import(SUPABASE_CDN).then(({ createClient }) => createClient(CONFIG().url, CONFIG().anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "ahla-shabab-hr.supabase-session",
      },
      realtime: { params: { eventsPerSecond: 10 } },
    }));
  }
  return clientPromise;
}

async function sb() {
  const client = await getSupabase();
  if (!client) throw new Error("لم يتم تفعيل Supabase بعد. عدّل assets/js/supabase-config.js.");
  return client;
}

function fail(error, fallback = "تعذر تنفيذ العملية على Supabase.") {
  if (!error) return;
  const message = error.message || error.details || error.hint || fallback;
  throw new Error(message);
}

function camelKey(key = "") {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function snakeKey(key = "") {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function toCamel(row) {
  if (Array.isArray(row)) return row.map(toCamel);
  if (!row || typeof row !== "object") return row;
  const out = {};
  for (const [key, value] of Object.entries(row)) out[camelKey(key)] = value;
  return out;
}

function compact(value) {
  return Object.fromEntries(Object.entries(value || {}).filter(([, v]) => v !== undefined));
}

function toSnake(row) {
  const out = {};
  for (const [key, value] of Object.entries(row || {})) out[snakeKey(key)] = value;
  return out;
}

function rolePermissions(role) {
  if (!role) return [];
  if (Array.isArray(role.permissions)) return role.permissions;
  if (typeof role.permissions === "string") {
    try { return JSON.parse(role.permissions); } catch { return role.permissions.split(",").map((s) => s.trim()).filter(Boolean); }
  }
  return [];
}

async function selectAll(table, query = "*", options = {}) {
  const client = await sb();
  const pageSize = Math.min(Math.max(Number(options.limit || 1000), 1), 1000);
  const start = Math.max(Number(options.from || 0), 0);
  const maxRows = Math.max(Number(options.maxRows || 20000), pageSize);
  const rows = [];
  for (let from = start; from < start + maxRows; from += pageSize) {
    const to = Math.min(from + pageSize - 1, start + maxRows - 1);
    const { data, error } = await client.from(table).select(query, { count: options.count || undefined }).range(from, to);
    fail(error);
    rows.push(...(data || []));
    if ((data || []).length < (to - from + 1)) break;
  }
  if (rows.length >= maxRows) console.warn(`[${table}] تم الوصول للحد الأقصى ${maxRows}. استخدم فلترة التاريخ لو الجدول كبير جدًا.`);
  return rows;
}

let _coreCache = null;
let _coreExpiry = 0;
async function core({ force = false } = {}) {
  if (!force && _coreCache && Date.now() < _coreExpiry) return _coreCache;
  const [roles, branches, departments, governorates, complexes, shifts] = await Promise.all([
    selectAll("roles", "*", { limit: 1000 }),
    selectAll("branches", "*", { limit: 1000 }),
    selectAll("departments", "*", { limit: 1000 }),
    selectAll("governorates", "*", { limit: 1000 }),
    selectAll("complexes", "*", { limit: 1000 }),
    selectAll("shifts", "*", { limit: 1000 }),
  ]);
  const map = (rows) => new Map(rows.map((row) => [row.id, toCamel(row)]));
  _coreCache = {
    roles: map(roles),
    branches: map(branches),
    departments: map(departments),
    governorates: map(governorates),
    complexes: map(complexes),
    shifts: map(shifts),
  };
  _coreExpiry = Date.now() + 60_000;
  return _coreCache;
}

function enrichEmployee(row, c = {}) {
  const employee = toCamel(row);
  if (!employee) return null;
  return {
    ...employee,
    employeeCode: employee.employeeCode || employee.code,
    photoUrl: employee.photoUrl || employee.avatarUrl || "",
    isDeleted: Boolean(employee.isDeleted),
    role: c.roles?.get(employee.roleId) || null,
    branch: c.branches?.get(employee.branchId) || null,
    department: c.departments?.get(employee.departmentId) || null,
    governorate: c.governorates?.get(employee.governorateId) || null,
    complex: c.complexes?.get(employee.complexId) || null,
    manager: null,
    shift: c.shifts?.get(employee.shiftId) || null,
  };
}

function enrichProfile(row, c = {}) {
  const profile = toCamel(row);
  if (!profile) return null;
  const role = c.roles?.get(profile.roleId) || null;
  return {
    ...profile,
    name: profile.fullName || profile.name || profile.email,
    fullName: profile.fullName || profile.name || profile.email,
    avatarUrl: profile.avatarUrl || profile.photoUrl || "",
    photoUrl: profile.photoUrl || profile.avatarUrl || "",
    employeeId: profile.employeeId || "",
    role,
    permissions: rolePermissions(role),
    branch: c.branches?.get(profile.branchId) || null,
    department: c.departments?.get(profile.departmentId) || null,
    governorate: c.governorates?.get(profile.governorateId) || null,
    complex: c.complexes?.get(profile.complexId) || null,
  };
}

function mapEvent(row, c = {}) {
  const item = toCamel(row);
  if (!item) return null;
  item.eventAt ||= item.createdAt;
  item.distanceFromBranchMeters = item.distanceFromBranchMeters ?? item.distanceMeters;
  return item;
}

function toEmployeePayload(body = {}) {
  return compact({
    employee_code: body.employeeCode || body.code,
    full_name: body.fullName,
    phone: body.phone,
    email: body.email,
    photo_url: body.photoUrl,
    job_title: body.jobTitle,
    role_id: body.roleId,
    branch_id: body.branchId,
    department_id: body.departmentId,
    governorate_id: body.governorateId,
    complex_id: body.complexId,
    manager_employee_id: body.managerEmployeeId,
    shift_id: body.shiftId || null,
    status: "ACTIVE",
    hire_date: body.hireDate,
    is_active: body.status ? !["INACTIVE", "SUSPENDED", "TERMINATED", "DISABLED"].includes(body.status) : undefined,
    is_deleted: body.isDeleted,
  });
}

function distanceMeters(a, b) {
  if (![a?.latitude, a?.longitude, b?.latitude, b?.longitude].every((value) => Number.isFinite(Number(value)))) return null;
  const toRad = (value) => (Number(value) * Math.PI) / 180;
  const radius = 6371000;
  const dLat = toRad(Number(b.latitude) - Number(a.latitude));
  const dLng = toRad(Number(b.longitude) - Number(a.longitude));
  const lat1 = toRad(Number(a.latitude));
  const lat2 = toRad(Number(b.latitude));
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * radius * Math.asin(Math.sqrt(h)));
}

async function currentUser() {
  const client = await sb();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData?.user) return null;
  const c = await core();
  const { data: profile, error } = await client.from("profiles").select("*").eq("id", authData.user.id).maybeSingle();
  fail(error);
  const enriched = enrichProfile(profile || { id: authData.user.id, email: authData.user.email, full_name: authData.user.email }, c);
  if (enriched.employeeId) {
    const { data: emp } = await client.from("employees").select("*").eq("id", enriched.employeeId).maybeSingle();
    enriched.employee = enrichEmployee(emp, c);
    if (!enriched.avatarUrl && enriched.employee?.photoUrl) enriched.avatarUrl = enriched.employee.photoUrl;
    if (!enriched.photoUrl && enriched.avatarUrl) enriched.photoUrl = enriched.avatarUrl;
  }
  return enriched;
}

async function audit(action, entityType, entityId, afterData = {}, beforeData = null) {
  // Supabase edition uses database triggers for tamper-resistant audit logs.
  // This client hook is intentionally a no-op to avoid user-forged audit rows.
  return { skipped: true, action, entityType, entityId };
}

async function uploadDataUrl(bucket, folder, dataUrl, fileName = "selfie.jpg") {
  if (!dataUrl) return "";
  const client = await sb();
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const ext = fileName.split(".").pop() || "jpg";
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await client.storage.from(bucket).upload(path, blob, { upsert: false, contentType: blob.type || "image/jpeg" });
  fail(error, "تعذر رفع الصورة.");
  const { data } = client.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

async function uploadFile(bucket, folder, file) {
  if (!file) return "";
  const client = await sb();
  const safe = String(file.name || "file").replace(/[^\w.\-]+/g, "-");
  const path = `${folder}/${Date.now()}-${safe}`;
  const { error } = await client.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
  fail(error, "تعذر رفع الملف.");
  const { data } = client.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

async function employeeById(employeeId) {
  const client = await sb();
  const c = await core();
  const { data, error } = await client.from("employees").select("*").eq("id", employeeId).maybeSingle();
  fail(error);
  return enrichEmployee(data, c);
}

async function myEmployee() {
  const user = await currentUser();
  if (!user?.employeeId) throw new Error("هذا الحساب غير مرتبط بملف موظف.");
  return await employeeById(user.employeeId);
}

async function attendanceAddress(employee = null) {
  const emp = employee || await myEmployee();
  const c = await core();
  const branch = c.branches.get(emp.branchId) || emp.branch || null;
  const lat = Number(branch?.latitude);
  const lng = Number(branch?.longitude);
  return {
    employee: emp,
    branch,
    address: branch?.address || "",
    hasConfiguredAddress: Number.isFinite(lat) && Number.isFinite(lng),
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lng) ? lng : null,
    radiusMeters: Number(branch?.geofenceRadiusMeters || branch?.radiusMeters || 300),
    maxAccuracyMeters: Math.max(Number(branch?.maxAccuracyMeters || 0), 2000),
    strictGeofence: true,
  };
}

function evaluateGeo(address, body = {}) {
  const current = Number.isFinite(Number(body.latitude)) && Number.isFinite(Number(body.longitude)) ? { latitude: Number(body.latitude), longitude: Number(body.longitude) } : null;
  let geofenceStatus = "unknown";
  let distanceFromBranchMeters = null;
  let allowed = false;
  let message = "تعذر قراءة الموقع الحالي.";
  const accuracyMeters = body.accuracyMeters != null ? Number(body.accuracyMeters) : null;
  if (!current) {
    geofenceStatus = body.locationPermission === "denied" ? "permission_denied" : "location_unavailable";
    message = geofenceStatus === "permission_denied" ? "تم رفض صلاحية الموقع." : "الموقع غير متاح.";
  } else if (!address?.hasConfiguredAddress) {
    geofenceStatus = "branch_location_missing";
    message = "لم يتم ضبط إحداثيات الفرع المعتمد.";
  } else {
    distanceFromBranchMeters = distanceMeters(current, { latitude: address.latitude, longitude: address.longitude });
    const weakAccuracy = accuracyMeters != null && accuracyMeters > address.maxAccuracyMeters;
    const effectiveRadius = Number(address.radiusMeters || 300) + (weakAccuracy ? Math.min(accuracyMeters, Number(address.maxAccuracyMeters || 2000)) : 0);
    allowed = distanceFromBranchMeters != null && (distanceFromBranchMeters <= address.radiusMeters || (weakAccuracy && distanceFromBranchMeters <= effectiveRadius));
    geofenceStatus = allowed ? (weakAccuracy ? "inside_branch_low_accuracy" : "inside_branch") : (weakAccuracy ? "location_low_accuracy" : "outside_branch");
    message = allowed
      ? (weakAccuracy ? `تم قبول الموقع مع دقة GPS ضعيفة (${accuracyMeters} متر). يفضل تشغيل الموقع عالي الدقة.` : "الموقع داخل العنوان المحدد ويمكن تسجيل البصمة.")
      : (weakAccuracy ? `دقة الموقع ضعيفة: ${accuracyMeters} متر. اقترب من مكان مفتوح وفعّل GPS عالي الدقة ثم حاول مرة أخرى.` : `أنت خارج نطاق العنوان المحدد. المسافة ${distanceFromBranchMeters} متر والنطاق ${address.radiusMeters} متر.`);
  }
  return { allowed, canRecord: allowed, geofenceStatus, distanceFromBranchMeters, distanceMeters: distanceFromBranchMeters, radiusMeters: address.radiusMeters, maxAccuracyMeters: address.maxAccuracyMeters, accuracyMeters, message, blockReason: allowed ? "" : message };
}

async function upsertDaily(employeeId, event) {
  const client = await sb();
  const { error } = await client.rpc('upsert_attendance_daily_from_event', {
    p_employee_id: employeeId,
    p_type: event.type,
    p_event_at: event.event_at || event.eventAt || now(),
    p_status: event.status || null,
    p_late_minutes: event.late_minutes || event.lateMinutes || 0,
    p_requires_review: Boolean(event.requires_review || event.requiresReview),
  });
  fail(error, 'تعذر تحديث يومية الحضور.');
}

async function recordPunch(type, body = {}, forceEmployeeId = "") {
  const client = await sb();
  const user = await currentUser();
  const employee = forceEmployeeId ? await employeeById(forceEmployeeId) : await myEmployee();
  const address = await attendanceAddress(employee);
  const evaluation = evaluateGeo(address, body);
  if (!evaluation.canRecord) {
    await audit("attendance.rejected", "attendance_event", employee.id, { type, evaluation });
    throw new Error(evaluation.blockReason || "تم رفض البصمة خارج النطاق.");
  }
  const selfieUrl = "";
  const { data: serverNow } = await client.rpc('server_now');
  const eventAt = serverNow || now();
  let lateMinutes = 0;
  if (type === "CHECK_IN") {
    const { data: calculatedLate, error: lateError } = await client.rpc('calculate_late_minutes', { p_employee_id: employee.id, p_event_at: eventAt });
    fail(lateError, 'تعذر حساب التأخير.');
    lateMinutes = Number(calculatedLate || 0);
  }
  const status = type === "CHECK_IN" ? (lateMinutes > 0 ? "LATE" : "PRESENT") : "CHECK_OUT"; // للتقارير فقط، لا يمنع التسجيل
  const payload = {
    employee_id: employee.id,
    user_id: user?.id || null,
    type,
    status,
    event_at: eventAt,
    latitude: body.latitude ?? null,
    longitude: body.longitude ?? null,
    accuracy_meters: body.accuracyMeters ?? body.accuracy ?? null,
    geofence_status: evaluation.geofenceStatus,
    distance_from_branch_meters: evaluation.distanceFromBranchMeters,
    branch_id: employee.branchId || null,
    verification_status: body.verificationStatus || "verified",
    biometric_method: body.biometricMethod || "passkey",
    passkey_credential_id: body.passkeyCredentialId || null,
    selfie_url: selfieUrl,
    notes: body.notes || "",
    late_minutes: lateMinutes,
    requires_review: false,
  };
  const { data, error } = await client.from("attendance_events").insert(payload).select("*").single();
  fail(error, "تعذر حفظ البصمة.");
  await upsertDaily(employee.id, payload);
  await client.from("employee_locations").insert({ employee_id: employee.id, latitude: body.latitude, longitude: body.longitude, accuracy_meters: body.accuracyMeters ?? body.accuracy ?? null, source: "attendance", attendance_event_id: data.id, created_at: now() });
  await audit("attendance.punch", "attendance_event", data.id, data);
  return { ...mapEvent(data), evaluation };
}

async function recordManualPunch(type, body = {}, forceEmployeeId = "") {
  const client = await sb();
  const user = await currentUser();
  const employee = forceEmployeeId ? await employeeById(forceEmployeeId) : await myEmployee();
  const { data: serverNow } = await client.rpc('server_now');
  const eventAt = serverNow || now();
  const payload = {
    employee_id: employee.id,
    user_id: user?.id || null,
    type,
    status: type === "CHECK_IN" ? "MANUAL_CHECK_IN" : "MANUAL_CHECK_OUT",
    event_at: eventAt,
    latitude: body.latitude ?? null,
    longitude: body.longitude ?? null,
    accuracy_meters: body.accuracyMeters ?? body.accuracy ?? null,
    geofence_status: "manual_review_required",
    distance_from_branch_meters: null,
    branch_id: employee.branchId || null,
    verification_status: "manual",
    biometric_method: "manual",
    selfie_url: "",
    notes: body.notes || "تسجيل يدوي — يحتاج مراجعة واعتماد HR",
    late_minutes: 0,
    requires_review: true,
  };
  const { data, error } = await client.from("attendance_events").insert(payload).select("*").single();
  fail(error, "تعذر حفظ البصمة اليدوية.");
  await upsertDaily(employee.id, payload);
  return { ...mapEvent(data), manual: true, requiresReview: true };
}

function queueOffline(action, body = {}) {
  const key = "hr.supabase.offlineQueue.safe";
  const rows = JSON.parse(localStorage.getItem(key) || "[]");
  const item = {
    id: makeId("queue"),
    action,
    status: "PENDING",
    createdAt: now(),
    attempts: 0,
    // No raw coordinates, selfie data, or employee IDs are stored in localStorage.
    summary: { type: body.type || action, hasPasskey: Boolean(body.passkeyCredentialId), hasLocation: Boolean(body.latitude && body.longitude) },
  };
  rows.unshift(item);
  localStorage.setItem(key, JSON.stringify(rows.slice(0, 100)));
  return item;
}

function getQueued() {
  return JSON.parse(localStorage.getItem("hr.supabase.offlineQueue.safe") || "[]");
}

function setQueued(rows) {
  localStorage.setItem("hr.supabase.offlineQueue.safe", JSON.stringify(rows));
}

async function tableRows(table, order = "created_at", ascending = false, options = {}) {
  const client = await sb();
  const pageSize = Math.min(Math.max(Number(options.limit || 1000), 1), 1000);
  const maxRows = Math.max(Number(options.maxRows || 20000), pageSize);
  const start = Math.max(Number(options.page || 0), 0) * pageSize;
  const rows = [];
  for (let from = start; from < start + maxRows; from += pageSize) {
    let query = client.from(table).select(options.query || "*", { count: options.count || undefined }).order(order, { ascending });
    if (options.fromDate && options.dateColumn) query = query.gte(options.dateColumn, options.fromDate);
    if (options.toDate && options.dateColumn) query = query.lte(options.dateColumn, options.toDate);
    const to = Math.min(from + pageSize - 1, start + maxRows - 1);
    const { data, error } = await query.range(from, to);
    fail(error);
    rows.push(...(data || []));
    if ((data || []).length < (to - from + 1)) break;
  }
  if (rows.length >= maxRows) console.warn(`[${table}] تم الوصول للحد الأقصى ${maxRows}. استخدم فلترة التاريخ لو الجدول كبير جدًا.`);
  return rows;
}

async function createOrUpdate(table, body, id = body?.id) {
  const client = await sb();
  const payload = toSnake(compact(body));
  delete payload.id;
  const query = id ? client.from(table).update(payload).eq("id", id) : client.from(table).insert(payload);
  const { data, error } = await query.select("*").single();
  fail(error);
  await audit(id ? "update" : "create", table, data.id, data);
  return toCamel(data);
}

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export const supabaseEndpoints = {
  me: currentUser,
  login: async (identifier, password) => {
    const client = await sb();
    const { error } = await client.auth.signInWithPassword({ email: identifier, password });
    fail(error, "بيانات الدخول غير صحيحة. تأكد من البريد وكلمة المرور أو استخدم نسيت كلمة السر.");
    const user = await currentUser();
    await audit("auth.login", "profile", user?.id, { email: identifier }).catch(() => null);
    return user;
  },
  forgotPassword: async (identifier) => {
    const client = await sb();
    const email = String(identifier || "").trim();
    if (!email || !email.includes("@")) throw new Error("اكتب البريد الإلكتروني الصحيح أولًا لإرسال رابط إعادة التعيين.");
    const redirectTo = `${location.origin}${location.pathname}#settings`;
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
    fail(error, "تعذر إرسال رابط إعادة تعيين كلمة المرور.");
    await audit("auth.password_reset_requested", "profile", email, { email }).catch(() => null);
    return { sent: true };
  },
  logout: async () => {
    const client = await sb();
    await client.auth.signOut();
    return { ok: true };
  },
  changePassword: async (body = {}) => {
    const client = await sb();
    const user = await currentUser();
    if (!user?.email) throw new Error("لا توجد جلسة نشطة.");
    const verify = await client.auth.signInWithPassword({ email: user.email, password: body.currentPassword });
    fail(verify.error, "كلمة المرور الحالية غير صحيحة.");
    const { error } = await client.auth.updateUser({ password: body.newPassword });
    fail(error, "تعذر تغيير كلمة المرور.");
    await client.from("profiles").update({ must_change_password: false, temporary_password: false, password_changed_at: now() }).eq("id", user.id);
    await audit("auth.password_changed", "profile", user.id, { passwordChangedAt: now() });
    return { changed: true };
  },
  employees: async () => {
    const c = await core();
    const data = (await selectAll("employees", "*", { limit: 1000 }))
      .filter((row) => row.is_deleted !== true)
      .sort((a, b) => String(a.full_name || "").localeCompare(String(b.full_name || ""), "ar"));
    const employees = (data || []).map((row) => enrichEmployee(row, c));
    const byId = new Map(employees.map((e) => [e.id, e]));
    employees.forEach((e) => { e.manager = byId.get(e.managerEmployeeId) || null; });
    return employees;
  },
  employee: async (id) => employeeById(id),
  createEmployee: async (body = {}) => {
    const client = await sb();
    const payload = toEmployeePayload(body);
    const { data, error } = await client.from("employees").insert(payload).select("*").single();
    fail(error, "تعذر إنشاء الموظف.");
    if (body.createUser && body.email) await supabaseEndpoints.createUser({ ...body, employeeId: data.id }).catch((e) => console.warn(e));
    await audit("create", "employee", data.id, data);
    return enrichEmployee(data, await core());
  },
  updateEmployee: async (id, body = {}) => {
    const client = await sb();
    const { data, error } = await client.from("employees").update(toEmployeePayload(body)).eq("id", id).select("*").single();
    fail(error, "تعذر تعديل الموظف.");
    await audit("update", "employee", id, data);
    return enrichEmployee(data, await core());
  },
  setEmployeeStatus: async (id, status) => supabaseEndpoints.updateEmployee(id, { status, isActive: !["INACTIVE", "SUSPENDED", "TERMINATED", "DISABLED"].includes(status) }),
  deleteEmployee: async (id) => supabaseEndpoints.updateEmployee(id, { isDeleted: true, status: "INACTIVE" }),
  assignShift: async (id, body = {}) => {
    const client = await sb();
    const { error } = await client.from("employees").update({ shift_id: body.shiftId }).eq("id", id);
    fail(error, "تعذر تعيين الوردية.");
    await audit("assign_shift", "employee", id, body);
    return { ok: true };
  },
  users: async () => {
    const c = await core();
    const data = (await selectAll("profiles", "*", { limit: 1000 }))
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    return (data || []).map((row) => enrichProfile(row, c));
  },
  createUser: async (body = {}) => {
    const client = await sb();
    const { data, error } = await client.functions.invoke("admin-create-user", { body });
    fail(error || (data?.error ? new Error(data.error) : null), "تعذر إنشاء مستخدم Supabase. تأكد من نشر Edge Function admin-create-user.");
    const created = data?.user || data;
    if (body.avatarUrl && created?.id) {
      await client.from("profiles").update({ avatar_url: body.avatarUrl }).eq("id", created.id).catch(() => null);
      created.avatarUrl = body.avatarUrl;
    }
    return created;
  },
  updateUser: async (id, body = {}) => {
    const client = await sb();
    const payload = compact({ full_name: body.name || body.fullName, avatar_url: body.avatarUrl || body.photoUrl, employee_id: body.employeeId, role_id: body.roleId, branch_id: body.branchId, department_id: body.departmentId, governorate_id: body.governorateId, complex_id: body.complexId, status: body.status });
    const { data, error } = await client.from("profiles").update(payload).eq("id", id).select("*").single();
    fail(error, "تعذر تعديل المستخدم.");
    await audit("update", "profile", id, data);
    return enrichProfile(data, await core());
  },
  setUserStatus: async (id, status) => supabaseEndpoints.updateUser(id, { status }),
  dashboard: async () => {
    const client = await sb();
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const [empCount, todayEventCount, pendingLeaves, pendingMissions, leavesToday, latestEvents, latestAudit] = await Promise.all([
      client.from('employees').select('id', { count: 'exact', head: true }).eq('is_deleted', false),
      client.from('attendance_events').select('id', { count: 'exact', head: true }).gte('event_at', `${today}T00:00:00`).lt('event_at', `${tomorrow}T00:00:00`),
      client.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'PENDING'),
      client.from('missions').select('id', { count: 'exact', head: true }).eq('status', 'PENDING'),
      client.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'APPROVED').lte('start_date', today).gte('end_date', today),
      client.from('attendance_events').select('*, employee:employees(*)').order('event_at', { ascending: false }).limit(8),
      client.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(20),
    ]);
    [empCount, todayEventCount, pendingLeaves, pendingMissions, leavesToday, latestEvents, latestAudit].forEach((res) => fail(res.error));
    const events = (latestEvents.data || []).map((row) => { const { employee, ...event } = row; return { ...mapEvent(event), employee: employee ? enrichEmployee(employee) : null }; });
    return {
      cards: { employees: empCount.count || 0, presentToday: todayEventCount.count || 0, pendingRequests: (pendingLeaves.count || 0) + (pendingMissions.count || 0), leavesToday: leavesToday.count || 0 },
      metrics: [
        { label: 'الموظفون', value: empCount.count || 0, helper: 'حسب صلاحياتك' },
        { label: 'بصمات اليوم', value: todayEventCount.count || 0, helper: 'من قاعدة البيانات مباشرة' },
        { label: 'طلبات معلقة', value: (pendingLeaves.count || 0) + (pendingMissions.count || 0), helper: 'إجازات ومأموريات' },
        { label: 'Supabase', value: 'Live', helper: 'Realtime/RLS' },
      ],
      attendanceBreakdown: ['CHECK_IN', 'CHECK_OUT', 'LATE', 'REJECTED'].map((type) => ({ label: type, value: events.filter((e) => e.type === type || e.status === type).length })),
      attendanceTrends: ['CHECK_IN', 'CHECK_OUT', 'LATE', 'REJECTED'].map((type) => ({ label: type, present: events.filter((e) => e.type === type || e.status === type).length, late: 0, mission: 0 })),
      latestEvents: events,
      latestAudit: toCamel(latestAudit.data || []),
    };
  },
  health: async () => {
    const client = await sb();
    const start = performance.now();
    const { error } = await client.from("roles").select("id", { count: "exact", head: true });
    return { mode: "Supabase", database: error ? "ERROR" : "OK", latencyMs: Math.round(performance.now() - start), realtime: CONFIG().realtime?.enabled ? "ENABLED" : "DISABLED", storage: "Supabase Storage", generatedAt: now() };
  },
  attendanceEvents: async (params = {}) => {
    const client = await sb();
    const maxRows = Math.max(Number(params.limit || 20000), 1);
    const pageSize = Math.min(maxRows, 1000);
    const rows = [];
    for (let from = 0; from < maxRows; from += pageSize) {
      let query = client.from("attendance_events").select("*, employee:employees(*)").order("event_at", { ascending: false });
      if (params.from) query = query.gte("event_at", `${params.from}T00:00:00`);
      if (params.to) query = query.lte("event_at", `${params.to}T23:59:59`);
      if (params.employeeId) query = query.eq("employee_id", params.employeeId);
      if (params.type) query = query.eq("type", params.type);
      if (params.review === "review") query = query.eq("requires_review", true);
      if (params.review === "approved") query = query.eq("requires_review", false);
      const to = Math.min(from + pageSize - 1, maxRows - 1);
      const { data, error } = await query.range(from, to);
      fail(error);
      rows.push(...(data || []));
      if ((data || []).length < (to - from + 1)) break;
    }
    if (rows.length >= maxRows) console.warn("[attendance_events] تم الوصول للحد الأقصى، استخدم فلترة التاريخ لتخفيف الحمل.");
    return rows.map((row) => { const { employee, ...event } = row; return { ...mapEvent(event), employee: employee ? enrichEmployee(employee) : null }; });
  },
  attendanceDaily: async (params = {}) => {
    const rows = await tableRows("attendance_daily", "date", false, { fromDate: params.from, toDate: params.to, dateColumn: "date", limit: params.limit || 1000, maxRows: params.maxRows || 20000 });
    const employees = await supabaseEndpoints.employees();
    const byId = new Map(employees.map((e) => [e.id, e]));
    return rows
      .filter((row) => !params.employeeId || row.employee_id === params.employeeId)
      .map((row) => ({ ...toCamel(row), employee: byId.get(row.employee_id) || null }));
  },
  attendanceAddress: async () => attendanceAddress(),
  myAttendanceEvents: async () => {
    const emp = await myEmployee();
    const events = await supabaseEndpoints.attendanceEvents();
    return events.filter((e) => e.employeeId === emp.id);
  },
  evaluateGeofence: async (body = {}) => evaluateGeo(await attendanceAddress(body.employeeId ? await employeeById(body.employeeId) : null), body),
  checkIn: (body = {}) => recordPunch("CHECK_IN", body, body.employeeId),
  checkOut: (body = {}) => recordPunch("CHECK_OUT", body, body.employeeId),
  selfCheckIn: (body = {}) => recordPunch("CHECK_IN", body),
  selfCheckOut: (body = {}) => recordPunch("CHECK_OUT", body),
  regenerateAttendance: async () => ({ generated: 0, message: "في Supabase يتم تحديث اليومية عند كل بصمة، ويمكن إضافة Cron لاحقًا." }),
  manualAttendance: async (body = {}) => recordManualPunch(body.type || "CHECK_IN", body, body.employeeId),
  adjustAttendance: async (body = {}) => createOrUpdate("attendance_exceptions", body),
  missions: async () => {
    const rows = await tableRows("missions", "created_at", false);
    const employees = await supabaseEndpoints.employees();
    const byId = new Map(employees.map((e) => [e.id, e]));
    return rows.map((r) => ({ ...toCamel(r), employee: byId.get(r.employee_id) || null }));
  },
  createMission: async (body = {}) => createOrUpdate("missions", body),
  updateMission: async (id, action) => createOrUpdate("missions", { status: action === "reject" ? "REJECTED" : action === "complete" ? "COMPLETED" : "APPROVED" }, id),
  leaves: async () => {
    const rows = await tableRows("leave_requests", "created_at", false);
    const employees = await supabaseEndpoints.employees();
    const byId = new Map(employees.map((e) => [e.id, e]));
    return rows.map((r) => ({ ...toCamel(r), employee: byId.get(r.employee_id) || null }));
  },
  createLeave: async (body = {}) => createOrUpdate("leave_requests", body),
  updateLeave: async (id, action) => createOrUpdate("leave_requests", { status: action === "reject" ? "REJECTED" : "APPROVED" }, id),
  exceptions: async () => tableRows("attendance_exceptions", "created_at", false).then(toCamel),
  updateException: async (id, action) => createOrUpdate("attendance_exceptions", { status: action === "reject" ? "REJECTED" : "APPROVED" }, id),
  notifications: async () => tableRows("notifications", "created_at", false).then(toCamel),
  markNotificationRead: async (id) => createOrUpdate("notifications", { status: "READ", is_read: true, read_at: now() }, id),
  reports: async () => supabaseEndpoints.attendanceEvents(),
  createReport: async () => ({ ok: true }),
  settings: async () => ({ orgName: "جمعية خواطر أحلى شباب الخيرية", backend: "Supabase" }),
  updateSettings: async (body) => body,
  kpi: async () => {
    const [employees, evaluations] = await Promise.all([supabaseEndpoints.employees(), tableRows("kpi_evaluations", "created_at", false).then(toCamel)]);
    const user = await currentUser();
    const rolePerms = new Set(user?.permissions || []);
    const accessMode = rolePerms.has("*") || rolePerms.has("kpi:manage") ? "all" : rolePerms.has("kpi:team") ? "team" : "self";
    const currentEmployeeId = user?.employeeId || "";
    const visible = accessMode === "self" ? evaluations.filter((e) => e.employeeId === currentEmployeeId) : accessMode === "team" ? evaluations.filter((e) => employees.find((emp) => emp.id === e.employeeId)?.managerEmployeeId === currentEmployeeId) : evaluations;
    return { accessMode, currentEmployeeId, policy: { evaluationStartDay: 20, evaluationEndDay: 25, submissionDeadlineDay: 25, description: "تقييم شهري من 20 إلى 25" }, criteria: [], cycle: { id: new Date().toISOString().slice(0, 7), name: "تقييم الشهر الحالي" }, evaluations: visible, pendingEmployees: employees.filter((emp) => !visible.some((e) => e.employeeId === emp.id)), metrics: [{ label: "التقييمات", value: visible.length }, { label: "بانتظار التقييم", value: employees.length - visible.length }] };
  },
  saveKpiEvaluation: async (body = {}) => createOrUpdate("kpi_evaluations", body),
  updateKpiEvaluation: async (id, body = {}) => createOrUpdate("kpi_evaluations", body, id),
  disputes: async () => tableRows("dispute_cases", "created_at", false).then(toCamel),
  createDispute: async (body = {}) => createOrUpdate("dispute_cases", body),
  updateDispute: async (id, body = {}) => createOrUpdate("dispute_cases", body, id),
  locations: async () => {
    const [requests, locations, employees] = await Promise.all([
      tableRows("location_requests", "created_at", false).then(toCamel),
      tableRows("employee_locations", "created_at", false).then(toCamel),
      supabaseEndpoints.employees().catch(() => []),
    ]);
    const byId = new Map((employees || []).map((employee) => [employee.id, employee]));
    return [...requests, ...locations]
      .map((item) => ({ ...item, employee: byId.get(item.employeeId) || null }))
      .sort((a, b) => new Date(b.createdAt || b.requestedAt || b.date || 0) - new Date(a.createdAt || a.requestedAt || a.date || 0));
  },
  createLocationRequest: async (body = {}) => {
    const request = await createOrUpdate("location_requests", {
      employeeId: body.employeeId,
      purpose: body.purpose || "فتح الموقع وإرسال اللوكيشن المباشر",
      requestReason: "",
      status: "PENDING",
      requestedAt: now(),
    });
    try {
      const client = await sb();
      const { data: employee } = await client.from("employees").select("id,user_id,full_name").eq("id", request.employeeId).maybeSingle();
      await client.from("notifications").insert({
        user_id: employee?.user_id || null,
        employee_id: request.employeeId,
        title: "فتح الموقع وإرسال اللوكيشن",
        body: "من فضلك افتح صفحة طلبات وسجل المواقع واضغط إرسال موقعي الآن.",
        type: "ACTION_REQUIRED",
        status: "UNREAD",
        is_read: false,
      });
    } catch (error) {
      console.warn("تعذر إنشاء إشعار الموقع، تم حفظ الطلب فقط.", error);
    }
    return request;
  },
  updateLocationRequest: async (id, body = {}) => createOrUpdate("location_requests", body, id),
  recordLocation: async (body = {}) => createOrUpdate("employee_locations", { ...body, employeeId: body.employeeId || (await myEmployee()).id }),
  queue: async () => ({ items: getQueued(), pending: getQueued().filter((i) => i.status === "PENDING").length }),
  permissions: async () => selectAll("permissions").then(toCamel),
  roles: async () => selectAll("roles").then((rows) => rows.map((r) => ({ ...toCamel(r), permissions: rolePermissions(toCamel(r)) }))),
  saveRole: async (body = {}) => createOrUpdate("roles", { ...body, permissions: Array.isArray(body.permissions) ? body.permissions : String(body.permissions || "").split(",").map((s) => s.trim()).filter(Boolean) }, body.id),
  branches: async () => selectAll("branches").then(toCamel),
  departments: async () => selectAll("departments").then(toCamel),
  governorates: async () => selectAll("governorates").then(toCamel),
  complexes: async () => selectAll("complexes").then(toCamel),
  listOrg: async (kind) => selectAll(kind).then(toCamel),
  saveOrg: async (kind, body = {}) => createOrUpdate(kind, body, body.id),
  deleteOrg: async (kind, id) => createOrUpdate(kind, { isDeleted: true, active: false }, id),
  shifts: async () => selectAll("shifts").then(toCamel),
  saveShift: async (body = {}) => createOrUpdate("shifts", body, body.id),
  deleteShift: async (id) => createOrUpdate("shifts", { isActive: false }, id),
  auditLogs: async (params = {}) => tableRows("audit_logs", "created_at", false, { limit: params.limit || 100, page: params.page || 0 }).then(toCamel),
  backup: async () => {
    const tables = ["roles", "profiles", "employees", "branches", "departments", "attendance_daily", "leave_requests", "missions", "kpi_evaluations"];
    const out = { note: "نسخة خفيفة من المتصفح. استخدم Edge Function للنسخ الكامل الثقيل." };
    for (const table of tables) out[table] = await selectAll(table, "*", { limit: 1000 }).catch(() => []);
    return out;
  },
  restoreBackup: async () => ({ ok: false, message: "الاسترجاع الكامل في Supabase يجب أن يتم عبر SQL/Edge Function بصلاحية service_role." }),
  importEmployees: async (rows = []) => {
    const client = await sb();
    const payload = rows.map((row) => toEmployeePayload({ employeeCode: row.employeeCode || row.code || row["كود الموظف"], fullName: row.fullName || row.name || row["الاسم"], phone: row.phone || row["الموبايل"], email: row.email || row["البريد"], jobTitle: row.jobTitle || row["الوظيفة"], status: row.status || "ACTIVE" }));
    const { data, error } = await client.from("employees").insert(payload).select("id");
    fail(error, "تعذر استيراد الموظفين.");
    await audit("import", "employees", "bulk", { count: data?.length || 0 });
    return { created: data?.length || 0 };
  },
  uploadAvatar: async (file) => uploadFile(CONFIG().storage?.avatarsBucket || "avatars", "avatars", file),
  attachments: async (scope, entityId) => tableRows("attachments", "created_at", false).then((rows) => toCamel(rows).filter((a) => (!scope || a.scope === scope) && (!entityId || a.entityId === entityId || a.employeeId === entityId))),
  uploadAttachment: async (file, body = {}) => {
    const url = await uploadFile(CONFIG().storage?.attachmentsBucket || "employee-attachments", body.employeeId || body.entityId || "general", file);
    return createOrUpdate("attachments", { ...body, fileName: file.name, originalName: file.name, mimeType: file.type, sizeBytes: file.size, url });
  },
  realtimeSnapshot: async () => {
    const dashboard = await supabaseEndpoints.dashboard();
    const locations = await tableRows("employee_locations", "created_at", false).then(toCamel);
    return { dashboard, locations, heatmap: locations.map((loc) => ({ employeeId: loc.employeeId, latitude: loc.latitude, longitude: loc.longitude, weight: 1 })), realtime: { transport: "Supabase Realtime", updatedAt: now() } };
  },
  aiAnalytics: async () => {
    const [employees, daily] = await Promise.all([supabaseEndpoints.employees(), supabaseEndpoints.attendanceDaily()]);
    return { generatedAt: now(), note: "تحليل تقديري مبني على سجلات Supabase. لا يتخذ قرارات تلقائية.", rows: employees.map((employee) => { const days = daily.filter((d) => d.employeeId === employee.id); const absences = days.filter((d) => d.status === "ABSENT").length; const lateMinutes = days.reduce((s, d) => s + Number(d.lateMinutes || 0), 0); const riskScore = Math.min(100, absences * 22 + Math.ceil(lateMinutes / 30) * 7); return { employee, employeeId: employee.id, absences, lateMinutes, riskScore, productivityHint: riskScore >= 60 ? "يحتاج متابعة عاجلة" : riskScore >= 30 ? "متوسط المخاطر" : "مستقر" }; }).sort((a, b) => b.riskScore - a.riskScore) };
  },
  integrations: async () => tableRows("integration_settings", "created_at", false).then(toCamel),
  saveIntegration: async (body = {}) => createOrUpdate("integration_settings", body, body.id),
  payrollPreview: async (body = {}) => {
    const employees = await supabaseEndpoints.employees();
    const daily = await supabaseEndpoints.attendanceDaily();
    const from = body.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const to = body.to || new Date().toISOString().slice(0, 10);
    return { from, to, rows: employees.map((employee) => { const days = daily.filter((d) => d.employeeId === employee.id && d.date >= from && d.date <= to); const workMinutes = days.reduce((sum, day) => sum + Number(day.workMinutes || 0), 0); const plannedMinutes = days.length * 480; return { employee, employeeId: employee.id, workHours: Math.round(workMinutes / 60 * 100) / 100, plannedHours: Math.round(plannedMinutes / 60 * 100) / 100, overtimeHours: Math.max(0, Math.round((workMinutes - plannedMinutes) / 60 * 100) / 100), absenceDays: days.filter((d) => d.status === "ABSENT").length }; }) };
  },
  payrollExports: async () => tableRows("payroll_exports", "created_at", false).then(toCamel),
  createPayrollExport: async (body = {}) => createOrUpdate("payroll_exports", { ...body, provider: body.provider || "manual-csv", status: "READY", payload: await supabaseEndpoints.payrollPreview(body) }),
  accessControlEvents: async () => tableRows("access_control_events", "created_at", false).then(toCamel),
  createAccessEvent: async (body = {}) => createOrUpdate("access_control_events", body),
  subscribePush: async (body = {}) => createOrUpdate("push_subscriptions", body),
  passkeyStatus: async () => tableRows("passkey_credentials", "created_at", false).then(toCamel),
  registerPasskey: async (body = {}) => {
    const client = await sb();
    const { data, error } = await client.functions.invoke("passkey-register", { body });
    if (error || data?.error) throw new Error(data?.message || data?.error || error?.message || "مفاتيح المرور غير مفعلة بعد.");
    return data;
  },
  offlineQueue: async () => getQueued(),
  syncOfflineQueue: async () => {
    const rows = getQueued();
    let synced = 0;
    for (const item of rows.filter((i) => i.status === "PENDING")) {
      try {
        item.status = "SYNCED"; item.syncedAt = now(); synced += 1;
      } catch (error) { item.attempts = Number(item.attempts || 0) + 1; item.error = error.message; }
    }
    const remainingRows = rows.filter((i) => i.status === "PENDING");
    setQueued(remainingRows);
    return { synced, remaining: remainingRows.length };
  },
  reset: async () => ({ ok: true, message: "إعادة الضبط في Supabase تتم من SQL Editor أو عبر حذف بيانات الجداول." }),
};

export async function subscribeSupabaseRealtime(onChange) {
  if (!shouldUseSupabase()) return () => {};
  const client = await sb();
  realtimeChannels.forEach((channel) => client.removeChannel(channel));
  realtimeChannels = ["attendance_events", "employee_locations", "leave_requests", "missions", "kpi_evaluations"].map((table) => client.channel(`hr-${table}`).on("postgres_changes", { event: "*", schema: "public", table }, (payload) => onChange?.(table, payload)).subscribe());
  return () => realtimeChannels.forEach((channel) => client.removeChannel(channel));
}
