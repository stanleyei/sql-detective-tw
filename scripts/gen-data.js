#!/usr/bin/env node
/**
 * 潮港市警局資料庫產生器
 *
 * 產出 js/engine/seed.js（瀏覽器端 sql.js 載入用的建表 + 資料 SQL）。
 * 所有資料皆為固定亂數種子產生的虛構內容；劇情關鍵列在檔案下半段以「手動釘入」方式覆寫，
 * 確保六個案件都能被 SQL 推理出唯一答案。改動任何劇情資料後須重新執行 `npm run data`
 * 與 `npm run tasks`（任務期望值會跟著資料改變）。
 */
const fs = require('fs');
const path = require('path');

// ---------- 固定亂數 ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20250914);
const ri = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const pad = (n, w = 2) => String(n).padStart(w, '0');

// ---------- 詞庫 ----------
const SURNAMES = ['陳', '林', '黃', '張', '李', '王', '吳', '劉', '蔡', '楊', '許', '鄭', '謝', '郭', '洪', '邱', '曾', '廖', '賴', '徐', '周', '葉', '蘇', '莊', '呂', '江', '何', '蕭', '羅', '高', '潘', '簡', '朱', '鍾', '游', '彭', '詹', '胡', '施', '沈'];
const GIVEN_M = ['志豪', '建宏', '俊傑', '家豪', '志明', '文傑', '宗翰', '承恩', '冠宇', '柏翰', '明哲', '偉倫', '國棟', '建豪', '弘毅', '子軒', '哲瑋', '育誠', '信宏', '博文', '仁傑', '嘉宏', '啟明', '世偉', '彥廷', '致遠', '皓翔', '軒宇', '睦恩', '冠霖'];
const GIVEN_F = ['雅婷', '淑芬', '佩君', '若蘭', '怡君', '美玲', '曉青', '詩涵', '宜蓁', '欣怡', '雅琪', '佳穎', '心怡', '筱涵', '靜宜', '婉婷', '曼玲', '芷若', '語彤', '沛珊', '思妤', '苡安', '瑞玲', '玉華', '惠美', '淨如', '亭妤', '宥希', '書瑜', '姿伶'];
const DISTRICTS = ['港東區', '港西區', '山城區', '中央區', '海濱區'];
const STREETS = {
  港東區: ['港東路', '漁市街', '燈塔路', '朝陽街'],
  港西區: ['港西路', '海濱路', '造船街', '西碼頭路'],
  山城區: ['山城路', '雲霧街', '階梯巷', '觀景路'],
  中央區: ['中央路', '市府路', '文化街', '光復路'],
  海濱區: ['海景大道', '沙灘路', '潮聲街', '海濱路'],
};
const CAR_BRANDS = ['Toyota', 'Honda', 'Nissan', 'Mazda', 'Ford', 'Tesla', 'BMW', 'Mercedes-Benz', 'Hyundai', 'Kia'];
const CAR_MODELS = {
  Toyota: ['Corolla Altis', 'RAV4', 'Yaris'], Honda: ['CR-V', 'Fit', 'HR-V'], Nissan: ['Kicks', 'Sentra'],
  Mazda: ['Mazda3', 'CX-5'], Ford: ['Focus', 'Kuga'], Tesla: ['Model 3', 'Model Y', 'Model S'],
  BMW: ['320i', 'X3'], 'Mercedes-Benz': ['C300', 'GLC'], Hyundai: ['Tucson', 'Elantra'], Kia: ['Sportage', 'Picanto'],
};
const MOTO_BRANDS = ['Kymco', 'SYM', 'Yamaha', 'Gogoro'];
const COLORS = ['白', '黑', '銀', '灰', '紅', '藍', '綠'];
const HAIR = ['黑', '棕', '灰白', '金', '紅'];
const STATIONS = ['潮港車站', '港東站', '港西站', '山城站', '中央公園站', '市政府站', '海濱站', '漁市站'];

function plate(letters = 3) {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < letters; i++) s += L[ri(0, L.length - 1)];
  return `${s}-${pad(ri(0, 9999), 4)}`;
}

// ---------- 主要人物（劇情釘入） ----------
// 這些人物會先佔用 person 表前段 id，方便釘入其他表的關聯資料。
const KEY_PEOPLE = [
  { key: 'mentor', name: '林曉青', gender: '女', birth: 1990, district: '中央區', street: '市府路', no: 12 },
  { key: 'chief', name: '陳大川', gender: '男', birth: 1968, district: '中央區', street: '市府路', no: 12 },
  { key: 'tech', name: '張哲', gender: '男', birth: 1998, district: '港東區', street: '朝陽街', no: 45 },
  // 第一章 夜市失竊
  { key: 'c1_culprit', name: '吳志豪', gender: '男', birth: 1996, district: '港東區', street: '漁市街', no: 77, phone: null },
  { key: 'c1_alt', name: '蘇建豪', gender: '男', birth: 1994, district: '港東區', street: '燈塔路', no: 18 },
  { key: 'c1_decoy_tall', name: '賴世偉', gender: '男', birth: 1988, district: '山城區', street: '山城路', no: 210 },
  { key: 'c1_decoy_black', name: '簡冠霖', gender: '男', birth: 1999, district: '港西區', street: '港西路', no: 31 },
  { key: 'c1_vendor', name: '洪美玲', gender: '女', birth: 1979, district: '港東區', street: '港東路', no: 150 },
  // 第二章 超商搶案
  { key: 'c2_culprit', name: '黃雅婷', gender: '女', birth: 1993, district: '港西區', street: '造船街', no: 66 },
  { key: 'c2_decoy_blue', name: '謝欣怡', gender: '女', birth: 1990, district: '港西區', street: '海濱路', no: 9 },
  { key: 'c2_decoy_male', name: '郭俊傑', gender: '男', birth: 1985, district: '海濱區', street: '沙灘路', no: 120 },
  { key: 'c2_decoy_early', name: '周佳穎', gender: '女', birth: 1997, district: '港西區', street: '西碼頭路', no: 5 },
  { key: 'c2_clerk', name: '許承恩', gender: '男', birth: 2004, district: '港西區', street: '港西路', no: 88 },
  // 第三章 捷運遺失物
  { key: 'c3_culprit', name: '李建宏', gender: '男', birth: 1987, district: '中央區', street: '光復路', no: 233 },
  { key: 'c3_station', name: '楊詩涵', gender: '女', birth: 1992, district: '中央區', street: '文化街', no: 41 },
  // 第四章 公司內鬼
  { key: 'c4_culprit', name: '周文傑', gender: '男', birth: 1991, district: '山城區', street: '觀景路', no: 58 },
  { key: 'c4_manager', name: '許國棟', gender: '男', birth: 1980, district: '山城區', street: '雲霧街', no: 102 },
  { key: 'c4_alibi1', name: '曾宜蓁', gender: '女', birth: 1995, district: '港東區', street: '港東路', no: 22 },
  { key: 'c4_alibi2', name: '蕭博文', gender: '男', birth: 1989, district: '中央區', street: '中央路', no: 199 },
  // 第六章 命案
  { key: 'c6_witness1', name: '郭淑芬', gender: '女', birth: 1972, district: '海濱區', street: '海濱路', no: 388 },
  { key: 'c6_witness2', name: '林佩君', gender: '女', birth: 1986, district: '中央區', street: '中央路', no: 64 },
  { key: 'c6_killer', name: '蔡明哲', gender: '男', birth: 1989, district: '港西區', street: '造船街', no: 140 },
  { key: 'c6_decoy_gym', name: '張偉倫', gender: '男', birth: 1991, district: '海濱區', street: '潮聲街', no: 27 },
  { key: 'c6_mastermind', name: '沈若蘭', gender: '女', birth: 1978, district: '海濱區', street: '海景大道', no: 1 },
  { key: 'c6_decoy_rich1', name: '朱曼玲', gender: '女', birth: 1982, district: '山城區', street: '觀景路', no: 300 },
  { key: 'c6_decoy_rich2', name: '鍾芷若', gender: '女', birth: 1975, district: '中央區', street: '市府路', no: 501 },
  { key: 'c6_victim', name: '游致遠', gender: '男', birth: 1983, district: '海濱區', street: '海景大道', no: 88 },
];

