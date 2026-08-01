/* ============================================================
   SRDI External Fund 2.0 — app.js  (ด่าน 2.4 · หน้าเว็บสาธารณะ)

   หน้าเว็บ decoupled: เรียก Google Apps Script Web App ด้วย fetch (text/plain)
   ตาม "04 ไฟล์ติดตั้ง/API_CONTRACT.md" หมวด 0 และ 2.5 — ห้ามขัดสัญญาแม้ข้อเดียว

   หน้าในเฟสนี้
     home     หน้าหลัก
     form     ฟอร์มยื่นคำขอ 3 ขั้น (ยืนยันอีเมลด้วย OTP ตอนจบขั้นที่ 1 — ฟีเจอร์ E4)
     track    ติดตามสถานะรายงวด (ต้องยืนยัน OTP ก่อน — มติ EF-D33)
     detail   รายละเอียดฉบับเต็ม 4 ส่วน + พิมพ์แบบคำขอ
     evaluate แบบประเมินเพื่อรับใบเสร็จ (เปิดจากลิงก์ในอีเมลได้)
     recover  กู้คืนรหัสบริการทางอีเมล
   หน้าเจ้าหน้าที่ (แดชบอร์ด/คิวงาน) = เฟส 3 ขึ้นไป ยังไม่อยู่ในไฟล์นี้

   กติกาที่ห้ามผิด
     · ส่งด้วย Content-Type: text/plain;charset=utf-8 เท่านั้น (ชนิดอื่นทำให้เบราว์เซอร์
       ยิง preflight OPTIONS ซึ่ง Apps Script ไม่รองรับ → พังทุกครั้ง)
     · ห้ามใช้ custom header · ห้ามพึ่งกลไกฝังหน้าเว็บของ Apps Script
       และห้ามเรียกฟังก์ชันฝั่งเซิร์ฟเวอร์ผ่านสะพานของ Apps Script — ต้องยิงผ่าน fetch เท่านั้น
       (ตัวตรวจ 05 Tools - QA/frontend-check.js บังคับว่าคำเหล่านั้นต้องไม่โผล่ในไฟล์นี้เลย
        แม้แต่ในคอมเมนต์ เพื่อให้ grep ตาม playbook ได้ผลสะอาด)
     · ชื่อพารามิเตอร์ที่ส่งขึ้นหลังบ้านเป็น snake_case ตาม API_CONTRACT
       (id ของ input ใน HTML ยังเป็น camelCase เดิมตาม SPEC หมวด 9)
     · ห้ามเก็บความลับในไฟล์นี้ — หน้าเว็บเป็นไฟล์สาธารณะ ใครก็เปิดอ่านได้
   ============================================================ */
'use strict';

/* ★★★★★  จุดที่ต้องกรอกเอง (จุดเดียวในทั้งโปรเจคหน้าเว็บ)  ★★★★★
   วาง /exec URL ที่ได้จากการ Deploy หลังบ้าน (Apps Script) แทนข้อความ placeholder ด้านล่าง
   หน้าตาของค่าที่ถูกต้อง: ขึ้นต้นด้วย https:// ... /macros/s/ ... และ "ลงท้ายด้วย /exec"
   (ห้ามใช้ URL ที่ลงท้ายด้วย /dev — ตัวนั้นใช้ได้เฉพาะตอนที่ท่านล็อกอินบัญชีเจ้าของสคริปต์อยู่)
   ดูขั้นตอนใน README_Phase2_วิธีติดตั้ง.md หมวด 14 (ตาราง "บัญชีจุดที่ต้องกรอกเอง")
*/
const API_URL = 'PASTE_WEBAPP_EXEC_URL_HERE';

/* ============================================================
   0) ค่าคงที่ของหน้าเว็บ
   ============================================================ */
const API_PLACEHOLDER = 'PASTE_WEBAPP_EXEC_URL_HERE';
const API_TIMEOUT_MS  = 45000;        // ไฟล์แนบทำให้ช้ากว่าปกติ จึงเผื่อไว้ 45 วินาที
const PAGES = ['home', 'form', 'track', 'detail', 'evaluate', 'recover'];
const TABS = [
  { id: 'home',  t: 'หน้าหลัก' },
  { id: 'form',  t: '📝 ยื่นคำขอ', cta: 1 },
  { id: 'track', t: '🔎 ติดตามสถานะ' }
];

/* วัตถุประสงค์ของ OTP — ★ 2 ใบนี้ใช้แทนกันไม่ได้ (มติ EF-D22) */
const PURPOSE_SUBMIT = 'requester_submit';   // ยื่นคำขอ
const PURPOSE_VIEW   = 'requester_view';     // ดู / ทำแบบประเมิน

/* ★ รายการตัวเลือกคงที่ 3 ชุด (SPEC หมวด 9.4 — ถ้อยคำห้ามเปลี่ยนแม้แต่ตัวอักษรเดียว)
   เก็บสำรองไว้ในหน้าเว็บเพื่อให้ฟอร์มยังวาดได้ถ้า config ยังโหลดไม่เสร็จ
   ★ ค่าที่ใช้จริงอ่านจาก config ของหลังบ้านก่อนเสมอ (ดู staffTypes/faculties/fundingSources) */
const FALLBACK_STAFF_TYPES = [
  'บุคลากรมหาวิทยาลัย (สายวิชาการ)',
  'บุคลากรมหาวิทยาลัย (สายสนับสนุน)',
  'ผู้ช่วยนักวิจัย / ผู้ประสานงาน / อื่นๆ'
];
const FALLBACK_FACULTIES = [
  'คณะวิทยาการจัดการ',
  'คณะวิทยาศาสตร์เทคโนโลยีและการเกษตร',
  'คณะมนุษย์ศาสตร์',
  'คณะครุศาสตร์',
  'คณะสาธารณสุขศาสตร์และสหเวชศาสตร์',
  'สำนักวิทยบริการและเทคโนโลยีสารสนเทศ',
  'สถาบันวิจัยและพัฒนาชายแดนภาคใต้',
  'สำนักงานอธิการบดี'
];
const FALLBACK_FUNDING_SOURCES = [
  'สำนักงานการวิจัยแห่งชาติ (วช.)',
  'สำนักงานนวัตกรรมแห่งชาติ (สนช.) (NIA)',
  'สำนักงานพัฒนาการวิจัยการเกษตร (สวก.) (ARDA)',
  'สถาบันวิจัยระบบสาธารณสุข (สวรส.) (HSRI)',
  'หน่วยบริหารและจัดการทุนด้านการพัฒนาระดับพื้นที่ (บพท.) (PMU-A)',
  'หน่วยบริหารและจัดการทุนด้านการพัฒนากำลังคน (บพค.) (PMU-B)',
  'หน่วยบริหารและจัดการทุนด้านการเพิ่มความสามารถในการแข่งขัน (บพข.) (PMU-C)',
  'สถาบันวัคซีนแห่งชาติ (สวช.) (NVI)',
  'ศูนย์ความเป็นเลิศด้านชีววิทยาศาสตร์ (ศลช.) (TCELS)',
  'Fundamental Fund',
  'อื่นๆ โปรดระบุ'
];
const FALLBACK_FEEDBACK_CATEGORIES = ['แจ้งปัญหาการใช้งาน', 'ข้อเสนอแนะ', 'สอบถาม', 'อื่น ๆ'];

/* หน่วยงานที่ต้องระบุหน่วยงานย่อยเพิ่ม · ประเภทบุคลากรที่ต้องระบุชื่อโครงการที่รับผิดชอบ
   (เงื่อนไขเดียวกับที่ Service.gs ตรวจฝั่งเซิร์ฟเวอร์ — หน้าเว็บตรวจซ้ำเพื่อบอกผู้ใช้ก่อน) */
const FACULTY_NEEDS_SUBUNIT = 'สำนักงานอธิการบดี';

/* แมปสถานะไทย → คลาสสีของธีม STAR (SPEC หมวด 12.4) */
const STATUS_CLASS = {
  'บันทึกข้อมูลขอรับบริการ': 'b-new',
  'บันทึกข้อมูลงบประมาณเข้าสู่ระบบ YRU ERP': 'b-assigned',
  'งานการคลังออกใบเสร็จ': 'b-progress',
  'สำเนาใบเสร็จรับเงิน (สำเร็จ)': 'b-closed',
  'นำส่งใบเสร็จกลับไปยังแหล่งทุน': 'b-closed',
  'รอการแก้ไข': 'b-revision',
  'ยกเลิกบริการ': 'b-cancel'
};
const STATUS_DOT = {
  'บันทึกข้อมูลขอรับบริการ': 'g',
  'บันทึกข้อมูลงบประมาณเข้าสู่ระบบ YRU ERP': 'bl',
  'งานการคลังออกใบเสร็จ': 'am',
  'สำเนาใบเสร็จรับเงิน (สำเร็จ)': 'gn',
  'นำส่งใบเสร็จกลับไปยังแหล่งทุน': 'gn',
  'รอการแก้ไข': 'pu',
  'ยกเลิกบริการ': 'rd'
};
/* หมายเหตุ: หน้าเว็บ "ไม่" ตัดสินใจเรื่องสถานะเอง — ใช้ค่าที่หลังบ้านคำนวณมาให้เท่านั้น
   (step_index · can_evaluate · receipt_ready · is_revision · is_cancelled)
   เพื่อไม่ให้กฎสถานะแตกออกเป็นสองชุดที่เพี้ยนจากกันได้ */

/* ============================================================
   1) ตัวแปรสถานะรวมของหน้าเว็บ
   ============================================================ */
let S    = { page: 'home', theme: 'light', sid: '', tid: '' };
let CFG  = null;                       // config จากหลังบ้าน
let AUTH = { submit: null, view: null };  // token 2 ใบ แยกกันเด็ดขาด (มติ EF-D22)
let FORM = newForm();
let TRACK = { loading: false, err: '', items: null, only: '' };
let DETAIL = { loading: false, err: '', data: null };
let OTP  = { on: false, purpose: '', email: '', next: '', err: '', sending: false, left: 0 };
let otpTimer = null;
let EVAL = { tid: '', sid: '', speed: 0, system: 0 };

function newForm() {
  return {
    step: 1,                 // 1 · 'otp' · 2 · 3 · 'done'
    mode: 'new',             // 'new' = โครงการใหม่/งวดที่ 1 · 'next' = งวดถัดไป
    f: { fullName: '', staffType: '', researcherProject: '', faculty: '', subUnit: '', phone: '', email: '' },
    serviceIdSearch: '',
    lookup: null,            // ผลจาก lookupService (โหมดงวดถัดไป)
    p: {
      fiscalYear: '', projectTitle: '', fundingSource: '', otherFundingSource: '',
      totalBudget: '', dist: {}, periodStart: '', periodEnd: ''
    },
    inst: { installmentNo: '1', amountReceived: '', receiptOrg: '', receiptDetail: '' },
    file: null,              // {name, size, mime, b64}
    sending: false,
    result: null             // ผลจาก submitRequest
  };
}

/* ============================================================
   2) ตัวช่วยเรียก API (API_CONTRACT หมวด 0 — text/plain เท่านั้น)
   ============================================================ */
async function api(action, params) {
  if (API_URL === API_PLACEHOLDER) {
    throw { error: 'NO_API_URL', msg: 'ยังไม่ได้ตั้งค่า API_URL — ผู้ดูแลระบบต้องวาง /exec URL ในไฟล์ app.js ก่อน' };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, API_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // ★ ห้ามเปลี่ยนชนิดนี้ และห้ามเพิ่ม header อื่น
      body: JSON.stringify(Object.assign({ action: action }, params || {})),
      signal: ctrl.signal
    });
  } catch (e) {
    clearTimeout(timer);
    const aborted = e && e.name === 'AbortError';
    throw {
      error: aborted ? 'TIMEOUT' : 'NETWORK',
      msg: aborted ? 'หมดเวลาเชื่อมต่อ (45 วินาที) — กรุณาลองใหม่อีกครั้ง'
                   : 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่'
    };
  }
  clearTimeout(timer);

  let json;
  try { json = JSON.parse(await res.text()); }
  catch (e) { throw { error: 'BAD_RESPONSE', msg: 'เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง — กรุณาแจ้งผู้ดูแลระบบ' }; }

  if (!json || json.ok !== true) {
    const errObj = {
      error: (json && json.error) || 'ERR',
      msg: (json && json.msg) || 'เกิดข้อผิดพลาด — กรุณาลองใหม่อีกครั้ง'
    };
    // ★ token หมดอายุ/ถูกถอนสิทธิ์ → ล้างใบที่ส่งไปทิ้ง แล้วให้ผู้ใช้ยืนยันอีเมลใหม่
    if (errObj.error === 'SESSION_INVALID' || errObj.error === 'SESSION_EXPIRED') {
      clearTokenByValue(params && params.token);
      buildBars();
    }
    throw errObj;
  }
  return json.data;
}

/* ============================================================
   3) ตัวช่วยทั่วไป
   ============================================================ */
function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}
function qsp() { return new URLSearchParams(location.search); }
function clientHint() {
  return ('web|' + (navigator.platform || '-') + '|' + (navigator.language || '-')).slice(0, 120);
}
function isEmailLike(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim()); }
function numOf(v) { const n = Number(String(v == null ? '' : v).replace(/,/g, '').trim()); return isNaN(n) ? 0 : n; }

