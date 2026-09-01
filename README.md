# آوا‌نویس — تبدیل صوت فارسی به متن

یک وب‌اپ راست‌به‌چپ برای تبدیل گفتار فارسی به متن با [`Puter.js`](https://developer.puter.com/tutorials/free-unlimited-speech-to-text-api/). این پروژه کاملاً سمت‌مرورگر است و برای فراخوانی سرویس تبدیل گفتار به متن، کلید API یا بک‌اند نیاز ندارد.

## امکانات

- بارگذاری فایل صوتی با کشیدن و رها کردن (MP3، WAV، M4A، OGG، WEBM و فرمت‌های صوتی مرورگر)
- ضبط مستقیم با میکروفون دستگاه
- تشخیص زبان فارسی با گزینه‌ی `language: 'fa'`
- انتخاب مدل‌های `gpt-4o-mini-transcribe`، `gpt-4o-transcribe` و `whisper-1`
- خروجی متن ساده، بازه‌های زمانی، یا تفکیک گوینده‌ها
- ترجمه اختیاری گفتار فارسی به انگلیسی
- ویرایش متن، کپی در کلیپ‌بورد و دانلود فایل TXT با UTF-8
- بایگانی کوتاه رونوشت‌ها در `localStorage` همان مرورگر

## اجرا

این یک برنامه‌ی استاتیک است. از ریشه‌ی پروژه یکی از دستورهای زیر را اجرا کنید:

```bash
python3 -m http.server 4173 --bind 0.0.0.0
```

سپس در مرورگر به `http://localhost:4173` بروید.

## نحوه‌ی اتصال به Puter.js

فایل `index.html` اسکریپت رسمی زیر را بارگیری می‌کند:

```html
<script src="https://js.puter.com/v2/"></script>
```

هنگام انتخاب فایل و فشردن «تبدیل صدا به متن»، اپلیکیشن فایل را به data URL با MIME تمیز تبدیل می‌کند — مطابق [مستندات `speech2txt`](https://docs.puter.com/AI/speech2txt/) — سپس این الگو را استفاده می‌کند:

```js
const result = await puter.ai.speech2txt({
  file: 'data:audio/mp3;base64,...',
  language: 'fa',
  model: 'gpt-4o-mini-transcribe',
  response_format: 'json'
});
```

Puter.js فایل‌های مرورگر را به data URL تبدیل می‌کند و نام فایل ارسالی به مدل از زیرنوع MIME ساخته می‌شود. برای همین `audio/mpeg` یا `audio/webm;codecs=opus` حتی برای فایل‌های معتبر MP3/WEBM ممکن است با خطای «فرمت پشتیبانی نشد» رد شوند. اپلیکیشن قبل از ارسال، MIME را به پسوند مورد قبول OpenAI (`mp3`، `wav`، `m4a`، `ogg`، `webm`) هم‌تراز می‌کند.

بسته به تنظیمات رابط، مدل و قالب پاسخ برای زمان‌بندی (`whisper-1` / `verbose_json`) یا تفکیک گوینده (`gpt-4o-transcribe-diarize` / `diarized_json`) به‌طور خودکار تغییر می‌کند. ممکن است Puter در نخستین استفاده، پنجره‌ای برای ورود یا تأیید دسترسی نشان دهد.

## ساختار پروژه

```text
.
├── index.html   # رابط کاربری و بارگیری Puter.js
├── styles.css   # طراحی واکنش‌گرا و RTL
└── app.js       # ضبط، آپلود، فراخوانی speech2txt و خروجی‌ها
```
