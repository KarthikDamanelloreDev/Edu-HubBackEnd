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

                // ✅ STEP 1: VERIFY PAYMENT STATUS WITH PINE LABS API
                // This updates the transaction status from 'pending' to 'success' or 'failed'
                let verificationSuccess = false;
                if (transactionId) {
                    try {
                        console.log('[Pine Labs Callback] 🔍 Verifying payment status with Pine Labs API...');

                        // Call verifyPayment which will:
                        // 1. Fetch order status from Pine Labs API
                        // 2. Update transaction status to 'success' or 'failed'
                        // 3. Clear cart if successful
                        const verifyResult = await verifyPayment(null, {
                            transactionId,
                            ...data
                        });

                        verificationSuccess = verifyResult.status === 'success';
                        console.log('[Pine Labs Callback] ✅ Payment verification completed:', verificationSuccess ? 'SUCCESS' : 'FAILED');
                    } catch (verifyError) {
                        console.error('[Pine Labs Callback] ❌ Payment verification error:', verifyError.message);
                        // Continue with redirect even if verification fails
                        // The frontend can retry verification
                    }
                }

                // ✅ STEP 2: BACKUP CART CLEARING (Safety Mechanism)
                // Note: Cart should already be cleared during payment initiation (in initiatePineLabsPayment)
                // AND in verifyPayment if payment was successful
                // This is a final safety backup
                if (transactionId) {
                    try {
                        // Find transaction to get user ID
                        const Transaction = require('../transactions/schema');
                        const transaction = await Transaction.findOne({ transactionId });

                        if (transaction && transaction.user) {
                            console.log('[Pine Labs Callback] 🔍 Checking if cart needs backup clearing for user:', transaction.user);
                            const cartResult = await clearCart(transaction.user);

                            if (cartResult && cartResult._itemsCleared > 0) {
                                console.log('[Pine Labs Callback] ⚠️ Cart had', cartResult._itemsCleared, 'items - backup clearing was necessary!');
                                console.log('[Pine Labs Callback] ⚠️ This means cart was NOT cleared during payment initiation or verification');
                                console.log('[Pine Labs Callback] ✅ Backup cart clear completed');
                            } else {
                                console.log('[Pine Labs Callback] ✅ Cart was already empty (cleared during payment initiation or verification)');
                            }
                        } else {
                            console.log('[Pine Labs Callback] ⚠️ Transaction or user not found, skipping backup cart clear');
                        }
                    } catch (cartError) {
                        console.error('[Pine Labs Callback] ❌ Backup cart clearing error:', cartError.message);
                        // Continue with redirect even if cart clearing fails
                    }
                }

                // ✅ STEP 3: REDIRECT TO FRONTEND
                // Redirect based on verification result
                if (transactionId) {
                    if (verificationSuccess) {
                        console.log('[Pine Labs Callback] ✅ Redirecting to SUCCESS page');
                        return res.redirect(`${REDIRECT_URLS.frontendSuccess}&transactionId=${transactionId}`);
                    } else {
                        console.log('[Pine Labs Callback] ⚠️ Redirecting to FAILURE page (verification failed or pending)');
                        return res.redirect(`${REDIRECT_URLS.frontendFailure}&transactionId=${transactionId}&message=Payment verification failed or pending`);
                    }
                } else {
                    console.log('[Pine Labs Callback] ⚠️ No transaction ID, redirecting to failure page');
                    return res.redirect(`${REDIRECT_URLS.frontendFailure}&message=Transaction ID not found`);
                }
            } catch (e) {
                console.error('[Pine Labs Callback] ❌ ERROR:', e.message);
                console.error('[Pine Labs Callback] ❌ Stack:', e.stack);
                // On error, redirect to failure page
                return res.redirect(`${REDIRECT_URLS.frontendFailure}&message=${encodeURIComponent(e.message)}`);
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