const TH_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
/** ISO string → วันที่ไทย (พ.ศ.) — หลังบ้านส่ง ISO มาเสมอ หน้าเว็บแปลงเอง */
function fmtDate(iso, withTime) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return esc(iso);
  let s = d.getDate() + ' ' + TH_MONTH[d.getMonth()] + ' ' + (d.getFullYear() + 543);
  if (withTime) s += ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ' น.';
  return s;
}
/** ISO string → ค่าใส่ <input type="date"> (yyyy-mm-dd ตามปฏิทิน ค.ศ. ที่เบราว์เซอร์ต้องการ) */
function isoToDateInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fmtMoney(n) {
  const v = numOf(n);
  return v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtBytes(n) {
  if (n == null || isNaN(n)) return '';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}

/* ค่าตัวเลือกที่ใช้จริง — เอาจาก config ก่อน ถ้ายังไม่มีค่อยใช้ชุดสำรองในไฟล์นี้ */
function staffTypes()     { return (CFG && CFG.staff_types     && CFG.staff_types.length)     ? CFG.staff_types     : FALLBACK_STAFF_TYPES; }
function faculties()      { return (CFG && CFG.faculties       && CFG.faculties.length)       ? CFG.faculties       : FALLBACK_FACULTIES; }
function fundingSources() { return (CFG && CFG.funding_sources && CFG.funding_sources.length) ? CFG.funding_sources : FALLBACK_FUNDING_SOURCES; }
function feedbackCats()   { return (CFG && CFG.feedback_categories && CFG.feedback_categories.length) ? CFG.feedback_categories : FALLBACK_FEEDBACK_CATEGORIES; }
function staffTypeNeedsProject(v) { const l = staffTypes(); return String(v || '') === l[l.length - 1]; }

/* ★ กับดักข้อ 25: <option value="อื่นๆ"> แต่ข้อความบนจอคือ "อื่นๆ โปรดระบุ"
   คงพฤติกรรมเดิมของ 1.5 ไว้ทุกประการ — หลังบ้าน (isOtherFundingChoice_) รับทั้งสองค่า
   แต่หน้าเว็บต้องส่ง other_funding_source มาคู่กันเสมอเมื่อเลือกตัวนี้ */
function isOtherFunding(v) {
  const s = String(v || '').trim();
  return s === 'อื่นๆ' || s === 'อื่นๆ โปรดระบุ';
}
function fundingOptionValue(label) { return isOtherFunding(label) ? 'อื่นๆ' : label; }

/** ★ ยอมรับเฉพาะลิงก์ที่ขึ้นต้นด้วย http:// หรือ https:// ก่อนเอาไปใส่ href
    ค่าเหล่านี้มาจากชีต Config และจาก Drive — ผู้ดูแลแก้เองได้ จึงกันไว้อีกชั้นไม่ให้ใส่ลิงก์รูปแบบอื่นได้ */
function safeUrl(u) {
  const s = String(u == null ? '' : u).trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

function badge(status) {
  return '<span class="badge ' + (STATUS_CLASS[status] || 'b-new') + '">' + esc(status || '—') + '</span>';
}

/* toast + modal */
function toast(m) {
  const d = document.createElement('div');
  d.className = 'toast'; d.textContent = m;
  document.body.appendChild(d);
  setTimeout(function () { d.remove(); }, 3200);
}
function openM(html) { $('modal').innerHTML = html; $('ov').classList.add('show'); }
function closeM() { $('ov').classList.remove('show'); $('modal').innerHTML = ''; }

/* แบนเนอร์ระดับหน้า */
function showBanner(msg, isErr) {
  const b = $('appBanner');
  b.textContent = msg;
  b.className = 'app-banner' + (isErr ? ' err' : '');
  b.style.display = '';
}
function hideBanner() { $('appBanner').style.display = 'none'; }

/* การ์ดสถานะใช้ซ้ำ */
function loadingCard(text) {
  return '<div class="panel"><div class="skel" style="height:52px;margin-bottom:10px"></div>'
    + '<div class="skel" style="height:52px;margin-bottom:10px"></div>'
    + '<p class="statecard" style="padding:10px"><span class="dots">' + esc(text || 'กำลังโหลดข้อมูล') + '</span></p></div>';
}
function errorCard(msg, retryFn) {
  return '<div class="panel statecard"><div class="ico">⚠️</div><h3 style="color:var(--red)">ดำเนินการไม่สำเร็จ</h3>'
    + '<p>' + esc(msg || 'การเชื่อมต่อขัดข้อง') + '</p>'
    + (retryFn ? '<button class="btn primary" onclick="' + retryFn + '">↻ ลองใหม่</button>' : '') + '</div>';
}
function fieldErr(id, msg) { const e = $(id); if (e) { e.style.display = ''; e.textContent = msg; } }
function clearFieldErr(id) { const e = $(id); if (e) { e.style.display = 'none'; e.textContent = ''; } }
function markBad(id, isBad) { const e = $(id); if (e) { if (isBad) e.classList.add('bad'); else e.classList.remove('bad'); } }
function valOf(id) { const e = $(id); return e ? String(e.value || '').trim() : ''; }
/** ทำเครื่องหมายว่าช่องนี้กรอกผิด + จำช่องแรกที่ผิดไว้โฟกัส (ใช้ร่วมกันทุกตัวตรวจ) */
function markFieldBad(state, id, errId, msg) {
  fieldErr(errId, msg);
  markBad(id, true);
  state.ok = false;
  if (!state.first) state.first = id;
}

/* ============================================================
   4) ที่เก็บ token ของผู้ขอรับบริการ (มติ EF-D42)
      ★ เก็บใน sessionStorage เท่านั้น — ปิดแท็บแล้วหาย
        เหตุผล: token ให้สิทธิ์ดูคำขอของเจ้าตัว และเครื่องที่ใช้จริงมักเป็นเครื่องส่วนกลาง
        ค่าที่ต้องจำข้ามวัน (ธีม) ใช้ localStorage แยกต่างหาก
   ============================================================ */
const TK_SUBMIT = 'ef_tok_submit';
const TK_VIEW   = 'ef_tok_view';

function tokRead(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || !o.token) return null;
    if (o.exp && Date.now() > o.exp) { sessionStorage.removeItem(key); return null; }
    return o;
  } catch (e) { return null; }
}
function tokWrite(key, obj) { try { sessionStorage.setItem(key, JSON.stringify(obj)); } catch (e) {} }
function tokRemove(key) { try { sessionStorage.removeItem(key); } catch (e) {} }

function loadTokens() { AUTH.submit = tokRead(TK_SUBMIT); AUTH.view = tokRead(TK_VIEW); }
function saveToken(kind, d) {
  const minutes = Number(d && d.expires_in_min) || 120;
  const obj = {
    token: d.token,
    email: (d.user && d.user.email) || '',
    name:  (d.user && d.user.name) || '',
    exp:   Date.now() + minutes * 60000
  };
  if (kind === 'view') { AUTH.view = obj; tokWrite(TK_VIEW, obj); }
  else { AUTH.submit = obj; tokWrite(TK_SUBMIT, obj); }
}
function clearToken(kind) {
  if (kind === 'view') { AUTH.view = null; tokRemove(TK_VIEW); }
  else { AUTH.submit = null; tokRemove(TK_SUBMIT); }
}
function clearTokenByValue(tk) {
  if (!tk) return;
  if (AUTH.submit && AUTH.submit.token === tk) clearToken('submit');
  if (AUTH.view && AUTH.view.token === tk) clearToken('view');
}
function tokenOf(kind) { const t = (kind === 'view') ? AUTH.view : AUTH.submit; return t ? t.token : ''; }

/** ออกจากการยืนยันตัวตนทั้งหมด (ปุ่มบนแถบผู้ใช้) */
async function doSignOut() {
  const tks = [tokenOf('submit'), tokenOf('view')].filter(Boolean);
  clearToken('submit'); clearToken('view');
  FORM = newForm(); TRACK = { loading: false, err: '', items: null, only: '' }; DETAIL = { loading: false, err: '', data: null };
  for (let i = 0; i < tks.length; i++) {
    try { await api('logout', { token: tks[i], client_hint: clientHint() }); } catch (e) {}
  }
  toast('ออกจากการยืนยันตัวตนแล้ว');
  go('home');
}

/* ============================================================
   5) ธีม (โหมดมืด) · แถบเมนู · router
   ============================================================ */
