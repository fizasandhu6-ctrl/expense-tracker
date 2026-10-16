function loadList(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

let transactions = loadList('transactions');
let ledgers = loadList('ledgers');
let activeLedgerId = localStorage.getItem('activeLedgerId');
let chart;
let editingId = null;

// Date helpers (local time)
const pad = n => String(n).padStart(2, '0');
const toDateStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => toDateStr(new Date());

function migrate() {
  if (ledgers.length === 0) {
    ledgers = [{ id: 'l' + Date.now(), name: 'Ghar' }];
  }
  const defaultId = ledgers[0].id;

  transactions.forEach(t => {
    if (!t.ledgerId) t.ledgerId = defaultId;
    if (!t.entryDate) t.entryDate = t.date || new Date().toISOString();
    if (!t.expenseDate) {
      const d = new Date(t.date || t.entryDate);
      t.expenseDate = isNaN(d) ? todayStr() : toDateStr(d);
    }
  });

  if (activeLedgerId !== 'all' && !ledgers.some(l => l.id === activeLedgerId)) {
    activeLedgerId = ledgers[0].id;
  }
}
migrate();

// Sirf active ledger ki transactions (ya 'all' ho to sab)
let selectedMonth = todayStr().slice(0, 7); // '' ka matlab all time

// Sirf ledger ka filter
function ledgerTransactions() {
  return activeLedgerId === 'all'
    ? transactions
    : transactions.filter(t => t.ledgerId === activeLedgerId);
}

// Ledger + mahina
function visibleTransactions() {
  return ledgerTransactions().filter(t =>
    !selectedMonth || t.expenseDate.startsWith(selectedMonth));
}

// Pichle mahinon se jo bacha (carry-over)
function openingBalance() {
  if (!selectedMonth) return 0;
  return ledgerTransactions()
    .filter(t => t.expenseDate < selectedMonth + '-01')
    .reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
}

function fmt(n) {
  return n.toLocaleString('en-PK', { maximumFractionDigits: 2 });
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString();
  }
  const d = new Date(value);
  return isNaN(d) ? value : d.toLocaleDateString();
}

const themeBtn = document.getElementById('theme-btn');

// Theme toggle
themeBtn.addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');

  localStorage.setItem(
    'darkMode',
    document.body.classList.contains('dark-mode')
  );

  themeBtn.textContent =
    document.body.classList.contains('dark-mode')
      ? '☀️ Light Mode'
      : '🌙 Dark Mode';
      renderChart();
});

// Check saved theme
if (localStorage.getItem('darkMode') === 'true') {
  document.body.classList.add('dark-mode');
  themeBtn.textContent = '☀️ Light Mode';
}


// Add transaction
const form = document.getElementById('transaction-form');
const typeSelect = document.getElementById('type');

// Form ko khali karo aur "Add" mode mein wapas lao
function cancelEdit() {
  editingId = null;
  form.reset();
  document.getElementById('date').value = todayStr();
  typeSelect.dispatchEvent(new Event('change')); // tumhara category-by-type code dobara chale
  form.querySelector('button[type="submit"]').textContent = 'Add Transaction';
}

// Edit: row ka data form mein bharo
function startEdit(id) {
  const t = transactions.find(x => x.id === id);
  if (!t) return;
  editingId = id;
  document.getElementById('desc').value = t.desc;
  document.getElementById('amount').value = t.amount;
  typeSelect.value = t.type;
  typeSelect.dispatchEvent(new Event('change'));
  document.getElementById('category').value = t.category;
  document.getElementById('date').value = t.expenseDate;
  form.querySelector('button[type="submit"]').textContent = 'Save Changes';
  document.getElementById('desc').focus();
}

