function loadTransactions() {
  try {
    const saved = JSON.parse(localStorage.getItem('transactions'));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

let transactions = loadTransactions();
let chart;

const fmt = n => n.toLocaleString('en-PK', { maximumFractionDigits: 2 });

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(value) {
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
document.getElementById('transaction-form').addEventListener('submit', (e) => {
  e.preventDefault();

  const descInput = document.getElementById('desc');
  const amountInput = document.getElementById('amount');
  const desc = descInput.value.trim();
  const amount = Number(amountInput.value);

  if (!desc || !(amount > 0)) return;

  transactions.push({
    id: Date.now(),
    desc,
    amount,
    type: document.getElementById('type').value,
    category: document.getElementById('category').value,
    date: new Date().toISOString()
  });

  descInput.value = '';
  amountInput.value = '';
  descInput.focus();

  saveAndRender();
});

document.getElementById('filter-type').addEventListener('change', renderTable);


// Delete transaction
function deleteTransaction(id) {
  transactions = transactions.filter(t => t.id !== id);
  saveAndRender();
}


// Calculate totals
function calculateTotals() {
  let income = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  let expense = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  return {
    income,
    expense,
    balance: income - expense
  };
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

  const rows = transactions
    .filter(t => filter === 'all' || t.type === filter)
    .slice()
    .reverse()
    .map(t => `
      <tr class="${t.type}">
        <td>${escapeHTML(t.desc)}</td>
        <td>PKR ${fmt(t.amount)}</td>
        <td>${t.type}</td>
        <td>${escapeHTML(t.category)}</td>
        <td>${formatDate(t.date)}</td>
        <td><button onclick="deleteTransaction(${t.id})">Delete</button></td>
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
  transactions
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

// Initial render
saveAndRender();

