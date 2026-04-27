# تثبيت إحداثيات فرع أحلى شباب

تم تطبيق الإحداثيات الدقيقة التي أرسلها المستخدم على نسخة Supabase.

- الفرع: مجمع أحلى شباب - منيل شيحة - الجيزة
- Latitude: `29.951196809090636`
- Longitude: `31.238367688465857`
- Google Maps: https://www.google.com/maps/@29.9511875,31.2384321,16z
- نطاق البصمة الافتراضي: 200 متر

إذا كان مشروع Supabase تم إنشاؤه مسبقًا قبل هذا التحديث، نفّذ الأمر التالي في SQL Editor:

```sql
UPDATE public.branches
SET latitude = 29.951196809090636,
    longitude = 31.238367688465857,
    geofence_radius_meters = 200,
    address = 'منيل شيحة - الجيزة — Google Maps: https://www.google.com/maps/@29.9511875,31.2384321,16z'
WHERE code = 'MAIN';
```
