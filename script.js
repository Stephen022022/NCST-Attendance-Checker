// ==========================================
// 1. FIREBASE CONFIGURATION - Amiel
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

// Global Variables
let html5QrcodeScanner = null;
let classStartTime = null;

// Section mapping //
function getSectionName(sectionValue) {
    const sections = {
        "1": "BSCoE - 12M1",
        "2": "BSCoE - 12A1"
    };
    return sections[sectionValue] || sectionValue;
}

// This is the work of Stephen Villondo - Modified to display section name in QR label

// ==========================================
// 2. UI NAVIGATION LOGIC - Andrei
// ==========================================

function showForm(formId) {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'none';
    document.getElementById(formId).style.display = 'block';
}

function showSection(sectionId) {
    // Hide all sections
    document.getElementById('scan-section').style.display = 'none';
    document.getElementById('manage-section').style.display = 'none';
    document.getElementById('report-section').style.display = 'none';

    // Show selected
    document.getElementById(sectionId).style.display = 'block';

    // 1. Manage Scanner
    if(sectionId === 'scan-section') {
        startScanner();
    } else {
        stopScanner();
    }

    // 2. Manage Roster List
    if(sectionId === 'manage-section') {
        loadStudentList();
    }
}

// ==========================================
// 2.5 PASSWORD TOGGLE LOGIC - Andrei
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

// ==========================================
// 3. AUTHENTICATION LOGIC - Amiel and Stephen
// ==========================================

auth.onAuthStateChanged(user => {
    if (user) {
        document.querySelector('.container').style.display = 'none';
        document.getElementById('teacher-dashboard').style.display = 'block';

        // Auto-set start time
        const now = new Date();
        const timeString = now.toTimeString().split(' ')[0].substring(0,5);
        const timeInput = document.getElementById('class-start-time');
        if(timeInput) {
            timeInput.value = timeString;
            setStartTime();
        }
    } else {
        document.querySelector('.container').style.display = 'block';
        document.getElementById('teacher-dashboard').style.display = 'none';
    }
});

// Password validation function
function validatePassword(password) {
    // Check minimum length (6 characters)
    if (password.length < 6) {
        return "Password must be at least 6 characters long.";
    }
    return null; // Valid
}

