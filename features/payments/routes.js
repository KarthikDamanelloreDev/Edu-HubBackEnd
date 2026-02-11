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
        console.log('Payment Callback Received:', req.body || req.query);
        const data = { ...req.body, ...req.query };

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
                console.log('[Pine Labs Callback] Received data:', JSON.stringify(data, null, 2));

                // Pine Labs can send callbacks in different formats:
                // 1. URL redirect with query params
                // 2. Webhook POST with JSON body

                // Extract transaction ID from various possible fields
                const transactionId = data.merchant_order_reference
                    || data.ppc_UniqueMerchantTxnID
                    || data.order_id
                    || data.orderId;

                console.log('[Pine Labs Callback] Transaction ID:', transactionId);

                if (!transactionId) {
                    console.error('[Pine Labs Callback] No transaction ID found in callback data');
                    return res.redirect(`${REDIRECT_URLS.frontendFailure}&message=Invalid callback data`);
                }

                // Verify payment status
                const result = await verifyPayment(null, data);

                if (result.status === 'success') {
                    console.log('[Pine Labs Callback] Payment successful, redirecting to success page');
                    return res.redirect(`${REDIRECT_URLS.frontendSuccess}&transactionId=${transactionId}`);
                }

                console.log('[Pine Labs Callback] Payment failed or pending');
                return res.redirect(`${REDIRECT_URLS.frontendFailure}&message=Payment failed&transactionId=${transactionId}`);
            } catch (e) {
                console.error('[Pine Labs Callback] Error:', e.message);
                console.error('[Pine Labs Callback] Stack:', e.stack);
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
