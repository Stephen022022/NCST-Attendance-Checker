// ==========================================
// 1. FIREBASE CONFIGURATION
// ==========================================

const firebaseConfig = {
  apiKey: "AIzaSyBrN2rq67IDiixRAzj8MfP0LlLptd4hHsY",
  authDomain: "attendance-checker-8a02a.firebaseapp.com",
  projectId: "attendance-checker-8a02a",
  storageBucket: "attendance-checker-8a02a.firebasestorage.app",
  messagingSenderId: "509733654764",
  appId: "1:509733654764:web:e6f93dc63a7e6dd38fd5c9",
  measurementId: "G-J81D1HBP6R"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

// ==========================================
// GLOBAL VARIABLES & STATE MANAGEMENT
// ==========================================

let html5QrcodeScanner = null;
let classStartTime = null;
let currentUser = null;
let activeSectionId = null;
let activeTimeSetId = null;
let sections = [];
let timeSets = [];
let allStudents = [];
let absentPromptShown = false;
let absentCheckInterval = null;

// ==========================================
// 2. AUTHENTICATION & INITIALIZATION
// ==========================================

auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-container').style.display = 'none';
        document.getElementById('teacher-dashboard').style.display = 'flex';
        
        initDarkMode();
        loadSections();
        setTimeout(() => {
            loadTimeSets();
            loadStudentList();
            updateSectionFilters();
        }, 500);
        
        setTimeout(() => {
            initializeReportFilters();
        }, 100);
        
    } else {
        currentUser = null;
        document.getElementById('auth-container').style.display = 'flex';
        document.getElementById('teacher-dashboard').style.display = 'none';
        if (absentCheckInterval) clearInterval(absentCheckInterval);
    }
});

// ==========================================
// 3. UI NAVIGATION
// ==========================================

function showForm(formId) {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'none';
    document.getElementById(formId).style.display = 'block';
}

function showSection(sectionId) {
    document.querySelectorAll('.app-section').forEach(section => {
        section.classList.remove('active');
        section.style.display = 'none';
    });
    
    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.add('active');
        section.style.display = 'block';
    }

    if(sectionId === 'scan-section') {
        startScanner();
        updateActiveTimeDisplay();
        absentPromptShown = false;
        checkAbsentThreshold();
        absentCheckInterval = setInterval(checkAbsentThreshold, 30000);
    } else {
        stopScanner();
        if (absentCheckInterval) clearInterval(absentCheckInterval);
    }

    if(sectionId === 'manage-section') {
        loadStudentList();
    } else if (sectionId === 'time-sets-section') {
        loadTimeSets();
    } else if (sectionId === 'report-section') {
        initializeReportFilters();
        loadReports();
    }
}

// ==========================================
// 4. PASSWORD & AUTH FUNCTIONS
// ==========================================

function togglePassword(inputId, imgId) {
    const input = document.getElementById(inputId);
    const img = document.getElementById(imgId);
    if (input.type === 'password') {
        input.type = 'text';
        img.src = 'styles/opened-eye.png';
    } else {
        input.type = 'password';
        img.src = 'styles/closed-eye.jpg';
    }
}

function validatePassword(password) {
    if (password.length < 6) return "Password must be at least 6 characters long.";
    return null;
}

const registerForm = document.getElementById('registerFormObj');
if(registerForm) {
    registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const password = registerForm['password'].value;
        const validationError = validatePassword(password);
        if (validationError) return alert(validationError);
        auth.createUserWithEmailAndPassword(registerForm['email'].value, password)
            .then(() => { alert("Account created!"); registerForm.reset(); })
            .catch(err => alert("Error: " + err.message));
    });
}

const loginForm = document.getElementById('loginFormObj');
if(loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        auth.signInWithEmailAndPassword(loginForm['email'].value, loginForm['password'].value)
            .then(() => { console.log("Login success"); loginForm.reset(); })
            .catch(err => alert("Error: " + err.message));
    });
}

function logout() {
    if(confirm("Logout?")) auth.signOut();
}

function forgotPassword() {
    const email = document.querySelector('#loginFormObj input[name="email"]').value;
    if (!email) return alert("Please enter your email address first.");
    auth.sendPasswordResetEmail(email)
        .then(() => alert("Password reset email sent! Check your inbox."))
        .catch(err => alert("Error: " + err.message));
}

// ==========================================
// 5. SECTION MANAGEMENT
// ==========================================

