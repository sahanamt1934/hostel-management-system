// create_admin.js (Dynamic DB Config - Updated with checks)
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
  console.log("Connected to MySQL!");

  const username = "admin";
  const plainPassword = "admin123";

  try {
    const hash = await bcrypt.hash(plainPassword, 10);

    const sql = "INSERT INTO admin (username, password) VALUES (?, ?)";
    db.query(sql, [username, hash], (err, result) => {
      if (err) {
        console.log("Error inserting admin:", err);
        db.end();
        return;
      }
      console.log("Admin created successfully!");
      console.log("Username:", username);
      console.log("Password:", plainPassword);
      db.end();
    });
  } catch (error) {
    console.log("Hashing error:", error);
    db.end();
  }
});