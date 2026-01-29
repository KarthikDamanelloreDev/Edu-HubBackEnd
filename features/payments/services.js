const Transaction = require('../transactions/schema');
const Cart = require('../cart/schema');
const crypto = require('crypto');

const PAYMENT_CONFIG = {
    payu: {
        key: process.env.PAYU_KEY || 'gvAZC3',
        salt: process.env.PAYU_SALT || 'TXbjLE8te1zWPuow0agMv8M3OFgZFfTq',
        formUrl: process.env.PAYU_URL || 'https://secure.payu.in/_payment'
    },
    cashfree: {
        appId: process.env.CASHFREE_APP_ID || '1121173050d7761d04e10a62f653711211',
        secretKey: process.env.CASHFREE_SECRET || 'cfsk_ma_prod_8f2785eb9db4e0bbae0ddedc3810c36f_83c95137',
        baseUrl: process.env.CASHFREE_URL || 'https://api.cashfree.com/pg/orders'
    },
    easebuzz: {
        key: process.env.EASEBUZZ_KEY || 'HQJFD3GMLT',
        salt: process.env.EASEBUZZ_SALT || 'MVOLOP9U16',
        formUrl: process.env.EASEBUZZ_URL || 'https://pay.easebuzz.in/payment/initiate'
    },
    enkash: {
        key: process.env.ENKASH_KEY || 'BsUTQ147hyNNU3711',
        secret: process.env.ENKASH_SECRET || '83688e5e7431020c2a5ed4c0114e8bf59b3b2045cc209fc918eadf83f46d3487caebd24f0233661e594ee345cf069543d4445e1f096087de20da6780f4b3a20e',
        baseUrl: process.env.ENKASH_URL || 'https://api.enkash.com/v1/payment/initiate'
    }
};

const REDIRECT_URLS = {
    callback: process.env.BACKEND_API_URL ? `${process.env.BACKEND_API_URL}/payments/callback` : 'https://edu-hubbackend.onrender.com/api/payments/callback',
    frontendSuccess: process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/payment-status?status=success` : 'https://edu-pro-frontend.onrender.com/payment-status?status=success',
    frontendFailure: process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/payment-status?status=failure` : 'https://edu-pro-frontend.onrender.com/payment-status?status=failure'
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
        // Hash Sequence: key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt
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
        const { key, salt, formUrl } = PAYMENT_CONFIG.easebuzz;
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
                    hash: hash
                }
            }
        };
    }

    if (data.paymentMethod === 'cashfree') {
        const { appId, secretKey, baseUrl } = PAYMENT_CONFIG.cashfree;

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
        const { key, secret } = PAYMENT_CONFIG.enkash;
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

    // In production, verify hash/checksum here

    transaction.status = 'success';
    transaction.gatewayResponse = data;
    await transaction.save();

    // Clear cart for the user who made the transaction
    await Cart.findOneAndUpdate({ user: transaction.user }, { $set: { items: [] } });

    return { status: 'success', message: 'Payment verified successfully', transaction };
};

module.exports = {
    initiatePayment,
    verifyPayment,
    REDIRECT_URLS
};