function setTheme(t) {
  S.theme = t;
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('ef_theme', t); } catch (e) {}
  const b = $('mBtn'); if (b) b.textContent = (t === 'light' ? '🌙' : '☀️');
}
function initTheme() {
  let t = null;
  try { t = localStorage.getItem('ef_theme'); } catch (e) {}
  if (t !== 'light' && t !== 'dark') {
    const cfgDefault = (CFG && CFG.theme_default === 'dark') ? 'dark' : '';
    t = cfgDefault || ((window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light');
  }
  setTheme(t);
}
function toggleTheme() { setTheme(S.theme === 'light' ? 'dark' : 'light'); }

function buildBars() {
  const cur = (S.page === 'detail' || S.page === 'evaluate') ? 'track' : S.page;
  $('tabs').innerHTML =
    TABS.map(function (x) {
      return '<button class="tab ' + (cur === x.id ? 'active' : '') + ' ' + (x.cta ? 'cta' : '') + '"'
        + ' data-page="' + x.id + '"' + (cur === x.id ? ' aria-current="page"' : '') + '>' + x.t + '</button>';
    }).join('')
    + '<button class="tab mode" id="mBtn" data-mode aria-label="สลับโหมดสว่าง/มืด">' + (S.theme === 'light' ? '🌙' : '☀️') + '</button>';

  const who = $('who');
  const t = AUTH.view || AUTH.submit;
  if (t) {
    who.innerHTML = '<span class="rolepill">ยืนยันอีเมลแล้ว</span> <b>' + esc(t.email) + '</b>'
      + ' <button class="linkbtn" data-act="signout" style="margin-left:6px">ออกจากการยืนยัน</button>';
  } else {
    who.innerHTML = '<span class="rolepill">ผู้ขอรับบริการ</span> ไม่ต้องสมัครสมาชิก — ยืนยันตัวตนด้วยรหัส OTP ทางอีเมลเมื่อถึงขั้นที่ต้องใช้';
  }
  if (CFG) {
    if (CFG.system_title) $('brandTitle').textContent = CFG.system_title;
    if (CFG.subtitle) $('brandSub').textContent = CFG.subtitle;
    const c = [];
    if (CFG.contact_phone) c.push('โทร ' + CFG.contact_phone);
    if (CFG.contact_email) c.push(CFG.contact_email);
    if (c.length) $('footContact').textContent = c.join(' · ');
  }
}

/** ไปหน้าใหม่ + อัปเดต URL (?page=…) โดยไม่รีโหลด — ลิงก์ในอีเมลและปุ่มย้อนกลับใช้ได้ */
function go(page, extra) {
  S.page = page;
  const p = new URLSearchParams();
  p.set('page', page);
  if (extra) {
    Object.keys(extra).forEach(function (k) {
      if (extra[k] != null && extra[k] !== '') p.set(k, extra[k]);
    });
  }
  history.pushState({ page: page }, '', location.pathname + '?' + p.toString());
  // ★ อ่านสถานะกลับจาก URL ที่เพิ่งเขียน — ให้ URL เป็นแหล่งความจริงเพียงที่เดียว
  //   (ถ้าตั้ง S.page เองแล้วไม่อ่าน sid/tid กลับ ปุ่ม "ดูรายละเอียด" จะได้ sid ว่าง)
  renderFromUrl();
}
/** อ่านหน้าปัจจุบันจาก query string
    ★ โลก decoupled ไม่มีตัวอ่านตำแหน่ง URL ของ Apps Script ให้ใช้ (กับดักข้อ 3) — ใช้ URLSearchParams ปกติ */
function readRoute() {
  const q = qsp();
  const p = q.get('page') || 'home';
  S.page = PAGES.indexOf(p) >= 0 ? p : 'home';
  S.sid = String(q.get('sid') || '').trim().toUpperCase();
  S.tid = String(q.get('tid') || '').trim().toUpperCase();
}
function applyRoute() {
  // หน้าติดตาม/แบบประเมินกรองตาม ?sid= — เปลี่ยนตัวกรองเมื่อไร ต้องโหลดรายการใหม่
  if (S.page === 'track' || S.page === 'evaluate') {
    const want = S.sid || '';
    if (TRACK.only !== want) { TRACK.only = want; TRACK.items = null; TRACK.err = ''; }
  }
}
function renderFromUrl() { readRoute(); applyRoute(); render(); }

function render() {
  buildBars();
  const st = $('stage');
  if (S.page === 'home')          st.innerHTML = homeV();
  else if (S.page === 'form')     st.innerHTML = formV();
  else if (S.page === 'track')    st.innerHTML = trackV();
  else if (S.page === 'evaluate') st.innerHTML = trackV();
  else if (S.page === 'detail')   st.innerHTML = detailV();
  else if (S.page === 'recover')  st.innerHTML = recoverV();
  else                            st.innerHTML = homeV();
  window.scrollTo(0, 0);

  if (S.page === 'form')     formAfter();
  if (S.page === 'track' || S.page === 'evaluate') trackAfter();
  if (S.page === 'detail')   detailAfter();
  if (S.page === 'recover')  recoverAfter();
}

/* ============================================================
   6) หน้า HOME
   ============================================================ */
function homeV() {
  const fy = (CFG && CFG.current_fiscal_year) ? CFG.current_fiscal_year : '';
  return ''
    + '<section class="hero">'
    + '  <div>'
    + (fy ? '<span class="fy-badge">ปีงบประมาณ พ.ศ. ' + esc(fy) + '</span>' : '')
    + '    <h1>ยื่นคำขอ<em>ออกใบเสร็จรับเงิน</em><br>งบประมาณวิจัยจากแหล่งทุนภายนอก</h1>'
    + '    <p class="sub">กรอกแบบคำขอออนไลน์ แนบหลักฐานการรับโอนเงิน แล้วติดตามได้ทุกขั้นตอนจนถึงวันรับสำเนาใบเสร็จรับเงิน '
    + '       — ยืนยันตัวตนด้วยรหัส OTP ทางอีเมล ไม่ต้องสมัครสมาชิก</p>'
    + '    <div class="btns">'
    + '      <button class="btn primary big" data-page="form">📝 เริ่มยื่นคำขอ</button>'
    + '      <button class="btn ghost big" data-page="track">🔎 ติดตามสถานะ</button>'
    + '    </div>'
    + '  </div>'
    + '  <div class="panel snap">'
    + '    <div class="head"><h3>ขั้นตอนการให้บริการ</h3><span>5 ขั้น</span></div>'
    + '    <ul class="tl" style="margin-top:6px">'
    + stepListHtml()
    + '    </ul>'
    + '  </div>'
    + '</section>'

    + '<div class="grid g3">'
    + card('1 · เตรียมเอกสาร', 'หลักฐานการรับโอนเงินงวดนี้ (รูปภาพหรือ PDF) และหลักฐานการชำระค่าธรรมเนียมการโอนกับงานการคลัง มรย. ถ้ามี')
    + card('2 · กรอกแบบคำขอ 3 ขั้น', 'ข้อมูลผู้ขอรับบริการ → เลือกบริการ (โครงการใหม่ / งวดถัดไป) → รายละเอียดงบประมาณ')
    + card('3 · รับรหัสบริการ', 'ระบบส่งรหัสบริการไปที่อีเมลของท่าน ใช้รหัสนี้อ้างอิงและติดตามสถานะได้ตลอด')
    + '</div>'

    + '<div class="panel" style="margin-top:16px">'
    + '  <h3 style="font-size:16px;margin-bottom:8px">ข้อควรทราบก่อนใช้บริการ</h3>'
    + '  <div class="msg warn">กรุณา "งด" ให้ข้อมูลผู้ขอรับบริการ "แทนผู้อื่น" เนื่องจากจะมีผลต่อการรับเอกสารและข้อความแจ้งเตือนทางอีเมล</div>'
    + '  <div class="msg info">การขอเบิกงวดถัดไป ระบบจะถามยืนยันเรื่องการล้างหนี้งวดเดิมก่อนเสมอ</div>'
    + '</div>';
}
function card(t, s) {
  return '<div class="panel lift"><div class="stat"><div class="num"><b>' + esc(t) + '</b></div>'
    + '<div class="lbl" style="margin-top:8px">' + esc(s) + '</div></div></div>';
}
function stepListHtml() {
  const steps = (CFG && CFG.status_steps && CFG.status_steps.length)
    ? CFG.status_steps
    : ['บันทึกข้อมูลขอรับบริการ', 'บันทึกข้อมูลงบประมาณเข้าสู่ระบบ YRU ERP', 'งานการคลังออกใบเสร็จ',
       'สำเนาใบเสร็จรับเงิน (สำเร็จ)', 'นำส่งใบเสร็จกลับไปยังแหล่งทุน'];
  return steps.map(function (s) {
    return '<li><span class="d ' + (STATUS_DOT[s] || 'g') + '"></span><div class="tt">' + esc(s) + '</div></li>';
  }).join('');
}

/* ============================================================
   7) หน้า FORM — ฟอร์มยื่นคำขอ 3 ขั้น (SPEC หมวด 9)
   ============================================================ */
function stepsBar() {
  const n = FORM.step;
  function cls(i) {
    if (n === 'done') return 'done';
    if (n === 'otp') return i === 1 ? 'on' : '';
    if (n === i) return 'on';
    return (typeof n === 'number' && n > i) ? 'done' : '';
  }
  return '<div class="steps">'
    + '<div class="s ' + cls(1) + '">1 · ข้อมูลผู้ขอรับบริการ</div>'
    + '<div class="s ' + cls(2) + '">2 · เลือกบริการ</div>'
    + '<div class="s ' + cls(3) + '">3 · รายละเอียดงบประมาณ</div>'
    + '</div>';
}

function formV() {
  let body;
  if (FORM.step === 1)        body = formStep1V();
  else if (FORM.step === 'otp') body = otpPanelV();
  else if (FORM.step === 2)   body = formStep2V();
  else if (FORM.step === 3)   body = formStep3V();
  else                        body = formDoneV();

  return '<div class="sec-head"><h2>ฟอร์มขอรับบริการเพื่อยืมเงิน<b>งบประมาณวิจัย</b></h2>'
    + '<span class="rt">จากแหล่งทุนภายนอก (SRDI External Fund)</span></div>'
    + stepsBar() + body;
}

/* ---------- ขั้นที่ 1 — ข้อมูลผู้ขอรับบริการ (7 ช่อง) ---------- */
function formStep1V() {
  const f = FORM.f;
  const needProj = staffTypeNeedsProject(f.staffType);
  const needSub  = f.faculty === FACULTY_NEEDS_SUBUNIT;
  return '<div class="panel">'
    + '<div class="msg warn">กรุณา "งด" ให้ข้อมูลผู้ขอรับบริการ "แทนผู้อื่น" เนื่องจากจะมีผลต่อการรับเอกสารและข้อความแจ้งเตือนทางอีเมล</div>'
    + '<h3 style="font-size:16px;margin:14px 0 12px">ส่วนที่ 1 · ข้อมูลผู้ขอรับบริการ (กรุณาให้ข้อมูลครบถ้วนเพื่อรับการแจ้งเตือน)</h3>'

    + '<div class="frow">'
    + '  <div class="field"><label class="fl" for="fullName">ชื่อ-สกุล <span class="req">*</span></label>'
    + '    <input type="text" id="fullName" maxlength="200" value="' + esc(f.fullName) + '" autocomplete="name">'
    + '    <div class="err-tx" id="eFullName" style="display:none"></div></div>'
    + '  <div class="field"><label class="fl" for="staffType">ประเภทบุคลากร <span class="req">*</span></label>'
    + '    <select id="staffType" onchange="onStaffTypeChange()">'
    + '      <option value="">-- เลือกประเภท --</option>'
    +        staffTypes().map(function (x) {
               return '<option value="' + esc(x) + '"' + (f.staffType === x ? ' selected' : '') + '>' + esc(x) + '</option>';
             }).join('')
    + '    </select>'
    + '    <div class="err-tx" id="eStaffType" style="display:none"></div></div>'
    + '</div>'

    + '<div class="field" id="wrapResearcherProject" style="display:' + (needProj ? '' : 'none') + '">'
    + '  <label class="fl" for="researcherProject">ระบุชื่อโครงการวิจัยที่รับผิดชอบ <span class="req">*</span></label>'
    + '  <input type="text" id="researcherProject" maxlength="300" value="' + esc(f.researcherProject) + '">'
    + '  <div class="help">บังคับกรอกเมื่อเลือกประเภท "ผู้ช่วยนักวิจัย / ผู้ประสานงาน / อื่นๆ"</div>'
    + '  <div class="err-tx" id="eResearcherProject" style="display:none"></div></div>'

    + '<div class="frow">'
    + '  <div class="field"><label class="fl" for="faculty">สังกัด/คณะ <span class="req">*</span></label>'
    + '    <select id="faculty" onchange="onFacultyChange()">'
    + '      <option value="">-- เลือกสังกัด --</option>'
    +        faculties().map(function (x) {
               return '<option value="' + esc(x) + '"' + (f.faculty === x ? ' selected' : '') + '>' + esc(x) + '</option>';
             }).join('')
    + '    </select>'
    + '    <div class="err-tx" id="eFaculty" style="display:none"></div></div>'
    + '  <div class="field" id="wrapSubUnit" style="display:' + (needSub ? '' : 'none') + '">'
    + '    <label class="fl" for="subUnit">ระบุหน่วยงานย่อย <span class="req">*</span></label>'
    + '    <input type="text" id="subUnit" maxlength="200" value="' + esc(f.subUnit) + '">'
    + '    <div class="help">บังคับกรอกเมื่อเลือก "สำนักงานอธิการบดี"</div>'
    + '    <div class="err-tx" id="eSubUnit" style="display:none"></div></div>'
    + '</div>'

    + '<div class="frow">'
    + '  <div class="field"><label class="fl" for="phone">หมายเลขโทรศัพท์ <span class="req">*</span></label>'
    + '    <input type="tel" id="phone" maxlength="50" value="' + esc(f.phone) + '" autocomplete="tel">'
    + '    <div class="err-tx" id="ePhone" style="display:none"></div></div>'
    + '  <div class="field"><label class="fl" for="email">อีเมล (สำหรับรับรหัส สำเนาใบเสร็จ และการแจ้งเตือน) <span class="req">*</span></label>'
    + '    <input type="email" id="email" maxlength="200" value="' + esc(f.email) + '" autocomplete="email">'
    + '    <div class="help">กดถัดไปแล้วระบบจะส่งรหัสยืนยัน 6 หลักไปที่อีเมลนี้ทันที</div>'
    + '    <div class="err-tx" id="eEmail" style="display:none"></div></div>'
    + '</div>'

    + '<div class="err-tx" id="eStep1" style="display:none"></div>'
    + '<div style="text-align:right;margin-top:8px">'
    + '  <button class="btn primary" id="btnStep1" onclick="submitStep1()">ถัดไป →</button>'
    + '</div>'
    + '</div>';
}

function onStaffTypeChange() {
  FORM.f.staffType = valOf('staffType');
  const w = $('wrapResearcherProject');
  if (w) w.style.display = staffTypeNeedsProject(FORM.f.staffType) ? '' : 'none';
}
function onFacultyChange() {
  FORM.f.faculty = valOf('faculty');
  const w = $('wrapSubUnit');
  if (w) w.style.display = (FORM.f.faculty === FACULTY_NEEDS_SUBUNIT) ? '' : 'none';
}
function readStep1() {
  const f = FORM.f;
  f.fullName          = valOf('fullName');
  f.staffType         = valOf('staffType');
  f.researcherProject = valOf('researcherProject');
  f.faculty           = valOf('faculty');
  f.subUnit           = valOf('subUnit');
  f.phone             = valOf('phone');
  f.email             = valOf('email');
}
function validateStep1() {
  ['eFullName', 'eStaffType', 'eResearcherProject', 'eFaculty', 'eSubUnit', 'ePhone', 'eEmail', 'eStep1'].forEach(clearFieldErr);
  ['fullName', 'staffType', 'researcherProject', 'faculty', 'subUnit', 'phone', 'email'].forEach(function (id) { markBad(id, false); });
  const f = FORM.f;
  const st = { ok: true, first: '' };

  if (!f.fullName) markFieldBad(st, 'fullName', 'eFullName', 'กรุณากรอกชื่อ-สกุลของผู้ขอรับบริการ');
  if (!f.staffType) markFieldBad(st, 'staffType', 'eStaffType', 'กรุณาเลือกประเภทบุคลากร');
  if (staffTypeNeedsProject(f.staffType) && !f.researcherProject) {
    markFieldBad(st, 'researcherProject', 'eResearcherProject', 'กรุณากรอกชื่อโครงการวิจัยที่รับผิดชอบ');
  }
  if (!f.faculty) markFieldBad(st, 'faculty', 'eFaculty', 'กรุณาเลือกสังกัด/คณะ');
  if (f.faculty === FACULTY_NEEDS_SUBUNIT && !f.subUnit) {
    markFieldBad(st, 'subUnit', 'eSubUnit', 'กรุณากรอกหน่วยงานย่อย');
  }
  if (!f.phone) markFieldBad(st, 'phone', 'ePhone', 'กรุณากรอกหมายเลขโทรศัพท์');
  if (!isEmailLike(f.email)) markFieldBad(st, 'email', 'eEmail', 'กรุณากรอกอีเมลให้ถูกต้อง เช่น you@yru.ac.th');

  if (st.first && $(st.first)) $(st.first).focus();
  return st.ok;
}

/** จบขั้นที่ 1 = ขอรหัส OTP ทันที (ฟีเจอร์ E4) */
async function submitStep1() {
  readStep1();
  if (!validateStep1()) return;

  // ยืนยันอีเมลเดิมไว้แล้วและยังไม่หมดอายุ → ข้ามการขอรหัสซ้ำ (cooldown เดินจริง 60 วินาที — กับดักข้อ 27)
  if (AUTH.submit && AUTH.submit.email === FORM.f.email.toLowerCase()) {
    FORM.step = 2; render(); return;
  }
  const btn = $('btnStep1');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>กำลังส่งรหัสยืนยัน...';
  try {
    const d = await api('requestOtp', { email: FORM.f.email, purpose: PURPOSE_SUBMIT, client_hint: clientHint() });
    startOtp(PURPOSE_SUBMIT, FORM.f.email, 'form', d);
  } catch (err) {
    btn.disabled = false; btn.textContent = 'ถัดไป →';
    fieldErr('eStep1', err.msg || 'ขอรหัสยืนยันไม่สำเร็จ');
  }
}

/* ---------- แผงกรอกรหัส OTP (ใช้ร่วมกันทั้งฟอร์มและหน้าติดตาม) ---------- */
function startOtp(purpose, email, next, d) {
  OTP = { on: true, purpose: purpose, email: email, next: next, err: '', sending: false, left: 0 };
  if (next === 'form') FORM.step = 'otp';
  render();
  startResendTimer((CFG && CFG.otp_cooldown_sec) ? Number(CFG.otp_cooldown_sec) : 60);
  if (d && d.message) toast(d.message);
}
function stopResendTimer() { if (otpTimer) { clearInterval(otpTimer); otpTimer = null; } }
function startResendTimer(sec) {
  stopResendTimer();
  OTP.left = Math.max(0, Number(sec) || 0);
  paintResend();
  otpTimer = setInterval(function () {
    OTP.left--;
    if (OTP.left <= 0) stopResendTimer();
    paintResend();
  }, 1000);
}
function paintResend() {
  const b = $('btnOtpResend'); if (!b) return;
  if (OTP.left > 0) { b.disabled = true; b.textContent = 'ขอรหัสใหม่ได้ในอีก ' + OTP.left + ' วินาที'; }
  else { b.disabled = false; b.textContent = 'ขอรหัสใหม่อีกครั้ง'; }
}

function otpPanelV() {
  const purposeText = (OTP.purpose === PURPOSE_VIEW)
    ? 'เพื่อดูข้อมูลคำขอของท่าน'
    : 'เพื่อยืนยันว่าอีเมลนี้เป็นของท่านจริงก่อนยื่นคำขอ';
  const expMin = Math.round(((CFG && CFG.otp_expiry_sec) ? Number(CFG.otp_expiry_sec) : 600) / 60);
  return '<div class="panel">'
    + '<h3 style="font-size:16px;margin-bottom:6px">ยืนยันอีเมลด้วยรหัส 6 หลัก</h3>'
    + '<p class="help">ระบบส่งรหัสยืนยันไปที่ <b>' + esc(OTP.email) + '</b> แล้ว ' + esc(purposeText)
    + ' · รหัสมีอายุประมาณ ' + expMin + ' นาที</p>'
    + '<div class="otp-row" id="otpRow">'
    + [0, 1, 2, 3, 4, 5].map(function (i) {
        return '<input type="text" inputmode="numeric" maxlength="1" aria-label="รหัสหลักที่ ' + (i + 1) + '">';
      }).join('')
    + '</div>'
    + '<div class="err-tx" id="eOtp" style="display:none;text-align:center"></div>'
    + '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:14px">'
    + '  <button class="btn primary" id="btnOtpVerify" onclick="verifyOtpNow()">ยืนยันรหัส</button>'
    + '  <button class="btn ghost" id="btnOtpResend" onclick="resendOtp()">ขอรหัสใหม่อีกครั้ง</button>'
    + '  <button class="btn ghost" onclick="cancelOtp()">ย้อนกลับ</button>'
    + '</div>'
    + '<div class="msg info" style="margin-top:16px">ไม่ได้รับอีเมล? ลองตรวจในกล่องจดหมายขยะ (Junk/Spam) '
    + 'และตรวจว่าพิมพ์อีเมลถูกต้อง หากยังไม่ได้รับ กรุณาติดต่อผู้ดูแลระบบ</div>'
    + '</div>';
}
function wireOtp() {
  const inputs = Array.prototype.slice.call(document.querySelectorAll('#otpRow input'));
  if (!inputs.length) return;
  inputs.forEach(function (el, idx) {
    el.addEventListener('input', function () {
      el.value = el.value.replace(/\D/g, '').slice(0, 1);
      if (el.value && inputs[idx + 1]) inputs[idx + 1].focus();
    });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' && !el.value && inputs[idx - 1]) inputs[idx - 1].focus();
      if (e.key === 'Enter') verifyOtpNow();
    });
    el.addEventListener('paste', function (e) {
      const txt = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
      if (!txt) return;
      e.preventDefault();
      inputs.forEach(function (x, i) { x.value = txt[i] || ''; });
      const last = Math.min(txt.length, 6) - 1;
      if (inputs[last]) inputs[last].focus();
    });
  });
  inputs[0].focus();
}
function readOtp() {
  return Array.prototype.slice.call(document.querySelectorAll('#otpRow input'))
    .map(function (x) { return x.value || ''; }).join('');
}
async function verifyOtpNow() {
  clearFieldErr('eOtp');
  const code = readOtp();
  if (!/^\d{6}$/.test(code)) { fieldErr('eOtp', 'กรุณากรอกรหัสยืนยันให้ครบ 6 หลัก'); return; }
  const btn = $('btnOtpVerify');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>กำลังตรวจสอบ...';
  try {
    const d = await api('verifyOtp', {
      email: OTP.email, otp: code, purpose: OTP.purpose, client_hint: clientHint()
    });
    saveToken(OTP.purpose === PURPOSE_VIEW ? 'view' : 'submit', d);
    stopResendTimer();
    const next = OTP.next;
    OTP.on = false;
    if (next === 'form') { FORM.step = 2; render(); }
    else { render(); loadTrack(); }
    toast('ยืนยันอีเมลเรียบร้อยแล้ว');
  } catch (err) {
    btn.disabled = false; btn.textContent = 'ยืนยันรหัส';
    fieldErr('eOtp', err.msg || 'ยืนยันรหัสไม่สำเร็จ');
  }
}
async function resendOtp() {
  if (OTP.left > 0) return;
  const b = $('btnOtpResend');
  b.disabled = true; b.innerHTML = '<span class="spin"></span>กำลังส่ง...';
  try {
    const d = await api('requestOtp', { email: OTP.email, purpose: OTP.purpose, client_hint: clientHint() });
    toast((d && d.message) ? d.message : 'ส่งรหัสใหม่ให้แล้ว');
    startResendTimer((CFG && CFG.otp_cooldown_sec) ? Number(CFG.otp_cooldown_sec) : 60);
  } catch (err) {
    fieldErr('eOtp', err.msg || 'ขอรหัสใหม่ไม่สำเร็จ');
    paintResend();
  }
}
function cancelOtp() {
  stopResendTimer();
  OTP.on = false;
  if (OTP.next === 'form') { FORM.step = 1; render(); }
  else { render(); }
}

