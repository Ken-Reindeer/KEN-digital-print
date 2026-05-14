// ============================================================
// Customer Database — KEN Digital Print
// Code.gs — Google Apps Script Backend
// ============================================================

const SHEET_CUSTOMERS = "ข้อมูลลูกค้า";
const SHEET_ORDERS    = "ประวัติการสั่งซื้อ";
const SHEET_USERS     = "Users";
const DRIVE_FOLDER    = "Customer database (KEN Digital Print)";
const TOKEN_HOURS     = 24;

// ============================================================
// SETUP — รันครั้งเดียวตอนติดตั้ง
// ============================================================

function testGeneratePDF() {
  const result = generatePDF({
    customerId: "000016",
    customerName: "test",
    customerRowId: "",
    rowId: "TEST_123",
    detail: "test detail",
    price: "100",
    phone: "0812345678",
    address: "test address"
  });
  Logger.log(JSON.stringify(result));
}

/** รันเพื่อเช็คว่า DriveApp ทำงานได้ไหม */
function testDrive() {
  try {
    const f = DriveApp.getFolderById("1hRmGGI45k1iBurrqVf70VyjcvzlEqMYW");
    Logger.log("OK: " + f.getName());
  } catch(e) {
    Logger.log("ERROR: " + e.toString());
  }
}

/** รันใน editor ครั้งเดียวเพื่อ authorize DriveApp + SpreadsheetApp scope */
function authorizeAll() {
  // บังคับใช้ DriveApp เพื่อ trigger permission
  const folder = DriveApp.getFolderById("1hRmGGI45k1iBurrqVf70VyjcvzlEqMYW");
  const files = folder.getFiles();
  SpreadsheetApp.getActiveSpreadsheet();
  Logger.log("✅ Authorization สำเร็จ — Folder: " + folder.getName());
}

function setupSystem() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let uSheet = ss.getSheetByName(SHEET_USERS);
  if (!uSheet) uSheet = ss.insertSheet(SHEET_USERS);
  if (uSheet.getLastRow() === 0) {
    uSheet.appendRow(["username","password","role","fullname","token","token_expiry","last_login"]);
    styleHeader(uSheet, 7);
    uSheet.appendRow(["owner", hashPassword("ken2024"), "owner", "เจ้าของ KEN", "", "", ""]);
    uSheet.appendRow(["admin1", hashPassword("admin1234"), "admin", "แอดมิน 1", "", "", ""]);
  }

  let cSheet = ss.getSheetByName(SHEET_CUSTOMERS);
  if (!cSheet) cSheet = ss.insertSheet(SHEET_CUSTOMERS);
  if (cSheet.getLastRow() === 0) {
    cSheet.appendRow(["Row ID","Id","รหัสลูกค้า","ชื่อลูกค้า","เบอร์โทรศัพท์","ชื่อผู้รับ","ที่อยู่จัดส่ง","รายละเอียดใบกำกับภาษี","ลิ้งค์ SNS","ยอดรวม"]);
    styleHeader(cSheet, 10);
  }

  let oSheet = ss.getSheetByName(SHEET_ORDERS);
  if (!oSheet) oSheet = ss.insertSheet(SHEET_ORDERS);
  if (oSheet.getLastRow() === 0) {
    oSheet.appendRow(["Row ID","Id","วันที่/เวลา","สถานะ","รายละเอียด","ราคารวม","ชื่อผู้รับ","ที่อยู่จัดส่ง","รูปประกอบ","เบอร์โทรศัพท์","ลิ้งค์ลูกค้า","รหัสลูกค้า","Tracking number","Image URL","PDF URL"]);
    styleHeader(oSheet, 15);
  }

  SpreadsheetApp.getUi().alert("✅ ติดตั้งสำเร็จ!\n\nUsername: owner\nPassword: ken2024\n\n⚠️ กรุณาเปลี่ยน Password ทันที!");
}

function styleHeader(sheet, cols) {
  sheet.getRange(1,1,1,cols).setFontWeight("bold").setBackground("#0d2461").setFontColor("#ffffff");
}

// ============================================================
// CRYPTO
// ============================================================
function hashPassword(password) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + "KEN_SALT_2024", Utilities.Charset.UTF_8);
  return raw.map(b => ('0'+(b & 0xFF).toString(16)).slice(-2)).join('');
}
function generateToken() {
  return Utilities.getUuid().replace(/-/g,'') + Date.now().toString(36);
}

// ============================================================
// HTTP
// ============================================================
function doGet(e)  { return route(e); }
function doPost(e) { return route(e); }

