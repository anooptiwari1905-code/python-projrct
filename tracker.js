/**
 * Expense Tracker Frontend Application
 * Dual-Mode Engine: Works with Python backend server OR standalone via Browser LocalStorage.
 * Multi-User Profile Support with Password Authentication & Zero Data Loss.
 */

// Initial Seed for Anoop's 15 existing expenses (safely preserved for offline / standalone mode)
const SEED_ANOOP_EXPENSES = [
  { "date": "2026-08-29", "category": "Clothing", "amount": 1149.0, "note": "Anoop shirt" },
  { "date": "2026-09-02", "category": "Clothing", "amount": 918.0, "note": "Anoop shirt" },
  { "date": "2026-09-02", "category": "Clothing", "amount": 878.6, "note": "XYXX underwear" },
  { "date": "2026-09-04", "category": "Udhar", "amount": 170.93, "note": "Akash bhaiya" },
  { "date": "2026-09-01", "category": "Monthly Expense", "amount": 15.0, "note": "popcorn" },
  { "date": "2026-09-02", "category": "Monthly Expense", "amount": 40.0, "note": "noodeles and tea" },
  { "date": "2026-09-02", "category": "Monthly Expense", "amount": 53.0, "note": "dosa" },
  { "date": "2026-09-02", "category": "Monthly Expense", "amount": 10.0, "note": "milk" },
  { "date": "2026-09-03", "category": "Monthly Expense", "amount": 75.0, "note": "outing with hariom and dev" },
  { "date": "2026-09-05", "category": "Haircut", "amount": 250.0, "note": "mine haircut" },
  { "date": "2026-09-06", "category": "Monthly Expense", "amount": 72.0, "note": "milk , buttermilk , samosa" },
  { "date": "2026-09-05", "category": "Monthly Expense", "amount": 10.0, "note": "TEA" },
  { "date": "2026-09-06", "category": "Monthly Expense", "amount": 35.0, "note": "egg" },
  { "date": "2026-09-06", "category": "Monthly Expense", "amount": 15.0, "note": "milk" },
  { "date": "2026-09-06", "category": "Monthly Expense", "amount": 10.06, "note": "milk" }
];

// App State
let currentUser = null;
let allExpenses = [];
let pendingDeleteIndex = null;
let isServerOnline = false;
let authMode = 'login'; // 'login' or 'register'

// Determine API origin (handles file:///, localhost:5500 Live Server, and direct Python server)
function getApiBaseUrl() {
  if (window.location.protocol === 'file:') {
    return 'http://127.0.0.1:5000';
  }
  if (window.location.port === '5000' || window.location.port === '5001') {
    return '';
  }
  return 'http://127.0.0.1:5000';
}

// Category Badge Color Mapping
const categoryColors = {
  'clothing': { bg: '#ede9fe', text: '#6d28d9', dot: '#8b5cf6' },
  'food': { bg: '#fef3c7', text: '#b45309', dot: '#f59e0b' },
  'food & dining': { bg: '#fef3c7', text: '#b45309', dot: '#f59e0b' },
  'monthly expense': { bg: '#e0f2fe', text: '#0369a1', dot: '#0284c7' },
  'udhar': { bg: '#fee2e2', text: '#b91c1c', dot: '#ef4444' },
  'haircut': { bg: '#ccfbf1', text: '#0f766e', dot: '#14b8a6' },
  'travel': { bg: '#fce7f3', text: '#be185d', dot: '#ec4899' },
  'travel & commute': { bg: '#fce7f3', text: '#be185d', dot: '#ec4899' },
  'groceries': { bg: '#dcfce7', text: '#15803d', dot: '#22c55e' },
  'bills & utilities': { bg: '#ffedd5', text: '#c2410c', dot: '#f97316' },
  'entertainment': { bg: '#f3e8ff', text: '#7e22ce', dot: '#a855f7' },
  'default': { bg: '#f1f5f9', text: '#334155', dot: '#64748b' }
};

function getCategoryColor(category) {
  if (!category) return categoryColors.default;
  const key = category.toLowerCase().trim();
  return categoryColors[key] || categoryColors.default;
}

