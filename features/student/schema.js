const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
    // Define schema fields
}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema);