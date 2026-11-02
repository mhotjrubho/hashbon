const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let db;
let SQL;

async function openDatabase() {
  const initSqlJs = require('sql.js');
  const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
  SQL = await initSqlJs({ locateFile: () => wasmPath });

  const dbPath = path.join(app.getPath('userData'), 'cheshbon.sqlite');
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense', 'reimbursement')),
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL DEFAULT 'כללי',
      transaction_date TEXT NOT NULL,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS payslips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      pay_month TEXT NOT NULL,
      employer TEXT DEFAULT '',
      gross REAL DEFAULT 0,
      net REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      national_insurance REAL DEFAULT 0,
      health_insurance REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  saveDatabase(dbPath);
  return dbPath;
}

function saveDatabase(dbPath) {
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

ipcMain.handle('dashboard:get', async () => {
  const rows = all(`
    SELECT type, COALESCE(SUM(amount), 0) AS total
    FROM transactions
    WHERE substr(transaction_date, 1, 7) = ?
    GROUP BY type
  `, [new Date().toISOString().slice(0, 7)]);

  const totals = { income: 0, expense: 0, reimbursement: 0 };
  for (const row of rows) totals[row.type] = Number(row.total || 0);

  const recent = all(`
    SELECT id, type, title, amount, category, transaction_date
    FROM transactions ORDER BY transaction_date DESC, id DESC LIMIT 8
  `);
  const payslips = all(`
    SELECT id, file_name, pay_month, employer, net, status
    FROM payslips ORDER BY pay_month DESC, id DESC LIMIT 5
  `);
  return { totals, recent, payslips };
});

ipcMain.handle('transactions:add', async (_event, item) => {
  const allowed = ['income', 'expense', 'reimbursement'];
  if (!item || !allowed.includes(item.type)) throw new Error('סוג תנועה לא תקין');
  const amount = Number(item.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('יש להזין סכום חיובי');
  const title = String(item.title || '').trim().slice(0, 120);
  if (!title) throw new Error('יש להזין תיאור');

  db.run(
    `INSERT INTO transactions (type, title, amount, category, transaction_date, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      item.type,
      title,
      amount,
      String(item.category || 'כללי').slice(0, 60),
      String(item.transaction_date || new Date().toISOString().slice(0, 10)),
      String(item.notes || '').slice(0, 1000)
    ]
  );
  saveDatabase(path.join(app.getPath('userData'), 'cheshbon.sqlite'));
  return { success: true };
});

ipcMain.handle('transactions:list', async () => all(`
  SELECT id, type, title, amount, category, transaction_date, notes
  FROM transactions ORDER BY transaction_date DESC, id DESC
`));

ipcMain.handle('payslips:list', async () => all(`
  SELECT id, file_name, pay_month, employer, gross, net, tax,
         national_insurance, health_insurance, status
  FROM payslips ORDER BY pay_month DESC, id DESC
`));

async function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1050,
    minHeight: 700,
    backgroundColor: '#f5f7fb',
    title: 'חשבון',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (!app.isPackaged) {
    await win.loadURL('http://127.0.0.1:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    await win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(async () => {
  await openDatabase();
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});