function addSection() {
    const nameEl = document.getElementById('new-section-name'), descEl = document.getElementById('new-section-desc');
    const name = nameEl.value.trim(), desc = descEl.value.trim();
    
    if (!name) return alert("Please enter a section name");
    if (!currentUser) return alert("Please login first");

    db.collection("sections").add({ teacher_uid: currentUser.uid, name, description: desc, created_at: firebase.firestore.FieldValue.serverTimestamp() })
        .then(() => {
            alert("Section created!");
            nameEl.value = descEl.value = '';
            [loadSections, updateSectionFilters, loadStudentList].forEach(fn => fn());
        }).catch(err => alert("Error: " + err.message));
}

function loadSections() {
    if (!currentUser) return;
    const ref = db.collection("sections").where("teacher_uid", "==", currentUser.uid);
    const container = document.getElementById('sections-list');

    const handleSnap = (snap, sortClientSide = false) => {
        if (!container) return processSectionsData(snap);
        
        let docs = sortClientSide ? snap.docs.sort((a, b) => (a.data().name || '').localeCompare(b.data().name || '')) : snap.docs;
        sections = docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        container.innerHTML = sections.length ? sections.map(s => `
            <div class="card">
                <div class="flex-space">
                    <div>
                        <strong style="font-size: 16px;">${s.name}</strong>
                        ${s.description ? `<p class="text-muted" style="margin: 5px 0 0 0;">${s.description}</p>` : ''}
                    </div>
                    <button onclick="deleteSection('${s.id}')" class="btn-danger" style="padding: 8px 12px;">Delete</button>
                </div>
            </div>`).join('') : '<p class="text-muted">No sections yet. Create one to get started.</p>';
        updateSectionFilters();
    };

    ref.orderBy("created_at", "desc").get().then(handleSnap).catch(err => {
        console.warn("OrderBy failed, loading sections without ordering:", err);
        ref.get().then(snap => handleSnap(snap, true)).catch(e => console.error("Error loading sections:", e));
    });
}

const processSectionsData = (snap) => {
    sections = snap.empty ? [] : snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    updateSectionFilters();
};

function deleteSection(id) {
    if (!confirm("Delete this section? Students in this section will not be deleted.")) return;
    db.collection("sections").doc(id).delete()
        .then(() => { loadSections(); updateSectionFilters(); })
        .catch(err => alert("Error: " + err.message));
}

function updateSectionFilters() {
    const optionsHtml = [...sections].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .map(s => `<option value="${s.id}">${s.name}</option>`).join('');

    ['new-section', 'student-section-filter', 'report-section-filter', 'new-time-set-section'].forEach(id => {
        const filter = document.getElementById(id);
        if (!filter) return;
        const currentVal = filter.value;
        filter.innerHTML = (id === 'new-section' ? '<option value="">-- Select Section --</option>' : '<option value="">All Sections</option>') + optionsHtml;
        filter.value = currentVal;
    });
}

// ==========================================
// 6. TIME SETS MANAGEMENT
// ==========================================

function addTimeSet() {
    const [nEl, sEl, lEl, aEl, secEl] = ['name', 'start', 'late', 'absent', 'section'].map(id => document.getElementById(`new-time-set-${id}`));
    const [name, start, late, absent, sectionId] = [nEl.value.trim(), sEl.value, parseInt(lEl.value) || 15, parseInt(aEl.value) || 45, secEl ? secEl.value : null];
    const section = sectionId ? sections.find(s => s.id === sectionId) : null;
    const sectionName = section ? section.name : null;

    if (!name || !start) return alert("Please fill all fields");
    if (absent <= late) return alert("Absent threshold must be greater than late threshold");
    if (!currentUser) return alert("Please login first");

    db.collection("time_sets").add({ 
        teacher_uid: currentUser.uid, 
        name, start_time: start, late_threshold: late, absent_threshold: absent, 
        section_id: sectionId, section_name: sectionName,
        is_active: timeSets.length === 0, 
        created_at: firebase.firestore.FieldValue.serverTimestamp() 
    })
        .then(() => {
            alert("Time Set created!");
            nEl.value = sEl.value = ''; lEl.value = '15'; aEl.value = '45'; if (secEl) secEl.value = '';
            loadTimeSets(); updateActiveTimeDisplay();
        }).catch(err => alert("Error: " + err.message));
}

function loadTimeSets() {
    if (!currentUser) return;
    const ref = db.collection("time_sets").where("teacher_uid", "==", currentUser.uid);
    
    ref.orderBy("created_at", "desc").get().then(renderTimeSets).catch(err => {
        console.warn("OrderBy failed, loading without ordering:", err);
        ref.get().then(snap => renderTimeSets(snap, true)).catch(e => console.error("Error loading time sets:", e));
    });
}

