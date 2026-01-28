const mongoose = require('mongoose');

const socialLinksSchema = new mongoose.Schema({
    website: { type: String, trim: true },
    twitter: { type: String, trim: true },
    linkedin: { type: String, trim: true },
    youtube: { type: String, trim: true },
    instagram: { type: String, trim: true }
}, { _id: false });

const instructorSchema = new mongoose.Schema({
    id: {
        type: String,
        unique: true
    },
    name: {
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
    title: {
        type: String,
        required: true,
        trim: true
    },
    bio: {
        type: String,
        required: true
    },
    avatar: {
        type: String,
        required: true
    },
    expertise: {
        type: [String],
        default: []
    },
    rating: {
        type: Number,
        default: 4.8
    },
    studentsCount: {
        type: Number,
        default: 0
    },
    reviewsCount: {
        type: Number,
        default: 0
    },
    socialLinks: {
        type: socialLinksSchema,
        default: {}
    },
    achievements: {
        type: [String],
        default: []
    }
}, { timestamps: true });

instructorSchema.index({ name: 'text', title: 'text', bio: 'text' });

module.exports = mongoose.model('Instructor', instructorSchema);