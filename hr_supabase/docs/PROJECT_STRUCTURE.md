# هيكل المشروع بعد إعادة التنظيم

تاريخ التنظيم: 27 أبريل 2026

## الجذر

```text
hr_supabase/
├── index.html              # ملف التشغيل الرئيسي خارج أي فولدر
├── sw.js                   # Service Worker في الجذر حتى يتحكم في التطبيق كاملًا
├── README.md
├── .env.example
├── .gitignore
├── assets/
├── docs/
├── supabase/
└── tools/
```

## assets

```text
assets/
├── css/
│   └── styles.css
├── js/
│   ├── app.js
│   ├── api.js
│   ├── database.js
│   ├── register-sw.js
│   ├── supabase-api.js
│   └── supabase-config.js
├── images/
│   ├── ahla-shabab-logo.png
│   ├── favicon-64.png
│   ├── icon-192.png
│   └── icon-512.png
└── pwa/
    └── manifest.json
```

## tools

```text
tools/
└── reset-cache.html        # مسح الكاش والـ Service Worker القديم
```

## docs

```text
docs/
├── PROJECT_STRUCTURE.md
├── reports/       # تقارير الفحص والتنفيذ السابقة
└── templates/     # قوالب الاستيراد والبيانات المساعدة
```

## supabase

```text
supabase/
├── config.toml
├── functions/
└── sql/
```

## ملاحظات مهمة

- تم حذف فولدر `web` نهائيًا لأنه لم يعد له داعٍ بعد نقل `index.html` إلى الجذر.
- تم حذف النسخة المكررة `web/cache-reset.html` والاحتفاظ بملف واحد فقط: `tools/reset-cache.html`.
- تم تحديث مسارات الصور، ملفات JavaScript، CSS، manifest، وService Worker حتى تعمل من الهيكل الجديد.
- بقي `sw.js` في الجذر عمدًا؛ لأن Service Worker لو وُضع داخل فولدر فرعي قد لا يستطيع التحكم في التطبيق كاملًا بدون إعدادات Server خاصة.