/* ---------- ขั้นที่ 2 — เลือกบริการ ---------- */
function formStep2V() {
  const isNext = FORM.mode === 'next';
  const lk = FORM.lookup;
  return '<div class="panel">'
    + '<h3 style="font-size:16px;margin-bottom:12px">ส่วนที่ 2 · เลือกบริการ</h3>'
    + '<label class="fl">ท่านต้องการขอรับบริการสำหรับงวดใด? <span class="req">*</span></label>'

    + '<label class="radiocard ' + (!isNext ? 'on' : '') + '" for="typeNew">'
    + '  <input type="radio" name="installmentType" id="typeNew" value="1"' + (!isNext ? ' checked' : '') + ' onchange="onServiceTypeChange(\'new\')">'
    + '  <span><span class="rc-t">ออกใบเสร็จรับเงิน/เบิกเงินงวดที่ 1/โครงการใหม่ (ใช้งานระบบครั้งแรก)</span>'
    + '  <span class="rc-s">ยังไม่เคยยื่นคำขอสำหรับโครงการนี้ในระบบ</span></span></label>'

    + '<label class="radiocard ' + (isNext ? 'on' : '') + '" for="typeNext">'
    + '  <input type="radio" name="installmentType" id="typeNext" value="next"' + (isNext ? ' checked' : '') + ' onchange="onServiceTypeChange(\'next\')">'
    + '  <span><span class="rc-t">ออกใบเสร็จรับเงิน/เบิกเงินงวดถัดไป/มีข้อมูลในระบบแล้ว (ระบุหมายเลขบริการเดิม)</span>'
    + '  <span class="rc-s">ระบบจะดึงข้อมูลโครงการเดิมมาให้อัตโนมัติ</span></span></label>'

    + '<div id="divServiceSearch" style="display:' + (isNext ? '' : 'none') + ';margin-top:6px">'
    + '  <div class="field"><label class="fl" for="serviceIdSearch">กรอก "รหัสบริการ" เดิมของท่าน (เช่น SRDI-2568-001)</label>'
    + '    <div style="display:flex;gap:9px;flex-wrap:wrap">'
    + '      <input type="text" id="serviceIdSearch" placeholder="ระบุรหัสบริการ" style="flex:1;min-width:200px" value="' + esc(FORM.serviceIdSearch) + '">'
    + '      <button class="btn ghost" type="button" id="btn-search-service" onclick="searchOriginalService()">🔎 ค้นหาข้อมูลเดิม</button>'
    + '    </div>'
    + '    <div class="err-tx" id="eSearch" style="display:none"></div>'
    + '  </div>'
    + (lk ? lookupBoxHtml(lk) : '')
    + '</div>'

    + '<div class="err-tx" id="eStep2" style="display:none"></div>'
    + '<div style="display:flex;justify-content:space-between;gap:10px;margin-top:16px;flex-wrap:wrap">'
    + '  <button class="btn ghost" onclick="gotoStep(1)">← ย้อนกลับ</button>'
    + '  <button class="btn primary" id="btnStep2" onclick="submitStep2()">ถัดไป →</button>'
    + '</div>'
    + '</div>';
}
function lookupBoxHtml(lk) {
  const w = (lk.warnings && lk.warnings.length)
    ? '<div class="msg warn" style="margin:8px 0 0">' + lk.warnings.map(esc).join('<br>') + '</div>' : '';
  return '<div class="autobox" id="lookupBox">'
    + '✅ พบข้อมูลโครงการเดิม · <b>' + esc(lk.project_title || '—') + '</b><br>'
    + 'ปีงบประมาณ ' + esc(lk.fiscal_year || '—') + ' · แหล่งงบประมาณ ' + esc(lk.funding_source || '—')
    + ' · งบทั้งโครงการ ' + fmtMoney(lk.total_budget) + ' บาท<br>'
    + 'รหัสอ้างอิงต้นทาง: <b>' + esc(lk.ref_service_id || lk.service_id || '—') + '</b>'
    + ' · ระบบตั้งงวดถัดไปให้เป็นงวดที่ <b>' + esc(lk.suggested_installment_no || '') + '</b>'
    + '</div>' + w;
}

function onServiceTypeChange(mode) {
  if (mode === 'next') {
    // ★ คงพฤติกรรมเดิมของ 1.5: เด้งถามยืนยันเรื่องล้างหนี้งวดเดิมก่อนเสมอ
    const pct = (CFG && CFG.debt_clearance_percent) ? CFG.debt_clearance_percent : 60;
    openM('<div class="mh"><h3>⚠️ แจ้งเตือนเงื่อนไขการล้างหนี้</h3>'
      + '<button class="mx" onclick="cancelNextMode()" aria-label="ปิด">✕</button></div>'
      + '<div class="mb"><p>สำหรับการขอยืมเงินงวดถัดไป ท่านได้ดำเนินการล้างหนี้งวดเดิมครบ ' + esc(pct)
      + '% ผ่านระบบ YRU ERP หรือยัง?</p>'
      + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">'
      + '<button class="btn primary" onclick="confirmNextMode()">ดำเนินการล้างหนี้แล้ว · ไปต่อ</button>'
      + '<button class="btn ghost" onclick="cancelNextMode()">ยังไม่ได้ดำเนินการ</button>'
      + '</div></div>');
  } else {
    FORM.mode = 'new';
    FORM.lookup = null;
    render();
  }
}
function confirmNextMode() {
  closeM();
  FORM.mode = 'next';
  render();
}
function cancelNextMode() {
  closeM();
  FORM.mode = 'new';
  FORM.lookup = null;
  render();
}

async function searchOriginalService() {
  clearFieldErr('eSearch');
  const sid = valOf('serviceIdSearch').toUpperCase();
  FORM.serviceIdSearch = sid;
  if (!sid) { fieldErr('eSearch', 'กรุณากรอกรหัสบริการเดิมก่อนกดค้นหา'); return; }
  const btn = $('btn-search-service');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>กำลังค้นหา...';
  try {
    const d = await api('lookupService', { token: tokenOf('submit'), service_id: sid });
    FORM.lookup = d;
    // เติมข้อมูลโครงการที่ระบบดึงมา แล้วล็อกไม่ให้แก้ (ค่าจริงเซิร์ฟเวอร์คัดลอกเองอีกชั้น — มติ EF-D37)
    FORM.p.projectTitle   = d.project_title || '';
    FORM.p.fiscalYear     = d.fiscal_year != null ? String(d.fiscal_year) : '';
    FORM.p.fundingSource  = d.funding_source || '';
    FORM.p.totalBudget    = d.total_budget != null ? String(d.total_budget) : '';
    FORM.p.periodStart    = isoToDateInput(d.period_start);
    FORM.p.periodEnd      = isoToDateInput(d.period_end);
    FORM.p.dist           = d.budget_distribution || {};
    FORM.inst.installmentNo = String(d.suggested_installment_no || 2);
    render();
    toast('ดึงข้อมูลโครงการเดิมเรียบร้อย');
  } catch (err) {
    btn.disabled = false; btn.innerHTML = '🔎 ค้นหาข้อมูลเดิม';
    FORM.lookup = null;
    fieldErr('eSearch', err.msg || 'ค้นหาข้อมูลเดิมไม่สำเร็จ');
  }
}
function submitStep2() {
  clearFieldErr('eStep2');
  if (FORM.mode === 'next') {
    FORM.serviceIdSearch = valOf('serviceIdSearch').toUpperCase();
    if (!FORM.lookup) { fieldErr('eStep2', 'กรุณากดปุ่ม "ค้นหาข้อมูลเดิม" ให้พบข้อมูลโครงการก่อน จึงจะไปขั้นถัดไปได้'); return; }
  }
  gotoStep(3);
}
function gotoStep(n) {
  if (FORM.step === 3) readStep3();
  if (FORM.step === 2 && $('serviceIdSearch')) FORM.serviceIdSearch = valOf('serviceIdSearch').toUpperCase();
  if (FORM.step === 1) readStep1();
  FORM.step = n;
  render();
}

