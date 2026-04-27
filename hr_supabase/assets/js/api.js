import { seedDatabase } from "./database.js?v=login-punch-fix-20260427-8";
import { supabaseEndpoints, shouldUseSupabase, supabaseModeIsStrict } from "./supabase-api.js?v=login-punch-fix-20260427-8";

const STORAGE_KEY = "hr-attendance.local-db.v7";
const LEGACY_KEYS = ["hr-attendance.local-db.v6", "hr-attendance.local-db.v5", "hr-attendance.local-db.v4", "hr-attendance.local-db.v3"];
const SESSION_KEY = "hr-attendance.session-user";
const clone = (value) => JSON.parse(JSON.stringify(value ?? null));

function makeId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${uuid}`;
}

function now() {
  return new Date().toISOString();
}

function findById(items = [], id) {
  return items.find((item) => item.id === id) || null;
}

function normalizeDb(db) {
  const base = clone(seedDatabase);
  if (db?.meta?.orgProfile !== "ahla-shabab-manil-shiha-v2") db = {};
  const merged = { ...base, ...db };
  for (const key of Object.keys(base)) {
    if (Array.isArray(base[key])) merged[key] = Array.isArray(merged[key]) ? merged[key] : clone(base[key]);
  }
  merged.meta = { ...(base.meta || {}), ...(merged.meta || {}), normalizedAt: now() };
  merged.permissions ||= clone(base.permissions);
  if (!merged.permissions.some((permission) => permission.scope === "attendance:self")) merged.permissions.push({ id: "perm-attendance-self", scope: "attendance:self", name: "تسجيل بصمة الموظف" });
  if (!merged.permissions.some((permission) => permission.scope === "kpi:self")) merged.permissions.push({ id: "perm-kpi-self", scope: "kpi:self", name: "تقييم ذاتي للموظف" });
  if (!merged.permissions.some((permission) => permission.scope === "kpi:team")) merged.permissions.push({ id: "perm-kpi-team", scope: "kpi:team", name: "اعتماد تقييمات الفريق المباشر" });
  for (const [scope, name] of [
  ["realtime:view", "عرض اللوحة اللحظية"],
  ["integrations:manage", "إدارة التكاملات"],
  ["payroll:manage", "تكامل الرواتب"],
  ["ai:view", "تحليلات الذكاء الاصطناعي"],
  ["access_control:manage", "تكامل أجهزة البوابات"],
  ["offline:manage", "مزامنة Offline"],
  ]) {
    if (!merged.permissions.some((permission) => permission.scope === scope)) merged.permissions.push({ id: `perm-${scope.replace(/[^a-z0-9]+/gi, "-")}`, scope, name });
  }
  const employeeRole = merged.roles.find((role) => role.slug === "employee" || role.key === "EMPLOYEE");
  if (employeeRole) employeeRole.permissions ||= [];
  if (employeeRole && !employeeRole.permissions.includes("attendance:self")) employeeRole.permissions.push("attendance:self");
  if (employeeRole && !employeeRole.permissions.includes("kpi:self")) employeeRole.permissions.push("kpi:self");
  if (employeeRole && !employeeRole.permissions.includes("disputes:create")) employeeRole.permissions.push("disputes:create");
  if (employeeRole && !employeeRole.permissions.includes("location:self")) employeeRole.permissions.push("location:self");
  for (const role of merged.roles || []) {
    if (["role-admin", "role-executive", "role-executive-secretary", "role-hr"].includes(role.id) || ["admin", "executive", "executive-secretary", "hr-manager"].includes(role.slug)) role.permissions = ["*"];
  }
  merged.auditLogs ||= [];
  merged.shifts ||= clone(base.shifts);
  merged.attendanceDaily ||= [];
  merged.locationRequests ||= [];
  merged.attachments ||= [];
  merged.shiftAssignments ||= [];
  merged.kpiPolicy ||= clone(base.kpiPolicy || {});
  merged.kpiCycles ||= clone(base.kpiCycles || []);
  merged.kpiCriteria ||= clone(base.kpiCriteria || []);
  merged.kpiEvaluations ||= clone(base.kpiEvaluations || []);
  merged.kpiSummaries ||= [];
  merged.disputeCommittee ||= clone(base.disputeCommittee || {});
  merged.disputeCases ||= clone(base.disputeCases || []);
  merged.integrationSettings ||= clone(base.integrationSettings || []);
  merged.passkeyCredentials ||= clone(base.passkeyCredentials || []);
  merged.pushSubscriptions ||= clone(base.pushSubscriptions || []);
  merged.offlineQueue ||= clone(base.offlineQueue || []);
  merged.payrollExports ||= clone(base.payrollExports || []);
  merged.reportSchedules ||= clone(base.reportSchedules || []);
  merged.accessControlEvents ||= clone(base.accessControlEvents || []);
  return merged;
}

function loadDb() {
  let raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    for (const key of LEGACY_KEYS) {
      const legacy = localStorage.getItem(key);
      if (legacy) {
        raw = legacy;
        break;
      }
    }
  }
  if (!raw) {
    const db = normalizeDb(seedDatabase);
    saveDb(db);
    return db;
  }
  try {
    const db = normalizeDb(JSON.parse(raw));
    saveDb(db);
    return db;
  } catch {
    const db = normalizeDb(seedDatabase);
    saveDb(db);
    return db;
  }
}

function saveDb(db) {
  db.meta = { ...(db.meta || {}), updatedAt: now(), version: 7, orgProfile: "ahla-shabab-manil-shiha-v2" };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

async function ok(value) {
  return clone(value);
}

export function unwrap(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (payload?.data != null) return payload.data;
  return payload;
}

function currentUser(db = loadDb()) {
  const userId = sessionStorage.getItem(SESSION_KEY);
  const user = findById(db.users, userId);
  return user ? enrichUser(db, user) : null;
}

function audit(db, action, entityType, entityId, beforeData, afterData, meta = {}) {
  const actor = currentUser(db);
  db.auditLogs.unshift({
    id: makeId("audit"),
    action,
    entityType,
    entityId: entityId || "",
    actor: actor?.name || actor?.fullName || actor?.email || "System",
    actorUserId: actor?.id || "",
    beforeData: beforeData ? clone(beforeData) : null,
    afterData: afterData ? clone(afterData) : null,
    metadata: meta,
    createdAt: now(),
  });
  db.auditLogs = db.auditLogs.slice(0, 1500);
}

function notify(db, title, body = "", type = "INFO") {
  db.notifications.unshift({
    id: makeId("not"),
    title,
    body,
    status: "UNREAD",
    isRead: false,
    type,
    createdAt: now(),
  });
}

function enrichEmployee(db, employee) {
  if (!employee) return null;
  const user = db.users.find((item) => item.employeeId === employee.id) || findById(db.users, employee.userId);
  return {
    ...employee,
    role: findById(db.roles, employee.roleId),
    branch: findById(db.branches, employee.branchId),
    department: findById(db.departments, employee.departmentId),
    governorate: findById(db.governorates, employee.governorateId),
    complex: findById(db.complexes, employee.complexId),
    manager: findById(db.employees, employee.managerEmployeeId),
    shift: findById(db.shifts, employee.shiftId),
    user: user || null,
  };
}

function enrichUser(db, user) {
  if (!user) return null;
  const employee = findById(db.employees, user.employeeId);
  const role = findById(db.roles, user.roleId);
  return {
    ...user,
    fullName: user.name || user.fullName,
    avatarUrl: user.avatarUrl || user.photoUrl || employee?.photoUrl || "",
    photoUrl: user.photoUrl || user.avatarUrl || employee?.photoUrl || "",
    employee: employee ? enrichEmployee(db, employee) : null,
    role,
    permissions: role?.permissions || [],
    branch: findById(db.branches, user.branchId || employee?.branchId),
    department: findById(db.departments, user.departmentId || employee?.departmentId),
    governorate: findById(db.governorates, user.governorateId || employee?.governorateId),
    complex: findById(db.complexes, user.complexId || employee?.complexId),
  };
}

function enrichByEmployee(db, item) {
  const employee = findById(db.employees, item.employeeId);
  return { ...item, employee: employee ? enrichEmployee(db, employee) : null };
}

function visibleEmployees(db) {
  const ids = scopedEmployeeIds(db);
  return db.employees.filter((employee) => !employee.isDeleted && ids.has(employee.id)).map((employee) => enrichEmployee(db, employee));
}

function activeItems(db, key) {
  return (db[key] || []).filter((item) => item.active !== false && !item.isDeleted);
}

function permissionsOf(user) {
  return new Set(user?.permissions || []);
}

function hasLocalScope(db, scope) {
  const user = currentUser(db);
  const permissions = permissionsOf(user);
  const role = String(user?.role?.slug || user?.role?.key || user?.roleId || "").toLowerCase();
  return permissions.has("*") || permissions.has(scope) || ["role-admin", "role-executive", "role-executive-secretary", "role-hr", "admin", "executive", "executive-secretary", "hr-manager"].includes(role);
}

function isFullAccessUser(db) {
  return hasLocalScope(db, "*");
}

function scopedEmployeeIds(db, { includeTeam = true } = {}) {
  if (isFullAccessUser(db)) return new Set((db.employees || []).filter((e) => !e.isDeleted).map((e) => e.id));
  const user = currentUser(db);
  const ids = new Set();
  if (user?.employeeId) ids.add(user.employeeId);
  if (includeTeam && user?.employeeId && hasLocalScope(db, "kpi:team")) {
    (db.employees || []).forEach((employee) => {
      if (employee.managerEmployeeId === user.employeeId && !employee.isDeleted) ids.add(employee.id);
    });
  }
  return ids;
}

function canSeeEmployee(db, employeeId) {
  return scopedEmployeeIds(db).has(employeeId);
}

function scopedRowsByEmployee(db, rows = []) {
  const ids = scopedEmployeeIds(db);
  return rows.filter((row) => !row.employeeId || ids.has(row.employeeId));
}

function distanceMeters(a, b) {
  if (![a?.latitude, a?.longitude, b?.latitude, b?.longitude].every((value) => Number.isFinite(Number(value)))) return null;
  const toRad = (value) => (Number(value) * Math.PI) / 180;
  const radius = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * radius * Math.asin(Math.sqrt(h)));
}

function statusFromTime(db, employee, when = new Date()) {
  // لا نعتمد على الوردية. وقت الدوام الرسمي للمتابعة فقط: 10:00 صباحًا إلى 6:00 مساءً، ولا يمنع البصمة قبل/بعد الوقت طالما داخل المجمع.
  const start = new Date(when);
  start.setHours(10, 0, 0, 0);
  const lateMinutes = Math.max(0, Math.round((when - start) / 60000));
  return { status: lateMinutes > 0 ? "LATE" : "PRESENT", lateMinutes };
}

function activeMissionForEmployee(db, employeeId, at = new Date()) {
  return db.missions.find((mission) => {
    if (mission.employeeId !== employeeId) return false;
    if (!["APPROVED", "IN_PROGRESS"].includes(mission.status)) return false;
    const start = mission.plannedStart ? new Date(mission.plannedStart) : null;
    const end = mission.plannedEnd ? new Date(mission.plannedEnd) : null;
    return (!start || at >= start) && (!end || at <= end);
  }) || null;
}

function branchTarget(branch) {
  if (!branch || !Number.isFinite(Number(branch.latitude)) || !Number.isFinite(Number(branch.longitude))) return null;
  return { latitude: Number(branch.latitude), longitude: Number(branch.longitude) };
}

function geofenceMessage(evaluation = {}) {
  if (evaluation.geofenceStatus === "inside_branch") return "الموقع داخل العنوان المحدد ويمكن تسجيل البصمة.";
  if (evaluation.geofenceStatus === "inside_branch_low_accuracy") return "تم قبول الموقع داخل نطاق المجمع مع دقة GPS ضعيفة. يفضل تشغيل GPS/Location عالي الدقة.";
  if (evaluation.geofenceStatus === "outside_branch") return "أنت خارج نطاق العنوان المحدد. المسافة الحالية " + (evaluation.distanceFromBranchMeters ?? "غير معروفة") + " متر، والنطاق المسموح " + (evaluation.radiusMeters ?? "-") + " متر.";
  if (evaluation.geofenceStatus === "location_low_accuracy") return "دقة الموقع غير كافية. الدقة الحالية " + (evaluation.accuracyMeters ?? "-") + " متر، والحد الأقصى " + (evaluation.maxAccuracyMeters ?? "-") + " متر.";
  if (evaluation.geofenceStatus === "branch_location_missing") return "لم يتم ضبط إحداثيات الفرع/العنوان لهذا الموظف. اضبط Latitude و Longitude ونطاق الحضور من صفحة الفروع.";
  if (evaluation.geofenceStatus === "branch_unknown") return "الموظف غير مربوط بفرع له عنوان حضور.";
  if (evaluation.geofenceStatus === "permission_denied") return "تم رفض صلاحية الموقع. يجب السماح للمتصفح بالموقع قبل تسجيل البصمة.";
  return "تعذر قراءة الموقع الحالي. فعّل GPS/Location ثم حاول مرة أخرى.";
}

function attendanceAddressForEmployee(db, employeeId) {
  const employee = findById(db.employees, employeeId);
  const branch = employee ? findById(db.branches, employee.branchId) : null;
  const target = branchTarget(branch);
  return {
    employee: employee ? enrichEmployee(db, employee) : null,
    branch,
    address: branch?.address || "",
    hasConfiguredAddress: Boolean(target),
    latitude: target?.latitude ?? null,
    longitude: target?.longitude ?? null,
    radiusMeters: Number(branch?.geofenceRadiusMeters || branch?.radiusMeters || 200),
    maxAccuracyMeters: Math.max(Number(branch?.maxAccuracyMeters || branch?.max_accuracy_meters || 0), 2000),
    strictGeofence: true,
  };
}

function evaluateAttendance(db, body, eventType) {
  const employee = findById(db.employees, body.employeeId);
  const branch = employee ? findById(db.branches, employee.branchId) : null;
  const currentLocation = Number.isFinite(Number(body.latitude)) && Number.isFinite(Number(body.longitude))
    ? { latitude: Number(body.latitude), longitude: Number(body.longitude) }
    : null;
  const branchLocation = branchTarget(branch);
  const activeMission = activeMissionForEmployee(db, body.employeeId);
  const timeStatus = statusFromTime(db, employee, new Date());
  const verificationStatus = body.verificationStatus || "verified";
  const riskFlags = [];
  let geofenceStatus = "unknown";
  let distanceFromBranchMeters = null;
  let requiresReview = false;
  let primaryStatus = eventType === "CHECK_OUT" ? "CHECK_OUT" : timeStatus.status;
  const radiusMeters = Number(branch?.geofenceRadiusMeters || branch?.radiusMeters || 300);
  const accuracyMeters = body.accuracyMeters != null ? Number(body.accuracyMeters) : null;
  const maxAccuracyMeters = Math.max(Number(branch?.maxAccuracyMeters || branch?.max_accuracy_meters || 0), 2000);

  if (timeStatus.lateMinutes > 0 && eventType !== "CHECK_OUT") riskFlags.push("late:" + timeStatus.lateMinutes);
  if (verificationStatus !== "verified") {
    requiresReview = true;
    riskFlags.push("verification_not_strong");
  }
  if (!currentLocation) {
    geofenceStatus = body.locationPermission === "denied" ? "permission_denied" : "location_unavailable";
    requiresReview = true;
    riskFlags.push(body.locationPermission === "denied" ? "location_denied" : "location_unknown");
  } else if (!employee || !branch) {
    geofenceStatus = "branch_unknown";
    requiresReview = true;
    riskFlags.push("branch_unknown");
  } else if (!branchLocation) {
    geofenceStatus = "branch_location_missing";
    requiresReview = true;
    riskFlags.push("branch_location_missing");
  } else {
    distanceFromBranchMeters = distanceMeters(currentLocation, branchLocation);
    const weakAccuracy = accuracyMeters != null && accuracyMeters > maxAccuracyMeters;
    const effectiveRadius = radiusMeters + (weakAccuracy ? Math.min(accuracyMeters, maxAccuracyMeters) : 0);
    if (distanceFromBranchMeters != null && distanceFromBranchMeters <= radiusMeters) {
      geofenceStatus = weakAccuracy ? "inside_branch_low_accuracy" : "inside_branch";
      if (weakAccuracy) riskFlags.push("location_low_accuracy_accepted");
    } else if (distanceFromBranchMeters != null && weakAccuracy && distanceFromBranchMeters <= effectiveRadius) {
      geofenceStatus = "inside_branch_low_accuracy";
      riskFlags.push("location_low_accuracy_accepted");
    } else if (activeMission && body.allowMissionPunch === true) {
      geofenceStatus = "inside_mission";
      primaryStatus = "MISSION";
    } else {
      geofenceStatus = weakAccuracy ? "location_low_accuracy" : "outside_branch";
      requiresReview = true;
      riskFlags.push(weakAccuracy ? "location_low_accuracy" : "geofence_miss");
      primaryStatus = eventType === "CHECK_OUT" ? "CHECKOUT_REVIEW" : "PRESENT_REVIEW";
    }
  }

  const canRecord = geofenceStatus === "inside_branch" || geofenceStatus === "inside_branch_low_accuracy";
  const blockReason = canRecord ? "" : geofenceMessage({ geofenceStatus, distanceFromBranchMeters, radiusMeters, accuracyMeters, maxAccuracyMeters });
  return {
    type: eventType === "CHECK_OUT" ? "CHECK_OUT" : "CHECK_IN",
    attendanceStatus: primaryStatus,
    verificationStatus,
    geofenceStatus,
    canRecord,
    blockReason,
    requiresReview,
    riskFlags,
    distanceFromBranchMeters,
    radiusMeters,
    accuracyMeters,
    maxAccuracyMeters,
    latitude: currentLocation?.latitude ?? null,
    longitude: currentLocation?.longitude ?? null,
    branchId: branch?.id || "",
    missionId: activeMission?.id || "",
    notes: body.notes || "",
    lateMinutes: eventType === "CHECK_OUT" ? 0 : timeStatus.lateMinutes,
  };
}

function upsertDailyFromEvent(db, employeeId, event) {
  const day = event.eventAt.slice(0, 10);
  let daily = db.attendanceDaily.find((item) => item.employeeId === employeeId && item.date === day);
  if (!daily) {
    daily = { id: makeId("day"), employeeId, date: day, status: event.type, lateMinutes: event.lateMinutes || 0, workMinutes: 0, requiresReview: Boolean(event.requiresReview), firstCheckInAt: "", lastCheckOutAt: "" };
    db.attendanceDaily.unshift(daily);
  }
  if (event.type === "CHECK_OUT" || event.type === "CHECKOUT_REVIEW") daily.lastCheckOutAt = event.eventAt;
  else {
    daily.firstCheckInAt ||= event.eventAt;
    daily.status = event.type;
    daily.lateMinutes = event.lateMinutes || daily.lateMinutes || 0;
  }
  if (daily.firstCheckInAt && daily.lastCheckOutAt) {
    daily.workMinutes = Math.max(0, Math.round((new Date(daily.lastCheckOutAt) - new Date(daily.firstCheckInAt)) / 60000));
  }
  daily.requiresReview = daily.requiresReview || Boolean(event.requiresReview);
}

function regenerateDailyLocal(db, body = {}) {
  const from = body.from ? new Date(body.from) : new Date(Date.now() - 30 * 86400000);
  const to = body.to ? new Date(body.to) : new Date();
  from.setHours(0, 0, 0, 0);
  to.setHours(0, 0, 0, 0);
  const employees = body.employeeId ? db.employees.filter((e) => e.id === body.employeeId) : db.employees.filter((e) => !e.isDeleted && e.status !== "TERMINATED");
  let generated = 0;
  for (const employee of employees) {
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      const events = db.attendanceEvents.filter((event) => event.employeeId === employee.id && String(event.eventAt).startsWith(key)).sort((a, b) => new Date(a.eventAt) - new Date(b.eventAt));
      let daily = db.attendanceDaily.find((item) => item.employeeId === employee.id && item.date === key);
      if (!daily) {
        daily = { id: makeId("day"), employeeId: employee.id, date: key, status: "ABSENT", lateMinutes: 0, workMinutes: 0, requiresReview: false, firstCheckInAt: "", lastCheckOutAt: "" };
        db.attendanceDaily.unshift(daily);
      }
      const leave = db.leaves.find((leave) => leave.employeeId === employee.id && leave.status === "APPROVED" && String(leave.startDate).slice(0, 10) <= key && String(leave.endDate).slice(0, 10) >= key);
      const mission = db.missions.find((mission) => mission.employeeId === employee.id && ["APPROVED", "IN_PROGRESS", "COMPLETED"].includes(mission.status) && String(mission.plannedStart || "").slice(0, 10) <= key && String(mission.plannedEnd || "").slice(0, 10) >= key);
      const first = events.find((event) => event.type !== "CHECK_OUT");
      const last = [...events].reverse().find((event) => event.type === "CHECK_OUT" || event.type === "CHECKOUT_REVIEW");
      daily.firstCheckInAt = first?.eventAt || "";
      daily.lastCheckOutAt = last?.eventAt || "";
      daily.status = leave ? "ON_LEAVE" : mission && !first ? "ON_MISSION" : first ? first.type : "ABSENT";
      daily.lateMinutes = first?.lateMinutes || 0;
      daily.workMinutes = first && last ? Math.max(0, Math.round((new Date(last.eventAt) - new Date(first.eventAt)) / 60000)) : 0;
      daily.requiresReview = events.some((event) => event.requiresReview) || Boolean(first && !last);
      generated += 1;
    }
  }
  audit(db, "regenerate", "attendance_daily", "bulk", null, { generated, from, to });
  return { generated, employees: employees.length, from: from.toISOString(), to: to.toISOString() };
}

function applyEmployeePayload(db, target, body) {
  const branch = findById(db.branches, body.branchId);
  Object.assign(target, {
    employeeCode: body.employeeCode?.trim() || target.employeeCode || `EMP-${Date.now()}`,
    fullName: body.fullName?.trim() || target.fullName || "موظف جديد",
    phone: body.phone?.trim() || "",
    email: body.email?.trim() || "",
    photoUrl: body.photoUrl || target.photoUrl || "",
    jobTitle: body.jobTitle?.trim() || "",
    roleId: body.roleId || target.roleId || db.roles.at(-1)?.id,
    branchId: body.branchId || target.branchId || db.branches[0]?.id,
    departmentId: body.departmentId || target.departmentId || db.departments[0]?.id,
    governorateId: body.governorateId || branch?.governorateId || target.governorateId || db.governorates[0]?.id,
    complexId: body.complexId || branch?.complexId || target.complexId || db.complexes[0]?.id,
    managerEmployeeId: body.managerEmployeeId || "",
    shiftId: body.shiftId || "",
    status: "ACTIVE",
    hireDate: body.hireDate || target.hireDate || new Date().toISOString().slice(0, 10),
  });
  return target;
}

function createUserRecord(db, body) {
  if (db.users.some((user) => user.email === body.email)) throw new Error("البريد الإلكتروني مستخدم بالفعل.");
  const employee = findById(db.employees, body.employeeId);
  const user = {
    id: makeId("u"),
    employeeId: body.employeeId || "",
    name: body.name || body.fullName || employee?.fullName || body.email,
    email: body.email,
    avatarUrl: body.avatarUrl || body.photoUrl || employee?.photoUrl || "",
    password: body.password || "Temp@123",
    roleId: body.roleId || employee?.roleId || db.roles.at(-1)?.id,
    branchId: body.branchId || employee?.branchId || "",
    departmentId: body.departmentId || employee?.departmentId || "",
    governorateId: body.governorateId || employee?.governorateId || "",
    complexId: body.complexId || employee?.complexId || "",
    status: body.status || "ACTIVE",
    temporaryPassword: body.temporaryPassword !== false,
    mustChangePassword: body.temporaryPassword !== false,
    passkeyEnabled: body.passkeyEnabled === "on" || body.passkeyEnabled === true,
    failedLogins: 0,
    lastLoginAt: "",
  };
  db.users.unshift(user);
  audit(db, "create", "user", user.id, null, user);
  notify(db, `تم إنشاء مستخدم ${user.name}`, "تم إنشاء حساب بكلمة مرور مؤقتة.", "SUCCESS");
  return user;
}

function dashboard(db) {
  const allowedIds = scopedEmployeeIds(db);
  const employees = db.employees.filter((employee) => !employee.isDeleted && allowedIds.has(employee.id));
  const activeEmployees = employees.filter((employee) => employee.status === "ACTIVE").length;
  const today = new Date().toISOString().slice(0, 10);
  const todayEvents = db.attendanceEvents.filter((event) => allowedIds.has(event.employeeId) && (event.eventAt?.startsWith(today) || event.eventAt?.startsWith("2026-04-26")));
  const openRequests = scopedRowsByEmployee(db, db.leaves).filter((item) => item.status === "PENDING").length
    + scopedRowsByEmployee(db, db.missions).filter((item) => item.status === "PENDING").length
    + scopedRowsByEmployee(db, db.exceptions).filter((item) => item.status === "PENDING").length
    + scopedRowsByEmployee(db, db.locationRequests).filter((item) => item.status === "PENDING").length
    + (isFullAccessUser(db) ? (db.disputeCases || []).filter((item) => ["OPEN", "PENDING", "IN_REVIEW"].includes(item.status)).length : 0);
  const byDepartment = db.departments.map((department) => ({
    label: department.name,
    present: todayEvents.filter((event) => findById(db.employees, event.employeeId)?.departmentId === department.id && ["PRESENT", "LATE", "MISSION"].includes(event.type)).length,
    late: todayEvents.filter((event) => findById(db.employees, event.employeeId)?.departmentId === department.id && event.type === "LATE").length,
    mission: todayEvents.filter((event) => findById(db.employees, event.employeeId)?.departmentId === department.id && event.type === "MISSION").length,
  }));
  const scorePart = (value, total) => Math.min(25, (value / Math.max(1, total)) * 25);
  const healthScore = Math.round(Math.min(100,
    scorePart(db.users.filter((user) => user.employeeId).length, db.users.length)
    + scorePart(activeEmployees, employees.length)
    + scorePart(db.roles.filter((role) => role.permissions?.length).length, db.roles.length)
    + scorePart(db.shifts.filter((shift) => shift.isActive).length, db.branches.length),
  ));
  return {
    metrics: [
      { label: "الموظفون النشطون", value: activeEmployees, helper: `${employees.length} ملف موظف` },
      { label: "حضور اليوم", value: todayEvents.filter((event) => ["PRESENT", "LATE", "MISSION"].includes(event.type)).length, helper: "حضور وتأخير ومأموريات" },
      { label: "طلبات مفتوحة", value: openRequests, helper: "إجازات ومأموريات واستثناءات" },
      { label: "جاهزية النظام", value: `${healthScore}%`, helper: "مؤشر داخلي تقديري" },
    ],
    attendanceBreakdown: [
      { label: "حاضر", value: todayEvents.filter((event) => event.type === "PRESENT").length },
      { label: "متأخر", value: todayEvents.filter((event) => event.type === "LATE").length },
      { label: "مأمورية", value: todayEvents.filter((event) => event.type === "MISSION").length },
      { label: "غياب", value: todayEvents.filter((event) => event.type === "ABSENT").length },
    ],
    attendanceTrends: byDepartment,
    latestEvents: db.attendanceEvents.filter((event) => allowedIds.has(event.employeeId)).map((event) => enrichByEmployee(db, event)).sort((a, b) => new Date(b.eventAt) - new Date(a.eventAt)).slice(0, 8),
    latestAudit: isFullAccessUser(db) ? db.auditLogs.slice(0, 6) : [],
  };
}

const API_BASE = (() => {
  const override = new URLSearchParams(location.search).get("api");
  if (override === "local") return "";
  if (override) return override.replace(/\/$/, "");
  if (location.protocol === "file:") return "";
  return ["5500", "5501", "5173", "4173"].includes(location.port) ? "" : "/api";
})();

function shouldUseApi() {
  return Boolean(API_BASE);
}

let csrfToken = "";

function csrfFromCookie() {
  return document.cookie.split("; ").find((part) => part.startsWith("hr_csrf="))?.split("=")[1] || "";
}

async function ensureCsrfToken() {
  if (!API_BASE) return "";
  csrfToken = csrfToken || csrfFromCookie();
  if (csrfToken) return csrfToken;
  await fetch(`${API_BASE}/auth/csrf`, { credentials: "include" }).catch(() => null);
  csrfToken = csrfFromCookie();
  return csrfToken;
}

function queryString(params = {}) {
  const q = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") q.set(key, String(value));
  });
  const text = q.toString();
  return text ? `?${text}` : "";
}

async function apiRequest(path, options = {}) {
  const method = options.method || "GET";
  const headers = options.body instanceof FormData ? {} : { "Content-Type": "application/json" };
  if (!["GET", "HEAD"].includes(method.toUpperCase())) {
    const token = await ensureCsrfToken();
    if (token) headers["X-CSRF-Token"] = token;
  }
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      method,
      headers,
      body: options.body instanceof FormData ? options.body : options.body != null ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    if (!["GET", "HEAD"].includes(method.toUpperCase()) && !String(path).includes("/auth/")) {
      return { queued: true, offline: true, item: queueOfflineRequest(path, options), message: "تم حفظ الطلب في قائمة المزامنة لحين عودة الاتصال." };
    }
    throw error;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false || payload?.success === false) {
    throw new Error(payload?.error?.message || payload?.message || "تعذر تنفيذ الطلب من الخادم.");
  }
  return payload?.data ?? payload?.items ?? payload;
}

async function apiUploadAvatar(file) {
  const form = new FormData();
  form.append("file", file);
  const payload = await apiRequest("/uploads/avatar", { method: "POST", body: form });
  return payload.url || payload.data?.url || "";
}


function browserSupportsWebAuthn() {
  return Boolean(globalThis.PublicKeyCredential && navigator.credentials);
}

function base64UrlEncode(buffer) {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer || buffer);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function queueOfflineRequest(path, options = {}) {
  const db = loadDb();
  const item = { id: makeId("queue"), path, method: options.method || "GET", body: options.body || null, status: "PENDING", attempts: 0, createdAt: now() };
  db.offlineQueue.unshift(item);
  audit(db, "queue", "offline_request", item.id, null, item);
  saveDb(db);
  return item;
}

function latestLocations(db) {
  const latest = new Map();
  for (const loc of db.locations || []) {
    if (!loc.employeeId) continue;
    const old = latest.get(loc.employeeId);
    if (!old || new Date(loc.date || loc.createdAt || 0) > new Date(old.date || old.createdAt || 0)) latest.set(loc.employeeId, loc);
  }
  return [...latest.values()].map((item) => enrichByEmployee(db, item));
}

function analyticsRows(db) {
  const today = new Date().toISOString().slice(0, 10);
  return visibleEmployees(db).map((employee) => {
    const days = (db.attendanceDaily || []).filter((day) => day.employeeId === employee.id).slice(0, 30);
    const absences = days.filter((day) => day.status === "ABSENT").length;
    const lateMinutes = days.reduce((sum, day) => sum + Number(day.lateMinutes || 0), 0);
    const last = latestLocations(db).find((loc) => loc.employeeId === employee.id);
    const riskScore = Math.min(100, absences * 22 + Math.ceil(lateMinutes / 30) * 7);
    return { employee, employeeId: employee.id, today, absences, lateMinutes, riskScore, productivityHint: riskScore >= 60 ? "يحتاج متابعة عاجلة" : riskScore >= 30 ? "متوسط المخاطر" : "مستقر", lastLocation: last || null };
  }).sort((a, b) => b.riskScore - a.riskScore);
}

const remoteEndpoints = {
  me: () => apiRequest("/auth/me").catch((error) => {
    if (error.message.includes("No active session") || error.message.includes("UNAUTHORIZED")) return null;
    throw error;
  }),
  login: (identifier, password) => apiRequest("/auth/login", { method: "POST", body: { identifier, password } }),
  logout: () => apiRequest("/auth/logout", { method: "POST" }),
  changePassword: (body) => apiRequest("/auth/change-password", { method: "POST", body }),
  dashboard: () => apiRequest("/dashboard"),
  health: () => apiRequest("/health"),
  employees: () => apiRequest("/employees"),
  employee: (employeeId) => apiRequest(`/employees/${encodeURIComponent(employeeId)}`),
  createEmployee: (body) => apiRequest("/employees", { method: "POST", body }),
  updateEmployee: (employeeId, body) => apiRequest(`/employees/${encodeURIComponent(employeeId)}`, { method: "PATCH", body }),
  setEmployeeStatus: (employeeId, status) => apiRequest(`/employees/${encodeURIComponent(employeeId)}/status`, { method: "POST", body: { status } }),
  deleteEmployee: (employeeId) => apiRequest(`/employees/${encodeURIComponent(employeeId)}`, { method: "DELETE" }),
  assignShift: (employeeId, body) => apiRequest(`/employees/${encodeURIComponent(employeeId)}/shift-assignment`, { method: "POST", body }),
  users: () => apiRequest("/users"),
  createUser: (body) => apiRequest("/users", { method: "POST", body }),
  updateUser: (userId, body) => apiRequest(`/users/${encodeURIComponent(userId)}`, { method: "PATCH", body }),
  setUserStatus: (userId, status) => apiRequest(`/users/${encodeURIComponent(userId)}/status`, { method: "POST", body: { status } }),
  attendanceEvents: (params = {}) => apiRequest(`/attendance/events${queryString(params)}`),
  attendanceDaily: (params = {}) => apiRequest(`/attendance/daily${queryString(params)}`),
  attendanceAddress: () => apiRequest("/attendance/my-address"),
  myAttendanceEvents: () => apiRequest("/attendance/my-events"),
  evaluateGeofence: (body) => apiRequest("/geofence/evaluate", { method: "POST", body }),
  checkIn: (body) => apiRequest("/attendance/check-in", { method: "POST", body }),
  checkOut: (body) => apiRequest("/attendance/check-out", { method: "POST", body }),
  selfCheckIn: (body) => apiRequest("/employee/attendance", { method: "POST", body: { ...(body || {}), action: "check_in" } }),
  selfCheckOut: (body) => apiRequest("/employee/attendance", { method: "POST", body: { ...(body || {}), action: "check_out" } }),
  regenerateAttendance: (body) => apiRequest("/attendance/regenerate", { method: "POST", body }),
  manualAttendance: (body) => apiRequest("/attendance/manual-adjustments", { method: "POST", body }),
  adjustAttendance: (body) => apiRequest("/exceptions", { method: "POST", body }),
  missions: () => apiRequest("/missions"),
  createMission: (body) => apiRequest("/missions", { method: "POST", body }),
  updateMission: (missionId, action) => apiRequest(`/missions/${encodeURIComponent(missionId)}/${action === "complete" ? "complete" : action === "reject" ? "reject" : "approve"}`, { method: "POST" }),
  leaves: () => apiRequest("/leave"),
  createLeave: (body) => apiRequest("/leave", { method: "POST", body }),
  updateLeave: (leaveId, action) => apiRequest(`/leaves/requests/${encodeURIComponent(leaveId)}/${action === "reject" ? "reject" : "approve"}`, { method: "POST" }),
  exceptions: () => apiRequest("/exceptions"),
  updateException: (id, action) => apiRequest(`/exceptions/${encodeURIComponent(id)}/${action === "reject" ? "reject" : "approve"}`, { method: "POST" }),
  notifications: () => apiRequest("/notifications"),
  markNotificationRead: (id) => apiRequest(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST" }),
  reports: () => apiRequest("/reports"),
  createReport: (body) => apiRequest("/reports", { method: "POST", body }),
  settings: () => apiRequest("/settings"),
  updateSettings: (body) => apiRequest("/settings", { method: "PATCH", body }),
  kpi: async () => apiRequest("/kpi"),
  saveKpiEvaluation: (body) => apiRequest("/kpi/evaluations", { method: "POST", body }),
  updateKpiEvaluation: (id, body) => apiRequest(`/kpi/evaluations/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  disputes: () => apiRequest("/disputes"),
  createDispute: (body) => apiRequest("/disputes", { method: "POST", body }),
  updateDispute: (id, body) => apiRequest(`/disputes/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  locations: () => apiRequest("/location-requests"),
  createLocationRequest: (body) => apiRequest("/location-requests", { method: "POST", body }),
  updateLocationRequest: (id, body) => apiRequest(`/location-requests/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  recordLocation: (body) => apiRequest("/location/record", { method: "POST", body }),
  queue: () => apiRequest("/queue/status"),
  permissions: () => apiRequest("/permissions"),
  roles: async () => {
    const rows = await apiRequest("/roles");
    return rows.map((role) => ({ ...role, key: role.key || role.slug, permissions: (role.permissions || []).map((item) => item.permission?.scope || item.scope || item).filter(Boolean) }));
  },
  saveRole: (body) => body.id ? apiRequest(`/roles/${encodeURIComponent(body.id)}`, { method: "PATCH", body }) : apiRequest("/roles", { method: "POST", body }),
  branches: () => apiRequest("/organization/branches"),
  departments: () => apiRequest("/organization/departments"),
  governorates: () => apiRequest("/organization/governorates"),
  complexes: () => apiRequest("/organization/complexes"),
  listOrg: (kind) => apiRequest(`/organization/${kind}`),
  saveOrg: (kind, body) => body.id ? apiRequest(`/organization/${kind}/${encodeURIComponent(body.id)}`, { method: "PATCH", body }) : apiRequest(`/organization/${kind}`, { method: "POST", body }),
  deleteOrg: (kind, id) => apiRequest(`/organization/${kind}/${encodeURIComponent(id)}`, { method: "DELETE" }),
  shifts: () => apiRequest("/shifts"),
  saveShift: (body) => body.id ? apiRequest(`/shifts/${encodeURIComponent(body.id)}`, { method: "PATCH", body }) : apiRequest("/shifts", { method: "POST", body }),
  deleteShift: (id) => apiRequest(`/shifts/${encodeURIComponent(id)}`, { method: "DELETE" }),
  auditLogs: () => apiRequest("/audit-logs"),
  backup: () => apiRequest("/system/export"),
  restoreBackup: (db) => Promise.resolve(db),
  importEmployees: (rows) => apiRequest("/system/import/employees", { method: "POST", body: { rows } }),
  uploadAvatar: apiUploadAvatar,
  realtimeSnapshot: () => apiRequest("/realtime/snapshot"),
  aiAnalytics: () => apiRequest("/analytics/ai"),
  integrations: () => apiRequest("/integrations/settings"),
  saveIntegration: (body) => apiRequest("/integrations/settings", { method: "POST", body }),
  payrollPreview: (body) => apiRequest("/payroll/preview", { method: "POST", body }),
  payrollExports: () => apiRequest("/payroll/exports"),
  createPayrollExport: (body) => apiRequest("/payroll/exports", { method: "POST", body }),
  accessControlEvents: () => apiRequest("/access-control/events"),
  createAccessEvent: (body) => apiRequest("/access-control/events", { method: "POST", body }),
  subscribePush: (body) => apiRequest("/notifications/subscriptions", { method: "POST", body }),
  passkeyStatus: () => apiRequest("/passkeys"),
  registerPasskey: (body) => apiRequest("/passkeys/register/verify", { method: "POST", body }),
  offlineQueue: () => apiRequest("/offline/queue"),
  syncOfflineQueue: () => apiRequest("/offline/sync", { method: "POST" }),
  reset: () => Promise.resolve({ ok: true, message: "إعادة الضبط متاحة في وضع Live Server المحلي فقط." }),
};

