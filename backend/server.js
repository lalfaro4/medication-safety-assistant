const express = require("express");
const cors = require("cors");

const interactionsRouter = require("./routes/interactions");

const app = express();

app.use(cors());
app.use(express.json());

// connect your route
app.use("/api", interactionsRouter);

const PORT = 5001;

app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});