function renderTimeSets(snap, sortClientSide = false) {
    const container = document.getElementById('time-sets-list');
    let docs = snap.empty ? [] : (sortClientSide ? snap.docs.sort((a, b) => (b.data().created_at || 0) - (a.data().created_at || 0)) : snap.docs);
    timeSets = docs.map(d => ({ id: d.id, ...d.data() }));

    container.innerHTML = timeSets.length ? timeSets.map(t => `
        <div class="time-set-card ${t.is_active ? 'active' : ''}">
            <div class="time-set-header">
                <div><h4 style="margin: 0;">${t.name}</h4><small class="text-muted">Start: ${t.start_time}</small>${t.section_name ? `<br><small style="color: #0ea5e9; font-weight: 500;">👥 Section: ${t.section_name}</small>` : ''}</div>
                <div>${t.is_active ? '<span class="live-badge">● ACTIVE</span>' : ''}</div>
            </div>
            <div class="grid-2col">
                <div><small class="text-muted">Late Threshold</small><div class="text-bold">${t.late_threshold} min</div></div>
                <div><small class="text-muted">Absent Threshold</small><div class="text-bold">${t.absent_threshold} min</div></div>
            </div>
            <div class="flex-gap">
                <button onclick="toggleTimeSetActive('${t.id}', ${!t.is_active})" class="flex-1">${t.is_active ? '⏸ Deactivate' : '▶ Activate'}</button>
                <button onclick="deleteTimeSet('${t.id}')" class="btn-danger" style="padding: 8px 12px;">Delete</button>
            </div>
        </div>`).join('') : '<p class="text-muted">No time sets yet. Create one to get started.</p>';
    
    updateActiveTimeDisplay();
    if (typeof updateTimeSetFilter === 'function') updateTimeSetFilter();
}

function toggleTimeSetActive(id, setActive) {
    const tsRef = db.collection("time_sets");
    const updateUI = () => { loadTimeSets(); updateActiveTimeDisplay(); };

    if (!setActive) {
        const active = timeSets.find(t => t.is_active);
        if (active && confirm(`Mark unscanned students as absent before deactivating "${active.name}"?`)) {
            markUnscannedAsAbsent(active).then(() => {
                tsRef.doc(id).update({ is_active: false }).then(updateUI);
            });
            return;
        }
        tsRef.doc(id).update({ is_active: false }).then(updateUI);
        return;
    }

    tsRef.where("teacher_uid", "==", currentUser.uid).get().then(snap => {
        Promise.all([...snap.docs.map(doc => tsRef.doc(doc.id).update({ is_active: false })), tsRef.doc(id).update({ is_active: true })])
            .then(updateUI);
    });
}

function deleteTimeSet(id) {
    if (!confirm("Delete this time set?")) return;
    db.collection("time_sets").doc(id).delete().then(() => { loadTimeSets(); updateActiveTimeDisplay(); }).catch(err => alert("Error: " + err.message));
}

function updateActiveTimeDisplay() {
    const active = timeSets.find(ts => ts.is_active);
    document.getElementById('active-time-display').style.display = 'block';
    document.getElementById('active-timeset-content').style.display = active ? 'block' : 'none';
    document.getElementById('no-timeset-content').style.display = active ? 'none' : 'block';

    if (active) {
        document.getElementById('time-set-name').innerText = active.name;
        let info = `Start: ${active.start_time} | Late: ${active.late_threshold}m | Absent: ${active.absent_threshold}m`;
        if (active.section_name) info += ` | 👥 Section: ${active.section_name}`;
        document.getElementById('time-set-info').innerHTML = info;
    }
}

// ==========================================
// 7. STUDENT MANAGEMENT
// ==========================================

const getEl = id => document.getElementById(id);
const updateAllSect = () => { loadSections(); updateSectionFilters(); renderSectionsManagement(); };

function toggleNewSectionInput() {
    const g = getEl('new-section-input-group');
    g.style.display = g.style.display === 'none' ? 'block' : 'none';
    if (g.style.display === 'block') getEl('new-section-name-input').focus();
}

