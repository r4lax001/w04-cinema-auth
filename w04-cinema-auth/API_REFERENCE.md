# API reference

Base URL เริ่มต้น: `http://localhost:3000` ข้อมูล response ด้านล่างอธิบาย **พฤติกรรมที่เขียนไว้ในโค้ด ไม่ใช่ผลทดสอบที่รันแล้ว**

## สมัครสมาชิก / เข้าสู่ระบบ

`POST /register` หรือ `POST /login` ตั้ง `Content-Type: application/json`

```json
{
  "username": "student01",
  "password": "StudentPass123!"
}
```

ฟิลด์ที่คืนเมื่อสำเร็จ: `token`, `token_type`, `expires_in`, `user` (id/username/role)

| เงื่อนไข | HTTP ที่ออกแบบไว้ |
| --- | --- |
| สมัครสมาชิกสำเร็จ | 201 |
| Login สำเร็จ | 200 |
| username/password รูปแบบไม่ถูกต้อง | 400 |
| Login ไม่สำเร็จ | 401 |
| สมัครชื่อซ้ำ | 409 |
| คำขอ login/register/oauth เกิน 30 ครั้งต่อนาทีต่อ IP | 429 |

username รับตัวอังกฤษ ตัวเลข และ `_` 3–30 ตัว ไม่แยกตัวพิมพ์เล็ก/ใหญ่เมื่อค้นหาในฐานข้อมูล รหัสผ่านยาวอย่างน้อย 8 ตัวและไม่เกิน 72 UTF-8 bytes เพื่อไม่ให้ bcrypt ตัดท้ายข้อมูลโดยเงียบ

## Public API

| Method/path | ฟิลด์หลักใน response |
| --- | --- |
| `GET /api/public/movies` | `movies`: id/title/genre/duration_minutes |
| `GET /api/public/genres` | `genres`: รายชื่อหมวดหมู่ |
| `GET /api/public/showtimes` | `showtimes`: id/movie_id/starts_at/hall/price_baht/capacity/title/available |

ไม่ต้องใส่ Authorization สถานะสำเร็จ 200 รายการรอบฉายกรองรอบที่เริ่มแล้วออก

## Protect API

ใส่ `Authorization: Bearer <JWT หรือ OAuth Partner Access Token>`

| Method/path | Scope ที่ต้องใช้เมื่อเป็น OAuth | ผลลัพธ์ |
| --- | --- | --- |
| `GET /api/protect/profile` | `profile:read` | ข้อมูลผู้ใช้เจ้าของ Token |
| `GET /api/protect/bookings` | `bookings:read` | การจองของเจ้าของ Token |
| `POST /api/protect/bookings` | `bookings:write` | การจองที่สร้างขึ้น (201) |

Body สำหรับสร้างการจอง:

```json
{
  "showtime_id": 1,
  "quantity": 2
}
```

quantity ต้องเป็น integer 1–6 ไม่รับ user_id หรือราคาจากผู้เรียกเพื่อกำหนดเจ้าของ/ยอดเงิน ระบบอ่านเจ้าของจาก Token และคำนวณราคาจากฐานข้อมูล การตรวจจำนวนตั๋วและเพิ่มการจองอยู่ใน transaction เดียวกัน

## Private API

ใส่ `Authorization: Bearer <OAuth Office Access Token>` ที่ผู้ใช้ admin อนุญาตให้ `cinema-office`

| Method/path | Scope | ผลลัพธ์ |
| --- | --- | --- |
| `GET /api/private/users` | `users:read` | รายการสมาชิก ไม่มีรหัสผ่าน/hash |
| `GET /api/private/bookings` | `bookings:read:all` | รายการจองทุกคน |
| `GET /api/private/summary` | `reports:read` | จำนวนการจอง ตั๋ว ยอดเงิน และผู้ใช้ |

ใช้ JWT ของ admin อย่างเดียวไม่ผ่าน เพราะออกแบบให้ Private ต้องผ่าน OAuth Office ด้วย

## OAuth endpoints (ไม่นับรวม 9 API)

| Method/path | หน้าที่ |
| --- | --- |
| `GET /oauth/authorize` | ตรวจ client/callback/scope/state/PKCE แล้วแสดงหน้า login และขอความยินยอม |
| `POST /oauth/authorize` | รับแบบฟอร์มในเบราว์เซอร์ ตรวจบัญชีและ CSRF/browser binding แล้วออก code หรือปฏิเสธ |
| `POST /oauth/token` | แลก code ที่ยังไม่หมดอายุและยังไม่ใช้ พร้อม verifier เป็น access token |
| `POST /oauth/revoke` | ยกเลิก access token ของ client นั้น |

หน้า http://localhost:3001 จะจัดการ authorize, callback และการแลก token ให้ เหมาะสำหรับรับ Token ไปใช้ Postman

ตัวแปรของ authorization request: `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`, `code_challenge`, `code_challenge_method=S256`

Token request ใช้ `application/x-www-form-urlencoded`:

```text
grant_type=authorization_code
client_id=cinema-partner
redirect_uri=http://localhost:3001/callback
code=<authorization code ที่ยังไม่ถูกใช้>
code_verifier=<ค่าที่ผูกกับ code_challenge ตอนเริ่มขอสิทธิ์>
```

Token response มี `access_token`, `token_type`, `expires_in`, `scope` ไม่มี refresh token

**ห้ามนำ code จาก flow ที่หน้าเว็บแลกเสร็จแล้วมาแลกซ้ำ** เพราะ code ใช้ครั้งเดียวและจะทำให้ Token ที่ออกจาก code นั้นถูก revoke

Revoke request ใช้ `application/x-www-form-urlencoded`: `client_id` และ `token` สำเร็จคืน HTTP 200 ไม่มี body และไม่บอกว่า Token นั้นเคยมีอยู่หรือไม่

## สถานะสำหรับ Protected/Private

| HTTP | ความหมายในโค้ด |
| --- | --- |
| 200 | อ่านข้อมูลสำเร็จ |
| 201 | สร้างการจองสำเร็จ |
| 400 | Body หรือค่าที่ส่งไม่ถูกต้อง |
| 401 | ไม่ส่ง Token, Token ผิด, หมดอายุ หรือถูก revoke |
| 403 | Token ถูกต้อง แต่ role/client/scope/ประเภท Token ไม่ตรงสิทธิ์ |
| 404 | ไม่พบรอบฉายหรือ endpoint |
| 409 | ตั๋วไม่พอหรือรอบฉายเริ่มแล้ว |

OAuth protocol errors ใช้รูปแบบ `{ "error": "...", "error_description": "..." }` เช่น invalid_request, invalid_grant, invalid_client และ invalid_scope หน้า authorize ที่ผ่านการตรวจ callback แล้วอาจส่ง error กลับผ่าน redirect ตาม flow
