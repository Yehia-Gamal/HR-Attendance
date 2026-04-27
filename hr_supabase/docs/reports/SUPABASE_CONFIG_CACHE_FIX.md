# إصلاح ظهور رسالة Supabase غير مفعّل

تم تثبيت إعدادات Supabase الحقيقية داخل `assets/js/supabase-config.js` وتم رفع رقم نسخة ملفات الواجهة والـ Service Worker لمنع تحميل ملفات قديمة من الكاش.

إذا ظهرت الرسالة البرتقالية مرة أخرى بعد فك الضغط:

1. افتح `tools/reset-cache.html` من جذر المشروع عبر Live Server.
2. اضغط: مسح الكاش وإعادة فتح النظام.
3. أو افتح DevTools > Application > Service Workers > Unregister، ثم Storage > Clear site data.

الإعداد الحالي:

- Project: `ahla-shabab-hr`
- Ref: `yemradvxmwadlldnxtpz`
- URL: `https://yemradvxmwadlldnxtpz.supabase.co`
- Supabase mode: enabled + strict