const orgKeyMap = {
  branches: "branches",
  departments: "departments",
  governorates: "governorates",
  complexes: "complexes",
};

function saveOrgLocal(db, kind, body) {
  const key = orgKeyMap[kind] || kind;
  db[key] ||= [];
  if (body.id) {
    const item = findById(db[key], body.id);
    if (!item) throw new Error("العنصر غير موجود.");
    const before = clone(item);
    Object.assign(item, body, { updatedAt: now() });
    audit(db, "update", key, item.id, before, item);
    return item;
  }
  const item = { id: makeId(key.slice(0, 3)), active: true, createdAt: now(), ...body };
  db[key].unshift(item);
  audit(db, "create", key, item.id, null, item);
  notify(db, `تم إنشاء ${item.name || item.code || "عنصر تنظيمي"}`, "", "SUCCESS");
  return item;
}

function requestWorkflow(item, action, actor = "النظام") {
  item.workflow ||= [];
  item.workflow.push({ at: now(), by: actor, action });
}

function clampScore(value, max) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(Number(max || 100), Math.round(number * 10) / 10));
}

function kpiGrade(total) {
  const score = Number(total || 0);
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "E";
}

function kpiRating(total) {
  const score = Number(total || 0);
  if (score >= 90) return "ممتاز";
  if (score >= 80) return "جيد جدًا";
  if (score >= 70) return "جيد";
  if (score >= 60) return "مقبول";
  return "يحتاج تحسين";
}