// ---------- person ----------
const persons = [];
const usedNames = new Set();
const P = {}; // key -> person id
KEY_PEOPLE.forEach((k, i) => {
  const id = i + 1;
  P[k.key] = id;
  usedNames.add(k.name);
  persons.push({
    id, name: k.name, gender: k.gender, birth_year: k.birth, district: k.district,
    street: k.street, house_no: k.no, phone: k.phone === null ? null : `09${pad(ri(10000000, 99999999), 8)}`,
    license_id: null,
  });
});
while (persons.length < 420) {
  const gender = rand() < 0.5 ? '男' : '女';
  const name = pick(SURNAMES) + pick(gender === '男' ? GIVEN_M : GIVEN_F);
  if (usedNames.has(name)) continue;
  usedNames.add(name);
  const district = pick(DISTRICTS);
  let street = pick(STREETS[district]);
  let no = ri(1, 350);
  // 保留海濱路最大門牌給第六章證人一
  if (street === '海濱路' && no >= 380) no = ri(1, 300);
  // 保留「姓林、住中央路」給第六章證人二
  if (name.startsWith('林') && street === '中央路') street = '文化街';
  persons.push({
    id: persons.length + 1, name, gender, birth_year: ri(1955, 2006), district, street, house_no: no,
    phone: rand() < 0.08 ? null : `09${pad(ri(10000000, 99999999), 8)}`, license_id: null,
  });
}
const byId = (id) => persons[id - 1];

// ---------- driver_license ----------
const licenses = [];
function addLicense(personId, over = {}) {
  const p = byId(personId);
  const isMoto = over.vehicle_type ? over.vehicle_type === '機車' : rand() < 0.45;
  const brand = over.car_brand || (isMoto ? pick(MOTO_BRANDS) : pick(CAR_BRANDS));
  const model = over.car_model || (isMoto ? '' : pick(CAR_MODELS[brand]));
  const lic = {
    id: 10000 + licenses.length + 1,
    person_id: personId,
    gender: p.gender,
    height_cm: over.height_cm || (p.gender === '男' ? ri(160, 188) : ri(150, 175)),
    hair_color: over.hair_color || (rand() < 0.85 ? '黑' : pick(HAIR)),
    vehicle_type: isMoto ? '機車' : '汽車',
    plate_number: over.plate_number || plate(3),
    car_brand: brand,
    car_model: model,
    car_color: over.car_color || pick(COLORS),
    issue_date: `${ri(2010, 2024)}-${pad(ri(1, 12))}-${pad(ri(1, 28))}`,
  };
  licenses.push(lic);
  p.license_id = lic.id;
  return lic;
}
// 劇情釘入
addLicense(P.c1_culprit, { vehicle_type: '機車', plate_number: 'MKJ-5821', car_color: '白', height_cm: 178 });
addLicense(P.c1_alt, { vehicle_type: '機車', plate_number: 'MKJ-3390', car_color: '白', height_cm: 176 });
addLicense(P.c1_decoy_tall, { vehicle_type: '汽車', plate_number: 'MKJ-7710', car_color: '白', height_cm: 185 });
addLicense(P.c1_decoy_black, { vehicle_type: '機車', plate_number: 'MKJ-1010', car_color: '黑', height_cm: 177 });
addLicense(P.c2_culprit, { vehicle_type: '汽車', plate_number: 'RBK-7528', car_color: '銀', car_brand: 'Toyota', car_model: 'Yaris' });
addLicense(P.c2_decoy_blue, { vehicle_type: '汽車', plate_number: 'TXA-2528', car_color: '藍' });
addLicense(P.c2_decoy_male, { vehicle_type: '汽車', plate_number: 'QWE-9528', car_color: '銀' });
addLicense(P.c2_decoy_early, { vehicle_type: '汽車', plate_number: 'LLP-0528', car_color: '銀' });
addLicense(P.c4_manager, { vehicle_type: '汽車' });
addLicense(P.c4_culprit, { vehicle_type: '機車' });
addLicense(P.c6_killer, { vehicle_type: '汽車', plate_number: 'KHT-4271', car_color: '黑', height_cm: 180 });
addLicense(P.c6_decoy_gym, { vehicle_type: '汽車', plate_number: 'PQR-4211', car_color: '灰' });
addLicense(P.c6_mastermind, { vehicle_type: '汽車', car_brand: 'Tesla', car_model: 'Model S', car_color: '紅', hair_color: '紅', height_cm: 166 });
addLicense(P.c6_decoy_rich1, { vehicle_type: '汽車', car_brand: 'Tesla', car_model: 'Model S', car_color: '白', hair_color: '紅', height_cm: 167 });
addLicense(P.c6_decoy_rich2, { vehicle_type: '汽車', car_brand: 'Tesla', car_model: 'Model S', car_color: '黑', hair_color: '紅', height_cm: 165 });
addLicense(P.c6_victim, { vehicle_type: '汽車', car_brand: 'BMW' });
// 一般民眾
for (const p of persons) {
  if (p.license_id) continue;
  if (p.birth_year > 2006) continue;
  if (rand() < 0.7) addLicense(p.id);
}
// 保證 MKJ 開頭沒有其他白色 175-180 機車
for (const l of licenses) {
  if (l.plate_number.startsWith('MKJ') && !['MKJ-5821', 'MKJ-3390', 'MKJ-7710', 'MKJ-1010'].includes(l.plate_number)) {
    l.plate_number = 'ZK' + l.plate_number.slice(2);
  }
  if (l.plate_number.endsWith('528') && !['RBK-7528', 'TXA-2528', 'QWE-9528', 'LLP-0528'].includes(l.plate_number)) {
    l.plate_number = l.plate_number.slice(0, -1) + '9';
  }
  if (/H.*-42\d\d$/.test(l.plate_number) && l.plate_number !== 'KHT-4271') {
    l.plate_number = l.plate_number.replace('-42', '-52');
  }
  if (l.car_model === 'Model S' && ![P.c6_mastermind, P.c6_decoy_rich1, P.c6_decoy_rich2].includes(l.person_id)) {
    l.car_model = 'Model 3';
  }
}

