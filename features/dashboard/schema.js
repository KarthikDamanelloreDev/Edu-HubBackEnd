const mongoose = require('mongoose');

const dashboardSchema = new mongoose.Schema({
    // Define schema fields
}, { timestamps: true });

module.exports = mongoose.model('Dashboard', dashboardSchema);