function createAndAssignSection() {
    const name = getEl('new-section-name-input').value.trim();
    if (!name) return alert("Please enter a section name");
    if (!currentUser) return alert("Please login first");

    db.collection("sections").add({ teacher_uid: currentUser.uid, name, description: '', created_at: firebase.firestore.FieldValue.serverTimestamp() })
        .then(ref => { getEl('new-section').value = ref.id; getEl('new-section-name-input').value = ''; toggleNewSectionInput(); updateAllSect(); alert("Section created and assigned!"); })
        .catch(err => alert("Error: " + err.message));
}

function addStudent() {
    const [n, i, s] = ['new-name', 'new-id', 'new-section'].map(id => getEl(id));
    if (!n.value || !i.value || !s.value) return alert("Please fill all fields");

    db.collection("students").where("student_id", "==", i.value.trim()).get().then(snap => {
        if (!snap.empty) return alert("Student ID already exists!");
        db.collection("students").add({ teacher_uid: currentUser.uid, name: n.value.trim(), student_id: i.value.trim(), section_id: s.value, created_at: firebase.firestore.FieldValue.serverTimestamp() })
            .then(() => {
                alert("Student Added!");
                const sect = sections.find(x => x.id === s.value);
                generateQRCode(i.value, n.value, sect ? sect.name : s.value);
                n.value = i.value = s.value = ''; loadStudentList();
            });
    });
}

function generateQRCode(id, name, sect) {
    new QRious({ element: getEl('qr-code'), value: id, size: 250, level: 'H' });
    getEl('qr-display').style.display = 'block';
    getEl('qr-label').innerText = `${name} (${sect})`;
}



function searchStudentList() {
    const searchBox = document.getElementById('student-search');
    const sectionFilter = document.getElementById('student-section-filter');
    if (!searchBox || !sectionFilter) return;

    const searchTerm = searchBox.value.toLowerCase();
    const sectionId = sectionFilter.value;
    
    let filteredStudents = allStudents;
    
    if (sectionId) {
        filteredStudents = filteredStudents.filter(s => s.section_id === sectionId);
    }
    
    if (searchTerm) {
        filteredStudents = filteredStudents.filter(s => 
            (s.name && s.name.toLowerCase().includes(searchTerm)) ||
            (s.student_id && s.student_id.toLowerCase().includes(searchTerm))
        );
    }
    
    renderFilteredStudents(filteredStudents, getEl('student-list'));
}

function loadStudentList() {
    if (!currentUser) return;
    const list = getEl('student-list');
    if (list) list.innerHTML = '<div class="text-muted" style="padding:10px;">Refreshing student records...</div>';
    
    renderSectionsManagement();

    const ref = db.collection("students").where("teacher_uid", "==", currentUser.uid);
    
    ref.orderBy("name").get().then(snap => {
        let students = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const active = timeSets.find(ts => ts.is_active);
        if (active && active.section_id) {
            students = students.filter(s => s.section_id === active.section_id);
        }
        allStudents = students;
        searchStudentList();
    }).catch(err => {
        console.warn("Falling back to unordered fetch:", err);
        ref.get().then(snap => {
            let students = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const active = timeSets.find(ts => ts.is_active);
            if (active && active.section_id) {
                students = students.filter(s => s.section_id === active.section_id);
            }
            allStudents = students;
            searchStudentList();
        });
    });
}

function renderFilteredStudents(data, list) {
    if (!list) return;
    list.innerHTML = data.length ? data.map(s => {
        const sName = sections.find(x => x.id === s.section_id)?.name || "N/A";
        return `
        <li class="student-list-item">
            <div class="student-info">
                <strong>${s.name}</strong>
                <small>ID: ${s.student_id}</small>
                <small>Section: ${sName}</small>
            </div>
            <div class="student-actions">
                <button onclick="generateQRCode('${s.student_id}', '${s.name}', '${sName}')" class="btn-qr" title="Show QR">📱</button>
                <button onclick="viewHistory('${s.student_id}', '${s.name}')" class="btn-history" title="View History">📅</button>
                <button onclick="deleteStudent('${s.id}')" class="btn-danger" title="Delete Student">🗑️</button>
            </div>
        </li>`;
    }).join('') : `<p class="text-muted" style="padding:20px; text-align:center;">No students matching your search criteria.</p>`;
}

function toggleSectionPanel() {
    const p = getEl('section-panel'), t = getEl('section-panel-toggle');
    p.style.display = p.style.display === 'none' ? 'block' : 'none';
    t.innerText = p.style.display === 'none' ? '▶' : '▼';
}

function renderSectionsManagement() {
    const c = getEl('sections-management-list');
    if (!c || !currentUser) return;
    c.innerHTML = sections.length ? sections.map(s => `
        <div class="section-card">
            <div><strong>${s.name}</strong>${s.description ? `<small class="text-muted-light">${s.description}</small>` : ''}</div>
            <button onclick="confirmDeleteSection('${s.id}', '${s.name}')" class="btn-danger text-small" style="padding:6px 12px;">Delete</button>
        </div>`).join('') : '<p class="text-muted" style="padding:10px; text-align:center;">No sections yet.</p>';
}

function showAddSectionModal() { getEl('add-section-modal').style.display = 'block'; getEl('modal-section-name').focus(); }

function addSectionFromModal() {
    const [n, d] = [getEl('modal-section-name'), getEl('modal-section-desc')];
    if (!n.value) return alert("Please enter name");
    db.collection("sections").add({ teacher_uid: currentUser.uid, name: n.value.trim(), description: d.value.trim(), created_at: firebase.firestore.FieldValue.serverTimestamp() })
        .then(() => { n.value = d.value = ''; getEl('add-section-modal').style.display = 'none'; updateAllSect(); alert("Section created!"); });
}

function confirmDeleteSection(id, name) {
    if (confirm(`Delete section "${name}"?`)) db.collection("sections").doc(id).delete().then(() => { updateAllSect(); alert("Deleted!"); });
}

const deleteStudent = id => confirm("Delete this student?") && db.collection("students").doc(id).delete().then(loadStudentList);

function viewHistory(id, name) {
    const [m, t, b] = ['student-history-modal', 'history-title', 'history-table-body'].map(i => getEl(i));
    m.style.display = 'block'; t.innerText = `History: ${name}`; b.innerHTML = '<tr><td colspan="2">Loading...</td></tr>';
    db.collection("attendance").where("student_id", "==", id).get().then(snap => {
        const records = snap.docs.map(d => d.data()).sort((a,b) => b.timestamp - a.timestamp);
        b.innerHTML = records.length ? records.map(r => {
            const color = r.status.includes("Late") ? "#ff9800" : r.status.includes("Absent") ? "#f44336" : r.status.includes("Present") ? "#4caf50" : "black";
            return `<tr><td class="cell-pad">${r.date_string || "N/A"}</td><td class="cell-pad" style="color:${color};font-weight:bold">${r.status}</td></tr>`;
        }).join('') : '<tr><td colspan="2">No records found.</td></tr>';
    });
}

// ==========================================
// 8. SCANNING & ATTENDANCE LOGIC
// ==========================================

const resEl = () => document.getElementById('scan-result');
const resumeScan = (t = 2500) => setTimeout(() => { html5QrcodeScanner?.resume(); resEl().style.display = 'none'; }, t);

function setStartTime() {
    const val = document.getElementById('class-start-time').value;
    if (val) classStartTime = new Date(new Date().setHours(...val.split(':')));
}

const startScanner = () => !html5QrcodeScanner && (html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 })).render(onScanSuccess);
const stopScanner = () => html5QrcodeScanner?.clear().then(() => html5QrcodeScanner = null);

function onScanSuccess(text) {
    try { html5QrcodeScanner.getState() === Html5QrcodeScannerState.SCANNING && html5QrcodeScanner.pause(); } catch (e) {}
    processAttendance(text);
    checkAbsentThreshold();
}

function processAttendance(id) {
    const res = resEl();
    Object.assign(res, { innerText: `Processing ID: ${id}...`, className: 'status-msg' }).style.display = 'block';

    db.collection("students").where("student_id", "==", id).where("teacher_uid", "==", currentUser.uid).get().then(snap => {
        if (snap.empty) return (res.innerText = "❌ Student ID not found.", res.classList.add("status-absent"), resumeScan(2000));
        
        const std = snap.docs[0].data(), active = timeSets.find(ts => ts.is_active);
        if (!active) return (res.innerText = "❌ No Active Time Set.", res.classList.add("status-absent"), resumeScan());

        if (active.section_id && std.section_id !== active.section_id) {
            return (res.innerText = "❌ Wrong section for this time set.", res.classList.add("status-absent"), resumeScan(2000));
        }

        const diff = (new Date() - new Date().setHours(...active.start_time.split(':'))) / 60000;
        const status = diff >= (parseInt(active.absent_threshold) || 45) ? "Absent" : diff >= (parseInt(active.late_threshold) || 15) ? "Late" : "Present";
        
        db.collection("attendance").add({
            student_id: id, student_name: std.name, status, section_id: std.section_id, teacher_uid: currentUser.uid,
            section_name: sections.find(s => s.id === std.section_id)?.name || std.section_id,
            time_set_id: active.id, time_set_name: active.name, timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            date_string: new Date().toLocaleDateString()
        }).then(() => {
            res.innerText = `✅ ${std.name}: ${status.toUpperCase()}`;
            res.classList.add(`status-${status.toLowerCase()}`); resumeScan();
        });
    }).catch(err => (alert("Error: " + err.message), resumeScan(0)));
}