// Format Currency in INR (₹)
function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return '₹' + num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// Format Date string nicely
function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      return d.toLocaleDateString('en-IN', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    }
    return dateStr;
  } catch (e) {
    return dateStr;
  }
}

// ==========================================================================
// LocalStorage Multi-User Manager (Offline & Standalone Fallback)
// ==========================================================================
function getLocalUsers() {
  try {
    const data = localStorage.getItem('expense_tracker_users');
    if (data) {
      const parsed = jsonParseSafe(data, null);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) {
    console.warn('Could not read localStorage users:', e);
  }

  // Pre-seed with Anoop and previous 15 expenses so data is NEVER lost
  const initial = {
    'anoop': {
      password: '1234',
      created_at: new Date().toISOString(),
      expenses: [...SEED_ANOOP_EXPENSES]
    }
  };
  saveLocalUsers(initial);
  return initial;
}

function saveLocalUsers(users) {
  try {
    localStorage.setItem('expense_tracker_users', JSON.stringify(users));
  } catch (e) {
    console.error('Could not save to localStorage:', e);
  }
}

function jsonParseSafe(str, fallback) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
}

// ==========================================================================
// Server Connection & Health Check
// ==========================================================================
async function checkServerHealth() {
  const badge = document.getElementById('serverBadge');
  const banner = document.getElementById('offlineBanner');
  const syncTime = document.getElementById('syncTime');
  const apiBase = getApiBaseUrl();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    const res = await fetch(`${apiBase}/api/ping`, {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      isServerOnline = true;
      if (badge) {
        badge.className = 'server-badge';
        badge.innerHTML = '<span class="status-dot"></span> Live Server Connected';
      }
      if (banner) banner.style.display = 'none';
      if (syncTime) {
        const now = new Date();
        syncTime.textContent = 'Synced: ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return true;
    }
  } catch (err) {
    // Expected when running directly from HTML file without Python
  }

  isServerOnline = false;
  if (badge) {
    badge.className = 'server-badge local';
    badge.innerHTML = '<span class="status-dot"></span> Local Browser Mode';
  }
  if (banner) {
    banner.style.display = 'flex';
  }
  if (syncTime) {
    syncTime.textContent = 'Saved in Browser';
  }
  return false;
}

async function checkServerAndSync() {
  const wasOnline = isServerOnline;
  showToast('Checking connection to Python server...', 'info', 2000);
  const isOnline = await checkServerHealth();

  if (isOnline) {
    showToast('Python server detected! Syncing data...', 'success');
    if (currentUser) {
      await loadUserExpenses(currentUser);
    }
  } else {
    showToast('Python server not running. Running safely in Local Browser Mode.', 'info', 3500);
  }
}

// ==========================================================================
// User Authentication & Session Management
// ==========================================================================
function updateProfileHeader() {
  const profileWidget = document.getElementById('userProfileWidget');
  const avatar = document.getElementById('userAvatar');
  const nameLabel = document.getElementById('userNameLabel');
  const txCount = document.getElementById('userTxCount');

  if (!currentUser) {
    if (profileWidget) profileWidget.style.display = 'none';
    return;
  }

  if (profileWidget) profileWidget.style.display = 'flex';
  if (avatar) avatar.textContent = currentUser.charAt(0).toUpperCase();
  if (nameLabel) nameLabel.textContent = currentUser.charAt(0).toUpperCase() + currentUser.slice(1);
  if (txCount) txCount.textContent = `${allExpenses.length} expense${allExpenses.length === 1 ? '' : 's'}`;
}

function showAuthModal() {
  const modal = document.getElementById('authModal');
  const authMsg = document.getElementById('authMsg');
  if (authMsg) authMsg.style.display = 'none';
  if (modal) modal.classList.add('active');
}

function hideAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.remove('active');
}

function setAuthMode(mode) {
  authMode = mode;
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const subtitle = document.getElementById('authSubtitle');
  const submitBtn = document.getElementById('authSubmitBtn');
  const quickBox = document.getElementById('quickLoginBox');
  const authMsg = document.getElementById('authMsg');
  if (authMsg) authMsg.style.display = 'none';

  if (mode === 'login') {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    subtitle.textContent = 'Log in to access your personal finances';
    submitBtn.textContent = 'Log In';
    if (quickBox) quickBox.style.display = 'block';
  } else {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    subtitle.textContent = 'Create a new personal expense profile';
    submitBtn.textContent = 'Create Profile & Sign In';
    if (quickBox) quickBox.style.display = 'none';
  }
}

