/* 資料表與欄位的中文說明：play.html 側欄、查詢結果表頭、SHOW FULL COLUMNS 的 Comment 欄、
 * schema.html 都讀這一份。SQLite 沒有 COMMENT，所以備註只能放在 JS 端；改資料表結構時記得同步。 */
(function () {
  'use strict';
  const TABLES = {
    crime_report: { zh: '案件報案紀錄', cols: { id: '案件編號', report_date: '報案日期', crime_type: '案件類型（竊盜、搶奪、命案…）', district: '發生行政區', description: '案情描述，常含目擊線索' } },
    person: { zh: '市民', cols: { id: '市民編號', name: '姓名', gender: '性別', birth_year: '出生年', district: '行政區', street: '街道', house_no: '門牌號碼', phone: '電話（可能為 NULL）', license_id: { fk: 'driver_license.id' } } },
    driver_license: { zh: '駕照與車輛', cols: { id: '駕照編號', person_id: { fk: 'person.id' }, gender: '性別', height_cm: '身高（公分）', hair_color: '髮色', vehicle_type: '汽車 / 機車', plate_number: '車牌（ABC-1234）', car_brand: '品牌', car_model: '車型', car_color: '車色', issue_date: '發照日' } },
    store: { zh: '店家與攤位', cols: { id: '店家編號', name: '店名', kind: '類型', district: '行政區', owner_id: { fk: 'person.id' }, open_time: '開店時間', close_time: '打烊時間' } },
    store_sale: { zh: '店家銷售紀錄', cols: { id: '編號', store_id: { fk: 'store.id' }, sale_date: '銷售日期', item_name: '品項', quantity: '數量', amount: '金額', pay_method: '付款方式' } },
    cctv_log: { zh: '監視器車牌辨識', cols: { id: '編號', camera_location: '攝影機位置', district: '行政區', capture_time: '拍攝時間', plate_number: '辨識到的車牌（可能為 NULL）', note: '備註' } },
    transit_card: { zh: '悠遊卡', cols: { card_id: '卡號', person_id: { fk: 'person.id', zh: '未記名卡為 NULL' }, card_type: '卡種' } },
    transit_log: { zh: '捷運進出站紀錄', cols: { id: '編號', card_id: { fk: 'transit_card.card_id' }, station: '車站', direction: '進站 / 出站', log_time: '時間' } },
    lost_item: { zh: '捷運遺失物', cols: { id: '編號', item_name: '物品', category: '類別', station: '拾獲車站', found_date: '拾獲日期', est_value: '估價', status: '保管中 / 已領回', claimed_by: { fk: 'person.id', zh: '領取人' }, claimed_date: '領取日期' } },
    company: { zh: '公司', cols: { id: '公司編號', name: '名稱', industry: '產業', district: '行政區', founded_year: '成立年' } },
    employee: { zh: '員工', cols: { id: '員工編號', person_id: { fk: 'person.id' }, company_id: { fk: 'company.id' }, department: '部門', title: '職稱', hire_date: '到職日', salary: '月薪', manager_id: { fk: 'employee.id', zh: '直屬主管' } } },
    access_log: { zh: '公司門禁紀錄', cols: { id: '編號', employee_id: { fk: 'employee.id' }, door: '門（大門、研發區、機房、倉庫）', action: '進入 / 離開', event_time: '時間' } },
    gym_member: { zh: '健身房會員', cols: { id: '會員編號（5 碼）', person_id: { fk: 'person.id' }, name: '姓名', membership_status: '一般 / 銀卡 / 金卡', join_date: '入會日' } },
    gym_checkin: { zh: '健身房打卡', cols: { id: '編號', membership_id: { fk: 'gym_member.id' }, checkin_date: '日期', checkin_time: '進場', checkout_time: '離場' } },
    event_checkin: { zh: '藝文活動打卡', cols: { id: '編號', person_id: { fk: 'person.id' }, event_name: '活動名稱', event_date: '日期' } },
    income: { zh: '年收入', cols: { person_id: { fk: 'person.id' }, annual_income: '年收入（元）' } },
    interview: { zh: '筆錄', cols: { id: '編號', person_id: { fk: 'person.id', zh: '受訪者' }, report_id: { fk: 'crime_report.id' }, transcript: '筆錄內容' } },
    solution: { zh: '結案系統（第 6 章提交答案用）', cols: { id: '編號', answer: '你提交的姓名', result: '系統回覆' } },
  };

  /* 查詢結果只有欄名、沒有表名，跨表同名的欄位用這裡的共通說法；
   * 其餘欄名若在所有表中的說明一致，就直接沿用。 */
  const GENERIC = {
    id: '編號', name: '名稱', district: '行政區', gender: '性別',
    person_id: '市民編號（→ person.id）', report_id: '案件編號', store_id: '店家編號', company_id: '公司編號',
    employee_id: '員工編號', card_id: '卡號', membership_id: '會員編號', manager_id: '主管的員工編號',
    owner_id: '店主（→ person.id）', claimed_by: '領取人（→ person.id）', license_id: '駕照編號',
    station: '車站', item_name: '品項', note: '備註', status: '狀態',
  };
  /* 外鍵欄位以 { fk: '表.欄', zh: '補充' } 描述，顯示文字由 text() 組成「→ 表.欄（補充）」，
   * 圖示與「前往該表」按鈕則讀 fk()；兩者同一來源，改關聯不會漏掉其中一邊。 */
  const text = (v) => (typeof v === 'string' ? v : v ? `→ ${v.fk}${v.zh ? `（${v.zh}）` : ''}` : '');
  const byName = {};
  for (const t of Object.keys(TABLES)) {
    for (const [c, v] of Object.entries(TABLES[t].cols)) (byName[c] = byName[c] || new Set()).add(text(v));
  }
  for (const c of Object.keys(byName)) if (!GENERIC[c] && byName[c].size === 1) GENERIC[c] = [...byName[c]][0];

  const lower = (s) => String(s || '').toLowerCase();
  function table(t) { return TABLES[lower(t)] || null; }
  function column(t, c) { const d = table(t); return d ? text(d.cols[lower(c)]) : ''; }
  /** 回傳 { table, column, note } 或 null */
  function fk(t, c) {
    const d = table(t); const v = d && d.cols[lower(c)];
    if (!v || typeof v === 'string') return null;
    const [rt, rc] = v.fk.split('.');
    return { table: rt, column: rc, note: v.zh || '' };
  }
  function generic(c) { return GENERIC[lower(c)] || ''; }

  /* 主鍵實心琥珀、外鍵空心青色：形狀與顏色雙重線索，再加 sr-only 文字給螢幕閱讀器（WCAG 1.4.1）。
   * 內嵌 SVG 而非 <img>，才能用 currentColor 跟著 text-* utility 著色。 */
  const KEY_PATH = 'M15.5 2a6.5 6.5 0 0 0-6.2 8.4L2 17.7V22h4.3l1.4-1.4v-2.3h2.3l1.4-1.4 2.2-2.2A6.5 6.5 0 1 0 15.5 2Zm1.5 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z';
  function keyIcon(kind) {
    if (kind !== 'pk' && kind !== 'fk') return '';
    const style = kind === 'pk' ? 'text-amber' : 'text-teal';
    const fill = kind === 'pk' ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"';
    return `<svg class="inline-block size-3.5 shrink-0 ${style}" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path ${fill} d="${KEY_PATH}"/></svg><span class="sr-only">${kind === 'pk' ? '主鍵' : '外鍵'}</span>`;
  }

  window.SD = window.SD || {};
  window.SD.schemaDoc = { tables: TABLES, table, column, fk, generic, keyIcon, text };
})();
