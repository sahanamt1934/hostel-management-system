// create_student_password.js (Dynamic DB Config - Updated with checks)
const mysql = require("mysql2");
const bcrypt = require("bcrypt");

// MySQL connection (using environment variables)
const db = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  // SECURITY FIX: Ensure DB_PASSWORD is used
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE || "hostel_db"
});

db.connect(async (err) => {
  if (err) {
    console.error("DB Error:", err);
    // If the error is an access denied, show the user how to fix it
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error("\n*** ACCESS DENIED: Ensure you have set the DB_PASSWORD environment variable! ***");
    }
    return;
  }
  console.log("Connected!");

  const studentId = 1;            // CHANGE THIS to your real student_id
  const plainPassword = "sahana123";

  try {
    const hash = await bcrypt.hash(plainPassword, 10);

    const sql = "UPDATE student SET password = ? WHERE student_id = ?";
    db.query(sql, [hash, studentId], (err, result) => {
      if (err) {
        console.log("Error updating student:", err);
        db.end();
        return;
      }
      console.log("Student password updated!");
      console.log("Student ID:", studentId);
      console.log("Password:", plainPassword);
      db.end();
    });
  } catch (error) {
    console.log("Hashing error:", error);
    db.end();
  }
});