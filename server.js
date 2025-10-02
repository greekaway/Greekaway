const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

// Σερβίρουμε όλα τα static αρχεία (html, css, js, εικόνες)
app.use(express.static(path.join(__dirname)));

// Ακούμε στο port 3000
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});

