const $ = id => document.getElementById(id);
const PENDING = 'cinema-oauth-pending';
let config;
let accessToken = ''; // ไม่เก็บ access token ลง localStorage/sessionStorage.
let tokenClientId = '';
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
function show(label, data) {
  $('result-status').textContent = label;
  $('result').textContent = JSON.stringify(data, null, 2);
}
function updateClient() {
  const client = config.clients[$('client').value];
  $('scopes').textContent = client.scopes.join(' ');
  $('client-info').textContent = client.adminOnly ? 'อ่านข้อมูลภายใน ต้องได้รับความยินยอมจาก admin' : 'อ่านโปรไฟล์และจัดการการจองแทนเจ้าของบัญชี';
}
async function connect() {
  const clientId = $('client').value;
  const client = config.clients[clientId];
  const verifier = random();
  const state = random();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  // เก็บเฉพาะตัวตรวจ callback ชั่วคราว และลบทิ้งเมื่อใช้แล้ว.
  sessionStorage.setItem(PENDING, JSON.stringify({ verifier, state, clientId, redirectUri: client.redirectUri, createdAt: Date.now() }));
  const url = new URL('/oauth/authorize', config.api_origin);
  url.search = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: client.redirectUri,
    scope: client.scopes.join(' '), state, code_challenge: base64url(new Uint8Array(digest)), code_challenge_method: 'S256' });
  location.assign(url.href);
}
async function callback() {
  if (location.pathname !== '/callback') return;
  const query = new URLSearchParams(location.search);
  const saved = sessionStorage.getItem(PENDING);
  sessionStorage.removeItem(PENDING);
  history.replaceState({}, '', '/'); // ลบ code ออกจาก address bar ก่อนเรียก API ต่อ.
  const pending = saved ? JSON.parse(saved) : null;
  if (!pending || query.get('state') !== pending.state || Date.now() - pending.createdAt > 600000) {
    throw new Error('state ไม่ตรงหรือคำขอหมดอายุ กรุณาเริ่มเชื่อมต่อใหม่');
  }
  $('client').value = pending.clientId;
  updateClient();
  if (query.has('error')) throw new Error(`การอนุญาตไม่สำเร็จ: ${query.get('error')}`);
  if (!query.get('code')) throw new Error('ไม่ได้รับ authorization code');
  const response = await fetch(`${config.api_origin}/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: query.get('code'),
      client_id: pending.clientId, redirect_uri: pending.redirectUri, code_verifier: pending.verifier })
  });
  const body = await response.json();
  show(`POST /oauth/token · HTTP ${response.status}`, body);
  if (!response.ok) throw new Error(body.error_description || body.error);
  accessToken = body.access_token;
  tokenClientId = pending.clientId;
  $('access-token').value = accessToken;
  $('token-status').textContent = `ได้รับสิทธิ์ ${body.scope} · อายุ ${body.expires_in} วินาที`;
}
async function api(path) {
  const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
  const response = await fetch(`${config.api_origin}${path}`, { headers });
  show(`GET ${path} · HTTP ${response.status}`, await response.json());
}
function error(error) { show('เกิดข้อผิดพลาด', { error: error.message }); }
async function main() {
  const response = await fetch('/config');
  if (!response.ok) throw new Error('โหลดการตั้งค่าไม่ได้');
  config = await response.json();
  $('home-link').href = config.api_origin;
  updateClient();
  $('client').addEventListener('change', updateClient);
  $('connect').addEventListener('click', () => connect().catch(error));
  for (const button of document.querySelectorAll('[data-path]')) button.addEventListener('click', () => api(button.dataset.path).catch(error));
  $('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(accessToken); $('token-status').textContent = accessToken ? 'คัดลอก Access Token แล้ว' : 'เชื่อมต่อก่อนเพื่อรับ Token'; }
    catch { $('access-token').select(); $('token-status').textContent = 'กด Ctrl+C เพื่อคัดลอก'; }
  });
  $('revoke').addEventListener('click', async () => {
    if (!accessToken) return show('ยังไม่มี Token', {});
    try {
      const response = await fetch(`${config.api_origin}/oauth/revoke`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: accessToken, client_id: tokenClientId })
      });
      if (!response.ok) throw new Error('ยกเลิกสิทธิ์ไม่สำเร็จ');
      accessToken = ''; $('access-token').value = ''; $('token-status').textContent = 'ยกเลิก Token แล้ว'; show('POST /oauth/revoke · HTTP 200', {});
    } catch (err) { error(err); }
  });
  await callback();
}
main().catch(error);