function route(e) {
  const p    = e.parameter || {};
  let body = {};
  try { body = (e.postData && e.postData.contents) ? JSON.parse(e.postData.contents) : {}; } catch(x) {}
  if (p.data) { try { Object.assign(body, JSON.parse(decodeURIComponent(p.data))); } catch(x) {} }
  // uploadImage: imageData มาใน POST body โดยตรง (ไม่ใช่ JSON), meta มาใน GET param data
  if (body.action === "uploadImage" && e.postData && e.postData.contents && !body.imageData) {
    body.imageData = e.postData.contents;
  }
  const action = p.action || body.action;
  let result;
  try {
    if (action === "login") {
      result = doLogin(body);
    } else {
      const token = p.token || body.token;
      const user  = verifyToken(token);
      if (!user) {
        result = { success:false, code:"UNAUTHORIZED", message:"กรุณาเข้าสู่ระบบใหม่" };
      } else {
        result = handleAction(action, p, body, user);
      }
    }
  } catch(err) {
    result = { success:false, message:err.toString() };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// AUTH
// ============================================================
function doLogin(body) {
  const sh   = getSheet(SHEET_USERS);
  const rows = sh.getDataRange().getValues();
  const h    = rows[0].map(x=>String(x).trim());
  const iU=h.indexOf("username"), iP=h.indexOf("password"), iR=h.indexOf("role"),
        iF=h.indexOf("fullname"), iT=h.indexOf("token"), iE=h.indexOf("token_expiry"), iL=h.indexOf("last_login");

  const inputHash = hashPassword(body.password||"");
  for (let i=1; i<rows.length; i++) {
    if (String(rows[i][iU]).trim().toLowerCase() === String(body.username||"").trim().toLowerCase()
        && rows[i][iP] === inputHash) {
      const token  = generateToken();
      const expiry = new Date(Date.now() + TOKEN_HOURS*3600*1000);
      sh.getRange(i+1,iT+1).setValue(token);
      sh.getRange(i+1,iE+1).setValue(expiry.toISOString());
      sh.getRange(i+1,iL+1).setValue(new Date().toLocaleString("th-TH"));
      return { success:true, token, expiry:expiry.getTime(),
               user:{ username:rows[i][iU], fullname:rows[i][iF]||rows[i][iU], role:rows[i][iR],
                      permissions: getRolePermissions(rows[i][iR]) } };
    }
  }
  return { success:false, message:"Username หรือ Password ไม่ถูกต้อง" };
}

function verifyToken(token) {
  if (!token) return null;
  const sh   = getSheet(SHEET_USERS);
  const rows = sh.getDataRange().getValues();
  const h    = rows[0].map(x=>String(x).trim());
  const iU=h.indexOf("username"), iR=h.indexOf("role"), iF=h.indexOf("fullname"),
        iT=h.indexOf("token"), iE=h.indexOf("token_expiry");
  for (let i=1; i<rows.length; i++) {
    if (rows[i][iT] === token) {
      if (new Date(rows[i][iE]) > new Date())
        return { username:rows[i][iU], fullname:rows[i][iF]||rows[i][iU], role:rows[i][iR], rowNum:i+1 };
    }
  }
  return null;
}

function doLogout(body) {
  const sh=getSheet(SHEET_USERS), rows=sh.getDataRange().getValues();
  const iT=rows[0].map(x=>String(x).trim()).indexOf("token");
  for (let i=1;i<rows.length;i++) { if(rows[i][iT]===body.token){ sh.getRange(i+1,iT+1).setValue(""); break; } }
  return { success:true };
}

// ============================================================
// ROUTER
// ============================================================
function handleAction(action, p, body, user) {
  const isOwner = user.role==="owner";
  const isStaff = isOwner || getRolePermissions(user.role).length > 0;
  switch(action) {
    case "logout":            return doLogout(body);
    case "getRoles":          return getRoles();
    case "addRole":           return guard(isOwner, ()=>addRole(body));
    case "updateRole":        return guard(isOwner, ()=>updateRole(body));
    case "deleteRole":        return guard(isOwner, ()=>deleteRole(body));
    case "uploadUserAvatar":  return guard(isOwner || user.username===body.username, ()=>uploadUserAvatar(body));
    case "getCustomers":      return getCustomers(p);
    case "addCustomer":       return guard(isStaff, ()=>addCustomer(body));
    case "updateCustomer":    return guard(isStaff, ()=>updateCustomer(body));
    case "deleteCustomer":    return guard(isStaff, ()=>deleteCustomer(body));
    case "getOrders":         return getOrders(p);
    case "addOrder":          return guard(isStaff, ()=>addOrder(body));
    case "updateOrderStatus": return guard(isStaff, ()=>updateOrderStatus(body));
    case "updateTracking":    return guard(isStaff, ()=>updateTracking(body));
    case "uploadImage":       return guard(isStaff, ()=>uploadImage(body));
    case "getUploadFolder":   return guard(isStaff, ()=>getUploadFolder(body));
    case "updateOrder":       return guard(isStaff, ()=>updateOrder(body));
    case "deleteOrder":       return guard(isStaff, ()=>deleteOrder(body));
    case "getAccessToken":    return guard(isStaff, ()=>({success:true, token:ScriptApp.getOAuthToken()}));
    case "getConfig":         return guard(isStaff, ()=>({success:true,
      token: ScriptApp.getOAuthToken(),
      spreadsheetId: SpreadsheetApp.getActiveSpreadsheet().getId(),
      sheetOrders: SHEET_ORDERS,
      sheetCustomers: SHEET_CUSTOMERS
    }));
    case "generatePDF":       return guard(isStaff, ()=>generatePDF(body));
    case "getStats":          return guard(isOwner, ()=>getStats());
    case "getUsers":          return guard(isOwner, ()=>getUsers());
    case "addUser":           return guard(isOwner, ()=>addUser(body));
    case "updateUser":        return guard(isOwner, ()=>updateUser(body));
    case "deleteUser":        return guard(isOwner, ()=>deleteUser(body));
    case "changePassword":    return changePassword(body, user);
    default: return { success:false, message:"Unknown action" };
  }
}

function guard(ok, fn) {
  return ok ? fn() : { success:false, code:"FORBIDDEN", message:"ไม่มีสิทธิ์ดำเนินการนี้" };
}

// ============================================================
// HELPERS
// ============================================================
function getSheet(name) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); }

/**
 * แปลง Row ID (UUID ใน Sheet ลูกค้า) → "000016 อารุณี ไทยบัณฑิต"
 * ถ้าไม่เจอ Row ID ให้คืนค่า fallback เดิม
 */
