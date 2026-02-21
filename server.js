require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const connectDB = require("./config/db");

const app = express();

/* ===============================
   ✅ Middleware
================================= */
app.use(cors());
app.use(express.json());

/* ===============================
   ✅ Connect Database
================================= */
connectDB();

/* ===============================
   ✅ Quota Schema / Model
================================= */
const quotaSchema = new mongoose.Schema(
  {
    user: { type: String, unique: true, required: true },
    maxDownloads: { type: Number, default: 30 },
    usedDownloads: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const Quota = mongoose.model("Quota", quotaSchema);

/* ===============================
   ✅ Helper Function
================================= */
const buildQuotaResponse = (quota) => {
  const remaining = quota.maxDownloads - quota.usedDownloads;

  return {
    user: quota.user,
    maxDownloads: quota.maxDownloads,
    usedDownloads: quota.usedDownloads,
    remaining: Math.max(0, remaining),
    isBlocked: remaining <= 0,
  };
};

/* ===============================
   ✅ GET QUOTA
================================= */
app.get("/api/quota/:user", async (req, res) => {
  try {
    const { user } = req.params;

    let quota = await Quota.findOne({ user });

    if (!quota) {
      quota = await Quota.create({ user });
    }

    res.json(buildQuotaResponse(quota));
  } catch (error) {
    console.error("GET QUOTA ERROR:", error.message);
    res.status(500).json({ error: "Failed to fetch quota" });
  }
});

/* ===============================
   ✅ INCREMENT DOWNLOAD
================================= */
app.post("/api/quota/increment/:user", async (req, res) => {
  try {
    const { user } = req.params;

    let quota = await Quota.findOne({ user });

    if (!quota) {
      quota = await Quota.create({ user });
    }

    const remaining = quota.maxDownloads - quota.usedDownloads;

    if (remaining <= 0) {
      return res.json({
        allowed: false,
        message: "Download limit reached",
        ...buildQuotaResponse(quota),
      });
    }

    quota.usedDownloads += 1;
    await quota.save();

    res.json({
      allowed: true,
      message: "Download counted",
      ...buildQuotaResponse(quota),
    });
  } catch (error) {
    console.error("INCREMENT ERROR:", error.message);
    res.status(500).json({ error: "Failed to increment quota" });
  }
});

/* ===============================
   ✅ RESET DOWNLOADS (Admin)
================================= */
app.post("/api/quota/reset/:user", async (req, res) => {
  try {
    const { user } = req.params;

    const quota = await Quota.findOneAndUpdate(
      { user },
      { usedDownloads: 0 },
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      message: "Quota reset",
      ...buildQuotaResponse(quota),
    });
  } catch (error) {
    console.error("RESET ERROR:", error.message);
    res.status(500).json({ error: "Failed to reset quota" });
  }
});

/* ===============================
   ✅ SET LIMIT (Admin)
================================= */
app.post("/api/quota/set-limit/:user", async (req, res) => {
  try {
    const { user } = req.params;
    const { maxDownloads } = req.body;

    if (maxDownloads == null || maxDownloads < 1) {
      return res.status(400).json({
        success: false,
        error: "maxDownloads must be >= 1",
      });
    }

    const quota = await Quota.findOneAndUpdate(
      { user },
      { maxDownloads },
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      message: "Limit updated",
      ...buildQuotaResponse(quota),
    });
  } catch (error) {
    console.error("SET LIMIT ERROR:", error.message);
    res.status(500).json({ error: "Failed to update limit" });
  }
});

/* ===============================
   ✅ Server Start
================================= */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);