function checkAbsentThreshold() {
    const active = timeSets.find(ts => ts.is_active);
    if (!active || absentPromptShown) return;

    const diff = (new Date() - new Date().setHours(...active.start_time.split(':'))) / 60000;
    if (diff >= (parseInt(active.absent_threshold) || 45)) {
        absentPromptShown = true;
        if (confirm(`The absent threshold (${active.absent_threshold} minutes) has been reached. Mark all unscanned students as absent?`)) {
            markUnscannedAsAbsent(active);
        }
    }
}

function markUnscannedAsAbsent(activeTimeSet) {
    const today = new Date().toLocaleDateString();
let studentQuery = db.collection("students").where("teacher_uid", "==", currentUser.uid);
if (activeTimeSet.section_id) {
    studentQuery = studentQuery.where("section_id", "==", activeTimeSet.section_id);
}
studentQuery.get().then(studentSnap => {
        const allStudents = studentSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        db.collection("attendance").where("teacher_uid", "==", currentUser.uid).where("date_string", "==", today).where("time_set_id", "==", activeTimeSet.id).get().then(attendanceSnap => {
            const scannedStudents = new Set(attendanceSnap.docs.map(doc => doc.data().student_id));
            const unscannedStudents = allStudents.filter(student => !scannedStudents.has(student.student_id));
            
            if (unscannedStudents.length === 0) return alert("All students have been scanned.");
            
            const batch = db.batch();
            unscannedStudents.forEach(student => {
                const attendanceRef = db.collection("attendance").doc();
                batch.set(attendanceRef, {
                    student_id: student.student_id, student_name: student.name, status: "Absent",
                    section_id: student.section_id, teacher_uid: currentUser.uid,
                    section_name: sections.find(s => s.id === student.section_id)?.name || student.section_id,
                    time_set_id: activeTimeSet.id, time_set_name: activeTimeSet.name,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(), date_string: today
                });
            });
            
            batch.commit().then(() => alert(`Marked ${unscannedStudents.length} student(s) as absent.`))
                 .catch(err => alert("Error: " + err.message));
        });
    });
}

// ==========================================
// 9. ATTENDANCE REPORTS & STUDENT SEARCH
// ==========================================

function searchStudentAttendance() {
    const query = document.getElementById('student-name-search')?.value.trim().toLowerCase();
    const container = document.getElementById('individual-search-results');
    if (!query) return alert("Please enter a name or ID to search.");
    if (!container) return console.warn("Search results container not found in HTML.");

    container.innerHTML = '<p class="text-muted">Searching for matching students...</p>';

    // Find student first
    db.collection("students")
        .where("teacher_uid", "==", currentUser.uid)
        .get()
        .then(snap => {
            const matches = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(s => s.name.toLowerCase().includes(query) || s.student_id.toLowerCase().includes(query));

            if (!matches.length) {
                container.innerHTML = '<p class="text-danger">No matching student found.</p>';
                return;
            }
            renderIndividualSearchResults(matches, container);
        });
}

function renderIndividualSearchResults(students, container) {
    container.innerHTML = students.map(s => `
        <div class="card" style="margin-bottom: 15px; border-left: 5px solid #2196F3;">
            <div class="flex-space">
                <div>
                    <h3 style="margin:0;">${s.name}</h3>
                    <p class="text-muted" style="margin:5px 0;">ID: ${s.student_id} | Section: ${sections.find(sec => sec.id === s.section_id)?.name || 'N/A'}</p>
                </div>
                <button onclick="fetchFullAttendanceHistory('${s.student_id}', '${s.name}')" class="btn-primary">View Records</button>
            </div>
            <div id="history-container-${s.student_id}" style="margin-top:10px; display:none;">
                <div class="loading-spinner"></div>
            </div>
        </div>
    `).join('');
}