function lookupCustomerLabel(rowId) {
  if (!rowId) return "";
  const sh = getSheet(SHEET_CUSTOMERS);
  const data = sh.getDataRange().getValues();
  const h = data[0].map(x => String(x).trim());
  const iRowId = h.indexOf("Row ID");
  const iCode  = h.indexOf("รหัสลูกค้า");
  const iName  = h.indexOf("ชื่อลูกค้า");
  if (iRowId < 0) return rowId;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][iRowId]).trim() === String(rowId).trim()) {
      const code = iCode >= 0 ? String(data[i][iCode]).trim() : "";
      const name = iName >= 0 ? String(data[i][iName]).trim() : "";
      return (code + (name ? " " + name : "")).trim() || rowId;
    }
  }
  return rowId; // fallback
}
function sheetToObjects(sh) {
  const data=sh.getDataRange().getValues(); if(data.length<2) return [];
  const h=data[0].map(x=>String(x).trim());
  return data.slice(1).map((row,i)=>{ const o={_row:i+2}; h.forEach((k,j)=>o[k]=row[j]==null?"":row[j]); return o; });
}
function findRow(sh,col,val) {
  const d=sh.getDataRange().getValues(), ci=d[0].map(x=>String(x).trim()).indexOf(col);
  if(ci<0)return -1;
  for(let i=1;i<d.length;i++) if(String(d[i][ci]).trim()===String(val).trim()) return i+1;
  return -1;
}
function colIdx(sh,name) { return sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(x=>String(x).trim()).indexOf(name); }
function fmt(v) { if(v instanceof Date) return Utilities.formatDate(v,Session.getScriptTimeZone(),"d/M/yyyy HH:mm"); return v==null?"":String(v); }
function ensureCol(sh,name) {
  const h=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  if(!h.map(x=>String(x).trim()).includes(name)) sh.getRange(1,sh.getLastColumn()+1).setValue(name);
}
function getOrCreateFolder(customerId, customerName, customerRowId) {
  // ถ้าไม่มีชื่อลูกค้าส่งมา ให้ lookup จาก Row ID ของ Sheet ลูกค้า
  let label = customerName ? (customerId + " " + customerName).trim() : "";
  if (!label && customerRowId) {
    label = lookupCustomerLabel(customerRowId);
  }
  if (!label) label = customerId || "unknown";

  // ใช้ Folder ID โดยตรง เร็วกว่าค้นหาชื่อ
  const parent = DriveApp.getFolderById("1hRmGGI45k1iBurrqVf70VyjcvzlEqMYW");
  let custFolder;
  const ci = parent.getFoldersByName(label);
  custFolder = ci.hasNext() ? ci.next() : parent.createFolder(label);
  // sub-folder: "ประวัติการสั่งซื้อ"
  const si = custFolder.getFoldersByName("ประวัติการสั่งซื้อ");
  return si.hasNext() ? si.next() : custFolder.createFolder("ประวัติการสั่งซื้อ");
}

