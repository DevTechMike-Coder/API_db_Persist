import mongoose from "mongoose"

const ProfileSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // UUID v7
  name: { type: String, required: true, lowercase: true, unique: true },
  gender: { type: String, required: true, enum: ["male", "female", "unknown"] },
  gender_probability: { type: Number },
  age: { type: Number, required: true },
  age_group: { type: String, required: true, enum: ["child", "teenager", "adult", "senior"] },
  country_id: { type: String, required: true, uppercase: true }, // ISO code (2 letters)
  country_name: { type: String, required: true },
  country_probability: { type: Number },
  sample_size: { type: Number }, // Keeping for completeness
  is_confident: { type: Boolean, default: true }, // Keeping for completeness
  created_at: { type: Date, default: Date.now }
}, { 
  toJSON: {
    transform: (doc, ret) => {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

const Profile = mongoose.model("Profile", ProfileSchema)

export default Profile