/* ---------- ขั้นที่ 3 — รายละเอียดงบประมาณ ---------- */
function formStep3V() {
  const isNext = FORM.mode === 'next';
  const p = FORM.p, ins = FORM.inst;
  const ro = isNext ? ' readonly' : '';
  const fyMin = (CFG && CFG.fiscal_year_min) ? CFG.fiscal_year_min : 2560;
  const fyMax = (CFG && CFG.fiscal_year_max) ? CFG.fiscal_year_max : 2600;
  const maxMb = (CFG && CFG.max_upload_mb) ? CFG.max_upload_mb : 10;

  return '<div class="panel">'
    + (isNext
        ? '<div class="msg info">โหมด "งวดถัดไป" — ข้อมูลโครงการด้านล่างระบบดึงมาจากคำขอเดิม '
          + 'รหัส <b>' + esc(FORM.serviceIdSearch) + '</b> และล็อกไว้ไม่ให้แก้ ท่านกรอกเฉพาะข้อมูลการเบิกจ่ายงวดนี้</div>'
        : '')

    + '<div class="subhead">3.1 ข้อมูลโครงการ (Project Details)</div>'
    + '<div class="frow f13">'
    + '  <div class="field"><label class="fl" for="fiscalYear">ปีงบประมาณ <span class="req">*</span></label>'
    + '    <input type="number" id="fiscalYear" value="' + esc(p.fiscalYear) + '"' + ro + ' oninput="onBudgetInput()">'
    + '    <div class="help">กรอกเป็นปี พ.ศ. ระหว่าง ' + esc(fyMin) + ' – ' + esc(fyMax) + '</div>'
    + '    <div class="err-tx" id="eFiscalYear" style="display:none"></div></div>'
    + '  <div class="field"><label class="fl" for="projectTitle">ชื่อโครงการ <span class="req">*</span></label>'
    + '    <input type="text" id="projectTitle" maxlength="500" value="' + esc(p.projectTitle) + '"' + ro + '>'
    + '    <div class="err-tx" id="eProjectTitle" style="display:none"></div></div>'
    + '</div>'

    + '<div class="frow">'
    + '  <div class="field"><label class="fl" for="fundingSource">แหล่งงบประมาณ <span class="req">*</span></label>'
    +      fundingSelectHtml(p.fundingSource, isNext)
    + '    <div class="err-tx" id="eFundingSource" style="display:none"></div>'
    + '    <div class="field" id="wrapOtherFunding" style="display:' + (isOtherFunding(p.fundingSource) && !isNext ? '' : 'none') + ';margin-top:8px">'
    + '      <input type="text" id="otherFundingSource" maxlength="300" placeholder="ระบุแหล่งทุนอื่นๆ ของท่าน" value="' + esc(p.otherFundingSource) + '">'
    + '      <div class="err-tx" id="eOtherFunding" style="display:none"></div>'
    + '    </div>'
    + '  </div>'
    + '  <div class="field"><label class="fl" for="totalBudget">งบประมาณที่ได้รับจัดสรรทั้งโครงการ (บาท) <span class="req">*</span></label>'
    + '    <input type="number" step="0.01" id="totalBudget" value="' + esc(p.totalBudget) + '"' + ro + ' oninput="onBudgetInput()">'
    + '    <div class="err-tx" id="eTotalBudget" style="display:none"></div></div>'
    + '</div>'

    + '<div class="frow">'
    + '  <div class="field"><label class="fl" for="periodStart">วันที่เริ่มต้นโครงการ <span class="req">*</span></label>'
    + '    <input type="date" id="periodStart" value="' + esc(p.periodStart) + '"' + ro + ' oninput="onBudgetInput()">'
    + '    <div class="err-tx" id="ePeriodStart" style="display:none"></div></div>'
    + '  <div class="field"><label class="fl" for="periodEnd">วันที่สิ้นสุดโครงการ <span class="req">*</span></label>'
    + '    <input type="date" id="periodEnd" value="' + esc(p.periodEnd) + '"' + ro + ' oninput="onBudgetInput()">'
    + '    <div class="err-tx" id="ePeriodEnd" style="display:none"></div></div>'
    + '</div>'

    + (isNext ? distReadonlyHtml() : distInputsHtml())

    + '<div class="subhead">3.2 ข้อมูลการเบิกจ่ายงวด (Installment Details)</div>'
    + '<div class="frow f13">'
    + '  <div class="field"><label class="fl" for="installmentNo">ขอเบิกงวดที่ <span class="req">*</span></label>'
    + '    <input type="number" id="installmentNo" min="1" value="' + esc(ins.installmentNo) + '">'
    + '    <div class="err-tx" id="eInstallmentNo" style="display:none"></div></div>'
    + '  <div class="field"><label class="fl" for="amountReceived">จำนวนเงินที่ได้รับโอนงวดนี้..ต้องเป็นยอดเต็มก่อนหักค่าธรรมเนียมการโอน (บาท) <span class="req">*</span></label>'
    + '    <input type="number" step="0.01" id="amountReceived" value="' + esc(ins.amountReceived) + '">'
    + '    <div class="msg warn" style="margin:8px 0 0">โปรดให้ข้อมูลงบประมาณที่รับโอนจริง "ก่อนหักค่าธรรมเนียม" มิฉะนั้นจะไม่สามารถออกใบเสร็จให้ได้</div>'
    + '    <div class="err-tx" id="eAmountReceived" style="display:none"></div></div>'
    + '</div>'

    + '<div class="field">'
    + '  <label class="fl" for="evidenceFile">อัปโหลดหลักฐานการรับโอนและชำระค่าธรรมเนียมการโอนกับงานการคลัง มรย. (ไฟล์รูปภาพ/PDF) <span class="req">*</span></label>'
    + '  <div class="upzone" id="upzone" tabindex="0" role="button" aria-label="เลือกไฟล์หลักฐาน">'
    + '    📎 คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวางตรงนี้<br>'
    + '    <span style="font-size:12px">รับเฉพาะ PDF · JPG · PNG · ไม่เกิน ' + esc(maxMb) + ' MB (ระบบตรวจจากเนื้อไฟล์จริง ไม่ใช่นามสกุล)</span>'
    + '  </div>'
    + '  <input type="file" id="evidenceFile" accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf" style="display:none" onchange="onPickFile(this)">'
    + '  <div id="fileList"></div>'
    + '  <div class="msg info" style="margin:8px 0 0">กรณีมีค่าธรรมเนียมการโอน กรุณาแนบหลักฐานการชำระค่าธรรมเนียมการโอนกับงานการคลัง มรย.</div>'
    + '  <div class="err-tx" id="eFile" style="display:none"></div>'
    + '</div>'

    + '<div class="frow">'
    + '  <div class="field"><label class="fl" for="receiptOrg">ชื่อหน่วยงานในใบเสร็จ <span class="req">*</span></label>'
    + '    <input type="text" id="receiptOrg" maxlength="300" value="' + esc(ins.receiptOrg) + '">'
    + '    <div class="help">โปรดตรวจสอบ "ชื่อหน่วยงานในใบเสร็จ" ให้รอบคอบ เพื่อมิให้กระทบต่อหลักฐานสำคัญทางการเงินที่ส่งกลับไปยังแหล่งทุน</div>'
    + '    <div class="err-tx" id="eReceiptOrg" style="display:none"></div></div>'
    + '  <div class="field"><label class="fl" for="receiptDetail">รายละเอียดในใบเสร็จรับเงิน <span class="req">*</span></label>'
    + '    <textarea id="receiptDetail" maxlength="1000" rows="2">' + esc(ins.receiptDetail) + '</textarea>'
    + '    <div class="help">โปรดตรวจสอบ "ข้อความที่ระบุในรายละเอียดในใบเสร็จรับเงิน" ให้รอบคอบ เพื่อมิให้กระทบต่อหลักฐานสำคัญทางการเงินที่ส่งกลับไปยังแหล่งทุน</div>'
    + '    <div class="err-tx" id="eReceiptDetail" style="display:none"></div></div>'
    + '</div>'

    + '<div class="err-tx" id="eStep3" style="display:none"></div>'
    + '<div style="display:flex;justify-content:space-between;gap:10px;margin-top:16px;flex-wrap:wrap">'
    + '  <button class="btn ghost" onclick="gotoStep(2)">← ย้อนกลับ</button>'
    + '  <button class="btn primary big" id="btn-submit-final" onclick="askConfirmSubmit()">💾 ยืนยันการบันทึกข้อมูล</button>'
    + '</div>'
    + '</div>';
}

function fundingSelectHtml(current, lock) {
  // ★ โหมดงวดถัดไป: ค่าที่ระบบดึงมาคือ "ชื่อแหล่งทุนจริงที่ผู้ใช้เคยพิมพ์เอง" ซึ่งอาจไม่ตรงกับ
  //   ตัวเลือกใดในรายการ (เช่นแหล่งทุน "อื่นๆ") — ถ้าใช้ <select> ค่าจะเด้งกลับเป็น "-- เลือกแหล่งทุน --"
  //   จึงต้องแสดงเป็นช่องอ่านอย่างเดียวแทน
  if (lock) {
    return '<input type="text" id="fundingSource" value="' + esc(current || '') + '" readonly>'
      + '<div class="lockhint">ระบบดึงมาจากคำขอเดิม แก้ไขไม่ได้</div>';
  }
  return '<select id="fundingSource" onchange="onFundingChange()">'
    + '<option value="">-- เลือกแหล่งทุน --</option>'
    + fundingSources().map(function (label) {
        const v = fundingOptionValue(label);
        const sel = (String(current || '') === v || String(current || '') === label) ? ' selected' : '';
        return '<option value="' + esc(v) + '"' + sel + '>' + esc(label) + '</option>';
      }).join('')
    + '</select>';
}
function onFundingChange() {
  FORM.p.fundingSource = valOf('fundingSource');
  const w = $('wrapOtherFunding');
  if (w) w.style.display = isOtherFunding(FORM.p.fundingSource) ? '' : 'none';
}

/** บล็อกกระจายงบ 8 หน่วยงาน — โหมดโครงการใหม่เท่านั้น */
function distInputsHtml() {
  const list = faculties();
  const d = FORM.p.dist || {};
  return '<div class="distbox" id="divBudgetDist">'
    + '<div style="font-family:\'Prompt\';font-weight:700;font-size:14px;color:var(--amber-tx);margin-bottom:4px">'
    + '⚠️ ระบุงบประมาณแยกตามหน่วยงาน (Validation)</div>'
    + '<p class="help" style="margin:0 0 10px">ผลรวมทุกช่องจะต้อง <b style="color:var(--red)">เท่ากับ</b> งบประมาณทั้งโครงการที่ระบุไว้ด้านบน</p>'
    + list.map(function (name, i) {
        return '<div class="distrow"><label for="dist' + i + '">' + (i + 1) + '. ' + esc(name) + '</label>'
          + '<input type="number" step="0.01" class="dist-input" id="dist' + i + '" data-faculty="' + esc(name) + '"'
          + ' value="' + esc(d[name] != null ? d[name] : 0) + '" oninput="onBudgetInput()"></div>';
      }).join('')
    + '<div class="distsum" id="distSum"><span>ยอดรวมปัจจุบัน: 0 / 0 บาท</span></div>'
    + '<div class="err-tx" id="eDist" style="display:none"></div>'
    + '</div>';
}
/** โหมดงวดถัดไป — แสดงงบแยกหน่วยงานของโครงการเดิมแบบอ่านอย่างเดียว
    ★ กับดักข้อ 24: ห้ามวาดเป็น <input class="dist-input"> ที่ซ่อนไว้ ไม่งั้นค่าจะถูกกวาดส่งไปด้วย */
function distReadonlyHtml() {
  const d = (FORM.lookup && FORM.lookup.budget_distribution) || {};
  const list = faculties();
  const rows = list.filter(function (n) { return numOf(d[n]) > 0; });
  if (!rows.length) {
    return '<div class="msg info">โครงการเดิมไม่ได้ระบุงบแยกตามหน่วยงานไว้ · โหมดงวดถัดไปไม่ต้องกรอกส่วนนี้</div>';
  }
  return '<div class="distbox">'
    + '<div style="font-family:\'Prompt\';font-weight:700;font-size:14px;margin-bottom:8px">งบประมาณแยกตามหน่วยงานของโครงการเดิม (อ่านอย่างเดียว)</div>'
    + rows.map(function (n) {
        return '<div class="rrow"><span>' + esc(n) + '</span><b>' + fmtMoney(d[n]) + ' บาท</b></div>';
      }).join('')
    + '<div class="distsum ok"><span>รวม ' + fmtMoney(FORM.lookup ? FORM.lookup.budget_distribution_sum : 0) + ' บาท</span></div>'
    + '</div>';
}

/** ★ แก้บั๊กของ 1.5 สองข้อพร้อมกัน: เทียบด้วย Math.abs(sum-total) > 0.005 (ไม่ใช่ !==)
    และเรียกทุกครั้งที่ค่าเปลี่ยน (oninput) ไม่ใช่เฉพาะ onkeyup */
function onBudgetInput() {
  const box = $('distSum');
  const total = numOf(valOf('totalBudget'));
  let sum = 0;
  const inputs = document.querySelectorAll('#divBudgetDist .dist-input');
  Array.prototype.forEach.call(inputs, function (el) { sum += numOf(el.value); });

  if (box) {
    const okSum = Math.abs(sum - total) <= 0.005;
    box.className = 'distsum ' + (okSum ? 'ok' : 'bad');
    box.innerHTML = '<span>ยอดรวมปัจจุบัน: ' + fmtMoney(sum) + ' / ' + fmtMoney(total) + ' บาท'
      + (okSum ? ' ✓' : ' (ต่าง ' + fmtMoney(Math.abs(sum - total)) + ' บาท)') + '</span>';
  }
  const btn = $('btn-submit-final');
  if (btn) btn.disabled = !step3Ready();
}
/** ปุ่มบันทึกเปิดได้ก็ต่อเมื่อยอดกระจายงบตรง (โหมดโครงการใหม่) — เงื่อนไขอื่นตรวจตอนกดส่ง */
function step3Ready() {
  if (FORM.mode === 'next') return true;
  const total = numOf(valOf('totalBudget'));
  let sum = 0;
  Array.prototype.forEach.call(document.querySelectorAll('#divBudgetDist .dist-input'), function (el) { sum += numOf(el.value); });
  return Math.abs(sum - total) <= 0.005;
}

/* ---------- ไฟล์แนบ ---------- */
function wireDropzone() {
  const z = $('upzone'), inp = $('evidenceFile');
  if (!z || !inp) return;
  z.onclick = function () { inp.click(); };
  z.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } };
  z.ondragover = function (e) { e.preventDefault(); z.classList.add('drag'); };
  z.ondragleave = function () { z.classList.remove('drag'); };
  z.ondrop = function (e) {
    e.preventDefault(); z.classList.remove('drag');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) takeFile(e.dataTransfer.files[0]);
  };
}
function onPickFile(inp) { if (inp.files && inp.files.length) takeFile(inp.files[0]); inp.value = ''; }
function takeFile(file) {
  clearFieldErr('eFile');
  const maxMb = (CFG && CFG.max_upload_mb) ? Number(CFG.max_upload_mb) : 10;
  if (file.size > maxMb * 1048576) {
    fieldErr('eFile', 'ไฟล์ใหญ่เกิน ' + maxMb + ' MB (ไฟล์ที่เลือกมีขนาด ' + fmtBytes(file.size) + ') กรุณาย่อไฟล์ก่อน');
    return;
  }
  const reader = new FileReader();
  reader.onload = function () {
    const raw = String(reader.result || '');
    const comma = raw.indexOf(',');
    FORM.file = {
      name: file.name,
      size: file.size,
      mime: file.type || '',
      b64: comma >= 0 ? raw.slice(comma + 1) : raw
    };
    paintFileList();
  };
  reader.onerror = function () { fieldErr('eFile', 'อ่านไฟล์ไม่สำเร็จ กรุณาเลือกไฟล์ใหม่'); };
  reader.readAsDataURL(file);
}
function removeFile() { FORM.file = null; paintFileList(); }
function paintFileList() {
  const el = $('fileList'); if (!el) return;
  if (!FORM.file) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="fileitem">📄 <span class="fn">' + esc(FORM.file.name) + '</span>'
    + '<span style="color:var(--ink3)">' + fmtBytes(FORM.file.size) + '</span>'
    + '<button class="x" type="button" aria-label="ลบไฟล์" onclick="removeFile()">✕</button></div>';
}