// ============================================================
// CUSTOMERS
// ============================================================
function getCustomers(p) {
  // build totalMap: custRowId → sum ราคารวม จาก Sheet ออเดอร์
  const totalMap = {};
  try {
    const osh=getSheet(SHEET_ORDERS), odata=osh.getDataRange().getValues();
    const oh=odata[0].map(x=>String(x).trim());
    const iCid=oh.indexOf("รหัสลูกค้า"), iPrice=oh.indexOf("ราคารวม");
    if(iCid>=0&&iPrice>=0){
      for(let i=1;i<odata.length;i++){
        const cid=String(odata[i][iCid]).trim(), price=parseFloat(odata[i][iPrice])||0;
        if(cid) totalMap[cid]=(totalMap[cid]||0)+price;
      }
    }
  } catch(e){}

  let data=sheetToObjects(getSheet(SHEET_CUSTOMERS)).map(r=>{
    const rowId=fmt(r["Row ID"]);
    return {
      rowId, customerId:fmt(r["รหัสลูกค้า"]), name:fmt(r["ชื่อลูกค้า"]),
      phone:fmt(r["เบอร์โทรศัพท์"]), recipient:fmt(r["ชื่อผู้รับ"]), address:fmt(r["ที่อยู่จัดส่ง"]),
      taxInfo:fmt(r["รายละเอียดใบกำกับภาษี"]), sns:fmt(r["ลิ้งค์ SNS"]),
      total: totalMap[rowId]||0  // sum จาก orders จริง
    };
  });
  if(p.search){const q=p.search.toLowerCase();data=data.filter(c=>c.customerId.toLowerCase().includes(q)||c.name.toLowerCase().includes(q)||c.phone.toLowerCase().includes(q));}
  return {success:true,data};
}
function addCustomer(b) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sh = getSheet(SHEET_CUSTOMERS);

    // auto-generate รหัสลูกค้าถ้าไม่ได้ส่งมา
    let customerId = String(b.customerId||"").trim();
    if (!customerId) {
      // หา MAX รหัสที่มีอยู่แล้วบวก 1
      const data = sh.getDataRange().getValues();
      const h = data[0].map(x=>String(x).trim());
      const iCode = h.indexOf("รหัสลูกค้า");
      let max = 0;
      if (iCode >= 0) {
        for (let i = 1; i < data.length; i++) {
          const n = parseInt(String(data[i][iCode]).replace(/\D/g,""))||0;
          if (n > max) max = n;
        }
      }
      customerId = String(max + 1).padStart(6, "0");
    }

    // เช็ครหัสซ้ำ
    if (findRow(sh, "รหัสลูกค้า", customerId) > 0) {
      return {success:false, message:"รหัสลูกค้า "+customerId+" มีอยู่แล้ว"};
    }

    const rowId = "CUST_" + Date.now();
    const hRow = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
    sh.appendRow(hRow.map(col=>{switch(String(col).trim()){
      case"Row ID":return rowId;
      case"รหัสลูกค้า":return "'"+customerId;case"ชื่อลูกค้า":return b.name||"";
      case"เบอร์โทรศัพท์":return b.phone||"";case"ชื่อผู้รับ":return b.recipient||"";
      case"ที่อยู่จัดส่ง":return b.address||"";case"รายละเอียดใบกำกับภาษี":return b.taxInfo||"";
      case"ลิ้งค์ SNS":return b.sns||"";default:return"";}}));
    return {success:true, message:"เพิ่มลูกค้าสำเร็จ", customerId, rowId};
  } finally {
    lock.releaseLock();
  }
}
function updateCustomer(b) {
  const sh=getSheet(SHEET_CUSTOMERS),rowNum=findRow(sh,"รหัสลูกค้า",b.customerId);
  if(rowNum<0)return{success:false,message:"ไม่พบลูกค้า"};
  const h=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const map={"ชื่อลูกค้า":b.name,"เบอร์โทรศัพท์":b.phone,"ชื่อผู้รับ":b.recipient,"ที่อยู่จัดส่ง":b.address,"รายละเอียดใบกำกับภาษี":b.taxInfo,"ลิ้งค์ SNS":b.sns};
  h.forEach((c,i)=>{const k=String(c).trim();if(map[k]!==undefined)sh.getRange(rowNum,i+1).setValue(map[k]);});
  return {success:true,message:"อัพเดทสำเร็จ"};
}
function deleteCustomer(b) {
  const sh = getSheet(SHEET_CUSTOMERS);
  let rowNum = -1;
  if (b.rowId)      rowNum = findRow(sh, "Row ID", b.rowId);
  if (rowNum < 1 && b.customerId) rowNum = findRow(sh, "รหัสลูกค้า", b.customerId);
  if (rowNum < 1)   return {success:false, message:"ไม่พบลูกค้า"};

  // safety: block delete if customer still has orders
  const rowIdCol = colIdx(sh, "Row ID");
  const targetRowId = b.rowId || (rowIdCol >= 0 ? String(sh.getRange(rowNum, rowIdCol+1).getValue()).trim() : "");
  if (targetRowId) {
    const osh = getSheet(SHEET_ORDERS), odata = osh.getDataRange().getValues();
    const iCid = odata[0].map(x=>String(x).trim()).indexOf("รหัสลูกค้า");
    if (iCid >= 0) {
      let count = 0;
      for (let i=1; i<odata.length; i++) {
        if (String(odata[i][iCid]).trim() === targetRowId) count++;
      }
      if (count > 0) return {success:false, message:`ลบไม่ได้: มีประวัติการสั่งซื้อ ${count} รายการ`};
    }
  }
  sh.deleteRow(rowNum);
  return {success:true, message:"ลบลูกค้าสำเร็จ"};
}

// ============================================================
// ORDERS
// ============================================================
function getOrders(p) {
  const sh = getSheet(SHEET_ORDERS);
  const allData = sh.getDataRange().getValues();
  const headers = allData[0].map(h=>String(h).trim());
  const limitRaw = p.limit !== undefined ? parseInt(p.limit) : 100;
  const limit  = isNaN(limitRaw) ? 100 : limitRaw; // 0 = ส่งทั้งหมด, ไม่ได้ส่งมา = 100
  const offset = parseInt(p.offset)||0;
  const total  = allData.length - 1;

  // map: Row ID ของ Sheet ลูกค้า → "000016 ชื่อลูกค้า"
  const custMap = {};
  try {
    const csh = getSheet(SHEET_CUSTOMERS);
    const cdata = csh.getDataRange().getValues();
    const ch = cdata[0].map(x=>String(x).trim());
    const iRowId = ch.indexOf("Row ID"), iCode = ch.indexOf("รหัสลูกค้า"), iName = ch.indexOf("ชื่อลูกค้า");
    if (iRowId >= 0 && iCode >= 0) {
      for (let i = 1; i < cdata.length; i++) {
        const rowId = String(cdata[i][iRowId]).trim();
        const code  = String(cdata[i][iCode]).trim();
        const name  = iName >= 0 ? String(cdata[i][iName]).trim() : "";
        if (rowId) custMap[rowId] = code + (name ? " " + name : "");
      }
    }
  } catch(e) {}

  let rows = [];
  for (let i = allData.length - 1; i >= 1; i--) {
    const row = allData[i]; const o = {};
    headers.forEach((k,j)=>o[k]=row[j]==null?"":row[j]);
    const cid = fmt(o["รหัสลูกค้า"]), label = custMap[cid] || cid;
    rows.push({
      rowId:fmt(o["Row ID"]),date:fmt(o["วันที่/เวลา"]),status:fmt(o["สถานะ"]),
      detail:fmt(o["รายละเอียด"]),price:fmt(o["ราคารวม"]),recipient:fmt(o["ชื่อผู้รับ"]),
      address:fmt(o["ที่อยู่จัดส่ง"]),phone:fmt(o["เบอร์โทรศัพท์"]),link:fmt(o["ลิ้งค์ลูกค้า"]),
      customerId:cid, customerLabel:label,
      tracking:fmt(o["Tracking number"]),
      imageUrl:fmt(o["Image URL"]),pdfUrl:fmt(o["PDF URL"])
    });
  }
  // limit=0 ไม่ใช้แล้ว ใช้ batch แทน
  const page = rows.slice(offset, offset + limit);
  return {success:true, data:page, total:rows.length, hasMore:(offset+limit) < rows.length};
}
function updateOrder(b) {
  const sh=getSheet(SHEET_ORDERS), rowNum=findRow(sh,"Row ID",b.rowId);
  if(rowNum<1) return {success:false,message:"ไม่พบออเดอร์"};
  const h=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  // batch: อ่านแถวทั้งหมดก่อน แก้ใน memory แล้ว write ทีเดียว
  const row=sh.getRange(rowNum,1,1,sh.getLastColumn()).getValues()[0];
  h.forEach((col,i)=>{
    const k=String(col).trim();
    if(k==="วันที่/เวลา"&&b.datetime){const d=new Date(b.datetime);if(!isNaN(d))row[i]=Utilities.formatDate(d,"Asia/Bangkok","d/M/yyyy HH:mm");}
    else if(k==="สถานะ"&&b.status!==undefined)row[i]=b.status;
    else if(k==="รายละเอียด"&&b.detail!==undefined)row[i]=b.detail;
    else if(k==="ราคารวม"&&b.price!==undefined)row[i]=parseFloat(b.price)||0;
    else if(k==="ชื่อผู้รับ"&&b.recipient!==undefined)row[i]=b.recipient;
    else if(k==="ที่อยู่จัดส่ง"&&b.address!==undefined)row[i]=b.address;
    else if(k==="เบอร์โทรศัพท์"&&b.phone!==undefined)row[i]=b.phone;
    else if(k==="ลิ้งค์ลูกค้า"&&b.link!==undefined)row[i]=b.link;
    else if(k==="Tracking number"&&b.tracking!==undefined)row[i]=b.tracking;
    else if(k==="Image URL"&&b.imageUrl)row[i]=b.imageUrl;
    else if(k==="PDF URL"&&b.pdfUrl)row[i]=b.pdfUrl;
  });
  sh.getRange(rowNum,1,1,sh.getLastColumn()).setValues([row]);
  return {success:true,message:"แก้ไขสำเร็จ"};
}