function currentKpiCycle(db) {
  const policy = db.kpiPolicy || {};
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const startsOn = new Date(year, month, Number(policy.evaluationStartDay || 20), 12, 0, 0);
  const endsOn = new Date(year, month, Number(policy.evaluationEndDay || 25), 23, 59, 0);
  const id = `${year}-${String(month + 1).padStart(2, "0")}-kpi`;
  let cycle = (db.kpiCycles || []).find((item) => item.id === id) || (db.kpiCycles || [])[0];
  if (!cycle || cycle.id !== id) {
    cycle = {
      id,
      name: `تقييم أداء ${today.toLocaleDateString("ar-EG", { month: "long", year: "numeric" })}`,
      periodType: "monthly",
      startsOn: startsOn.toISOString().slice(0, 10),
      endsOn: endsOn.toISOString().slice(0, 10),
      dueOn: endsOn.toISOString().slice(0, 10),
      status: "PENDING",
      createdAt: now(),
    };
    db.kpiCycles.unshift(cycle);
  }
  return cycle;
}

function attendanceScoreForEmployee(db, employeeId, cycle) {
  const from = String(cycle.startsOn || "").slice(0, 10);
  const to = String(cycle.endsOn || "").slice(0, 10);
  const days = (db.attendanceDaily || []).filter((row) => row.employeeId === employeeId && (!from || row.date >= from) && (!to || row.date <= to));
  if (!days.length) return 20;
  const latePenalty = days.reduce((sum, row) => sum + Math.min(4, Math.ceil(Number(row.lateMinutes || 0) / 15)), 0);
  const absencePenalty = days.filter((row) => row.status === "ABSENT").length * 5;
  const reviewPenalty = days.filter((row) => row.requiresReview).length * 2;
  return clampScore(20 - latePenalty - absencePenalty - reviewPenalty, 20);
}

