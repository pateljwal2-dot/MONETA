
/* ==========================================
   MONETA - FAMILY EXPENSE MANAGER
   Firebase Authentication + Cloud Firestore
========================================== */

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

const $ = id => document.getElementById(id);
const money = amount =>
  "₹" + Number(amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

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
  "Other"
];

let currentUser = null;
let currentFamily = null;
let currentFamilyId = null;
let currentMember = null;
let expenses = [];
let members = [];
let categories = [...DEFAULT_CATEGORIES];
let expenseUnsubscribe = null;
let memberUnsubscribe = null;
let familyUnsubscribe = null;
let authMode = "login";
let currentPage = "dashboard";

const today = new Date();
const localDate = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, "0"),
  String(today.getDate()).padStart(2, "0")
].join("-");

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

function setMessage(id, message, isError = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? "#d64545" : "#198754";
}

function setBusy(button, busy, text) {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.disabled = true;
    button.textContent = text || "Please wait...";
  } else {
    button.disabled = false;
    button.textContent =
      button.dataset.originalText || button.textContent;
  }
}

function show(element, visible) {
  if (element) element.classList.toggle("hidden", !visible);
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

function safeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
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

function showAuth() {
  show($("authScreen"), true);
  show($("appShell"), false);
  show($("noFamily"), false);
  show($("dashboardPage"), false);
  show($("expensesPage"), false);
  show($("familyPage"), false);
}

function showApp() {
  show($("authScreen"), false);
  show($("appShell"), true);
}

function showNoFamily() {
  showApp();
  show($("noFamily"), true);
  show($("dashboardPage"), false);
  show($("expensesPage"), false);
  show($("familyPage"), false);
}

function showFamilyApp() {
  showApp();
  show($("noFamily"), false);
  navigateTo(currentPage);
}

function navigateTo(page) {
  currentPage = page;

  show($("dashboardPage"), page === "dashboard");
  show($("expensesPage"), page === "expenses");
  show($("familyPage"), page === "family");

  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });

  const titles = {
    dashboard: "Family overview",
    expenses: "Family expenses",
    family: "Family settings"
  };

  if ($("pageTitle")) $("pageTitle").textContent = titles[page] || "MONETA";
  if (page === "dashboard") renderDashboard();
  if (page === "expenses") renderExpenses();
  if (page === "family") renderFamilySettings();
}

/* ==========================================
   AUTHENTICATION
========================================== */

function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === "signup";

  $("authTitle").textContent = signup ? "Create your account" : "Welcome back";
  $("authSubtitle").textContent = signup
    ? "Create your MONETA account to get started."
    : "Sign in to access your family account.";
  $("authSubmit").textContent = signup ? "Create account" : "Sign in";
  $("authSwitchText").textContent = signup
    ? "Already have an account?"
    : "New to MONETA?";
  $("authSwitch").textContent = signup ? "Sign in" : "Create account";

  show($("nameField"), signup);
  $("authName").required = signup;
  setMessage("authMessage", "");
}


$("authSwitch").addEventListener("click", event => {
  event.preventDefault();
  event.stopPropagation();

  const nextMode = authMode === "login" ? "signup" : "login";
  setAuthMode(nextMode);
});


$("authForm").addEventListener("submit", async event => {
  event.preventDefault();

  const button = $("authSubmit");
  const email = $("authEmail").value.trim().toLowerCase();
  const password = $("authPassword").value;
  const name = $("authName").value.trim();

  setBusy(button, true, "Please wait...");
  setMessage("authMessage", "");

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
      showToast("Account created successfully.");
    } else {
      await auth.signInWithEmailAndPassword(email, password);
    }
  } catch (error) {
    setMessage("authMessage", error.message, true);
  } finally {
    setBusy(button, false);
  }
});

$("forgotPassword").addEventListener("click", async () => {
  const email = $("authEmail").value.trim().toLowerCase();

  if (!email) {
    setMessage("authMessage", "Enter your email address first.", true);
    $("authEmail").focus();
    return;
  }

  try {
    await auth.sendPasswordResetEmail(email);
    setMessage("authMessage", "Password reset email sent. Check your inbox.");
  } catch (error) {
    setMessage("authMessage", error.message, true);
  }
});

$("logoutBtn").addEventListener("click", async () => {
  stopListeners();
  await auth.signOut();
  currentUser = null;
  currentFamily = null;
  currentFamilyId = null;
  expenses = [];
  members = [];
  showAuth();
});

/* ==========================================
   AUTH STATE
========================================== */

