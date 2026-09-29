const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const xlsx = require('xlsx');
const session = require('express-session');
const bcrypt = require('bcrypt');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 1. Local Database Connection configuration
const db = mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'Prem1913', 
    database: 'FleetMaintenance'
});

db.connect(err => {
    if (err) console.error("Database connection fault: ", err.message);
    else console.log("⚡ Connected cleanly to Local MySQL Database System.");
});

// 2. Configure Session Middleware
app.use(session({
    secret: 'local_fleet_secure_key_2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 } // 1-hour active session window
}));

// Route Guard Protection Middleware
const checkAuth = (req, res, next) => {
    if (req.session && req.session.user) return next();
    res.redirect('/login.html');
};

// 3. API Route: Login Authentication Engine
app.post('/api/auth/login', (req, res) => {
    const { username, password, remember_me } = req.body;
    db.query("SELECT * FROM AdminUsers WHERE username = ?", [username], async (err, results) => {
        if (err || results.length === 0) return res.send("<h3>Invalid credentials. <a href='/login.html'>Try Again</a></h3>");
        
        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);
        
        if (isMatch) {
            req.session.user = { id: user.user_id, username: user.username, name: user.full_name };
            req.session.cookie.maxAge = (remember_me === 'on') ? (7 * 24 * 60 * 60 * 1000) : 3600000;
            res.redirect('/index.html');
        } else {
            res.send("<h3>Invalid credentials. <a href='/login.html'>Try Again</a></h3>");
        }
    });
});

// 4. API Route: Inline Data Editor Engine
app.post('/api/fleet/update-dates', checkAuth, (req, res) => {
    const { reg_number, insurance_expiry, fitness_expiry } = req.body;
    const operator = req.session.user.username;

    const findVehicleQuery = "SELECT vehicle_id FROM Vehicles WHERE reg_number = ?";
    db.query(findVehicleQuery, [reg_number], (err, results) => {
        if (err || results.length === 0) return res.status(404).json({ success: false, error: "Vehicle Not Found" });
        
        const vehicleId = results[0].vehicle_id;
        const updateQuery = "UPDATE DocumentStatus SET insurance_expiry = ?, fitness_expiry = ? WHERE vehicle_id = ?";
        
        db.query(updateQuery, [insurance_expiry, fitness_expiry, vehicleId], (updateErr) => {
            if (updateErr) return res.status(500).json({ success: false, error: updateErr.message });
            
            const auditMsg = `Inline modifications saved for ${reg_number}. Reset Ins: ${insurance_expiry}, Fit: ${fitness_expiry}.`;
            db.query("INSERT INTO AuditLogs (action_type, details, performed_by) VALUES ('UPDATE', ?, ?)", [auditMsg, operator], () => {
                res.json({ success: true, message: "Records committed seamlessly." });
            });
        });
    });
});

// System Operational Routing Mappings
app.get('/api/auth/logout', (req, res) => { req.session.destroy(); res.redirect('/login.html'); });
app.get('/index.html', checkAuth, (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/', checkAuth, (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.use(express.static(path.join(__dirname)));

app.get('/api/fleet', checkAuth, (req, res) => {
    db.query("SELECT v.reg_number, d.insurance_expiry, d.fitness_expiry FROM DocumentStatus d JOIN Vehicles v ON d.vehicle_id = v.vehicle_id;", (err, rows) => res.json(rows));
});
app.get('/api/audit-logs', checkAuth, (req, res) => {
    db.query("SELECT * FROM AuditLogs ORDER BY created_at DESC LIMIT 50", (err, rows) => res.json(rows));
});
app.post('/api/vehicles/add', checkAuth, (req, res) => {
    const { reg_number, model, insurance_expiry, fitness_expiry } = req.body;
    db.query(`INSERT INTO Vehicles (owner_id, reg_number, model) VALUES (1, ?, ?)`, [reg_number, model], (err, r) => {
        if (err) return res.status(500).send(err.message);
        db.query(`INSERT INTO DocumentStatus (vehicle_id, insurance_expiry, fitness_expiry) VALUES (?, ?, ?)`, [r.insertId, insurance_expiry, fitness_expiry], () => {
            db.query("INSERT INTO AuditLogs (action_type, details, performed_by) VALUES ('INSERT', ?, ?)", [`Registered vehicle ${reg_number}.`, req.session.user.username], () => res.redirect('/'));
        });
    });
});
app.get('/api/export/excel', checkAuth, (req, res) => {
    db.query("SELECT v.reg_number AS 'Registration No', d.insurance_expiry AS 'Insurance Expiry Date', d.fitness_expiry AS 'Fitness Expiry Date' FROM DocumentStatus d JOIN Vehicles v ON d.vehicle_id = v.vehicle_id;", (err, results) => {
        const worksheet = xlsx.utils.json_to_sheet(results);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, "Fleet Status");
        res.setHeader('Content-Disposition', 'attachment; filename=Fleet_Compliance_Report.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
    });
});

app.listen(3000, '0.0.0.0', () => console.log(`🚀 System running locally. Access it via port 3000.`));