function deleteOrder(b) {
  const sh=getSheet(SHEET_ORDERS), rowNum=findRow(sh,"Row ID",b.rowId);
  if(rowNum<1) return {success:false,message:"ไม่พบออเดอร์"};
  sh.deleteRow(rowNum);
  return {success:true,message:"ลบสำเร็จ"};
}

function addOrder(b) {
  const sh=getSheet(SHEET_ORDERS);
  ensureCol(sh,"Image URL");ensureCol(sh,"PDF URL");
  const now=new Date();
  const rowId="WEB_"+now.getTime();

  // แปลง customerId (รหัส 000016) → Row ID ของ Sheet ลูกค้า
  let custRowId = b.customerId||"";
  try {
    const csh=getSheet(SHEET_CUSTOMERS);
    const cdata=csh.getDataRange().getValues();
    const ch=cdata[0].map(x=>String(x).trim());
    const iRowId=ch.indexOf("Row ID"), iCode=ch.indexOf("รหัสลูกค้า");
    if(iRowId>=0 && iCode>=0){
      for(let i=1;i<cdata.length;i++){
        if(String(cdata[i][iCode]).trim()===String(b.customerId||"").trim()){
          custRowId=String(cdata[i][iRowId]).trim()||custRowId; break;
        }
      }
    }
  } catch(e){}

  const h=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  sh.appendRow(h.map(col=>{
    const k=String(col).trim();
    if(k==="Row ID") return rowId;
    if(k==="วันที่/เวลา"){
      if(b.datetime){const d=new Date(b.datetime);if(!isNaN(d))return Utilities.formatDate(d,"Asia/Bangkok","d/M/yyyy HH:mm");}
      return Utilities.formatDate(now,"Asia/Bangkok","d/M/yyyy HH:mm");
    }
    switch(k){
      case"สถานะ":return b.status||"กำลังผลิต";
      case"รายละเอียด":return b.detail||"";case"ราคารวม":return parseFloat(b.price)||0;
      case"ชื่อผู้รับ":return b.recipient||"";case"ที่อยู่จัดส่ง":return b.address||"";
      case"เบอร์โทรศัพท์":return b.phone||"";case"ลิ้งค์ลูกค้า":return b.link||"";
      case"รหัสลูกค้า":return custRowId;case"Tracking number":return b.tracking||"";
      case"Image URL":return b.imageUrl||"";case"PDF URL":return b.pdfUrl||"";
      case"บันทึกโดย":return b.createdBy||"";
      default:return"";
    }
  }));
  updateCustomerTotal(b.customerId,parseFloat(b.price)||0);
  return {success:true,message:"บันทึกออเดอร์สำเร็จ",rowId};
}
function updateOrderStatus(b) {
  const sh=getSheet(SHEET_ORDERS),rowNum=findRow(sh,"Row ID",b.rowId);
  if(rowNum<0)return{success:false,message:"ไม่พบออเดอร์"};
  sh.getRange(rowNum,colIdx(sh,"สถานะ")+1).setValue(b.status);
  return {success:true,message:"อัพเดทสถานะสำเร็จ"};
}
function updateTracking(b) {
  const sh=getSheet(SHEET_ORDERS),rowNum=findRow(sh,"Row ID",b.rowId);
  if(rowNum<0)return{success:false,message:"ไม่พบออเดอร์"};
  sh.getRange(rowNum,colIdx(sh,"Tracking number")+1).setValue(b.tracking);
  return {success:true,message:"บันทึก Tracking สำเร็จ"};
}
function updateCustomerTotal(customerId,amount) {
  try{const sh=getSheet(SHEET_CUSTOMERS),rowNum=findRow(sh,"รหัสลูกค้า",customerId);
  if(rowNum<0)return;const ci=colIdx(sh,"ยอดรวม");if(ci<0)return;
  const cur=parseFloat(sh.getRange(rowNum,ci+1).getValue())||0;
  sh.getRange(rowNum,ci+1).setValue(cur+amount);}catch(e){}
}