form.addEventListener('submit', (e) => {
  e.preventDefault();

  const desc = document.getElementById('desc').value.trim();
  const amount = Number(document.getElementById('amount').value);
  const expenseDate = document.getElementById('date').value;

  if (!desc || !(amount > 0) || !expenseDate) return;

  const data = {
    desc,
    amount,
    type: typeSelect.value,
    category: document.getElementById('category').value,
    expenseDate
  };

  if (editingId !== null) {
    const t = transactions.find(x => x.id === editingId);
    if (t) Object.assign(t, data);
  } else {
    if (activeLedgerId === 'all') {
      alert('first select a ledger from the sidebar. "All" does not allow entry addition.');
      return;
    }
    transactions.push({
      id: Date.now(),
      ...data,
      entryDate: new Date().toISOString(),
      ledgerId: activeLedgerId
    });
  }

     if (selectedMonth && !expenseDate.startsWith(selectedMonth)) {
     selectedMonth = expenseDate.slice(0, 7);
     monthPicker.value = selectedMonth;
   }

  cancelEdit();
  document.getElementById('desc').focus();
  saveAndRender();
});

const money = n => (n < 0 ? `(${fmt(-n)})` : fmt(n));

function renderTable() {
  const list = document.getElementById('transaction-list');
  const filter = document.getElementById('filter-type').value;

  // 1) Purane se naye order mein chalte hue running balance nikalo
  let running = openingBalance();
  const withBalance = visibleTransactions()
    .slice()
    .sort((a, b) =>
      a.expenseDate.localeCompare(b.expenseDate) ||
      a.entryDate.localeCompare(b.entryDate))
    .map(t => {
      running += t.type === 'income' ? t.amount : -t.amount;
      return { ...t, balanceAfter: running };
    });

  // 2) Filter lagao, phir naye upar dikhao
  const rows = withBalance
    .filter(t => filter === 'all' || t.type === filter)
    .reverse()
    .map(t => `
      <tr class="${t.type}">
        <td>${escapeHTML(t.desc)}</td>
        <td>PKR ${t.type === 'expense' ? `(${fmt(t.amount)})` : fmt(t.amount)}</td>
        <td>${t.type}</td>
        <td>${escapeHTML(t.category)}</td>
        <td>${formatDate(t.expenseDate)}</td>
        <td>PKR ${money(t.balanceAfter)}</td>
        <td>
          <button onclick="startEdit(${t.id})">Edit</button>
          <button onclick="deleteTransaction(${t.id})">Delete</button>
        </td>
      </tr>
    `);

  list.innerHTML = rows.length
    ? rows.join('')
    : '<tr><td colspan="7">No transactions yet. Add your first one using the form above.</td></tr>';
}


// Calculate totals
function calculateTotals() {
  const list = visibleTransactions();
  const income = list
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  const expense = list
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);
  const opening = openingBalance();
  return { income, expense, opening, balance: opening + income - expense };
}


// Fetch USD → PKR exchange rate
async function fetchRate() {
  const cached = JSON.parse(localStorage.getItem('usdPkr') || 'null');
  const sixHours = 6 * 60 * 60 * 1000;

  if (cached && Date.now() - cached.time < sixHours) return cached.rate;

  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    const rate = data.rates.PKR;
    localStorage.setItem('usdPkr', JSON.stringify({ rate, time: Date.now() }));
    return rate;
  } catch (err) {
    console.error('Rate fetch failed:', err);
    return cached ? cached.rate : null; // purana rate, bilkul na hone se behtar
  }
}


// Sidebar: har ledger ke saath is mahine ka kharcha
function renderSidebar() {
  const list = document.getElementById('ledger-list');
  const month = todayStr().slice(0, 7);
  const items = [{ id: 'all', name: 'All' }, ...ledgers];

  list.innerHTML = items.map(l => {
    const monthExpense = transactions
      .filter(t => (l.id === 'all' || t.ledgerId === l.id) &&
                   t.type === 'expense' &&
                   t.expenseDate.startsWith(month))
      .reduce((sum, t) => sum + t.amount, 0);

    const deleteBtn = l.id === 'all' ? '' : `
      <button type="button" class="ledger-delete" data-delete="${l.id}"
              title="Delete ledger" aria-label="Delete ledger ${escapeHTML(l.name)}">×</button>`;

    return `
      <li class="ledger-item ${l.id === activeLedgerId ? 'active' : ''}" data-id="${l.id}">
        <span>${escapeHTML(l.name)}</span>
        <span class="ledger-meta">
          <span class="ledger-total" title="Is mahine ka kharcha">${fmt(monthExpense)}</span>
          ${deleteBtn}
        </span>
      </li>`;
  }).join('');
}

