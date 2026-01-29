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
        env: process.env.EASEBUZZ_ENV || 'prod', // Default to prod
        initiateUrl: (process.env.EASEBUZZ_ENV === 'prod') ? 'https://pay.easebuzz.in/payment/initiateLink' : 'https://testpay.easebuzz.in/payment/initiateLink',
        payUrl: (process.env.EASEBUZZ_ENV === 'prod') ? 'https://pay.easebuzz.in/pay/' : 'https://testpay.easebuzz.in/pay/'
    },
    enkash: {
        key: process.env.ENKASH_KEY,
        secret: process.env.ENKASH_SECRET,
        baseUrl: process.env.ENKASH_URL || 'https://api.enkash.com/v1/payment/initiate'
    }
};

const REDIRECT_URLS = {
    callback: process.env.BACKEND_API_URL ? `${process.env.BACKEND_API_URL}/payments/callback` : 'https://edu-hubbackend.onrender.com/api/payments/callback',
    frontendSuccess: process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/payment-status?status=success` : 'https://eduhub.org.in/payment-status?status=success',
    frontendFailure: process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/payment-status?status=failure` : 'https://eduhub.org.in/payment-status?status=failure'
};

const initiatePayment = async (userId, data) => {
    // 1. Get User Cart to verify amount and items
    const cart = await Cart.findOne({ user: userId }).populate('items.course');
    if (!cart || cart.items.length === 0) {
        throw new Error('Cart is empty');
    }

    const totalAmount = cart.items.reduce((sum, item) => sum + (item.course?.price || 0), 0);

    // 2. Create Transaction Record
    const transactionId = `TXN${Date.now()}${Math.floor(Math.random() * 1000)}`;

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
    const email = data.customerDetails.email;
    const phone = data.customerDetails.phone;

    // 3. Gateway Specific Logic
    if (data.paymentMethod === 'payu') {
        const { key, salt, formUrl } = PAYMENT_CONFIG.payu;
        if (!key || !salt) throw new Error('PayU configuration missing');
        const hashString = `${key}|${transactionId}|${totalAmount.toFixed(2)}|${productInfo}|${firstName}|${email}|||||||||||${salt}`;
        const hash = crypto.createHash('sha512').update(hashString).digest('hex');

        return {
            status: 'success',
            data: {
                formUrl,
                params: {
                    key,
                    txnid: transactionId,
                    amount: totalAmount.toFixed(2),
                    productinfo: productInfo,
                    firstname: firstName,
                    email: email,
                    phone: phone,
                    surl: REDIRECT_URLS.callback,
                    furl: REDIRECT_URLS.callback,
                    hash: hash,
                    service_provider: 'payu_paisa'
                }
            }
        };
    }

    if (data.paymentMethod === 'easebuzz') {
        const { key, salt, initiateUrl, payUrl } = PAYMENT_CONFIG.easebuzz;
        if (!key || !salt) throw new Error('EaseBuzz configuration missing');

        // Exact Hash Sequence from Easebuzz Node.js Library:
        // key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5|udf6|udf7|udf8|udf9|udf10|salt
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
        // Add empty UDFs to be explicit if needed by some older versions of the API
        for (let i = 1; i <= 10; i++) formData.append(`udf${i}`, '');

        try {
            console.log(`[Easebuzz] Initiating to: ${initiateUrl}`);
            const response = await fetch(initiateUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                body: formData.toString()
            });

            const result = await response.json();

            if (result.status === 1 && result.data) {
                // Easebuzz returns an access_key in result.data
                const accessKey = result.data;
                console.log(`[Easebuzz] Successfully obtained access_key: ${accessKey}`);
                return {
                    status: 'success',
                    data: {
                        paymentLink: `${payUrl}${accessKey}`
                    }
                };
            } else {
                console.error("[Easebuzz] API Error Result:", result);
                throw new Error(result.error_desc || result.data || result.message || "Failed to obtain payment access key from Easebuzz.");
            }
        } catch (error) {
            console.error("[Easebuzz] Request Exception:", error);
            throw new Error(`Easebuzz Error: ${error.message}`);
        }
    }

    if (data.paymentMethod === 'cashfree') {
        const { appId, secretKey, baseUrl } = PAYMENT_CONFIG.cashfree;
        if (!appId || !secretKey) throw new Error('Cashfree configuration missing');

        try {
            const response = await fetch(baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-client-id': appId,
                    'x-client-secret': secretKey,
                    'x-api-version': '2023-08-01'
                },
                body: JSON.stringify({
                    order_id: transactionId,
                    order_amount: totalAmount,
                    order_currency: 'INR',
                    customer_details: {
                        customer_id: userId.toString(),
                        customer_email: email,
                        customer_phone: phone,
                        customer_name: `${firstName} ${data.customerDetails.lastName || ''}`.trim()
                    },
                    order_meta: {
                        return_url: `${REDIRECT_URLS.callback}?order_id={order_id}`
                    }
                })
            });

            const result = await response.json();

            if (result.payment_session_id) {
                return {
                    status: 'success',
                    data: {
                        paymentLink: result.payment_link || `https://payments.cashfree.com/checkouts/v1/mobile-checkout/${result.payment_session_id}`
                    }
                };
            } else {
                console.error("Cashfree Error:", result);
                throw new Error(result.message || "Failed to initiate Cashfree payment");
            }
        } catch (error) {
            console.error("Cashfree API Error:", error);
            throw error;
        }
    }

    if (data.paymentMethod === 'enkash') {
        const { key } = PAYMENT_CONFIG.enkash;
        if (!key) throw new Error('EnKash configuration missing');
        return {
            status: 'success',
            data: {
                paymentLink: `https://checkout.enkash.com/pay?key=${key}&order_id=${transactionId}&amount=${totalAmount}&email=${email}`
            }
        };
    }

    throw new Error('Unsupported payment method');
};

const verifyPayment = async (userId, data) => {
    const transactionId = data.txnid || data.order_id || data.transactionId;
    const transaction = await Transaction.findOne({ transactionId });
    if (!transaction) {
        throw new Error('Transaction not found');
    }

    if (transaction.status === 'success') {
        return { status: 'success', message: 'Payment already verified' };
    }

    transaction.status = 'success';
    transaction.gatewayResponse = data;
    await transaction.save();

    await Cart.findOneAndUpdate({ user: transaction.user }, { $set: { items: [] } });

    return { status: 'success', message: 'Payment verified successfully', transaction };
};

module.exports = {
    initiatePayment,
    verifyPayment,
    REDIRECT_URLS
};
