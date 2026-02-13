const express = require('express');
const router = express.Router();
const { initiatePayment, verifyPayment, REDIRECT_URLS } = require('./services');
const { decryptVegaah } = require('./utils/vegaahCrypto');
const { OK, CREATED, BAD_REQUEST, INTERNAL_SERVER_ERROR } = require('../../utils/statuscodes');
const { clearCart } = require('../cart/services');

router.post('/initiate', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
            return res.status(BAD_REQUEST).json({ message: 'User ID required' });
        }

        const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
        const result = await initiatePayment(userId, req.body, ipAddress);
        res.status(OK).json(result);
    } catch (error) {
        console.error('Payment Initiation Error:', error);
        res.status(INTERNAL_SERVER_ERROR).json({
            status: 'error',
            message: error.message || 'Failed to initiate payment'
        });
    }
});

// Callback route for gateways (GET or POST)
router.all('/callback', async (req, res) => {
    try {
        console.log('================================================================================');
        console.log('💳 PAYMENT CALLBACK RECEIVED');
        console.log('================================================================================');
        console.log('📍 URL:', req.url);
        console.log('📍 Method:', req.method);
        console.log('📦 Query Params:', JSON.stringify(req.query, null, 2));
        console.log('📦 Body Params:', JSON.stringify(req.body, null, 2));
        console.log('================================================================================');

        const data = { ...req.body, ...req.query };

        // Auto-detect Pine Labs callback (they might not send gateway param)
        const isPineLabs = data.order_id || data.merchant_order_reference || data.token;

        if (isPineLabs && !data.gateway) {
            console.log('🔍 Auto-detected Pine Labs callback (no gateway param found)');
            data.gateway = 'PINELABS';
        }

        // Vegaah Callback Handler
        if (data.gateway === 'VEGAAH') {
            try {
                // Decrypt data to get orderId/transactionId
                const decrypted = decryptVegaah(data.encData);

                // If success, verify and redirect
                if (decrypted.paymentStatus === "SUCCESS") {
                    await verifyPayment(null, decrypted);
                    return res.redirect(`${REDIRECT_URLS.frontendSuccess}&transactionId=${decrypted.orderId}`);
                }

                return res.redirect(`${REDIRECT_URLS.frontendFailure}`);
            } catch (e) {
                console.error("Vegaah Callback Error", e);
                return res.redirect(`${REDIRECT_URLS.frontendFailure}`);
            }
        }




        if (data.gateway === 'PINELABS' || data.gateway === 'pinelabs') {
            try {
                console.log('[Pine Labs Callback] ========================================');
                console.log('[Pine Labs Callback] Received callback data');
                console.log('[Pine Labs Callback] ========================================');

                // Extract transaction ID from callback
                let transactionId = data.merchant_order_reference
                    || data.ppc_UniqueMerchantTxnID
                    || data.transactionId
                    || data.txnid
                    || data.merchant_txn_id
                    || data.merchantTxnId;

                console.log('[Pine Labs Callback] Transaction ID:', transactionId);

                // ✅ CLEAR CART IN BACKEND BEFORE REDIRECTING
                // This ensures cart is cleared regardless of payment success/failure
                if (transactionId) {
                    try {
                        // Find transaction to get user ID
                        const Transaction = require('../transactions/schema');
                        const transaction = await Transaction.findOne({ transactionId });

                        if (transaction && transaction.userId) {
                            console.log('[Pine Labs Callback] 🧹 Clearing cart for user:', transaction.userId);
                            await clearCart(transaction.userId);
                            console.log('[Pine Labs Callback] ✅ Cart cleared successfully in backend');
                        } else {
                            console.log('[Pine Labs Callback] ⚠️ Transaction or user not found, skipping cart clear');
                        }
                    } catch (cartError) {
                        console.error('[Pine Labs Callback] ❌ Cart clearing error:', cartError.message);
                        // Continue with redirect even if cart clearing fails
                    }
                }

                // Simple redirect - cart already cleared
                if (transactionId) {
                    console.log('[Pine Labs Callback] ✅ Redirecting to success page');
                    return res.redirect(`${REDIRECT_URLS.frontendSuccess}&transactionId=${transactionId}`);
                } else {
                    console.log('[Pine Labs Callback] ⚠️ No transaction ID, redirecting to success anyway');
                    return res.redirect(`${REDIRECT_URLS.frontendSuccess}`);
                }
            } catch (e) {
                console.error('[Pine Labs Callback] ❌ ERROR:', e.message);
                // On error, still redirect to success - user can check their dashboard
                return res.redirect(`${REDIRECT_URLS.frontendSuccess}`);
            }
        }



        // Basic check for success from common gateways
        const isSuccess = data.status === 'success' || data.status === 'SUCCESS' || data.txStatus === 'SUCCESS' || data.order_status === 'PAID' || data.result === 'success';

        if (isSuccess) {
            const result = await verifyPayment(null, data);
            const transactionId = data.txnid || data.order_id || data.transactionId;
            res.redirect(`${REDIRECT_URLS.frontendSuccess}&transactionId=${transactionId}`);
        } else {
            res.redirect(`${REDIRECT_URLS.frontendFailure}&message=Payment failed or was cancelled`);
        }
    } catch (error) {
        console.error('Payment Callback Error:', error);
        res.redirect(`${REDIRECT_URLS.frontendFailure}&message=${encodeURIComponent(error.message)}`);
    }
});

router.post('/verify', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
            return res.status(BAD_REQUEST).json({ message: 'User ID required' });
        }

        const result = await verifyPayment(userId, req.body);
        res.status(OK).json(result);
    } catch (error) {
        console.error('Payment Verification Error:', error);
        res.status(INTERNAL_SERVER_ERROR).json({
            status: 'error',
            message: error.message || 'Failed to verify payment'
        });
    }
});

module.exports = router;
