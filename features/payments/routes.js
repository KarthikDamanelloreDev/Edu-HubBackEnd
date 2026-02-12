const express = require('express');
const router = express.Router();
const { initiatePayment, verifyPayment, REDIRECT_URLS } = require('./services');
const { decryptVegaah } = require('./utils/vegaahCrypto');
const { OK, CREATED, BAD_REQUEST, INTERNAL_SERVER_ERROR } = require('../../utils/statuscodes');

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
                console.log('[Pine Labs Callback] Received callback data:');
                console.log('[Pine Labs Callback] Query params:', JSON.stringify(req.query, null, 2));
                console.log('[Pine Labs Callback] Body params:', JSON.stringify(req.body, null, 2));
                console.log('[Pine Labs Callback] All data:', JSON.stringify(data, null, 2));
                console.log('[Pine Labs Callback] ========================================');

                // Pine Labs can send callbacks in different formats:
                // 1. URL redirect with query params
                // 2. Webhook POST with JSON body
                // 3. Form POST with form data

                // Extract transaction ID from various possible fields
                // Pine Labs typically sends: merchant_order_reference (our transaction ID)
                let transactionId = data.merchant_order_reference
                    || data.ppc_UniqueMerchantTxnID
                    || data.transactionId
                    || data.txnid;

                console.log('[Pine Labs Callback] Extracted Transaction ID from callback:', transactionId);

                // Also extract Pine Labs order_id for verification
                const pineLabsOrderId = data.order_id || data.orderId;
                console.log('[Pine Labs Callback] Pine Labs Order ID:', pineLabsOrderId);

                // If we don't have our transaction ID but we have Pine Labs order_id,
                // we need to look it up in the database
                if (!transactionId && pineLabsOrderId) {
                    console.log('[Pine Labs Callback] 🔍 Transaction ID not in callback, searching database...');
                    const Transaction = require('../transactions/schema');

                    // Search for transaction by Pine Labs order_id in gatewayResponse
                    const transaction = await Transaction.findOne({
                        paymentGateway: 'PINELABS',
                        'gatewayResponse.order_id': pineLabsOrderId
                    }).sort({ createdAt: -1 });

                    if (transaction) {
                        transactionId = transaction.transactionId;
                        console.log('[Pine Labs Callback] ✅ Found transaction in database:', transactionId);
                    } else {
                        console.log('[Pine Labs Callback] ⚠️ Transaction not found in database, checking recent transactions...');
                        // Fallback: Find most recent PINELABS transaction in pending state
                        const recentTransaction = await Transaction.findOne({
                            paymentGateway: 'PINELABS',
                            status: 'pending'
                        }).sort({ createdAt: -1 });

                        if (recentTransaction) {
                            transactionId = recentTransaction.transactionId;
                            console.log('[Pine Labs Callback] ✅ Using most recent pending transaction:', transactionId);
                        }
                    }
                }

                if (!transactionId) {
                    console.error('[Pine Labs Callback] ❌ CRITICAL: No transaction ID found!');
                    console.error('[Pine Labs Callback] Available fields:', Object.keys(data));
                    console.error('[Pine Labs Callback] Full data dump:', JSON.stringify(data, null, 2));
                    return res.redirect(`${REDIRECT_URLS.frontendFailure}&message=${encodeURIComponent('Invalid callback: No transaction ID')}`);
                }

                // Prepare data for verification - include both IDs
                const verificationData = {
                    ...data,
                    transactionId: transactionId, // Our transaction ID
                    order_id: pineLabsOrderId || data.order_id, // Pine Labs order ID
                };

                console.log('[Pine Labs Callback] Calling verifyPayment with transaction ID:', transactionId);

                // Verify payment status
                const result = await verifyPayment(null, verificationData);

                if (result.status === 'success') {
                    console.log('[Pine Labs Callback] ✅ Payment successful!');
                    console.log('[Pine Labs Callback] Redirecting to success page...');
                    return res.redirect(`${REDIRECT_URLS.frontendSuccess}&transactionId=${transactionId}`);
                }

                console.log('[Pine Labs Callback] ⚠️ Payment failed or pending');
                return res.redirect(`${REDIRECT_URLS.frontendFailure}&message=${encodeURIComponent('Payment verification failed')}&transactionId=${transactionId}`);
            } catch (e) {
                console.error('[Pine Labs Callback] ❌ ERROR occurred!');
                console.error('[Pine Labs Callback] Error message:', e.message);
                console.error('[Pine Labs Callback] Error stack:', e.stack);
                return res.redirect(`${REDIRECT_URLS.frontendFailure}&message=${encodeURIComponent(e.message || 'Payment processing error')}`);
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
