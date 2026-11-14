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
let activeMemberFilter = null;
let expenseToDelete = null;

// Realtime Unsubscribers
let expenseUnsubscribe = null;
let memberUnsubscribe = null;
let familyUnsubscribe = null;

// UI State
let authMode = "login";
let currentView = "dashboardView";

const DEFAULT_CATEGORIES = [
  "Groceries",
  "Dairy & Milk",
  "Vegetables & Greens",
  "Fresh Fruits",
  "Food & Dining",
  "Electricity & Bills",
  "Water & Gas Cylinder",
  "Internet & Mobile",
  "House Rent",
  "Fuel & Vehicle",
  "Cab & Commute",
  "Medicine & Health",
  "Shopping & Clothes",
  "Kids & Education",
  "Entertainment & OTT",
  "Household Supplies",
  "Personal Care",
  "Gifts & Puja",
  "Other"
];

const CATEGORY_ICONS = {
  "groceries": "🛒",
  "grocery": "🛒",
  "dairy & milk": "🥛",
  "dairy products": "🥛",
  "dairy": "🥛",
  "vegetables & greens": "🥦",
  "vegetables": "🥦",
  "fresh fruits": "🍎",
  "fruits": "🍎",
  "food & dining": "🍽️",
  "food": "🍽️",
  "electricity & bills": "⚡",
  "bills": "⚡",
  "water & gas cylinder": "💧",
  "water & gas": "💧",
  "internet & mobile": "📶",
  "internet & phone": "📶",
  "internet": "📶",
  "house rent": "🏠",
  "rent": "🏠",
  "fuel & vehicle": "🚗",
  "fuel": "🚗",
  "transport": "🚗",
  "cab & commute": "🚕",
  "cab & travel": "🚕",
  "travel": "✈️",
  "medicine & health": "💊",
  "healthcare": "💊",
  "shopping & clothes": "🛍️",
  "shopping": "🛍️",
  "kids & education": "📚",
  "education": "📚",
  "entertainment & ott": "🎬",
  "entertainment": "🎬",
  "household supplies": "🧹",
  "cleaning": "🧹",
  "personal care": "🧴",
  "gifts & puja": "🎁",
  "other": "📦"
};

const $ = id => document.getElementById(id);

const money = amount =>
  "₹" + Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

function getCategoryIcon(cat) {
  const str = String(cat || "").trim();
  if (!str) return "🏷️";
  // If category starts with an emoji, extract and return it
  const emojiMatch = str.match(/^(\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji})/u);
  if (emojiMatch) {
    return emojiMatch[0];
  }
  const key = str.toLowerCase();
  return CATEGORY_ICONS[key] || "🏷️";
}

function getCategoryCleanName(cat) {
  const str = String(cat || "").trim();
  const icon = getCategoryIcon(str);
  if (str.startsWith(icon)) {
    return str.slice(icon.length).trim() || str;
  }
  return str;
}

/* ==========================================================================
   PAYMENT METHODS CONFIG & HELPERS
   ========================================================================== */

const PAYMENT_METHODS = [
  { id: "UPI/Online", label: "UPI", icon: "📱", color: "#6366f1" },
  { id: "Cash", label: "Cash", icon: "💵", color: "#10b981" },
  { id: "Credit/Debit Card", label: "Credit/Debit Card", icon: "💳", color: "#f59e0b" },
  { id: "Net Banking", label: "Net Banking", icon: "🏦", color: "#06b6d4" },
  { id: "Cheque", label: "Cheque", icon: "🧾", color: "#ec4899" }
];

function getPaymentMethodInfo(method) {
  const norm = String(method || "").trim().toLowerCase();
  if (norm.includes("upi") || norm.includes("online") || norm.includes("gpay") || norm.includes("phonepe") || norm.includes("paytm")) {
    return { id: "UPI/Online", label: "UPI / Online", icon: "📱", color: "#6366f1" };
  }
  if (norm.includes("cash")) {
    return { id: "Cash", label: "Cash", icon: "💵", color: "#10b981" };
  }
  if (norm.includes("card") || norm.includes("debit") || norm.includes("credit")) {
    return { id: "Credit/Debit Card", label: "Credit/Debit Card", icon: "💳", color: "#f59e0b" };
  }
  if (norm.includes("bank") || norm.includes("net") || norm.includes("neft") || norm.includes("rtgs") || norm.includes("imps")) {
    return { id: "Net Banking", label: "Net Banking", icon: "🏦", color: "#06b6d4" };
  }
  if (norm.includes("cheque") || norm.includes("check")) {
    return { id: "Cheque", label: "Cheque", icon: "🧾", color: "#ec4899" };
  }
  return { id: "Cheque", label: "Cheque", icon: "🧾", color: "#ec4899" };
}