auth.onAuthStateChanged(async user => {
  stopListeners();

  if (!user) {
    currentUser = null;
    currentFamily = null;
    currentFamilyId = null;
    showAuth();
    return;
  }

  currentUser = user;

  try {
    const userRef = db.collection("users").doc(user.uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      await userRef.set({
        name: user.displayName || user.email.split("@")[0],
        email: user.email,
        familyId: null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

    const userData = (await userRef.get()).data() || {};
    const displayName =
      userData.name || user.displayName || user.email.split("@")[0];

    $("sidebarName").textContent = displayName;
    $("sidebarEmail").textContent = user.email || "";
    $("userAvatar").textContent = displayName.charAt(0).toUpperCase();

    currentFamilyId = userData.familyId || null;

    if (!currentFamilyId) {
      showNoFamily();
      return;
    }

    const familySnap = await db.collection("families")
      .doc(currentFamilyId).get();

    if (!familySnap.exists) {
      await userRef.set({ familyId: null }, { merge: true });
      currentFamilyId = null;
      showNoFamily();
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
      showNoFamily();
      return;
    }

    currentMember = memberSnap.data();
    categories = currentFamily.categories || [...DEFAULT_CATEGORIES];

    $("dashboardMonth").value = getMonthValue();
    $("monthFilter").value = getMonthValue();
    $("expenseDate").value = localDate;

    showFamilyApp();
    startFamilyListeners();
  } catch (error) {
    console.error(error);
    showAuth();
    setMessage("authMessage", "Unable to load your account: " + error.message, true);
  }
});

/* ==========================================
   CREATE FAMILY
========================================== */

$("createFamilyForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser) return;

  const button = event.submitter;
  const familyName = $("familyName").value.trim();

  if (!familyName) return;

  setBusy(button, true, "Creating...");

  try {
    const familyRef = db.collection("families").doc();
    const memberRef = familyRef.collection("members").doc(currentUser.uid);
    const userRef = db.collection("users").doc(currentUser.uid);

    const name =
      currentUser.displayName || currentUser.email.split("@")[0];

    const batch = db.batch();

    batch.set(familyRef, {
      name: familyName,
      ownerUid: currentUser.uid,
      budget: 10000,
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
      budget: 10000,
      categories: [...DEFAULT_CATEGORIES]
    };
    currentMember = { role: "owner", name, email: currentUser.email };
    categories = [...DEFAULT_CATEGORIES];

    showToast("Family created successfully!");
    showFamilyApp();
    startFamilyListeners();
  } catch (error) {
    console.error(error);
    setMessage("familyMessage", error.message, true);
  } finally {
    setBusy(button, false);
  }
});

/* ==========================================
   JOIN FAMILY
========================================== */

$("joinFamilyForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser) return;

  const button = event.submitter;
  const code = $("inviteCode").value.trim().toUpperCase();

  if (!code) return;

  setBusy(button, true, "Joining...");

  try {
    const inviteRef = db.collection("invites").doc(code);
    const userRef = db.collection("users").doc(currentUser.uid);
    const inviteSnap = await inviteRef.get();

    if (!inviteSnap.exists) {
      throw new Error("Invitation code not found.");
    }

    const invite = inviteSnap.data();

    if (invite.used) throw new Error("This invitation has already been used.");
    if (invite.expiresAt && invite.expiresAt.toDate() < new Date()) {
      throw new Error("This invitation code has expired.");
    }

    const familyRef = db.collection("families").doc(invite.familyId);
    const familySnap = await familyRef.get();

    if (!familySnap.exists) throw new Error("The family no longer exists.");

    const name =
      currentUser.displayName || currentUser.email.split("@")[0];

    await db.runTransaction(async transaction => {
      const latestInvite = await transaction.get(inviteRef);

      if (!latestInvite.exists || latestInvite.data().used) {
        throw new Error("This invitation has already been used.");
      }

      const latestData = latestInvite.data();

      if (latestData.expiresAt &&
          latestData.expiresAt.toDate() < new Date()) {
        throw new Error("This invitation code has expired.");
      }

      transaction.set(familyRef.collection("members").doc(currentUser.uid), {
		  inviteCode: code,
        uid: currentUser.uid,
        name,
        email: currentUser.email,
        role: "member",
        joinedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      transaction.update(inviteRef, {
        used: true,
        usedBy: currentUser.uid,
        usedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      transaction.set(userRef, {
        name,
        email: currentUser.email,
        familyId: invite.familyId
      }, { merge: true });
    });

    currentFamilyId = invite.familyId;
    currentFamily = { id: familySnap.id, ...familySnap.data() };
    currentMember = { role: "member", name, email: currentUser.email };
    categories = currentFamily.categories || [...DEFAULT_CATEGORIES];

    showToast("You joined the family!");
    showFamilyApp();
    startFamilyListeners();
  } catch (error) {
    console.error(error);
    setMessage("familyMessage", error.message, true);
  } finally {
    setBusy(button, false);
  }
});

/* ==========================================
   FIRESTORE REAL-TIME LISTENERS
========================================== */

function startFamilyListeners() {
  if (!currentFamilyId) return;

  const familyRef = db.collection("families").doc(currentFamilyId);

  familyUnsubscribe = familyRef.onSnapshot(snapshot => {
    if (!snapshot.exists) return;

    currentFamily = { id: snapshot.id, ...snapshot.data() };
    categories = currentFamily.categories || [...DEFAULT_CATEGORIES];

    renderCategories();
    renderDashboard();
    renderFamilySettings();
  }, error => console.error("Family listener:", error));

  expenseUnsubscribe = familyRef.collection("expenses")
    .orderBy("date", "desc")
    .onSnapshot(snapshot => {
      expenses = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      renderDashboard();
      renderExpenses();
    }, error => {
      console.error("Expense listener:", error);
      showToast("Could not load expenses: " + error.message);
    });

  memberUnsubscribe = familyRef.collection("members")
    .onSnapshot(snapshot => {
      members = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      renderDashboard();
      renderFamilySettings();
    }, error => console.error("Member listener:", error));
}

/* ==========================================
   PAGE NAVIGATION
========================================== */

document.querySelectorAll(".nav-item").forEach(button => {
  button.addEventListener("click", () => {
    navigateTo(button.dataset.page);
  });
});

$("quickAddBtn").addEventListener("click", () => {
  navigateTo("expenses");
  $("productName").focus();
});

/* ==========================================
   EXPENSE FORM
========================================== */

$("price").addEventListener("input", updateCalculatedTotal);
$("quantity").addEventListener("input", updateCalculatedTotal);

function updateCalculatedTotal() {
  const price = Number($("price").value) || 0;
  const quantity = Number($("quantity").value) || 0;
  $("calculatedTotal").textContent = money(price * quantity);
}

$("expenseForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentFamilyId || !currentUser) {
    showToast("Please join a family first.");
    return;
  }

  const button = event.submitter;
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
        createdByName: currentMember?.name ||
          currentUser.displayName || currentUser.email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

    $("expenseForm").reset();
    $("expenseDate").value = localDate;
    $("quantity").value = 1;
    updateCalculatedTotal();

    showToast("Expense saved successfully.");
  } catch (error) {
    console.error(error);
    showToast("Could not save expense: " + error.message);
  } finally {
    setBusy(button, false);
  }
});

/* ==========================================
   EXPENSE DISPLAY
========================================== */

function expenseMarkup(expense) {
  const canEdit = expense.createdBy === currentUser?.uid;

  return `
    <div class="expense-row">
      <div class="expense-info">
        <strong>${safeText(expense.name)}</strong>
        <small>
          ${safeText(expense.category || "Other")} ·
          ${safeText(expense.date || "")} ·
          ${safeText(expense.createdByName || "Family member")}
        </small>
        ${expense.notes ? `<small>${safeText(expense.notes)}</small>` : ""}
      </div>
      <div class="expense-amount">
        <strong>${money(expense.total)}</strong>
        <small>${money(expense.price)} × ${safeText(expense.quantity)}</small>
      </div>
      ${canEdit ? `
        <div class="expense-actions">
          <button type="button" class="edit-btn" data-edit="${safeText(expense.id)}">Edit</button>
          <button type="button" class="delete-btn" data-delete="${safeText(expense.id)}">Delete</button>
        </div>
      ` : ""}
    </div>
  `;
}

function renderExpenseList(container, list) {
  if (!container) return;

  if (!list.length) {
    container.innerHTML = `<div class="empty-state">No expenses found.</div>`;
    return;
  }

  container.innerHTML = list.map(expenseMarkup).join("");
}

function renderExpenses() {
  const month = getSelectedMonth();
  const search = ($("searchInput")?.value || "").trim().toLowerCase();

  const filtered = expenses.filter(expense => {
    const matchesMonth = !month || String(expense.date || "").startsWith(month);
    const matchesSearch =
      !search ||
      String(expense.name || "").toLowerCase().includes(search) ||
      String(expense.category || "").toLowerCase().includes(search) ||
      String(expense.createdByName || "").toLowerCase().includes(search);

    return matchesMonth && matchesSearch;
  });

  renderExpenseList($("expenseList"), filtered);
}

$("monthFilter").addEventListener("change", renderExpenses);
$("searchInput").addEventListener("input", renderExpenses);

$("dashboardMonth").addEventListener("change", renderDashboard);

/* ==========================================
   EDIT AND DELETE EXPENSES
========================================== */

document.addEventListener("click", async event => {
  const editButton = event.target.closest("[data-edit]");
  const deleteButton = event.target.closest("[data-delete]");

  if (editButton) {
    const expense = expenses.find(item => item.id === editButton.dataset.edit);
    if (!expense || expense.createdBy !== currentUser.uid) return;

    const newName = prompt("Product name:", expense.name);
    if (newName === null) return;

    const newPriceText = prompt("Price (₹):", expense.price);
    if (newPriceText === null) return;

    const newQuantityText = prompt("Quantity:", expense.quantity);
    if (newQuantityText === null) return;

    const newNameClean = newName.trim();
    const newPrice = Number(newPriceText);
    const newQuantity = Number(newQuantityText);

    if (!newNameClean || newPrice <= 0 || newQuantity < 1 ||
        !Number.isFinite(newPrice) || !Number.isFinite(newQuantity)) {
      showToast("Please enter valid values.");
      return;
    }

    try {
      await db.collection("families").doc(currentFamilyId)
        .collection("expenses").doc(expense.id).update({
          name: newNameClean,
          price: newPrice,
          quantity: newQuantity,
          total: newPrice * newQuantity
        });

      showToast("Expense updated.");
    } catch (error) {
      showToast("Update failed: " + error.message);
    }
  }

  if (deleteButton) {
    const expense = expenses.find(item => item.id === deleteButton.dataset.delete);
    if (!expense || expense.createdBy !== currentUser.uid) return;

    if (!confirm(`Delete "${expense.name}"?`)) return;

    try {
      await db.collection("families").doc(currentFamilyId)
        .collection("expenses").doc(expense.id).delete();

      showToast("Expense deleted.");
    } catch (error) {
      showToast("Delete failed: " + error.message);
    }
  }
});

/* ==========================================
   DASHBOARD
========================================== */

function renderDashboard() {
  if (!currentFamilyId || !currentFamily) return;

  const month = $("dashboardMonth")?.value || getMonthValue();
  const monthly = expenses.filter(expense => isThisMonth(expense, month));
  const total = monthly.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const budget = Number(currentFamily.budget || 0);
  const remaining = budget - total;

  $("familyHeading").textContent = currentFamily.name || "Family dashboard";
  $("familySubheading").textContent =
    `${members.length} family member${members.length === 1 ? "" : "s"} sharing household expenses`;

  $("monthTotal").textContent = money(total);
  $("transactionCount").textContent = monthly.length;
  $("budgetDisplay").textContent = money(budget);
  $("budgetRemaining").textContent =
    `${money(remaining)} ${remaining >= 0 ? "remaining" : "over budget"}`;

  renderExpenseList(
    $("recentExpenses"),
    monthly.slice().sort((a, b) =>
      String(b.date || "").localeCompare(String(a.date || ""))
    ).slice(0, 8)
  );

  renderMemberSpending(monthly);
}

function renderMemberSpending(monthly) {
  const container = $("memberSpending");
  if (!container) return;

  if (!members.length) {
    container.innerHTML = `<div class="empty-state">No family members found.</div>`;
    return;
  }

  const total = monthly.reduce((sum, item) => sum + Number(item.total || 0), 0);

  container.innerHTML = members.map(member => {
    const memberTotal = monthly
      .filter(item => item.createdBy === member.id)
      .reduce((sum, item) => sum + Number(item.total || 0), 0);

    const percentage = total > 0 ? (memberTotal / total) * 100 : 0;

    return `
      <div class="member-spending-row">
        <div>
          <strong>${safeText(member.name || member.email || "Member")}</strong>
          <small>${money(memberTotal)}</small>
        </div>
        <div class="spending-bar">
          <span style="width:${percentage}%"></span>
        </div>
      </div>
    `;
  }).join("");
}

/* ==========================================
   CATEGORIES
========================================== */

function renderCategories() {
  const select = $("categorySelect");
  const chips = $("categoryChips");

  if (select) {
    const selected = select.value;
    select.innerHTML = categories.map(category =>
      `<option value="${safeText(category)}">${safeText(category)}</option>`
    ).join("");

    if (categories.includes(selected)) select.value = selected;
  }

  if (chips) {
    chips.innerHTML = categories.map(category =>
      `<span class="chip">${safeText(category)}</span>`
    ).join("");
  }
}

$("addCategoryBtn").addEventListener("click", async () => {
  const input = $("newCategory");
  const category = input.value.trim();

  if (!category) {
    showToast("Enter a category name.");
    return;
  }

  if (categories.some(item => item.toLowerCase() === category.toLowerCase())) {
    showToast("This category already exists.");
    return;
  }

  try {
    const updated = [...categories, category];

    await db.collection("families").doc(currentFamilyId).update({
      categories: updated
    });

    categories = updated;
    input.value = "";
    renderCategories();
    showToast("Category added.");
  } catch (error) {
    showToast("Could not add category: " + error.message);
  }
});

/* ==========================================
   FAMILY SETTINGS AND MEMBERS
========================================== */

function renderFamilySettings() {
  if (!currentFamily || !currentUser) return;

  const isOwner = currentFamily.ownerUid === currentUser.uid;

  $("familySettingsName").textContent = currentFamily.name || "Family";
  $("familyRole").textContent = isOwner ? "Your role: Owner" : "Your role: Member";
  $("familyBudgetInput").value = currentFamily.budget || 0;

  show($("ownerControls"), isOwner);

  const container = $("familyMembers");
  if (!container) return;

  container.innerHTML = members.map(member => `
    <div class="member-item">
      <div>
        <strong>${safeText(member.name || "Family member")}</strong>
        <small>${safeText(member.email || "")}</small>
      </div>
      <span>${member.role === "owner" ? "Owner" : "Member"}</span>
    </div>
  `).join("");
}

$("saveBudgetBtn").addEventListener("click", async () => {
  if (currentFamily?.ownerUid !== currentUser?.uid) return;

  const budget = Number($("familyBudgetInput").value);

  if (!Number.isFinite(budget) || budget < 0) {
    showToast("Enter a valid budget.");
    return;
  }

  try {
    await db.collection("families").doc(currentFamilyId).update({ budget });
    showToast("Family budget saved.");
  } catch (error) {
    showToast("Could not save budget: " + error.message);
  }
});

/* ==========================================
   INVITATION CODES
========================================== */

function makeInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return code;
}

$("generateInviteBtn").addEventListener("click", async () => {
  if (currentFamily?.ownerUid !== currentUser?.uid) return;

  const button = $("generateInviteBtn");
  setBusy(button, true, "Generating...");

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
      createdBy: currentUser.uid,
      used: false,
      expiresAt: firebase.firestore.Timestamp.fromDate(expiry),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    $("inviteResult").innerHTML = `
      <p>Your invitation code:</p>
      <strong class="invite-code">${safeText(code)}</strong>
      <p>Valid for 48 hours. It can be used once.</p>
      <button type="button" id="copyInviteBtn" class="secondary-btn">Copy code</button>
    `;

    $("copyInviteBtn").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(code);
        showToast("Invitation code copied.");
      } catch {
        showToast("Copy unavailable. Please select and copy the code.");
      }
    });

  } catch (error) {
    showToast("Could not create invitation: " + error.message);
  } finally {
    setBusy(button, false);
  }
});

