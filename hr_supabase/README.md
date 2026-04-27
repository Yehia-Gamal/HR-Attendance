# نظام الحضور والانصراف — نسخة Supabase

هذه النسخة تعمل كواجهة Vanilla Web مرتبطة بـ Supabase مباشرة، بدون React أو Next أو Express أو Prisma.

## هيكل الملفات

```text
hr_supabase/
├── index.html              # ملف التشغيل الرئيسي
├── tools/                 # أدوات الصيانة مثل reset-cache.html
├── sw.js                   # Service Worker في الجذر لضمان Scope كامل
├── assets/
│   ├── css/                # ملفات التنسيق
│   ├── js/                 # ملفات JavaScript
│   ├── images/             # الصور والأيقونات
│   └── pwa/                # manifest وملفات PWA
├── docs/
│   ├── reports/            # تقارير الفحص والتنفيذ
│   └── templates/          # قوالب الاستيراد
└── supabase/               # SQL + Edge Functions + config
```

راجع `docs/PROJECT_STRUCTURE.md` للتفاصيل الكاملة.

## البنية التقنية

- Frontend: `index.html` في جذر المشروع + ملفات منظمة داخل `assets/`.
- Backend-as-a-Service: Supabase.
- Database: Supabase PostgreSQL.
- Auth: Supabase Auth.
- Storage: Supabase Storage.
- Realtime: Supabase Realtime.
- Sensitive Admin Logic: Supabase Edge Functions.

## التشغيل المحلي

1. افتح مشروع Supabase جديد.
2. افتح SQL Editor داخل Supabase.
3. شغّل الملف:

```text
supabase/sql/001_schema_rls_seed.sql
```

4. افتح الملف:

```text
assets/js/supabase-config.js
```

واكتب بيانات مشروعك:

```js
window.HR_SUPABASE_CONFIG = {
  enabled: true,
  strict: true,
  url: "https://YOUR_PROJECT.supabase.co",
  anonKey: "YOUR_SUPABASE_ANON_KEY",
  storage: {
    avatarsBucket: "avatars",
    punchSelfiesBucket: "punch-selfies",
    attachmentsBucket: "employee-attachments",
  },
  realtime: {
    enabled: true,
  },
};
```

5. افتح `index.html` من جذر المشروع عبر Live Server.

## إنشاء أول مستخدم Admin

بعد تشغيل SQL، أنشئ مستخدمًا في Supabase Authentication بنفس هذا البريد:

```text
mohamed.youssef@ahla.local
```

واقترح كلمة مرور قوية مثل:

```text
Admin@12345!
```

عند إنشاء المستخدم سيعمل trigger تلقائيًا ويربطه بموظف "الشيخ محمد يوسف" ودور المدير التنفيذي بصلاحيات كاملة.

بعد ذلك يمكنك الدخول من النظام وإنشاء باقي المستخدمين من صفحة المستخدمين، بشرط نشر Edge Function `admin-create-user`.

## نشر Edge Functions

من جهازك بعد تثبيت Supabase CLI:

```bash
supabase functions deploy admin-create-user
supabase functions deploy passkey-register
```

أو انسخ مجلدات `supabase/functions` إلى مشروع Supabase الخاص بك.

## مميزات Supabase المفعلة

- Auth حقيقي.
- RLS لحماية البيانات.
- الموظف يرى نفسه فقط.
- المدير يرى فريقه.
- HR / المدير التنفيذي / السكرتير التنفيذي يرون كل شيء.
- Storage للصور والسيلفي والمرفقات.
- Realtime للوحة Live.
- Geofence للحضور والانصراف.
- سيلفي مع البصمة.
- KPI ذاتي ثم مدير مباشر.
- فروع وأقسام وورديات.
- Audit Log.
- Payroll preview.
- Offline queue محلي.

## ملاحظات إنتاجية مهمة

- لا تضع `service_role` داخل الواجهة أبدًا.
- اضبط Latitude/Longitude الحقيقي لفرع منيل شيحة من جدول `branches` أو من شاشة الفروع.
- WebAuthn الكامل يحتاج تحقق Challenge server-side قبل الاعتماد النهائي.
- Push Notifications الإنتاجية تحتاج VAPID keys وEdge Function لإرسال الإشعارات.
- تكامل Odoo/Xero/SAP يحتاج API keys داخل Edge Functions فقط.
- راجع `docs/reports/SUPABASE_AUDIT_FIX_REPORT.md` بعد تشغيل SQL.

