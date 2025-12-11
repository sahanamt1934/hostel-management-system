// server.js (Complete UPDATED File with all fixes, Fee Management, and Deadline Check)
const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// SECURITY FIX: Fail if JWT_SECRET is not set
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("CRITICAL ERROR: JWT_SECRET environment variable is not set! Please set it before running.");
  process.exit(1); 
}

// MySQL connection (using environment variables)
const db = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  // IMPORTANT: DB_PASSWORD should be set via environment variable
  password: process.env.DB_PASSWORD, 
  database: process.env.DB_DATABASE || "hostel_db",
  multipleStatements: true
});

db.connect(err => {
  if (err) {
    console.error("MySQL connection error:", err);
    process.exit(1);
  }
  console.log("Connected to MySQL");
});

// Utility: generate JWT
function generateToken(payload, expires = "4h") {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: expires });
}

// Utility: Format a date object into YYYY-MM-DD string
function formatDate(date) {
    // Uses template literal padding for robustness
    const d = new Date(date);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    return [year, month, day].join('-');
}

// Middleware: Generic Auth Helper (for token verification)
function authenticateToken(req, res, next) {
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).send("Missing or malformed token");
    
    // Extract token
    const token = auth.split(' ')[1]; 

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).send("Invalid token");
        req.user = user;
        next();
    });
}

// Middleware: Admin auth (uses generic helper)
function authenticateAdmin(req, res, next) {
    authenticateToken(req, res, () => {
        if (!req.user || req.user.role !== 'admin') {
            return res.status(403).send("Not authorized as Admin");
        }
        next();
    });
}

// Middleware: Student auth (uses generic helper)
function authenticateStudent(req, res, next) {
    authenticateToken(req, res, () => {
        if (!req.user || req.user.role !== 'student') {
            return res.status(403).send("Not authorized as Student");
        }
        next();
    });
}


// ----------------- Public routes (No Auth Required) -----------------

// Rooms (public read access for filling forms, etc.)
app.get("/rooms", (req, res) => {
  db.query("SELECT * FROM room ORDER BY room_no", (err, rows) => {
    if (err) return res.status(500).send("DB error");
    res.json(rows);
  });
});

app.get("/available-rooms", (req, res) => {
  db.query("CALL GetAvailableRooms()", (err, rows) => {
    if (err) return res.status(500).send("DB error");
    res.json(rows[0] ? rows[0] : rows);
  });
});

// Stored procedures endpoints
app.get("/count-per-room", (req, res) => {
  db.query("CALL CountStudentsPerRoom()", (err, rows) => {
    if (err) return res.status(500).send("DB error");
    res.json(rows[0] ? rows[0] : rows);
  });
});

// NEW FEATURE: Check for upcoming fee deadlines (For external scheduler/cron job)
app.get("/fees/check-deadlines", (req, res) => {
    // 1. Find the last payment date for every student
    const sql = `
        SELECT 
            s.student_id, 
            s.name, 
            s.phone,
            MAX(f.payment_date) AS last_payment_date
        FROM student s
        LEFT JOIN fee f ON s.student_id = f.student_id
        GROUP BY s.student_id
        HAVING last_payment_date IS NOT NULL;
    `;

    db.query(sql, (err, students) => {
        if (err) return res.status(500).send("DB error during deadline check");
        
        const notifications = [];
        const today = new Date(formatDate(new Date()));

        students.forEach(student => {
            const lastPayment = new Date(student.last_payment_date);
            
            // --- Calculation Logic ---
            
            // 1. Calculate Notification Date (28 days after payment)
            const notificationDate = new Date(lastPayment);
            notificationDate.setDate(notificationDate.getDate() + 28);
            
            // 2. Calculate Fee Due Date (30 days after payment, which is 2 days after notification)
            const dueDate = new Date(lastPayment);
            dueDate.setDate(dueDate.getDate() + 30);
            
            // 3. Check for Notifications
            let type = null;
            let message = '';

            // Check if Notification Date is TODAY
            if (formatDate(notificationDate) === formatDate(today)) {
                type = 'PRE_DUE';
                message = `Your fee is due in 2 days on ${formatDate(dueDate)}. Please pay soon.`;
            }
            
            // Check for Overdue status (Fee Due Date is past TODAY)
            if (formatDate(dueDate) < formatDate(today)) {
                type = 'OVERDUE';
                message = `URGENT: Your fee was due on ${formatDate(dueDate)} and is now overdue. Please pay immediately.`;
            }

            if (type) {
                notifications.push({
                    student_id: student.student_id,
                    name: student.name,
                    phone: student.phone,
                    type: type,
                    message: message,
                    dueDate: formatDate(dueDate)
                });
            }
        });
        
        res.json(notifications);
    });
});


