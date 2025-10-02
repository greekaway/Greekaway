const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3000;

// Σερβίρουμε τα στατικά αρχεία από το φάκελο public
app.use(express.static(path.join(__dirname, "public")));

// Endpoint για να επιστρέφει όλες τις εκδρομές
app.get("/api/trips", (req, res) => {
  fs.readFile(path.join(__dirname, "trips.json"), "utf8", (err, data) => {
    if (err) {
      res.status(500).json({ error: "Δεν μπορέσαμε να διαβάσουμε τα δεδομένα." });
    } else {
      res.json(JSON.parse(data));
    }
  });
});

// Εκκίνηση server
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
