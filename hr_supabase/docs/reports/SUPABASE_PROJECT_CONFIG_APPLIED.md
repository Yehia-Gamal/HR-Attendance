# Supabase Project Config Applied

تم تطبيق إعدادات Supabase التي أرسلها المستخدم على النسخة الحالية.

## Project

```toml
project_id = "ahla-shabab-hr"

[functions.admin-create-user]
verify_jwt = true

[functions.passkey-register]
verify_jwt = true
```

## Frontend Config

```js
window.HR_SUPABASE_CONFIG = {
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
  realtime: { enabled: true },
};
```

## ما تم الحفاظ عليه من إصلاحات التدقيق

- CORS ليس wildcard، ويعتمد على `ALLOWED_ORIGINS` و `SITE_URL`.
- صلاحيات المديرين تعتمد على role/permissions وليس الإيميل الثابت.
- Passkeys مقفولة افتراضيًا إلى أن يتم تفعيل تحقق WebAuthn server-side كامل.
- Audit logs لا تُكتب بسياسة مفتوحة لأي مستخدم.
- إحداثيات الفرع الرئيسي مضبوطة على:
  - Latitude: `29.951196809090636`
  - Longitude: `31.238367688465857`

## المطلوب قبل Go Live

- ضبط `ALLOWED_ORIGINS` على دومين الواجهة النهائي.
- إنشاء أول مستخدم من Supabase Auth بنفس بريد المدير التنفيذي أو HR ثم ربطه بالـ profile/employee.
- اختبار الحضور والانصراف من الموقع الفعلي.
