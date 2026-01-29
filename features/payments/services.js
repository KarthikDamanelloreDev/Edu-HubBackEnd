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
        mid: process.env.ENKASH_MID || 'CEKJK1EYSA', // From Dashboard: EnKash Company ID
        baseUrl: process.env.ENKASH_URL || 'https://olympus-pg.enkash.in/api/v0'
    }
};

const REDIRECT_URLS = {
    callback: process.env.BACKEND_API_URL ? `${process.env.BACKEND_API_URL}/payments/callback` : 'https://edu-hubbackend.onrender.com/api/payments/callback',
    frontendSuccess: process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/payment-status?status=success` : 'https://eduhub.org.in/payment-status?status=success',
    frontendFailure: process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/payment-status?status=failure` : 'https://eduhub.org.in/payment-status?status=failure'
};

const initiatePayment = async (userId, data, ipAddress = '127.0.0.1') => {
    // 1. Validate Cart
    const cart = await Cart.findOne({ user: userId }).populate('items.course');
    if (!cart || cart.items.length === 0) throw new Error('Cart is empty');

    const totalAmount = cart.items.reduce((sum, item) => sum + (item.course?.price || 0), 0);
    const transactionId = `TXN${Date.now()}`;

    // 2. Save Transaction
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

    const firstName = data.customerDetails.firstName;
    const lastName = data.customerDetails.lastName || "User";
    const email = data.customerDetails.email;
    const phone = data.customerDetails.phone;
    const productInfo = "EduHub Course Purchase";

    // --- GATEWAY LOGIC ---

    if (data.paymentMethod === 'payu') {
        const { key, salt, formUrl } = PAYMENT_CONFIG.payu;
        const hashStr = `${key}|${transactionId}|${totalAmount.toFixed(2)}|${productInfo}|${firstName}|${email}|||||||||||${salt}`;
        const hash = crypto.createHash('sha512').update(hashStr).digest('hex');
        return {
            status: 'success',
            data: {
                formUrl,
                params: {
                    key, txnid: transactionId, amount: totalAmount.toFixed(2), productinfo: productInfo,
                    firstname: firstName, email: email, phone: phone, surl: REDIRECT_URLS.callback,
                    furl: REDIRECT_URLS.callback, hash, service_provider: 'payu_paisa'
                }
            }
        };
    }

    if (data.paymentMethod === 'easebuzz') {
        const { key, salt, initiateUrl, payUrl } = PAYMENT_CONFIG.easebuzz;
        const hashStr = `${key}|${transactionId}|${totalAmount.toFixed(2)}|${productInfo}|${firstName}|${email}|||||||||||${salt}`;
        const hash = crypto.createHash('sha512').update(hashStr).digest('hex');
        const formData = new URLSearchParams();
        formData.append('key', key); formData.append('txnid', transactionId); formData.append('amount', totalAmount.toFixed(2));
        formData.append('productinfo', productInfo); formData.append('firstname', firstName); formData.append('email', email);
        formData.append('phone', phone); formData.append('surl', REDIRECT_URLS.callback); formData.append('furl', REDIRECT_URLS.callback);
        formData.append('hash', hash);
        for (let i = 1; i <= 10; i++) formData.append(`udf${i}`, '');

        try {
            const resp = await fetch(initiateUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: formData.toString() });
            const res = await resp.json();
            if (res.status === 1) return { status: 'success', data: { paymentLink: `${payUrl}${res.data}` } };
            throw new Error(res.error_desc || "Easebuzz Error");
        } catch (e) { throw new Error(`Easebuzz Exception: ${e.message}`); }
    }

    if (data.paymentMethod === 'cashfree') {
        const { appId, secretKey, baseUrl } = PAYMENT_CONFIG.cashfree;
        try {
            const resp = await fetch(baseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-client-id': appId, 'x-client-secret': secretKey, 'x-api-version': '2023-08-01' },
                body: JSON.stringify({
                    order_id: transactionId, order_amount: totalAmount, order_currency: 'INR',
                    customer_details: { customer_id: userId.toString(), customer_email: email, customer_phone: phone, customer_name: `${firstName} ${lastName}`.trim() },
                    order_meta: { return_url: `${REDIRECT_URLS.callback}?order_id={order_id}` }
                })
            });
            const res = await resp.json();
            if (res.payment_session_id) return { status: 'success', data: { paymentLink: res.payment_link || `https://payments.cashfree.com/checkouts/v1/mobile-checkout/${res.payment_session_id}` } };
            throw new Error(res.message || "Cashfree Error");
        } catch (e) { throw e; }
    }

    if (data.paymentMethod === 'enkash') {
        const { key, secret, mid, baseUrl } = PAYMENT_CONFIG.enkash;
        if (!key || !secret || !mid) throw new Error('EnKash Config Missing');

        try {
            // 1. GET TOKEN
            const tResp = await fetch(`${baseUrl}/merchant/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'API-Key': key },
                body: JSON.stringify({ accessKey: key, secretKey: secret })
            });
            const tRes = await tResp.json();
            const token = tRes.token || tRes.accessToken;
            if (!token) throw new Error(tRes.message || "EnKash Token Failed");

            // --- REUSABLE ENKASH CALLER WITH FALLBACK ---
            const callEnKash = async (endpoint, payload) => {
                const makeRequest = async (authHeader) => {
                    return await fetch(`${baseUrl}${endpoint}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': authHeader,
                            'merchantAccessKey': key,
                            'API-Key': key,
                            'mid': mid,
                            'merchantId': mid
                        },
                        body: JSON.stringify(payload)
                    });
                };

                let resp = await makeRequest(`Bearer ${token}`);
                let json = await resp.json();

                // If Token Invalid, try without 'Bearer'
                if (json.response_code === 117 || json.payload === "Token is invalid.") {
                    resp = await makeRequest(token);
                    json = await resp.json();
                }
                return json;
            };

            // 2. CREATE ORDER
            const orderPayload = {
                // IDs (Using MID from Dashboard)
                mid: mid,
                merchantId: mid,
                orderId: transactionId,
                merchantOrderId: transactionId,
                // Amount
                amount: { value: totalAmount.toFixed(2), currency: "INR" },
                orderAmount: totalAmount.toFixed(2),
                currency: "INR",
                // URLs
                returnUrl: REDIRECT_URLS.frontendSuccess,
                notifyUrl: REDIRECT_URLS.callback,
                // Customer
                customerInfo: { firstName, lastName, email, phoneNumber: phone, customerIpAddress: ipAddress },
                customerName: `${firstName} ${lastName}`.trim(),
                customerEmail: email,
                customerPhone: phone,
                customerIpAddress: ipAddress,
                description: productInfo
            };

            const oRes = await callEnKash('/orders', orderPayload);
            if (!oRes.orderId && !oRes.order_id && oRes.resultCode !== 1) {
                throw new Error(`Order Failed: ${oRes.message || JSON.stringify(oRes)}`);
            }

            // 3. INITIATE PAYMENT
            const pRes = await callEnKash('/payments', {
                mid: mid, merchantId: mid,
                orderId: transactionId, merchantOrderId: transactionId,
                paymentMode: "HOSTED"
            });

            const link = pRes.redirectionUrl || pRes.redirection_url || pRes.payload?.redirectionUrl;
            if (link) return { status: 'success', data: { paymentLink: link } };
            throw new Error(`Initiation Failed: ${pRes.message || JSON.stringify(pRes)}`);

        } catch (e) {
            console.error("[EnKash] Ultimate Error:", e.message);
            throw new Error(e.message);
        }
    }

    throw new Error('Unsupported Method');
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
