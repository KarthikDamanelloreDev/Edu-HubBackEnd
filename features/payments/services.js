const Transaction = require('../transactions/schema');
const Cart = require('../cart/schema');
const crypto = require('crypto');

const PAYMENT_CONFIG = {
    payu: {
        key: process.env.PAYU_KEY,
        salt: process.env.PAYU_SALT,
        formUrl: process.env.PAYU_URL || 'https://secure.payu.in/_payment'
    },
    cashfree: {
        appId: process.env.CASHFREE_APP_ID,
        secretKey: process.env.CASHFREE_SECRET,
        baseUrl: process.env.CASHFREE_URL || 'https://api.cashfree.com/pg/orders'
    },
    easebuzz: {
        key: process.env.EASEBUZZ_KEY,
        salt: process.env.EASEBUZZ_SALT,
        env: process.env.EASEBUZZ_ENV || 'prod',
        initiateUrl: (process.env.EASEBUZZ_ENV === 'prod') ? 'https://pay.easebuzz.in/payment/initiateLink' : 'https://testpay.easebuzz.in/payment/initiateLink',
        payUrl: (process.env.EASEBUZZ_ENV === 'prod') ? 'https://pay.easebuzz.in/pay/' : 'https://testpay.easebuzz.in/pay/'
    },
    enkash: {
        key: process.env.ENKASH_KEY,
        secret: process.env.ENKASH_SECRET,
        baseUrl: process.env.ENKASH_URL || 'https://olympus-pg.enkash.in/api/v0'
    }
};

const REDIRECT_URLS = {
    callback: process.env.BACKEND_API_URL ? `${process.env.BACKEND_API_URL}/payments/callback` : 'https://edu-hubbackend.onrender.com/api/payments/callback',
    frontendSuccess: process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/payment-status?status=success` : 'https://eduhub.org.in/payment-status?status=success',
    frontendFailure: process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/payment-status?status=failure` : 'https://eduhub.org.in/payment-status?status=failure'
};