/* ---------- อ่านค่า + ตรวจ ขั้นที่ 3 ---------- */
function readStep3() {
  const p = FORM.p, ins = FORM.inst;
  if (FORM.mode === 'new') {
    p.fiscalYear         = valOf('fiscalYear');
    p.projectTitle       = valOf('projectTitle');
    p.fundingSource      = valOf('fundingSource');
    p.otherFundingSource = valOf('otherFundingSource');
    p.totalBudget        = valOf('totalBudget');
    p.periodStart        = valOf('periodStart');
    p.periodEnd          = valOf('periodEnd');
    const d = {};
    Array.prototype.forEach.call(document.querySelectorAll('#divBudgetDist .dist-input'), function (el) {
      d[el.getAttribute('data-faculty')] = numOf(el.value);
    });
    p.dist = d;
  }
  ins.installmentNo  = valOf('installmentNo');
  ins.amountReceived = valOf('amountReceived');
  ins.receiptOrg     = valOf('receiptOrg');
  ins.receiptDetail  = valOf('receiptDetail');
}
function validateStep3() {
  ['eFiscalYear', 'eProjectTitle', 'eFundingSource', 'eOtherFunding', 'eTotalBudget',
   'ePeriodStart', 'ePeriodEnd', 'eDist', 'eInstallmentNo', 'eAmountReceived',
   'eReceiptOrg', 'eReceiptDetail', 'eFile', 'eStep3'].forEach(clearFieldErr);
  ['fiscalYear', 'projectTitle', 'fundingSource', 'otherFundingSource', 'totalBudget',
   'periodStart', 'periodEnd', 'installmentNo', 'amountReceived', 'receiptOrg', 'receiptDetail']
    .forEach(function (id) { markBad(id, false); });

  const p = FORM.p, ins = FORM.inst;
  const st = { ok: true, first: '' };

  if (FORM.mode === 'new') {
    const fyMin = (CFG && CFG.fiscal_year_min) ? Number(CFG.fiscal_year_min) : 2560;
    const fyMax = (CFG && CFG.fiscal_year_max) ? Number(CFG.fiscal_year_max) : 2600;
    const fy = numOf(p.fiscalYear);
    if (!p.fiscalYear) markFieldBad(st, 'fiscalYear', 'eFiscalYear', 'กรุณากรอกปีงบประมาณ');
    else if (fy < fyMin || fy > fyMax) {
      markFieldBad(st, 'fiscalYear', 'eFiscalYear', 'ปีงบประมาณต้องอยู่ระหว่าง ' + fyMin + ' – ' + fyMax + ' (ค่าที่กรอก: ' + p.fiscalYear + ')');
    }
    if (!p.projectTitle) markFieldBad(st, 'projectTitle', 'eProjectTitle', 'กรุณากรอกชื่อโครงการ');
    if (!p.fundingSource) markFieldBad(st, 'fundingSource', 'eFundingSource', 'กรุณาเลือกแหล่งงบประมาณ');
    else if (isOtherFunding(p.fundingSource) && !p.otherFundingSource) {
      markFieldBad(st, 'otherFundingSource', 'eOtherFunding', 'กรุณาระบุแหล่งทุนอื่นๆ ของท่าน');
    }
    if (!p.totalBudget || numOf(p.totalBudget) <= 0) markFieldBad(st, 'totalBudget', 'eTotalBudget', 'กรุณากรอกงบประมาณทั้งโครงการให้มากกว่า 0');
    if (!p.periodStart) markFieldBad(st, 'periodStart', 'ePeriodStart', 'กรุณาเลือกวันที่เริ่มต้นโครงการ');
    if (!p.periodEnd) markFieldBad(st, 'periodEnd', 'ePeriodEnd', 'กรุณาเลือกวันที่สิ้นสุดโครงการ');
    if (p.periodStart && p.periodEnd && p.periodEnd < p.periodStart) {
      markFieldBad(st, 'periodEnd', 'ePeriodEnd', 'วันที่สิ้นสุดโครงการต้องไม่มาก่อนวันที่เริ่มต้นโครงการ');
    }
    // ★ ผลรวมงบแยกหน่วยงานต้องเท่ากับงบรวม — เทียบด้วยส่วนต่าง ไม่ใช่ !== (แก้ Logic Risk ข้อ 3)
    let sum = 0;
    Object.keys(p.dist || {}).forEach(function (k) { sum += numOf(p.dist[k]); });
    if (Math.abs(sum - numOf(p.totalBudget)) > 0.005) {
      fieldErr('eDist', 'ผลรวมงบแยกตามหน่วยงาน (' + fmtMoney(sum) + ' บาท) ต้องเท่ากับงบประมาณทั้งโครงการ ('
        + fmtMoney(p.totalBudget) + ' บาท)');
      st.ok = false; if (!st.first) st.first = 'totalBudget';
    }
  }

  if (!ins.installmentNo || numOf(ins.installmentNo) < 1) markFieldBad(st, 'installmentNo', 'eInstallmentNo', 'กรุณากรอกงวดที่ขอเบิก (ตั้งแต่ 1 ขึ้นไป)');
  if (!ins.amountReceived || numOf(ins.amountReceived) <= 0) markFieldBad(st, 'amountReceived', 'eAmountReceived', 'กรุณากรอกจำนวนเงินที่ได้รับโอนงวดนี้');
  if (!ins.receiptOrg) markFieldBad(st, 'receiptOrg', 'eReceiptOrg', 'กรุณากรอกชื่อหน่วยงานในใบเสร็จ');
  if (!ins.receiptDetail) markFieldBad(st, 'receiptDetail', 'eReceiptDetail', 'กรุณากรอกรายละเอียดในใบเสร็จรับเงิน');
  if (!FORM.file) { fieldErr('eFile', 'กรุณาแนบหลักฐานการรับโอนเงิน (PDF · JPG · PNG)'); st.ok = false; }

  if (st.first && $(st.first)) $(st.first).focus();
  return st.ok;
}

/** กดปุ่ม "ยืนยันการบันทึกข้อมูล" → เด้งถามยืนยันก่อนส่งจริง (คงพฤติกรรมเดิมของ 1.5) */
function askConfirmSubmit() {
  readStep3();
  if (!validateStep3()) return;
  const ins = FORM.inst;
  openM('<div class="mh"><h3>ยืนยันการบันทึกข้อมูล?</h3><button class="mx" onclick="closeM()" aria-label="ปิด">✕</button></div>'
    + '<div class="mb"><p>โปรดตรวจสอบรายละเอียดให้ถูกต้อง</p>'
    + '<div class="kv2">'
    + '<b>ผู้ขอรับบริการ</b><span>' + esc(FORM.f.fullName) + '</span>'
    + '<b>อีเมล</b><span>' + esc(FORM.f.email) + '</span>'
    + '<b>ประเภทคำขอ</b><span>' + (FORM.mode === 'next' ? 'งวดถัดไป (อ้างอิง ' + esc(FORM.serviceIdSearch) + ')' : 'โครงการใหม่/งวดที่ 1') + '</span>'
    + '<b>ชื่อโครงการ</b><span>' + esc(FORM.p.projectTitle) + '</span>'
    + '<b>งวดที่</b><span>' + esc(ins.installmentNo) + '</span>'
    + '<b>ยอดรับโอนงวดนี้</b><span>' + fmtMoney(ins.amountReceived) + ' บาท</span>'
    + '<b>ไฟล์แนบ</b><span>' + esc(FORM.file ? FORM.file.name : '—') + '</span>'
    + '</div>'
    + '<div class="err-tx" id="eConfirm" style="display:none"></div>'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">'
    + '<button class="btn primary" id="btnConfirmSubmit" onclick="doSubmitRequest()">ยืนยันและส่งข้อมูล</button>'
    + '<button class="btn ghost" onclick="closeM()">กลับไปแก้ไข</button>'
    + '</div></div>');
}

/** ลำดับที่ถูกต้อง: uploadAttachment → ได้ upload_token → submitRequest (มติ EF-D35) */
async function doSubmitRequest() {
  if (FORM.sending) return;
  FORM.sending = true;
  const btn = $('btnConfirmSubmit');
  clearFieldErr('eConfirm');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>กำลังอัปโหลดไฟล์...'; }

  try {
    const up = await api('uploadAttachment', {
      token: tokenOf('submit'),
      file_name: FORM.file.name,
      data_base64: FORM.file.b64,
      client_hint: clientHint()
    });

    if (btn) btn.innerHTML = '<span class="spin"></span>กำลังบันทึกคำขอ...';

    const body = {
      token: tokenOf('submit'),
      upload_token: up.upload_token,
      mode: FORM.mode,
      full_name:  FORM.f.fullName,
      staff_type: FORM.f.staffType,
      researcher_project: FORM.f.researcherProject,
      faculty:    FORM.f.faculty,
      sub_unit:   FORM.f.subUnit,
      phone:      FORM.f.phone,
      email:      FORM.f.email,
      installment_no:  numOf(FORM.inst.installmentNo),
      amount_received: numOf(FORM.inst.amountReceived),
      receipt_org:     FORM.inst.receiptOrg,
      receipt_detail:  FORM.inst.receiptDetail,
      client_hint:     clientHint()
    };

    if (FORM.mode === 'next') {
      // ★ กับดักข้อ 24: โหมดงวดถัดไป "ไม่ส่ง" ข้อมูลโครงการและงบแยกหน่วยงานเลยแม้แต่ช่องเดียว
      //   เซิร์ฟเวอร์คัดลอกจากคำขอต้นทางเอง (มติ EF-D37) — ส่งมาก็ถูกทิ้ง แต่ไม่ส่งดีกว่า
      body.service_id_search = FORM.serviceIdSearch;
    } else {
      body.fiscal_year    = numOf(FORM.p.fiscalYear);
      body.project_title  = FORM.p.projectTitle;
      body.funding_source = FORM.p.fundingSource;
      if (isOtherFunding(FORM.p.fundingSource)) body.other_funding_source = FORM.p.otherFundingSource;
      body.total_budget   = numOf(FORM.p.totalBudget);
      body.budget_distribution = FORM.p.dist;
      body.period_start   = FORM.p.periodStart;
      body.period_end     = FORM.p.periodEnd;
    }

    const d = await api('submitRequest', body);
    FORM.result = d;
    FORM.step = 'done';
    FORM.sending = false;
    closeM();
    render();
  } catch (err) {
    FORM.sending = false;
    if (btn) { btn.disabled = false; btn.textContent = 'ยืนยันและส่งข้อมูล'; }
    fieldErr('eConfirm', err.msg || 'บันทึกคำขอไม่สำเร็จ');
    // ใบเบิกไฟล์ใช้ได้ครั้งเดียว — ถ้าล้มหลังอัปโหลด ต้องแนบไฟล์ใหม่ก่อนส่งซ้ำ
    if (err.error === 'BAD_INPUT' || err.error === 'NOT_FOUND') {
      fieldErr('eConfirm', (err.msg || 'บันทึกคำขอไม่สำเร็จ') + ' · หากลองส่งใหม่ กรุณาแนบไฟล์หลักฐานอีกครั้ง');
    }
  }
}

function formDoneV() {
  const r = FORM.result || {};
  const flags = (r.data_flags && r.data_flags.length)
    ? '<div class="msg warn">ระบบติดหมายเหตุคุณภาพข้อมูลไว้: ' + r.data_flags.map(esc).join(' · ')
      + ' — เจ้าหน้าที่จะตรวจสอบให้อีกครั้ง ไม่กระทบการรับคำขอ</div>' : '';
  const mail = r.mail_sent || {};
  return '<div class="panel statecard">'
    + '<div class="ok-ring">✓</div>'
    + '<h3>บันทึกคำขอรับบริการเรียบร้อยแล้ว</h3>'
    + '<p>โปรดจดหรือถ่ายภาพ "รหัสบริการ" ด้านล่างไว้ใช้ติดตามสถานะ</p>'
    + '<div class="resultid">' + esc(r.service_id || '—') + '</div>'
    + '<p class="help">เลขที่ธุรกรรมงวดนี้: ' + esc(r.transaction_id || '—')
    + ' · สถานะปัจจุบัน: ' + esc(r.status || '—') + '</p>'
    + flags
    + '<div class="msg ' + (mail.to_requester ? 'ok' : 'warn') + '">'
    + (mail.to_requester
        ? 'ระบบส่งอีเมลยืนยันพร้อมรหัสบริการไปที่ ' + esc(FORM.f.email) + ' แล้ว'
        : 'บันทึกข้อมูลสำเร็จ แต่ส่งอีเมลยืนยันไม่สำเร็จ — กรุณาเก็บรหัสบริการด้านบนไว้เอง และแจ้งผู้ดูแลระบบ')
    + '</div>'
    + '<div class="btns" style="justify-content:center">'
    + '  <button class="btn primary" data-page="track">🔎 ไปหน้าติดตามสถานะ</button>'
    + '  <button class="btn ghost" onclick="startNewForm()">ยื่นคำขออีกงวด</button>'
    + '</div>'
    + '</div>';
}
function startNewForm() {
  const keep = FORM.f;
  FORM = newForm();
  FORM.f = keep;             // ผู้ยื่นคนเดิม ไม่ต้องกรอกซ้ำ (token ยังอยู่)
  FORM.step = 2;
  render();
}

function formAfter() {
  if (FORM.step === 'otp') { wireOtp(); paintResend(); return; }
  if (FORM.step === 3) {
    wireDropzone();
    paintFileList();
    onBudgetInput();
  }
}

/* ============================================================
   8) หน้า TRACK — ติดตามสถานะรายงวด (SPEC หมวด 9.5)
   ============================================================ */
