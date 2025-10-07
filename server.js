const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3000;

// 1️⃣ Σερβίρουμε στατικά αρχεία από το /public
app.use(express.static(path.join(__dirname, "public")));

// 2️⃣ Επιστρέφει όλες τις εκδρομές από trip.json
app.get("/api/trips", (req, res) => {
  fs.readFile(path.join(__dirname, "trip.json"), "utf8", (err, data) => {
    if (err) {
      console.error("Σφάλμα ανάγνωσης trip.json:", err);
      res.status(500).json({ error: "Δεν μπορέσαμε να διαβάσουμε τα δεδομένα." });
    } else {
      res.json(JSON.parse(data));
    }
  });
});

// 3️⃣ Όταν ο χρήστης πάει στο "/", να του δείχνει το index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 4️⃣ Εκκίνηση server
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});