const initiatePayment = async (userId, data, ipAddress = '127.0.0.1') => {
    const cart = await Cart.findOne({ user: userId }).populate('items.course');
    if (!cart || cart.items.length === 0) {
        throw new Error('Cart is empty');
    }

    const totalAmount = cart.items.reduce((sum, item) => sum + (item.course?.price || 0), 0);
    const transactionId = `TXN${Date.now()}`;

    const transaction = new Transaction({
        user: userId,
        items: cart.items.map(i => ({ course: i.course._id, price: i.course.price })),
        totalAmount,
        transactionId,
        paymentGateway: data.paymentMethod,
        customerDetails: data.customerDetails,
        status: 'pending'
    });

    await transaction.save();

    const productInfo = "EduHub Course Purchase";
    const firstName = data.customerDetails.firstName;
    const lastName = data.customerDetails.lastName || "User";
    const email = data.customerDetails.email;
    const phone = data.customerDetails.phone;

    // --- Gateway Specific Logic ---

    // 1. PayU
    if (data.paymentMethod === 'payu') {
        const { key, salt, formUrl } = PAYMENT_CONFIG.payu;
        const hashString = `${key}|${transactionId}|${totalAmount.toFixed(2)}|${productInfo}|${firstName}|${email}|||||||||||salt`;
        const hash = crypto.createHash('sha512').update(hashString.replace('salt', salt)).digest('hex');

        return {
            status: 'success',
            data: {
                formUrl,
                params: {
                    key, txnid: transactionId, amount: totalAmount.toFixed(2), productinfo: productInfo,
                    firstname: firstName, email: email, phone: phone, surl: REDIRECT_URLS.callback,
                    furl: REDIRECT_URLS.callback, hash: hash, service_provider: 'payu_paisa'
                }
            }
        };
    }

    // 2. Easebuzz
    if (data.paymentMethod === 'easebuzz') {
        const { key, salt, initiateUrl, payUrl } = PAYMENT_CONFIG.easebuzz;
        const hashString = `${key}|${transactionId}|${totalAmount.toFixed(2)}|${productInfo}|${firstName}|${email}|||||||||||${salt}`;
        const hash = crypto.createHash('sha512').update(hashString).digest('hex');

        const formData = new URLSearchParams();
        formData.append('key', key);
        formData.append('txnid', transactionId);
        formData.append('amount', totalAmount.toFixed(2));
        formData.append('productinfo', productInfo);
        formData.append('firstname', firstName);
        formData.append('email', email);
        formData.append('phone', phone);
        formData.append('surl', REDIRECT_URLS.callback);
        formData.append('furl', REDIRECT_URLS.callback);
        formData.append('hash', hash);
        for (let i = 1; i <= 10; i++) formData.append(`udf${i}`, '');

        try {
            const response = await fetch(initiateUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
                body: formData.toString()
            });
            const result = await response.json();
            if (result.status === 1 && result.data) {
                return { status: 'success', data: { paymentLink: `${payUrl}${result.data}` } };
            } else {
                throw new Error(result.error_desc || result.data || "Easebuzz API Error");
            }
        } catch (error) {
            throw new Error(`Easebuzz Error: ${error.message}`);
        }
    }

    // 3. Cashfree
    if (data.paymentMethod === 'cashfree') {
        const { appId, secretKey, baseUrl } = PAYMENT_CONFIG.cashfree;
        try {
            const response = await fetch(baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-client-id': appId, 'x-client-secret': secretKey, 'x-api-version': '2023-08-01'
                },
                body: JSON.stringify({
                    order_id: transactionId,
                    order_amount: totalAmount,
                    order_currency: 'INR',
                    customer_details: {
                        customer_id: userId.toString(),
                        customer_email: email,
                        customer_phone: phone,
                        customer_name: `${firstName} ${lastName}`.trim()
                    },
                    order_meta: { return_url: `${REDIRECT_URLS.callback}?order_id={order_id}` }
                })
            });
            const result = await response.json();
            if (result.payment_session_id) {
                return { status: 'success', data: { paymentLink: result.payment_link || `https://payments.cashfree.com/checkouts/v1/mobile-checkout/${result.payment_session_id}` } };
            } else {
                throw new Error(result.message || "Cashfree API Error");
            }
        } catch (error) {
            throw error;
        }
    }

    // 4. EnKash (Refined for Olympus PG)
    if (data.paymentMethod === 'enkash') {
        const { key, secret, baseUrl } = PAYMENT_CONFIG.enkash;
        if (!key || !secret) throw new Error('EnKash configuration missing');

        try {
            // STEP 1: Auth Token
            const tokenResponse = await fetch(`${baseUrl}/merchant/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'API-Key': key },
                body: JSON.stringify({ accessKey: key, secretKey: secret })
            });
            const tokenResult = await tokenResponse.json();
            const token = tokenResult.token || tokenResult.accessToken;
            if (!token) throw new Error(tokenResult.message || "EnKash Auth Failed");

            // --- UNIVERSAL ENKASH CALLER ---
            const callEnKash = async (path, body, currentToken) => {
                // We will try multiple headers/payloads to find what the server likes
                const headers = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`,
                    'merchantAccessKey': key,
                    'x-merchant-id': key,
                    'mid': key,
                    'API-Key': key
                };
                const resp = await fetch(`${baseUrl}${path}`, {
                    method: 'POST', headers, body: JSON.stringify(body)
                });
                return await resp.json();
            };

            // STEP 2: Create Order (The "Universal" Payload)
            // We combine multiple key naming conventions into one object
            const orderPayload = {
                // Merchant IDs
                mid: key,
                merchantId: key,
                merchantAccessKey: key,

                // Order Details
                orderId: transactionId,
                merchantOrderId: transactionId,

                // Amount (Inclusive of all formats: object, and flat)
                amount: { value: totalAmount.toFixed(2), currency: "INR" },
                orderAmount: totalAmount.toFixed(2),
                currency: "INR",

                // URLs
                returnUrl: REDIRECT_URLS.frontendSuccess,
                notifyUrl: REDIRECT_URLS.callback,

                // Customer Info (Both nested and flat)
                customerInfo: {
                    firstName, lastName, email, phoneNumber: phone, customerIpAddress: ipAddress
                },
                customerName: `${firstName} ${lastName}`.trim(),
                customerEmail: email,
                customerPhone: phone,
                customerIpAddress: ipAddress,

                description: productInfo
            };

            let orderResult = await callEnKash('/orders', orderPayload, token);

            // Handle common EnKash errors and retry logic
            if (orderResult.response_code === 117 || orderResult.payload === "Token is invalid.") {
                // Try without Bearer
                const headersNoBearer = {
                    'Content-Type': 'application/json',
                    'Authorization': token,
                    'merchantAccessKey': key,
                    'mid': key
                };
                const respRetry = await fetch(`${baseUrl}/orders`, { method: 'POST', headers: headersNoBearer, body: JSON.stringify(orderPayload) });
                orderResult = await respRetry.json();
            }

            if (!orderResult.orderId && !orderResult.order_id && orderResult.resultCode !== 1) {
                const errorStr = orderResult.message || orderResult.resultMessage || JSON.stringify(orderResult);
                throw new Error(`EnKash Order Error: ${errorStr}`);
            }

            // STEP 3: Initiate Payment (The "Universal" Payload)
            const paymentPayload = {
                mid: key,
                merchantId: key,
                orderId: transactionId,
                merchantOrderId: transactionId,
                paymentMode: "HOSTED"
            };

            let paymentResult = await callEnKash('/payments', paymentPayload, token);

            // Redirection logic
            const redirectUrl = paymentResult.redirectionUrl || paymentResult.redirection_url || paymentResult.payload?.redirectionUrl;

            if (redirectUrl) {
                return { status: 'success', data: { paymentLink: redirectUrl } };
            } else {
                throw new Error(`EnKash Payment Exception: ${paymentResult.message || JSON.stringify(paymentResult)}`);
            }

        } catch (error) {
            console.error("[EnKash] Ultimate Flow Error:", error.message);
            throw new Error(error.message);
        }
    }

    throw new Error('Unsupported payment method');
};

const verifyPayment = async (userId, data) => {
    const transactionId = data.txnid || data.order_id || data.transactionId;
    const transaction = await Transaction.findOne({ transactionId });
    if (!transaction) throw new Error('Transaction not found');
    if (transaction.status === 'success') return { status: 'success', message: 'Payment already verified' };

    transaction.status = 'success';
    transaction.gatewayResponse = data;
    await transaction.save();

    await Cart.findOneAndUpdate({ user: transaction.user }, { $set: { items: [] } });
    return { status: 'success', message: 'Payment verified successfully', transaction };
};

module.exports = { initiatePayment, verifyPayment, REDIRECT_URLS };