function showAuthMessage(text, type = 'error') {
  const msgEl = document.getElementById('authMsg');
  if (!msgEl) return;
  msgEl.className = `auth-msg ${type}`;
  msgEl.textContent = text;
  msgEl.style.display = 'block';
}

// Perform Login
async function handleLogin(username, password) {
  username = (username || '').trim().toLowerCase();
  password = (password || '').trim();

  if (!username || !password) {
    showAuthMessage('Please enter both username and password.');
    return;
  }

  // 1. Try server login if server is online
  if (isServerOnline) {
    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!res.ok) {
        showAuthMessage(data.error || 'Login failed.');
        return;
      }

      // Success
      setCurrentUserSession(username);
      allExpenses = Array.isArray(data.expenses) ? data.expenses : [];
      // Also cache in local users
      const localUsers = getLocalUsers();
      localUsers[username] = {
        password: password,
        expenses: allExpenses
      };
      saveLocalUsers(localUsers);

      hideAuthModal();
      updateProfileHeader();
      renderAll();
      showToast(`Welcome back, ${username}!`, 'success');
      return;
    } catch (e) {
      console.warn('Server login error, falling back to local:', e);
    }
  }

  // 2. Local fallback login
  const users = getLocalUsers();
  if (!users[username]) {
    showAuthMessage(`User '${username}' not found. Please click 'Create Account'.`);
    return;
  }

  if (users[username].password !== password) {
    showAuthMessage('Incorrect password. Please try again.');
    return;
  }

  setCurrentUserSession(username);
  allExpenses = users[username].expenses || [];
  hideAuthModal();
  updateProfileHeader();
  renderAll();
  showToast(`Logged in as ${username}`, 'success');
}

// Perform Registration
async function handleRegister(username, password) {
  username = (username || '').trim().toLowerCase();
  password = (password || '').trim();

  if (!username || !password) {
    showAuthMessage('Username and password cannot be empty.');
    return;
  }

  if (username.length < 2) {
    showAuthMessage('Username must be at least 2 characters.');
    return;
  }

  // 1. Try server registration if online
  if (isServerOnline) {
    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!res.ok) {
        showAuthMessage(data.error || 'Registration failed.');
        return;
      }

      setCurrentUserSession(username);
      allExpenses = [];
      const localUsers = getLocalUsers();
      localUsers[username] = { password, expenses: [] };
      saveLocalUsers(localUsers);

      hideAuthModal();
      updateProfileHeader();
      renderAll();
      showToast(`Account '${username}' created successfully!`, 'success');
      return;
    } catch (e) {
      console.warn('Server registration error, falling back to local:', e);
    }
  }

  // 2. Local fallback registration
  const users = getLocalUsers();
  if (users[username]) {
    showAuthMessage(`Username '${username}' is already taken. Please choose another or log in.`);
    return;
  }

  users[username] = {
    password: password,
    created_at: new Date().toISOString(),
    expenses: []
  };
  saveLocalUsers(users);

  setCurrentUserSession(username);
  allExpenses = [];
  hideAuthModal();
  updateProfileHeader();
  renderAll();
  showToast(`Account '${username}' created successfully!`, 'success');
}

function setCurrentUserSession(username) {
  currentUser = username;
  try {
    localStorage.setItem('expense_tracker_active_user', username);
  } catch (e) {}
}

function logoutUser() {
  currentUser = null;
  allExpenses = [];
  try {
    localStorage.removeItem('expense_tracker_active_user');
  } catch (e) {}
  updateProfileHeader();
  renderAll();
  showAuthModal();
  showToast('Logged out successfully', 'info');
}

