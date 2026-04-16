import mongoose from "mongoose"

const ProfileSchema = new mongoose.Schema({
  _id: { type: String }, // Storing UUID v7 as string
  name: { type: String, required: true, lowercase: true, unique: true },
  gender: { type: String, required: true },
  gender_probability: { type: Number },
  sample_size: { type: Number },
  age: { type: Number, required: true },
  age_group: { type: String, required: true },
  country_id: { type: String, required: true },
  country_probability: { type: Number },
  created_at: { type: Date, default: () => new Date() }
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