// ---------- crime_report ----------
const CRIME_TYPES = ['竊盜', '搶奪', '詐欺', '毀損', '交通事故', '噪音', '遺失物', '侵占'];
const reports = [];
function addReport(r) { reports.push({ id: reports.length + 1, ...r }); return reports[reports.length - 1]; }
for (let i = 0; i < 110; i++) {
  const m = ri(1, 8);
  addReport({
    report_date: `2025-${pad(m)}-${pad(ri(1, 28))}`,
    crime_type: pick(CRIME_TYPES),
    district: pick(DISTRICTS),
    description: pick([
      '民眾報案表示機車停放路邊遭刮傷。', '住戶反映深夜有施工噪音。', '通報路口發生兩車擦撞，無人受傷。',
      '店家表示遭到假網購詐騙匯款。', '公園長椅遭人噴漆。', '民眾遺失皮夾，內有證件。',
      '停車場車輛遭竊，尚無目擊者。', '住戶反映鄰居長期堆放雜物。', '超商店員通報客人未付款離去。',
    ]),
  });
}
const R = {};
R.c1 = addReport({ report_date: '2025-03-08', crime_type: '竊盜', district: '港東區', description: '港東夜市「金鑫手機配件」攤位於晚間 21:30 左右遭竊，損失約 3 萬元。目擊者表示嫌犯身高約 175 到 180 公分，騎白色機車逃逸，車牌開頭為 MKJ。' });
R.c2 = addReport({ report_date: '2025-04-12', crime_type: '搶奪', district: '港西區', description: '港西區「海濱門市」便利商店於打烊前約 40 分鐘，遭一名戴口罩女子搶走收銀機現金。店員記得對方開一輛銀色汽車，車牌後三碼為 528。' });
R.c3 = addReport({ report_date: '2025-05-20', crime_type: '侵占', district: '中央區', description: '捷運遺失物中心通報：近兩個月有多件高價遺失物被同一人以不同名義冒領，站務員懷疑為有組織的冒領行為，請協助從資料庫中找出可疑領取人。' });
R.c4 = addReport({ report_date: '2025-06-21', crime_type: '侵占', district: '山城區', description: '潮港科技股份有限公司通報：6 月 20 日 22:00 至 23:00 之間，機房內的客戶資料被非法複製外流。門禁紀錄顯示有人刷卡進入機房，請比對員工與門禁資料。' });
R.c6 = addReport({ report_date: '2025-08-15', crime_type: '命案', district: '海濱區', description: '海景大道「海景大樓」發生命案，死者為住戶游致遠。現場有兩名目擊者：第一位住在海濱路門牌號碼最大的那一戶；第二位姓林，住在中央路。' });
reports.sort((a, b) => (a.report_date < b.report_date ? -1 : 1));
reports.forEach((r, i) => { r.id = i + 1; });
const reportId = (k) => R[k].id;

