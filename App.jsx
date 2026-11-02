import { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard, ArrowLeftRight, FileText, PieChart, Settings,
  Plus, Wallet, TrendingUp, TrendingDown, ReceiptText, Search,
  Bell, ChevronLeft, CalendarDays, CircleHelp, ShieldCheck,
  X, Check, Clock3
} from 'lucide-react';

const money = (value) => new Intl.NumberFormat('he-IL', {
  style: 'currency', currency: 'ILS', maximumFractionDigits: 0
}).format(Number(value || 0));

const navItems = [
  { id: 'dashboard', label: 'סקירה כללית', icon: LayoutDashboard },
  { id: 'transactions', label: 'תנועות כספיות', icon: ArrowLeftRight },
  { id: 'payslips', label: 'תלושי שכר', icon: FileText },
  { id: 'reports', label: 'דוחות וסיכומים', icon: PieChart },
  { id: 'settings', label: 'הגדרות', icon: Settings }
];

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [dashboard, setDashboard] = useState({
    totals: { income: 0, expense: 0, reimbursement: 0 }, recent: [], payslips: []
  });
  const [transactions, setTransactions] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  async function refresh() {
    if (!window.cheshbon) return;
    const [summary, rows] = await Promise.all([
      window.cheshbon.getDashboard(),
      window.cheshbon.listTransactions()
    ]);
    setDashboard(summary);
    setTransactions(rows);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  const balance = dashboard.totals.income - dashboard.totals.expense;
  const monthLabel = new Intl.DateTimeFormat('he-IL', {
    month: 'long', year: 'numeric'
  }).format(new Date());

  async function saveTransaction(form) {
    try {
      await window.cheshbon.addTransaction(form);
      await refresh();
      setShowAdd(false);
      setToast('התנועה נשמרה בהצלחה');
      setTimeout(() => setToast(''), 2800);
    } catch (error) {
      setToast(error.message || 'לא ניתן לשמור את התנועה');
      setTimeout(() => setToast(''), 3500);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Wallet size={23} strokeWidth={2.2} /></div>
          <div><div className="brand-name">חשבון</div><div className="brand-sub">ניהול כספים אישי</div></div>
        </div>
        <div className="side-caption">תפריט ראשי</div>
        <nav className="nav-list">
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={`nav-item ${page === item.id ? 'active' : ''}`}
                onClick={() => setPage(item.id)}>
                <Icon size={19} />
                <span>{item.label}</span>
                {page === item.id && <span className="active-dot" />}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <div className="privacy-icon"><ShieldCheck size={18} /></div>
            <div><strong>המידע נשאר אצלך</strong><p>הנתונים נשמרים במחשב המקומי בלבד.</p></div>
          </div>
          <div className="version">גרסה 0.1.0 · סביבת מחשב מקומית</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>חשבון</span><ChevronLeft size={15} /><strong>{navItems.find(x => x.id === page)?.label}</strong></div>
          <div className="top-actions">
            <div className="local-status"><span className="status-dot" /> פועל מקומית</div>
            <button className="icon-button" title="עזרה"><CircleHelp size={19} /></button>
            <div className="avatar">מ</div>
          </div>
        </header>

        <div className="content">
          {page === 'dashboard' && (
            <>
              <div className="page-heading">
                <div><div className="eyebrow">התמונה הפיננסית שלך</div><h1>סקירה כללית</h1>
                  <p>כל ההכנסות, ההוצאות והמסמכים במקום אחד.</p></div>
                <div className="heading-actions">
                  <div className="period-chip"><CalendarDays size={16} /> {monthLabel}</div>
                  <button className="primary-button" onClick={() => setShowAdd(true)}><Plus size={18} /> הוספת תנועה</button>
                </div>
              </div>

              <section className="stats-grid">
                <StatCard title="הכנסות החודש" value={money(dashboard.totals.income)}
                  icon={TrendingUp} tone="green" note="הכנסות שנרשמו החודש" />
                <StatCard title="הוצאות החודש" value={money(dashboard.totals.expense)}
                  icon={TrendingDown} tone="red" note="הוצאות שנרשמו החודש" />
                <StatCard title="החזרים שהתקבלו" value={money(dashboard.totals.reimbursement)}
                  icon={ReceiptText} tone="blue" note="מוצגים בנפרד מהכנסה" />
                <StatCard title="יתרה חודשית" value={money(balance)}
                  icon={Wallet} tone="purple" note="הכנסות פחות הוצאות" />
              </section>

              <section className="dashboard-grid">
                <div className="panel recent-panel">
                  <div className="panel-heading"><div><h2>תנועות אחרונות</h2><p>הפעילות הכספית האחרונה שלך</p></div>
                    <button className="text-button" onClick={() => setPage('transactions')}>לכל התנועות <ChevronLeft size={15} /></button>
                  </div>
                  {dashboard.recent.length === 0 ? <EmptyState title="עדיין אין תנועות" text="הוסף הכנסה או הוצאה ראשונה כדי להתחיל לבנות תמונה פיננסית." /> :
                    <div className="transaction-list">{dashboard.recent.map(row => <TransactionRow key={row.id} row={row} />)}</div>}
                </div>
                <div className="panel payslip-panel">
                  <div className="panel-heading"><div><h2>תלושי שכר</h2><p>מסמכי השכר האחרונים</p></div>
                    <button className="small-icon-button" onClick={() => setPage('payslips')}><ChevronLeft size={17} /></button>
                  </div>
                  {dashboard.payslips.length === 0 ? <EmptyState title="אין תלושים עדיין" text="בהמשך תוכל להוסיף תלוש, לסרוק אותו ולבדוק את הנתונים שזוהו." /> :
                    dashboard.payslips.map(slip => <div className="slip-row" key={slip.id}>
                      <div className="file-icon"><FileText size={19} /></div>
                      <div className="slip-info"><strong>{slip.file_name}</strong><span>{slip.pay_month} · {slip.employer || 'מעסיק לא צוין'}</span></div>
                      <strong className="slip-amount">{money(slip.net)}</strong>
                    </div>)}
                  <button className="upload-placeholder" onClick={() => setPage('payslips')}><Plus size={17} /> מעבר לניהול תלושים</button>
                </div>
              </section>

              <div className="bottom-note"><ShieldCheck size={17} /><span>המערכת פועלת במחשב שלך. אין שליחה של נתונים לשרת חיצוני.</span></div>
            </>
          )}

          {page === 'transactions' && <TransactionsPage rows={transactions} onAdd={() => setShowAdd(true)} />}
          {page === 'payslips' && <PayslipsPage rows={dashboard.payslips} />}
          {page === 'reports' && <ReportsPage totals={dashboard.totals} />}
          {page === 'settings' && <SettingsPage />}
        </div>
      </main>

      {showAdd && <AddTransactionModal onClose={() => setShowAdd(false)} onSave={saveTransaction} />}
      {toast && <div className="toast"><Check size={17} /> {toast}</div>}
      {loading && <div className="loading-cover"><div className="loader" /><span>טוען את הנתונים המקומיים...</span></div>}
    </div>
  );
}

function StatCard({ title, value, icon: Icon, tone, note }) {
  return <div className="stat-card"><div className="stat-top"><span>{title}</span><div className={`stat-icon ${tone}`}><Icon size={19} /></div></div>
    <div className="stat-value">{value}</div><div className="stat-note">{note}</div></div>;
}

function TransactionRow({ row }) {
  const config = {
    income: { label: 'הכנסה', sign: '+', cls: 'income', icon: TrendingUp },
    expense: { label: 'הוצאה', sign: '−', cls: 'expense', icon: TrendingDown },
    reimbursement: { label: 'החזר הוצאה', sign: '+', cls: 'reimbursement', icon: ReceiptText }
  }[row.type];
  const Icon = config.icon;
  return <div className="transaction-row">
    <div className={`transaction-icon ${config.cls}`}><Icon size={18} /></div>
    <div className="transaction-details"><strong>{row.title}</strong><span>{row.category} · {row.transaction_date}</span></div>
    <div className={`transaction-amount ${config.cls}`}>{config.sign}{money(row.amount)}</div>
    <span className={`type-pill ${config.cls}`}>{config.label}</span>
  </div>;
}

function EmptyState({ title, text }) {
  return <div className="empty-state"><div className="empty-icon"><FileText size={23} /></div><strong>{title}</strong><p>{text}</p></div>;
}

function TransactionsPage({ rows, onAdd }) {
  const [filter, setFilter] = useState('all');
  const visible = rows.filter(row => filter === 'all' || row.type === filter);
  return <><div className="page-heading"><div><div className="eyebrow">מעקב שוטף</div><h1>תנועות כספיות</h1><p>רישום מסודר של כל הכנסה, הוצאה והחזר.</p></div>
    <button className="primary-button" onClick={onAdd}><Plus size={18} /> הוספת תנועה</button></div>
    <div className="panel table-panel"><div className="filter-bar">
      <div className="filter-tabs">{[['all','הכול'],['income','הכנסות'],['expense','הוצאות'],['reimbursement','החזרים']].map(([id,label]) =>
        <button key={id} className={filter === id ? 'filter-tab selected' : 'filter-tab'} onClick={() => setFilter(id)}>{label}</button>)}</div>
      <div className="search-box"><Search size={16} /><input placeholder="חיפוש תנועה..." /></div>
    </div>
    {visible.length ? <div className="transaction-list full-list">{visible.map(row => <TransactionRow key={row.id} row={row} />)}</div> :
      <EmptyState title="לא נמצאו תנועות" text="אפשר להוסיף תנועה חדשה באמצעות הכפתור בראש העמוד." />}
    </div></>;
}

function PayslipsPage({ rows }) {
  return <><div className="page-heading"><div><div className="eyebrow">מסמכי שכר</div><h1>תלושי שכר</h1><p>ניהול מסמכים, חילוץ נתונים ובדיקת פרטי השכר.</p></div>
    <button className="primary-button" disabled><Plus size={18} /> הוספת תלוש · בקרוב</button></div>
    <div className="panel"><div className="panel-heading"><div><h2>ארכיון תלושים</h2><p>הקבצים והנתונים שזוהו בכל תלוש</p></div><span className="coming-pill"><Clock3 size={14} /> שלב פיתוח הבא</span></div>
      {rows.length ? rows.map(row => <div className="slip-row" key={row.id}><div className="file-icon"><FileText size={19}/></div><div className="slip-info"><strong>{row.file_name}</strong><span>{row.pay_month} · {row.employer}</span></div><strong>{money(row.net)}</strong></div>) :
      <EmptyState title="ארכיון התלושים עדיין ריק" text="בשלב הבא נחבר סריקה מקומית של PDF ותמונות, עם זיהוי עברית ובדיקת הנתונים לפני שמירה." />}
    </div></>;
}

function ReportsPage({ totals }) {
  const income = Number(totals.income || 0), expense = Number(totals.expense || 0);
  const max = Math.max(income, expense, 1);
  return <><div className="page-heading"><div><div className="eyebrow">תמונה מסכמת</div><h1>דוחות וסיכומים</h1><p>השוואה בסיסית של ההכנסות וההוצאות החודשיות.</p></div></div>
    <div className="panel report-panel"><h2>החודש הנוכחי</h2><div className="report-line"><div><span>הכנסות</span><strong>{money(income)}</strong></div><div className="bar-track"><div className="bar-fill income-bar" style={{width: `${income / max * 100}%`}} /></div></div>
      <div className="report-line"><div><span>הוצאות</span><strong>{money(expense)}</strong></div><div className="bar-track"><div className="bar-fill expense-bar" style={{width: `${expense / max * 100}%`}} /></div></div>
      <div className="report-total"><span>הפרש</span><strong>{money(income - expense)}</strong></div></div></>;
}

function SettingsPage() {
  return <><div className="page-heading"><div><div className="eyebrow">התאמה אישית</div><h1>הגדרות</h1><p>העדפות המערכת, שמירת נתונים וגיבויים.</p></div></div>
    <div className="panel settings-panel"><div className="setting-row"><div><strong>אחסון מקומי</strong><p>מסד הנתונים נשמר בתיקיית הנתונים הפרטית של האפליקציה במחשב.</p></div><span className="setting-status"><span className="status-dot"/> פעיל</span></div>
      <div className="setting-row"><div><strong>גיבוי ושחזור</strong><p>ייצוא וייבוא של מסד הנתונים יתווספו בשלב הבא.</p></div><span className="coming-pill">בפיתוח</span></div>
      <div className="setting-row"><div><strong>סריקת תלושים</strong><p>מנוע OCR מקומי, ללא שליחת קבצים לשירות חיצוני.</p></div><span className="coming-pill">בפיתוח</span></div></div></>;
}

function AddTransactionModal({ onClose, onSave }) {
  const [type, setType] = useState('income');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('משכורת');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  function submit(event) {
    event.preventDefault();
    if (!title.trim() || !amount || Number(amount) <= 0) { setError('יש למלא תיאור וסכום תקין.'); return; }
    onSave({ type, title, amount: Number(amount), category, transaction_date: date, notes });
  }
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <form className="modal" onSubmit={submit}><div className="modal-heading"><div><div className="eyebrow">רישום חדש</div><h2>הוספת תנועה</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={20}/></button></div>
      <div className="type-selector">{[['income','הכנסה'],['expense','הוצאה'],['reimbursement','החזר הוצאה']].map(([id,label]) =>
        <button type="button" key={id} className={type === id ? `type-choice selected ${id}` : 'type-choice'} onClick={() => {setType(id); setCategory(id === 'income' ? 'משכורת' : id === 'expense' ? 'כללי' : 'החזר הוצאות');}}>{label}</button>)}</div>
      <label className="field-label">תיאור התנועה<input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder={type === 'income' ? 'לדוגמה: משכורת חודש אוקטובר' : type === 'expense' ? 'לדוגמה: קניית ציוד' : 'לדוגמה: החזר נסיעות מהמעסיק'} /></label>
      <div className="form-two"><label className="field-label">סכום בש״ח<input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></label>
        <label className="field-label">תאריך<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label></div>
      <label className="field-label">קטגוריה<select value={category} onChange={e => setCategory(e.target.value)}>{['משכורת','עבודה נוספת','החזר הוצאות','דיור','מזון','תחבורה','חשבונות','בריאות','קניות','כללי'].map(x => <option key={x}>{x}</option>)}</select></label>
      {type === 'reimbursement' && <div className="info-hint"><ShieldCheck size={17}/> החזר הוצאה נרשם בנפרד ואינו מתווסף לסך ההכנסות.</div>}
      <label className="field-label">הערות (לא חובה)<textarea rows="2" value={notes} onChange={e => setNotes(e.target.value)} placeholder="פרטים נוספים..." /></label>
      {error && <div className="form-error">{error}</div>}
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>ביטול</button><button className="primary-button" type="submit"><Check size={17}/> שמירת תנועה</button></div>
    </form>
  </div>;
}