function fetchFullAttendanceHistory(studentId, studentName) {
    const historyDiv = document.getElementById(`history-container-${studentId}`);
    if (historyDiv.style.display === 'block') {
        historyDiv.style.display = 'none';
        return;
    }

    historyDiv.style.display = 'block';
    historyDiv.innerHTML = '<p class="text-muted">Fetching all-time records...</p>';

    db.collection("attendance")
        .where("teacher_uid", "==", currentUser.uid)
        .where("student_id", "==", studentId)
        .get()
        .then(snap => {
            const records = snap.docs.map(d => d.data()).sort((a, b) => {
                // Parse date strings for sorting if needed, or use Firestore timestamps
                const dateA = new Date(a.date_string).getTime();
                const dateB = new Date(b.date_string).getTime();
                return dateB - dateA;
            });

            if (!records.length) {
                historyDiv.innerHTML = '<p class="text-muted">No attendance records found for this student.</p>';
                return;
            }

            const stats = { Present: 0, Late: 0, Absent: 0 };
            records.forEach(r => stats[r.status] = (stats[r.status] || 0) + 1);

            let html = `
                <div class="grid-3col" style="background:rgba(0,0,0,0.05); padding:10px; border-radius:8px; margin-bottom:10px;">
                    <div class="text-center"><small>Present</small><div class="text-bold" style="color:#4caf50;">${stats.Present}</div></div>
                    <div class="text-center"><small>Late</small><div class="text-bold" style="color:#ff9800;">${stats.Late}</div></div>
                    <div class="text-center"><small>Absent</small><div class="text-bold" style="color:#f44336;">${stats.Absent}</div></div>
                </div>
                <table style="width:100%; border-collapse: collapse; font-size:14px;">
                    <thead>
                        <tr style="border-bottom: 1px solid #ddd;">
                            <th align="left" style="padding:5px;">Date</th>
                            <th align="left" style="padding:5px;">Time Set</th>
                            <th align="right" style="padding:5px;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${records.map(r => `
                            <tr style="border-bottom: 1px solid #eee;">
                                <td style="padding:5px;">${r.date_string}</td>
                                <td style="padding:5px;">${r.time_set_name || 'N/A'}</td>
                                <td style="padding:5px; font-weight:bold; color: ${r.status === 'Present' ? '#4caf50' : r.status === 'Late' ? '#ff9800' : '#f44336'}" align="right">
                                    ${r.status}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            historyDiv.innerHTML = html;
        });
}

function initializeReportFilters() {
    const [m, y] = ['report-month-filter', 'report-year-filter'].map(getEl);
    const now = new Date(), curY = now.getFullYear();
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    if(m) m.innerHTML = months.map((name, i) => `<option value="${i + 1}">${name}</option>`).join('');
    if(m) m.value = now.getMonth() + 1;
    
    if(y) {
        let yHtml = '';
        for (let i = curY - 5; i <= curY + 1; i++) yHtml += `<option value="${i}">${i}</option>`;
        y.innerHTML = yHtml;
        y.value = curY;
    }
    updateTimeSetFilter();
}

const updateTimeSetFilter = () => {
    const filter = getEl('report-timeset-filter');
    if (filter) filter.innerHTML = '<option value="">All Time Sets</option>' + timeSets.map(ts => `<option value="${ts.id}">${ts.name}</option>`).join('');
};

function loadReports() {
    const [s, t, m, y] = ['report-section-filter', 'report-timeset-filter', 'report-month-filter', 'report-year-filter'].map(id => getEl(id)?.value);
    loadCalendarView(parseInt(y || new Date().getFullYear()), parseInt(m || new Date().getMonth() + 1), s || '', t || '');
}

