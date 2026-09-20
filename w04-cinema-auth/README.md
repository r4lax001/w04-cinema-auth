# W04 Cinema Auth — JWT และ OAuth

โปรเจกต์ตัวอย่างสำหรับ CSI400 สัปดาห์ที่ 4 ตามโจทย์หน้า 71–72 ของเอกสารที่แนบ ใช้ระบบจองตั๋วหนังเป็นหัวข้อให้เห็นการแบ่งสิทธิ์ชัดเจน

**สถานะส่งมอบ:** ตรวจเฉพาะไวยากรณ์ JavaScript และรูปแบบไฟล์ JSON เท่านั้น ยังไม่ได้รันการทดสอบ API, OAuth, หน้าเว็บ หรือเก็บภาพผลลัพธ์ ผู้เรียนเป็นผู้ทดสอบเอง ไม่มีการอ้างผลว่าเทสผ่าน

## เริ่มใช้งาน

ต้องมี **Node.js 24.x** เพราะฐานข้อมูลใช้ `node:sqlite` ที่มากับ Node ไม่ต้องติดตั้ง MySQL หรือคอมไพล์ SQLite เพิ่ม

1. แตก ZIP แล้วเปิดโฟลเดอร์ `w04-cinema-auth` ใน VS Code
2. เปิด Terminal ให้ตำแหน่งอยู่ในโฟลเดอร์ที่มี `package.json`
3. รันคำสั่งต่อไปนี้

```powershell
npm install
npm start
```

เปิดสองหน้านี้ในเบราว์เซอร์เดียวกัน:

| URL | ใช้ทำอะไร |
| --- | --- |
| http://localhost:3000 | หน้าเว็บสมาชิก: Register / Login / JWT / ข้อมูลหนัง / จองตั๋ว |
| http://localhost:3001 | แอปสาธิต OAuth: Partner สำหรับสมาชิก และ Office สำหรับผู้ดูแล |

`npm start` เปิดทั้งสอง server ให้ และสร้าง `.env` พร้อม JWT secret สุ่มในครั้งแรก ฐานข้อมูลสร้างที่ `data/cinema.sqlite` พร้อมบัญชี หนัง และรอบฉายตัวอย่าง โดยข้อมูลการจองคงอยู่เมื่อปิดแล้วเปิดโปรแกรมใหม่

ใช้ hostname `localhost` ตามตัวอย่าง เพราะ callback, CORS และ issuer ลงทะเบียนชื่อนี้ไว้ หากเปลี่ยนพอร์ตใน `.env` ให้หยุดและเริ่มโปรแกรมใหม่ พร้อมแก้ `base_url` ใน Postman ตามด้วย

ถ้า PowerShell ไม่ยอมรัน `npm.ps1` ให้ใช้ `npm.cmd install` และ `npm.cmd start` แทน หากพบ ExperimentalWarning จาก `node:sqlite` ให้ดูว่ามีข้อความ URL เริ่ม server แล้วหรือไม่ คำเตือนดังกล่าวไม่ใช่ผลการทดสอบ API

## บัญชีตัวอย่าง

| ประเภท | Username | Password |
| --- | --- | --- |
| สมาชิก | `member` | `MemberPass123!` |
| ผู้ดูแล | `admin` | `AdminPass123!` |

บัญชีเหล่านี้เป็นข้อมูลสาธิตในเครื่อง ผู้ใช้ที่สมัครผ่าน `/register` จะได้ role `member` เสมอ ส่ง `role: "admin"` มาในคำขอก็ไม่ทำให้เป็นผู้ดูแล

การแก้ `ADMIN_PASSWORD` / `MEMBER_PASSWORD` ใน `.env` มีผลเฉพาะการสร้างบัญชีที่ยังไม่มีอยู่ ไม่เปลี่ยนรหัสผ่านของบัญชีที่เคยสร้างแล้ว

## สิ่งที่เขียนให้

