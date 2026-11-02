const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let db;
let dbPath;
let SQL;
let mainWindow;

function localDate() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}
function currentMonth() { return localDate().slice(0, 7); }
function saveDatabase() {
  const temp = dbPath + '.tmp';
  fs.writeFileSync(temp, Buffer.from(db.export()));
  fs.renameSync(temp, dbPath);
}
function rows(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const result = [];
  while (stmt.step()) result.push(stmt.getAsObject());
  stmt.free();
  return result;
}
function run(sql, params = []) {
  db.run(sql, params);
  saveDatabase();
  return db.exec('SELECT last_insert_rowid() AS id')[0]?.values?.[0]?.[0] || null;
}
function validId(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1) throw new Error('מזהה רשומה לא תקין');
  return n;
}
function text(value, max = 250) { return String(value ?? '').trim().slice(0, max); }
function amount(value, allowZero = false) {
  const n = Number(value);
  if (!Number.isFinite(n) || (allowZero ? n < 0 : n <= 0) || n > 100000000) throw new Error('סכום לא תקין');
  return n;
}
function date(value) {
  const s = text(value, 10);
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(s)) throw new Error('תאריך לא תקין');
  const [y,m,d] = s.split('-').map(Number);
  const check = new Date(y,m-1,d);
  if (check.getFullYear() !== y || check.getMonth() !== m-1 || check.getDate() !== d) throw new Error('תאריך לא תקין');
  return s;
}
function initDatabase() {
  const initSqlJs = require('sql.js');
  const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
  return initSqlJs({ locateFile: () => wasmPath }).then(SQLModule => {
    SQL = SQLModule;
    const folder = app.getPath('userData');
    fs.mkdirSync(folder, { recursive: true });
    dbPath = path.join(folder, 'hashbon.sqlite');
    db = fs.existsSync(dbPath) ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database();
    db.run(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK(type IN ('income','expense','reimbursement')),
        title TEXT NOT NULL,
        amount REAL NOT NULL,
        category TEXT NOT NULL DEFAULT 'כללי',
        transaction_date TEXT NOT NULL,
        notes TEXT DEFAULT '',
        related_expense_id INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(related_expense_id) REFERENCES transactions(id) ON DELETE SET NULL
      );
      CREATE TABLE IF NOT EXISTS work_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employer TEXT NOT NULL DEFAULT '',
        work_date TEXT NOT NULL,
        start_time TEXT DEFAULT '',
        end_time TEXT DEFAULT '',
        break_minutes INTEGER NOT NULL DEFAULT 0,
        hours REAL NOT NULL,
        hourly_rate REAL NOT NULL DEFAULT 0,
        notes TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS payslips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        pay_month TEXT NOT NULL,
        employer TEXT DEFAULT '',
        gross REAL NOT NULL DEFAULT 0,
        net REAL NOT NULL DEFAULT 0,
        tax REAL NOT NULL DEFAULT 0,
        national_insurance REAL NOT NULL DEFAULT 0,
        health_insurance REAL NOT NULL DEFAULT 0,
        pension REAL NOT NULL DEFAULT 0,
        hours REAL NOT NULL DEFAULT 0,
        notes TEXT DEFAULT '',
        ocr_text TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
      CREATE INDEX IF NOT EXISTS idx_work_date ON work_entries(work_date);
      CREATE INDEX IF NOT EXISTS idx_payslips_month ON payslips(pay_month);
    `);
    saveDatabase();
  });
}

ipcMain.handle('dashboard:get', (_e, month = currentMonth()) => {
  const m = /^\d{4}-\d{2}$/.test(String(month)) ? String(month) : currentMonth();
  const totalsRows = rows(`SELECT type, SUM(amount) total FROM transactions WHERE substr(transaction_date,1,7)=? GROUP BY type`, [m]);
  const totals = { income: 0, expense: 0, reimbursement: 0 };
  totalsRows.forEach(r => totals[r.type] = Number(r.total || 0));
  const work = rows('SELECT COALESCE(SUM(hours),0) hours, COALESCE(SUM(hours*hourly_rate),0) estimated FROM work_entries WHERE substr(work_date,1,7)=?', [m])[0];
  const recent = rows('SELECT * FROM transactions ORDER BY transaction_date DESC,id DESC LIMIT 8');
  const slips = rows('SELECT id,file_name,pay_month,employer,net,gross FROM payslips ORDER BY pay_month DESC,id DESC LIMIT 5');
  return { month: m, totals, balance: totals.income - totals.expense, hours: Number(work.hours || 0), estimatedPay: Number(work.estimated || 0), recent, payslips: slips };
});

ipcMain.handle('transactions:list', (_e, filters = {}) => {
  const clauses = [];
  const params = [];
  if (filters.type && ['income','expense','reimbursement'].includes(filters.type)) { clauses.push('type=?'); params.push(filters.type); }
  if (filters.month && /^\d{4}-\d{2}$/.test(filters.month)) { clauses.push("substr(transaction_date,1,7)=?"); params.push(filters.month); }
  if (filters.search) { clauses.push('(title LIKE ? OR category LIKE ? OR notes LIKE ?)'); const q = '%' + text(filters.search, 100) + '%'; params.push(q,q,q); }
  return rows('SELECT * FROM transactions ' + (clauses.length ? 'WHERE ' + clauses.join(' AND ') : '') + ' ORDER BY transaction_date DESC,id DESC', params);
});
ipcMain.handle('transactions:add', (_e, item = {}) => {
  if (!['income','expense','reimbursement'].includes(item.type)) throw new Error('סוג תנועה לא תקין');
  const id = run('INSERT INTO transactions(type,title,amount,category,transaction_date,notes,related_expense_id) VALUES(?,?,?,?,?,?,?)', [
    item.type, text(item.title,120) || (()=>{throw new Error('חובה להזין תיאור')})(), amount(item.amount),
    text(item.category,60) || 'כללי', date(item.transaction_date || localDate()), text(item.notes,1000),
    item.related_expense_id ? validId(item.related_expense_id) : null
  ]);
  return { id, success: true };
});
ipcMain.handle('transactions:update', (_e, item = {}) => {
  const id = validId(item.id);
  if (!['income','expense','reimbursement'].includes(item.type)) throw new Error('סוג תנועה לא תקין');
  const title = text(item.title,120);
  if (!title) throw new Error('חובה להזין תיאור לתנועה');
  if (!rows('SELECT id FROM transactions WHERE id=?',[id]).length) throw new Error('התנועה לא נמצאה');
  db.run('UPDATE transactions SET type=?,title=?,amount=?,category=?,transaction_date=?,notes=?,related_expense_id=? WHERE id=?', [
    item.type,title,amount(item.amount),text(item.category,60)||'כללי',date(item.transaction_date),text(item.notes,1000),
    item.related_expense_id ? validId(item.related_expense_id) : null,id
  ]);
  saveDatabase(); return { success: true };
});
ipcMain.handle('transactions:export', async (_e, filters = {}) => {
  const clauses = [];
  const params = [];
  if (filters.type && ['income','expense','reimbursement'].includes(filters.type)) { clauses.push('type=?'); params.push(filters.type); }
  if (filters.month && /^\\d{4}-\\d{2}$/.test(String(filters.month))) { clauses.push("substr(transaction_date,1,7)=?"); params.push(String(filters.month)); }
  if (filters.search) { clauses.push('(title LIKE ? OR category LIKE ? OR notes LIKE ?)'); const q='%' + text(filters.search,100) + '%'; params.push(q,q,q); }
  const data=rows('SELECT transaction_date,title,category,type,amount,notes FROM transactions '+(clauses.length?'WHERE '+clauses.join(' AND '):'')+' ORDER BY transaction_date DESC,id DESC',params);
  const picked=await dialog.showSaveDialog(mainWindow,{title:'ייצוא תנועות לקובץ CSV',defaultPath:'hashbon-transactions.csv',filters:[{name:'קובץ CSV',extensions:['csv']}]});
  if(picked.canceled||!picked.filePath)return {canceled:true};
  const headers=['תאריך','תיאור','קטגוריה','סוג','סכום','הערות'];
  const labels={income:'הכנסה',expense:'הוצאה',reimbursement:'החזר'};
  const cell=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
  const lines=[headers,...data.map(x=>[x.transaction_date,x.title,x.category,labels[x.type]||x.type,x.amount,x.notes])].map(row=>row.map(cell).join(','));
  fs.writeFileSync(picked.filePath,'\\uFEFF'+lines.join('\\r\\n'),'utf8');
  return {success:true,path:picked.filePath,count:data.length};
});
ipcMain.handle('transactions:remove', (_e, id) => {
  db.run('DELETE FROM transactions WHERE id=?', [validId(id)]); saveDatabase(); return { success: true };
});

ipcMain.handle('work:list', (_e, filters = {}) => {
  const month = filters.month && /^\d{4}-\d{2}$/.test(filters.month) ? filters.month : currentMonth();
  return rows("SELECT * FROM work_entries WHERE substr(work_date,1,7)=? ORDER BY work_date DESC,id DESC", [month]);
});
ipcMain.handle('work:add', (_e, item = {}) => {
  const hours = amount(item.hours);
  if (hours > 24) throw new Error('מספר שעות ביום לא יכול לעלות על 24');
  const id = run('INSERT INTO work_entries(employer,work_date,start_time,end_time,break_minutes,hours,hourly_rate,notes) VALUES(?,?,?,?,?,?,?,?)', [
    text(item.employer,120),date(item.work_date || localDate()),text(item.start_time,5),text(item.end_time,5),
    Math.max(0,Math.min(600,Math.round(Number(item.break_minutes)||0))),hours,amount(item.hourly_rate || 0,true),text(item.notes,1000)
  ]);
  return { id, success: true };
});
ipcMain.handle('work:remove', (_e, id) => { db.run('DELETE FROM work_entries WHERE id=?',[validId(id)]); saveDatabase(); return {success:true}; });

ipcMain.handle('payslips:list', () => rows('SELECT id,file_name,pay_month,employer,gross,net,tax,national_insurance,health_insurance,pension,hours,notes,ocr_text FROM payslips ORDER BY pay_month DESC,id DESC'));
ipcMain.handle('payslips:import', async () => {
  const picked = await dialog.showOpenDialog(mainWindow, { title:'בחירת תלוש שכר', properties:['openFile'], filters:[{name:'מסמכים ותמונות',extensions:['pdf','png','jpg','jpeg','tif','tiff','bmp']} ]});
  if (picked.canceled || !picked.filePaths[0]) return null;
  const source = picked.filePaths[0];
  const original = path.basename(source);
  const ext = path.extname(original).toLowerCase();
  const month = currentMonth();
  const dir = path.join(app.getPath('userData'),'payslips');
  fs.mkdirSync(dir,{recursive:true});
  const target = path.join(dir,Date.now()+'-'+original.replace(/[^\w.\-א-ת]/g,'_'));
  fs.copyFileSync(source,target);
  const id = run('INSERT INTO payslips(file_name,file_path,pay_month) VALUES(?,?,?)',[original,target,month]);
  return rows('SELECT id,file_name,pay_month,employer,gross,net FROM payslips WHERE id=?',[id])[0];
});
ipcMain.handle('payslips:update', (_e, item = {}) => {
  const id = validId(item.id);
  const payMonth = text(item.pay_month,7);
  if (!/^\\d{4}-(0[1-9]|1[0-2])$/.test(payMonth)) throw new Error('יש לבחור חודש תלוש תקין');
  const exists = rows('SELECT id FROM payslips WHERE id=?',[id])[0];
  if (!exists) throw new Error('התלוש לא נמצא. ייתכן שהוא נמחק');
  db.run('UPDATE payslips SET pay_month=?,employer=?,gross=?,net=?,tax=?,national_insurance=?,health_insurance=?,pension=?,hours=?,notes=? WHERE id=?', [
    payMonth,text(item.employer,120),amount(item.gross||0,true),amount(item.net||0,true),amount(item.tax||0,true),
    amount(item.national_insurance||0,true),amount(item.health_insurance||0,true),amount(item.pension||0,true),amount(item.hours||0,true),
    text(item.notes,1000),id
  ]);
  saveDatabase();
  return {success:true, payslip:rows('SELECT id,file_name,pay_month,employer,gross,net,tax,national_insurance,health_insurance,pension,hours,notes FROM payslips WHERE id=?',[id])[0]};
});
ipcMain.handle('payslips:remove', (_e,id) => {
  const found = rows('SELECT file_path FROM payslips WHERE id=?',[validId(id)])[0];
  if (found?.file_path && fs.existsSync(found.file_path)) fs.rmSync(found.file_path,{force:true});
  db.run('DELETE FROM payslips WHERE id=?',[validId(id)]); saveDatabase(); return {success:true};
});
ipcMain.handle('payslips:open', async (_e,id) => {
  const found=rows('SELECT file_path FROM payslips WHERE id=?',[validId(id)])[0];
  if (!found || !fs.existsSync(found.file_path)) throw new Error('קובץ התלוש לא נמצא');
  const result=await shell.openPath(found.file_path);
  if (result) throw new Error(result);
  return {success:true};
});
ipcMain.handle('payslips:ocr', async (_e,id) => {
  const found=rows('SELECT file_path FROM payslips WHERE id=?',[validId(id)])[0];
  if (!found || !fs.existsSync(found.file_path)) throw new Error('קובץ התלוש לא נמצא');
  const ext=path.extname(found.file_path).toLowerCase();
  if (ext==='.pdf') throw new Error('סריקת OCR לקובצי PDF סרוקים תתווסף בשלב הבא. אפשר להזין את הנתונים ידנית. לתמונות ניתן להשתמש ב-Tesseract מקומי.');
  const result = await new Promise(resolve => {
    const child=spawn('tesseract',[found.file_path,'stdout','-l','heb+eng'],{windowsHide:true});
    let out='',err=''; child.stdout.on('data',d=>out+=d.toString()); child.stderr.on('data',d=>err+=d.toString());
    child.on('error',()=>resolve({error:'Tesseract לא נמצא. התקן Tesseract OCR והוסף את שפות heb ו-eng ל-PATH.'}));
    child.on('close',code=>resolve(code===0?{text:out}:{error:err||'לא ניתן לפענח את התמונה'}));
  });
  if (result.error) throw new Error(result.error);
  db.run('UPDATE payslips SET ocr_text=? WHERE id=?',[result.text.slice(0,30000),validId(id)]); saveDatabase();
  return {text:result.text};
});

ipcMain.handle('settings:get', () => Object.fromEntries(rows('SELECT key,value FROM settings').map(r=>[r.key,r.value])));
ipcMain.handle('settings:save', (_e,data={}) => {
  for (const [key,value] of Object.entries(data)) {
    if (!['display_name','default_hourly_rate','currency'].includes(key)) continue;
    db.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',[key,text(value,100)]);
  }
  saveDatabase(); return {success:true};
});
ipcMain.handle('backup:export', async () => {
  const result=await dialog.showSaveDialog(mainWindow,{title:'שמירת גיבוי',defaultPath:'hashbon-backup.sqlite',filters:[{name:'גיבוי חשבון',extensions:['sqlite']}]});
  if (result.canceled || !result.filePath) return {canceled:true};
  saveDatabase(); fs.copyFileSync(dbPath,result.filePath); return {success:true,path:result.filePath};
});
ipcMain.handle('backup:import', async () => {
  const result=await dialog.showOpenDialog(mainWindow,{title:'בחירת קובץ גיבוי',properties:['openFile'],filters:[{name:'גיבוי חשבון',extensions:['sqlite','db']}]});
  if (result.canceled || !result.filePaths[0]) return {canceled:true};
  const bytes=fs.readFileSync(result.filePaths[0]);
  const test=new SQL.Database(bytes);
  const check=test.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'");
  if (!check.length) { test.close(); throw new Error('הקובץ שנבחר אינו גיבוי תקין של חשבון'); }
  test.close();
  fs.copyFileSync(result.filePaths[0],dbPath);
  db.close(); db=new SQL.Database(bytes); db.run('PRAGMA foreign_keys=ON'); return {success:true};
});
ipcMain.handle('app:info',()=>({version:app.getVersion(),dataPath:app.getPath('userData')}));

function createWindow() {
  mainWindow=new BrowserWindow({
    width:1440,height:940,minWidth:900,minHeight:650,backgroundColor:'#f4f6fa',title:'חשבון',
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}
  });
  mainWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  mainWindow.webContents.on('will-navigate',(event,url)=>{
    const allowed=!app.isPackaged && url.startsWith('http://127.0.0.1:5173');
    if (!allowed && !url.startsWith('file://')) event.preventDefault();
  });
  if (!app.isPackaged) {
    mainWindow.loadURL('http://127.0.0.1:5173');
    mainWindow.webContents.openDevTools({mode:'detach'});
  } else mainWindow.loadFile(path.join(__dirname,'../dist/index.html'));
}
app.whenReady().then(async()=>{await initDatabase();createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.on('before-quit',()=>{if(db && dbPath)saveDatabase();});