function loadCalendarView(year, month, sFilt, tFilt) {
    if (!currentUser) return;
    const grid = getEl('calendar-grid');

    db.collection("students").where("teacher_uid", "==", currentUser.uid).get().then(sSnap => {
        const stds = sSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => !sFilt || s.section_id === sFilt).sort((a, b) => a.name.localeCompare(b.name));
        if (!stds.length) return grid.innerHTML = '<p class="text-muted" style="padding:20px; text-align:center;">No students found.</p>';

        db.collection("attendance").where("teacher_uid", "==", currentUser.uid).get().then(aSnap => {
            const attMap = {};
            aSnap.forEach(doc => {
                const r = doc.data(), [rm, , ry] = r.date_string.split('/').map(Number);
                if (ry === year && rm === month && (!tFilt || r.time_set_id === tFilt)) {
                    (attMap[r.date_string] = attMap[r.date_string] || {})[r.student_id] = r.status;
                }
            });

            const first = new Date(year, month - 1, 1), last = new Date(year, month, 0), weeks = [];
            let curr = new Date(first); curr.setDate(curr.getDate() - first.getDay());
            while (curr <= last) { weeks.push(new Date(curr)); curr.setDate(curr.getDate() + 7); }

            const colors = ['#9999cc', '#33aa66', '#ffcc66', '#cc6666', '#6699cc'], days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const dayCols = weeks.length * 7, dWidth = 82 / dayCols;

            grid.innerHTML = `<table style="width:100%; border-collapse:collapse; font-size:16px; font-weight:500;">
                <colgroup><col style="width:18%">${`<col style="width:${dWidth}%">`.repeat(dayCols)}</colgroup>
                <thead>
                    <tr><th class="table-header"></th>
                        ${weeks.map((w, i) => `<th colspan="7" class="table-header-week" style="background:${colors[i] || '#999'}">Week ${i + 1}</th>`).join('')}</tr>
                    <tr><th class="table-header" style="border:2px solid #0a0a0a">Student Name</th>
                        ${weeks.map(w => days.map((n, i) => {
                            const d = new Date(w); d.setDate(d.getDate() + i);
                            return `<th class="table-header"><div style="font-size:20px;font-weight:bold;color:black">${n}</div><div style="font-size:18px;color:black">${d.getDate()}</div></th>`;
                        }).join('')).join('')}</tr>
                </thead>
                <tbody>
                    ${stds.map(s => `<tr>
                        <td class="calendar-name"><div>${s.name}</div><small class="calendar-id">ID: ${s.student_id}</small></td>
                        ${weeks.map(w => days.map((_, i) => {
                            const d = new Date(w); d.setDate(d.getDate() + i);
                            const ds = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`, stat = attMap[ds]?.[s.student_id];
                            const cfg = { Present: ['P', '#4caf50'], Late: ['L', '#ffb74d'], Absent: ['A', '#f44336'] }[stat] || ['-', '#f5f5f5', '#999'];
                            return `<td class="table-cell" style="background:${cfg[1]}; color:${cfg[2] || 'white'}">${cfg[0]}</td>`;
                        }).join('')).join('')}
                    </tr>`).join('')}
                </tbody>
            </table>`;
        });
    });
}

// ==========================================
// 10. EXPORT FUNCTIONALITY
// ==========================================

function downloadCSV() {
    const [sFilt, tFilt, mFilt, yFilt] = ['report-section-filter', 'report-timeset-filter', 'report-month-filter', 'report-year-filter'].map(id => getEl(id)?.value);
    const month = parseInt(mFilt || new Date().getMonth() + 1), year = parseInt(yFilt || new Date().getFullYear());

    if (!currentUser) return alert("Please login first");

    db.collection("attendance").where("teacher_uid", "==", currentUser.uid).get().then(snap => {
        const records = snap.docs.map(d => d.data()).filter(r => {
            const [m, , y] = r.date_string.split('/').map(Number);
            return y === year && m === month && (!sFilt || r.section_id === sFilt) && (!tFilt || r.time_set_id === tFilt);
        }).sort((a, b) => {
            const da = new Date(a.date_string).getTime(), db = new Date(b.date_string).getTime();
            return db !== da ? db - da : (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0);
        });

        if (!records.length) return alert("No records to download!");

        const header = "Date,Time,Student Name,Student ID,Section,Status\n";
        const rows = records.map(r => {
            const time = r.timestamp ? r.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "---";
            return `"${r.date_string}","${time}","${r.student_name}","${r.student_id}","${r.section_name || r.section_id}","${r.status}"`;
        }).join("\n");

        const link = Object.assign(document.createElement("a"), {
            href: encodeURI("data:text/csv;charset=utf-8," + header + rows),
            download: `Attendance_${month}-${year}.csv`
        });
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    }).catch(err => alert("Error: " + err.message));
}

// ==========================================
// 11. DARK MODE
// ==========================================

function initDarkMode() {
    if (localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark-mode');
        updateDarkModeUI(true);
    }
}

function toggleDarkMode() {
    const button = document.querySelector('.dark-mode-toggle');
    if (button) button.classList.add('transitioning');

    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', isDark);

    setTimeout(() => {
        updateDarkModeUI(isDark);
        if (button) button.classList.remove('transitioning');
    }, 400);
}

function updateDarkModeUI(isDark) {
    const icon = document.querySelector('.mode-icon');
    const text = document.querySelector('.mode-text');
    if (icon) icon.textContent = isDark ? '☀️' : 'Light';
    if (text) text.textContent = isDark ? 'Light' : 'Dark';
}