// ----------------- Admin Protected Routes -----------------

// Complaints list (Admin Only)
app.get("/complaints", authenticateAdmin, (req, res) => {
  const sql = `SELECT c.*, s.name as student_name, r.room_no
               FROM complaint c
               LEFT JOIN student s ON c.student_id = s.student_id
               LEFT JOIN room r ON s.room_id = r.room_id
               ORDER BY c.date DESC`;
  db.query(sql, (err, rows) => {
    if (err) return res.status(500).send("DB error");
    res.json(rows);
  });
});

// Students list (Admin Only)
app.get("/students", authenticateAdmin, (req, res) => {
  const sql = `SELECT s.student_id, s.name, s.phone, s.admission_date, s.room_id, r.room_no
               FROM student s LEFT JOIN room r ON s.room_id = r.room_id ORDER BY s.student_id DESC`;
  db.query(sql, (err, rows) => {
    if (err) return res.status(500).send("DB error");
    res.json(rows);
  });
});

// Add student (admin only) - FIX: Added capacity check and corrected error message format
app.post("/add-student", authenticateAdmin, async (req, res) => {
  const { name, phone, room_id, password } = req.body; 
  
  if (!name || !phone || !room_id || !password) return res.status(400).send("Missing fields");

  // 1. Check Room Capacity before assignment - Must select room_no, capacity, and occupied
  db.query('SELECT room_no, capacity, occupied FROM room WHERE room_id = ?', [room_id], async (capErr, roomRows) => {
    if (capErr) return res.status(500).send("DB error checking room capacity");
    if (!roomRows.length) return res.status(404).send("Room not found.");

    const room = roomRows[0];
    
    // Check if the occupied count is less than the capacity
    if (room.occupied >= room.capacity) {
      // FIX: Corrected Error Message for the user
      return res.status(409).send(`Room ${room.room_no} is already full (Capacity: ${room.capacity}).`);
    }

    // 2. Proceed with student creation
    try {
      const hash = await bcrypt.hash(password, 10);
      
      const sql = "INSERT INTO student (name, phone, room_id, password, admission_date) VALUES (?, ?, ?, ?, CURDATE())";
      
      db.query(sql, [name, phone, room_id, hash], (err, result) => {
        if (err) {
          if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).send("DB Error: Phone number already exists.");
          }
          if (err.code === 'ER_NO_REFERENCED_ROW_2') {
             return res.status(404).send("Room not found or invalid room_id.");
          }
          return res.status(500).send("DB error: " + (err.sqlMessage || err.message));
        }
        
        // FIX: Simple success response for the frontend modal to handle the complex message
        res.send("Student Added Successfully");
      });
    } catch (error) {
      console.error("Hashing or Server Error:", error);
      res.status(500).send("Internal server error.");
    }
  });
});

// Delete student (admin only)
app.delete("/student/:id", authenticateAdmin, (req, res) => {
  const id = req.params.id;
  db.query("DELETE FROM student WHERE student_id = ?", [id], (err, result) => {
    if (err) return res.status(500).send("DB error");
    res.send("Student deleted");
  });
});

// Complaints update (admin only) - update status
app.put("/complaint/:id", authenticateAdmin, (req, res) => {
  const id = req.params.id;
  const { status } = req.body;
  if (!status) return res.status(400).send("Missing status");
  db.query("UPDATE complaint SET status = ? WHERE complaint_id = ?", [status, id], (err, result) => {
    if (err) return res.status(500).send("DB error");
    res.send("Complaint updated");
  });
});

// Add Room (Admin only)
app.post("/add-room", authenticateAdmin, (req, res) => {
  const { room_no, capacity } = req.body;
  if (!room_no || !capacity) return res.status(400).send("Missing room number or capacity");
  
  if (capacity < 1) return res.status(400).send("Capacity must be at least 1");
  
  const sql = "INSERT INTO room (room_no, capacity, status) VALUES (?, ?, 'Available')";
  db.query(sql, [room_no, capacity], (err, result) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
          return res.status(409).send("DB Error: Room number already exists.");
        }
      return res.status(500).send("DB error: " + (err.sqlMessage || err.message));
    }
    res.send("Room added successfully!");
  });
});

// Add Fee Payment (Admin Only) - NEW FEATURE
app.post("/add-fee", authenticateAdmin, (req, res) => {
  const { student_id, amount_paid, description } = req.body;
  
  if (!student_id || !amount_paid) return res.status(400).send("Missing student ID or amount.");
  
  // Use CURDATE() for the payment_date, which serves as the fee period start date
  const sql = "INSERT INTO fee (student_id, amount_paid, payment_date, description) VALUES (?, ?, CURDATE(), ?)";
  
  db.query(sql, [student_id, amount_paid, description], (err, result) => {
    if (err) {
      if (err.code === 'ER_NO_REFERENCED_ROW_2') {
         return res.status(404).send("Student not found.");
      }
      return res.status(500).send("DB error: " + (err.sqlMessage || err.message));
    }
    res.send("Fee payment recorded successfully.");
  });
});

