const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

// Σερβίρουμε αρχεία από τον φάκελο του project...
app.use(express.static(path.join(__dirname)));
// ...και επίσης (προτεραιότητα) από τον φάκελο "public"
app.use(express.static(path.join(__dirname, 'public')));

// Προαιρετικό: αν θες να ορίζεις ρητά το index
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
