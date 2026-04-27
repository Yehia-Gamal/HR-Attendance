# تقرير إعادة تنظيم ملفات نظام HR Attendance

تاريخ التنفيذ: 27 أبريل 2026

## ما تم تنفيذه

1. نقل `web/index.html` إلى جذر المشروع باسم `index.html`.
2. حذف فولدر `web` من النسخة النهائية بعد نقل كل محتوياته إلى أماكن مرتبة.
3. نقل ملفات CSS إلى:
   - `assets/css/styles.css`
4. نقل ملفات JavaScript إلى:
   - `assets/js/app.js`
   - `assets/js/api.js`
   - `assets/js/database.js`
   - `assets/js/register-sw.js`
   - `assets/js/supabase-api.js`
   - `assets/js/supabase-config.js`
5. نقل الصور والأيقونات إلى:
   - `assets/images/`
6. نقل ملف PWA Manifest إلى:
   - `assets/pwa/manifest.json`
7. إبقاء `sw.js` في الجذر لضمان Scope صحيح للتطبيق كاملًا.
8. نقل التقارير إلى:
   - `docs/reports/`
9. نقل قوالب البيانات إلى:
   - `docs/templates/`
10. تحديث جميع المسارات داخل:
    - `index.html`
    - `sw.js`
    - `assets/pwa/manifest.json`
    - `assets/js/app.js`
    - `assets/js/supabase-api.js`
    - `assets/js/supabase-config.js`
    - `tools/reset-cache.html`
    - `README.md`
    - تقارير `docs/reports/`

## أشياء تم حذفها أو الاستغناء عنها

- فولدر `web/` بالكامل.
- النسخة المكررة `web/cache-reset.html`.
- أي تكرار لمسارات قديمة تشير إلى `web/`.

## النتيجة النهائية

أصبح المشروع منظّمًا إلى أقسام واضحة:

- ملفات التشغيل الأساسية في الجذر.
- الواجهة والسكريبتات داخل `assets/`.
- الصور داخل `assets/images/`.
- CSS داخل `assets/css/`.
- JavaScript داخل `assets/js/`.
- التقارير داخل `docs/reports/`.
- قوالب البيانات داخل `docs/templates/`.
- Supabase داخل `supabase/`.
