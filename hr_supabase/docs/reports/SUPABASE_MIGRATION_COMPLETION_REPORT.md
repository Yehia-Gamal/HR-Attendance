# تقرير تحويل النظام إلى Supabase

تم تجهيز نسخة Supabase من نظام HR Attendance بنفس واجهة Vanilla Web والثيم الداكن والـ Responsive، مع الاستغناء عن Express/Prisma في التشغيل اليومي.

## ما تم تنفيذه

- إضافة `assets/js/supabase-config.js` لإعداد Supabase.
- إضافة `assets/js/supabase-api.js` كطبقة API جديدة تتصل مباشرة بـ Supabase.
- تعديل `assets/js/api.js` ليستخدم Supabase عند تفعيله، مع fallback محلي فقط عند عدم تفعيل Supabase.
- تعديل `index.html` لتحميل إعدادات Supabase.
- إضافة SQL كامل لإنشاء قاعدة البيانات والجداول والـ RLS والـ Storage buckets والـ Seed.
- إضافة Edge Function لإنشاء مستخدمين من داخل النظام بدون كشف service_role key.
- إضافة Edge Function مبدئية لتسجيل Passkey metadata.
- إزالة Express/Prisma/server من نسخة Supabase.

## الملفات الجديدة

- `supabase/sql/001_schema_rls_seed.sql`
- `supabase/functions/admin-create-user/index.ts`
- `supabase/functions/passkey-register/index.ts`
- `supabase/functions/_shared/cors.ts`
- `assets/js/supabase-config.js`
- `assets/js/supabase-api.js`
- `docs/SUPABASE_MIGRATION_COMPLETION_REPORT.md`

## الصلاحيات RLS

- الموظف يرى بياناته وحضوره وتقييمه فقط.
- المدير المباشر يرى فريقه.
- HR والمدير التنفيذي والسكرتير التنفيذي لديهم صلاحيات كاملة.
- Storage منفصل للصور الشخصية والسيلفي والمرفقات.

## ما يحتاج ضبطًا منك

- إنشاء مشروع Supabase.
- تشغيل SQL.
- وضع `url` و `anonKey` في `supabase-config.js`.
- إنشاء أول مستخدم Auth بنفس بريد الشيخ محمد يوسف.
- نشر Edge Functions إذا أردت إنشاء المستخدمين من داخل النظام.
- تم ضبط إحداثيات الفرع الحقيقية على `29.951196809090636, 31.238367688465857`.

## ما لم يتم تفعيله 100% لعدم وجود أجهزة/مفاتيح

- WebAuthn verification الكامل يحتاج challenge/verify production implementation.
- Push Notifications الحقيقية تحتاج VAPID ومزود إرسال.
- ربط Odoo/Xero/SAP يحتاج مفاتيح API.
- ربط بوابات الدخول يحتاج جهاز/API فعلي.
