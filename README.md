# Hostel Management System

A web-based application to manage hostel rooms, student registrations, and complaints.

## 🚀 Features
* **Admin Dashboard:** Add rooms and register students.
* **Student Portal:** View profiles and submit maintenance complaints.
* **Authentication:** Secure login using JWT (JSON Web Tokens) and Bcrypt password hashing.
* **Database:** MySQL integration for persistent storage.

## 🛠️ Tech Stack
* **Frontend:** HTML5, CSS3, JavaScript (Vanilla)
* ---
* **Backend:** Node.js, Express
* **Database:** MySQL
* **Security:** JWT, Bcrypt

## ⚙️ Setup Instructions

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/sahanamt1934/hostel-management-system.git](https://github.com/sahanamt1934/hostel-management-system.git)
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Environment Variables:**
    Create a `.env` file and add:
    ```env
    DB_HOST=localhost
    DB_USER=root
    DB_PASSWORD=your_password
    DB_DATABASE=hostel_db
    JWT_SECRET=your_super_secret_key
    ```

4.  **Run the Server:**
    ```bash
    node server.js
    ```