// ---------- store / store_sale ----------
const stores = [
  { id: 1, name: '金鑫手機配件', kind: '夜市攤位', district: '港東區', owner_id: P.c1_vendor, open_time: '17:00', close_time: '23:30' },
  { id: 2, name: '阿婆蚵仔煎', kind: '夜市攤位', district: '港東區', owner_id: null, open_time: '17:00', close_time: '23:00' },
  { id: 3, name: '港東珍珠奶茶', kind: '夜市攤位', district: '港東區', owner_id: null, open_time: '16:00', close_time: '23:30' },
  { id: 4, name: '燈塔烤魷魚', kind: '夜市攤位', district: '港東區', owner_id: null, open_time: '17:30', close_time: '23:00' },
  { id: 5, name: '潮流服飾攤', kind: '夜市攤位', district: '港東區', owner_id: null, open_time: '17:00', close_time: '23:30' },
  { id: 6, name: '海濱門市', kind: '便利商店', district: '港西區', owner_id: null, open_time: '06:00', close_time: '23:30' },
  { id: 7, name: '港西門市', kind: '便利商店', district: '港西區', owner_id: null, open_time: '00:00', close_time: '24:00' },
  { id: 8, name: '中央門市', kind: '便利商店', district: '中央區', owner_id: null, open_time: '00:00', close_time: '24:00' },
  { id: 9, name: '山城門市', kind: '便利商店', district: '山城區', owner_id: null, open_time: '07:00', close_time: '23:00' },
  { id: 10, name: '海景門市', kind: '便利商店', district: '海濱區', owner_id: null, open_time: '00:00', close_time: '24:00' },
  { id: 11, name: '漁市早餐店', kind: '小吃', district: '港東區', owner_id: null, open_time: '05:30', close_time: '11:00' },
  { id: 12, name: '雲霧咖啡', kind: '咖啡店', district: '山城區', owner_id: null, open_time: '09:00', close_time: '18:00' },
  { id: 13, name: '市府書店', kind: '書店', district: '中央區', owner_id: null, open_time: '10:00', close_time: '21:00' },
  { id: 14, name: '潮聲海鮮餐廳', kind: '餐廳', district: '海濱區', owner_id: null, open_time: '11:00', close_time: '22:00' },
  { id: 15, name: '沙灘冰店', kind: '小吃', district: '海濱區', owner_id: null, open_time: '11:00', close_time: '20:00' },
];
for (const s of stores) {
  if (s.owner_id === null) s.owner_id = ri(30, 420);
}
const ITEMS = {
  夜市攤位: [['手機殼', 250], ['充電線', 199], ['行動電源', 890], ['耳機', 1290], ['蚵仔煎', 80], ['珍珠奶茶', 60], ['烤魷魚', 150], ['T 恤', 390]],
  便利商店: [['咖啡', 55], ['御飯糰', 39], ['礦泉水', 25], ['便當', 89], ['啤酒', 65], ['泡麵', 49]],
  小吃: [['蛋餅', 40], ['豆漿', 25], ['芒果冰', 120]],
  咖啡店: [['拿鐵', 140], ['手沖咖啡', 180], ['司康', 90]],
  書店: [['小說', 320], ['雜誌', 199], ['文具', 85]],
  餐廳: [['清蒸魚', 680], ['炒海瓜子', 320], ['海鮮粥', 180]],
};
const sales = [];
for (let i = 0; i < 700; i++) {
  const s = pick(stores);
  const [item, price] = pick(ITEMS[s.kind]);
  const qty = ri(1, 4);
  sales.push({
    id: sales.length + 1, store_id: s.id,
    sale_date: `2025-${pad(ri(1, 8))}-${pad(ri(1, 28))}`,
    item_name: item, quantity: qty, amount: price * qty,
    pay_method: pick(['現金', '現金', '悠遊卡', '信用卡', 'LINE Pay']),
  });
}
// 第一章 ORDER BY 任務：金鑫手機配件 3/6~3/8 的營業紀錄
[['2025-03-06', '行動電源', 3, 2670], ['2025-03-07', '耳機', 2, 2580], ['2025-03-08', '手機殼', 6, 1500], ['2025-03-08', '耳機', 5, 6450]].forEach(([d, it, q, a]) => {
  sales.push({ id: sales.length + 1, store_id: 1, sale_date: d, item_name: it, quantity: q, amount: a, pay_method: '現金' });
});

// ---------- cctv_log ----------
const CAM = {
  港東區: ['港東夜市入口', '漁市街口', '燈塔路停車場'],
  港西區: ['海濱路與造船街口', '海濱門市前', '港西路橋頭'],
  山城區: ['山城路隧道口', '觀景路口'],
  中央區: ['市府路口', '中央公園北側'],
  海濱區: ['海景大道口', '沙灘路停車場'],
};
const plates = licenses.map((l) => l.plate_number);
const cctv = [];
function addCctv(c) { cctv.push({ id: cctv.length + 1, ...c }); }
for (let i = 0; i < 320; i++) {
  const d = pick(DISTRICTS);
  addCctv({
    camera_location: pick(CAM[d]), district: d,
    capture_time: `2025-${pad(ri(1, 8))}-${pad(ri(1, 28))} ${pad(ri(0, 23))}:${pad(ri(0, 59))}:${pad(ri(0, 59))}`,
    plate_number: rand() < 0.8 ? pick(plates) : null,
    note: pick(['車輛通過', '車輛通過', '車輛停靠', '行人穿越', '車輛迴轉']),
  });
}
// 第一章
addCctv({ camera_location: '港東夜市入口', district: '港東區', capture_time: '2025-03-08 21:12:40', plate_number: 'MKJ-5821', note: '白色機車停靠' });
addCctv({ camera_location: '漁市街口', district: '港東區', capture_time: '2025-03-08 21:38:05', plate_number: 'MKJ-5821', note: '白色機車高速離開' });
addCctv({ camera_location: '燈塔路停車場', district: '港東區', capture_time: '2025-03-08 19:02:11', plate_number: 'MKJ-3390', note: '白色機車停靠' });
// 第二章：打烊 23:30，案發約 22:50
addCctv({ camera_location: '海濱門市前', district: '港西區', capture_time: '2025-04-12 22:41:18', plate_number: 'RBK-7528', note: '銀色汽車停靠' });
addCctv({ camera_location: '海濱門市前', district: '港西區', capture_time: '2025-04-12 22:53:02', plate_number: 'RBK-7528', note: '銀色汽車快速離開' });
addCctv({ camera_location: '海濱路與造船街口', district: '港西區', capture_time: '2025-04-12 22:55:47', plate_number: 'RBK-7528', note: '車輛通過' });
addCctv({ camera_location: '海濱門市前', district: '港西區', capture_time: '2025-04-12 21:10:30', plate_number: 'TXA-2528', note: '藍色汽車停靠' });
addCctv({ camera_location: '海濱門市前', district: '港西區', capture_time: '2025-04-12 22:47:15', plate_number: 'QWE-9528', note: '銀色汽車停靠' });
addCctv({ camera_location: '海濱門市前', district: '港西區', capture_time: '2025-04-12 19:05:22', plate_number: 'LLP-0528', note: '銀色汽車停靠' });
// 第六章
addCctv({ camera_location: '海景大道口', district: '海濱區', capture_time: '2025-08-15 20:48:10', plate_number: 'KHT-4271', note: '黑色汽車停靠' });
addCctv({ camera_location: '海景大道口', district: '海濱區', capture_time: '2025-08-15 21:23:55', plate_number: 'KHT-4271', note: '黑色汽車離開' });
// id 刻意不照時間排：INTEGER PRIMARY KEY 的表不加 ORDER BY 時依 id 輸出，
// 若 id 與時間同序，「依時間排序」的任務漏寫 ORDER BY 也會過關。
// 洗牌用獨立亂數源，不消耗 rand，以免後續資料表的內容跟著改變。
const cctvRand = mulberry32(20250412);
for (let i = cctv.length - 1; i > 0; i--) {
  const j = Math.floor(cctvRand() * (i + 1));
  [cctv[i], cctv[j]] = [cctv[j], cctv[i]];
}
cctv.forEach((c, i) => { c.id = i + 1; });

