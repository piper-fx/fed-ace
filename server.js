const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 7860;
const DB_FILE = path.join(__dirname, 'database.json');

app.use(bodyParser.json());
app.use(express.static(__dirname));

// --- ADMIN LOGIN CONFIGURATION ---
const ADMIN_PASSWORD = "2yaN3rPH5ych"; 

app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.status(200).json({ success: true });
    } else {
        res.status(401).json({ success: false, message: "Invalid Password" });
    }
});
// ----------------------------------

const statusMapping = {
    "Pending": { loc: "FedEx Processing Facility", msg: "Package is being processed and prepared for shipment" },
    "On Hold": { loc: "FedEx Distribution Center", msg: "Package is temporarily on hold pending additional information" },
    "Shipped": { loc: "FedEx Shipping Facility", msg: "Package has been shipped and is awaiting processing" },
    "In-Transit": { loc: "FedEx Distribution Center", msg: "Package is moving through network" },
    "Out for Delivery": { loc: "FedEx Local Facility", msg: "Package is out for delivery today" },
    "Delivered": { loc: "Destination", msg: "Package delivered to recipient" }
};

// --- IN-MEMORY DATABASE FIX FOR HUGGING FACE ---
let memoryDB = [];

// Try to load existing data on startup (if file permissions allow)
try {
    if (fs.existsSync(DB_FILE)) {
        memoryDB = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } else {
        fs.writeFileSync(DB_FILE, JSON.stringify([]));
    }
} catch (err) {
    console.warn("Notice: Starting with empty RAM database due to HF read-only environment.");
}

// Get packages directly from RAM instead of the hard drive
const getPackages = () => {
    return memoryDB;
};

// Save packages to RAM first, then TRY to back up to hard drive
const savePackages = (data) => {
    memoryDB = data; // Always updates successfully in RAM
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        // Silently catch the error - the app will still work because memoryDB holds the data!
    }
};
// -----------------------------------------------

app.post('/api/packages', (req, res) => {
    const packages = getPackages();
    let pkg = req.body;
    
    // Generate a FedEx-style 12-digit tracking number if empty
    if (!pkg.trackingNumber) pkg.trackingNumber = "77" + Math.floor(Math.random() * 10000000000);

    const map = statusMapping[pkg.status] || { loc: "FedEx Facility", msg: "Status Updated" };
    const now = new Date();
    const timestamp = now.toLocaleString('en-US', { 
        month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true 
    });

    const index = packages.findIndex(p => p.trackingNumber === pkg.trackingNumber);
    
    if (index > -1) {
        if (packages[index].status !== pkg.status) {
            packages[index].history.push({
                status: pkg.status,
                time: timestamp,
                location: map.loc,
                details: map.msg
            });
        }
        packages[index] = { ...packages[index], ...pkg, history: packages[index].history };
    } else {
        pkg.history = [{
            status: pkg.status,
            time: timestamp,
            location: map.loc,
            details: "Label Created, FedEx Awaiting Item"
        }];
        packages.push(pkg);
    }

    savePackages(packages);
    res.json({ success: true, trackingNumber: pkg.trackingNumber });
});

app.get('/api/track/all', (req, res) => res.json(getPackages()));

app.get('/api/track/:id', (req, res) => {
    const pkg = getPackages().find(p => p.trackingNumber === req.params.id);
    pkg ? res.json(pkg) : res.status(404).send();
});

// Admin routing
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-login.html'));
});

// Listen on 0.0.0.0 for Hugging Face compatibility
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server live on port ${PORT}`);
    console.log(`Hugging Face ready: Listening on 0.0.0.0:${PORT}`);
});