// Get ALL Fee Payments (Admin Only) - NEW FEATURE
app.get("/fees/all", authenticateAdmin, (req, res) => {
  const sql = `SELECT f.fee_id, f.amount_paid, f.payment_date, f.description, s.student_id, s.name as student_name
               FROM fee f
               JOIN student s ON f.student_id = s.student_id
               ORDER BY f.payment_date DESC`;
  db.query(sql, (err, rows) => {
    if (err) return res.status(500).send("DB error");
    res.json(rows);
  });
});


// ----------------- Authentication routes -----------------

// Admin login
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).send("Missing fields");
  db.query('SELECT * FROM admin WHERE username = ?', [username], async (err, rows) => {
    if (err) return res.status(500).send("DB error");
    if (!rows.length) return res.status(401).send("Invalid credentials");
    const admin = rows[0];
    const ok = await bcrypt.compare(password, admin.password);
    if (!ok) return res.status(401).send("Invalid credentials");
    const token = generateToken({ role: 'admin', username: admin.username, admin_id: admin.admin_id });
    res.json({ token, role: 'admin' });
  });
});

// Student login (student_id + password)
app.post('/student/login', (req, res) => {
  const { student_id, password } = req.body;
  if (!student_id || !password) return res.status(400).send("Missing fields");
  db.query('SELECT * FROM student WHERE student_id = ?', [student_id], async (err, rows) => {
    if (err) return res.status(500).send("DB error");
    if (!rows.length) return res.status(401).send("Invalid credentials");
    const student = rows[0];
    if (!student.password) return res.status(403).send("Student has no password set");
    const ok = await bcrypt.compare(password, student.password);
    if (!ok) return res.status(401).send("Invalid credentials");
    const token = generateToken({ role: 'student', student_id: student.student_id, name: student.name });
    res.json({ token, role: 'student' });
  });
});

// Student: get own profile
app.get('/student/me', authenticateStudent, (req, res) => {
  const id = req.user.student_id;
  db.query('SELECT s.student_id, s.name, s.phone, s.admission_date, r.room_no FROM student s LEFT JOIN room r ON s.room_id = r.room_id WHERE s.student_id = ?', [id], (err, rows) => {
    if (err) return res.status(500).send("DB error");
    res.json(rows[0] || {});
  });
});

// Student: Change own password
app.post('/student/change-password', authenticateStudent, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const student_id = req.user.student_id;

  if (!oldPassword || !newPassword) return res.status(400).send("Missing password fields");
  
  // 1. Verify old password
  db.query('SELECT password FROM student WHERE student_id = ?', [student_id], async (err, rows) => {
    if (err || !rows.length) return res.status(500).send("DB error during verification");
    
    const storedHash = rows[0].password;
    const ok = await bcrypt.compare(oldPassword, storedHash);
    if (!ok) return res.status(401).send("Incorrect old password");

    // 2. Hash new password
    try {
      const newHash = await bcrypt.hash(newPassword, 10);
      
      // 3. Update database
      db.query('UPDATE student SET password = ? WHERE student_id = ?', [newHash, student_id], (updateErr, result) => {
        if (updateErr) return res.status(500).send("DB error during update");
        res.send("Password updated successfully!");
      });
    } catch (hashError) {
      res.status(500).send("Internal server error during hashing.");
    }
  });
});

// Get Student's OWN Fee Payments (Student Only) - NEW FEATURE
app.get("/fees/me", authenticateStudent, (req, res) => {
  const student_id = req.user.student_id;
  const sql = "SELECT fee_id, amount_paid, payment_date, description FROM fee WHERE student_id = ? ORDER BY payment_date DESC";
  db.query(sql, [student_id], (err, rows) => {
    if (err) return res.status(500).send("DB error");
    res.json(rows);
  });
});

// Add complaint (student only)
app.post("/add-complaint", authenticateStudent, (req, res) => {
  const { type, description } = req.body;
  const student_id = req.user.student_id;
  if (!type || !description) return res.status(400).send("Missing fields");
  const sql = "INSERT INTO complaint (student_id, type, description, date, status) VALUES (?, ?, ?, CURDATE(), 'Open')";
  db.query(sql, [student_id, type, description], (err, result) => {
    if (err) return res.status(500).send("DB error: " + (err.sqlMessage || err.message));
    res.send("Complaint added");
  });
});

// Start server
const PORT = 5000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));