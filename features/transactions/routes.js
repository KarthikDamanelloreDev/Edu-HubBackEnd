const express = require('express');
const router = express.Router();
const { initiateTransaction, handlePaymentSuccess, getUserTransactions, getAllTransactions } = require('./services');
const { validateCheckout } = require('./validations');
const { OK, CREATED, BAD_REQUEST, INTERNAL_SERVER_ERROR, NOT_FOUND } = require('../../utils/statuscodes');

// Initiate Checkout
router.post('/initiate', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
            return res.status(BAD_REQUEST).json({ message: 'User ID required in headers (x-user-id)' });
        }

        const errors = validateCheckout(req.body);
        if (errors.length > 0) {
            return res.status(BAD_REQUEST).json({ errors });
        }

        const result = await initiateTransaction(userId, req.body);
        res.status(CREATED).json(result);
    } catch (err) {
        if (err.message === 'Cart is empty') {
            return res.status(BAD_REQUEST).json({ message: 'Cart is empty' });
        }
        console.error(err);
        res.status(INTERNAL_SERVER_ERROR).json({ message: 'Server error' });
    }
});

// Payment Success Callback (Webhook)
// This endpoint would typically be called by the Payment Gateway OR the Frontend after success redirect
router.post('/success', async (req, res) => {
    try {
        const result = await handlePaymentSuccess(req.body);
        res.status(OK).json({ message: 'Payment recorded successfully', transactionId: result.transactionId });
    } catch (err) {
        if (err.message === 'Transaction not found') {
            return res.status(NOT_FOUND).json({ message: 'Transaction not found' });
        }
        console.error(err);
        res.status(INTERNAL_SERVER_ERROR).json({ message: 'Server error' });
    }
});

// My Orders / Transactions History
router.get('/history', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
            return res.status(BAD_REQUEST).json({ message: 'User ID required in headers (x-user-id)' });
        }

        const transactions = await getUserTransactions(userId);
        res.status(OK).json(transactions);
    } catch (err) {
        console.error(err);
        res.status(INTERNAL_SERVER_ERROR).json({ message: 'Server error' });
    }
});

// Admin: Get All Transactions
router.get('/all', async (req, res) => {
    try {
        const transactions = await getAllTransactions();
        res.status(OK).json(transactions);
    } catch (err) {
        console.error(err);
        res.status(INTERNAL_SERVER_ERROR).json({ message: 'Server error' });
    }
});

module.exports = router;