/* ==========================================================================
   MONETA - FAMILY EXPENSE MANAGER (MOBILE-FIRST)
   Firebase Authentication & Real-Time Cloud Firestore
   ========================================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyDPGtkJJaKxL_ENYAvtt4JeVHVgbqF5tRA",
  authDomain: "moneta-cfae8.firebaseapp.com",
  projectId: "moneta-cfae8",
  storageBucket: "moneta-cfae8.firebasestorage.app",
  messagingSenderId: "964666902235",
  appId: "1:964666902235:web:8db6f4c1ac0c1425852efe"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

// Global State
let currentUser = null;
let currentFamily = null;
let currentFamilyId = null;
let currentMember = null;
let expenses = [];
let members = [];
let categories = [];
let activeCategoryFilter = "all";
let expenseToDelete = null;

// Realtime Unsubscribers
let expenseUnsubscribe = null;
let memberUnsubscribe = null;
let familyUnsubscribe = null;

// UI State
let authMode = "login";
let currentView = "dashboardView";

const DEFAULT_CATEGORIES = [
  "Grocery",
  "Dairy Products",
  "Vegetables",
  "Fruits",
  "Food",
  "Transport",
  "Bills",
  "Shopping",
  "Healthcare",
  "Entertainment",
  "Other"
];

const CATEGORY_ICONS = {
  "grocery": "🛒",
  "dairy products": "🥛",
  "dairy": "🥛",
  "vegetables": "🥦",
  "fruits": "🍎",
  "food": "🍽️",
  "transport": "🚗",
  "bills": "⚡",
  "shopping": "🛍️",
  "healthcare": "💊",
  "entertainment": "🎬",
  "education": "📚",
  "other": "📦"
};

const $ = id => document.getElementById(id);

const money = amount =>
  "₹" + Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

function getCategoryIcon(cat) {
  const key = String(cat || "").toLowerCase().trim();
  return CATEGORY_ICONS[key] || "💳";
}

function vibrate(pattern = 15) {
  if ("vibrate" in navigator) {
    try { navigator.vibrate(pattern); } catch (e) {}
  }
}

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  vibrate(20);
  setTimeout(() => toast.classList.remove("show"), 2800);
}

function setBusy(button, busy, busyText = "Please wait...") {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span>⏳</span> <span>${busyText}</span>`;
  } else {
    button.disabled = false;
    button.innerHTML = button.dataset.originalText || button.innerHTML;
  }
}

function show(element, visible) {
  if (element) element.classList.toggle("hidden", !visible);
}

function getTodayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getMonthValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getSelectedMonth() {
  return $("monthFilter")?.value || getMonthValue();
}

function isThisMonth(expense, month = getMonthValue()) {
  return String(expense.date || "").slice(0, 7) === month;
}

function safeText(str) {
  return String(str ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function stopListeners() {
  if (expenseUnsubscribe) expenseUnsubscribe();
  if (memberUnsubscribe) memberUnsubscribe();
  if (familyUnsubscribe) familyUnsubscribe();

  expenseUnsubscribe = null;
  memberUnsubscribe = null;
  familyUnsubscribe = null;
}

/* ==========================================================================
   NAVIGATION & VIEW SWITCHER
   ========================================================================== */

function switchView(viewId) {
  currentView = viewId;

  // Toggle view elements
  ["dashboardView", "expensesView", "analyticsView", "familyView", "noFamilyView"].forEach(id => {
    const el = $(id);
    if (el) show(el, id === viewId);
  });

  // Highlight bottom navigation tabs
  document.querySelectorAll(".nav-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.view === viewId);
  });

  // Trigger relevant renderers
  if (viewId === "dashboardView") renderDashboard();
  if (viewId === "expensesView") renderExpenses();
  if (viewId === "analyticsView") renderAnalytics();
  if (viewId === "familyView") renderFamilySettings();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll(".nav-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    vibrate(10);
    switchView(tab.dataset.view);
  });
});

$("openFamilyPill")?.addEventListener("click", () => {
  vibrate(10);
  switchView("familyView");
});

$("viewAllExpensesBtn")?.addEventListener("click", () => {
  vibrate(10);
  switchView("expensesView");
});

/* ==========================================================================
   AUTHENTICATION LOGIC
   ========================================================================== */

function setAuthMode(mode) {
  authMode = mode;
  const isSignup = mode === "signup";

  $("tabLogin")?.classList.toggle("active", !isSignup);
  $("tabSignup")?.classList.toggle("active", isSignup);

  $("authTitle").textContent = isSignup ? "Create Account" : "Welcome back";
  $("authSubtitle").textContent = isSignup
    ? "Join or create your household family finance space."
    : "Sign in to manage your shared household budget.";

  $("authSubmit").innerHTML = isSignup
    ? `<span>Create Account</span> <span class="btn-arrow">→</span>`
    : `<span>Sign In</span> <span class="btn-arrow">→</span>`;

  show($("nameField"), isSignup);
  $("authName").required = isSignup;
  $("authMessage").textContent = "";
}

$("tabLogin")?.addEventListener("click", () => setAuthMode("login"));
$("tabSignup")?.addEventListener("click", () => setAuthMode("signup"));