function normalizeKpiEvaluation(db, body = {}) {
  const cycle = currentKpiCycle(db);
  const employee = findById(db.employees, body.employeeId);
  const managerId = body.managerEmployeeId || employee?.managerEmployeeId || "";
  const attendanceScore = body.attendanceScore === undefined || body.attendanceScore === "" ? attendanceScoreForEmployee(db, body.employeeId, cycle) : body.attendanceScore;
  const scores = {
    targetScore: clampScore(body.targetScore, 40),
    efficiencyScore: clampScore(body.efficiencyScore, 20),
    attendanceScore: clampScore(attendanceScore, 20),
    conductScore: clampScore(body.conductScore, 5),
    prayerScore: clampScore(body.prayerScore, 5),
    quranCircleScore: clampScore(body.quranCircleScore, 5),
    initiativesScore: clampScore(body.initiativesScore, 5),
  };
  const totalScore = Object.values(scores).reduce((sum, value) => sum + Number(value || 0), 0);
  return {
    cycleId: body.cycleId || cycle.id,
    employeeId: body.employeeId,
    managerEmployeeId: managerId,
    evaluationDate: body.evaluationDate || now().slice(0, 10),
    meetingHeld: body.meetingHeld === "on" || body.meetingHeld === true || body.meetingHeld === "true",
    status: body.status || "DRAFT",
    ...scores,
    totalScore,
    grade: kpiGrade(totalScore),
    rating: kpiRating(totalScore),
    managerNotes: body.managerNotes || "",
    employeeNotes: body.employeeNotes || "",
    submittedAt: ["SUBMITTED", "APPROVED"].includes(body.status) ? now() : body.submittedAt || "",
  };
}