const registerForm = document.getElementById('registerFormObj');
if(registerForm) {
    registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const password = registerForm['password'].value;
        const validationError = validatePassword(password);
        if (validationError) {
            alert(validationError);
            return;
        }
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

// =====================================================
// This is the work of Stephen Villondo - Password Reset
// =====================================================
function forgotPassword() {
    const email = document.querySelector('#loginFormObj input[name="email"]').value;
    if (!email) {
        alert("Please enter your email address first.");
        return;
    }
    auth.sendPasswordResetEmail(email)
        .then(() => {
            alert("Password reset email sent! Check your inbox.");
        })
        .catch(err => {
            alert("Error: " + err.message);
        });
}

// ==========================================
// 4. MANAGE STUDENTS (Add, List, Delete, History) - Reyjan
// ==========================================

function addStudent() {
    const name = document.getElementById('new-name').value;
    const id = document.getElementById('new-id').value;
    const section = document.getElementById('new-section').value;
    const currentUser = auth.currentUser;

    if (!name || !id || !section) return alert("Fill all fields");

    // Check for duplicates
    db.collection("students").where("student_id", "==", id).get()
    .then((querySnapshot) => {
        if(!querySnapshot.empty) return alert("Student ID already exists!");

        db.collection("students").add({
            teacher_uid: currentUser.uid,
            name: name,
            student_id: id,
            section: section,
            created_at: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            alert("Student Added!");
            generateQRCode(id, name, section);
            // Clear inputs
            document.getElementById('new-name').value = '';
            document.getElementById('new-id').value = '';
            document.getElementById('new-section').value = '';
            // Refresh list
            loadStudentList();
        });
    });
}

function generateQRCode(id, name, section) {
    const qr = new QRious({
        element: document.getElementById('qr-code'),
        value: id,
        size: 200,
        level: 'H'
    });
    document.getElementById('qr-display').style.display = 'block';
    document.getElementById('qr-label').innerText = `${name} (${getSectionName(section)})`;
}

function loadStudentList() {
    const listContainer = document.getElementById('student-list');
    listContainer.innerHTML = '<p>Loading students...</p>';

    db.collection("students").orderBy("name").get()
    .then((querySnapshot) => {
        listContainer.innerHTML = '';
        if (querySnapshot.empty) return listContainer.innerHTML = '<p>No students found.</p>';

        querySnapshot.forEach((doc) => {
            const student = doc.data();
            const li = document.createElement('li');
            li.style.cssText = "border-bottom: 1px solid #ccc; padding: 10px; display: flex; justify-content: space-between; align-items: center;";

            // ============================================================================
            //  Added QR code button for each student
            // ============================================================================
            li.innerHTML = `
                <div>
                    <strong>${student.name}</strong><br>
                    <small style="color:#555;">ID: ${student.student_id}</small><br>
                    <small style="color:#777;">Section: ${getSectionName(student.section)}</small>
                </div>
                <div>
                    <button onclick="generateQRCode('${student.student_id}', '${student.name}', '${student.section}')" style="background:#28a745; margin-right:5px;">📱</button>
                    <button onclick="viewHistory('${student.student_id}', '${student.name}')" style="background:#007bff; margin-right:5px;">📅</button>
                    <button onclick="deleteStudent('${doc.id}')" style="background:red;">🗑️</button>
                </div>
            `;
            listContainer.appendChild(li);
        });
    });
}

function deleteStudent(docId) {
    if(confirm("Delete this student?")) {
        db.collection("students").doc(docId).delete()
        .then(() => loadStudentList())
        .catch(err => alert("Error: " + err.message));
    }
}

function viewHistory(studentId, studentName) {
    const modal = document.getElementById('student-history-modal');
    const title = document.getElementById('history-title');
    const tableBody = document.getElementById('history-table-body');
    
    modal.style.display = 'block';
    title.innerText = `History: ${studentName}`;
    tableBody.innerHTML = '<tr><td colspan="2">Loading...</td></tr>';

    // FIX: Removed .orderBy("timestamp") from database query to prevent Index errors
    db.collection("attendance")
        .where("student_id", "==", studentId)
        .get()
        .then((querySnapshot) => {
            tableBody.innerHTML = '';
            if (querySnapshot.empty) return tableBody.innerHTML = '<tr><td colspan="2">No records found.</td></tr>';

            // Convert to array and sort manually in JavaScript
            let records = [];
            querySnapshot.forEach(doc => records.push(doc.data()));
            records.sort((a,b) => b.timestamp - a.timestamp); // Sort Newest First

            records.forEach((data) => {
                const date = data.date_string || "N/A";
                let color = data.status.includes("Late") ? "orange" : (data.status.includes("Absent") ? "red" : "green");

                tableBody.innerHTML += `
                    <tr>
                        <td style="padding:8px;">${date}</td>
                        <td style="padding:8px; color:${color}; font-weight:bold;">${data.status}</td>
                    </tr>`;
            });
        });
}

// ==========================================
// 5. SCANNING & ATTENDANCE LOGIC - Nicart and Jeff
// ==========================================

function setStartTime() {
    const timeInput = document.getElementById('class-start-time').value;
    if(timeInput) {
        const now = new Date();
        const [hours, minutes] = timeInput.split(':');
        classStartTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
        console.log("Time set:", classStartTime);
    }
}

function startScanner() {
    if (html5QrcodeScanner) return;
    html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 });
    html5QrcodeScanner.render(onScanSuccess);
}

function stopScanner() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear().catch(err => console.error("Clear error", err));
        html5QrcodeScanner = null;
    }
}

function onScanSuccess(decodedText, decodedResult) {
    // Safe Pause (Prevents crashes on file upload)
    try {
        if (html5QrcodeScanner.getState() === Html5QrcodeScannerState.SCANNING) {
             html5QrcodeScanner.pause();
        }
    } catch (err) { console.warn("Pause skipped"); }

    processAttendance(decodedText);
}