// ============================================================
// FILES
// ============================================================

/** คืน folder ID ให้ browser upload ตรงผ่าน Drive API v3 */
function getUploadFolder(b) {
  try {
    const folder = getOrCreateFolder(b.customerId||"", b.customerName||"", b.customerRowId||"");
    return {success:true, folderId: folder.getId()};
  } catch(err) { return {success:false, message:err.toString()}; }
}

function uploadImage(b) {
  try {
    const folder = getOrCreateFolder(b.customerId||"", b.customerName||"", b.customerRowId||"");
    if (!b.imageData) return {success:false, message:"ไม่พบข้อมูลรูปภาพ"};

    const mimeType = b.mimeType || "image/jpeg";
    const fileName = b.fileName || ("img_" + Date.now() + ".jpg");

    // decode base64 → Blob แล้วสร้างไฟล์ผ่าน DriveApp โดยตรง (ไม่ compress)
    const decoded = Utilities.base64Decode(b.imageData);
    const blob = Utilities.newBlob(decoded, mimeType, fileName);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const id = file.getId();
    return {
      success: true,
      fileId: id,
      viewUrl: "https://drive.google.com/file/d/" + id + "/view",
      imgUrl:  "https://lh3.googleusercontent.com/d/" + id
    };
  } catch(err) { return {success:false, message:err.toString()}; }
}

// uploadImageFormData ถูกแทนที่ด้วย uploadImage (base64 via Drive API) — ดู route ข้างบน