function kpiSummaryRows(db, cycle = currentKpiCycle(db)) {
  return (db.kpiEvaluations || [])
    .filter((item) => item.cycleId === cycle.id)
    .map((item) => ({ ...item, employee: enrichEmployee(db, findById(db.employees, item.employeeId)), manager: enrichEmployee(db, findById(db.employees, item.managerEmployeeId)), cycle }))
    .sort((a, b) => Number(b.totalScore || 0) - Number(a.totalScore || 0))
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

const localEndpoints = {
  me: async () => {
    const db = loadDb();
    const userId = sessionStorage.getItem(SESSION_KEY);
    const user = db.users.find((item) => item.id === userId && item.status === "ACTIVE");
    return ok(user ? enrichUser(db, user) : null);
  },
  login: async (identifier, password) => {
    const db = loadDb();
    const user = db.users.find((item) => ["ACTIVE", "INVITED"].includes(item.status) && [item.email, item.name, item.username].filter(Boolean).includes(identifier));
    if (!user || user.password !== password) {
      if (user) {
        user.failedLogins = Number(user.failedLogins || 0) + 1;
        if (user.failedLogins >= 5) user.status = "LOCKED";
        audit(db, "auth.failed", "user", user.id, null, { failedLogins: user.failedLogins });
        saveDb(db);
      }
      throw new Error(user?.status === "LOCKED" ? "تم قفل الحساب بعد محاولات خاطئة." : "بيانات الدخول غير صحيحة أو الحساب غير مفعل.");
    }
    user.failedLogins = 0;
    user.lastLoginAt = now();
    audit(db, "auth.login", "user", user.id, null, { at: user.lastLoginAt });
    saveDb(db);
    sessionStorage.setItem(SESSION_KEY, user.id);
    return ok(enrichUser(db, user));
  },
  forgotPassword: async (identifier) => {
    const db = loadDb();
    const user = db.users.find((item) => String(item.email || "").toLowerCase() === String(identifier || "").toLowerCase() || item.username === identifier || item.name === identifier);
    if (user) {
      notify(db, "طلب إعادة تعيين كلمة المرور", `تم طلب إعادة تعيين كلمة المرور للحساب ${user.email || user.name}.`, "INFO");
      audit(db, "auth.password_reset_requested", "user", user.id, null, { email: user.email || identifier });
      saveDb(db);
    }
    return ok({ sent: true, localOnly: true });
  },
  logout: async () => {
    sessionStorage.removeItem(SESSION_KEY);
    return ok({ ok: true });
  },
  changePassword: async (body = {}) => {
    const db = loadDb();
    const user = currentUser(db);
    if (!user) throw new Error("يجب تسجيل الدخول أولًا.");
    const raw = findById(db.users, user.id);
    if (!raw || raw.password !== body.currentPassword) throw new Error("كلمة المرور الحالية غير صحيحة.");
    if (!body.newPassword || String(body.newPassword).length < 8) throw new Error("كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف.");
    const before = clone(raw);
    raw.password = body.newPassword;
    raw.temporaryPassword = false;
    raw.mustChangePassword = false;
    raw.status = "ACTIVE";
    audit(db, "auth.password_changed", "user", raw.id, before, { changedAt: now() });
    saveDb(db);
    return ok({ changed: true });
  },
  dashboard: async () => ok(dashboard(loadDb())),
  health: async () => {
    const db = loadDb();
    return ok({
      app: "Live Server / Vanilla Web",
      database: { mode: shouldUseApi() ? "API fallback" : "localStorage", connected: true },
      authEnforced: true,
      queue: { enabled: false },
      version: db.meta?.version || 5,
      counts: {
        employees: db.employees.filter((e) => !e.isDeleted).length,
        users: db.users.length,
        branches: db.branches.length,
        auditLogs: db.auditLogs.length,
      },
      checks: [
        { label: "ربط المستخدمين بالموظفين", ok: db.users.every((user) => !user.employeeId || findById(db.employees, user.employeeId)) },
        { label: "وجود ورديات فعالة", ok: db.shifts.some((shift) => shift.isActive) },
        { label: "وجود أدوار بصلاحيات", ok: db.roles.every((role) => role.permissions?.length) },
        { label: "سجل تدقيق فعال", ok: Array.isArray(db.auditLogs) },
      ],
    });
  },
  employees: async () => ok(visibleEmployees(loadDb())),
  employee: async (employeeId) => {
    const db = loadDb();
    const employee = findById(db.employees, employeeId);
    if (!employee || employee.isDeleted || !canSeeEmployee(db, employeeId)) throw new Error("لم يتم العثور على الموظف أو لا تملك صلاحية عرضه.");
    return ok({
      ...enrichEmployee(db, employee),
      attendanceEvents: db.attendanceEvents.filter((item) => item.employeeId === employeeId).sort((a, b) => new Date(b.eventAt) - new Date(a.eventAt)),
      attendanceDaily: db.attendanceDaily.filter((item) => item.employeeId === employeeId).sort((a, b) => b.date.localeCompare(a.date)),
      missions: db.missions.filter((item) => item.employeeId === employeeId),
      leaves: db.leaves.filter((item) => item.employeeId === employeeId),
      exceptions: db.exceptions.filter((item) => item.employeeId === employeeId),
      attachments: db.attachments.filter((item) => item.employeeId === employeeId),
    });
  },
  createEmployee: async (body) => {
    const db = loadDb();
    if (db.employees.some((employee) => !employee.isDeleted && employee.employeeCode === body.employeeCode)) throw new Error("كود الموظف مستخدم بالفعل.");
    const employee = applyEmployeePayload(db, { id: makeId("emp"), isDeleted: false, userId: "" }, body);
    db.employees.unshift(employee);
    audit(db, "create", "employee", employee.id, null, employee);
    if (body.createUser === "on" || body.createUser === true) {
      const user = createUserRecord(db, { ...body, employeeId: employee.id, name: employee.fullName, email: body.email, password: body.password || "Temp@123" });
      employee.userId = user.id;
    }
    notify(db, `تمت إضافة الموظف ${employee.fullName}`, "تم إنشاء ملف موظف جديد.", "SUCCESS");
    saveDb(db);
    return ok(enrichEmployee(db, employee));
  },
  updateEmployee: async (employeeId, body) => {
    const db = loadDb();
    const employee = findById(db.employees, employeeId);
    if (!employee) throw new Error("لم يتم العثور على الموظف.");
    const before = clone(employee);
    applyEmployeePayload(db, employee, body);
    const user = db.users.find((item) => item.employeeId === employee.id);
    if (user) {
      user.name = employee.fullName;
      user.email = user.email || employee.email;
      user.roleId = employee.roleId;
      user.branchId = employee.branchId;
      user.departmentId = employee.departmentId;
      user.governorateId = employee.governorateId;
      user.complexId = employee.complexId;
    }
    audit(db, "update", "employee", employee.id, before, employee);
    saveDb(db);
    return ok(enrichEmployee(db, employee));
  },
  setEmployeeStatus: async (employeeId, status) => {
    const db = loadDb();
    const employee = findById(db.employees, employeeId);
    if (!employee) throw new Error("لم يتم العثور على الموظف.");
    const before = clone(employee);
    employee.status = status;
    const user = db.users.find((item) => item.employeeId === employeeId);
    if (user && ["INACTIVE", "SUSPENDED", "TERMINATED"].includes(status)) user.status = "DISABLED";
    audit(db, "status", "employee", employeeId, before, employee);
    saveDb(db);
    return ok(enrichEmployee(db, employee));
  },
  deleteEmployee: async (employeeId) => {
    const db = loadDb();
    const employee = findById(db.employees, employeeId);
    if (!employee) throw new Error("لم يتم العثور على الموظف.");
    const before = clone(employee);
    employee.isDeleted = true;
    employee.status = "INACTIVE";
    const user = db.users.find((item) => item.employeeId === employeeId);
    if (user) user.status = "DISABLED";
    audit(db, "soft_delete", "employee", employeeId, before, employee);
    saveDb(db);
    return ok({ ok: true });
  },
  assignShift: async (employeeId, body) => {
    const db = loadDb();
    const employee = findById(db.employees, employeeId);
    const shift = findById(db.shifts, body.shiftId);
    if (!employee || !shift) throw new Error("اختر موظف ووردية بشكل صحيح.");
    const before = clone(employee);
    employee.shiftId = shift.id;
    const assignment = { id: makeId("assign"), employeeId, shiftId: shift.id, startsOn: body.startsOn || now().slice(0, 10), endsOn: body.endsOn || "", isPrimary: body.isPrimary !== false, createdAt: now() };
    db.shiftAssignments.unshift(assignment);
    audit(db, "assign", "employee_shift", assignment.id, before, { employee, assignment });
    saveDb(db);
    return ok({ ...assignment, employee: enrichEmployee(db, employee), shift });
  },
  users: async () => {
    const db = loadDb();
    return ok(db.users.map((user) => enrichUser(db, user)));
  },
  createUser: async (body) => {
    const db = loadDb();
    const user = createUserRecord(db, body);
    const employee = findById(db.employees, user.employeeId);
    if (employee) employee.userId = user.id;
    saveDb(db);
    return ok(enrichUser(db, user));
  },
  updateUser: async (userId, body) => {
    const db = loadDb();
    const user = findById(db.users, userId);
    if (!user) throw new Error("لم يتم العثور على المستخدم.");
    const before = clone(user);
    Object.assign(user, {
      name: body.name || body.fullName || user.name,
      email: body.email || user.email,
      avatarUrl: body.avatarUrl || body.photoUrl || user.avatarUrl || user.photoUrl || "",
      roleId: body.roleId || user.roleId,
      employeeId: body.employeeId || "",
      branchId: body.branchId || "",
      departmentId: body.departmentId || "",
      governorateId: body.governorateId || "",
      complexId: body.complexId || "",
      status: body.status || user.status,
      temporaryPassword: body.temporaryPassword === "on" || body.temporaryPassword === true,
      mustChangePassword: body.temporaryPassword === "on" || body.temporaryPassword === true,
      passkeyEnabled: body.passkeyEnabled === "on" || body.passkeyEnabled === true,
    });
    if (body.password) user.password = body.password;
    db.employees.forEach((employee) => {
      if (employee.userId === user.id && employee.id !== user.employeeId) employee.userId = "";
    });
    const employee = findById(db.employees, user.employeeId);
    if (employee) employee.userId = user.id;
    audit(db, "update", "user", user.id, before, user);
    saveDb(db);
    return ok(enrichUser(db, user));
  },
  setUserStatus: async (userId, status) => {
    const db = loadDb();
    const user = findById(db.users, userId);
    if (!user) throw new Error("لم يتم العثور على المستخدم.");
    const before = clone(user);
    user.status = status;
    audit(db, "status", "user", userId, before, user);
    saveDb(db);
    return ok(enrichUser(db, user));
  },
  attendanceEvents: async (params = {}) => {
    const db = loadDb();
    let rows = scopedRowsByEmployee(db, db.attendanceEvents).filter((event) => {
      const day = String(event.eventAt || event.createdAt || "").slice(0, 10);
      return (!params.from || !day || day >= params.from)
        && (!params.to || !day || day <= params.to)
        && (!params.employeeId || event.employeeId === params.employeeId)
        && (!params.type || event.type === params.type)
        && (!params.review || (params.review === "review" ? Boolean(event.requiresReview) : !event.requiresReview));
    }).map((event) => enrichByEmployee(db, event)).sort((a, b) => new Date(b.eventAt) - new Date(a.eventAt));
    if (params.limit) rows = rows.slice(0, Math.max(Number(params.limit), 1));
    return ok(rows);
  },
  myAttendanceEvents: async () => {
    const db = loadDb();
    const user = currentUser(db);
    return ok(db.attendanceEvents.filter((event) => event.employeeId === user?.employeeId).map((event) => enrichByEmployee(db, event)).sort((a, b) => new Date(b.eventAt) - new Date(a.eventAt)));
  },
  attendanceDaily: async (params = {}) => {
    const db = loadDb();
    let rows = scopedRowsByEmployee(db, db.attendanceDaily).filter((item) => {
      const day = String(item.date || "").slice(0, 10);
      return (!params.from || !day || day >= params.from)
        && (!params.to || !day || day <= params.to)
        && (!params.employeeId || item.employeeId === params.employeeId);
    }).map((item) => enrichByEmployee(db, item)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (params.limit) rows = rows.slice(0, Math.max(Number(params.limit), 1));
    return ok(rows);
  },
  attendanceAddress: async () => {
    const db = loadDb();
    const user = currentUser(db);
    return ok(attendanceAddressForEmployee(db, user?.employeeId || db.employees[0]?.id));
  },
  evaluateGeofence: async (body = {}) => {
    const db = loadDb();
    const user = currentUser(db);
    const employeeId = body.employeeId || user?.employeeId || db.employees[0]?.id;
    const evaluation = evaluateAttendance(db, { ...body, employeeId }, "CHECK_IN");
    return ok({ ...evaluation, inside: evaluation.geofenceStatus === "inside_branch", allowed: evaluation.canRecord, message: evaluation.blockReason || geofenceMessage(evaluation), employeeId });
  },
  regenerateAttendance: async (body = {}) => {
    const db = loadDb();
    const result = regenerateDailyLocal(db, body);
    saveDb(db);
    return ok(result);
  },
  manualAttendance: async (body) => {
    const db = loadDb();
    const employeeId = body.employeeId || db.employees[0]?.id;
    const event = { id: makeId("manual"), employeeId, eventAt: body.eventAt || now(), source: "Manual", type: body.type || "MANUAL_ADJUSTMENT", geofenceStatus: "manual_adjustment", verificationStatus: "manual", notes: body.reason || body.notes || "تعديل يدوي", isManual: true, requiresReview: false };
    db.attendanceEvents.unshift(event);
    upsertDailyFromEvent(db, employeeId, event);
    audit(db, "manual_adjustment", "attendance", event.id, null, event);
    saveDb(db);
    return ok(enrichByEmployee(db, event));
  },
  checkIn: async (body) => {
    const db = loadDb();
    const evaluation = evaluateAttendance(db, body, "CHECK_IN");
    if (!evaluation.canRecord) {
      audit(db, "rejected_check_in", "attendance", body.employeeId, null, evaluation);
      saveDb(db);
      throw new Error(evaluation.blockReason || "لا يمكن تسجيل الحضور خارج العنوان المحدد.");
    }
    const event = { id: makeId("att"), employeeId: body.employeeId, eventAt: now(), source: "Live Server", biometricMethod: body.biometricMethod || "passkey", passkeyCredentialId: body.passkeyCredentialId || "", ...evaluation };
    db.attendanceEvents.unshift(event);
    upsertDailyFromEvent(db, body.employeeId, event);
    audit(db, "check_in", "attendance", event.id, null, event);
    saveDb(db);
    return ok({ ok: true, evaluation, event });
  },
  checkOut: async (body) => {
    const db = loadDb();
    const evaluation = evaluateAttendance(db, body, "CHECK_OUT");
    if (!evaluation.canRecord) {
      audit(db, "rejected_check_out", "attendance", body.employeeId, null, evaluation);
      saveDb(db);
      throw new Error(evaluation.blockReason || "لا يمكن تسجيل الانصراف خارج العنوان المحدد.");
    }
    const event = { id: makeId("att"), employeeId: body.employeeId, eventAt: now(), source: "Live Server", biometricMethod: body.biometricMethod || "passkey", passkeyCredentialId: body.passkeyCredentialId || "", ...evaluation };
    db.attendanceEvents.unshift(event);
    upsertDailyFromEvent(db, body.employeeId, event);
    audit(db, "check_out", "attendance", event.id, null, event);
    saveDb(db);
    return ok({ ok: true, evaluation, event });
  },
  selfCheckIn: async (body = {}) => {
    const db = loadDb();
    const user = currentUser(db);
    if (!user?.employeeId) throw new Error("لا يوجد موظف مرتبط بحسابك.");
    return localEndpoints.checkIn({ ...body, employeeId: user.employeeId, verificationStatus: body.verificationStatus || "verified" });
  },
  selfCheckOut: async (body = {}) => {
    const db = loadDb();
    const user = currentUser(db);
    if (!user?.employeeId) throw new Error("لا يوجد موظف مرتبط بحسابك.");
    return localEndpoints.checkOut({ ...body, employeeId: user.employeeId, verificationStatus: body.verificationStatus || "verified" });
  },
  adjustAttendance: async (body) => {
    const db = loadDb();
    const item = { id: makeId("exc"), employeeId: body.employeeId, title: body.title || "طلب تعديل حضور", reason: body.reason || body.notes || "", status: "PENDING", createdAt: now(), workflow: [] };
    requestWorkflow(item, "created", currentUser(db)?.name || "النظام");
    db.exceptions.unshift(item);
    audit(db, "create", "attendance_exception", item.id, null, item);
    notify(db, "طلب تعديل حضور جديد", item.title, "INFO");
    saveDb(db);
    return ok(enrichByEmployee(db, item));
  },
  exceptions: async () => {
    const db = loadDb();
    return ok(scopedRowsByEmployee(db, db.exceptions).map((item) => enrichByEmployee(db, item)));
  },
  updateException: async (id, action) => {
    const db = loadDb();
    const item = findById(db.exceptions, id);
    if (!item) throw new Error("الطلب غير موجود.");
    const before = clone(item);
    item.status = action === "reject" ? "REJECTED" : "APPROVED";
    requestWorkflow(item, item.status.toLowerCase(), currentUser(db)?.name || "النظام");
    audit(db, "workflow", "attendance_exception", id, before, item);
    saveDb(db);
    return ok(enrichByEmployee(db, item));
  },
  missions: async () => {
    const db = loadDb();
    return ok(scopedRowsByEmployee(db, db.missions).map((mission) => enrichByEmployee(db, mission)));
  },
  createMission: async (body) => {
    const db = loadDb();
    const item = { id: makeId("mis"), employeeId: (isFullAccessUser(db) ? body.employeeId : currentUser(db)?.employeeId) || body.employeeId || db.employees[0]?.id, title: body.title, destinationName: body.destinationName || "", plannedStart: body.plannedStart || "", plannedEnd: body.plannedEnd || "", status: "PENDING", approvalStatus: "pending", workflow: [], createdAt: now() };
    requestWorkflow(item, "created", currentUser(db)?.name || "النظام");
    db.missions.unshift(item);
    audit(db, "create", "mission", item.id, null, item);
    notify(db, "مأمورية جديدة تحتاج اعتماد", item.title, "INFO");
    saveDb(db);
    return ok(enrichByEmployee(db, item));
  },
  updateMission: async (missionId, action) => {
    const db = loadDb();
    const mission = findById(db.missions, missionId);
    if (!mission) throw new Error("المأمورية غير موجودة.");
    const before = clone(mission);
    mission.status = action === "complete" ? "COMPLETED" : action === "reject" ? "REJECTED" : "APPROVED";
    mission.approvalStatus = mission.status.toLowerCase();
    requestWorkflow(mission, action, currentUser(db)?.name || "النظام");
    audit(db, "workflow", "mission", missionId, before, mission);
    saveDb(db);
    return ok(enrichByEmployee(db, mission));
  },
  leaves: async () => {
    const db = loadDb();
    return ok(scopedRowsByEmployee(db, db.leaves).map((leave) => enrichByEmployee(db, leave)));
  },
  createLeave: async (body) => {
    const db = loadDb();
    const item = { id: makeId("lv"), employeeId: (isFullAccessUser(db) ? body.employeeId : currentUser(db)?.employeeId) || body.employeeId || db.employees[0]?.id, leaveType: { name: body.leaveType || "اعتيادية" }, startDate: body.startDate, endDate: body.endDate, reason: body.reason, status: "PENDING", workflow: [], createdAt: now() };
    requestWorkflow(item, "created", currentUser(db)?.name || "النظام");
    db.leaves.unshift(item);
    audit(db, "create", "leave", item.id, null, item);
    notify(db, "طلب إجازة جديد", item.reason || item.leaveType.name, "INFO");
    saveDb(db);
    return ok(enrichByEmployee(db, item));
  },
  updateLeave: async (leaveId, action) => {
    const db = loadDb();
    const leave = findById(db.leaves, leaveId);
    if (!leave) throw new Error("طلب الإجازة غير موجود.");
    const before = clone(leave);
    leave.status = action === "reject" ? "REJECTED" : "APPROVED";
    requestWorkflow(leave, leave.status.toLowerCase(), currentUser(db)?.name || "النظام");
    audit(db, "workflow", "leave", leaveId, before, leave);
    saveDb(db);
    return ok(enrichByEmployee(db, leave));
  },
  locations: async () => {
    const db = loadDb();
    return ok([...(scopedRowsByEmployee(db, db.locationRequests || [])).map((item) => enrichByEmployee(db, item)), ...(scopedRowsByEmployee(db, db.locations || [])).map((item) => enrichByEmployee(db, item))]);
  },
  createLocationRequest: async (body) => {
    const db = loadDb();
    const employee = findById(db.employees, body.employeeId);
    const item = {
      id: makeId("locreq"),
      employeeId: body.employeeId,
      purpose: body.purpose || "فتح الموقع وإرسال اللوكيشن المباشر",
      requestReason: "",
      status: "PENDING",
      requestedAt: now(),
      expiresAt: body.expiresAt || new Date(Date.now() + 30 * 60000).toISOString(),
      workflow: [],
    };
    requestWorkflow(item, "created", currentUser(db)?.name || "النظام");
    db.locationRequests.unshift(item);
    db.notifications.unshift({
      id: makeId("not"),
      userId: employee?.userId || "",
      employeeId: item.employeeId,
      title: "فتح الموقع وإرسال اللوكيشن",
      body: "من فضلك افتح صفحة طلبات وسجل المواقع واضغط إرسال موقعي الآن.",
      status: "UNREAD",
      isRead: false,
      type: "ACTION_REQUIRED",
      createdAt: now(),
    });
    audit(db, "create", "location_request", item.id, null, item);
    saveDb(db);
    return ok(enrichByEmployee(db, item));
  },
  updateLocationRequest: async (id, body) => {
    const db = loadDb();
    const item = findById(db.locationRequests, id);
    if (!item) throw new Error("طلب الموقع غير موجود.");
    const before = clone(item);
    item.status = body.status || "APPROVED";
    item.lastRespondedAt = now();
    if (body.latitude && body.longitude) {
      db.locations.unshift({ id: makeId("loc"), employeeId: item.employeeId, locationRequestId: id, latitude: Number(body.latitude), longitude: Number(body.longitude), accuracyMeters: Number(body.accuracyMeters || 0), status: item.status, date: now(), source: "response" });
    }
    requestWorkflow(item, String(item.status).toLowerCase(), currentUser(db)?.name || "النظام");
    audit(db, "workflow", "location_request", id, before, item);
    saveDb(db);
    return ok(enrichByEmployee(db, item));
  },
  recordLocation: async (body) => {
    const db = loadDb();
    const item = { id: makeId("loc"), employeeId: body.employeeId || db.employees[0]?.id, latitude: Number(body.latitude), longitude: Number(body.longitude), accuracyMeters: Number(body.accuracyMeters || 0), status: body.status || "ACTIVE", date: now(), source: body.source || "manual" };
    db.locations.unshift(item);
    audit(db, "record", "employee_location", item.id, null, item);
    saveDb(db);
    return ok(enrichByEmployee(db, item));
  },
  notifications: async () => ok(loadDb().notifications),
  markNotificationRead: async (id) => {
    const db = loadDb();
    const item = findById(db.notifications, id);
    if (item) {
      item.isRead = true;
      item.status = "READ";
      item.readAt = now();
    }
    saveDb(db);
    return ok(item);
  },
  reports: async () => ok({ jobs: loadDb().reports }),
  createReport: async (body) => {
    const db = loadDb();
    const item = { id: makeId("rep"), title: body.title || "تقرير", reportKey: body.reportKey || "attendance", format: body.format || "csv", status: "COMPLETED", createdAt: now() };
    db.reports.unshift(item);
    audit(db, "create", "report", item.id, null, item);
    saveDb(db);
    return ok(item);
  },
  settings: async () => ok(loadDb().settings),
  updateSettings: async (body) => {
    const db = loadDb();
    Object.entries(body).forEach(([key, value]) => {
      let setting = db.settings.find((item) => item.key === key);
      if (!setting) {
        setting = { id: makeId("set"), key, value, scope: "custom" };
        db.settings.push(setting);
      } else {
        setting.value = value;
      }
    });
    audit(db, "update", "settings", "system", null, body);
    saveDb(db);
    return ok(db.settings);
  },
  kpi: async () => {
    const db = loadDb();
    const cycle = currentKpiCycle(db);
    const allEvaluations = kpiSummaryRows(db, cycle);
    const ids = scopedEmployeeIds(db);
    const evaluations = allEvaluations.filter((item) => ids.has(item.employeeId));
    const evaluatedEmployeeIds = new Set(evaluations.map((item) => item.employeeId));
    const pendingEmployees = visibleEmployees(db).filter((employee) => employee.status !== "TERMINATED" && !evaluatedEmployeeIds.has(employee.id));
    const average = evaluations.length ? Math.round(evaluations.reduce((sum, item) => sum + Number(item.totalScore || 0), 0) / evaluations.length) : 0;
    saveDb(db);
    return ok({
      policy: db.kpiPolicy,
      cycle,
      criteria: [...(db.kpiCriteria || [])].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)),
      evaluations,
      summaries: evaluations,
      pendingEmployees,
      committee: db.disputeCommittee,
      accessMode: isFullAccessUser(db) ? "all" : hasLocalScope(db, "kpi:team") ? "team" : "self",
      currentEmployeeId: currentUser(db)?.employeeId || "",
      metrics: [
        { label: "إجمالي الدرجة", value: "100", helper: "وفق النموذج المعتمد" },
        { label: "متوسط التقييم", value: average ? `${average}` : "-", helper: "للتقييمات المسجلة" },
        { label: "تم تقييمهم", value: evaluations.length, helper: "داخل الدورة الحالية" },
        { label: "لم يتم تقييمهم", value: pendingEmployees.length, helper: "قبل موعد 25 من الشهر" },
      ],
    });
  },
  saveKpiEvaluation: async (body = {}) => {
    const db = loadDb();
    if (!body.employeeId) throw new Error("اختر الموظف أولًا.");
    if (!canSeeEmployee(db, body.employeeId)) throw new Error("لا يمكنك تقييم هذا الموظف.");
    const selfOnly = !isFullAccessUser(db) && !hasLocalScope(db, "kpi:team");
    const normalized = normalizeKpiEvaluation(db, { ...body, status: selfOnly ? "SUBMITTED" : (body.status || "APPROVED") });
    if (selfOnly) { normalized.managerNotes = ""; normalized.managerEmployeeId = findById(db.employees, normalized.employeeId)?.managerEmployeeId || ""; }
    let evaluation = (db.kpiEvaluations || []).find((item) => item.employeeId === normalized.employeeId && item.cycleId === normalized.cycleId);
    if (evaluation) {
      const before = clone(evaluation);
      Object.assign(evaluation, normalized, { updatedAt: now() });
      audit(db, "update", "kpi_evaluation", evaluation.id, before, evaluation);
    } else {
      evaluation = { id: makeId("kpie"), createdAt: now(), ...normalized };
      db.kpiEvaluations.unshift(evaluation);
      audit(db, "create", "kpi_evaluation", evaluation.id, null, evaluation);
    }
    notify(db, "تم حفظ تقييم أداء", `${findById(db.employees, normalized.employeeId)?.fullName || "موظف"} - ${normalized.totalScore}/100`, "SUCCESS");
    saveDb(db);
    return ok({ ...evaluation, employee: enrichEmployee(db, findById(db.employees, evaluation.employeeId)), manager: enrichEmployee(db, findById(db.employees, evaluation.managerEmployeeId)) });
  },
  updateKpiEvaluation: async (id, body = {}) => {
    const db = loadDb();
    const evaluation = findById(db.kpiEvaluations, id);
    if (!evaluation) throw new Error("التقييم غير موجود.");
    const before = clone(evaluation);
    if (!canSeeEmployee(db, evaluation.employeeId) || (!isFullAccessUser(db) && !hasLocalScope(db, "kpi:team"))) throw new Error("الاعتماد متاح للمدير المباشر أو HR أو الإدارة التنفيذية فقط.");
    Object.assign(evaluation, body, { updatedAt: now(), managerEmployeeId: evaluation.managerEmployeeId || currentUser(db)?.employeeId || "" });
    if (body.status === "APPROVED") evaluation.approvedAt = now();
    if (body.status === "SUBMITTED") evaluation.submittedAt = now();
    audit(db, "workflow", "kpi_evaluation", id, before, evaluation);
    saveDb(db);
    return ok(evaluation);
  },
  recomputeKpi: async (body = {}) => {
    const db = loadDb();
    const cycle = currentKpiCycle(db);
    let recomputed = 0;
    visibleEmployees(db).forEach((employee) => {
      if ((db.kpiEvaluations || []).some((item) => item.employeeId === employee.id && item.cycleId === cycle.id)) return;
      const evaluation = { id: makeId("kpie"), createdAt: now(), ...normalizeKpiEvaluation(db, { employeeId: employee.id, managerEmployeeId: employee.managerEmployeeId, attendanceScore: attendanceScoreForEmployee(db, employee.id, cycle), status: "DRAFT", targetScore: 0, efficiencyScore: 0, conductScore: 0, prayerScore: 0, quranCircleScore: 0, initiativesScore: 0 }) };
      db.kpiEvaluations.unshift(evaluation);
      recomputed += 1;
    });
    audit(db, "recompute", "kpi", cycle.id, null, { recomputed, ...body });
    notify(db, "تم تجهيز دورة تقييم الأداء", `${recomputed} تقييم مبدئي`, "SUCCESS");
    saveDb(db);
    return ok({ recomputed, cycleId: cycle.id });
  },
  disputes: async () => {
    const db = loadDb();
    return ok({ committee: db.disputeCommittee, cases: (db.disputeCases || []).map((item) => enrichByEmployee(db, item)) });
  },
  createDispute: async (body = {}) => {
    const db = loadDb();
    const item = { id: makeId("disp"), title: body.title || "شكوى / خلاف", employeeId: body.employeeId || currentUser(db)?.employeeId || "", category: "شكوى", priority: "MEDIUM", severity: "MEDIUM", description: body.description || "", status: "IN_REVIEW", assignedCommittee: db.disputeCommittee?.members || [], committeeDecision: "", escalatedToExecutive: false, workflow: [{ at: now(), by: currentUser(db)?.name || "النظام", action: "created" }], createdAt: now() };
    db.disputeCases.unshift(item);
    audit(db, "create", "dispute_case", item.id, null, item);
    notify(db, "شكوى جديدة للجنة فض الخلافات", item.title, "ACTION_REQUIRED");
    saveDb(db);
    return ok(enrichByEmployee(db, item));
  },
  updateDispute: async (id, body = {}) => {
    const db = loadDb();
    const item = findById(db.disputeCases, id);
    if (!item) throw new Error("الشكوى غير موجودة.");
    const before = clone(item);
    Object.assign(item, {
      status: body.status || item.status,
      committeeDecision: body.committeeDecision ?? item.committeeDecision,
      resolution: body.resolution ?? item.resolution,
      escalatedToExecutive: body.escalatedToExecutive === "on" || body.escalatedToExecutive === true || body.status === "ESCALATED",
      executiveEscalationReason: body.executiveEscalationReason ?? item.executiveEscalationReason,
      updatedAt: now(),
    });
    item.workflow ||= [];
    item.workflow.push({ at: now(), by: currentUser(db)?.name || "النظام", action: item.status });
    if (["RESOLVED", "CLOSED"].includes(item.status)) item.resolvedAt = now();
    audit(db, "workflow", "dispute_case", id, before, item);
    saveDb(db);
    return ok(enrichByEmployee(db, item));
  },
  queue: async () => ok({ enabled: false }),
  permissions: async () => ok(loadDb().permissions),
  roles: async () => ok(loadDb().roles),
  saveRole: async (body) => {
    const db = loadDb();
    let role = body.id ? findById(db.roles, body.id) : null;
    if (role) {
      const before = clone(role);
      Object.assign(role, { name: body.name, key: body.key || body.slug || role.key, slug: body.slug || body.key || role.slug, description: body.description || "", permissions: Array.isArray(body.permissions) ? body.permissions : String(body.permissions || "").split(",").filter(Boolean) });
      audit(db, "update", "role", role.id, before, role);
    } else {
      role = { id: makeId("role"), name: body.name, key: body.key || body.slug || "CUSTOM", slug: body.slug || body.key || "custom", description: body.description || "", permissions: Array.isArray(body.permissions) ? body.permissions : String(body.permissions || "").split(",").filter(Boolean) };
      db.roles.unshift(role);
      audit(db, "create", "role", role.id, null, role);
    }
    saveDb(db);
    return ok(role);
  },
  branches: async () => ok(activeItems(loadDb(), "branches")),
  departments: async () => ok(activeItems(loadDb(), "departments")),
  governorates: async () => ok(activeItems(loadDb(), "governorates")),
  complexes: async () => ok(activeItems(loadDb(), "complexes")),
  listOrg: async (kind) => {
    const db = loadDb();
    return ok(activeItems(db, orgKeyMap[kind] || kind));
  },
  saveOrg: async (kind, body) => {
    const db = loadDb();
    const item = saveOrgLocal(db, kind, body);
    saveDb(db);
    return ok(item);
  },
  deleteOrg: async (kind, id) => {
    const db = loadDb();
    const key = orgKeyMap[kind] || kind;
    const item = findById(db[key], id);
    if (!item) throw new Error("العنصر غير موجود.");
    const before = clone(item);
    item.active = false;
    item.isDeleted = true;
    audit(db, "soft_delete", key, id, before, item);
    saveDb(db);
    return ok(item);
  },
  shifts: async () => {
    const db = loadDb();
    return ok(db.shifts.filter((shift) => shift.isActive !== false).map((shift) => ({ ...shift, branch: findById(db.branches, shift.branchId) })));
  },
  saveShift: async (body) => {
    const db = loadDb();
    let shift = body.id ? findById(db.shifts, body.id) : null;
    if (shift) {
      const before = clone(shift);
      Object.assign(shift, body, { isActive: body.isActive !== "false" && body.isActive !== false });
      audit(db, "update", "shift", shift.id, before, shift);
    } else {
      shift = { id: makeId("shift"), branchId: body.branchId || db.branches[0]?.id, name: body.name || "وردية جديدة", startTime: body.startTime || "08:00", endTime: body.endTime || "16:00", graceMinutes: Number(body.graceMinutes || 15), lateAfterMinutes: Number(body.lateAfterMinutes || body.graceMinutes || 15), halfDayAfterMinutes: Number(body.halfDayAfterMinutes || 240), daysMask: body.daysMask || "SAT,SUN,MON,TUE,WED,THU", isNightShift: body.isNightShift === "on", isActive: true };
      db.shifts.unshift(shift);
      audit(db, "create", "shift", shift.id, null, shift);
    }
    saveDb(db);
    return ok(shift);
  },
  deleteShift: async (id) => {
    const db = loadDb();
    const shift = findById(db.shifts, id);
    if (!shift) throw new Error("الوردية غير موجودة.");
    const before = clone(shift);
    shift.isActive = false;
    audit(db, "soft_delete", "shift", id, before, shift);
    saveDb(db);
    return ok(shift);
  },
  auditLogs: async () => ok(loadDb().auditLogs),
  attachments: async (scope, entityId) => {
    const db = loadDb();
    return ok(db.attachments.filter((item) => (!scope || item.scope === scope) && (!entityId || item.entityId === entityId || item.employeeId === entityId)));
  },
  uploadAttachment: async (file, body = {}) => {
    if (!file) throw new Error("اختر ملفًا أولًا.");
    if (file.size > 8 * 1024 * 1024) throw new Error("الملف كبير. الحد الحالي 8MB في النسخة المحلية.");
    const url = await localEndpoints.uploadAvatar(file);
    const db = loadDb();
    const item = { id: makeId("attch"), scope: body.scope || "EMPLOYEE", entityId: body.entityId || body.employeeId || "general", employeeId: body.employeeId || body.entityId || "", fileName: file.name, originalName: file.name, mimeType: file.type, sizeBytes: file.size, url, createdAt: now() };
    db.attachments.unshift(item);
    audit(db, "upload", "attachment", item.id, null, { ...item, url: "data-url" });
    saveDb(db);
    return ok(item);
  },
  uploadAvatar: async (file) => {
    if (!file) return "";
    if (file.size > 2 * 1024 * 1024) throw new Error("الصورة كبيرة. الحد الحالي 2MB للحفاظ على سرعة النظام.");
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },
  backup: async () => ok(loadDb()),
  restoreBackup: async (db) => {
    const restored = normalizeDb(db);
    audit(restored, "restore", "backup", "local", null, { restoredAt: now() });
    saveDb(restored);
    return ok({ ok: true });
  },
  importEmployees: async (rows) => {
    const db = loadDb();
    let created = 0;
    rows.forEach((row) => {
      const employeeCode = row.employeeCode || row.code || row["كود الموظف"];
      if (!employeeCode || db.employees.some((employee) => employee.employeeCode === employeeCode)) return;
      const employee = applyEmployeePayload(db, { id: makeId("emp"), isDeleted: false, userId: "" }, {
        employeeCode,
        fullName: row.fullName || row.name || row["الاسم"],
        phone: row.phone || row["الموبايل"],
        email: row.email || row["البريد"],
        jobTitle: row.jobTitle || row["الوظيفة"],
        roleId: row.roleId || "role-employee",
        branchId: row.branchId || db.branches[0]?.id,
        departmentId: row.departmentId || db.departments[0]?.id,
        governorateId: row.governorateId || db.governorates[0]?.id,
        complexId: row.complexId || db.complexes[0]?.id,
        status: row.status || "ACTIVE",
      });
      db.employees.unshift(employee);
      created += 1;
    });
    audit(db, "import", "employees", "bulk", null, { count: created });
    saveDb(db);
    return ok({ created });
  },
  realtimeSnapshot: async () => {
    const db = loadDb();
    return ok({ dashboard: dashboard(db), locations: latestLocations(db), heatmap: latestLocations(db).map((loc) => ({ employeeId: loc.employeeId, name: loc.employee?.fullName || loc.employeeId, latitude: loc.latitude, longitude: loc.longitude, weight: 1, date: loc.date || loc.createdAt })), realtime: { transport: "local", updatedAt: now() } });
  },
  aiAnalytics: async () => ok({ generatedAt: now(), rows: analyticsRows(loadDb()), note: "تحليل تقديري محلي يعتمد على التأخير والغياب آخر 30 يومًا وليس بديلاً عن قرار إداري." }),
  integrations: async () => ok(loadDb().integrationSettings || []),
  saveIntegration: async (body = {}) => {
    const db = loadDb();
    let item = (db.integrationSettings || []).find((row) => row.key === body.key || row.id === body.id);
    if (!item) { item = { id: makeId("int"), key: body.key || makeId("key"), name: body.name || body.key || "تكامل", provider: body.provider || "custom", createdAt: now() }; db.integrationSettings.unshift(item); }
    Object.assign(item, { enabled: body.enabled === "on" || body.enabled === true, status: body.status || item.status || "CONFIGURED", notes: body.notes || item.notes || "", updatedAt: now() });
    audit(db, "update", "integration", item.id, null, item);
    saveDb(db);
    return ok(item);
  },
  payrollPreview: async (body = {}) => {
    const db = loadDb();
    const from = body.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const to = body.to || new Date().toISOString().slice(0, 10);
    const rows = visibleEmployees(db).map((employee) => {
      const days = (db.attendanceDaily || []).filter((row) => row.employeeId === employee.id && row.date >= from && row.date <= to);
      const workMinutes = days.reduce((sum, row) => sum + Number(row.workMinutes || 0), 0);
      const plannedMinutes = days.length * 8 * 60;
      const overtimeMinutes = Math.max(0, workMinutes - plannedMinutes);
      return { employee, employeeId: employee.id, workHours: Math.round(workMinutes / 60 * 100) / 100, plannedHours: Math.round(plannedMinutes / 60 * 100) / 100, overtimeHours: Math.round(overtimeMinutes / 60 * 100) / 100, absenceDays: days.filter((row) => row.status === "ABSENT").length };
    });
    return ok({ from, to, rows });
  },
  payrollExports: async () => ok(loadDb().payrollExports || []),
  createPayrollExport: async (body = {}) => {
    const db = loadDb();
    const preview = await localEndpoints.payrollPreview(body);
    const item = { id: makeId("pay"), provider: body.provider || "manual-csv", status: "READY", from: preview.from, to: preview.to, rows: preview.rows, createdAt: now() };
    db.payrollExports.unshift(item);
    audit(db, "create", "payroll_export", item.id, null, { provider: item.provider, count: item.rows.length });
    saveDb(db);
    return ok(item);
  },
  accessControlEvents: async () => ok((loadDb().accessControlEvents || []).map((event) => enrichByEmployee(loadDb(), event))),
  createAccessEvent: async (body = {}) => {
    const db = loadDb();
    const item = { id: makeId("door"), employeeId: body.employeeId || currentUser(db)?.employeeId || "", deviceId: body.deviceId || "main-gate", direction: body.direction || "ENTRY", decision: body.decision || "ALLOW", reason: body.reason || "تحقق مزدوج: حساب + حضور", date: now() };
    db.accessControlEvents.unshift(item);
    audit(db, "record", "access_control", item.id, null, item);
    saveDb(db);
    return ok(enrichByEmployee(db, item));
  },
  subscribePush: async (body = {}) => {
    const db = loadDb();
    const item = { id: makeId("push"), userId: currentUser(db)?.id || "local", endpoint: body.endpoint || "local-notification", permission: globalThis.Notification?.permission || "default", createdAt: now() };
    db.pushSubscriptions.unshift(item);
    notify(db, "تم تفعيل إشعارات المتصفح", "ستظهر تنبيهات الحضور والانصراف والطلبات عند السماح من المتصفح.", "SUCCESS");
    saveDb(db);
    return ok(item);
  },
  passkeyStatus: async () => ok(loadDb().passkeyCredentials || []),
  registerPasskey: async (body = {}) => {
    const db = loadDb();
    const user = currentUser(db);
    const item = { id: makeId("passkey"), userId: user?.id || "local", label: body.label || "مفتاح مرور المتصفح", credentialId: body.credentialId || makeId("credential"), platform: body.platform || navigator.platform || "browser", createdAt: now(), lastUsedAt: "", browserSupported: browserSupportsWebAuthn() };
    db.passkeyCredentials.unshift(item);
    if (user) { const raw = findById(db.users, user.id); if (raw) raw.passkeyEnabled = true; }
    audit(db, "register", "passkey", item.id, null, { ...item, credentialId: "stored-client-side-demo" });
    saveDb(db);
    return ok(item);
  },
  offlineQueue: async () => ok(loadDb().offlineQueue || []),
  syncOfflineQueue: async () => {
    const db = loadDb();
    let synced = 0;
    for (const item of db.offlineQueue || []) {
      if (item.status === "PENDING") { item.status = "SYNCED"; item.syncedAt = now(); synced += 1; }
    }
    audit(db, "sync", "offline_queue", "bulk", null, { synced });
    saveDb(db);
    return ok({ synced, remaining: (db.offlineQueue || []).filter((item) => item.status === "PENDING").length });
  },
  reset: async () => {
    const db = normalizeDb(seedDatabase);
    saveDb(db);
    return ok({ ok: true });
  },
};

export const endpoints = new Proxy(localEndpoints, {
  get(target, prop) {
    if (prop in supabaseEndpoints) {
      return async (...args) => {
        if (shouldUseSupabase()) {
          try {
            return await supabaseEndpoints[prop](...args);
          } catch (error) {
            if (supabaseModeIsStrict()) throw error;
            console.warn("Supabase mode failed; falling back to localStorage:", error);
          }
        }
        if (prop in remoteEndpoints) {
          if (shouldUseApi()) {
            try {
              return await remoteEndpoints[prop](...args);
            } catch (error) {
              if (new URLSearchParams(location.search).get("api") && new URLSearchParams(location.search).get("api") !== "local") throw error;
              console.warn("API mode failed; falling back to localStorage:", error);
            }
          }
        }
        return target[prop](...args);
      };
    }
    if (prop in remoteEndpoints) {
      return async (...args) => {
        if (shouldUseApi()) {
          try {
            return await remoteEndpoints[prop](...args);
          } catch (error) {
            if (new URLSearchParams(location.search).get("api") && new URLSearchParams(location.search).get("api") !== "local") throw error;
            console.warn("API mode failed; falling back to localStorage:", error);
          }
        }
        return target[prop](...args);
      };
    }
    return target[prop];
  },
});