// ---------- transit_card / transit_log ----------
const cards = [];
const cardOf = {};
function addCard(personId, type) {
  const id = `TC${pad(cards.length + 1, 5)}`;
  cards.push({ card_id: id, person_id: personId, card_type: type || pick(['一般卡', '一般卡', '學生卡', '敬老卡']) });
  if (personId) cardOf[personId] = id;
  return id;
}
addCard(P.c3_culprit, '一般卡');
addCard(P.c4_manager, '一般卡');
addCard(P.c4_culprit, '一般卡');
addCard(P.c6_witness2, '一般卡');
for (const p of persons) {
  if (cardOf[p.id]) continue;
  if (rand() < 0.6) addCard(p.id, p.birth_year > 2003 ? '學生卡' : p.birth_year < 1960 ? '敬老卡' : '一般卡');
}
for (let i = 0; i < 25; i++) addCard(null, '一般卡'); // 未記名卡
const transit = [];
function addTrip(cardId, station, direction, t) { transit.push({ id: transit.length + 1, card_id: cardId, station, direction, log_time: t }); }
for (let i = 0; i < 900; i++) {
  const c = pick(cards);
  const d = `2025-${pad(ri(1, 8))}-${pad(ri(1, 28))}`;
  const h = ri(6, 22);
  const m = ri(0, 59);
  const inSt = pick(STATIONS);
  let outSt = pick(STATIONS);
  if (outSt === inSt) outSt = STATIONS[(STATIONS.indexOf(inSt) + 1) % STATIONS.length];
  addTrip(c.card_id, inSt, '進站', `${d} ${pad(h)}:${pad(m)}:00`);
  addTrip(c.card_id, outSt, '出站', `${d} ${pad(h)}:${pad(Math.min(m + ri(12, 35), 59))}:00`);
}
// 第四章：經理 6/20 22:05 山城站進、22:35 港東站出
addTrip(cardOf[P.c4_manager], '山城站', '進站', '2025-06-20 22:05:00');
addTrip(cardOf[P.c4_manager], '港東站', '出站', '2025-06-20 22:35:00');

// ---------- lost_item ----------
const LOST = [['黑色雨傘', '雨具', 300], ['藍色摺疊傘', '雨具', 450], ['iPhone 15', '3C', 28000], ['Samsung 手機', '3C', 18000], ['MacBook Air', '3C', 36000],
  ['Apple Watch', '3C', 12000], ['皮夾', '錢包', 1500], ['學生證', '證件', 0], ['悠遊卡', '票卡', 100], ['耳機', '3C', 5000], ['鑰匙圈', '雜物', 100],
  ['保溫瓶', '雜物', 600], ['書包', '包包', 1200], ['名牌手提包', '包包', 32000], ['相機', '3C', 24000], ['眼鏡', '雜物', 3000], ['行動電源', '3C', 900]];
const lost = [];
function addLost(l) { lost.push({ id: lost.length + 1, ...l }); }
for (let i = 0; i < 130; i++) {
  const [name, cat, val] = pick(LOST);
  const found = `2025-${pad(ri(1, 8))}-${pad(ri(1, 28))}`;
  const claimed = rand() < 0.45;
  let claimant = null;
  if (claimed) {
    claimant = ri(30, 420);
  }
  addLost({ item_name: name, category: cat, station: pick(STATIONS), found_date: found, est_value: val, status: claimed ? '已領回' : '保管中', claimed_by: claimant, claimed_date: claimed ? found.slice(0, 8) + pad(Math.min(28, parseInt(found.slice(8)) + ri(1, 6))) : null });
}
// 保證一般人每人最多領 2 件
const claimCount = {};
for (const l of lost) {
  if (!l.claimed_by) continue;
  claimCount[l.claimed_by] = (claimCount[l.claimed_by] || 0) + 1;
  if (claimCount[l.claimed_by] > 2) { l.status = '保管中'; l.claimed_by = null; l.claimed_date = null; }
}
// 第三章：李建宏冒領 7 件高價品
[['iPhone 15', '3C', 28000, '港東站', '2025-04-03', '2025-04-05'], ['MacBook Air', '3C', 36000, '中央公園站', '2025-04-10', '2025-04-11'],
  ['名牌手提包', '包包', 32000, '市政府站', '2025-04-18', '2025-04-19'], ['相機', '3C', 24000, '海濱站', '2025-04-25', '2025-04-26'],
  ['Apple Watch', '3C', 12000, '港東站', '2025-05-02', '2025-05-03'], ['Samsung 手機', '3C', 18000, '潮港車站', '2025-05-09', '2025-05-12'],
  ['耳機', '3C', 5000, '山城站', '2025-05-15', '2025-05-16']].forEach(([n, c, v, st, f, cd]) => {
  addLost({ item_name: n, category: c, station: st, found_date: f, est_value: v, status: '已領回', claimed_by: P.c3_culprit, claimed_date: cd });
  // 領取當日的捷運進出站紀錄
  addTrip(cardOf[P.c3_culprit], st, '進站', `${cd} ${pad(ri(10, 16))}:${pad(ri(0, 59))}:00`);
});
transit.sort((a, b) => (a.log_time < b.log_time ? -1 : 1));
transit.forEach((t, i) => { t.id = i + 1; });