- Express API พร้อมฐานข้อมูล SQLite แบบ relational มีตาราง users, movies, showtimes และ bookings
- `POST /register` บันทึกรหัสผ่านเป็น bcrypt hash และคืน JWT
- `POST /login` ตรวจรหัสผ่านแล้วคืน JWT อายุเริ่มต้น 1 ชั่วโมง
- Middleware ตรวจ JWT signature, algorithm, issuer, audience และวันหมดอายุ
- OAuth Authorization Code + PKCE (S256) มี client registration, state, หน้า login/consent, code ที่ใช้ได้ครั้งเดียว และ scope
- OAuth Access Token เป็นข้อความสุ่มแบบ opaque อายุเริ่มต้น 15 นาที เก็บในฐานข้อมูลเป็น hash และยกเลิกได้ผ่าน `/oauth/revoke`
- API Public, Protect และ Private อย่างละ 3 ตัวตามตารางถัดไป
- หน้าเว็บสำหรับสาธิตและไฟล์ Postman ที่มีคำขอให้กดทดสอบเอง ไม่มีสคริปต์ assert หรือผลการทดสอบสำเร็จที่สร้างขึ้นล่วงหน้า

## API ธุรกิจครบ 9 ตัว

นิยามสิทธิ์ด้านล่างเป็น **การออกแบบของโปรเจกต์นี้** เพราะโจทย์เปิดให้กำหนด API เอง ไม่ใช่นิยามตายตัวของชื่อ Public/Protect/Private ในทุกระบบ

| ลำดับ | ประเภท | Method และ path | ทำอะไร | สิทธิ์ |
| --- | --- | --- | --- | --- |
| 1 | Public | `GET /api/public/movies` | ดูหนังทั้งหมด | ไม่ต้องมี Token |
| 2 | Public | `GET /api/public/genres` | ดูหมวดหมู่หนัง | ไม่ต้องมี Token |
| 3 | Public | `GET /api/public/showtimes` | ดูรอบฉายที่ยังไม่เริ่มและตั๋วคงเหลือ | ไม่ต้องมี Token |
| 4 | Protect | `GET /api/protect/profile` | ดูโปรไฟล์เจ้าของ Token | JWT หรือ OAuth scope `profile:read` |
| 5 | Protect | `GET /api/protect/bookings` | ดูการจองของเจ้าของ Token | JWT หรือ OAuth scope `bookings:read` |
| 6 | Protect | `POST /api/protect/bookings` | สร้างการจองให้เจ้าของ Token | JWT หรือ OAuth scope `bookings:write` |
| 7 | Private | `GET /api/private/users` | ดูสมาชิกทั้งหมด โดยไม่แสดง password hash | OAuth Office + admin + `users:read` |
| 8 | Private | `GET /api/private/bookings` | ดูการจองของทุกคน | OAuth Office + admin + `bookings:read:all` |
| 9 | Private | `GET /api/private/summary` | ดูจำนวนการจอง ตั๋ว ยอดเงิน และสมาชิก | OAuth Office + admin + `reports:read` |

Login, Register, health, config, authorize, token และ revoke **ไม่นับรวมใน 9 ตัวนี้** การเรียก endpoint เดิมด้วย JWT และ OAuth ยังนับเป็น API เดียวกัน

Private หมายถึง API สำหรับแอปงานภายในตามสิทธิ์ที่ตรวจบน server ในเดโมนี้ ไม่ได้อ้างว่ามีการแบ่งเครือข่ายภายในจริง ทั้งสองแอปรันบนเครื่องเดียวแต่คนละพอร์ตเพื่อแสดงบทบาทแยกกัน

## OAuth ใช้อย่างไร

เริ่มที่ http://localhost:3001 แล้วเลือก:

| แอป | Client ID | บัญชีที่ใช้ | API ที่ได้รับสิทธิ์ |
| --- | --- | --- | --- |
| Cinema Partner | `cinema-partner` | สมาชิกหรือ admin | Protect ตาม scope และเฉพาะข้อมูลเจ้าของบัญชี |
| Cinema Office | `cinema-office` | admin เท่านั้น | Private ตาม scope |

1. กด **ไปหน้าอนุญาตของ Cinema Auth** แอปจะสร้าง `state` และ PKCE verifier แล้วส่ง challenge ไปที่ `/oauth/authorize`
2. หน้า Cinema Auth ที่พอร์ต 3000 แสดงชื่อแอปและสิทธิ์ที่ขอ กรอกบัญชีแล้วเลือกอนุญาตหรือปฏิเสธ
3. เมื่ออนุญาต ระบบส่ง authorization code กลับ callback ที่ลงทะเบียนไว้ คือ `http://localhost:3001/callback`
4. แอปตรวจ state และส่ง code พร้อม verifier ไป `/oauth/token` เพื่อแลกเป็น Access Token
5. แอปแสดง Access Token และใช้ `Authorization: Bearer <access_token>` เรียก API

แอป Partner/Office ไม่รับรหัสผ่านของผู้ใช้ หน้า login อยู่บน authorization server ที่พอร์ต 3000 ทั้งสอง client เป็น browser application จึงไม่มี client secret ฝังใน JavaScript และใช้ PKCE สำหรับผูกการแลก code กับผู้เริ่มคำขอ

JWT เป็นรูปแบบ Token ส่วน OAuth เป็นกระบวนการให้สิทธิ์ โปรเจกต์นี้จงใจใช้ JWT กับการเข้าสู่ระบบโดยตรง และ opaque access token กับ OAuth เพื่อให้เห็นความต่าง **JWT แบบนี้มีลายเซ็น แต่ไม่ได้เข้ารหัสข้อมูลให้เป็นความลับ**

Code มีอายุ 2 นาทีและใช้ได้ครั้งเดียว หากใช้ code เดิมแลกซ้ำหลังผ่านการตรวจ client/PKCE ระบบจะปฏิเสธและยกเลิก Access Token ที่ออกจาก code นั้น การรีเฟรชหน้าสาธิตจะล้าง Token ที่เก็บในหน่วยความจำ ต้องเริ่มเชื่อมต่ออีกครั้ง

## ใช้ Postman ด้วยตัวเอง

1. Import `postman/W04-Cinema.postman_collection.json`
2. ใน Collection Variables ตรวจ `base_url` เป็น `http://localhost:3000`
3. ส่ง **Login member** แล้วคัดลอกค่าฟิลด์ `token` จาก response ไปใส่ `jwt_token`
4. ขอ OAuth ผ่านหน้า http://localhost:3001 ในโหมด Partner แล้วคัดลอก Access Token ไป `partner_access_token`
5. ขอ OAuth อีกครั้งในโหมด Office โดยใช้ admin แล้วคัดลอก Access Token ไป `office_access_token`
6. ส่งคำขอในแต่ละโฟลเดอร์ และเก็บภาพ request, authorization, status code และ response ตามที่อาจารย์กำหนด

ไม่ต้องเติมคำว่า `Bearer` ในตัวแปร เพราะ Postman ตั้งชนิด Authorization เป็น Bearer ให้แล้ว ตัวแปรทั้งสามแยกกันเพื่อไม่เอา Token ผิดประเภทมาใช้

คำขอ **Register new member** ใช้ชื่อ `student01` หากส่งซ้ำแล้วชื่อซ้ำจะได้ 409 ให้แก้ username เมื่อจะลองสมัครบัญชีใหม่ ตัวอย่างการจองใช้ `showtime_id: 1` ให้ดู `/api/public/showtimes` แล้วเปลี่ยนเป็นรอบฉายที่มีอยู่และยังไม่เริ่มก่อนส่ง