//  Modified to automatically use student's section for attendance
function processAttendance(studentId) {
    const resultBox = document.getElementById('scan-result');
    resultBox.style.display = 'block';
    resultBox.innerText = "Processing ID: " + studentId + "...";
    resultBox.className = "status-msg";

    db.collection("students").where("student_id", "==", studentId).get()
    .then((querySnapshot) => {
        if (querySnapshot.empty) {
            resultBox.innerText = "❌ Student ID not found.";
            resultBox.classList.add("status-absent");
            setTimeout(() => { if(html5QrcodeScanner) html5QrcodeScanner.resume(); }, 2000);
            return;
        }

        const studentData = querySnapshot.docs[0].data();

        // Calculate Status
        const now = new Date();
        let status = "Present";
        let colorClass = "status-present";

        if (classStartTime) {
            const diffMins = Math.floor((now - classStartTime) / 60000);
            if (diffMins > 45) { status = "Absent"; colorClass = "status-absent"; }
            else if (diffMins > 15) { status = "Late"; colorClass = "status-late"; }
        }

        db.collection("attendance").add({
            student_id: studentId,
            student_name: studentData.name,
            status: status,
            section: studentData.section,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            date_string: new Date().toLocaleDateString()
        }).then(() => {
            resultBox.innerText = `✅ ${studentData.name}: ${status.toUpperCase()}`;
            resultBox.classList.add(colorClass);
            setTimeout(() => { 
                resultBox.style.display = 'none'; 
                if(html5QrcodeScanner) html5QrcodeScanner.resume(); 
            }, 2500);
        });
    }).catch(err => {
        alert("Error: " + err.message);
        if(html5QrcodeScanner) html5QrcodeScanner.resume();
    });
}

// ==========================================
// 6. DAILY REPORTS - Rose
// ==========================================

function loadReports() {
    const dateInput = document.getElementById('report-date');
    if (!dateInput.value) dateInput.valueAsDate = new Date();

    // Convert to local format to match database
    const dateString = new Date(dateInput.value).toLocaleDateString();
    const sectionFilter = document.getElementById('report-section-filter').value;

    const tableBody = document.getElementById('attendance-table-body');
    tableBody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';

    let query = db.collection("attendance").where("date_string", "==", dateString);
    if (sectionFilter) {
        query = query.where("section", "==", sectionFilter);
    }

    // FIX: Removed .orderBy("timestamp") from database query to prevent Index errors
    query.get()
        .then((querySnapshot) => {
            tableBody.innerHTML = '';
            if (querySnapshot.empty) return tableBody.innerHTML = '<tr><td colspan="4">No records found for this date.</td></tr>';

            // Convert to array and sort manually in JavaScript
            let records = [];
            querySnapshot.forEach(doc => records.push(doc.data()));
            records.sort((a,b) => b.timestamp - a.timestamp); // Sort Newest First

            records.forEach((data) => {
                let timeStr = "---";
                if (data.timestamp) timeStr = data.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

                let color = "black";
                if(data.status.includes("Late")) color = "#856404";
                if(data.status.includes("Absent")) color = "red";
                if(data.status.includes("Present")) color = "green";

                tableBody.innerHTML += `
                    <tr>
                        <td style="padding: 5px;">${timeStr}</td>
                        <td style="padding: 5px;">${data.student_name}</td>
                        <td style="padding: 5px;">${getSectionName(data.section)}</td>
                        <td style="padding: 5px; color:${color}; font-weight:bold;">${data.status}</td>
                    </tr>`;
            });
        });
}

// ==========================================
// 7. EXPORT TO EXCEL / CSV - Stephen
// ==========================================

function downloadCSV() {
    const dateInput = document.getElementById('report-date').value;
    const rows = document.querySelectorAll('#attendance-table-body tr');

    // 1. Check if there is data
    if(rows.length === 0 || rows[0].innerText.includes("Loading") || rows[0].innerText.includes("No records")) {
        return alert("Please load a valid report first!");
    }

    // 2. Create CSV Content (Header)
    let csvContent = "data:text/csv;charset=utf-8,Time,Name,Section,Status\n";

    // 3. Loop through rows and add data
    rows.forEach(row => {
        const cols = row.querySelectorAll('td');
        if(cols.length > 0) {
            // We wrap data in quotes "" to handle names with commas
            const rowData = Array.from(cols).map(col => `"${col.innerText}"`).join(",");
            csvContent += rowData + "\n";
        }
    });

    // 4. Trigger Download
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Attendance_${dateInput}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
// Dark Mode Toggle (Bonus Feature) //
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
}