// Load expenses for active user
async function loadUserExpenses(username) {
  if (!username) return;

  // 1. Try loading from server if online
  if (isServerOnline) {
    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/expenses?user=${encodeURIComponent(username)}`);
      if (res.ok) {
        const data = await res.json();
        allExpenses = Array.isArray(data) ? data : [];
        // Update local backup
        const users = getLocalUsers();
        if (users[username]) {
          users[username].expenses = allExpenses;
          saveLocalUsers(users);
        }
        updateProfileHeader();
        renderAll();
        return;
      }
    } catch (e) {
      console.warn('Error fetching expenses from server:', e);
    }
  }

  // 2. Load from local storage
  const users = getLocalUsers();
  if (users[username]) {
    allExpenses = users[username].expenses || [];
  } else {
    allExpenses = [];
  }
  updateProfileHeader();
  renderAll();
}

// ==========================================================================
// Master Render Functions
// ==========================================================================
function renderAll() {
  renderSummaryMetrics();
  renderCategoryBreakdown();
  renderCategoryFilterOptions();
  renderTransactionsTable();
  updateProfileHeader();
}

// Render Top Metrics
function renderSummaryMetrics() {
  const totalSpentEl = document.getElementById('metricTotalSpent');
  const monthSpentEl = document.getElementById('metricMonthSpent');
  const countEl = document.getElementById('metricCount');
  const topCatEl = document.getElementById('metricTopCat');
  const topCatSubEl = document.getElementById('metricTopCatSub');

  if (!allExpenses || allExpenses.length === 0) {
    if (totalSpentEl) totalSpentEl.textContent = '₹0.00';
    if (monthSpentEl) monthSpentEl.textContent = '₹0.00';
    if (countEl) countEl.textContent = '0';
    if (topCatEl) topCatEl.textContent = 'None';
    if (topCatSubEl) topCatSubEl.textContent = '₹0.00 total';
    return;
  }

  // Grand Total
  const total = allExpenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  if (totalSpentEl) totalSpentEl.textContent = formatCurrency(total);

  // This Month's Total
  const today = new Date();
  const currentYearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const thisMonthTotal = allExpenses
    .filter(item => item.date && item.date.startsWith(currentYearMonth))
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  if (monthSpentEl) monthSpentEl.textContent = formatCurrency(thisMonthTotal);

  // Transaction Count
  if (countEl) countEl.textContent = allExpenses.length;

  // Top Category
  const catTotals = {};
  allExpenses.forEach(item => {
    const cat = item.category || 'Uncategorized';
    catTotals[cat] = (catTotals[cat] || 0) + (Number(item.amount) || 0);
  });

  let topCat = 'None';
  let topCatVal = 0;
  Object.entries(catTotals).forEach(([cat, sum]) => {
    if (sum > topCatVal) {
      topCat = cat;
      topCatVal = sum;
    }
  });

  if (topCatEl) topCatEl.textContent = topCat;
  if (topCatSubEl) topCatSubEl.textContent = `${formatCurrency(topCatVal)} total`;
}

// Render Category Breakdown Progress Bars
function renderCategoryBreakdown() {
  const container = document.getElementById('categoryBarsContainer');
  if (!container) return;

  if (!allExpenses || allExpenses.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📊</div>
        <p>No expense data recorded yet for this profile.</p>
      </div>`;
    return;
  }

  const totals = {};
  const counts = {};
  let grandTotal = 0;

  allExpenses.forEach(item => {
    const cat = item.category || 'Uncategorized';
    const amt = Number(item.amount) || 0;
    totals[cat] = (totals[cat] || 0) + amt;
    counts[cat] = (counts[cat] || 0) + 1;
    grandTotal += amt;
  });

  const sortedCats = Object.entries(totals).sort((a, b) => b[1] - a[1]);

  let html = '';
  sortedCats.forEach(([cat, amount]) => {
    const pct = grandTotal > 0 ? ((amount / grandTotal) * 100).toFixed(1) : 0;
    const colors = getCategoryColor(cat);
    const count = counts[cat];

    html += `
      <div class="category-bar-item">
        <div class="cat-bar-header">
          <div class="cat-name-pill">
            <span class="cat-color-dot" style="background-color: ${colors.dot}"></span>
            <span>${escapeHtml(cat)}</span>
            <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 400;">(${count} item${count > 1 ? 's' : ''})</span>
          </div>
          <div class="cat-amounts">
            <span>${formatCurrency(amount)}</span>
            <span class="cat-pct">${pct}%</span>
          </div>
        </div>
        <div class="cat-progress-track">
          <div class="cat-progress-fill" style="width: ${pct}%; background-color: ${colors.dot};"></div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// Populate Category Filter Dropdown
function renderCategoryFilterOptions() {
  const filterSelect = document.getElementById('categoryFilter');
  if (!filterSelect) return;

  const currentSelection = filterSelect.value;
  const categories = new Set();
  allExpenses.forEach(item => {
    if (item.category) categories.add(item.category);
  });

  const sorted = Array.from(categories).sort();
  let html = '<option value="all">All Categories</option>';
  sorted.forEach(cat => {
    html += `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`;
  });

  filterSelect.innerHTML = html;
  if (categories.has(currentSelection) || currentSelection === 'all') {
    filterSelect.value = currentSelection;
  }
}

// Render Transactions Table with Search, Filter & Sorting
function renderTransactionsTable() {
  const tbody = document.getElementById('expenseTableBody');
  const countEl = document.getElementById('filteredCount');
  const sumEl = document.getElementById('filteredSum');
  if (!tbody) return;

  const searchVal = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
  const categoryVal = document.getElementById('categoryFilter')?.value || 'all';
  const dateRangeVal = document.getElementById('dateRangeFilter')?.value || 'all';
  const sortVal = document.getElementById('sortFilter')?.value || 'newest';

  let list = allExpenses.map((item, originalIndex) => ({ ...item, originalIndex }));

  // Filter by category
  if (categoryVal !== 'all') {
    list = list.filter(item => (item.category || '').toLowerCase() === categoryVal.toLowerCase());
  }

  // Filter by search query
  if (searchVal) {
    list = list.filter(item => {
      const note = (item.note || '').toLowerCase();
      const cat = (item.category || '').toLowerCase();
      const amt = String(item.amount || '');
      return note.includes(searchVal) || cat.includes(searchVal) || amt.includes(searchVal);
    });
  }

  // Filter by date range
  const now = new Date();
  if (dateRangeVal === 'today') {
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    list = list.filter(item => item.date === todayStr);
  } else if (dateRangeVal === 'this_month') {
    const yyyyMm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    list = list.filter(item => item.date && item.date.startsWith(yyyyMm));
  } else if (dateRangeVal === 'last_30') {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    list = list.filter(item => item.date && new Date(item.date) >= thirtyDaysAgo);
  }

  // Sort
  list.sort((a, b) => {
    if (sortVal === 'newest') {
      if (b.date !== a.date) return (b.date || '').localeCompare(a.date || '');
      return b.originalIndex - a.originalIndex;
    } else if (sortVal === 'oldest') {
      if (a.date !== b.date) return (a.date || '').localeCompare(b.date || '');
      return a.originalIndex - b.originalIndex;
    } else if (sortVal === 'amount_desc') {
      return (Number(b.amount) || 0) - (Number(a.amount) || 0);
    } else if (sortVal === 'amount_asc') {
      return (Number(a.amount) || 0) - (Number(b.amount) || 0);
    }
    return 0;
  });

  const filteredTotal = list.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  if (countEl) countEl.textContent = `Showing ${list.length} of ${allExpenses.length} transactions`;
  if (sumEl) sumEl.textContent = `Filtered Total: ${formatCurrency(filteredTotal)}`;

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">
          <div class="empty-state">
            <div class="empty-state-icon">🔍</div>
            <p>${allExpenses.length === 0 ? 'No expenses recorded yet. Add your first expense above!' : 'No expenses match your search or filter criteria.'}</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  let html = '';
  list.forEach(item => {
    const colors = getCategoryColor(item.category);
    html += `
      <tr>
        <td class="col-date">${escapeHtml(formatDate(item.date))}</td>
        <td>
          <span class="category-badge" style="background-color: ${colors.bg}; color: ${colors.text};">
            <span class="cat-color-dot" style="background-color: ${colors.dot}"></span>
            ${escapeHtml(item.category || 'Uncategorized')}
          </span>
        </td>
        <td class="expense-note">${item.note ? escapeHtml(item.note) : '<span style="color: var(--text-light);">-</span>'}</td>
        <td class="expense-amount">${formatCurrency(item.amount)}</td>
        <td style="text-align: right;">
          <button class="btn-delete" title="Delete this expense" onclick="promptDelete(${item.originalIndex})">
            🗑️ Delete
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

// ==========================================================================
// Add Expense Form Handler
// ==========================================================================
async function handleAddExpense(e) {
  e.preventDefault();

  if (!currentUser) {
    showToast('Please log in first to record an expense.', 'danger');
    showAuthModal();
    return;
  }

  const dateInput = document.getElementById('expenseDate');
  const catSelect = document.getElementById('expenseCategory');
  const customCatInput = document.getElementById('customCategoryInput');
  const amountInput = document.getElementById('expenseAmount');
  const noteInput = document.getElementById('expenseNote');
  const submitBtn = document.getElementById('submitExpenseBtn');

  const date = dateInput.value.trim();
  let category = catSelect.value;
  if (category === '__custom__') {
    category = (customCatInput.value || '').trim();
    if (!category) {
      showToast('Please enter a custom category name.', 'danger');
      customCatInput.focus();
      return;
    }
  }

  const amount = parseFloat(amountInput.value);
  const note = (noteInput.value || '').trim();

  if (!date) {
    showToast('Please select a valid date.', 'danger');
    return;
  }

  if (isNaN(amount) || amount <= 0) {
    showToast('Please enter an amount greater than 0.', 'danger');
    amountInput.focus();
    return;
  }

  const payload = {
    user: currentUser,
    date: date,
    category: category || 'Uncategorized',
    amount: Math.round(amount * 100) / 100,
    note: note
  };

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
  }

  // 1. Try server save if online
  if (isServerOnline) {
    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        if (data.expenses && Array.isArray(data.expenses)) {
          allExpenses = data.expenses;
        } else {
          allExpenses.push(payload);
        }

        // Sync local storage
        const users = getLocalUsers();
        if (users[currentUser]) {
          users[currentUser].expenses = allExpenses;
          saveLocalUsers(users);
        }

        finishAddExpense(payload, amountInput, noteInput, catSelect, customCatInput, submitBtn);
        return;
      }
    } catch (err) {
      console.warn('Server save failed, switching to local storage:', err);
      isServerOnline = false;
    }
  }

  // 2. Local storage save
  const users = getLocalUsers();
  if (!users[currentUser]) {
    users[currentUser] = { password: '1234', expenses: [] };
  }
  users[currentUser].expenses.push(payload);
  saveLocalUsers(users);
  allExpenses = users[currentUser].expenses;

  finishAddExpense(payload, amountInput, noteInput, catSelect, customCatInput, submitBtn);
}

