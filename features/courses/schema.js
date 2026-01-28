const mongoose = require('mongoose');

const lectureSchema = new mongoose.Schema({
    title: { type: String, required: true },
    duration: { type: String, required: true }, // e.g., "10:56"
    preview: { type: Boolean, default: false }
});

const sectionSchema = new mongoose.Schema({
    title: { type: String, required: true },
    lectures: [lectureSchema]
});

const courseSchema = new mongoose.Schema({
    id: { type: String, unique: true },
    title: {
        type: String,
        required: true,
        trim: true
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    category: {
        type: String,
        required: true,
        index: true
    },
    subcategory: {
        type: String
    },
    description: {
        type: String,
        required: true
    },
    shortDescription: {
        type: String
    },
    instructorId: {
        type: String, // Assuming string ID from potential reference or external system for now, or could match Instructor model later
        required: true
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    originalPrice: {
        type: Number,
        min: 0
    },
    duration: {
        type: String,
        required: true
    },
    totalHours: {
        type: Number
    },
    lecturesCount: {
        type: Number
    },
    level: {
        type: String,
        enum: ['Beginner', 'Intermediate', 'Advanced', 'All Levels'],
        default: 'All Levels'
    },
    rating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
    },
    reviewsCount: {
        type: Number,
        default: 0
    },
    studentsEnrolled: {
        type: Number,
        default: 0
    },
    thumbnail: {
        type: String,
        required: true
    },
    featured: {
        type: Boolean,
        default: false
    },
    bestseller: {
        type: Boolean,
        default: false
    },
    language: {
        type: String,
        default: 'English'
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    },
    certificate: {
        type: Boolean,
        default: true
    },
    curriculum: [sectionSchema],
    learningOutcomes: [String],
    requirements: [String],
    targetAudience: [String]
}, { timestamps: true });

// Index for search
courseSchema.index({ title: 'text', description: 'text', category: 'text' });

module.exports = mongoose.model('Course', courseSchema);