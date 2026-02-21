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
   ✅ User Schema
================================= */
const userSchema = new mongoose.Schema(
  {
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true }, // In production, hash this!
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

/* ===============================
   ✅ Quota Schema
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
   ✅ USER ROUTES
================================= */

// 📝 REGISTER (Admin only - used by Flutter app)
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    // Check if user exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: "Username already exists" });
    }

    // Create user
    const user = await User.create({ username, password });
    
    // Create quota for user
    await Quota.create({ user: username });

    res.status(201).json({ 
      success: true, 
      message: "User created successfully",
      username: user.username 
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error.message);
    res.status(500).json({ error: "Failed to register user" });
  }
});

// 🔑 LOGIN
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    // Find user
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // Check password
    if (user.password !== password) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // Get user's quota
    const quota = await Quota.findOne({ user: username });

    res.json({ 
      success: true, 
      message: "Login successful",
      username: user.username,
      quota: quota ? buildQuotaResponse(quota) : null
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error.message);
    res.status(500).json({ error: "Login failed" });
  }
});

// 🔍 CHECK USER EXISTS (for web login)
app.post("/api/auth/check-user", async (req, res) => {
  try {
    const { username } = req.body;
    
    const user = await User.findOne({ username });
    const quota = await Quota.findOne({ user: username });
    
    if (user && quota) {
      res.json({ 
        exists: true, 
        username: user.username,
        quota: buildQuotaResponse(quota)
      });
    } else {
      res.json({ exists: false });
    }
  } catch (error) {
    console.error("CHECK USER ERROR:", error.message);
    res.status(500).json({ error: "Failed to check user" });
  }
});

/* ===============================
   ✅ ADMIN ROUTES
================================= */

// 👥 GET ALL USERS (Admin)
app.get("/api/admin/users", async (req, res) => {
  try {
    console.log("📡 Fetching all users...");
    
    // Get all users (exclude passwords)
    const users = await User.find({}, { password: 0 });
    
    // Get all quotas
    const quotas = await Quota.find();
    
    // Combine user data with quota data
    const userData = users.map(user => {
      const userQuota = quotas.find(q => q.user === user.username);
      return {
        username: user.username,
        createdAt: user.createdAt,
        quota: userQuota ? buildQuotaResponse(userQuota) : {
          user: user.username,
          maxDownloads: 30,
          usedDownloads: 0,
          remaining: 30,
          isBlocked: false
        }
      };
    });
    
    console.log(`✅ Found ${userData.length} users`);
    res.json(userData);
    
  } catch (error) {
    console.error("GET USERS ERROR:", error.message);
    res.json([]);
  }
});

// 🗑️ DELETE USER (Admin)
app.delete("/api/admin/users/:username", async (req, res) => {
  try {
    const { username } = req.params;
    console.log(`📡 Deleting user: ${username}`);
    
    // Don't allow deleting admin
    if (username === 'admin') {
      return res.status(400).json({ error: "Cannot delete admin user" });
    }
    
    await User.deleteOne({ username });
    await Quota.deleteOne({ user: username });
    
    console.log(`✅ User ${username} deleted`);
    res.json({ success: true, message: "User deleted" });
    
  } catch (error) {
    console.error("DELETE USER ERROR:", error.message);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

/* ===============================
   ✅ QUOTA ROUTES
================================= */

// GET QUOTA - FIXED: Don't auto-create users
app.get("/api/quota/:user", async (req, res) => {
  try {
    const { user } = req.params;
    console.log(`📡 Fetching quota for: ${user}`);
    
    // ONLY find existing quota, don't create
    const quota = await Quota.findOne({ user });

    if (!quota) {
      // Check if user exists in User collection
      const userExists = await User.findOne({ username: user });
      
      if (!userExists) {
        // Return 404 if user doesn't exist
        return res.status(404).json({ 
          error: "User not found",
          message: "This username doesn't exist. Please contact admin to create your account."
        });
      } else {
        // User exists but quota doesn't (shouldn't happen, but just in case)
        return res.status(404).json({ 
          error: "Quota not found",
          message: "Quota not initialized. Please contact admin."
        });
      }
    }

    res.json(buildQuotaResponse(quota));
  } catch (error) {
    console.error("GET QUOTA ERROR:", error.message);
    res.status(500).json({ error: "Failed to fetch quota" });
  }
});

// INCREMENT DOWNLOAD - FIXED: Don't auto-create users
app.post("/api/quota/increment/:user", async (req, res) => {
  try {
    const { user } = req.params;
    console.log(`📡 Incrementing for: ${user}`);
    
    // ONLY find existing quota, don't create
    const quota = await Quota.findOne({ user });

    if (!quota) {
      // Check if user exists
      const userExists = await User.findOne({ username: user });
      
      if (!userExists) {
        return res.status(404).json({ 
          allowed: false,
          error: "User not found",
          message: "This username doesn't exist. Please contact admin to create your account."
        });
      } else {
        return res.status(404).json({ 
          allowed: false,
          error: "Quota not found",
          message: "Quota not initialized. Please contact admin."
        });
      }
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

// RESET DOWNLOADS - FIXED: Check if user exists first
app.post("/api/quota/reset/:user", async (req, res) => {
  try {
    const { user } = req.params;
    console.log(`📡 Resetting quota for: ${user}`);
    
    // Check if user exists first
    const userExists = await User.findOne({ username: user });
    if (!userExists) {
      return res.status(404).json({ 
        success: false,
        error: "User not found",
        message: "This username doesn't exist."
      });
    }
    
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

// SET LIMIT - FIXED: Check if user exists first
app.post("/api/quota/set-limit/:user", async (req, res) => {
  try {
    const { user } = req.params;
    const { maxDownloads } = req.body;
    
    console.log(`📡 Setting limit for ${user} to: ${maxDownloads}`);

    if (maxDownloads == null || maxDownloads < 1) {
      return res.status(400).json({
        success: false,
        error: "maxDownloads must be >= 1",
      });
    }

    // Check if user exists first
    const userExists = await User.findOne({ username: user });
    if (!userExists) {
      return res.status(404).json({ 
        success: false,
        error: "User not found",
        message: "This username doesn't exist."
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
   ✅ Test Route
================================= */
app.get("/", (req, res) => {
  res.json({ 
    message: "Quota API Server", 
    endpoints: [
      "GET /api/quota/:user",
      "POST /api/quota/increment/:user",
      "POST /api/quota/reset/:user",
      "POST /api/quota/set-limit/:user",
      "POST /api/auth/register",
      "POST /api/auth/login",
      "POST /api/auth/check-user",
      "GET /api/admin/users",
      "DELETE /api/admin/users/:username"
    ]
  });
});

/* ===============================
   ✅ Server Start
================================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Endpoints available:`);
  console.log(`   👤 GET  /api/quota/:user`);
  console.log(`   📈 POST /api/quota/increment/:user`);
  console.log(`   🔄 POST /api/quota/reset/:user`);
  console.log(`   📝 POST /api/quota/set-limit/:user`);
  console.log(`   📝 POST /api/auth/register`);
  console.log(`   🔑 POST /api/auth/login`);
  console.log(`   🔍 POST /api/auth/check-user`);
  console.log(`   👥 GET  /api/admin/users`);
  console.log(`   🗑️ DELETE /api/admin/users/:username`);
});