function trackV() {
  if (OTP.on && OTP.next === 'track') return otpPanelV();
  if (!AUTH.view) return trackGateV();
  if (TRACK.loading) return loadingCard('กำลังโหลดข้อมูลคำขอของท่าน');
  if (TRACK.err) return errorCard(TRACK.err, 'loadTrack()');
  if (!TRACK.items) return loadingCard('กำลังโหลดข้อมูลคำขอของท่าน');
  if (!TRACK.items.length) {
    return '<div class="panel statecard"><div class="ico">📭</div><h3>ยังไม่พบคำขอของอีเมลนี้</h3>'
      + '<p>อีเมล ' + esc(AUTH.view.email) + ' ยังไม่มีคำขอในระบบ หรือคำขอถูกยื่นด้วยอีเมลอื่น</p>'
      + '<button class="btn primary" data-page="form">📝 ยื่นคำขอใหม่</button></div>';
  }
  return '<div class="sec-head"><h2>ติดตาม<b>สถานะคำขอ</b>รับบริการ</h2>'
    + '<span class="rt">' + esc(AUTH.view.email) + ' · ' + TRACK.items.length + ' งวด</span></div>'
    + (TRACK.only ? '<div class="msg info">กำลังแสดงเฉพาะรหัสบริการ <b>' + esc(TRACK.only) + '</b> · '
        + '<a href="javascript:void(0)" onclick="showAllTrack()">ดูคำขอทั้งหมดของฉัน</a></div>' : '')
    + TRACK.items.map(trackCardHtml).join('')
    + '<p class="help" style="text-align:right">'
    + '<a href="javascript:void(0)" onclick="openRecoverModal()">❓ ลืมรหัสบริการ?</a></p>';
}
function trackGateV() {
  return '<div class="sec-head"><h2>ติดตาม<b>สถานะคำขอ</b>รับบริการ</h2></div>'
    + '<div class="panel">'
    + '<div class="msg info">เพื่อความปลอดภัยของข้อมูลผู้ยื่นทุกท่าน ระบบให้ดูได้เฉพาะคำขอที่ยื่นด้วยอีเมลของท่านเอง '
    + 'กรุณายืนยันอีเมลด้วยรหัส 6 หลักก่อน</div>'
    + '<div class="field"><label class="fl" for="trackEmail">อีเมลที่ใช้ยื่นคำขอ <span class="req">*</span></label>'
    + '<input type="email" id="trackEmail" placeholder="you@yru.ac.th" autocomplete="email">'
    + '<div class="err-tx" id="eTrackEmail" style="display:none"></div></div>'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap">'
    + '<button class="btn primary" id="btnTrackOtp" onclick="requestTrackOtp()">ขอรหัสยืนยันทางอีเมล</button>'
    + '</div>'
    + '<p class="help" style="margin-top:14px">'
    + '<a href="javascript:void(0)" onclick="openRecoverModal()">❓ ลืมรหัสบริการ?</a> '
    + '— ระบบจะส่งรายการรหัสบริการทั้งหมดไปทางอีเมล</p>'
    + '</div>';
}
async function requestTrackOtp() {
  clearFieldErr('eTrackEmail');
  const em = valOf('trackEmail');
  if (!isEmailLike(em)) { fieldErr('eTrackEmail', 'กรุณากรอกอีเมลให้ถูกต้อง'); return; }
  const btn = $('btnTrackOtp');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>กำลังส่งรหัส...';
  try {
    const d = await api('requestOtp', { email: em, purpose: PURPOSE_VIEW, client_hint: clientHint() });
    startOtp(PURPOSE_VIEW, em, 'track', d);
  } catch (err) {
    btn.disabled = false; btn.textContent = 'ขอรหัสยืนยันทางอีเมล';
    fieldErr('eTrackEmail', err.msg || 'ขอรหัสยืนยันไม่สำเร็จ');
  }
}
function showAllTrack() { go('track'); }

async function loadTrack() {
  if (!AUTH.view) { render(); return; }
  TRACK.loading = true; TRACK.err = ''; render();
  try {
    const params = { token: tokenOf('view') };
    if (TRACK.only) params.service_id = TRACK.only;
    const d = await api('track', params);
    TRACK.items = (d && d.items) ? d.items : [];
    TRACK.loading = false;
    render();
  } catch (err) {
    TRACK.loading = false;
    TRACK.err = err.msg || 'โหลดข้อมูลไม่สำเร็จ';
    if (err.error === 'SESSION_INVALID' || err.error === 'SESSION_EXPIRED' || err.error === 'FORBIDDEN') TRACK.err = '';
    render();
  }
}
function trackAfter() {
  if (OTP.on && OTP.next === 'track') { wireOtp(); paintResend(); return; }
  if (AUTH.view && !TRACK.items && !TRACK.loading && !TRACK.err) { loadTrack(); return; }
  if (TRACK.items) maybeOpenEvaluateFromLink();
}
/** เข้ามาจากลิงก์ "ทำแบบประเมิน" ในอีเมล (?page=evaluate&sid=…&tid=…) → เปิดกล่องประเมินให้เลย */
function maybeOpenEvaluateFromLink() {
  if (S.page !== 'evaluate' || !S.tid) return;
  const hit = (TRACK.items || []).filter(function (x) { return x.transaction_id === S.tid; })[0];
  S.tid = '';                       // เปิดครั้งเดียว ไม่เด้งซ้ำทุกครั้งที่วาดหน้าใหม่
  if (!hit) { toast('ไม่พบงวดที่ระบุในลิงก์ — กรุณาเลือกจากรายการด้านล่าง'); return; }
  if (hit.can_evaluate) openEvaluate(hit.transaction_id, hit.service_id);
  else toast(hit.has_evaluation ? 'งวดนี้ทำแบบประเมินไปแล้ว' : 'งวดนี้ยังไม่ถึงขั้นทำแบบประเมิน');
}

function trackCardHtml(it) {
  const erpUrl = safeUrl(CFG && CFG.erp_url);
  const receiptUrl = safeUrl(it.receipt_link);
  const acts = [];
  // ปุ่ม "เข้า YRU ERP" โผล่ตั้งแต่ขั้นที่ 2 เป็นต้นไป — คงพฤติกรรมเดิมของ 1.5 (curLevel >= 2)
  // step_index มาจากหลังบ้าน: 0-4 ตามลำดับ 5 ขั้นหลัก · -1 = ไม่ได้อยู่ในลำดับ (ยกเลิก/รอการแก้ไข)
  if (Number(it.step_index) >= 1 && erpUrl) {
    acts.push('<a class="btn ghost sm" href="' + esc(erpUrl) + '" target="_blank" rel="noopener">↗ เข้า YRU ERP</a>');
  }
  if (it.can_evaluate) {
    acts.push('<button class="btn primary sm" onclick="openEvaluate(\'' + esc(it.transaction_id) + '\',\'' + esc(it.service_id) + '\')">⭐ ทำแบบประเมินเพื่อรับใบเสร็จ</button>');
  }
  if (it.receipt_ready && receiptUrl) {
    acts.push('<a class="btn ghost sm" href="' + esc(receiptUrl) + '" target="_blank" rel="noopener">⬇ ดาวน์โหลดใบเสร็จ</a>');
  }
  acts.push('<button class="btn ghost sm" onclick="goDetail(\'' + esc(it.service_id) + '\')">📄 ดูรายละเอียด</button>');

  const rev = it.is_revision
    ? '<div class="msg warn">สถานะปัจจุบัน "รอการแก้ไข"'
      + (it.revision_reason ? ' — ' + esc(it.revision_reason) : '') + '</div>' : '';
  const cancelled = it.is_cancelled ? '<div class="msg err">คำขอนี้ถูกยกเลิกบริการแล้ว</div>' : '';

  return '<div class="panel trackcard">'
    + '<div class="tc-head">'
    + '  <span class="tc-id">' + esc(it.service_id) + '</span>'
    + '  ' + badge(it.status)
    + '  <span class="spacer"></span>'
    + '</div>'
    + '<div class="tc-sub">' + esc(it.project_title || '—') + '</div>'
    + '<div class="tc-sub">เลขที่ธุรกรรม ' + esc(it.transaction_id) + ' · งวดที่ ' + esc(it.installment_no)
    + ' · ยอดรับโอน ' + fmtMoney(it.amount_received) + ' บาท · ยื่นเมื่อ ' + fmtDate(it.submitted_at, true) + '</div>'
    + rev + cancelled
    + '<ul class="tl" style="margin-top:14px">' + timelineHtml(it.timeline) + '</ul>'
    + '<div class="tc-actions">' + acts.join('') + '</div>'
    + '</div>';
}
function timelineHtml(tl) {
  if (!tl || !tl.length) return '<li><div class="tt">ยังไม่มีประวัติการดำเนินการ</div></li>';
  return tl.map(function (t) {
    const cls = t.off_step ? 'off' : (t.done ? '' : 'pending');
    const dot = t.done ? (STATUS_DOT[t.status] || 'gn') : 'g';
    return '<li class="' + cls + '">'
      + '<span class="d ' + dot + '" style="' + (t.done ? '' : 'opacity:.35') + '"></span>'
      + '<div class="tt">' + (t.done ? '✔ ' : '') + esc(t.status) + '</div>'
      + '<div class="tm">' + (t.done ? fmtDate(t.time, true) : 'ยังไม่ถึงขั้นนี้')
      + (t.comment ? ' · หมายเหตุ: ' + esc(t.comment) : '') + '</div></li>';
  }).join('');
}
function goDetail(sid) { go('detail', { sid: sid }); }

/* ============================================================
   9) หน้า DETAIL — รายละเอียดฉบับเต็ม 4 ส่วน + พิมพ์แบบคำขอ
   ============================================================ */