/* ==========================================
   IMPORT OLD LOCAL STORAGE EXPENSES
========================================== */

$("importExpensesBtn").addEventListener("click", async () => {
  if (!currentFamilyId || !currentUser) return;

  let oldExpenses = [];

  try {
    oldExpenses = JSON.parse(localStorage.getItem("moneta_expenses") || "[]");
  } catch {
    showToast("Could not read old expenses from this device.");
    return;
  }

  if (!Array.isArray(oldExpenses) || oldExpenses.length === 0) {
    showToast("No old expenses found on this device.");
    return;
  }

  if (!confirm(`Import ${oldExpenses.length} old expenses into this family? Your original records will remain on this device.`)) {
    return;
  }

  const button = $("importExpensesBtn");
  setBusy(button, true, "Importing...");

  try {
    const collection = db.collection("families").doc(currentFamilyId)
      .collection("expenses");

    // Firestore batches support up to 500 writes.
    // Use 400 to leave room for safe operation.
    for (let start = 0; start < oldExpenses.length; start += 400) {
      const batch = db.batch();
      const group = oldExpenses.slice(start, start + 400);

      group.forEach((item, index) => {
        const legacyId = String(item.id || `${start}_${index}`);
        const docId = "legacy_" + legacyId.replace(/[^a-zA-Z0-9_-]/g, "_");
        const ref = collection.doc(docId);

        const price = Number(item.price || 0);
        const quantity = Number(item.quantity || 1);

        batch.set(ref, {
          name: String(item.name || "Imported expense"),
          category: String(item.category || "Other"),
          date: String(item.date || localDate),
          price,
          quantity,
          total: Number(item.total ?? price * quantity),
          notes: String(item.notes || ""),
          createdBy: currentUser.uid,
          createdByName: currentMember?.name || currentUser.email,
          importedFrom: "localStorage",
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      });

      await batch.commit();
    }

    const oldBudget = Number(localStorage.getItem("moneta_budget") || 0);
    if (oldBudget > 0 && currentFamily.ownerUid === currentUser.uid) {
      await db.collection("families").doc(currentFamilyId)
        .update({ budget: oldBudget });
    }

    showToast(`${oldExpenses.length} old expenses imported.`);
  } catch (error) {
    console.error(error);
    showToast("Import failed: " + error.message);
  } finally {
    setBusy(button, false);
  }
});

/* ==========================================
   MONTHLY AND YEARLY PDF REPORTS
========================================== */

function openPdfReport(title, list) {
  const total = list.reduce((sum, item) => sum + Number(item.total || 0), 0);

  const rows = list.map(item => `
    <tr>
      <td>${safeText(item.date || "")}</td>
      <td>${safeText(item.name || "")}</td>
      <td>${safeText(item.category || "")}</td>
      <td>${safeText(item.createdByName || "")}</td>
      <td>${money(item.price)}</td>
      <td>${safeText(item.quantity)}</td>
      <td>${money(item.total)}</td>
    </tr>
  `).join("");

  const report = window.open("", "_blank");

  if (!report) {
    showToast("Please allow pop-ups to create the PDF report.");
    return;
  }

  report.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${safeText(title)} - MONETA</title>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; padding: 28px; color: #222; }
        h1 { margin-bottom: 5px; }
        .sub { color: #666; margin-bottom: 24px; }
        .total { font-size: 20px; font-weight: bold; margin: 20px 0; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { padding: 10px 7px; border: 1px solid #ddd; text-align: left; }
        th { background: #f1f3f5; }
        tfoot td { font-weight: bold; }
        @media print { button { display: none; } body { padding: 0; } }
      </style>
    </head>
    <body>
      <h1>MONETA</h1>
      <div class="sub">${safeText(title)} · ${safeText(currentFamily?.name || "")}</div>
      <div>Generated: ${new Date().toLocaleString("en-IN")}</div>
      <div class="total">Total expenses: ${money(total)}</div>
      <table>
        <thead>
          <tr>
            <th>Date</th><th>Product</th><th>Category</th>
            <th>Added by</th><th>Price</th><th>Qty</th><th>Total</th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="7">No expenses found.</td></tr>`}</tbody>
      </table>
      <p>MONETA · Your money, made clear.</p>
      <button onclick="window.print()">Print / Save as PDF</button>
    </body>
    </html>
  `);

  report.document.close();
  report.focus();
}

$("monthlyPdfBtn").addEventListener("click", () => {
  const month = getSelectedMonth();
  const list = expenses.filter(item => String(item.date || "").startsWith(month));
  openPdfReport(`Monthly Expense Report - ${month}`, list);
});

$("yearlyPdfBtn").addEventListener("click", () => {
  const month = getSelectedMonth();
  const year = month.slice(0, 4);
  const list = expenses.filter(item => String(item.date || "").startsWith(year));
  openPdfReport(`Yearly Expense Report - ${year}`, list);
});

/* ==========================================
   DARK / LIGHT MODE
========================================== */

function applyTheme(dark) {
  document.body.classList.toggle("dark-mode", dark);
  localStorage.setItem("moneta_dark", dark ? "true" : "false");
}

applyTheme(localStorage.getItem("moneta_dark") === "true");

$("themeBtn").addEventListener("click", () => {
  applyTheme(!document.body.classList.contains("dark-mode"));
});

/* ==========================================
   INITIAL SETUP
========================================== */

$("expenseDate").value = localDate;
$("dashboardMonth").value = getMonthValue();
$("monthFilter").value = getMonthValue();

renderCategories();
updateCalculatedTotal();

console.log("MONETA Firebase connected successfully.");
