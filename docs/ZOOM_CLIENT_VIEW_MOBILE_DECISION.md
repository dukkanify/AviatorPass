# قرار معماري — Client View للهاتف vs Component View الحالي

**التاريخ:** 30 أكتوبر 2026 (Asia/Dubai)  
**المنتج:** AviatorPass Classroom (Meeting SDK)  
**Production الحالي:** مجمّد على `5a29c38…` — **لا نشر** حتى موافقة صريحة بعد اختبار الفرع المنفصل  
**قيود محترمة:** لا تطبيق Zoom جديد · لا تغيير CEO/S2S/Scopes/Marketplace دون موافقة المالك

---

## 1) الحكم التنفيذي

| سؤال                                                                        | الحكم                                                         |
| --------------------------------------------------------------------------- | ------------------------------------------------------------- |
| هل نستخدم Component View على Android/iPhone اليوم؟                          | **نعم** — على كل العروض بما فيها الهاتف                       |
| هل ذلك متوافق مع وثائق Zoom الرسمية للموبايل؟                               | **لا** — Component View غير مدعوم على mobile/tablet           |
| هل التحويل إلى Client View على الهاتف **ضروري** للتسليم الاحترافي المتوافق؟ | **نعم — موصى به كمسار إلزامي للموبايل**                       |
| هل نكتفي بإصلاحات CSS على Component View؟                                   | **لا** — يخالف توجيه Zoom ويكرر إصلاحات مؤقتة                 |
| أين ننفّذ؟                                                                  | **فرع منفصل** + اختبار أجهزة حقيقية **قبل** أي نشر Production |

**التوصية:** اعتماد **مسار مزدوج (dual path)**:

- **Desktop (≥900px تقريبًا):** الإبقاء على Component View (`ZoomMtgEmbedded`) — مصمّم لسطح المكتب.
- **Mobile / Tablet:** التحويل إلى **Client View** (`ZoomMtg`) — الموصى به رسميًا للموبايل.

المراجع الرسمية:

