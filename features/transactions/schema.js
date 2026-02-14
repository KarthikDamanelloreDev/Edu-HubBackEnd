const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    items: [{
        course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
        price: Number
    }],
    totalAmount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'INR'
    },
    transactionId: {
        type: String,
        required: true,
        unique: true
    },
    paymentGateway: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'success', 'failed'],
        default: 'pending'
    },
    gatewayResponse: {
        type: Object
    },
    customerDetails: {
        firstName: String,
        lastName: String,
        email: String,
        phone: String,
        address: String,
        city: String,
        state: String,
        zip: String,
        country: String
    },
    // Top-level fields for easy identification in Admin Panel (especially for gift purchases)
    customerName: String,
    customerEmail: String,
    customerPhone: String
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);