// ---------- company / employee / access_log ----------
const companies = [
  { id: 1, name: '潮港科技股份有限公司', industry: '軟體', district: '山城區', founded_year: 2012 },
  { id: 2, name: '海濱物流', industry: '物流', district: '海濱區', founded_year: 2005 },
  { id: 3, name: '港東漁業合作社', industry: '漁業', district: '港東區', founded_year: 1988 },
  { id: 4, name: '中央銀行潮港分行', industry: '金融', district: '中央區', founded_year: 1995 },
  { id: 5, name: '雲霧設計工作室', industry: '設計', district: '山城區', founded_year: 2018 },
  { id: 6, name: '潮港造船', industry: '製造', district: '港西區', founded_year: 1976 },
  { id: 7, name: '海景飯店', industry: '觀光', district: '海濱區', founded_year: 2001 },
  { id: 8, name: '市府文化基金會', industry: '非營利', district: '中央區', founded_year: 2009 },
];
const DEPTS = ['研發部', '業務部', '人資部', '財務部', '資訊部'];
const TITLES = ['工程師', '資深工程師', '專員', '資深專員', '助理'];
const employees = [];
const empOf = {};
function addEmp(e) { const emp = { id: employees.length + 1, ...e }; employees.push(emp); empOf[e.person_id] = emp.id; return emp; }
// 潮港科技關鍵員工
const mgr = addEmp({ person_id: P.c4_manager, company_id: 1, department: '研發部', title: '經理', hire_date: '2015-03-02', salary: 120000, manager_id: null });
addEmp({ person_id: P.c4_culprit, company_id: 1, department: '研發部', title: '資深工程師', hire_date: '2019-07-15', salary: 78000, manager_id: mgr.id });
addEmp({ person_id: P.c4_alibi1, company_id: 1, department: '研發部', title: '工程師', hire_date: '2022-01-10', salary: 62000, manager_id: mgr.id });
addEmp({ person_id: P.c4_alibi2, company_id: 1, department: '研發部', title: '工程師', hire_date: '2021-05-03', salary: 65000, manager_id: mgr.id });
const usedEmp = new Set([P.c4_manager, P.c4_culprit, P.c4_alibi1, P.c4_alibi2]);
const deptMgr = { 研發部: mgr.id };
for (const c of companies) {
  const n = c.id === 1 ? 26 : ri(6, 14);
  for (let i = 0; i < n; i++) {
    let pid;
    do { pid = ri(30, 420); } while (usedEmp.has(pid) || byId(pid).birth_year > 2003);
    usedEmp.add(pid);
    const dept = pick(DEPTS);
    let managerId = null;
    if (c.id === 1) {
      if (!deptMgr[dept]) {
        const m = addEmp({ person_id: pid, company_id: 1, department: dept, title: '經理', hire_date: `${ri(2013, 2018)}-${pad(ri(1, 12))}-01`, salary: ri(100000, 130000), manager_id: null });
        deptMgr[dept] = m.id;
        continue;
      }
      managerId = deptMgr[dept];
    }
    addEmp({ person_id: pid, company_id: c.id, department: dept, title: pick(TITLES), hire_date: `${ri(2015, 2024)}-${pad(ri(1, 12))}-${pad(ri(1, 28))}`, salary: ri(32000, 85000) * 1, manager_id: managerId });
  }
}
const access = [];
function addAccess(a) { access.push({ id: access.length + 1, ...a }); }
const DOORS = ['大門', '研發區', '機房', '倉庫'];
const cpEmps = employees.filter((e) => e.company_id === 1);
for (let i = 0; i < 600; i++) {
  const e = pick(cpEmps);
  const d = `2025-06-${pad(ri(2, 24))}`;
  if (d === '2025-06-20') continue; // 6/20 另行釘入
  const h = ri(8, 19);
  addAccess({ employee_id: e.id, door: pick(DOORS), action: '進入', event_time: `${d} ${pad(h)}:${pad(ri(0, 59))}:00` });
  addAccess({ employee_id: e.id, door: '大門', action: '離開', event_time: `${d} ${pad(Math.min(h + ri(1, 9), 23))}:${pad(ri(0, 59))}:00` });
}
// 6/20 白天正常紀錄（研發部含不在場證明者）
for (const e of cpEmps) {
  if (rand() < 0.15) continue;
  addAccess({ employee_id: e.id, door: '大門', action: '進入', event_time: `2025-06-20 ${pad(ri(8, 9))}:${pad(ri(0, 59))}:00` });
  if (e.person_id !== P.c4_culprit) addAccess({ employee_id: e.id, door: '大門', action: '離開', event_time: `2025-06-20 ${pad(ri(17, 19))}:${pad(ri(0, 59))}:00` });
}
// 6/20 晚上：周文傑晚上進入大門，以經理卡刷機房
addAccess({ employee_id: empOf[P.c4_culprit], door: '大門', action: '進入', event_time: '2025-06-20 21:55:00' });
addAccess({ employee_id: mgr.id, door: '研發區', action: '進入', event_time: '2025-06-20 22:12:00' });
addAccess({ employee_id: mgr.id, door: '機房', action: '進入', event_time: '2025-06-20 22:17:00' });
addAccess({ employee_id: mgr.id, door: '機房', action: '離開', event_time: '2025-06-20 22:41:00' });
addAccess({ employee_id: empOf[P.c4_culprit], door: '大門', action: '離開', event_time: '2025-06-20 23:05:00' });
// 另一名業務部員工晚上加班，僅在業務區（干擾項）
const salesEmp = cpEmps.find((e) => e.department === '業務部' && e.title !== '經理');
addAccess({ employee_id: salesEmp.id, door: '大門', action: '進入', event_time: '2025-06-20 20:30:00' });
addAccess({ employee_id: salesEmp.id, door: '大門', action: '離開', event_time: '2025-06-20 22:20:00' });
access.sort((a, b) => (a.event_time < b.event_time ? -1 : 1));
access.forEach((a, i) => { a.id = i + 1; });

// ---------- gym_member / gym_checkin ----------
const gym = [];
const gymOf = {};
function gymId() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += L[ri(0, L.length - 1)];
  return s;
}
function addGym(personId, over = {}) {
  const p = byId(personId);
  const m = { id: over.id || gymId(), person_id: personId, name: p.name, membership_status: over.status || pick(['一般', '一般', '銀卡', '金卡']), join_date: over.join || `${ri(2019, 2025)}-${pad(ri(1, 12))}-${pad(ri(1, 28))}` };
  gym.push(m); gymOf[personId] = m.id; return m;
}
addGym(P.c6_killer, { id: '48Z7A', status: '金卡', join_date: '2023-02-01' });
addGym(P.c6_decoy_gym, { id: '48Z55', status: '金卡', join_date: '2024-06-10' });
addGym(P.c1_alt, { status: '銀卡' });
addGym(P.c6_witness2, { status: '一般' });
for (const p of persons) {
  if (gymOf[p.id]) continue;
  if (rand() < 0.3) {
    const m = addGym(p.id);
    if (m.id.startsWith('48Z')) m.id = '58Z' + m.id.slice(3);
  }
}
const gymCheck = [];
function addCheck(memberId, date, tin, tout) { gymCheck.push({ id: gymCheck.length + 1, membership_id: memberId, checkin_date: date, checkin_time: tin, checkout_time: tout }); }
for (let i = 0; i < 700; i++) {
  const m = pick(gym);
  const d = `2025-${pad(ri(1, 8))}-${pad(ri(1, 28))}`;
  if (d === '2025-08-09' || d === '2025-03-08') continue;
  const h = ri(6, 21);
  addCheck(m.id, d, `${pad(h)}:${pad(ri(0, 59))}`, `${pad(h + 1)}:${pad(ri(0, 59))}`);
}
// 第一章：蘇建豪 3/8 21:00-22:30 在健身房
addCheck(gymOf[P.c1_alt], '2025-03-08', '21:00', '22:30');
// 第六章：8/9 打卡（含兩位 48Z 金卡與證人二）
addCheck('48Z7A', '2025-08-09', '16:00', '17:00');
addCheck('48Z55', '2025-08-09', '16:10', '17:20');
addCheck(gymOf[P.c6_witness2], '2025-08-09', '16:05', '17:00');
for (let i = 0; i < 6; i++) { const m = pick(gym); if (!m.id.startsWith('48Z')) addCheck(m.id, '2025-08-09', '18:00', '19:00'); }