function finishAddExpense(payload, amountInput, noteInput, catSelect, customCatInput, submitBtn) {
  showToast(`Added: ${payload.category} (${formatCurrency(payload.amount)})`, 'success');

  amountInput.value = '';
  noteInput.value = '';
  if (catSelect.value === '__custom__') {
    catSelect.value = 'Clothing';
    document.getElementById('customCategoryGroup').style.display = 'none';
    customCatInput.value = '';
  }
  initDateField();

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>➕</span> Add Expense';
  }

  renderAll();
}

// ==========================================================================
// Delete Expense Flow
// ==========================================================================
function promptDelete(originalIndex) {
  if (originalIndex < 0 || originalIndex >= allExpenses.length) return;
  const item = allExpenses[originalIndex];
  pendingDeleteIndex = originalIndex;

  const modal = document.getElementById('deleteModal');
  const desc = document.getElementById('deleteModalDesc');

  if (desc) {
    desc.innerHTML = `Are you sure you want to delete this expense?<br><br><strong>${escapeHtml(item.category)}: ${formatCurrency(item.amount)}</strong> on <em>${formatDate(item.date)}</em><br>Note: ${item.note ? escapeHtml(item.note) : 'None'}`;
  }

  if (modal) {
    modal.classList.add('active');
  }
}