// Ledger  click
document.getElementById('ledger-list').addEventListener('click', e => {
  const delBtn = e.target.closest('[data-delete]');
  if (delBtn) {
    deleteLedger(delBtn.dataset.delete);
    return;
  }
  const li = e.target.closest('.ledger-item');
  if (!li) return;
  activeLedgerId = li.dataset.id;
  cancelEdit();
  saveAndRender();
});

function deleteLedger(id) {
  if (ledgers.length <= 1) {
    alert('at least one ledger is required.');
    return;
  }
  const ledger = ledgers.find(l => l.id === id);
  if (!ledger) return;

  const count = transactions.filter(t => t.ledgerId === id).length;
  const msg = count
    ? `"${ledger.name}" ki ${count} transactions will be deleted first export data. Continue?`
    : `Ledger "${ledger.name}" want to delete this?`;
  if (!confirm(msg)) return;

  transactions = transactions.filter(t => t.ledgerId !== id);
  ledgers = ledgers.filter(l => l.id !== id);
  if (activeLedgerId === id) activeLedgerId = ledgers[0].id;
  cancelEdit();
  saveAndRender();
}

// new ledger
document.getElementById('add-ledger-btn').addEventListener('click', () => {
  const name = (prompt('Ledger ka naam?') || '').trim();
  if (!name) return;
  const ledger = { id: 'l' + Date.now(), name };
  ledgers.push(ledger);
  activeLedgerId = ledger.id;
  saveAndRender();
});

// Render everything
async function saveAndRender() {
  localStorage.setItem('transactions', JSON.stringify(transactions));

  renderTable();
  renderChart();
  await renderCards();
}

async function renderCards() {
  const { income, expense, balance } = calculateTotals();
  const rate = await fetchRate();

  const set = (id, text) => { document.getElementById(id).textContent = text; };
  const usd = n => (rate ? `$${fmt(n / rate)}` : 'USD rate unavailable');

  set('total-income', `PKR ${fmt(income)}`);
  set('total-income-usd', usd(income));
  set('total-expense', `PKR ${fmt(expense)}`);
  set('total-expense-usd', usd(expense));
  set('balance', `PKR ${fmt(balance)}`);
  set('balance-usd', usd(balance));
}



// Table
function renderTable() {
  const list = document.getElementById('transaction-list');
  const filter = document.getElementById('filter-type').value;

  const rows = visibleTransactions()
    .filter(t => filter === 'all' || t.type === filter)
    .slice()
    .sort((a, b) =>
      b.expenseDate.localeCompare(a.expenseDate) ||
      b.entryDate.localeCompare(a.entryDate))
    .map(t => `
      <tr class="${t.type}">
        <td>${escapeHTML(t.desc)}</td>
        <td>PKR ${fmt(t.amount)}</td>
        <td>${t.type}</td>
        <td>${escapeHTML(t.category)}</td>
        <td>${formatDate(t.expenseDate)}</td>
        <td>
          <button onclick="startEdit(${t.id})">Edit</button>
          <button onclick="deleteTransaction(${t.id})">Delete</button>
        </td>
      </tr>
    `);

  list.innerHTML = rows.length
    ? rows.join('')
    : '<tr><td colspan="6">No transactions yet. Add your first one using the form above.</td></tr>';
}