function detailV() {
  if (!AUTH.view) {
    return '<div class="panel statecard"><div class="ico">🔒</div><h3>ต้องยืนยันอีเมลก่อน</h3>'
      + '<p>กรุณายืนยันอีเมลของท่านที่หน้าติดตามสถานะก่อน จึงจะดูรายละเอียดคำขอได้</p>'
      + '<button class="btn primary" data-page="track">ไปหน้าติดตามสถานะ</button></div>';
  }
  if (DETAIL.loading) return loadingCard('กำลังโหลดรายละเอียดคำขอ');
  if (DETAIL.err) return errorCard(DETAIL.err, 'loadDetail()');
  if (!DETAIL.data) return loadingCard('กำลังโหลดรายละเอียดคำขอ');

  const d = DETAIL.data, r = d.requester || {}, p = d.project || {};
  const distRows = Object.keys(p.budget_distribution || {}).map(function (k) {
    return '<div class="rrow"><span>' + esc(k) + '</span><b>' + fmtMoney(p.budget_distribution[k]) + ' บาท</b></div>';
  }).join('');

  return '<div class="printhead"><b>แบบคำขอรับบริการออกใบเสร็จรับเงิน · SRDI External Fund</b><br>'
    + 'สถาบันวิจัยและพัฒนาชายแดนภาคใต้ มหาวิทยาลัยราชภัฏยะลา · รหัสบริการ ' + esc(r.service_id || '') + '</div>'

    + '<div class="sec-head noprint"><h2>รายละเอียด<b>แบบคำขอรับบริการ</b></h2>'
    + '<span class="rt">' + esc(r.service_id || '') + '</span></div>'
    + '<div class="btns noprint" style="margin:0 0 14px">'
    + '  <button class="btn ghost" onclick="window.print()">🖨 พิมพ์แบบคำขอ</button>'
    + '  <button class="btn ghost" data-page="track">← กลับหน้าติดตาม</button>'
    + '</div>'

    + '<div class="panel" style="margin-bottom:14px"><h3 style="font-size:16px;margin-bottom:10px">1 · ข้อมูลผู้ขอรับบริการ</h3>'
    + '<dl class="dl">'
    + dt('รหัสบริการ', r.service_id) + dt('ชื่อ-สกุล', r.full_name)
    + dt('ประเภทบุคลากร', r.staff_type) + dt('ชื่อโครงการวิจัยที่รับผิดชอบ', r.researcher_project)
    + dt('สังกัด/คณะ', r.faculty) + dt('หน่วยงานย่อย', r.sub_unit)
    + dt('หมายเลขโทรศัพท์', r.phone) + dt('อีเมล', r.email)
    + '</dl></div>'

    + '<div class="panel" style="margin-bottom:14px"><h3 style="font-size:16px;margin-bottom:10px">2 · รายละเอียดโครงการและงบประมาณ</h3>'
    + '<dl class="dl">'
    + dt('ชื่อโครงการ', p.project_title) + dt('ปีงบประมาณ', p.fiscal_year)
    + dt('แหล่งงบประมาณ', p.funding_source)
    + dt('งบประมาณทั้งโครงการ', fmtMoney(p.total_budget) + ' บาท')
    + dt('วันที่เริ่มต้นโครงการ', fmtDate(p.period_start))
    + dt('วันที่สิ้นสุดโครงการ', fmtDate(p.period_end))
    + dt('รหัสอ้างอิงโครงการ', p.ref_service_id)
    + dt('บันทึกเมื่อ', fmtDate(p.created_at, true))
    + '</dl>'
    + '<div style="margin-top:12px"><b style="font-size:13.5px">งบประมาณแยกตามหน่วยงาน</b>'
    + (distRows || '<div class="help">ไม่ได้ระบุ</div>')
    + '<div class="distsum ' + (p.budget_sum_matches ? 'ok' : 'bad') + '"><span>รวม '
    + fmtMoney(p.budget_distribution_sum) + ' / ' + fmtMoney(p.total_budget) + ' บาท'
    + (p.budget_sum_matches ? ' ✓' : ' (ไม่ตรงกับงบรวม)') + '</span></div></div>'
    + ((p.data_flags && p.data_flags.length)
        ? '<div class="msg warn">หมายเหตุคุณภาพข้อมูล: ' + p.data_flags.map(esc).join(' · ') + '</div>' : '')
    + '</div>'

    + '<div class="panel" style="margin-bottom:14px"><h3 style="font-size:16px;margin-bottom:10px">3 · รายการธุรกรรมรายงวด ('
    + esc(d.total_transactions || 0) + ' งวด)</h3>'
    + (d.transactions || []).map(txHtml).join('')
    + '</div>'

    + '<div class="panel"><h3 style="font-size:16px;margin-bottom:10px">4 · ผลการประเมินความพึงพอใจ</h3>'
    + evalSummaryHtml(d.transactions || [])
    + '</div>';
}
function dt(k, v) {
  if (v == null || v === '') return '';
  return '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>';
}
function txHtml(t) {
  const links = [];
  [[t.evidence_link, 'หลักฐานการรับโอน'], [t.receipt_link, 'สำเนาใบเสร็จรับเงิน'], [t.pdf_link, 'แบบคำขอ (PDF)']]
    .forEach(function (x) {
      const u = safeUrl(x[0]);
      if (u) links.push('<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(x[1]) + '</a>');
    });
  return '<div class="panel" style="margin-bottom:10px;box-shadow:none">'
    + '<div class="tc-head"><span class="tc-id">งวดที่ ' + esc(t.installment_no) + '</span>' + badge(t.status) + '</div>'
    + '<dl class="dl" style="margin-top:8px">'
    + dt('เลขที่ธุรกรรม', t.transaction_id)
    + dt('จำนวนเงินที่ได้รับโอน', fmtMoney(t.amount_received) + ' บาท')
    + dt('ชื่อหน่วยงานในใบเสร็จ', t.receipt_org)
    + dt('รายละเอียดในใบเสร็จรับเงิน', t.receipt_detail)
    + dt('ยื่นเมื่อ', fmtDate(t.submitted_at, true))
    + dt('เหตุผลที่ขอให้แก้ไข', t.revision_reason)
    + '</dl>'
    + (links.length ? '<div class="help">เอกสาร: ' + links.join(' · ') + '</div>' : '')
    + '<ul class="tl" style="margin-top:12px">' + timelineHtml(t.timeline) + '</ul>'
    + '</div>';
}
function evalSummaryHtml(txs) {
  const rows = txs.filter(function (t) { return t.evaluation; });
  if (!rows.length) return '<div class="help">ยังไม่มีการประเมินสำหรับคำขอนี้</div>';
  return rows.map(function (t) {
    const e = t.evaluation;
    return '<div class="rrow" style="align-items:flex-start"><span>งวดที่ ' + esc(t.installment_no) + '</span>'
      + '<div style="text-align:right">'
      + '<div>ความรวดเร็วในการให้บริการ: <b>' + esc(e.score_speed) + '/5</b></div>'
      + '<div>ความสะดวกของการใช้งานระบบ Web App: <b>' + esc(e.score_system) + '/5</b></div>'
      + (e.comments ? '<div class="help">“' + esc(e.comments) + '”</div>' : '')
      + '<div class="help">ประเมินเมื่อ ' + fmtDate(e.submitted_at, true) + '</div>'
      + '</div></div>';
  }).join('');
}
async function loadDetail() {
  if (!AUTH.view || !S.sid) { render(); return; }
  DETAIL.loading = true; DETAIL.err = ''; render();
  try {
    DETAIL.data = await api('serviceDetail', { token: tokenOf('view'), service_id: S.sid });
    DETAIL.loading = false; render();
  } catch (err) {
    DETAIL.loading = false;
    DETAIL.err = err.msg || 'โหลดรายละเอียดไม่สำเร็จ';
    render();
  }
}
function detailAfter() {
  if (AUTH.view && S.sid && !DETAIL.loading && !DETAIL.err
      && (!DETAIL.data || (DETAIL.data.requester || {}).service_id !== S.sid)) {
    loadDetail();
  }
}

/* ============================================================
   10) แบบประเมินเพื่อรับใบเสร็จ (ดาว 1-5 สองข้อ · SPEC หมวด 9.5)
   ============================================================ */
function openEvaluate(tid, sid) {
  EVAL = { tid: tid, sid: sid, speed: 0, system: 0 };
  openM('<div class="mh"><h3>⭐ แบบประเมินเพื่อรับใบเสร็จ</h3>'
    + '<button class="mx" onclick="closeM()" aria-label="ปิด">✕</button></div>'
    + '<div class="mb">'
    + '<p class="help">รหัสอ้างอิง: ' + esc(sid) + ' · เลขที่ธุรกรรม ' + esc(tid) + '</p>'
    + '<div class="field"><div class="starlabel">1. ความรวดเร็วในการให้บริการ <span class="req">*</span></div>'
    + starRowHtml('speed') + '</div>'
    + '<div class="field"><div class="starlabel">2. ความสะดวกของการใช้งานระบบ Web App <span class="req">*</span></div>'
    + starRowHtml('system') + '</div>'
    + '<div class="field"><label class="fl" for="evalComment">ข้อเสนอแนะเพิ่มเติม (ไม่บังคับ)</label>'
    + '<textarea id="evalComment" maxlength="1000" rows="3" placeholder="พิมพ์ข้อเสนอแนะของท่าน..."></textarea></div>'
    + '<div class="err-tx" id="eEval" style="display:none"></div>'
    + '<button class="btn primary" id="btnEval" onclick="submitEvaluationNow()">บันทึกและส่งใบเสร็จไปยังอีเมล 📧</button>'
    + '</div>');
}
function starRowHtml(kind) {
  return '<div class="stars" id="stars-' + kind + '">'
    + [1, 2, 3, 4, 5].map(function (i) {
        return '<span role="button" tabindex="0" aria-label="' + i + ' ดาว"'
          + ' onclick="setStar(\'' + kind + '\',' + i + ')"'
          + ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();setStar(\'' + kind + '\',' + i + ')}">★</span>';
      }).join('')
    + '</div>';
}
function setStar(kind, n) {
  EVAL[kind] = n;
  const box = $('stars-' + kind); if (!box) return;
  Array.prototype.forEach.call(box.querySelectorAll('span'), function (s, i) {
    if (i < n) s.classList.add('on'); else s.classList.remove('on');
  });
}
async function submitEvaluationNow() {
  clearFieldErr('eEval');
  if (!EVAL.speed || !EVAL.system) {
    fieldErr('eEval', 'กรุณาให้คะแนนดาวให้ครบทั้ง 2 ข้อ');
    return;
  }
  const btn = $('btnEval');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>กำลังบันทึก...';
  try {
    const d = await api('submitEvaluation', {
      token: tokenOf('view'),
      transaction_id: EVAL.tid,
      score_speed: EVAL.speed,
      score_system: EVAL.system,
      comments: valOf('evalComment'),
      client_hint: clientHint()
    });
    closeM();
    toast((d && d.message) ? d.message : 'บันทึกแบบประเมินเรียบร้อย');
    TRACK.items = null;                                   // สถานะเปลี่ยนแล้ว ต้องดึงใหม่
    if (S.page === 'evaluate') go('track', { sid: TRACK.only });
    else loadTrack();
  } catch (err) {
    btn.disabled = false; btn.textContent = 'บันทึกและส่งใบเสร็จไปยังอีเมล 📧';
    fieldErr('eEval', err.msg || 'บันทึกแบบประเมินไม่สำเร็จ');
  }
}

/* ============================================================
   11) กู้คืนรหัสบริการ ("ลืมรหัสบริการ?")
       ★ ห้ามบอกบนจอว่าอีเมลนี้มีข้อมูลในระบบหรือไม่ (มติ EF-D23)
       หน้าเว็บแสดงข้อความกลางที่หลังบ้านส่งมาเท่านั้น ไม่ตีความเพิ่มเอง
   ============================================================ */
function recoverV() {
  return '<div class="sec-head"><h2>ลืม<b>รหัสบริการ</b>?</h2></div>'
    + '<div class="panel" style="max-width:620px">'
    + '<p>กรอกอีเมลที่ใช้ยื่นคำขอ ระบบจะส่งรายการรหัสบริการทั้งหมดของอีเมลนั้นไปให้ทางอีเมล</p>'
    + '<div class="field"><label class="fl" for="rcEmail">อีเมล <span class="req">*</span></label>'
    + '<input type="email" id="rcEmail" placeholder="you@yru.ac.th" autocomplete="email">'
    + '<div class="err-tx" id="eRc" style="display:none"></div></div>'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap">'
    + '<button class="btn primary" id="btnRc" onclick="submitRecover()">ส่งรายการรหัสบริการทางอีเมล</button>'
    + '<button class="btn ghost" data-page="track">← กลับหน้าติดตาม</button></div>'
    + '<div class="msg info" id="rcDone" style="display:none"></div>'
    + '</div>';
}
function recoverAfter() { const e = $('rcEmail'); if (e) e.focus(); }
function openRecoverModal() {
  openM('<div class="mh"><h3>❓ ลืมรหัสบริการ?</h3><button class="mx" onclick="closeM()" aria-label="ปิด">✕</button></div>'
    + '<div class="mb"><p>กรอกอีเมลที่ใช้ยื่นคำขอ ระบบจะส่งรายการรหัสบริการทั้งหมดของอีเมลนั้นไปให้ทางอีเมล</p>'
    + '<div class="field"><label class="fl" for="rcEmail">อีเมล</label>'
    + '<input type="email" id="rcEmail" placeholder="you@yru.ac.th"></div>'
    + '<div class="err-tx" id="eRc" style="display:none"></div>'
    + '<div class="msg info" id="rcDone" style="display:none"></div>'
    + '<button class="btn primary" id="btnRc" onclick="submitRecover()">ส่งรายการรหัสบริการทางอีเมล</button></div>');
}
async function submitRecover() {
  clearFieldErr('eRc');
  const em = valOf('rcEmail');
  if (!isEmailLike(em)) { fieldErr('eRc', 'กรุณากรอกอีเมลให้ถูกต้อง'); return; }
  const btn = $('btnRc');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>กำลังส่ง...';
  try {
    const d = await api('recoverServiceId', { email: em, client_hint: clientHint() });
    const box = $('rcDone');
    if (box) { box.style.display = ''; box.textContent = (d && d.message) ? d.message : 'ดำเนินการเรียบร้อย กรุณาตรวจกล่องจดหมายของท่าน'; }
    btn.disabled = true; btn.textContent = 'ส่งแล้ว';
  } catch (err) {
    btn.disabled = false; btn.textContent = 'ส่งรายการรหัสบริการทางอีเมล';
    fieldErr('eRc', err.msg || 'ส่งไม่สำเร็จ');
  }
}

/* ============================================================
   12) กล่องแจ้งปัญหา/ข้อเสนอแนะ (มติ EF-D6)
   ============================================================ */
function openFeedback() {
  if (CFG && CFG.feedback_enabled === false) { toast('ขณะนี้ปิดรับข้อเสนอแนะชั่วคราว'); return; }
  openM('<div class="mh"><h3>💬 แจ้งปัญหา / ข้อเสนอแนะ</h3>'
    + '<button class="mx" onclick="closeM()" aria-label="ปิด">✕</button></div>'
    + '<div class="mb">'
    + '<div class="field"><label class="fl" for="fbCat">หมวด</label><select id="fbCat">'
    + feedbackCats().map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('')
    + '</select></div>'
    + '<div class="field"><label class="fl" for="fbMsg">ข้อความ <span class="req">*</span></label>'
    + '<textarea id="fbMsg" rows="4" maxlength="2000" placeholder="เล่ารายละเอียดให้เราทราบ (5–2,000 ตัวอักษร)"></textarea></div>'
    + '<div class="frow">'
    + '<div class="field"><label class="fl" for="fbName">ชื่อ (ไม่บังคับ)</label><input type="text" id="fbName" maxlength="100"></div>'
    + '<div class="field"><label class="fl" for="fbEmail">อีเมล (ไม่บังคับ)</label><input type="email" id="fbEmail" maxlength="200"></div>'
    + '</div>'
    + '<div class="err-tx" id="eFb" style="display:none"></div>'
    + '<button class="btn primary" id="btnFb" onclick="submitFeedbackNow()">ส่งข้อความ</button>'
    + '</div>');
}
async function submitFeedbackNow() {
  clearFieldErr('eFb');
  const msg = valOf('fbMsg');
  if (msg.length < 5) { fieldErr('eFb', 'กรุณาพิมพ์ข้อความอย่างน้อย 5 ตัวอักษร'); return; }
  const btn = $('btnFb');
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>กำลังส่ง...';
  try {
    const d = await api('submitFeedback', {
      category: valOf('fbCat'), message: msg,
      name: valOf('fbName'), email: valOf('fbEmail'), client_hint: clientHint()
    });
    closeM();
    toast((d && d.message) ? d.message : 'ขอบคุณสำหรับข้อเสนอแนะ');
  } catch (err) {
    btn.disabled = false; btn.textContent = 'ส่งข้อความ';
    fieldErr('eFb', err.msg || 'ส่งข้อความไม่สำเร็จ');
  }
}

/* ============================================================
   13) ประกาศสำคัญตอนเข้าหน้าแรก (คงถ้อยคำเดิมของ 1.5 ทุกตัวอักษร)
   ============================================================ */
function showWelcomeNotice() {
  let seen = null;
  try { seen = sessionStorage.getItem('ef_notice'); } catch (e) {}
  if (seen === '1') return;
  try { sessionStorage.setItem('ef_notice', '1'); } catch (e) {}
  openM('<div class="mh"><h3>⚠️ ประกาศสำคัญ</h3></div>'
    + '<div class="mb"><p>กรุณา "งด" ให้ข้อมูลผู้ขอรับบริการ "แทนผู้อื่น" '
    + 'เนื่องจากจะมีผลต่อการรับเอกสารและข้อความแจ้งเตือนทางอีเมล</p>'
    + '<button class="btn primary" onclick="closeM()">รับทราบ</button></div>');
}

/* ============================================================
   14) โหลด config + boot
   ============================================================ */
function paintTestBanner() {
  const b = $('testBanner');
  if (CFG && CFG.test_mode === true) {
    b.textContent = '🧪 ระบบอยู่ใน "โหมดทดสอบ" — อีเมลทุกฉบับถูกเปลี่ยนทางไปยังผู้ดูแลระบบ ผู้ยื่นจริงจะยังไม่ได้รับอีเมล';
    b.style.display = '';
  } else {
    b.style.display = 'none';
  }
}
async function loadConfig() {
  if (API_URL === API_PLACEHOLDER) return;
  try {
    CFG = await api('config');
    if (CFG && CFG.system_title) document.title = CFG.system_title + ' — ระบบรับคำขอออกใบเสร็จรับเงิน';
    hideBanner();
    paintTestBanner();
    render();
  } catch (err) {
    showBanner('เชื่อมต่อระบบไม่ได้: ' + (err.msg || 'เกิดข้อผิดพลาด') + ' — บางฟังก์ชันจะใช้ไม่ได้จนกว่าจะเชื่อมต่อสำเร็จ', true);
  }
}
function boot() {
  loadTokens();
  initTheme();

  $('ov').addEventListener('click', function (e) { if (e.target.id === 'ov') closeM(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeM(); });

  // ปุ่มนำทาง/สลับธีม/กล่องข้อเสนอแนะ (event delegation)
  document.addEventListener('click', function (e) {
    if (!e.target || typeof e.target.closest !== 'function') return;
    const out = e.target.closest('[data-act="signout"]');
    if (out) { e.preventDefault(); doSignOut(); return; }
    const fb = e.target.closest('[data-act="feedback"]');
    if (fb) { e.preventDefault(); openFeedback(); return; }
    const nav = e.target.closest('[data-page]');
    if (nav) {
      e.preventDefault();
      const pg = nav.dataset.page;
      if (pg === 'form' && FORM.step === 'done') FORM = newForm();
      go(pg);
      return;
    }
    const mode = e.target.closest('[data-mode]');
    if (mode) { toggleTheme(); return; }
  });

  window.addEventListener('popstate', renderFromUrl);

  if (API_URL === API_PLACEHOLDER) {
    showBanner('⚠️ ยังไม่ได้ตั้งค่า API_URL — ผู้ดูแลระบบต้องวาง /exec URL ในไฟล์ app.js ก่อน '
      + '(ดูขั้นตอนใน README_Phase2_วิธีติดตั้ง.md หมวด 14)');
  }

  renderFromUrl();   // วาดหน้าทันที (หน้าหลักเปิดดูได้แม้หลังบ้านยังไม่พร้อม)
  loadConfig();      // แล้วค่อยโหลด config มาเติม (async — ไม่บล็อกการแสดงผล)
  showWelcomeNotice();
}
boot();   // index.html โหลด app.js แบบ defer → DOM พร้อมแล้ว เรียกได้เลย
