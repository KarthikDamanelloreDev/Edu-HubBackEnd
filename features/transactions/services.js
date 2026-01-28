const Transaction = require('./schema');
const Cart = require('../cart/schema');
const User = require('../authentication/schema');
const crypto = require('crypto');

// Configuration mocks (In real app, use env vars)
const PAYMENT_CONFIG = {
    payu: {
        key: "gvAZC3",
        salt: "TXbjLE8te1zWPuow0agMv8M3OFgZFfTq"
    },
    easebuzz: {
        key: "HQJFD3GMLT",
        salt: "MVOLOP9U16"
    }
};

// Initiate Transaction
const initiateTransaction = async (userId, data) => {
    // 1. Get User Cart
    const cart = await Cart.findOne({ user: userId }).populate('items.course');
    if (!cart || cart.items.length === 0) {
        throw new Error('Cart is empty');
    }

    // 2. Calculate Total
    const totalAmount = cart.items.reduce((sum, item) => sum + item.course.price, 0);

    // 3. Create Transaction Record
    const transactionId = `TXN${Date.now()}`;

    const transaction = new Transaction({
        user: userId,
        items: cart.items.map(i => ({ course: i.course._id, price: i.course.price })),
        totalAmount,
        transactionId,
        paymentGateway: data.paymentMethod,
        customerDetails: {
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            phone: data.phone,
            address: data.address,
            city: data.city,
            state: data.state,
            zip: data.zip,
            country: data.country
        },
        status: 'pending'
    });

    await transaction.save();

    // 4. Generate Hash based on Gateway
    let hash = '';
    const productInfo = "EduHub Course Purchase";

    if (data.paymentMethod === 'payu') {
        const key = PAYMENT_CONFIG.payu.key;
        const salt = PAYMENT_CONFIG.payu.salt;
        // Hash Sequence: key|txnid|amount|productinfo|firstname|email|||||||||||salt
        const hashString = `${key}|${transactionId}|${totalAmount.toFixed(2)}|${productInfo}|${data.firstName}|${data.email}|||||||||||${salt}`;
        hash = crypto.createHash('sha512').update(hashString).digest('hex');
    } else if (data.paymentMethod === 'easebuzz') {
        const key = PAYMENT_CONFIG.easebuzz.key;
        const salt = PAYMENT_CONFIG.easebuzz.salt;
        const hashString = `${key}|${transactionId}|${totalAmount.toFixed(2)}|${productInfo}|${data.firstName}|${data.email}|||||||||||${salt}`;
        hash = crypto.createHash('sha512').update(hashString).digest('hex');
    }

    return {
        transactionId,
        amount: totalAmount.toFixed(2),
        hash,
        productInfo,
        key: data.paymentMethod === 'payu' ? PAYMENT_CONFIG.payu.key : (data.paymentMethod === 'easebuzz' ? PAYMENT_CONFIG.easebuzz.key : null)
    };
};

// Handle Payment Success Webhook/Callback
const handlePaymentSuccess = async (data) => {
    // Verify hash logic would go here in production

    const transaction = await Transaction.findOne({ transactionId: data.txnid || data.order_id });
    if (!transaction) {
        throw new Error('Transaction not found');
    }

    transaction.status = 'success';
    transaction.gatewayResponse = data;
    await transaction.save();

    // Enroll User in Courses (Logic normally goes here)
    // Clear Cart
    await Cart.findOneAndUpdate({ user: transaction.user }, { $set: { items: [] } });

    console.log(`Transaction ${transaction.transactionId} success. Cart cleared.`);
    return transaction;
};

// Get User Transactions history
const getUserTransactions = async (userId) => {
    return await Transaction.find({ user: userId }).sort({ createdAt: -1 });
};

// Get All Transactions (Admin)
const getAllTransactions = async () => {
    return await Transaction.find()
        .populate('user', 'firstName lastName email')
        .sort({ createdAt: -1 });
};

module.exports = {
    initiateTransaction,
    handlePaymentSuccess,
    getUserTransactions,
    getAllTransactions
};