function generatePDF(b) {
  try {
    Logger.log("generatePDF start, customerId: "+b.customerId+" rowId: "+b.rowId);
    const folder=getOrCreateFolder(b.customerId||"", b.customerName||"", b.customerRowId||"");
    Logger.log("folder OK: "+folder.getId());
    const tz="Asia/Bangkok";
    const now=new Date();
    const today=Utilities.formatDate(now,tz,"d-MMM-yy");
    const timeStamp=Utilities.formatDate(now,tz,"HHmmss");

    // embed รูปเป็น base64 ใน HTML เพราะ HtmlService fetch external URL ไม่ได้
    let imgTag = "";
    if (b.imgBase64) {
      // ใช้ base64 ที่ส่งมาโดยตรง ไม่ต้อง getFileById
      const mime = b.imgMimeType || "image/jpeg";
      imgTag = `<div style="margin-top:16px;border:1px solid #ddd;padding:8px;border-radius:4px"><img src="data:${mime};base64,${b.imgBase64}" style="max-width:100%;max-height:260px;object-fit:contain;display:block;"></div>`;
    } else if (b.imgUrl) {
      // fallback: ลอง getFileById ถ้าไม่มี base64
      try {
        let fileId = "";
        const m2 = b.imgUrl.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
        const m1 = b.imgUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (m2) fileId = m2[1];
        else if (m1) fileId = m1[1];
        if (fileId) {
          const file = DriveApp.getFileById(fileId);
          const blob = file.getBlob();
          const b64  = Utilities.base64Encode(blob.getBytes());
          const mime = blob.getContentType() || "image/jpeg";
          imgTag = `<div style="margin-top:16px;border:1px solid #ddd;padding:8px;border-radius:4px"><img src="data:${mime};base64,${b64}" style="max-width:100%;max-height:260px;object-fit:contain;display:block;"></div>`;
        }
      } catch(imgErr) { Logger.log("img embed skip: "+imgErr); }
    }

    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Sarabun',sans-serif;font-size:14px;padding:32px;color:#111;}.hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;}.logo{width:56px;height:56px;border-radius:50%;background:#0d2461;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:13px;}.title{font-size:24px;font-weight:700;text-align:center;flex:1;}.date{font-size:12px;color:#666;min-width:80px;}hr{border:none;border-top:1.5px solid #ccc;margin:12px 0;}.grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;margin-bottom:12px;}.row{display:flex;gap:8px;padding:3px 0;}.lbl{font-weight:700;min-width:90px;font-size:13px;}.val{color:#333;font-size:13px;}.cbs{display:flex;gap:32px;margin:14px 0;}.cb{display:flex;align-items:center;gap:8px;font-size:14px;}.box{width:18px;height:18px;border:2px solid #333;flex-shrink:0;}.sec{font-weight:700;font-size:15px;margin-bottom:8px;}.detail{white-space:pre-wrap;line-height:1.8;font-size:13px;}</style></head><body>
<div class="hdr"><div class="date">วันที่ ${today}</div><div class="title">ใบสั่งงาน</div><div class="logo">KEN</div></div><hr>
<div class="grid"><div class="row"><span class="lbl">รหัสลูกค้า</span><span class="val">${b.customerId||""} ${b.customerName||""}</span></div><div class="row"><span class="lbl">ชื่อลูกค้า</span><span class="val">${b.customerName||""}</span></div><div class="row"><span class="lbl">เบอร์โทร</span><span class="val">${b.phone||""}</span></div><div class="row"><span class="lbl">ที่อยู่จัดส่ง</span><span class="val">${b.address||""}</span></div></div>
<div class="cbs"><div class="cb"><div class="box"></div> รับหน้าร้าน</div><div class="cb"><div class="box"></div> ส่งขนส่ง</div><div class="cb"><div class="box"></div> Lalamove</div></div><hr>
<div class="sec">รายละเอียด</div><div class="detail">${(b.detail||"").replace(/</g,"&lt;")}</div>${imgTag}</body></html>`;
    const pdfBlob=HtmlService.createHtmlOutput(html).getAs("application/pdf");
    pdfBlob.setName("ใบสั่งงาน_"+b.customerId+"_"+today+"_"+timeStamp+".pdf");
    const file=folder.createFile(pdfBlob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
    const id=file.getId(),url="https://drive.google.com/file/d/"+id+"/view";
    // บันทึก pdfUrl และ imageUrl (ถ้ามี) ลง sheet ในครั้งเดียว
    if(b.rowId){
      updateOrder({rowId:b.rowId, pdfUrl:url, ...(b.imgUrl?{imageUrl:b.imgUrl}:{})});
    }
    return {success:true,pdfUrl:url};
  }catch(err){return{success:false,message:err.toString()};}
}

// ============================================================
// STATS
// ============================================================
function getStats() {
  const orders=sheetToObjects(getSheet(SHEET_ORDERS)),customers=sheetToObjects(getSheet(SHEET_CUSTOMERS));
  const now=new Date();let total=0,month=0,pending=0;const byMonth={};
  orders.forEach(o=>{
    const p=parseFloat(String(o["ราคารวม"]).replace(/,/g,""))||0;if(p<=0)return;
    total+=p;const d=new Date(o["วันที่/เวลา"]);
    if(!isNaN(d)){if(d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear())month+=p;
    const k=d.getFullYear()+"-"+(d.getMonth()+1);byMonth[k]=(byMonth[k]||0)+p;}
    if(String(o["สถานะ"])==="กำลังผลิต")pending++;
  });
  return {success:true,totalCustomers:customers.length,totalOrders:orders.length,totalRevenue:total,monthRevenue:month,pending,byMonth};
}

// ============================================================
// USERS
// ============================================================
function getUsers() {
  return {success:true,data:sheetToObjects(getSheet(SHEET_USERS)).map(r=>({
    username:fmt(r["username"]),fullname:fmt(r["fullname"]),role:fmt(r["role"]),
    last_login:fmt(r["last_login"]), avatar_url: fmt(r["avatar_url"])
  }))};
}
function addUser(b) {
  const sh=getSheet(SHEET_USERS);
  if(findRow(sh,"username",b.username)>0)return{success:false,message:"มี username นี้อยู่แล้ว"};
  sh.appendRow([b.username,hashPassword(b.password),b.role,b.fullname||"","","",""]);
  return {success:true,message:"เพิ่มผู้ใช้สำเร็จ"};
}
function updateUser(b) {
  const sh=getSheet(SHEET_USERS),rowNum=findRow(sh,"username",b.username);
  if(rowNum<0)return{success:false,message:"ไม่พบผู้ใช้"};
  const h=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(x=>String(x).trim());
  if(b.fullname!==undefined)sh.getRange(rowNum,h.indexOf("fullname")+1).setValue(b.fullname);
  if(b.role!==undefined)sh.getRange(rowNum,h.indexOf("role")+1).setValue(b.role);
  return {success:true,message:"อัพเดทสำเร็จ"};
}
function deleteUser(b) {
  const sh=getSheet(SHEET_USERS),rowNum=findRow(sh,"username",b.username);
  if(rowNum<0)return{success:false,message:"ไม่พบผู้ใช้"};
  sh.deleteRow(rowNum);return {success:true,message:"ลบผู้ใช้สำเร็จ"};
}
function changePassword(b,user) {
  const target=b.username||user.username;
  if(target!==user.username&&user.role!=="owner")return{success:false,message:"ไม่มีสิทธิ์"};
  const sh=getSheet(SHEET_USERS),rowNum=findRow(sh,"username",target);
  if(rowNum<0)return{success:false,message:"ไม่พบผู้ใช้"};
  sh.getRange(rowNum,colIdx(sh,"password")+1).setValue(hashPassword(b.newPassword));
  sh.getRange(rowNum,colIdx(sh,"token")+1).setValue("");
  return {success:true,message:"เปลี่ยนรหัสผ่านสำเร็จ กรุณา login ใหม่"};
}

// ============================================================
// ROLES & PERMISSIONS
// ============================================================
const ALL_PERMISSIONS = ["orders","progress","customers","insight","dycut","users"];

function getRolesSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName("Roles");
  if (!sh) {
    sh = ss.insertSheet("Roles");
    sh.appendRow(["role_name","permissions","description","created_at"]);
    styleHeader(sh, 4);
    // Seed default "admin" role so existing admins keep working
    sh.appendRow(["admin", JSON.stringify(ALL_PERMISSIONS), "ผู้ดูแลระบบ (เริ่มต้น)", new Date().toISOString()]);
  }
  return sh;
}

function getRolePermissions(roleName) {
  if (roleName === "owner") return ALL_PERMISSIONS.slice();
  if (!roleName) return [];
  try {
    const sh = getRolesSheet();
    const rows = sh.getDataRange().getValues();
    const h = rows[0].map(x=>String(x).trim());
    const iN = h.indexOf("role_name"), iP = h.indexOf("permissions");
    for (let i=1; i<rows.length; i++) {
      if (String(rows[i][iN]).trim() === String(roleName).trim()) {
        try { return JSON.parse(rows[i][iP] || "[]"); } catch(e) { return []; }
      }
    }
  } catch(e) {}
  return [];
}

function getRoles() {
  const sh = getRolesSheet();
  const rows = sh.getDataRange().getValues();
  const h = rows[0].map(x=>String(x).trim());
  const iN = h.indexOf("role_name"), iP = h.indexOf("permissions"), iD = h.indexOf("description");
  const list = [{ role_name:"owner", permissions: ALL_PERMISSIONS.slice(), description:"เจ้าของระบบ (สิทธิ์ทั้งหมด)", locked:true }];
  for (let i=1; i<rows.length; i++) {
    if (!rows[i][iN]) continue;
    let perms = [];
    try { perms = JSON.parse(rows[i][iP] || "[]"); } catch(e){}
    list.push({ role_name: String(rows[i][iN]).trim(), permissions: perms, description: String(rows[i][iD]||""), locked:false });
  }
  return { success:true, data:list, allPermissions: ALL_PERMISSIONS };
}

function addRole(b) {
  const name = String(b.roleName||"").trim();
  if (!name) return {success:false, message:"กรุณาระบุชื่อ Role"};
  if (name.toLowerCase()==="owner") return {success:false, message:"ชื่อ owner สงวนไว้ใช้งานระบบ"};
  const sh = getRolesSheet();
  if (findRow(sh,"role_name",name) > 0) return {success:false, message:"มี Role ชื่อนี้แล้ว"};
  const perms = Array.isArray(b.permissions) ? b.permissions.filter(p=>ALL_PERMISSIONS.indexOf(p)>=0) : [];
  sh.appendRow([name, JSON.stringify(perms), String(b.description||""), new Date().toISOString()]);
  return {success:true, message:"สร้าง Role สำเร็จ"};
}

function updateRole(b) {
  const name = String(b.roleName||"").trim();
  if (!name || name.toLowerCase()==="owner") return {success:false, message:"ไม่สามารถแก้ไข Role นี้"};
  const sh = getRolesSheet();
  const rowNum = findRow(sh,"role_name",name);
  if (rowNum < 0) return {success:false, message:"ไม่พบ Role"};
  const perms = Array.isArray(b.permissions) ? b.permissions.filter(p=>ALL_PERMISSIONS.indexOf(p)>=0) : [];
  sh.getRange(rowNum, colIdx(sh,"permissions")+1).setValue(JSON.stringify(perms));
  if (b.description !== undefined) sh.getRange(rowNum, colIdx(sh,"description")+1).setValue(String(b.description||""));
  return {success:true, message:"อัพเดท Role สำเร็จ"};
}

function deleteRole(b) {
  const name = String(b.roleName||"").trim();
  if (!name || name.toLowerCase()==="owner") return {success:false, message:"ไม่สามารถลบ Role นี้"};
  const sh = getRolesSheet();
  const rowNum = findRow(sh,"role_name",name);
  if (rowNum < 0) return {success:false, message:"ไม่พบ Role"};
  // Block delete if any user has this role
  const ush = getSheet(SHEET_USERS);
  const urows = ush.getDataRange().getValues();
  const iR = urows[0].map(x=>String(x).trim()).indexOf("role");
  let count = 0;
  for (let i=1; i<urows.length; i++) if (String(urows[i][iR]).trim()===name) count++;
  if (count > 0) return {success:false, message:`ลบไม่ได้: มีผู้ใช้ ${count} คน ใช้ Role นี้อยู่ — กรุณาย้ายผู้ใช้ไป Role อื่นก่อน`};
  sh.deleteRow(rowNum);
  return {success:true, message:"ลบ Role สำเร็จ"};
}

// ============================================================
// USER AVATAR
// ============================================================
function getOrCreateUserAvatarFolder() {
  const parent = DriveApp.getFolderById("1hRmGGI45k1iBurrqVf70VyjcvzlEqMYW");
  const it = parent.getFoldersByName("Users");
  return it.hasNext() ? it.next() : parent.createFolder("Users");
}

function uploadUserAvatar(b) {
  const username = String(b.username||"").trim();
  if (!username) return {success:false, message:"ไม่ระบุ username"};
  const sh = getSheet(SHEET_USERS);
  const rowNum = findRow(sh,"username",username);
  if (rowNum < 0) return {success:false, message:"ไม่พบผู้ใช้"};
  if (!b.imageData) return {success:false, message:"ไม่มีรูปแนบมา"};

  // imageData is "data:image/png;base64,..." or just base64
  let dataStr = String(b.imageData);
  let mime = "image/png", ext = "png";
  const m = dataStr.match(/^data:(image\/(png|jpeg|jpg|webp));base64,(.*)$/);
  let b64;
  if (m) { mime = m[1]; ext = m[2]==="jpeg"?"jpg":m[2]; b64 = m[3]; }
  else { b64 = dataStr; }

  const folder = getOrCreateUserAvatarFolder();
  // Remove old avatar(s) with same username prefix
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (f.getName().split(".")[0] === username) { try { f.setTrashed(true); } catch(e){} }
  }
  const blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, username+"."+ext);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const url = "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w200";

  ensureCol(sh, "avatar_url");
  sh.getRange(rowNum, colIdx(sh,"avatar_url")+1).setValue(url);
  return {success:true, message:"อัปโหลดรูปสำเร็จ", url};
}