// ---------- event_checkin ----------
const EVENTS = ['潮港交響音樂會', '港東夜市美食節', '海濱馬拉松', '山城茶會', '中央公園電影夜', '漁市文化祭'];
const events = [];
function addEvent(personId, name, date) { events.push({ id: events.length + 1, person_id: personId, event_name: name, event_date: date }); }
for (let i = 0; i < 500; i++) {
  const pid = ri(1, 420);
  if ([P.c6_mastermind, P.c6_decoy_rich1, P.c6_decoy_rich2].includes(pid)) continue;
  addEvent(pid, pick(EVENTS), `2025-${pad(ri(1, 8))}-${pad(ri(1, 28))}`);
}
addEvent(P.c6_mastermind, '潮港交響音樂會', '2025-07-05');
addEvent(P.c6_mastermind, '潮港交響音樂會', '2025-07-12');
addEvent(P.c6_mastermind, '潮港交響音樂會', '2025-07-26');
addEvent(P.c6_decoy_rich1, '潮港交響音樂會', '2025-07-12');
addEvent(P.c6_decoy_rich1, '海濱馬拉松', '2025-07-20');
addEvent(P.c6_decoy_rich2, '潮港交響音樂會', '2025-06-14');
addEvent(P.c6_decoy_rich2, '潮港交響音樂會', '2025-07-19');
addEvent(P.c6_decoy_rich2, '山城茶會', '2025-07-26');

// ---------- income ----------
const income = [];
for (const p of persons) {
  if (p.birth_year > 2003) continue;
  let v = ri(28, 120) * 10000;
  if (p.id === P.c6_mastermind) v = 12800000;
  if (p.id === P.c6_decoy_rich1) v = 9600000;
  if (p.id === P.c6_decoy_rich2) v = 15200000;
  income.push({ person_id: p.id, annual_income: v });
}

// ---------- interview ----------
const interviews = [];
function addInterview(personId, caseKey, text) { interviews.push({ id: interviews.length + 1, person_id: personId, report_id: reportId(caseKey), transcript: text }); }
addInterview(P.c1_vendor, 'c1', '大約九點半，我轉身拿貨的時候聽到展示盒被打開的聲音，回頭就看到一個穿黑色外套的男生跑掉，跳上一台白色機車，車牌開頭是 MKJ，人大概比我高一個頭，我 160。');
addInterview(P.c1_culprit, 'c1', '3 月 8 日晚上？我……我只是去夜市逛逛，沒有買東西，也沒有停留很久。我沒有做什麼。');
addInterview(P.c1_alt, 'c1', '3 月 8 日晚上九點到十點半我都在潮港健身上課，健身房有打卡紀錄，你們可以查。');
addInterview(P.c2_clerk, 'c2', '打烊前大概四十分鐘，一個戴口罩的女生衝進來，把收銀機裡的錢拿走就跑。她開一台銀色的車，我只記得車牌最後三碼是 528。');
addInterview(P.c2_culprit, 'c2', '我那天晚上是有去海濱門市買東西，但我沒有搶錢，店員一定是認錯人了。');
addInterview(P.c3_station, 'c3', '這兩個月一直有人來領高價的遺失物，每次簽的名字都不一樣，但字跡看起來很像，而且每次都能講出正確的特徵。系統裡有登記領取人的身分證字號對應的市民編號，麻煩你們查一下。');
addInterview(P.c4_manager, 'c4', '6 月 20 日我六點多就下班了，搭捷運從山城站回家。門禁卡……我好像放在辦公桌抽屜裡沒有帶走。');
addInterview(P.c4_culprit, 'c4', '我那天加班到晚上十點就回家了，之後的事我不知道。機房我沒有權限進去。');
addInterview(P.c4_alibi1, 'c4', '我 20 日下午六點準時下班，去港東夜市吃東西，沒有再回公司。');
addInterview(P.c6_witness1, 'c6', '我看到一個男人從海景大樓跑出來，背著「潮港健身」的黑色運動包，只有金卡會員才有那種包。他把包甩上肩膀時我看到會員卡，卡號開頭是「48Z」。他上了一輛黑色汽車，車牌前面的字母有一個 H，數字的部分是 42 開頭。');
addInterview(P.c6_witness2, 'c6', '我每週都去潮港健身。我認得那個人，8 月 9 日我在健身房做重訓的時候有看到他，他就在我旁邊那台器材。');
addInterview(P.c6_killer, 'c6', '我不會告訴你們她的名字。我只知道她很有錢，身高大概 165 到 168 公分，一頭紅色的頭髮，開一輛 Tesla Model S。她說她 7 月去聽了三次「潮港交響音樂會」，事情就是在那裡談的。');
addInterview(P.c6_mastermind, 'c6', '游先生？我當然認識，我們是鄰居。但我對他的事一無所知，那天晚上我在家聽音樂。');
// 一般筆錄
for (let i = 0; i < 40; i++) {
  const r = pick(reports.filter((x) => !Object.values(R).includes(x)));
  addInterview(ri(30, 420), Object.keys(R).find((k) => R[k] === r) || 'c1', pick(['我什麼都沒看到。', '當時我在上班，不清楚狀況。', '有聽到很大的聲音，但沒有出去看。', '我只是路過，什麼都不知道。']));
  interviews[interviews.length - 1].report_id = r.id;
}

// ---------- 輸出 SQL ----------
const esc = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
};
function insertRows(table, cols, rows) {
  const out = [];
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map((r) => `(${cols.map((c) => esc(r[c])).join(',')})`).join(',\n');
    out.push(`INSERT INTO ${table} (${cols.join(',')}) VALUES\n${chunk};`);
  }
  return out.join('\n');
}