function closeDeleteModal() {
  const modal = document.getElementById('deleteModal');
  if (modal) modal.classList.remove('active');
  pendingDeleteIndex = null;
}

async function confirmDelete() {
  if (pendingDeleteIndex === null) return;
  const idx = pendingDeleteIndex;
  closeDeleteModal();

  const item = allExpenses[idx];

  // 1. Try server delete if online
  if (isServerOnline) {
    try {
      const apiBase = getApiBaseUrl();
      let res = await fetch(`${apiBase}/api/expenses/${idx}?user=${encodeURIComponent(currentUser)}`, { method: 'DELETE' });
      if (!res.ok) {
        res = await fetch(`${apiBase}/api/expenses/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ index: idx, user: currentUser })
        });
      }

      if (res.ok) {
        const data = await res.json();
        if (data.expenses && Array.isArray(data.expenses)) {
          allExpenses = data.expenses;
        } else {
          allExpenses.splice(idx, 1);
        }

        const users = getLocalUsers();
        if (users[currentUser]) {
          users[currentUser].expenses = allExpenses;
          saveLocalUsers(users);
        }

        showToast(`Deleted: ${item.category} (${formatCurrency(item.amount)})`, 'info');
        renderAll();
        return;
      }
    } catch (err) {
      console.warn('Server delete failed, falling back to local:', err);
    }
  }

  // 2. Local storage delete
  const users = getLocalUsers();
  if (users[currentUser] && Array.isArray(users[currentUser].expenses)) {
    users[currentUser].expenses.splice(idx, 1);
    saveLocalUsers(users);
    allExpenses = users[currentUser].expenses;
  } else {
    allExpenses.splice(idx, 1);
  }

  showToast(`Deleted: ${item.category} (${formatCurrency(item.amount)})`, 'info');
  renderAll();
}

// Toast notification helper
function showToast(msg, type = 'info', duration = 3200) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Utility: Escape HTML
function escapeHtml(str) {
  if (typeof str !== 'string') return String(str ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Initialize today's date in input field
function initDateField() {
  const dateInput = document.getElementById('expenseDate');
  if (dateInput) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }
}

// ==========================================================================
// App Initialization
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  initDateField();

  // Category select change (custom category reveal)
  const catSelect = document.getElementById('expenseCategory');
  const customGroup = document.getElementById('customCategoryGroup');
  if (catSelect && customGroup) {
    catSelect.addEventListener('change', () => {
      if (catSelect.value === '__custom__') {
        customGroup.style.display = 'block';
        document.getElementById('customCategoryInput')?.focus();
      } else {
        customGroup.style.display = 'none';
      }
    });
  }

  // Add Expense form listener
  const form = document.getElementById('addExpenseForm');
  if (form) {
    form.addEventListener('submit', handleAddExpense);
  }

  // Filter and search listeners
  document.getElementById('searchInput')?.addEventListener('input', renderTransactionsTable);
  document.getElementById('categoryFilter')?.addEventListener('change', renderTransactionsTable);
  document.getElementById('dateRangeFilter')?.addEventListener('change', renderTransactionsTable);
  document.getElementById('sortFilter')?.addEventListener('change', renderTransactionsTable);

  // Modal Cancel & Confirm listeners
  document.getElementById('modalCancelBtn')?.addEventListener('click', closeDeleteModal);
  document.getElementById('modalConfirmBtn')?.addEventListener('click', confirmDelete);
  document.getElementById('deleteModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'deleteModal') closeDeleteModal();
  });

  // Auth Modal Listeners
  document.getElementById('tabLogin')?.addEventListener('click', () => setAuthMode('login'));
  document.getElementById('tabRegister')?.addEventListener('click', () => setAuthMode('register'));

  // Auth Form Submit
  document.getElementById('authForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('authUsername')?.value;
    const password = document.getElementById('authPassword')?.value;
    if (authMode === 'login') {
      handleLogin(username, password);
    } else {
      handleRegister(username, password);
    }
  });

  // Quick Login button for Anoop
  document.getElementById('btnQuickAnoop')?.addEventListener('click', () => {
    handleLogin('anoop', '1234');
  });

  // Logout button
  document.getElementById('logoutBtn')?.addEventListener('click', logoutUser);

  // Check server health
  await checkServerHealth();

  // Check existing session
  const savedUser = localStorage.getItem('expense_tracker_active_user');
  if (savedUser) {
    currentUser = savedUser;
    await loadUserExpenses(savedUser);
  } else {
    // If no active session, show the login modal
    showAuthModal();
  }
});