ไฟล์ Postman เป็นเพียงคำขอสำเร็จรูป **ไม่มีหลักฐานผลเทส** และไม่ได้ส่งคำขออัตโนมัติ

## ไฟล์สำคัญ

| ไฟล์ | หน้าที่ |
| --- | --- |
| `src/server.mjs` | เปิด API server และ OAuth demo client |
| `src/config.mjs` | อ่าน .env และกำหนด OAuth clients/scopes/callback |
| `src/db.mjs` | เชื่อม SQLite และสร้างข้อมูลเริ่มต้น |
| `database/schema.sql` | โครงสร้างฐานข้อมูล |
| `src/routes/auth.mjs` | สมัครสมาชิกและเข้าสู่ระบบ |
| `src/routes/oauth.mjs` | หน้าอนุญาต, authorization code, access token และ revoke |
| `src/middleware/auth.mjs` | ตรวจ Token, scope และ role |
| `src/routes/public.mjs` | Public API 3 ตัว |
| `src/routes/protect.mjs` | Protect API 3 ตัว |
| `src/routes/private.mjs` | Private API 3 ตัว |
| `public/` | หน้าเว็บสมาชิก |
| `client/` | หน้าแอปสาธิต OAuth |
| `postman/` | Collection สำหรับผู้เรียนใช้ทดสอบเอง |
| `API_REFERENCE.md` | รายละเอียด request/response และสถานะที่ออกแบบไว้ |

## ขอบเขตและงานที่ผู้เรียนต้องทำต่อ

- ฐานข้อมูลนี้เป็น **ตัวอย่างใหม่** เพราะยังไม่ได้รับฐานข้อมูลงานสัปดาห์ก่อน ถ้าอาจารย์กำหนดให้ใช้ของเดิม ต้องนำ schema/ข้อมูลเดิมมาปรับเชื่อมต่อก่อนส่ง
- ทดสอบเองทั้ง success, ไม่มี Token, Token หมดอายุ/ผิด, scope ไม่พอ, role ไม่พอ และการแยกข้อมูลระหว่างผู้ใช้ เก็บหลักฐานที่เกิดขึ้นจริง
- นำเสนออาจารย์ แล้วส่ง source code, หลักฐาน และคำอธิบายการตั้งค่า JWT/OAuth ตามโจทย์
- รัน `npm run check` ได้หากต้องการตรวจไวยากรณ์อีกครั้ง คำสั่งนี้ไม่ส่ง HTTP request และไม่ใช่การทดสอบการทำงาน
- เดโมรองรับเฉพาะการจองจำนวนตั๋ว ไม่มีเลือกตำแหน่งที่นั่ง/ชำระเงินจริง และไม่มี Refresh Token เพราะไม่ใช่ข้อกำหนดหลัก
- ปุ่มออกจากหน้านี้ล้าง JWT ฝั่งหน้าเว็บเท่านั้น JWT ที่คัดลอกไว้ยังใช้ได้จนหมดอายุ ส่วน OAuth มีการ revoke ที่ server
- ออกแบบสำหรับ localhost ในชั้นเรียน รหัสผ่านตัวอย่างเป็นข้อมูลสาธิต และยังไม่ได้ผ่านการทดสอบเพื่อเปิดให้บริการจริง HTTP ใช้เฉพาะบริบท localhost นี้

## เอกสารอ้างอิงที่ใช้ประกอบการเขียน

- [Express 5 API](https://expressjs.com/en/5x/api/)
- [Node.js SQLite](https://nodejs.org/api/sqlite.html)
- [OAuth 2.0 Authorization Framework — RFC 6749](https://www.rfc-editor.org/rfc/rfc6749.html)
- [PKCE — RFC 7636](https://www.rfc-editor.org/rfc/rfc7636.html)

โปรเจกต์นี้เป็นการนำ flow ที่จำเป็นมาใช้เพื่อการเรียน ไม่ได้อ้างการรับรองว่าครอบคลุม OAuth ทุกข้อกำหนด