- [Browser support — Component view not supported on mobile/tablet; use client view](https://developers.zoom.us/docs/meeting-sdk/web/browser-support/)
- [Client view](https://developers.zoom.us/docs/meeting-sdk/web/client-view/)
- [Meeting SDK authorization / OBF FAQ](https://developers.zoom.us/docs/meeting-sdk/obf-faq/)

---

## 2) ما نستخدمه اليوم (فحص الكود)

| عنصر      | التنفيذ الحالي                                                                    |
| --------- | --------------------------------------------------------------------------------- |
| حزمة SDK  | `zoom-meeting-embedded-6.2.0.min.js` عبر `features/zoom/lib/load-embedded-sdk.ts` |
| API       | `window.ZoomMtgEmbedded.createClient()` → `init({ zoomAppRoot })` → `join(...)`   |
| الواجهة   | Component View داخل `#classroom-sdk-root` في `in-app-zoom-room.tsx`               |
| الهاتف    | **نفس** Component View + طبقات CSS/`pinZoomWindowToStage` لمحاولة احتواء العيوب   |
| الكمبيوتر | نفس المسار — مناسب نسبيًا لسطح المكتب                                             |

**الخلاصة:** أي جلسة Android/iPhone تمر عبر بنية **غير مدعومة** من Zoom. تداخل Leave Class / قصّ الأدوات / Connecting المتكرر على الهاتف ليست مجرد «بقع CSS»؛ جزء كبير منها ناتج عن تشغيل Component View خارج نطاق دعمه.

---

## 3) Client View على الهاتف — التغييرات الدقيقة المطلوبة

### 3.1 تحميل SDK

| Desktop (يبقى)                       | Mobile (جديد)                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `ZoomMtgEmbedded` + vendors الحالية  | `ZoomMtg` Client View scripts من نفس إصدار Meeting SDK (أو أقرب إصدار مدعوم متوافق مع JWT الحالي) |
| لا تغيير على مسار سطح المكتب المستقر | تحميل مشروط عند `matchMedia` / UA / عرض الشاشة                                                    |

### 3.2 دورة الحياة

1. كشف جهاز ضيق (مثلاً `max-width: 900px` أو tablet portrait) → مسار Client View.
2. تهيئة `ZoomMtg.setZoomJSLib` / `preLoadWasm` / `prepareWebSDK` وفق وثائق Client View.
3. `ZoomMtg.init` ثم `ZoomMtg.join` بنفس حمولة الجلسة الحالية من `POST /api/zoom/in-app-session` (`signature` / `hostSignature` + `zak` للمضيف، JWT فقط للطالب).
4. Leave Class يستدعي `ZoomMtg.leaveMeeting` (أو ما يعادله) ثم يعود لـ AviatorPass — **خارج** سطح Client View الكامل، لا فوق أدوات Zoom.
5. Desktop يبقى على `InAppZoomRoom` / Embedded كما هو بعد إصلاحات الهوية (meeting+attempt، بدون signature في مفتاح إعادة الانضمام).

### 3.3 تجربة الهاتف الاحترافية (بدون CSS لإخفاء عيوب Component View)

- صفحة انضمام مبسّطة: هوية الصف + حالة الاتصال + **زر Leave خارج منطقة Zoom**.
- عند `join` الناجح: Client View يملأ الشاشة (سلوك Zoom web client المألوف).
- لا تبويبات Class Materials فوق شريط أدوات Zoom أثناء الاجتماع.
- لا `position: fixed` لإجبار عناصر Component View داخل حاوية ضيقة.

### 3.4 ملفات متوقعة (فرع التنفيذ)

| ملف / منطقة                                                   | دور                                              |
| ------------------------------------------------------------- | ------------------------------------------------ |
| `features/zoom/lib/load-client-view-sdk.ts` (جديد)            | تحميل `ZoomMtg`                                  |
| `features/zoom/components/in-app-zoom-client-view.tsx` (جديد) | غلاف Client View للموبايل                        |
| `features/classes/components/join-class-client.tsx`           | اختيار المسار Mobile vs Desktop                  |
| `features/zoom/lib/load-embedded-sdk.ts`                      | دون تغيير جوهري لسطح المكتب                      |
| اختبارات وحدة + UAT أجهزة                                     | Client View على 360/390/430 + Desktop regression |

**لا يتطلب:** تطبيق Zoom جديد، ولا تدوير Client ID/Secret، ولا Scopes جديدة لمسار التشغيل الداخلي (Option A).

---

## 4) المخاطر

| خطر                                                                     | الشدة        | التخفيف                                                                           |
| ----------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------- |
| اختلاف UX: Client View صفحة كاملة vs Component مضمّن                    | متوسطة       | متوقع ومرغوب على الموبايل؛ إبقاء desktop مضمّنًا                                  |
| مشاركة شاشة **إرسال** غير مدعومة على iOS/Android متصفحًا (قيد Zoom عام) | عالية للقبول | الإفصاح في UAT؛ الاستقبال قد يعمل؛ الإرسال من الكمبيوتر                           |
| تعارض سكربتات Embedded + Client في نفس الصفحة                           | متوسطة       | مسار واحد لكل جلسة؛ عدم تحميل الاثنين معًا                                        |
| تراجع Desktop إن لمسنا المسار المشترك                                   | عالية        | عزل الملفات؛ اختبار regression سطح المكتب قبل الدمج                               |
| Connecting من إعادة init/join (React)                                   | عالية        | الإبقاء على إصلاحات الهوية (`meeting+attempt`، تجميد boot أثناء live) في المسارين |
| افتراض «نفس حساب Zoom» غير مؤكد في البوابة                              | متوسطة       | تحقق يدوي من المالك (§5) قبل الاعتماد النهائي لـ OBF                              |

**Rollback:** إبقاء Feature flag أو كشف جهاز يعيد الموبايل مؤقتًا لرسالة «افتح على الكمبيوتر» إن فشل Client View — **وليس** إعادة Component View كحل دائم للموبايل.

---

## 5) امتثال المصادقة (Option A) — منفصل عن Marketplace

### 5.1 نموذج التشغيل الحالي

| دور                   | الرمز                                     | الغرض                                              |
| --------------------- | ----------------------------------------- | -------------------------------------------------- |
| Meeting SDK Classroom | Client ID لاحقة `VGTQ`                    | JWT للتوقيع فقط                                    |
| S2S المنصة            | لاحقة `uX3Q` + مضيف `ceo@aviatorpass.com` | إنشاء الاجتماعات + `start_url` لاستخراج ZAK للمضيف |
| Instructor OAuth      | لاحقة `Z0xA`                              | اختياري — غير مطلوب للتشغيل المركزي                |

المصدر في الكود: `app/api/zoom/in-app-session/route.ts` — طالب: JWT role 0؛ مضيف مصرّح: JWT role 1 + ZAK من `start_url`/تحديث المضيف.

### 5.2 هل CEO وMeeting SDK ضمن «نفس الحساب»؟

وفق تعريف Zoom لـ **app owner's account**: اجتماعات تُنشأ على مستخدم الحساب المرتبط بتطبيق Meeting SDK لا تحتاج OBF للمشاركين (JWT كافٍ)، والمضيف يحتاج JWT+ZAK.

| بند                                                                  | الحالة                                                                                              |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| التصميم Option A يفترض نفس حساب AviatorPass Zoom                     | معتمد تشغيليًا في الوثائق السابقة                                                                   |
| تحقق بوابة Zoom (مالك التطبيق VGTQ = حساب يضم `ceo@aviatorpass.com`) | **على المالك تأكيده بصريًا في Marketplace/Account** — غير مؤكد آليًا من هذا الوكيل دون دخول البوابة |

إن تبيّن أن اجتماعات S2S على حساب **مختلف** عن مالك تطبيق Meeting SDK، يصبح انضمام الطلاب لاجتماعات «خارجية» مرشحًا لمتطلبات OBF (مسار منفصل موافقة).

### 5.3 هل نحتاج OBF الآن؟

| سيناريو Option A (اجتماعات داخل حساب مالك التطبيق)                  | الرموز المطلوبة                       | OBF؟                               |
| ------------------------------------------------------------------- | ------------------------------------- | ---------------------------------- |
| طالب ينضم                                                           | JWT                                   | **لا**                             |
| مدرس يستضيف بهوية مضيف الاجتماع (ZAK من `start_url` للمضيف المركزي) | JWT + ZAK                             | **لا**                             |
| انضمام لاجتماعات حسابات Zoom خارجية / بوتات تسجيل                   | JWT + OBF (+ OAuth `user:read:token`) | نعم — **خارج نطاق التسليم الحالي** |

**حكم OBF لإغلاق العميل الداخلي:** غير مطلوب طالما الاجتماعات على حساب مالك تطبيق Meeting SDK.  
**Marketplace / مراجعة خارجية / حسابات أجنبية:** مسار منفصل يحتاج موافقة قبل أي Scope أو OBF.

لا نضيف OAuth/Scopes غير مطلوبة لمسار Option A.

---

## 6) Connecting المتكرر — السبب الجذري (أولوية 3)

### 6.1 ما أكّده المالك بالمشاهدة

- Connecting يتكرر مع بقاء «In the meeting».
- على الهاتف: تداخل/قصّ أدوات.
- LIVE / In the meeting مع Status: Finished (خلط حالة الجدول مع حالة الاجتماع).

### 6.2 أسباب جذرية في الكود (مرتبة)

1. **Component View على موبايل غير مدعوم** → سلوك اتصال/UI غير موثوق (رسمي من Zoom).
2. **مفتاح إعادة الانضمام كان يتضمن signature/ZAK** → أي إعادة mint لـ JWT تعيد `init/join` رغم بقاء الشريحة «In the meeting» (معالجة جزئية في فرع `cursor/zoom-classroom-p0-fix-dfeb`: الهوية = `mode|meetingNumber|attempt` فقط + تخطي boot أثناء live).
3. **MutationObserver على `document.body` + `updateVideoOptions`** → ضغط DOM قد يظهر Connecting من Zoom دون نية React (تخفيف: مراقبة الـ stage فقط + عدم تحديث خيارات الفيديو من الطفرات).
4. **Status Finished** من نافذة الجدول الزمني بينما SDK متصل — فصل التسميات Meeting vs Schedule status (في نفس الفرع).

**لا يُعتبر الإصلاح على Component View وحده كافيًا لقبول الموبايل** بعد مراجعة وثائق Zoom.

---

## 7) خطة التنفيذ المقترحة (بعد موافقتك)

| مرحلة                | المحتوى                                                                                                                   | نشر؟                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| A — فرع منفصل        | `cursor/zoom-client-view-mobile-dfeb` من tip الإصلاح الحالي                                                               | لا Production        |
| B — تنفيذ dual path  | Client View موبايل + Component سطح مكتب                                                                                   | Preview فقط          |
| C — UAT أجهزة حقيقية | Android Chrome · iPhone Safari · Desktop Chrome · مدرس+طالب · A/V · Chat · Participants · Share · 15 دقيقة · Leave/Rejoin | —                    |
| D — موافقة المالك    | ثم نشر Production + Rollback plan                                                                                         | فقط بعد PASS الحقيقي |

اختبارات Cloud Agent **ليست** PASS لـ A/V أو استقرار 15 دقيقة.

---

## 8) ما لن نفعله دون موافقة

- إنشاء تطبيق Zoom جديد
- تدوير CEO / S2S / Meeting SDK credentials
- إضافة Scopes أو OBF أو Submit Marketplace
- إنهاء اجتماعات عملاء حقيقيين
- نشر Production قبل UAT الأجهزة على فرع Client View

---

## 9) القرار المطلوب من المالك

1. **اعتماد** أن Client View للموبايل ضروري ومتوافق مع Zoom.
2. **الموافقة على التنفيذ** على فرع منفصل `cursor/zoom-client-view-mobile-dfeb` مع الإبقاء على Component View للكمبيوتر.
3. **تأكيد يدوي** في بوابة Zoom أن تطبيق Meeting SDK (`VGTQ`) ومضيف `ceo@aviatorpass.com` ضمن نفس الحساب.
4. **عدم** فتح OBF/Scopes ضمن هذا المسار ما لم يثبت أن الاجتماعات خارج حساب مالك التطبيق.