$("authForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const button = $("authSubmit");
  const email = $("authEmail").value.trim().toLowerCase();
  const password = $("authPassword").value;
  const name = $("authName").value.trim();

  setBusy(button, true, "Verifying...");
  $("authMessage").textContent = "";

  try {
    if (authMode === "signup") {
      if (!name) throw new Error("Please enter your name.");

      const result = await auth.createUserWithEmailAndPassword(email, password);

      await db.collection("users").doc(result.user.uid).set({
        name,
        email,
        familyId: null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      await result.user.updateProfile({ displayName: name });
      showToast("Account created successfully!");
    } else {
      await auth.signInWithEmailAndPassword(email, password);
      showToast("Signed in successfully!");
    }
  } catch (error) {
    $("authMessage").textContent = error.message;
    $("authMessage").className = "feedback-msg error";
    vibrate([40, 60, 40]);
  } finally {
    setBusy(button, false);
  }
});

$("forgotPassword")?.addEventListener("click", async () => {
  const email = $("authEmail").value.trim().toLowerCase();

  if (!email) {
    $("authMessage").textContent = "Please enter your email address first.";
    $("authMessage").className = "feedback-msg error";
    $("authEmail").focus();
    return;
  }

  try {
    await auth.sendPasswordResetEmail(email);
    $("authMessage").textContent = "Password reset email sent! Check your inbox.";
    $("authMessage").className = "feedback-msg success";
    showToast("Password reset email sent.");
  } catch (error) {
    $("authMessage").textContent = error.message;
    $("authMessage").className = "feedback-msg error";
  }
});

$("logoutBtn")?.addEventListener("click", async () => {
  vibrate(15);
  stopListeners();
  await auth.signOut();
  currentUser = null;
  currentFamily = null;
  currentFamilyId = null;
  expenses = [];
  members = [];
  showAuthScreen();
  showToast("Signed out.");
});

function showAuthScreen() {
  show($("authScreen"), true);
  show($("appShell"), false);
}

function showAppShell() {
  show($("authScreen"), false);
  show($("appShell"), true);
}

/* ==========================================================================
   AUTH STATE OBSERVER
   ========================================================================== */

auth.onAuthStateChanged(async user => {
  stopListeners();

  if (!user) {
    currentUser = null;
    currentFamily = null;
    currentFamilyId = null;
    showAuthScreen();
    return;
  }

  currentUser = user;

  try {
    const userRef = db.collection("users").doc(user.uid);
    let userSnap = await userRef.get();

    if (!userSnap.exists) {
      await userRef.set({
        name: user.displayName || user.email.split("@")[0],
        email: user.email,
        familyId: null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      userSnap = await userRef.get();
    }

    const userData = userSnap.data() || {};
    const displayName = userData.name || user.displayName || user.email.split("@")[0];

    $("topGreeting").textContent = `Hello, ${displayName.split(" ")[0]}`;
    $("userAvatar").textContent = displayName.charAt(0).toUpperCase();

    currentFamilyId = userData.familyId || null;

    if (!currentFamilyId) {
      showAppShell();
      switchView("noFamilyView");
      return;
    }

    const familySnap = await db.collection("families").doc(currentFamilyId).get();

    if (!familySnap.exists) {
      await userRef.set({ familyId: null }, { merge: true });
      currentFamilyId = null;
      showAppShell();
      switchView("noFamilyView");
      return;
    }

    currentFamily = { id: familySnap.id, ...familySnap.data() };

    const memberSnap = await db.collection("families")
      .doc(currentFamilyId)
      .collection("members")
      .doc(user.uid)
      .get();

    if (!memberSnap.exists) {
      await userRef.set({ familyId: null }, { merge: true });
      currentFamilyId = null;
      currentFamily = null;
      showAppShell();
      switchView("noFamilyView");
      return;
    }

    currentMember = memberSnap.data();
    categories = currentFamily.categories || [...DEFAULT_CATEGORIES];

    $("topFamilyBadge").textContent = currentFamily.name || "Family";
    $("dashboardMonth").value = getMonthValue();
    $("monthFilter").value = getMonthValue();
    $("expenseDate").value = getTodayString();

    showAppShell();
    switchView("dashboardView");
    startRealtimeListeners();

  } catch (error) {
    console.error("Auth Load Error:", error);
    showAuthScreen();
    $("authMessage").textContent = "Unable to load account: " + error.message;
  }
});

/* ==========================================================================
   FAMILY ONBOARDING (CREATE / JOIN)
   ========================================================================== */

$("segCreate")?.addEventListener("click", () => {
  $("segCreate").classList.add("active");
  $("segJoin").classList.remove("active");
  show($("createFamilyForm"), true);
  show($("joinFamilyForm"), false);
});

$("segJoin")?.addEventListener("click", () => {
  $("segJoin").classList.add("active");
  $("segCreate").classList.remove("active");
  show($("createFamilyForm"), false);
  show($("joinFamilyForm"), true);
});

$("createFamilyForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!currentUser) return;

  const button = event.submitter;
  const familyName = $("familyName").value.trim();
  const initialBudget = Number($("initialBudget").value) || 25000;

  if (!familyName) return;
  setBusy(button, true, "Creating Household...");

  try {
    const familyRef = db.collection("families").doc();
    const memberRef = familyRef.collection("members").doc(currentUser.uid);
    const userRef = db.collection("users").doc(currentUser.uid);

    const name = currentUser.displayName || currentUser.email.split("@")[0];

    const batch = db.batch();

    batch.set(familyRef, {
      name: familyName,
      ownerUid: currentUser.uid,
      budget: initialBudget,
      categories: [...DEFAULT_CATEGORIES],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    batch.set(memberRef, {
      uid: currentUser.uid,
      name,
      email: currentUser.email,
      role: "owner",
      joinedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    batch.set(userRef, {
      name,
      email: currentUser.email,
      familyId: familyRef.id
    }, { merge: true });

    await batch.commit();

    currentFamilyId = familyRef.id;
    currentFamily = {
      id: familyRef.id,
      name: familyName,
      ownerUid: currentUser.uid,
      budget: initialBudget,
      categories: [...DEFAULT_CATEGORIES]
    };
    currentMember = { role: "owner", name, email: currentUser.email };
    categories = [...DEFAULT_CATEGORIES];

    $("topFamilyBadge").textContent = familyName;
    showToast("Household created successfully! 🎉");
    switchView("dashboardView");
    startRealtimeListeners();

  } catch (error) {
    $("familyMessage").textContent = error.message;
    $("familyMessage").className = "feedback-msg error";
  } finally {
    setBusy(button, false);
  }
});

$("joinFamilyForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!currentUser) return;

  const button = event.submitter;
  const code = $("inviteCode").value.trim().toUpperCase();

  if (!code) return;
  setBusy(button, true, "Joining Household...");

  try {
    const inviteRef = db.collection("invites").doc(code);
    const userRef = db.collection("users").doc(currentUser.uid);
    const inviteSnap = await inviteRef.get();

    if (!inviteSnap.exists) throw new Error("Invitation code not found.");

    const invite = inviteSnap.data();
    if (invite.used) throw new Error("This code has already been redeemed.");
    if (invite.expiresAt && invite.expiresAt.toDate() < new Date()) {
      throw new Error("This invitation code has expired.");
    }

    const familyRef = db.collection("families").doc(invite.familyId);
    const familySnap = await familyRef.get();
    if (!familySnap.exists) throw new Error("This household no longer exists.");

    const name = currentUser.displayName || currentUser.email.split("@")[0];

    await db.runTransaction(async tx => {
      const liveInvite = await tx.get(inviteRef);
      if (!liveInvite.exists || liveInvite.data().used) {
        throw new Error("This code has already been redeemed.");
      }

      tx.set(familyRef.collection("members").doc(currentUser.uid), {
        uid: currentUser.uid,
        name,
        email: currentUser.email,
        role: "member",
        inviteCode: code,
        joinedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      tx.update(inviteRef, {
        used: true,
        usedBy: currentUser.uid,
        usedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      tx.set(userRef, {
        name,
        email: currentUser.email,
        familyId: invite.familyId
      }, { merge: true });
    });

    currentFamilyId = invite.familyId;
    currentFamily = { id: familySnap.id, ...familySnap.data() };
    currentMember = { role: "member", name, email: currentUser.email };
    categories = currentFamily.categories || [...DEFAULT_CATEGORIES];

    $("topFamilyBadge").textContent = currentFamily.name || "Family";
    showToast("Welcome to the household! 🏡");
    switchView("dashboardView");
    startRealtimeListeners();

  } catch (error) {
    $("familyMessage").textContent = error.message;
    $("familyMessage").className = "feedback-msg error";
  } finally {
    setBusy(button, false);
  }
});

/* ==========================================================================
   REAL-TIME FIRESTORE SYNC LISTENERS
   ========================================================================== */

function startRealtimeListeners() {
  if (!currentFamilyId) return;

  const familyRef = db.collection("families").doc(currentFamilyId);

  // 1. Family Document Listener
  familyUnsubscribe = familyRef.onSnapshot(doc => {
    if (!doc.exists) return;
    currentFamily = { id: doc.id, ...doc.data() };
    categories = currentFamily.categories || [...DEFAULT_CATEGORIES];

    renderCategories();
    renderDashboard();
    renderFamilySettings();
  }, err => console.error("Family listener:", err));

  // 2. Real-time Expenses Listener
  expenseUnsubscribe = familyRef.collection("expenses")
    .orderBy("date", "desc")
    .onSnapshot(snapshot => {
      expenses = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      renderDashboard();
      renderExpenses();
      renderAnalytics();
    }, err => {
      console.error("Expenses listener:", err);
      showToast("Expenses sync error: " + err.message);
    });

  // 3. Members Listener
  memberUnsubscribe = familyRef.collection("members").onSnapshot(snapshot => {
    members = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderDashboard();
    renderFamilySettings();
  }, err => console.error("Members listener:", err));
}

/* ==========================================================================
   ADD EXPENSE (BOTTOM SHEET MODAL)
   ========================================================================== */

function openAddExpenseModal() {
  vibrate(15);
  show($("addExpenseBackdrop"), true);
  $("expenseDate").value = getTodayString();
  $("price").value = "";
  $("quantity").value = "1";
  $("productName").value = "";
  $("expenseNotes").value = "";
  updateCalculatedTotal();
  renderCategories();
  setTimeout(() => $("productName")?.focus(), 150);
}

function closeAddExpenseModal() {
  show($("addExpenseBackdrop"), false);
}

$("fabAddExpense")?.addEventListener("click", openAddExpenseModal);
$("closeAddSheet")?.addEventListener("click", closeAddExpenseModal);
$("addExpenseBackdrop")?.addEventListener("click", e => {
  if (e.target === $("addExpenseBackdrop")) closeAddExpenseModal();
});

$("dateToday")?.addEventListener("click", () => {
  $("expenseDate").value = getTodayString();
  vibrate(10);
});

$("dateYesterday")?.addEventListener("click", () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  $("expenseDate").value = `${y}-${m}-${day}`;
  vibrate(10);
});

function updateCalculatedTotal() {
  const price = Number($("price")?.value) || 0;
  const quantity = Number($("quantity")?.value) || 1;
  const total = price * quantity;
  if ($("calculatedTotal")) $("calculatedTotal").textContent = money(total);
}

$("price")?.addEventListener("input", updateCalculatedTotal);
$("quantity")?.addEventListener("input", updateCalculatedTotal);

$("expenseForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentFamilyId || !currentUser) {
    showToast("Please join a family first.");
    return;
  }

  const button = $("saveExpenseBtn");
  const name = $("productName").value.trim();
  const category = $("categorySelect").value;
  const date = $("expenseDate").value;
  const price = Number($("price").value);
  const quantity = Number($("quantity").value);
  const notes = $("expenseNotes").value.trim();

  if (!name || !category || !date || price <= 0 || quantity < 1) {
    showToast("Please enter valid expense details.");
    return;
  }

  setBusy(button, true, "Saving...");

  try {
    const total = price * quantity;

    await db.collection("families").doc(currentFamilyId)
      .collection("expenses").add({
        name,
        category,
        date,
        price,
        quantity,
        total,
        notes,
        createdBy: currentUser.uid,
        createdByName: currentMember?.name || currentUser.displayName || currentUser.email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

    closeAddExpenseModal();
    showToast("Expense added! 💰");
  } catch (error) {
    console.error(error);
    showToast("Could not save: " + error.message);
  } finally {
    setBusy(button, false);
  }
});

/* ==========================================================================
   EDIT & DELETE EXPENSES (NO BROWSER PROMPTS)
   ========================================================================== */

function openEditExpenseModal(expense) {
  vibrate(15);
  $("editExpenseId").value = expense.id;
  $("editProductName").value = expense.name || "";
  $("editPrice").value = expense.price || "";
  $("editQuantity").value = expense.quantity || 1;
  $("editExpenseDate").value = expense.date || getTodayString();
  $("editExpenseNotes").value = expense.notes || "";

  // Render Category Select
  const sel = $("editCategorySelect");
  sel.innerHTML = categories.map(cat =>
    `<option value="${safeText(cat)}" ${cat === expense.category ? "selected" : ""}>${getCategoryIcon(cat)} ${safeText(cat)}</option>`
  ).join("");

  updateEditCalculatedTotal();
  show($("editExpenseBackdrop"), true);
}

function closeEditExpenseModal() {
  show($("editExpenseBackdrop"), false);
}

function updateEditCalculatedTotal() {
  const price = Number($("editPrice")?.value) || 0;
  const quantity = Number($("editQuantity")?.value) || 1;
  if ($("editCalculatedTotal")) $("editCalculatedTotal").textContent = money(price * quantity);
}

$("editPrice")?.addEventListener("input", updateEditCalculatedTotal);
$("editQuantity")?.addEventListener("input", updateEditCalculatedTotal);
$("closeEditSheet")?.addEventListener("click", closeEditExpenseModal);
$("cancelEditBtn")?.addEventListener("click", closeEditExpenseModal);
$("editExpenseBackdrop")?.addEventListener("click", e => {
  if (e.target === $("editExpenseBackdrop")) closeEditExpenseModal();
});

$("editExpenseForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  const id = $("editExpenseId").value;
  const name = $("editProductName").value.trim();
  const category = $("editCategorySelect").value;
  const price = Number($("editPrice").value);
  const quantity = Number($("editQuantity").value);
  const date = $("editExpenseDate").value;
  const notes = $("editExpenseNotes").value.trim();

  if (!id || !name || price <= 0 || quantity < 1) {
    showToast("Please enter valid details.");
    return;
  }

  const btn = $("updateExpenseBtn");
  setBusy(btn, true, "Updating...");

  try {
    await db.collection("families").doc(currentFamilyId)
      .collection("expenses").doc(id).update({
        name,
        category,
        price,
        quantity,
        total: price * quantity,
        date,
        notes
      });

    closeEditExpenseModal();
    showToast("Expense updated! ✏️");
  } catch (err) {
    showToast("Update failed: " + err.message);
  } finally {
    setBusy(btn, false);
  }
});

// Delete Modal Setup
function openDeleteModal(expense) {
  vibrate([20, 40]);
  expenseToDelete = expense;
  $("deleteConfirmMessage").textContent = `Are you sure you want to remove "${expense.name}" (${money(expense.total)})?`;
  show($("deleteBackdrop"), true);
}

function closeDeleteModal() {
  show($("deleteBackdrop"), false);
  expenseToDelete = null;
}

$("cancelDeleteBtn")?.addEventListener("click", closeDeleteModal);
$("confirmDeleteBtn")?.addEventListener("click", async () => {
  if (!expenseToDelete) return;
  const id = expenseToDelete.id;
  const btn = $("confirmDeleteBtn");

  setBusy(btn, true, "Deleting...");
  try {
    await db.collection("families").doc(currentFamilyId)
      .collection("expenses").doc(id).delete();
    closeDeleteModal();
    showToast("Expense removed. 🗑️");
  } catch (err) {
    showToast("Delete failed: " + err.message);
  } finally {
    setBusy(btn, false);
  }
});

/* ==========================================================================
   DASHBOARD RENDERER
   ========================================================================== */

function renderDashboard() {
  if (!currentFamilyId || !currentFamily) return;

  const month = $("dashboardMonth")?.value || getMonthValue();
  const monthly = expenses.filter(e => isThisMonth(e, month));
  const total = monthly.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const budget = Number(currentFamily.budget || 0);
  const remaining = budget - total;

  $("familyHeading").textContent = currentFamily.name || "Family Finances";
  $("monthTotal").textContent = money(total);
  $("transactionCount").textContent = monthly.length;

  // Daily Average calculation
  const now = new Date();
  const currentDay = now.getDate() || 1;
  const dailyAvg = total > 0 ? (total / currentDay) : 0;
  $("dailyAverage").textContent = money(dailyAvg);

  // Top Category
  const catTotals = {};
  monthly.forEach(item => {
    const c = item.category || "Other";
    catTotals[c] = (catTotals[c] || 0) + Number(item.total || 0);
  });
  let topCat = "—";
  let maxSpent = 0;
  for (const [c, spent] of Object.entries(catTotals)) {
    if (spent > maxSpent) {
      maxSpent = spent;
      topCat = c;
    }
  }
  $("topCategoryStat").textContent = topCat;

  // Budget Progress Meter
  $("budgetDisplay").textContent = `Budget: ${money(budget)}`;
  const remainingLabel = $("budgetRemaining");
  const progressFill = $("budgetProgressFill");

  if (budget > 0) {
    const percent = Math.min((total / budget) * 100, 100);
    progressFill.style.width = `${percent}%`;

    if (remaining < 0) {
      remainingLabel.textContent = `${money(Math.abs(remaining))} over budget!`;
      remainingLabel.className = "meter-status danger";
      progressFill.className = "progress-fill danger";
    } else if (percent > 80) {
      remainingLabel.textContent = `${money(remaining)} remaining`;
      remainingLabel.className = "meter-status warning";
      progressFill.className = "progress-fill warning";
    } else {
      remainingLabel.textContent = `${money(remaining)} remaining`;
      remainingLabel.className = "meter-status";
      progressFill.className = "progress-fill";
    }
  } else {
    progressFill.style.width = "0%";
    remainingLabel.textContent = "No budget set";
  }

  // Member Badges
  $("memberCountBadge").textContent = `${members.length} member${members.length === 1 ? "" : "s"}`;

  // Member Contributions
  renderMemberSpending(monthly, total);

  // Recent Expenses (Top 5)
  const recentList = monthly.slice().sort((a, b) =>
    String(b.date || "").localeCompare(String(a.date || ""))
  ).slice(0, 5);

  renderExpenseListCard($("recentExpenses"), recentList);
}

$("dashboardMonth")?.addEventListener("change", () => {
  vibrate(10);
  renderDashboard();
});

function renderMemberSpending(monthly, total) {
  const container = $("memberSpending");
  if (!container) return;

  if (!members.length) {
    container.innerHTML = `<div class="empty-state">No family members registered.</div>`;
    return;
  }

  container.innerHTML = members.map(member => {
    const memberTotal = monthly
      .filter(item => item.createdBy === member.id)
      .reduce((sum, item) => sum + Number(item.total || 0), 0);

    const percent = total > 0 ? (memberTotal / total) * 100 : 0;
    const initial = (member.name || member.email || "M").charAt(0).toUpperCase();

    return `
      <div class="member-bar-row">
        <div class="member-bar-info">
          <div class="member-name-tag">
            <span class="member-avatar-mini">${initial}</span>
            <span>${safeText(member.name || member.email || "Member")}</span>
          </div>
          <strong>${money(memberTotal)} <small style="color:var(--text-dim);font-weight:normal">(${percent.toFixed(0)}%)</small></strong>
        </div>
        <div class="member-bar-track">
          <div class="member-bar-fill" style="width: ${percent}%"></div>
        </div>
      </div>
    `;
  }).join("");
}

/* ==========================================================================
   EXPENSES VIEW RENDERER
   ========================================================================== */

function renderExpenseCard(expense) {
  const canEdit = expense.createdBy === currentUser?.uid;
  const icon = getCategoryIcon(expense.category);

  return `
    <div class="expense-card">
      <div class="expense-left">
        <div class="category-icon-box">${icon}</div>
        <div class="expense-details">
          <span class="expense-name">${safeText(expense.name)}</span>
          <span class="expense-meta">${safeText(expense.category)} · ${safeText(expense.date)} · by ${safeText(expense.createdByName || "Family")}</span>
          ${expense.notes ? `<span class="expense-notes">${safeText(expense.notes)}</span>` : ""}
        </div>
      </div>
      <div class="expense-right">
        <span class="expense-amount-tag">${money(expense.total)}</span>
        <span class="expense-unit">${money(expense.price)} × ${safeText(expense.quantity)}</span>
        ${canEdit ? `
          <div class="expense-actions-row">
            <button type="button" class="action-pill edit" data-edit-id="${safeText(expense.id)}">Edit</button>
            <button type="button" class="action-pill delete" data-delete-id="${safeText(expense.id)}">✕</button>
          </div>
        ` : ""}
      </div>
    </div>
  `;
}

function renderExpenseListCard(container, list) {
  if (!container) return;

  if (!list.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">💸</div>
        <p>No expenses found for this selection.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(renderExpenseCard).join("");
}

function renderExpenses() {
  const month = getSelectedMonth();
  const search = ($("searchInput")?.value || "").trim().toLowerCase();

  const filtered = expenses.filter(expense => {
    const matchesMonth = !month || String(expense.date || "").startsWith(month);
    const matchesCat = activeCategoryFilter === "all" ||
      String(expense.category || "").toLowerCase() === activeCategoryFilter.toLowerCase();
    const matchesSearch = !search ||
      String(expense.name || "").toLowerCase().includes(search) ||
      String(expense.category || "").toLowerCase().includes(search) ||
      String(expense.createdByName || "").toLowerCase().includes(search);

    return matchesMonth && matchesCat && matchesSearch;
  });

  renderExpenseListCard($("expenseList"), filtered);
  renderCategoryFilterChips();
}

$("monthFilter")?.addEventListener("change", renderExpenses);
$("searchInput")?.addEventListener("input", renderExpenses);

// Click delegation for Edit & Delete
document.addEventListener("click", event => {
  const editBtn = event.target.closest("[data-edit-id]");
  const deleteBtn = event.target.closest("[data-delete-id]");

  if (editBtn) {
    const exp = expenses.find(e => e.id === editBtn.dataset.editId);
    if (exp) openEditExpenseModal(exp);
  }

  if (deleteBtn) {
    const exp = expenses.find(e => e.id === deleteBtn.dataset.deleteId);
    if (exp) openDeleteModal(exp);
  }
});

/* ==========================================================================
   CATEGORY MANAGEMENT & FILTER CHIPS
   ========================================================================== */

function renderCategories() {
  // 1. Add expense select
  const select = $("categorySelect");
  if (select) {
    const currentVal = select.value;
    select.innerHTML = categories.map(cat =>
      `<option value="${safeText(cat)}">${getCategoryIcon(cat)} ${safeText(cat)}</option>`
    ).join("");
    if (categories.includes(currentVal)) select.value = currentVal;
  }

  // 2. Family settings category chips
  const chips = $("categoryChips");
  if (chips) {
    chips.innerHTML = categories.map(cat =>
      `<span class="chip">${getCategoryIcon(cat)} ${safeText(cat)}</span>`
    ).join("");
  }

  renderCategoryFilterChips();
}

function renderCategoryFilterChips() {
  const track = $("categoryFilterTrack");
  if (!track) return;

  const allActive = activeCategoryFilter === "all" ? "active" : "";
  let html = `<button type="button" class="chip ${allActive}" data-cat="all">All</button>`;

  categories.forEach(cat => {
    const isActive = activeCategoryFilter.toLowerCase() === cat.toLowerCase() ? "active" : "";
    html += `<button type="button" class="chip ${isActive}" data-cat="${safeText(cat)}">${getCategoryIcon(cat)} ${safeText(cat)}</button>`;
  });

  track.innerHTML = html;

  track.querySelectorAll(".chip").forEach(btn => {
    btn.addEventListener("click", () => {
      vibrate(10);
      activeCategoryFilter = btn.dataset.cat;
      renderExpenses();
    });
  });
}

$("addCategoryBtn")?.addEventListener("click", async () => {
  const input = $("newCategory");
  const cat = input.value.trim();

  if (!cat) {
    showToast("Enter a category name.");
    return;
  }

  if (categories.some(c => c.toLowerCase() === cat.toLowerCase())) {
    showToast("This category already exists.");
    return;
  }

  try {
    const updated = [...categories, cat];
    await db.collection("families").doc(currentFamilyId).update({ categories: updated });
    categories = updated;
    input.value = "";
    renderCategories();
    showToast("Category added! 🏷️");
  } catch (err) {
    showToast("Error: " + err.message);
  }
});

/* ==========================================================================
   ANALYTICS VIEW RENDERER
   ========================================================================== */

function renderAnalytics() {
  const month = $("dashboardMonth")?.value || getMonthValue();
  const monthly = expenses.filter(e => isThisMonth(e, month));
  const total = monthly.reduce((sum, item) => sum + Number(item.total || 0), 0);

  const container = $("categoryBreakdownList");
  if (!container) return;

  if (!monthly.length) {
    container.innerHTML = `<div class="empty-state">No expense activity recorded for ${month}.</div>`;
    $("insightsList").innerHTML = `<li>Add expenses this month to generate smart spending insights.</li>`;
    return;
  }

  // Calculate totals per category
  const breakdown = {};
  monthly.forEach(item => {
    const c = item.category || "Other";
    breakdown[c] = (breakdown[c] || 0) + Number(item.total || 0);
  });

  const sorted = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);

  container.innerHTML = sorted.map(([cat, amount]) => {
    const percent = total > 0 ? (amount / total) * 100 : 0;
    const icon = getCategoryIcon(cat);

    return `
      <div class="cat-breakdown-item">
        <div class="cat-breakdown-header">
          <span>${icon} ${safeText(cat)}</span>
          <strong>${money(amount)} <small style="color:var(--text-dim)">(${percent.toFixed(1)}%)</small></strong>
        </div>
        <div class="cat-breakdown-track">
          <div class="cat-breakdown-fill" style="width: ${percent}%"></div>
        </div>
      </div>
    `;
  }).join("");

  // Generate Smart Highlights
  const highestExp = monthly.slice().sort((a, b) => Number(b.total || 0) - Number(a.total || 0))[0];
  const topCategory = sorted[0];

  let insightsHtml = `
    <li><strong>Top Expense:</strong> ${safeText(highestExp.name)} (${money(highestExp.total)}) by ${safeText(highestExp.createdByName || "member")}.</li>
    <li><strong>Biggest Spending Category:</strong> ${getCategoryIcon(topCategory[0])} ${safeText(topCategory[0])} represents ${((topCategory[1] / total) * 100).toFixed(0)}% of household outflows.</li>
    <li><strong>Average Transaction:</strong> ${money(total / monthly.length)} across ${monthly.length} recorded purchases.</li>
  `;

  $("insightsList").innerHTML = insightsHtml;
}

/* ==========================================================================
   FAMILY SETTINGS & INVITATIONS
   ========================================================================== */

function renderFamilySettings() {
  if (!currentFamily || !currentUser) return;

  const isOwner = currentFamily.ownerUid === currentUser.uid;
  const displayName = currentMember?.name || currentUser.displayName || currentUser.email.split("@")[0];
  const initial = displayName.charAt(0).toUpperCase();

  // Profile Header Card in Family View
  if ($("profileDisplayName")) $("profileDisplayName").textContent = displayName;
  if ($("profileEmail")) $("profileEmail").textContent = currentUser.email || "";
  if ($("profileAvatar")) $("profileAvatar").textContent = initial;
  if ($("profileRoleBadge")) {
    $("profileRoleBadge").textContent = isOwner ? "Owner 👑" : "Member 👤";
  }

  $("familySettingsName").textContent = currentFamily.name || "Family Settings";
  $("familyRole").textContent = isOwner ? "Your Role: Household Owner 👑" : "Your Role: Member 👤";
  $("familyBudgetInput").value = currentFamily.budget || 0;

  show($("ownerControls"), isOwner);
  $("memberSettingsCountBadge").textContent = `${members.length} member${members.length === 1 ? "" : "s"}`;

  const container = $("familyMembers");
  if (!container) return;

  container.innerHTML = members.map(m => {
    const initial = (m.name || m.email || "M").charAt(0).toUpperCase();
    const isOwnerRole = m.role === "owner";

    return `
      <div class="member-card">
        <div class="member-left">
          <span class="member-avatar-mini">${initial}</span>
          <div>
            <strong>${safeText(m.name || "Member")}</strong>
            <small style="display:block;color:var(--text-dim);font-size:11px;">${safeText(m.email || "")}</small>
          </div>
        </div>
        <span class="badge ${isOwnerRole ? "badge-accent" : ""}">${isOwnerRole ? "Owner" : "Member"}</span>
      </div>
    `;
  }).join("");
}

$("saveBudgetBtn")?.addEventListener("click", async () => {
  if (currentFamily?.ownerUid !== currentUser?.uid) return;

  const budget = Number($("familyBudgetInput").value);
  if (!Number.isFinite(budget) || budget < 0) {
    showToast("Enter a valid budget amount.");
    return;
  }

  const btn = $("saveBudgetBtn");
  setBusy(btn, true, "Saving...");

  try {
    await db.collection("families").doc(currentFamilyId).update({ budget });
    showToast("Monthly budget updated! 🎯");
  } catch (err) {
    showToast("Save failed: " + err.message);
  } finally {
    setBusy(btn, false);
  }
});

// Generate 48-Hour Invitation Code
function makeInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

$("generateInviteBtn")?.addEventListener("click", async () => {
  if (currentFamily?.ownerUid !== currentUser?.uid) return;

  const btn = $("generateInviteBtn");
  setBusy(btn, true, "Generating...");

  try {
    let code = makeInviteCode();
    let inviteRef = db.collection("invites").doc(code);
    let existing = await inviteRef.get();

    while (existing.exists) {
      code = makeInviteCode();
      inviteRef = db.collection("invites").doc(code);
      existing = await inviteRef.get();
    }

    const expiry = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await inviteRef.set({
      code,
      familyId: currentFamilyId,
      familyName: currentFamily.name || "Family",
      createdBy: currentUser.uid,
      used: false,
      expiresAt: firebase.firestore.Timestamp.fromDate(expiry),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    const inviteBox = $("inviteResult");
    show(inviteBox, true);
    inviteBox.innerHTML = `
      <p style="font-size:12px;color:var(--text-muted)">Invitation Code (Valid for 48 hours):</p>
      <div class="invite-code-display">${safeText(code)}</div>
      <div class="invite-actions">
        <button type="button" class="btn btn-primary btn-sm" id="shareInviteBtn">📲 Share WhatsApp / SMS</button>
        <button type="button" class="btn btn-outline btn-sm" id="copyInviteBtn">📋 Copy Code</button>
      </div>
    `;

    $("copyInviteBtn")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(code);
        showToast("Code copied to clipboard! 📋");
      } catch {
        showToast("Code: " + code);
      }
    });

    $("shareInviteBtn")?.addEventListener("click", () => {
      const shareText = `Join our family expense manager on MONETA!\n\nFamily: ${currentFamily.name}\nInvite Code: ${code}\n(Valid for 48 hours)`;
      if (navigator.share) {
        navigator.share({
          title: "Join MONETA Family",
          text: shareText
        }).catch(() => {});
      } else {
        navigator.clipboard.writeText(shareText);
        showToast("Invite text copied! Ready to paste into WhatsApp.");
      }
    });

    showToast("Invitation code generated! 🎟️");
  } catch (err) {
    showToast("Could not generate code: " + err.message);
  } finally {
    setBusy(btn, false);
  }
});

/* ==========================================================================
   SHARE SUMMARY (WHATSAPP / NATIVE SHARE)
   ========================================================================== */

$("shareSummaryBtn")?.addEventListener("click", () => {
  const month = getSelectedMonth();
  const monthly = expenses.filter(e => isThisMonth(e, month));
  const total = monthly.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const budget = Number(currentFamily.budget || 0);

  const text = `📊 *MONETA Monthly Summary - ${month}*\n` +
               `🏡 Family: ${currentFamily?.name || "Our Household"}\n` +
               `💰 Total Spent: ${money(total)}\n` +
               `🎯 Budget: ${money(budget)}\n` +
               `💳 Total Transactions: ${monthly.length}\n\n` +
               `Tracked with MONETA Family Expense Manager.`;

  if (navigator.share) {
    navigator.share({
      title: `MONETA Expenses - ${month}`,
      text
    }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text);
    showToast("Monthly summary copied! Ready to share on WhatsApp.");
  }
});

/* ==========================================================================
   PDF REPORTS (MONTHLY & YEARLY)
   ========================================================================== */

function generatePdfReport(title, list) {
  const total = list.reduce((sum, item) => sum + Number(item.total || 0), 0);

  const rows = list.map(item => `
    <tr>
      <td>${safeText(item.date || "")}</td>
      <td><strong>${safeText(item.name || "")}</strong></td>
      <td>${safeText(item.category || "")}</td>
      <td>${safeText(item.createdByName || "")}</td>
      <td>${money(item.price)}</td>
      <td>${safeText(item.quantity)}</td>
      <td style="font-weight:bold">${money(item.total)}</td>
    </tr>
  `).join("");

  const win = window.open("", "_blank");
  if (!win) {
    showToast("Please allow pop-ups to open the PDF report.");
    return;
  }

  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${safeText(title)} | MONETA</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 30px; color: #1e293b; }
        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #6366f1; padding-bottom: 15px; margin-bottom: 20px; }
        .brand { font-size: 26px; font-weight: 800; color: #6366f1; letter-spacing: -0.5px; }
        .family { font-size: 16px; color: #64748b; font-weight: 600; }
        .total-box { background: #f1f5f9; padding: 14px 20px; border-radius: 10px; margin: 20px 0; display: inline-block; }
        .total-box span { font-size: 12px; color: #64748b; display: block; font-weight: 600; text-transform: uppercase; }
        .total-box strong { font-size: 24px; color: #0f172a; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
        th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
        th { background: #f8fafc; font-weight: 700; color: #475569; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
        .print-btn { background: #6366f1; color: #fff; border: 0; padding: 12px 24px; border-radius: 8px; font-weight: bold; cursor: pointer; margin-top: 20px; }
        @media print { .print-btn { display: none; } body { padding: 0; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="brand">MONETA</div>
          <div class="family">${safeText(currentFamily?.name || "Family")} · ${safeText(title)}</div>
        </div>
        <div style="font-size:12px;color:#94a3b8">Generated on: ${new Date().toLocaleDateString("en-IN")}</div>
      </div>

      <div class="total-box">
        <span>Total Expenditures</span>
        <strong>${money(total)}</strong>
      </div>

      <table>
        <thead>
          <tr>
            <th>Date</th><th>Item / Service</th><th>Category</th>
            <th>Member</th><th>Price</th><th>Qty</th><th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="7" style="text-align:center;padding:20px;">No expenses found.</td></tr>`}
        </tbody>
      </table>

      <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
    </body>
    </html>
  `);

  win.document.close();
  win.focus();
}

$("monthlyPdfBtn")?.addEventListener("click", () => {
  const month = getSelectedMonth();
  const list = expenses.filter(e => String(e.date || "").startsWith(month));
  generatePdfReport(`Monthly Report - ${month}`, list);
});

$("yearlyPdfBtn")?.addEventListener("click", () => {
  const month = getSelectedMonth();
  const year = month.slice(0, 4);
  const list = expenses.filter(e => String(e.date || "").startsWith(year));
  generatePdfReport(`Yearly Report - ${year}`, list);
});

/* ==========================================================================
   IMPORT LOCAL STORAGE RECORDS
   ========================================================================== */

$("importExpensesBtn")?.addEventListener("click", async () => {
  if (!currentFamilyId || !currentUser) return;

  let oldExpenses = [];
  try {
    oldExpenses = JSON.parse(localStorage.getItem("moneta_expenses") || "[]");
  } catch {
    showToast("No readable offline expenses found.");
    return;
  }

  if (!Array.isArray(oldExpenses) || oldExpenses.length === 0) {
    showToast("No old expenses found on this device.");
    return;
  }

  const btn = $("importExpensesBtn");
  setBusy(btn, true, `Importing ${oldExpenses.length} items...`);

  try {
    const col = db.collection("families").doc(currentFamilyId).collection("expenses");

    for (let i = 0; i < oldExpenses.length; i += 400) {
      const batch = db.batch();
      const chunk = oldExpenses.slice(i, i + 400);

      chunk.forEach((item, idx) => {
        const docId = `legacy_${i + idx}`;
        const ref = col.doc(docId);
        const price = Number(item.price || 0);
        const quantity = Number(item.quantity || 1);

        batch.set(ref, {
          name: String(item.name || "Imported expense"),
          category: String(item.category || "Other"),
          date: String(item.date || getTodayString()),
          price,
          quantity,
          total: Number(item.total ?? price * quantity),
          notes: String(item.notes || ""),
          createdBy: currentUser.uid,
          createdByName: currentMember?.name || currentUser.displayName || currentUser.email,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      });

      await batch.commit();
    }

    showToast(`${oldExpenses.length} expenses imported successfully! 📥`);
  } catch (err) {
    showToast("Import error: " + err.message);
  } finally {
    setBusy(btn, false);
  }
});

/* ==========================================================================
   THEME TOGGLE (DARK / LIGHT MODE)
   ========================================================================= */

function applyTheme(isLight) {
  document.body.classList.toggle("light-mode", isLight);
  document.body.classList.toggle("dark-mode", !isLight);
  localStorage.setItem("moneta_theme", isLight ? "light" : "dark");
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute("content", isLight ? "#f8fafc" : "#0a0f1d");
  }
}

const savedTheme = localStorage.getItem("moneta_theme");
applyTheme(savedTheme === "light");

$("themeBtn")?.addEventListener("click", () => {
  vibrate(10);
  const willBeLight = !document.body.classList.contains("light-mode");
  applyTheme(willBeLight);
  showToast(willBeLight ? "Light Mode ☀️" : "Dark Mode 🌙");
});

/* ==========================================================================
   LEAVE FAMILY & SWITCH / JOIN HOUSEHOLD
   ========================================================================== */

// 1. Leave Family
function openLeaveFamilyModal() {
  if (!currentFamily || !currentUser) return;
  vibrate([20, 30]);

  const isOwner = currentFamily.ownerUid === currentUser.uid;
  const msgEl = $("leaveFamilyMessage");

  if (isOwner && members.length === 1) {
    msgEl.textContent = `You are the sole member of "${currentFamily.name}". Leaving will detach your account from this household.`;
  } else if (isOwner && members.length > 1) {
    msgEl.textContent = `You are the owner of "${currentFamily.name}". Leaving will step down from ownership and remove your access.`;
  } else {
    msgEl.textContent = `Are you sure you want to leave "${currentFamily.name}"? You will lose access to its shared budget and expenses.`;
  }

  show($("leaveFamilyBackdrop"), true);
}

function closeLeaveFamilyModal() {
  show($("leaveFamilyBackdrop"), false);
}

$("leaveFamilyBtn")?.addEventListener("click", openLeaveFamilyModal);
$("cancelLeaveBtn")?.addEventListener("click", closeLeaveFamilyModal);
$("leaveFamilyBackdrop")?.addEventListener("click", e => {
  if (e.target === $("leaveFamilyBackdrop")) closeLeaveFamilyModal();
});

$("confirmLeaveBtn")?.addEventListener("click", async () => {
  if (!currentUser || !currentFamilyId) return;

  const btn = $("confirmLeaveBtn");
  setBusy(btn, true, "Leaving...");

  try {
    const isOwner = currentFamily.ownerUid === currentUser.uid;
    const batch = db.batch();

    // 1. Remove current user from family members
    const memberRef = db.collection("families").doc(currentFamilyId)
      .collection("members").doc(currentUser.uid);
    batch.delete(memberRef);

    // 2. Clear familyId in users document
    const userRef = db.collection("users").doc(currentUser.uid);
    batch.update(userRef, { familyId: null });

    // 3. If owner and other members exist, promote the next member
    if (isOwner && members.length > 1) {
      const nextMember = members.find(m => m.id !== currentUser.uid);
      if (nextMember) {
        const familyRef = db.collection("families").doc(currentFamilyId);
        batch.update(familyRef, { ownerUid: nextMember.id });

        const nextMemberRef = familyRef.collection("members").doc(nextMember.id);
        batch.update(nextMemberRef, { role: "owner" });
      }
    }

    await batch.commit();

    // Reset local state & listeners
    stopListeners();
    currentFamily = null;
    currentFamilyId = null;
    currentMember = null;
    expenses = [];
    members = [];

    closeLeaveFamilyModal();
    $("topFamilyBadge").textContent = "No Family";
    switchView("noFamilyView");
    showToast("You have left the household. 🚪");

  } catch (err) {
    console.error("Leave Family Error:", err);
    showToast("Could not leave family: " + err.message);
  } finally {
    setBusy(btn, false);
  }
});

// 2. Join Different Family
function openJoinDifferentModal() {
  vibrate(15);
  $("newInviteCode").value = "";
  show($("joinDifferentBackdrop"), true);
  setTimeout(() => $("newInviteCode")?.focus(), 150);
}

function closeJoinDifferentModal() {
  show($("joinDifferentBackdrop"), false);
}

$("joinDifferentFamilyBtn")?.addEventListener("click", openJoinDifferentModal);
$("closeJoinDifferentSheet")?.addEventListener("click", closeJoinDifferentModal);
$("cancelJoinDifferentBtn")?.addEventListener("click", closeJoinDifferentModal);
$("joinDifferentBackdrop")?.addEventListener("click", e => {
  if (e.target === $("joinDifferentBackdrop")) closeJoinDifferentModal();
});

$("joinDifferentForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!currentUser) return;

  const btn = $("submitJoinDifferentBtn");
  const code = $("newInviteCode").value.trim().toUpperCase();

  if (!code) return;
  setBusy(btn, true, "Verifying code...");

  try {
    const inviteRef = db.collection("invites").doc(code);
    const inviteSnap = await inviteRef.get();

    if (!inviteSnap.exists) throw new Error("Invitation code not found.");

    const invite = inviteSnap.data();
    if (invite.used) throw new Error("This invitation code has already been used.");
    if (invite.expiresAt && invite.expiresAt.toDate() < new Date()) {
      throw new Error("This invitation code has expired.");
    }
    if (invite.familyId === currentFamilyId) {
      throw new Error("You are already in this household.");
    }

    const newFamilyRef = db.collection("families").doc(invite.familyId);
    const newFamilySnap = await newFamilyRef.get();
    if (!newFamilySnap.exists) throw new Error("The target household no longer exists.");

    const name = currentUser.displayName || currentUser.email.split("@")[0];
    const oldFamilyId = currentFamilyId;

    await db.runTransaction(async tx => {
      const liveInvite = await tx.get(inviteRef);
      if (!liveInvite.exists || liveInvite.data().used) {
        throw new Error("This invitation code has already been redeemed.");
      }

      // If leaving an old family, remove member record
      if (oldFamilyId) {
        const oldMemberRef = db.collection("families").doc(oldFamilyId)
          .collection("members").doc(currentUser.uid);
        tx.delete(oldMemberRef);
      }

      // Add to new family
      tx.set(newFamilyRef.collection("members").doc(currentUser.uid), {
        uid: currentUser.uid,
        name,
        email: currentUser.email,
        role: "member",
        inviteCode: code,
        joinedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Mark invite used
      tx.update(inviteRef, {
        used: true,
        usedBy: currentUser.uid,
        usedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Update user document
      tx.set(db.collection("users").doc(currentUser.uid), {
        name,
        email: currentUser.email,
        familyId: invite.familyId
      }, { merge: true });
    });

    // Reset listeners and bind to new family
    stopListeners();
    currentFamilyId = invite.familyId;
    currentFamily = { id: newFamilySnap.id, ...newFamilySnap.data() };
    currentMember = { role: "member", name, email: currentUser.email };
    categories = currentFamily.categories || [...DEFAULT_CATEGORIES];

    closeJoinDifferentModal();
    $("topFamilyBadge").textContent = currentFamily.name || "Family";
    showToast("Welcome to your new household! 🏡");
    switchView("dashboardView");
    startRealtimeListeners();

  } catch (err) {
    showToast(err.message);
    vibrate([40, 50]);
  } finally {
    setBusy(btn, false);
  }
});

/* ==========================================================================
   EDIT PROFILE & PROFILE SIGN OUT
   ========================================================================== */

function openEditProfileModal() {
  if (!currentUser) return;
  vibrate(15);

  const displayName = currentMember?.name || currentUser.displayName || currentUser.email.split("@")[0];
  const initial = displayName.charAt(0).toUpperCase();

  $("editProfileName").value = displayName;
  $("editProfileEmail").value = currentUser.email || "";
  $("editProfileAvatarPreview").textContent = initial;

  show($("editProfileBackdrop"), true);
  setTimeout(() => $("editProfileName")?.focus(), 150);
}

function closeEditProfileModal() {
  show($("editProfileBackdrop"), false);
}

$("editProfileBtn")?.addEventListener("click", openEditProfileModal);
$("closeEditProfileSheet")?.addEventListener("click", closeEditProfileModal);
$("cancelEditProfileBtn")?.addEventListener("click", closeEditProfileModal);
$("editProfileBackdrop")?.addEventListener("click", e => {
  if (e.target === $("editProfileBackdrop")) closeEditProfileModal();
});

// Live Avatar Preview update on keystroke
$("editProfileName")?.addEventListener("input", e => {
  const val = e.target.value.trim();
  $("editProfileAvatarPreview").textContent = (val ? val.charAt(0) : "U").toUpperCase();
});

$("editProfileForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!currentUser) return;

  const btn = $("saveProfileBtn");
  const newName = $("editProfileName").value.trim();

  if (!newName) {
    showToast("Please enter a valid name.");
    return;
  }

  setBusy(btn, true, "Saving...");

  try {
    // 1. Update Firebase Auth Display Name
    await currentUser.updateProfile({ displayName: newName });

    // 2. Update Firestore user document
    await db.collection("users").doc(currentUser.uid).set({
      name: newName
    }, { merge: true });

    // 3. Update family member document if in a family
    if (currentFamilyId) {
      await db.collection("families").doc(currentFamilyId)
        .collection("members").doc(currentUser.uid).update({
          name: newName
        });
    }

    if (currentMember) currentMember.name = newName;

    // Update UI elements
    const initial = newName.charAt(0).toUpperCase();
    $("topGreeting").textContent = `Hello, ${newName.split(" ")[0]}`;
    $("userAvatar").textContent = initial;
    if ($("profileDisplayName")) $("profileDisplayName").textContent = newName;
    if ($("profileAvatar")) $("profileAvatar").textContent = initial;

    closeEditProfileModal();
    showToast("Profile updated successfully! ✨");
    renderDashboard();
    renderFamilySettings();

  } catch (err) {
    console.error("Profile update error:", err);
    showToast("Update failed: " + err.message);
  } finally {
    setBusy(btn, false);
  }
});

// Sign Out from Profile Button
$("profileSignOutBtn")?.addEventListener("click", async () => {
  vibrate(15);
  stopListeners();
  await auth.signOut();
  currentUser = null;
  currentFamily = null;
  currentFamilyId = null;
  expenses = [];
  members = [];
  showAuthScreen();
  showToast("Signed out. See you soon! 👋");
});

/* ==========================================================================
   DANGER ZONE: RESET WHOLE EXPENSES & FACTORY RESET
   ========================================================================== */

let activeResetMode = "expenses"; // "expenses" or "factory"

function openResetModal(mode) {
  if (!currentFamilyId || !currentUser) {
    showToast("Please join a family first.");
    return;
  }

  vibrate([25, 40, 25]);
  activeResetMode = mode;

  const titleEl = $("resetDialogTitle");
  const msgEl = $("resetDialogMessage");
  const confirmInput = $("resetConfirmInput");
  const actionBtn = $("confirmResetActionBtn");

  confirmInput.value = "";
  actionBtn.disabled = true;

  if (mode === "factory") {
    titleEl.textContent = "Factory Reset Household?";
    msgEl.textContent = `This will permanently delete ALL expenses, reset categories to default, and restore the default budget for "${currentFamily?.name || "your family"}".`;
    actionBtn.textContent = "Factory Reset";
  } else {
    titleEl.textContent = "Reset All Expenses?";
    msgEl.textContent = `This will permanently delete all ${expenses.length} expense records from "${currentFamily?.name || "your family"}". Statistics will reset to zero.`;
    actionBtn.textContent = "Reset Expenses";
  }

  show($("resetConfirmBackdrop"), true);
  setTimeout(() => confirmInput.focus(), 150);
}

function closeResetModal() {
  show($("resetConfirmBackdrop"), false);
}

$("resetExpensesBtn")?.addEventListener("click", () => openResetModal("expenses"));
$("factoryResetBtn")?.addEventListener("click", () => openResetModal("factory"));
$("cancelResetBtn")?.addEventListener("click", closeResetModal);
$("resetConfirmBackdrop")?.addEventListener("click", e => {
  if (e.target === $("resetConfirmBackdrop")) closeResetModal();
});

// Enable action button only when user types "RESET"
$("resetConfirmInput")?.addEventListener("input", e => {
  const val = e.target.value.trim().toUpperCase();
  $("confirmResetActionBtn").disabled = (val !== "RESET");
});

$("confirmResetActionBtn")?.addEventListener("click", async () => {
  if (!currentUser || !currentFamilyId) return;

  const btn = $("confirmResetActionBtn");
  setBusy(btn, true, "Wiping data...");

  try {
    const expenseCollection = db.collection("families").doc(currentFamilyId).collection("expenses");
    const snapshot = await expenseCollection.get();

    // Batch delete in chunks of 400
    const docs = snapshot.docs;
    for (let i = 0; i < docs.length; i += 400) {
      const batch = db.batch();
      const chunk = docs.slice(i, i + 400);
      chunk.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }

    // If factory reset, also reset categories and budget
    if (activeResetMode === "factory") {
      await db.collection("families").doc(currentFamilyId).update({
        budget: 15000,
        categories: [...DEFAULT_CATEGORIES]
      });
      categories = [...DEFAULT_CATEGORIES];
    }

    expenses = [];
    closeResetModal();

    if (activeResetMode === "factory") {
      showToast("Household factory reset complete! 🔄");
    } else {
      showToast("All expenses wiped to zero! 🗑️");
    }

    renderDashboard();
    renderExpenses();
    renderAnalytics();
    renderFamilySettings();

  } catch (err) {
    console.error("Reset Error:", err);
    showToast("Reset failed: " + err.message);
  } finally {
    setBusy(btn, false);
  }
});

console.log("MONETA Mobile Initialized.");