const schema = `
CREATE TABLE crime_report (
  id INTEGER PRIMARY KEY,
  report_date TEXT NOT NULL,
  crime_type TEXT NOT NULL,
  district TEXT NOT NULL,
  description TEXT
);
CREATE TABLE person (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  gender TEXT,
  birth_year INTEGER,
  district TEXT,
  street TEXT,
  house_no INTEGER,
  phone TEXT,
  license_id INTEGER
);
CREATE TABLE driver_license (
  id INTEGER PRIMARY KEY,
  person_id INTEGER,
  gender TEXT,
  height_cm INTEGER,
  hair_color TEXT,
  vehicle_type TEXT,
  plate_number TEXT,
  car_brand TEXT,
  car_model TEXT,
  car_color TEXT,
  issue_date TEXT
);
CREATE TABLE store (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT,
  district TEXT,
  owner_id INTEGER,
  open_time TEXT,
  close_time TEXT
);
CREATE TABLE store_sale (
  id INTEGER PRIMARY KEY,
  store_id INTEGER NOT NULL,
  sale_date TEXT NOT NULL,
  item_name TEXT,
  quantity INTEGER,
  amount INTEGER,
  pay_method TEXT
);
CREATE TABLE cctv_log (
  id INTEGER PRIMARY KEY,
  camera_location TEXT,
  district TEXT,
  capture_time TEXT NOT NULL,
  plate_number TEXT,
  note TEXT
);
CREATE TABLE transit_card (
  card_id TEXT PRIMARY KEY,
  person_id INTEGER,
  card_type TEXT
);
CREATE TABLE transit_log (
  id INTEGER PRIMARY KEY,
  card_id TEXT NOT NULL,
  station TEXT NOT NULL,
  direction TEXT NOT NULL,
  log_time TEXT NOT NULL
);
CREATE TABLE lost_item (
  id INTEGER PRIMARY KEY,
  item_name TEXT NOT NULL,
  category TEXT,
  station TEXT,
  found_date TEXT,
  est_value INTEGER,
  status TEXT,
  claimed_by INTEGER,
  claimed_date TEXT
);
CREATE TABLE company (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  industry TEXT,
  district TEXT,
  founded_year INTEGER
);
CREATE TABLE employee (
  id INTEGER PRIMARY KEY,
  person_id INTEGER NOT NULL,
  company_id INTEGER NOT NULL,
  department TEXT,
  title TEXT,
  hire_date TEXT,
  salary INTEGER,
  manager_id INTEGER
);
CREATE TABLE access_log (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL,
  door TEXT NOT NULL,
  action TEXT NOT NULL,
  event_time TEXT NOT NULL
);
CREATE TABLE gym_member (
  id TEXT PRIMARY KEY,
  person_id INTEGER,
  name TEXT,
  membership_status TEXT,
  join_date TEXT
);
CREATE TABLE gym_checkin (
  id INTEGER PRIMARY KEY,
  membership_id TEXT NOT NULL,
  checkin_date TEXT NOT NULL,
  checkin_time TEXT,
  checkout_time TEXT
);
CREATE TABLE event_checkin (
  id INTEGER PRIMARY KEY,
  person_id INTEGER NOT NULL,
  event_name TEXT NOT NULL,
  event_date TEXT NOT NULL
);
CREATE TABLE income (
  person_id INTEGER PRIMARY KEY,
  annual_income INTEGER
);
CREATE TABLE interview (
  id INTEGER PRIMARY KEY,
  person_id INTEGER NOT NULL,
  report_id INTEGER,
  transcript TEXT
);
CREATE TABLE solution (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  answer TEXT NOT NULL,
  result TEXT
);
`;

const data = [
  insertRows('crime_report', ['id', 'report_date', 'crime_type', 'district', 'description'], reports),
  insertRows('person', ['id', 'name', 'gender', 'birth_year', 'district', 'street', 'house_no', 'phone', 'license_id'], persons),
  insertRows('driver_license', ['id', 'person_id', 'gender', 'height_cm', 'hair_color', 'vehicle_type', 'plate_number', 'car_brand', 'car_model', 'car_color', 'issue_date'], licenses),
  insertRows('store', ['id', 'name', 'kind', 'district', 'owner_id', 'open_time', 'close_time'], stores),
  insertRows('store_sale', ['id', 'store_id', 'sale_date', 'item_name', 'quantity', 'amount', 'pay_method'], sales),
  insertRows('cctv_log', ['id', 'camera_location', 'district', 'capture_time', 'plate_number', 'note'], cctv),
  insertRows('transit_card', ['card_id', 'person_id', 'card_type'], cards),
  insertRows('transit_log', ['id', 'card_id', 'station', 'direction', 'log_time'], transit),
  insertRows('lost_item', ['id', 'item_name', 'category', 'station', 'found_date', 'est_value', 'status', 'claimed_by', 'claimed_date'], lost),
  insertRows('company', ['id', 'name', 'industry', 'district', 'founded_year'], companies),
  insertRows('employee', ['id', 'person_id', 'company_id', 'department', 'title', 'hire_date', 'salary', 'manager_id'], employees),
  insertRows('access_log', ['id', 'employee_id', 'door', 'action', 'event_time'], access),
  insertRows('gym_member', ['id', 'person_id', 'name', 'membership_status', 'join_date'], gym),
  insertRows('gym_checkin', ['id', 'membership_id', 'checkin_date', 'checkin_time', 'checkout_time'], gymCheck),
  insertRows('event_checkin', ['id', 'person_id', 'event_name', 'event_date'], events),
  insertRows('income', ['person_id', 'annual_income'], income),
  insertRows('interview', ['id', 'person_id', 'report_id', 'transcript'], interviews),
].join('\n');

const sql = schema + '\n' + data + '\n';
const outJs = `// 由 scripts/gen-data.js 產生，請勿手動編輯。執行 npm run data 重新產生。
window.SD_SEED = ${JSON.stringify(sql)};
`;
const outDir = path.join(__dirname, '..', 'js', 'engine');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'seed.js'), outJs);
fs.writeFileSync(path.join(__dirname, 'seed.sql'), sql);
fs.writeFileSync(path.join(__dirname, 'story-ids.json'), JSON.stringify({ persons: P, reports: Object.fromEntries(Object.entries(R).map(([k, v]) => [k, v.id])), cards: cardOf, employees: empOf }, null, 2));
console.log(`person ${persons.length}, license ${licenses.length}, report ${reports.length}, sale ${sales.length}, cctv ${cctv.length}, transit ${transit.length}, lost ${lost.length}, employee ${employees.length}, access ${access.length}, gym ${gym.length}/${gymCheck.length}, event ${events.length}, interview ${interviews.length}`);
console.log(`seed.js ${(outJs.length / 1024).toFixed(0)} KB`);
