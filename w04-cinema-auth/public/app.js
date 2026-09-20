const $ = id => document.getElementById(id);
let jwtToken = ''; // เก็บเฉพาะในหน่วยความจำของหน้า ไม่บันทึกลง localStorage.
function show(label, data) {
  $('result-status').textContent = label;
  $('result').textContent = JSON.stringify(data, null, 2);
}
async function request(path, { method = 'GET', data, auth = false } = {}) {
  const headers = {};
  if (data) headers['Content-Type'] = 'application/json';
  if (auth && jwtToken) headers.Authorization = `Bearer ${jwtToken}`;
  const response = await fetch(path, { method, headers, body: data ? JSON.stringify(data) : undefined });
  const body = await response.json();
  show(`${method} ${path} · HTTP ${response.status}`, body);
  return { response, body };
}
function handleError(error) { show('เกิดข้อผิดพลาด', { error: error.message }); }
$('auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  const data = Object.fromEntries(new FormData(event.currentTarget));
  if (button) button.disabled = true;
  try {
    const { response, body } = await request(`/${button?.value || 'login'}`, { method: 'POST', data });
    if (response.ok) {
      jwtToken = body.token;
      $('token').value = jwtToken;
      $('identity').textContent = `เข้าสู่ระบบเป็น ${body.user.username} (${body.user.role})`;
      $('auth-form').elements.password.value = '';
    }
  } catch (error) { handleError(error); }
  finally { if (button) button.disabled = false; }
});
for (const button of document.querySelectorAll('[data-path]')) {
  button.addEventListener('click', () => request(button.dataset.path, { auth: button.dataset.auth === 'true' }).catch(handleError));
}
$('booking-form').addEventListener('submit', async event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const button = event.submitter;
  if (button) button.disabled = true;
  try {
    await request('/api/protect/bookings', { method: 'POST', auth: true,
      data: { showtime_id: Number(data.get('showtime_id')), quantity: Number(data.get('quantity')) } });
  } catch (error) { handleError(error); }
  finally { if (button) button.disabled = false; }
});
$('copy-token').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(jwtToken); $('identity').textContent = jwtToken ? 'คัดลอก JWT แล้ว' : 'เข้าสู่ระบบก่อนเพื่อรับ JWT'; }
  catch { $('token').select(); $('identity').textContent = 'กด Ctrl+C เพื่อคัดลอก'; }
});
$('logout').addEventListener('click', () => {
  jwtToken = ''; $('token').value = ''; $('identity').textContent = 'ล้าง JWT จากหน้านี้แล้ว'; show('ออกจากหน้านี้แล้ว', {});
});
fetch('/config').then(res => res.json()).then(config => { $('oauth-link').href = config.client_origin; }).catch(handleError);