## إعداد Supabase الفعلي المطبق

```text
project_id = ahla-shabab-hr
project_ref = yemradvxmwadlldnxtpz
url = https://yemradvxmwadlldnxtpz.supabase.co
```

ملف الواجهة المضبوط:

```text
assets/js/supabase-config.js
```

ملف Supabase CLI المضبوط:

```text
supabase/config.toml
```

## أوامر التشغيل المقترحة

1. افتح Supabase SQL Editor وشغّل:

```text
supabase/sql/001_schema_rls_seed.sql
```

2. اربط المشروع محليًا، إن كنت تستخدم Supabase CLI:

```bash
supabase link --project-ref yemradvxmwadlldnxtpz
```

3. قبل نشر Edge Functions، اضبط المتغيرات السرية داخل Supabase Dashboard أو CLI:

```bash
supabase secrets set ALLOWED_ORIGINS="http://127.0.0.1:5500,http://localhost:5500"
supabase secrets set SITE_URL="http://127.0.0.1:5500"
```

وعند النشر على دومين حقيقي استبدل localhost بالدومين الفعلي.

4. انشر الدوال:

```bash
supabase functions deploy admin-create-user
supabase functions deploy passkey-register
```

5. شغّل الواجهة من Live Server من جذر المشروع:

```text
index.html
```

## حل رسالة Supabase غير مفعّل

إذا ظهرت رسالة برتقالية تقول إن Supabase غير مفعّل رغم أن `supabase-config.js` مضبوط، افتح `tools/reset-cache.html` عبر Live Server واضغط مسح الكاش. السبب عادةً Service Worker قديم أو كاش متصفح من نسخة سابقة.

## تحديث صورة المستخدم والموبايل

تمت إضافة دعم Avatar للمستخدم من شاشة المستخدمين ومن الإعدادات. عند استخدام Supabase على قاعدة موجودة، شغّل:

```sql
supabase/sql/patches/003_user_avatar_and_mobile_ui.sql
```

بعد تحديث الملفات افتح `tools/reset-cache.html` لمسح الكاش.

## تحديث تبسيط بيانات الموظف والبصمة — 2026-04-27

تم تبسيط نموذج الموظف ليعرض فقط البيانات العملية المطلوبة:
- الاسم الكامل
- رقم الموبايل
- البريد الإلكتروني
- المسمى الوظيفي
- القسم
- المدير المباشر من قائمة الموظفين المسجلين
- الصورة الشخصية

الحقول التالية لم تعد تظهر في واجهة الموظف: الفرع، الحالة، المجمع، المحافظة، كود الموظف، الدور، الوردية. يتم ضبط القيم اللازمة داخليًا فقط للحفاظ على توافق قاعدة البيانات.

تم تعديل شاشة بصمة الموظف لتستخدم Passkey / بصمة الجهاز بدل السيلفي، مع إصلاح إرسال بيانات الموقع GPS باستخدام `accuracyMeters`.

بعد الرفع على Supabase شغّل:

```sql
supabase/sql/patches/005_simplify_employee_punch_fields.sql
```

ثم افتح:

```text
tools/reset-cache.html
```


## تحديث 27 أبريل 2026 — المجمع الواحد والمواقع والشكاوى

- تم حذف قسم الرواتب من القائمة.
- تم حذف قسم الفروع والأقسام من القائمة.
- تم اعتماد مجمع واحد: مجمع منيل شيحة.
- الإحداثيات:
  - Lat: 29.95109939158933
  - Lng: 31.238741920853883
- صفحة المواقع أصبحت تعرض كل الموظفين بالصور، مع تفاصيل كل موظف وسجل آخر موقع.
- زر إرسال إشعار مباشر للموظف لفتح الموقع وإرسال اللوكيشن.
- صفحة الشكاوى أصبحت ترفع الشكوى مباشرة إلى لجنة حل المشاكل والخلافات.
- تم إصلاح استقرار القائمة الجانبية حتى لا تعود لأول القائمة عند تغيير الصفحة.

بعد الرفع شغّل:
`supabase/sql/patches/006_single_branch_locations_disputes_cleanup.sql`

ثم افتح:
`tools/reset-cache.html`