// Chart
function renderChart() {
  const ctx = document.getElementById('financeChart').getContext('2d');

  if (chart) chart.destroy();

  const totals = {};
    visibleTransactions()
    .filter(t => t.type === 'expense')
    .forEach(t => {
      totals[t.category] = (totals[t.category] || 0) + t.amount;
    });

  const styles = getComputedStyle(document.body);
  const textColor = styles.getPropertyValue('--ink').trim();

  chart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: Object.keys(totals),
      datasets: [{
        data: Object.values(totals),
        backgroundColor: ['#1f7a5a', '#b5402f', '#c08a2b', '#2b6cb0', '#7a5ea8', '#64707b'],
        borderColor: styles.getPropertyValue('--sheet').trim(),
        borderWidth: 2
      }]
    },
    options: {
      plugins: {
        legend: { labels: { color: textColor } },
        title: { display: true, text: 'Expenses by category', color: textColor }
      }
    }
  });
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Text cell: quotes escape, aur "=" "+" "-" "@" se shuru hone par formula injection roko
const csvText = v => {
  let s = String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
};

document.getElementById('export-csv-btn').addEventListener('click', () => {
  const month = document.getElementById('export-month').value;
  const ledgerName = id => (ledgers.find(l => l.id === id) || {}).name || '';

  const rows = ledgerTransactions()
    .filter(t => !month || t.expenseDate.startsWith(month))
    .slice()
    .sort((a, b) => a.expenseDate.localeCompare(b.expenseDate));

  if (!rows.length) {
    alert('Is selection mein koi transaction nahi hai.');
    return;
  }

  const header = 'Date,Ledger,Description,Type,Category,Amount (PKR)';
  const lines = rows.map(t => [
    t.expenseDate,
    csvText(ledgerName(t.ledgerId)),
    csvText(t.desc),
    t.type,
    csvText(t.category),
    t.amount
  ].join(','));

  // \uFEFF = UTF-8 BOM, taake Excel mein Urdu/special characters theek dikhen
  const csv = '\uFEFF' + [header, ...lines].join('\r\n');
  downloadFile(`expenses-${month || 'all'}.csv`, csv, 'text/csv;charset=utf-8');
});

document.getElementById('backup-btn').addEventListener('click', () => {
  const data = JSON.stringify({ version: 1, transactions, ledgers }, null, 2);
  downloadFile(`expense-backup-${todayStr()}.json`, data, 'application/json');
});

document.getElementById('restore-btn').addEventListener('click', () => {
  document.getElementById('restore-file').click();
});

document.getElementById('restore-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.transactions) || !Array.isArray(data.ledgers)) {
      throw new Error('bad format');
    }
    if (!confirm('Ye mojooda data ko replace kar dega. Continue?')) return;
    transactions = data.transactions;
    ledgers = data.ledgers;
    migrate();
    saveAndRender();
  } catch {
    alert('Backup file valid nahi hai.');
  } finally {
    e.target.value = '';
  }
});


const monthPicker = document.getElementById('month-picker');

function setMonth(value) {
  selectedMonth = value;
  monthPicker.value = value;
  saveAndRender();
}

function shiftMonth(delta) {
  const base = selectedMonth || todayStr().slice(0, 7);
  const [y, m] = base.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
}

document.getElementById('prev-month').addEventListener('click', () => shiftMonth(-1));
document.getElementById('next-month').addEventListener('click', () => shiftMonth(1));
document.getElementById('all-time').addEventListener('click', () => setMonth(''));
monthPicker.addEventListener('change', () => setMonth(monthPicker.value));
monthPicker.value = selectedMonth;

// Initial render
function save() {
  localStorage.setItem('transactions', JSON.stringify(transactions));
  localStorage.setItem('ledgers', JSON.stringify(ledgers));
  localStorage.setItem('activeLedgerId', activeLedgerId);
}

async function saveAndRender() {
  save();
  renderSidebar();
  renderTable();
  renderChart();
  await renderCards();
}

document.getElementById('date').value = todayStr();
