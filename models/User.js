const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
      minlength: [3, "Username must be at least 3 characters"],
      maxlength: [30, "Username cannot exceed 30 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false, // Never return password in queries by default
    },
    avatar: {
      type: String,
      default: "",
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    expoPushToken: {
      type: String,
      default: null,
      trim: true,
    },
    fcmToken: {
      type: String,
      default: null,
      trim: true,
    },
    apnsVoipToken: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { timestamps: true }
);



// Instance method: compare plain password with plain password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return candidatePassword === this.password;
};


module.exports = mongoose.model("User", userSchema);
