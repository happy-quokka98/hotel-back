import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema({
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  author_name: String,
  delivery_rating: { type: Number, required: true, min: 1, max: 5 },
  quality_rating: { type: Number, required: true, min: 1, max: 5 },
  product_rating: { type: Number, required: true, min: 1, max: 5 },
  comment: String,
}, { timestamps: true });

export const Feedback = mongoose.model('Feedback', feedbackSchema);