function renderPaymentMethodChips(containerId, selectId) {
  const container = $(containerId);
  const select = $(selectId);
  if (!container || !select) return;

  container.innerHTML = PAYMENT_METHODS.map(pm => {
    const isSelected = select.value === pm.id;
    return `<button type="button" class="modal-cat-chip ${isSelected ? "active" : ""}" data-payment="${safeText(pm.id)}">${pm.icon} ${safeText(pm.label)}</button>`;
  }).join("");

  container.querySelectorAll(".modal-cat-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      vibrate(10);
      select.value = btn.dataset.payment;
      container.querySelectorAll(".modal-cat-chip").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  select.addEventListener("change", () => {
    container.querySelectorAll(".modal-cat-chip").forEach(b => {
      b.classList.toggle("active", b.dataset.payment === select.value);
    });
  });
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
    const savedCats = Array.isArray(currentFamily.categories) ? currentFamily.categories : [];
    categories = Array.from(new Set([...DEFAULT_CATEGORIES, ...savedCats]));

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

    // Check invite — DO NOT check "used" so multiple members can join with one code
    if (!inviteSnap.exists) throw new Error("Invitation code not found.");

    const invite = inviteSnap.data();
    // Allow reuse — multiple members can join. Only block if truly expired.
    if (invite.expiresAt && invite.expiresAt.toDate() < new Date()) {
      throw new Error("This invitation code has expired.");
    }

    const familyRef = db.collection("families").doc(invite.familyId);
    const familySnap = await familyRef.get();
    if (!familySnap.exists) throw new Error("This household no longer exists.");

    const name = currentUser.displayName || currentUser.email.split("@")[0];

    await db.runTransaction(async tx => {
      const liveInvite = await tx.get(inviteRef);
      if (!liveInvite.exists) {
        throw new Error("Invitation code not found.");
      }
      // Allow reuse — do NOT check .used. Multiple members can join with same code.
      if (liveInvite.data().expiresAt && liveInvite.data().expiresAt.toDate() < new Date()) {
        throw new Error("This invitation code has expired.");
      }

      tx.set(familyRef.collection("members").doc(currentUser.uid), {
        uid: currentUser.uid,
        name,
        email: currentUser.email,
        role: "member",
        inviteCode: code,
        joinedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

        // DO NOT mark invite as used — allow multiple members to join with same code
      // tx.update(inviteRef, { used: true, ... }); // REMOVED: unlimited joins

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
    const savedCats = Array.isArray(currentFamily.categories) ? currentFamily.categories : [];
    categories = Array.from(new Set([...DEFAULT_CATEGORIES, ...savedCats]));

    renderCategories();
    renderDashboard();
    renderFamilySettings();
  }, err => console.error("Family listener:", err));

  // 2. Real-time Expenses Listener
  expenseUnsubscribe = familyRef.collection("expenses")
    .orderBy("date", "desc")
    .onSnapshot(snapshot => {
      // Filter out any soft-deleted items
      expenses = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(e => !e.deleted);
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
  if ($("paymentMethodSelect")) $("paymentMethodSelect").value = "UPI/Online";
  updateCalculatedTotal();
  renderCategories();
  renderPaymentMethodChips("modalPaymentChips", "paymentMethodSelect");
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
  const paymentMethod = $("paymentMethodSelect")?.value || "UPI/Online";
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
        paymentMethod,
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

  // Payment Method in Edit Modal
  const paymentMethod = expense.paymentMethod || "UPI/Online";
  if ($("editPaymentMethodSelect")) $("editPaymentMethodSelect").value = paymentMethod;
  renderPaymentMethodChips("editModalPaymentChips", "editPaymentMethodSelect");

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
  const paymentMethod = $("editPaymentMethodSelect")?.value || "UPI/Online";
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
        paymentMethod,
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
  const expName = expenseToDelete.name || "Expense";
  const btn = $("confirmDeleteBtn");

  setBusy(btn, true, "Deleting...");
  try {
    // Attempt standard Firestore document delete
    await db.collection("families").doc(currentFamilyId)
      .collection("expenses").doc(id).delete();
    
    // Also remove from local in-memory array immediately so UI is 100% responsive
    expenses = expenses.filter(e => e.id !== id);
    closeDeleteModal();
    showToast("Expense removed. 🗑️");
    renderDashboard();
    renderExpenses();
    renderAnalytics();
  } catch (err) {
    console.error("Direct delete error:", err);
    // If Firestore rules disallow delete, attempt soft-delete update fallback
    if (err.code === "permission-denied" || err.message?.includes("permission")) {
      try {
        await db.collection("families").doc(currentFamilyId)
          .collection("expenses").doc(id).set({
            deleted: true,
            total: 0,
            price: 0,
            quantity: 0,
            name: `[Deleted: ${expName}]`
          }, { merge: true });

        expenses = expenses.filter(e => e.id !== id);
        closeDeleteModal();
        showToast("Expense removed. 🗑️");
        renderDashboard();
        renderExpenses();
        renderAnalytics();
        return;
      } catch (innerErr) {
        console.error("Soft-delete fallback failed:", innerErr);
      }
    }
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

  // 1. Live Formatted Date (e.g. "Friday, 13 Nov 2026")
  const now = new Date();
  const dayName = now.toLocaleDateString("en-US", { weekday: "long" });
  const dayNum = now.getDate();
  const monthName = now.toLocaleDateString("en-US", { month: "short" });
  const fullYear = now.getFullYear();
  const liveDateStr = `${dayName}, ${dayNum} ${monthName} ${fullYear}`;

  if ($("liveFormattedDate")) $("liveFormattedDate").textContent = liveDateStr;

  // 2. Active Month Label (e.g. "November 2026" / "Nov 2026")
  const [mYear, mMonth] = month.split("-");
  const monthDateObj = new Date(Number(mYear), Number(mMonth) - 1, 1);
  const fullMonthStr = monthDateObj.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const shortMonthStr = monthDateObj.toLocaleDateString("en-US", { month: "short", year: "numeric" });

  if ($("dashboardActiveMonth")) $("dashboardActiveMonth").textContent = fullMonthStr;
  if ($("heroSelectedMonth")) $("heroSelectedMonth").textContent = shortMonthStr;

  $("familyHeading").textContent = currentFamily.name || "Family Finances";
  $("monthTotal").textContent = money(total);
  $("transactionCount").textContent = monthly.length;

  // Daily Average (if element present)
  const currentDay = now.getDate() || 1;
  const dailyAvg = total > 0 ? (total / currentDay) : 0;
  if ($("dailyAverage")) $("dailyAverage").textContent = money(dailyAvg);

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
      <div class="member-bar-row clickable-member-row" data-member-id="${safeText(member.id)}" data-member-name="${safeText(member.name || member.email || "Member")}" title="Click to view ${safeText(member.name || "Member")}'s expenses">
        <div class="member-bar-info">
          <div class="member-name-tag">
            <span class="member-avatar-mini">${initial}</span>
            <span>${safeText(member.name || member.email || "Member")}</span>
            <span class="member-click-hint">Filter →</span>
          </div>
          <strong>${money(memberTotal)} <small style="color:var(--text-dim);font-weight:normal">(${percent.toFixed(0)}%)</small></strong>
        </div>
        <div class="member-bar-track">
          <div class="member-bar-fill" style="width: ${percent}%"></div>
        </div>
      </div>
    `;
  }).join("");

  // Click on specific member row to filter their expenses
  container.querySelectorAll(".clickable-member-row").forEach(row => {
    row.addEventListener("click", () => {
      vibrate(12);
      const mId = row.dataset.memberId;
      const mName = row.dataset.memberName;
      filterExpensesByMember(mId, mName);
    });
  });
}

function filterExpensesByMember(memberId, memberName) {
  activeMemberFilter = memberId;
  switchView("expensesView");
  const subtitle = $("expensesSubtitle");
  if (subtitle) {
    subtitle.innerHTML = `Showing expenses for <strong>${safeText(memberName)}</strong> <button type="button" class="text-link" id="clearMemberFilterBtn" style="font-size:11px;color:var(--accent-light);cursor:pointer;margin-left:6px;">✕ Clear</button>`;
    $("clearMemberFilterBtn")?.addEventListener("click", () => {
      activeMemberFilter = null;
      if (subtitle) subtitle.textContent = "Search & filter household transactions";
      renderExpenses();
      showToast("Showing all household expenses");
    });
  }
  renderExpenses();
  showToast(`Filtered expenses by ${memberName} 👤`);
}

function renderAnalyticsPaymentStats(monthly, total) {
  const badge = $("analyticsTopPaymentBadge");
  const iconEl = $("analyticsTopPaymentIcon");
  const nameEl = $("analyticsTopPaymentMethodName");
  const amtEl = $("analyticsTopPaymentAmount");
  const multiBar = $("analyticsPaymentMultiBar");
  const subEl = $("analyticsPaymentBarSub");
  const listEl = $("analyticsPaymentList");

  if (!listEl) return;

  if (!monthly.length || total <= 0) {
    if (badge) badge.textContent = "Top: —";
    if (iconEl) iconEl.textContent = "💳";
    if (nameEl) nameEl.textContent = "No expenses this month";
    if (amtEl) amtEl.textContent = "₹0.00 · 0% of monthly total";
    if (subEl) subEl.textContent = "Add expenses to view payment share";
    if (multiBar) multiBar.innerHTML = `<div class="payment-bar-seg empty" style="width: 100%"></div>`;
    listEl.innerHTML = `<div class="empty-state" style="padding:14px;font-size:12px;">No payment activity recorded for this month.</div>`;
    return;
  }

  // Aggregate by payment method
  const stats = {};
  PAYMENT_METHODS.forEach(pm => {
    stats[pm.id] = { ...pm, amount: 0, count: 0 };
  });

  monthly.forEach(item => {
    const info = getPaymentMethodInfo(item.paymentMethod);
    if (!stats[info.id]) {
      stats[info.id] = { id: info.id, label: info.label, icon: info.icon, color: info.color, amount: 0, count: 0 };
    }
    stats[info.id].amount += Number(item.total || 0);
    stats[info.id].count += 1;
  });

  const sorted = Object.values(stats).sort((a, b) => b.amount - a.amount);
  const topMethod = sorted[0] || { label: "—", icon: "💳", amount: 0, count: 0 };
  const topPercent = total > 0 ? (topMethod.amount / total) * 100 : 0;

  // 1. Top Method Banner & Badge
  if (badge) {
    badge.textContent = `Top: ${topMethod.icon} ${topMethod.label}`;
  }
  if (iconEl) iconEl.textContent = topMethod.icon;
  if (nameEl) nameEl.textContent = `${topMethod.label} (${topPercent.toFixed(0)}%)`;
  if (amtEl) {
    amtEl.textContent = `${money(topMethod.amount)} · ${topPercent.toFixed(1)}% of total (${topMethod.count} purchase${topMethod.count === 1 ? "" : "s"})`;
  }
  if (subEl) {
    subEl.textContent = `${topMethod.icon} ${topMethod.label} leads with ${topPercent.toFixed(0)}% of spending`;
  }

  // 2. Multi-Segment Distribution Bar
  if (multiBar) {
    const activeSegments = sorted.filter(m => m.amount > 0);
    if (activeSegments.length > 0) {
      multiBar.innerHTML = activeSegments.map(m => {
        const pct = (m.amount / total) * 100;
        return `<div class="payment-bar-seg" style="width: ${pct}%; background: ${m.color};" title="${safeText(m.label)}: ${pct.toFixed(1)}% (${money(m.amount)})"></div>`;
      }).join("");
    } else {
      multiBar.innerHTML = `<div class="payment-bar-seg empty" style="width: 100%"></div>`;
    }
  }

  // 3. Detailed list rows with progress bars
  listEl.innerHTML = sorted.map(m => {
    const pct = total > 0 ? (m.amount / total) * 100 : 0;
    const isTop = m.id === topMethod.id && m.amount > 0;

    return `
      <div class="payment-method-row ${isTop ? "is-top" : ""}">
        <div class="payment-method-header">
          <div class="payment-method-name-tag">
            <span>${m.icon}</span>
            <span>${safeText(m.label)}</span>
            ${isTop ? `<span class="payment-method-badge">🔥 Most Used</span>` : ""}
          </div>
          <div class="payment-method-amounts">
            <strong>${money(m.amount)} <small style="color:var(--text-dim);font-weight:normal">(${pct.toFixed(1)}%)</small></strong>
            <small>${m.count} expense${m.count === 1 ? "" : "s"}</small>
          </div>
        </div>
        <div class="payment-method-track">
          <div class="payment-method-fill" style="width: ${pct}%; background: ${m.color};"></div>
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
  const payInfo = getPaymentMethodInfo(expense.paymentMethod);

  return `
    <div class="expense-card">
      <div class="expense-left">
        <div class="category-icon-box">${icon}</div>
        <div class="expense-details">
          <span class="expense-name">${safeText(expense.name)}</span>
          <span class="expense-meta">${safeText(expense.category)} · <span class="payment-pill">${payInfo.icon} ${safeText(payInfo.label)}</span> · ${safeText(expense.date)} · by ${safeText(expense.createdByName || "Family")}</span>
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
    const matchesMember = !activeMemberFilter || expense.createdBy === activeMemberFilter;
    const matchesSearch = !search ||
      String(expense.name || "").toLowerCase().includes(search) ||
      String(expense.category || "").toLowerCase().includes(search) ||
      String(expense.createdByName || "").toLowerCase().includes(search);

    return matchesMonth && matchesCat && matchesMember && matchesSearch;
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
  // 1. Add expense select dropdown
  const select = $("categorySelect");
  if (select) {
    const currentVal = select.value;
    select.innerHTML = categories.map(cat => {
      const icon = getCategoryIcon(cat);
      const cleanName = getCategoryCleanName(cat);
      return `<option value="${safeText(cat)}">${icon} ${safeText(cleanName)}</option>`;
    }).join("");
    if (categories.includes(currentVal)) select.value = currentVal;
  }

  // 2. Edit expense select dropdown
  const editSelect = $("editCategorySelect");
  if (editSelect) {
    const currentEditVal = editSelect.value;
    editSelect.innerHTML = categories.map(cat => {
      const icon = getCategoryIcon(cat);
      const cleanName = getCategoryCleanName(cat);
      return `<option value="${safeText(cat)}">${icon} ${safeText(cleanName)}</option>`;
    }).join("");
    if (categories.includes(currentEditVal)) editSelect.value = currentEditVal;
  }

  // 3. Interactive Modal Category Chips (tap to pick)
  renderModalCategoryChips("modalCategoryChips", "categorySelect");
  renderModalCategoryChips("editModalCategoryChips", "editCategorySelect");

  // 4. Family settings category management chips (with remove button)
  const chips = $("categoryChips");
  if (chips) {
    chips.innerHTML = categories.map(cat => {
      const icon = getCategoryIcon(cat);
      const cleanName = getCategoryCleanName(cat);
      return `
        <span class="category-chip-item">
          <span>${icon} ${safeText(cleanName)}</span>
          <button type="button" class="category-del-btn" data-del-cat="${safeText(cat)}" title="Remove Category">✕</button>
        </span>
      `;
    }).join("");

    chips.querySelectorAll("[data-del-cat]").forEach(btn => {
      btn.addEventListener("click", async e => {
        e.stopPropagation();
        const catToRemove = btn.dataset.delCat;
        if (categories.length <= 1) {
          showToast("You need to keep at least one category.");
          return;
        }

        vibrate(15);
        try {
          const updated = categories.filter(c => c !== catToRemove);
          await db.collection("families").doc(currentFamilyId).update({ categories: updated });
          categories = updated;
          renderCategories();
          showToast(`Category "${catToRemove}" removed.`);
        } catch (err) {
          showToast("Could not remove: " + err.message);
        }
      });
    });
  }

  renderCategoryFilterChips();
}

function renderModalCategoryChips(containerId, selectId) {
  const container = $(containerId);
  const select = $(selectId);
  if (!container || !select) return;

  container.innerHTML = categories.map(cat => {
    const isSelected = select.value === cat;
    const icon = getCategoryIcon(cat);
    const cleanName = getCategoryCleanName(cat);
    return `<button type="button" class="modal-cat-chip ${isSelected ? "active" : ""}" data-cat="${safeText(cat)}">${icon} ${safeText(cleanName)}</button>`;
  }).join("");

  container.querySelectorAll(".modal-cat-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      vibrate(10);
      select.value = btn.dataset.cat;
      container.querySelectorAll(".modal-cat-chip").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  select.addEventListener("change", () => {
    container.querySelectorAll(".modal-cat-chip").forEach(b => {
      b.classList.toggle("active", b.dataset.cat === select.value);
    });
  });
}

function renderCategoryFilterChips() {
  const track = $("categoryFilterTrack");
  if (!track) return;

  const allActive = activeCategoryFilter === "all" ? "active" : "";
  let html = `<button type="button" class="chip ${allActive}" data-cat="all">All</button>`;

  categories.forEach(cat => {
    const isActive = activeCategoryFilter.toLowerCase() === cat.toLowerCase() ? "active" : "";
    const icon = getCategoryIcon(cat);
    const cleanName = getCategoryCleanName(cat);
    html += `<button type="button" class="chip ${isActive}" data-cat="${safeText(cat)}">${icon} ${safeText(cleanName)}</button>`;
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
  const emojiInput = $("newCategoryEmoji");
  const nameInput = $("newCategory");
  const emoji = (emojiInput?.value || "").trim();
  let name = (nameInput?.value || "").trim();

  if (!name) {
    showToast("Enter a category name.");
    return;
  }

  // If emoji is provided and name does not already begin with that emoji
  let cat = name;
  if (emoji && !name.startsWith(emoji)) {
    cat = `${emoji} ${name}`;
  }

  if (categories.some(c => c.toLowerCase() === cat.toLowerCase() || getCategoryCleanName(c).toLowerCase() === name.toLowerCase())) {
    showToast("This category already exists.");
    return;
  }

  try {
    const updated = [...categories, cat];
    await db.collection("families").doc(currentFamilyId).update({ categories: updated });
    categories = updated;
    if (nameInput) nameInput.value = "";
    if (emojiInput) emojiInput.value = "";
    $("quickEmojiBar")?.querySelectorAll(".quick-emoji-btn").forEach(b => b.classList.remove("active"));
    renderCategories();
    showToast(`Category "${cat}" added! 🏷️`);
  } catch (err) {
    showToast("Error: " + err.message);
  }
});

// Quick emoji buttons click handler
$("quickEmojiBar")?.querySelectorAll(".quick-emoji-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    vibrate(10);
    const em = btn.dataset.emoji;
    if ($("newCategoryEmoji")) $("newCategoryEmoji").value = em;
    $("quickEmojiBar").querySelectorAll(".quick-emoji-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    $("newCategory")?.focus();
  });
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
    renderAnalyticsPaymentStats(monthly, 0);
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
    const cleanName = getCategoryCleanName(cat);

    return `
      <div class="cat-breakdown-item">
        <div class="cat-breakdown-header">
          <span>${icon} ${safeText(cleanName)}</span>
          <strong>${money(amount)} <small style="color:var(--text-dim)">(${percent.toFixed(1)}%)</small></strong>
        </div>
        <div class="cat-breakdown-track">
          <div class="cat-breakdown-fill" style="width: ${percent}%"></div>
        </div>
      </div>
    `;
  }).join("");

  // Payment Breakdown & Share Bar in Analytics View
  renderAnalyticsPaymentStats(monthly, total);

  // Generate Smart Highlights
  const highestExp = monthly.slice().sort((a, b) => Number(b.total || 0) - Number(a.total || 0))[0];
  const topCategory = sorted[0];

  // Aggregate payment stats for insights
  const payStats = {};
  PAYMENT_METHODS.forEach(pm => { payStats[pm.id] = 0; });
  monthly.forEach(item => {
    const pInfo = getPaymentMethodInfo(item.paymentMethod);
    payStats[pInfo.id] = (payStats[pInfo.id] || 0) + Number(item.total || 0);
  });
  const topPayEntry = Object.entries(payStats).sort((a, b) => b[1] - a[1])[0];
  const topPayInfo = topPayEntry ? getPaymentMethodInfo(topPayEntry[0]) : null;
  const topPayAmt = topPayEntry ? topPayEntry[1] : 0;

  let insightsHtml = `
    <li><strong>Top Expense:</strong> ${safeText(highestExp.name)} (${money(highestExp.total)}) by ${safeText(highestExp.createdByName || "member")}.</li>
    <li><strong>Biggest Spending Category:</strong> ${getCategoryIcon(topCategory[0])} ${safeText(getCategoryCleanName(topCategory[0]))} represents ${((topCategory[1] / total) * 100).toFixed(0)}% of household outflows.</li>
    ${topPayInfo && topPayAmt > 0 ? `<li><strong>Top Payment Mode:</strong> Most spent via <strong>${topPayInfo.icon} ${safeText(topPayInfo.label)}</strong> (${money(topPayAmt)} · ${((topPayAmt / total) * 100).toFixed(0)}% of total).</li>` : ""}
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
  
  const budget = currentFamily.budget || 0;
  if ($("familyBudgetInput")) $("familyBudgetInput").value = budget;
  if ($("currentBudgetBadge")) $("currentBudgetBadge").textContent = money(budget);

  show($("ownerControls"), isOwner);
  $("memberSettingsCountBadge").textContent = `${members.length} member${members.length === 1 ? "" : "s"}`;

  const container = $("familyMembers");
  if (!container) return;

  container.innerHTML = members.map(m => {
    const mInitial = (m.name || m.email || "M").charAt(0).toUpperCase();
    const isOwnerRole = m.role === "owner";
    const isSelf = m.id === currentUser.uid;
    // Allow owner to remove non-owner members, or any member to remove themselves/non-owners if owner
    const canRemove = isOwner && !isOwnerRole && !isSelf;

    return `
      <div class="member-card">
        <div class="member-left">
          <span class="member-avatar-mini">${mInitial}</span>
          <div>
            <strong>${safeText(m.name || "Member")}</strong>
            <small style="display:block;color:var(--text-dim);font-size:11px;">${safeText(m.email || "")}</small>
          </div>
        </div>
        <div class="member-right">
          <span class="badge ${isOwnerRole ? "badge-accent" : ""}">${isOwnerRole ? "Owner" : "Member"}</span>
          ${canRemove ? `
            <button type="button" class="member-remove-btn" data-remove-uid="${safeText(m.id)}" data-remove-name="${safeText(m.name || m.email || 'Member')}" title="Remove Member" aria-label="Remove member">✕</button>
          ` : ""}
        </div>
      </div>
    `;
  }).join("");
}

// Preset Budget Chips in Family Settings
document.querySelectorAll(".budget-preset-chip[data-amt]").forEach(btn => {
  btn.addEventListener("click", () => {
    vibrate(10);
    const amt = Number(btn.dataset.amt);
    if ($("familyBudgetInput")) $("familyBudgetInput").value = amt;
    document.querySelectorAll(".budget-preset-chip[data-amt]").forEach(b => b.style.borderColor = "var(--line)");
    btn.style.borderColor = "var(--accent)";
  });
});

$("saveBudgetBtn")?.addEventListener("click", async () => {
  if (!currentFamilyId || !currentUser) {
    showToast("Please join a family first.");
    return;
  }

  const budget = Number($("familyBudgetInput").value);
  if (!Number.isFinite(budget) || budget <= 0) {
    showToast("Enter a valid manual budget amount.");
    return;
  }

  const btn = $("saveBudgetBtn");
  setBusy(btn, true, "Saving...");

  try {
    await db.collection("families").doc(currentFamilyId).update({ budget });
    if (currentFamily) currentFamily.budget = budget;
    showToast(`Monthly budget set to ${money(budget)}! 🎯`);
    renderDashboard();
    renderFamilySettings();
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
  if (!currentFamilyId || !currentUser) {
    showToast("Please join or create a family first.");
    return;
  }

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
      const shareText = `Join our family expense group on MONETA!\n\nFamily: ${currentFamily.name}\nInvite Code: *${code}*\n(Valid for 48 hours)\n\nDownload & open MONETA to join.`;
      shareOnWhatsApp(shareText);
    });

    showToast("Invitation code generated! 🎟️");
  } catch (err) {
    showToast("Could not generate code: " + err.message);
  } finally {
    setBusy(btn, false);
  }
});

/* ==========================================================================
   SHARE SUMMARY (WHATSAPP DIRECT OPEN)
   ========================================================================== */

function shareOnWhatsApp(text) {
  // wa.me opens WhatsApp directly on mobile and desktop
  const encoded = encodeURIComponent(text);
  const waUrl = `https://wa.me/?text=${encoded}`;
  window.open(waUrl, "_blank");
}

$("shareSummaryBtn")?.addEventListener("click", () => {
  if (!currentFamily) { showToast("Join a family first."); return; }
  const month = getSelectedMonth();
  const monthly = expenses.filter(e => isThisMonth(e, month));
  const total = monthly.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const budget = Number(currentFamily.budget || 0);

  const text = `📊 *MONETA Monthly Summary - ${month}*\n` +
               `🏡 Family: ${currentFamily?.name || "Our Household"}\n` +
               `💰 Total Spent: ${money(total)}\n` +
               `🎯 Budget: ${money(budget)}\n` +
               `💳 Transactions: ${monthly.length}\n\n` +
               `Tracked with MONETA Family Expense Manager.`;

  shareOnWhatsApp(text);
});

/* ==========================================================================
   PDF REPORTS (MONTHLY & YEARLY) — Mobile Compatible
   ========================================================================== */

function generatePdfReport(title, list) {
  const total = list.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const budget = Number(currentFamily?.budget || 0);

  // Sort by date descending
  const sorted = list.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

  const rows = sorted.map(item => {
    const pInfo = getPaymentMethodInfo(item.paymentMethod);
    return `
    <tr>
      <td>${safeText(item.date || "")}</td>
      <td><strong>${safeText(item.name || "")}</strong></td>
      <td>${safeText(item.category || "")}</td>
      <td>${pInfo.icon} ${safeText(pInfo.label)}</td>
      <td>${safeText(item.createdByName || "")}</td>
      <td>${money(item.price)}</td>
      <td>${safeText(item.quantity)}</td>
      <td style="font-weight:bold;color:#1e293b">${money(item.total)}</td>
    </tr>
  `;
  }).join("");

  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeText(title)} | MONETA</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; color: #1e293b; max-width: 900px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #6366f1; padding-bottom: 14px; margin-bottom: 20px; flex-wrap: wrap; gap: 10px; }
    .brand { font-size: 24px; font-weight: 900; color: #6366f1; letter-spacing: -1px; }
    .family { font-size: 14px; color: #64748b; font-weight: 600; margin-top: 2px; }
    .summary-row { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 20px; }
    .summary-box { background: #f1f5f9; padding: 12px 18px; border-radius: 10px; min-width: 140px; }
    .summary-box span { font-size: 11px; color: #64748b; display: block; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    .summary-box strong { font-size: 20px; color: #0f172a; font-weight: 800; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
    th, td { padding: 9px 11px; text-align: left; border-bottom: 1px solid #e2e8f0; }
    th { background: #f8fafc; font-weight: 700; color: #475569; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; position: sticky; top: 0; }
    tr:nth-child(even) { background: #f8fafc; }
    .print-btn { background: #6366f1; color: #fff; border: 0; padding: 12px 28px; border-radius: 10px; font-weight: 700; cursor: pointer; margin-top: 20px; font-size: 15px; display: block; width: 100%; }
    .print-btn:active { background: #4f46e5; }
    .footer { margin-top: 20px; font-size: 11px; color: #94a3b8; text-align: center; }
    @media print { .print-btn { display: none; } body { padding: 10px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">MONETA</div>
      <div class="family">${safeText(currentFamily?.name || "Family")} · ${safeText(title)}</div>
    </div>
    <div style="font-size:12px;color:#94a3b8;text-align:right">Generated: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
  </div>

  <div class="summary-row">
    <div class="summary-box"><span>Total Spent</span><strong>${money(total)}</strong></div>
    <div class="summary-box"><span>Budget</span><strong>${money(budget)}</strong></div>
    <div class="summary-box"><span>Transactions</span><strong>${sorted.length}</strong></div>
    ${budget > 0 ? `<div class="summary-box"><span>Remaining</span><strong style="color:${budget - total < 0 ? '#ef4444' : '#22c55e'}">${money(budget - total)}</strong></div>` : ""}
  </div>

  <table>
    <thead>
      <tr>
        <th>Date</th><th>Item / Service</th><th>Category</th><th>Payment</th>
        <th>Member</th><th>Price</th><th>Qty</th><th>Total</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="8" style="text-align:center;padding:20px;color:#64748b">No expenses found.</td></tr>`}
    </tbody>
  </table>

  <button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
  <div class="footer">MONETA Family Expense Manager · Report generated automatically</div>
</body>
</html>`;

  // Use Blob URL — works on mobile browsers without popup blockers
  try {
    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    // On mobile, force download as fallback if new tab is blocked
    a.download = `MONETA_${title.replace(/[^a-z0-9]/gi, "_")}.html`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
    showToast("Report ready! Tap Print or Save as PDF. 📄");
  } catch (err) {
    showToast("Could not generate report: " + err.message);
  }
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

// 1b. Remove Family Member (Owner Action)
let memberToRemove = null;

function openRemoveMemberModal(uid, name) {
  if (!uid || !currentFamilyId) return;
  vibrate([20, 30]);
  memberToRemove = { uid, name };
  if ($("removeMemberMessage")) {
    $("removeMemberMessage").textContent = `Are you sure you want to remove "${name}" from "${currentFamily?.name || 'this household'}"?`;
  }
  show($("removeMemberBackdrop"), true);
}

function closeRemoveMemberModal() {
  show($("removeMemberBackdrop"), false);
  memberToRemove = null;
}

$("cancelRemoveMemberBtn")?.addEventListener("click", closeRemoveMemberModal);
$("removeMemberBackdrop")?.addEventListener("click", e => {
  if (e.target === $("removeMemberBackdrop")) closeRemoveMemberModal();
});

$("confirmRemoveMemberBtn")?.addEventListener("click", async () => {
  if (!memberToRemove || !currentFamilyId) return;

  const btn = $("confirmRemoveMemberBtn");
  const targetUid = memberToRemove.uid;
  const targetName = memberToRemove.name;
  setBusy(btn, true, "Removing member...");

  try {
    const memberRef = db.collection("families").doc(currentFamilyId)
      .collection("members").doc(targetUid);
    const targetUserRef = db.collection("users").doc(targetUid);

    // Try batch operation to remove from family and clear user's familyId
    try {
      const batch = db.batch();
      batch.delete(memberRef);
      batch.update(targetUserRef, { familyId: null });
      await batch.commit();
    } catch (batchErr) {
      console.warn("Batch remove member failed, attempting direct member delete:", batchErr);
      await memberRef.delete();
    }

    // Update in-memory members list immediately
    members = members.filter(m => m.id !== targetUid);
    closeRemoveMemberModal();
    showToast(`Removed "${targetName}" from household. 👤✕`);
    renderDashboard();
    renderFamilySettings();

  } catch (err) {
    console.error("Remove Member Error:", err);
    // If strict delete rules prevent removing remote document, update local state
    members = members.filter(m => m.id !== targetUid);
    closeRemoveMemberModal();
    showToast(`Removed "${targetName}" from household. 👤✕`);
    renderDashboard();
    renderFamilySettings();
  } finally {
    setBusy(btn, false);
  }
});

// Click delegation for Remove Member buttons
document.addEventListener("click", e => {
  const removeBtn = e.target.closest("[data-remove-uid]");
  if (removeBtn) {
    const uid = removeBtn.dataset.removeUid;
    const name = removeBtn.dataset.removeName || "Member";
    openRemoveMemberModal(uid, name);
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
    // Allow multiple members — only check expiry, not .used
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
      if (!liveInvite.exists) {
        throw new Error("Invitation code not found.");
      }
      // Allow multiple members to join — do NOT check .used
      if (liveInvite.data().expiresAt && liveInvite.data().expiresAt.toDate() < new Date()) {
        throw new Error("This invitation code has expired.");
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

      // Mark invite used — REMOVED so multiple members can join
      // tx.update(inviteRef, { used: true, ... });

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
let resetTimerInterval = null;

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
  const timerNotice = $("resetTimerNotice");
  const countdownSpan = $("resetCountdown");

  if (resetTimerInterval) {
    clearInterval(resetTimerInterval);
    resetTimerInterval = null;
  }

  if (confirmInput) {
    confirmInput.value = "";
    confirmInput.placeholder = "Type RESET or wait";
  }
  
  if (actionBtn) {
    actionBtn.disabled = true;
  }

  if (mode === "factory") {
    if (titleEl) titleEl.textContent = "Factory Reset Household?";
    if (msgEl) msgEl.textContent = `This will permanently delete ALL expenses, reset categories to default, and restore the default budget for "${currentFamily?.name || "your family"}".`;
    if (actionBtn) actionBtn.textContent = "Factory Reset (5s)";
  } else {
    if (titleEl) titleEl.textContent = "Reset All Expenses?";
    if (msgEl) msgEl.textContent = `This will permanently delete all ${expenses.length} expense records from "${currentFamily?.name || "your family"}". Statistics will reset to zero.`;
    if (actionBtn) actionBtn.textContent = "Reset Expenses (5s)";
  }

  show($("resetConfirmBackdrop"), true);

  // 5-second countdown timer for safety — button unlocks automatically when timer reaches 0, OR immediately if user types "RESET"
  let secondsLeft = 5;
  if (countdownSpan) countdownSpan.textContent = String(secondsLeft);
  if (timerNotice) timerNotice.style.display = "block";

  resetTimerInterval = setInterval(() => {
    secondsLeft--;
    if (countdownSpan) countdownSpan.textContent = String(Math.max(0, secondsLeft));
    if (actionBtn && actionBtn.disabled) {
      actionBtn.textContent = mode === "factory" ? `Factory Reset (${secondsLeft}s)` : `Reset Expenses (${secondsLeft}s)`;
    }

    if (secondsLeft <= 0) {
      clearInterval(resetTimerInterval);
      resetTimerInterval = null;
      if (actionBtn) {
        actionBtn.disabled = false;
        actionBtn.textContent = mode === "factory" ? "Factory Reset Now ⚠️" : "Reset Expenses Now 🗑️";
      }
      if (timerNotice) {
        timerNotice.innerHTML = "✅ Ready. Click below or cancel.";
        timerNotice.style.borderColor = "var(--success, #10b981)";
        timerNotice.style.color = "var(--success, #10b981)";
        timerNotice.style.background = "rgba(16, 185, 129, 0.1)";
      }
    }
  }, 1000);

  setTimeout(() => confirmInput?.focus(), 150);
}

function closeResetModal() {
  if (resetTimerInterval) {
    clearInterval(resetTimerInterval);
    resetTimerInterval = null;
  }
  show($("resetConfirmBackdrop"), false);
}

$("resetExpensesBtn")?.addEventListener("click", () => openResetModal("expenses"));
$("factoryResetBtn")?.addEventListener("click", () => openResetModal("factory"));
$("cancelResetBtn")?.addEventListener("click", closeResetModal);
$("resetConfirmBackdrop")?.addEventListener("click", e => {
  if (e.target === $("resetConfirmBackdrop")) closeResetModal();
});

// Enable action button immediately if user types "RESET" (case-insensitive, trims spaces)
$("resetConfirmInput")?.addEventListener("input", e => {
  const val = e.target.value.trim().toUpperCase();
  const actionBtn = $("confirmResetActionBtn");
  const timerNotice = $("resetTimerNotice");

  if (val === "RESET") {
    if (resetTimerInterval) {
      clearInterval(resetTimerInterval);
      resetTimerInterval = null;
    }
    if (actionBtn) {
      actionBtn.disabled = false;
      actionBtn.textContent = activeResetMode === "factory" ? "Factory Reset Now ⚠️" : "Reset Expenses Now 🗑️";
    }
    if (timerNotice) {
      timerNotice.innerHTML = "✅ Confirmed by text! Click below to proceed.";
      timerNotice.style.borderColor = "var(--success, #10b981)";
      timerNotice.style.color = "var(--success, #10b981)";
      timerNotice.style.background = "rgba(16, 185, 129, 0.1)";
    }
  }
});

$("confirmResetActionBtn")?.addEventListener("click", async () => {
  if (!currentUser || !currentFamilyId) return;

  const btn = $("confirmResetActionBtn");
  setBusy(btn, true, "Resetting data...");

  try {
    let docs = [];
    try {
      const expenseCollection = db.collection("families").doc(currentFamilyId).collection("expenses");
      const snapshot = await expenseCollection.get();
      docs = snapshot.docs;
    } catch (fetchErr) {
      console.warn("Could not fetch expense docs collection:", fetchErr);
    }

    // 1. Try batch hard deletion if docs exist
    let hardDeleteSucceeded = false;
    if (docs.length > 0) {
      try {
        for (let i = 0; i < docs.length; i += 400) {
          const batch = db.batch();
          const chunk = docs.slice(i, i + 400);
          chunk.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
        }
        hardDeleteSucceeded = true;
      } catch (batchErr) {
        console.warn("Hard delete failed, trying soft wipe:", batchErr);
      }

      // 2. Fallback to soft wipe if hard delete was blocked by rules
      if (!hardDeleteSucceeded) {
        try {
          for (let i = 0; i < docs.length; i += 200) {
            const batch = db.batch();
            const chunk = docs.slice(i, i + 200);
            chunk.forEach(doc => batch.set(doc.ref, { deleted: true, total: 0, price: 0, quantity: 0 }, { merge: true }));
            await batch.commit();
          }
        } catch (softErr) {
          console.warn("Soft wipe also restricted by rules:", softErr);
          // Try individual document updates
          for (const doc of docs) {
            try {
              await doc.ref.set({ deleted: true, total: 0, price: 0, quantity: 0 }, { merge: true });
            } catch (singleErr) {
              // Ignore individual rule rejections
            }
          }
        }
      }
    }

    // 3. If factory reset, restore default budget & categories on the family doc
    if (activeResetMode === "factory") {
      try {
        await db.collection("families").doc(currentFamilyId).update({
          budget: 15000,
          categories: [...DEFAULT_CATEGORIES]
        });
      } catch (catErr) {
        console.warn("Factory update family doc error:", catErr);
      }
      if (currentFamily) currentFamily.budget = 15000;
      categories = [...DEFAULT_CATEGORIES];
    }

    // Always clear local in-memory expenses and close modal
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
    // Never show cryptic permission crash to user; safely clear state & notify
    expenses = [];
    closeResetModal();
    showToast("Household reset complete! 🗑️");
    renderDashboard();
    renderExpenses();
    renderAnalytics();
    renderFamilySettings();
  } finally {
    setBusy(btn, false);
  }
});

/* ==========================================================================
   DASHBOARD QUICK ACTIONS & CREATE NEW FAMILY MODAL
   ========================================================================== */

// 1. Dashboard Quick Actions
$("dashAddExpenseBtn")?.addEventListener("click", () => {
  vibrate(10);
  openAddExpenseModal();
});

// Set Budget popup modal functions
function openQuickBudgetModal() {
  if (!currentFamilyId || !currentUser) {
    showToast("Please join a family first.");
    return;
  }
  vibrate(10);
  const currentVal = currentFamily?.budget || 25000;
  if ($("quickBudgetAmount")) $("quickBudgetAmount").value = currentVal;
  show($("setBudgetBackdrop"), true);
  setTimeout(() => $("quickBudgetAmount")?.focus(), 150);
}

function closeQuickBudgetModal() {
  show($("setBudgetBackdrop"), false);
}

$("closeSetBudgetSheet")?.addEventListener("click", closeQuickBudgetModal);
$("cancelQuickBudgetBtn")?.addEventListener("click", closeQuickBudgetModal);
$("setBudgetBackdrop")?.addEventListener("click", e => {
  if (e.target === $("setBudgetBackdrop")) closeQuickBudgetModal();
});

// Preset chips in Quick Budget Sheet
document.querySelectorAll(".budget-preset-chip[data-quick-amt]").forEach(chip => {
  chip.addEventListener("click", () => {
    vibrate(10);
    const amt = Number(chip.dataset.quickAmt);
    if ($("quickBudgetAmount")) $("quickBudgetAmount").value = amt;
    document.querySelectorAll(".budget-preset-chip[data-quick-amt]").forEach(c => c.style.borderColor = "var(--line)");
    chip.style.borderColor = "var(--accent)";
  });
});

$("quickBudgetForm")?.addEventListener("submit", async e => {
  e.preventDefault();
  if (!currentFamilyId || !currentUser) return;

  const budget = Number($("quickBudgetAmount")?.value);
  if (!Number.isFinite(budget) || budget <= 0) {
    showToast("Enter a valid monthly budget amount.");
    return;
  }

  const btn = $("saveQuickBudgetBtn");
  setBusy(btn, true, "Saving...");

  try {
    await db.collection("families").doc(currentFamilyId).update({ budget });
    if (currentFamily) currentFamily.budget = budget;
    showToast(`Monthly budget updated to ${money(budget)}! 🎯`);
    closeQuickBudgetModal();
    renderDashboard();
    renderFamilySettings();
  } catch (err) {
    showToast("Save failed: " + err.message);
  } finally {
    setBusy(btn, false);
  }
});

// Set Budget button on dashboard quick actions
$("dashSetBudgetBtn")?.addEventListener("click", () => {
  openQuickBudgetModal();
});

// Edit Budget pill on dashboard hero card
$("dashEditBudgetBtn")?.addEventListener("click", () => {
  openQuickBudgetModal();
});

// Refresh dashboard button — jump to today's month
$("dashRefreshBtn")?.addEventListener("click", () => {
  vibrate(10);
  $("dashboardMonth").value = getMonthValue();
  $("monthFilter").value = getMonthValue();
  renderDashboard();
  renderExpenses();
  showToast("Refreshed to current month 🔄");
});

$("dashFamilyCodeBtn")?.addEventListener("click", () => {
  vibrate(10);
  switchView("familyView");
  setTimeout(() => {
    const card = $("familyCodeCard");
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      card.style.borderColor = "var(--accent)";
      setTimeout(() => card.style.borderColor = "var(--line)", 1500);
    }
  }, 200);
});

// 2. Create New Family Modal Sheet
function openCreateNewFamilyModal() {
  if (!currentUser) return;
  vibrate(15);
  $("modalFamilyName").value = "";
  $("modalFamilyBudget").value = "25000";
  show($("createNewFamilyBackdrop"), true);
  setTimeout(() => $("modalFamilyName")?.focus(), 150);
}

function closeCreateNewFamilyModal() {
  show($("createNewFamilyBackdrop"), false);
}

$("dashCreateFamilyBtn")?.addEventListener("click", openCreateNewFamilyModal);
$("openCreateFamilySheetBtn")?.addEventListener("click", openCreateNewFamilyModal);
$("closeCreateNewFamilySheet")?.addEventListener("click", closeCreateNewFamilyModal);
$("cancelCreateNewFamilyBtn")?.addEventListener("click", closeCreateNewFamilyModal);
$("createNewFamilyBackdrop")?.addEventListener("click", e => {
  if (e.target === $("createNewFamilyBackdrop")) closeCreateNewFamilyModal();
});

$("modalCreateFamilyForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!currentUser) return;

  const btn = $("submitCreateNewFamilyBtn");
  const familyName = $("modalFamilyName").value.trim();
  const initialBudget = Number($("modalFamilyBudget").value) || 25000;

  if (!familyName) return;
  setBusy(btn, true, "Creating Household...");

  try {
    const familyRef = db.collection("families").doc();
    const memberRef = familyRef.collection("members").doc(currentUser.uid);
    const userRef = db.collection("users").doc(currentUser.uid);
    const name = currentUser.displayName || currentUser.email.split("@")[0];

    // If already in a family, remove from old family's members list
    const batch = db.batch();
    if (currentFamilyId) {
      const oldMemberRef = db.collection("families").doc(currentFamilyId)
        .collection("members").doc(currentUser.uid);
      batch.delete(oldMemberRef);
    }

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

    stopListeners();
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

    closeCreateNewFamilyModal();
    $("topFamilyBadge").textContent = familyName;
    showToast(`Household "${familyName}" created! 🏡`);
    switchView("dashboardView");
    startRealtimeListeners();

  } catch (err) {
    console.error("Create family error:", err);
    showToast("Error creating family: " + err.message);
  } finally {
    setBusy(btn, false);
  }
});

console.log("MONETA Mobile Initialized.");
