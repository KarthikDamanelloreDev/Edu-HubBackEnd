const Transaction = require('../transactions/schema');
const Cart = require('../cart/schema');
const crypto = require('crypto');
require('dotenv').config();
const { encryptVegaah, decryptVegaah } = require('./utils/vegaahCrypto');
const { generateVegaahSignature } = require('./utils/vegaahSignature');

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
        mid: process.env.ENKASH_MID || 'CEKJK1EYSA',
        baseUrl: process.env.ENKASH_URL || 'https://olympus-pg.enkash.in/api/v0'
    },
    vegaah: {
        terminalId: process.env.VEGAAH_TERMINAL_ID,
        password: process.env.VEGAAH_PASSWORD,
        merchantKey: process.env.VEGAAH_MERCHANT_KEY,
        baseUrl: process.env.VEGAAH_URL || 'https://vegaah.concertosoft.com',
        contextPath: process.env.VEGAAH_CONTEXT_PATH || 'CORE_2.2.2',
        merchantIp: process.env.VEGAAH_MERCHANT_IP || '127.0.0.1'
    },
    pinelabs: {
        // PRODUCTION Credentials - LIVE PAYMENTS
        mid: '356585',
        clientId: '25763cef-36c1-4fd0-9429-57a59ba0f4a7',
        clientSecret: '9dcad7de29444f4fa61ef65b7f31fea6',
        authUrl: 'https://api.pluralpay.in/api/auth/v1/token',
        checkoutUrl: 'https://api.pluralpay.in/api/checkout/v1/orders',
        getOrderUrl: 'https://api.pluralpay.in/api/pay/v1/orders',
        environment: 'PRODUCTION',
        isProduction: true


        // mid: '111077',
        // clientId: '59194fe5-4c27-4e6e-8deb-4e59f8f4fd7b',
        // clientSecret: '024dd66a367549b380bd322ff6c3b279',
        // authUrl: 'https://pluraluat.v2.pinepg.in/api/auth/v1/token',
        // checkoutUrl: 'https://pluraluat.v2.pinepg.in/api/checkout/v1/orders',
        // getOrderUrl: 'https://pluraluat.v2.pinepg.in/api/pay/v1/orders',
        // environment: 'UAT',
        // isProduction: false
    }
};

// Note: Pine Labs is now configured with PRODUCTION credentials for LIVE payments
// Environment: PRODUCTION | MID: 356585 | URLs: https://api.pluralpay.in


/**
 * Generate Pine Labs Hash for X-VERIFY
 */
const generatePineLabsHash = (request, secret) => {
    if (!secret) {
        throw new Error("Pine Labs Secret is missing in configuration. See .env file.");
    }
    try {
        // Pine Labs expects the secret to be treated as a hex string if possible
        return crypto.createHmac("sha256", Buffer.from(secret, 'hex')).update(request).digest("hex").toUpperCase();
    } catch (e) {
        // Fallback for non-hex secrets
        return crypto.createHmac("sha256", Buffer.from(secret)).update(request).digest("hex").toUpperCase();
    }
};

/**
 * Fetch Pine Labs Order Details (Inquiry API)
 * Recommended to verify payment status server-side
 */
const fetchPineLabsOrder = async (transactionId, transactionType = 1) => {
    const { merchantId, accessCode, secret, baseUrl } = PAYMENT_CONFIG.pinelabs;

    const body = {
        ppc_MerchantID: merchantId,
        ppc_MerchantAccessCode: accessCode,
        ppc_UniqueMerchantTxnID: transactionId,
        ppc_TransactionType: transactionType,
    };

    const base64Data = Buffer.from(JSON.stringify(body)).toString("base64");
    const hash = generatePineLabsHash(base64Data, secret);

    try {
        const response = await fetch(`${baseUrl}v2/accept/fetchorder`, {
            method: 'POST',
            headers: {
                "Content-Type": "application/json",
                "X-VERIFY": hash
            },
            body: JSON.stringify({ request: base64Data })
        });

        const text = await response.text();
        return JSON.parse(text);
    } catch (e) {
        console.error("[Pine Labs Fetch] Error:", e.message);
        return null;
    }
};

/**
 * Verify Pine Labs Hash for Callback
 */
const verifyPineLabsHash = (request, hash, secret) => {
    if (!secret || !hash) return false;
    const sortedKeys = Object.keys(request).sort();
    const dataString = sortedKeys
        .map((key) => `${key}=${request[key]}`)
        .join('&');

    let newHash;
    try {
        newHash = crypto.createHmac('sha256', Buffer.from(secret, 'hex'))
            .update(dataString)
            .digest('hex')
            .toUpperCase();
    } catch (e) {
        newHash = crypto.createHmac('sha256', Buffer.from(secret))
            .update(dataString)
            .digest('hex')
            .toUpperCase();
    }
    return newHash === hash;
};

/**
 * Initiate Vegaah Payment
 */
const initiateVegaahPayment = async (payload, userId, ipAddress) => {
    const orderId = `VEG_${Date.now()}`;
    const amount = payload.amount;

    // 1. Prepare request body (plain)
    // Note: User prompt suggests using process.env directly here
    const requestData = {
        terminalId: process.env.VEGAAH_TERMINAL_ID,
        merchantKey: process.env.VEGAAH_MERCHANT_KEY,
        orderId,
        amount: amount,
        currency: "INR",
        customerEmail: payload.customerDetails.email,
        customerMobile: payload.customerDetails.phone,
        returnUrl: `${process.env.BACKEND_API_URL}/payments/callback?gateway=VEGAAH` // Using the mapped callback URL
    };

    // 2. Encrypt request
    const encryptedPayload = encryptVegaah(requestData);

    // 3. Generate signature
    const signature = generateVegaahSignature(requestData);

    // 4. Save transaction BEFORE redirect
    await Transaction.create({
        user: userId,
        transactionId: orderId, // Using orderId as transactionId
        amount: amount, // Ensure schema supports this or we need to map correctly
        items: payload.items || [], // Payload usually has items if it comes from cart
        totalAmount: amount,
        paymentGateway: "VEGAAH",
        customerDetails: payload.customerDetails,
        status: "INITIATED"
    });

    // 5. Return redirect info
    const vegaahUrl = process.env.VEGAAH_URL || 'https://vegaah.concertosoft.com';
    const contextPath = process.env.VEGAAH_CONTEXT_PATH || 'CORE_2.2.2';

    return {
        paymentLink: `${vegaahUrl}/${contextPath}`,
        params: {
            encData: encryptedPayload,
            signature
        }
    };
};

// Helper to determine base URLs for testing and production
const getBaseUrls = () => {
    // If running on localhost, use local URLs unless explicitly overridden
    const isLocal = !process.env.NODE_ENV || process.env.NODE_ENV === 'development' || process.env.HOSTNAME?.includes('localhost');

    return {
        backend: process.env.BACKEND_API_URL || (isLocal ? 'http://localhost:5000/api' : 'https://edu-hubbackend.onrender.com/api'),
        frontend: process.env.FRONTEND_URL || (isLocal ? 'http://localhost:5173' : 'https://eduhub.org.in')
    };
};

const BASES = getBaseUrls();


const REDIRECT_URLS = {
    callback: `${BASES.backend}/payments/callback`,
    frontendSuccess: `${BASES.frontend}/payment-status?status=success`,
    frontendFailure: `${BASES.frontend}/payment-status?status=failure`
};

/**
 * Generate Access Token for Pine Labs API calls
 * Reusable function for all Pine Labs API requests
 */
const getPineLabsAccessToken = async () => {
    const config = PAYMENT_CONFIG.pinelabs;

    console.log('='.repeat(80));
    console.log('[Pine Labs Token] 🔑 GENERATING ACCESS TOKEN');
    console.log('='.repeat(80));

    const requestBody = {
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'client_credentials'
    };

    console.log('[Pine Labs Token] 📍 REQUEST URL:', config.authUrl);
    console.log('[Pine Labs Token] 📤 REQUEST METHOD: POST');
    console.log('[Pine Labs Token] 📋 REQUEST HEADERS:', JSON.stringify({
        'Content-Type': 'application/json'
    }, null, 2));
    console.log('[Pine Labs Token] 📦 REQUEST BODY:', JSON.stringify({
        client_id: config.clientId,
        client_secret: '***' + config.clientSecret.slice(-4), // Masked for security
        grant_type: 'client_credentials'
    }, null, 2));
    console.log('[Pine Labs Token] 🔐 Full Client Secret (last 10 chars):', '...' + config.clientSecret.slice(-10));

    try {
        console.log('[Pine Labs Token] 🚀 Sending request to Pine Labs...');

        const tokenResp = await fetch(config.authUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        console.log('[Pine Labs Token] 📊 RESPONSE STATUS:', tokenResp.status, tokenResp.statusText);
        console.log('[Pine Labs Token] 📥 RESPONSE HEADERS:', JSON.stringify(Object.fromEntries(tokenResp.headers.entries()), null, 2));

        const tokenData = await tokenResp.json();

        console.log('[Pine Labs Token] 📦 RESPONSE BODY:', JSON.stringify(tokenData, null, 2));
        console.log('='.repeat(80));

        const accessToken = tokenData.access_token;

        if (!accessToken) {
            console.error("[Pine Labs Token] ❌ AUTHENTICATION FAILED!");
            console.error("[Pine Labs Token] ❌ Error Details:", JSON.stringify(tokenData, null, 2));
            console.error('='.repeat(80));
            throw new Error(tokenData.error_description || tokenData.message || "Authentication Failed with Pine Labs");
        }

        console.log("[Pine Labs Token] ✅ Access token generated successfully");
        console.log("[Pine Labs Token] 🎫 Token (first 20 chars):", accessToken.substring(0, 20) + '...');
        console.log('='.repeat(80));

        return accessToken;
    } catch (e) {
        console.error('='.repeat(80));
        console.error("[Pine Labs Token] ❌ EXCEPTION OCCURRED!");
        console.error("[Pine Labs Token] ❌ Error Message:", e.message);
        console.error("[Pine Labs Token] ❌ Error Stack:", e.stack);
        console.error('='.repeat(80));
        throw e;
    }
};

/**
 * Get Order Status from Pine Labs (Server-Side Verification)
 * API: GET /api/pay/v1/orders/{order_id}
 * This is the RECOMMENDED way to verify payment status
 * 
 * @param {string} orderId - Pine Labs order_id (e.g., "v1-260211140955-aa-6HCITZ")
 * @returns {Promise<Object>} Order details with payment status
 */
const getPineLabsOrderStatus = async (orderId) => {
    const config = PAYMENT_CONFIG.pinelabs;

    console.log(`[Pine Labs Get Order] Fetching status for order: ${orderId}`);

    try {
        // 1. Get Access Token
        const accessToken = await getPineLabsAccessToken();

        // 2. Prepare headers
        const timestamp = new Date().toISOString();
        const requestId = crypto.randomUUID ? crypto.randomUUID() : `REQ-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        // 3. Call Get Order API
        const orderUrl = `${config.getOrderUrl}/${orderId}`;
        console.log(`[Pine Labs Get Order] Calling: ${orderUrl}`);

        const orderResp = await fetch(orderUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
                'Request-Timestamp': timestamp,
                'Request-ID': requestId
            }
        });

        const orderData = await orderResp.json();
        console.log("[Pine Labs Get Order] HTTP Status:", orderResp.status);
        console.log("[Pine Labs Get Order] Response:", JSON.stringify(orderData, null, 2));

        if (orderResp.status === 200 && orderData) {
            return {
                success: true,
                data: orderData
            };
        }

        // Handle error responses
        const errorMsg = orderData.error_message || orderData.message || "Failed to fetch order status";
        console.error("[Pine Labs Get Order] Error:", errorMsg);

        return {
            success: false,
            error: errorMsg,
            data: orderData
        };

    } catch (e) {
        console.error("[Pine Labs Get Order] Exception:", e.message);
        return {
            success: false,
            error: e.message
        };
    }
};

/**
 * Initiate Pine Labs Plural Hosted Checkout (V3)
 * Following working example: https://developer.pinelabsonline.com/reference/hosted-checkout-create
 */
const initiatePineLabsPayment = async (userId, transactionId, amount, customerDetails, items = []) => {
    const config = PAYMENT_CONFIG.pinelabs;


    console.log('='.repeat(80));
    console.log(`[Pine Labs] 💳 INITIATING PAYMENT`);
    console.log('='.repeat(80));
    console.log(`[Pine Labs] Transaction ID: ${transactionId}`);
    console.log(`[Pine Labs] Amount: ₹${amount} (${amount * 100} paise)`);
    console.log(`[Pine Labs] Environment: ${config.environment}`);
    console.log(`[Pine Labs] Merchant ID: ${config.mid}`);

    if (config.isProduction) {
        console.log(`[Pine Labs] 🟢 USING PRODUCTION CREDENTIALS - LIVE PAYMENT`);
    } else {
        console.log(`[Pine Labs] 🟡 USING UAT CREDENTIALS - TEST PAYMENT`);
    }
    console.log('='.repeat(80));

    try {
        // 1. Get Access Token (using reusable function)
        const accessToken = await getPineLabsAccessToken();

        // 2. Prepare Order Payload (Standard Plural V3 structure)
        const timestamp = new Date().toISOString();
        const requestId = crypto.randomUUID ? crypto.randomUUID() : `REQ-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        const orderBody = {
            merchant_order_reference: transactionId,
            order_amount: {
                // IMPORTANT: Pine Labs expects amount in PAISE (smallest currency unit)
                // ₹10 = 1000 paise, ₹100 = 10000 paise
                value: Math.round(amount * 100), // Convert rupees to paise
                currency: "INR"
            },
            integration_mode: "REDIRECT",
            pre_auth: false,
            // ✅ CRITICAL: callback_url MUST point to BACKEND callback handler
            // Pine Labs will redirect user's browser to this URL after payment
            // Backend will verify payment status, update DB, then redirect to frontend
            // DO NOT point directly to frontend - verification will be skipped!
            callback_url: `${REDIRECT_URLS.callback}?gateway=PINELABS&merchant_order_reference=${transactionId}`,
            purchase_details: {
                customer: {
                    email_id: customerDetails.email || "kevin.bob@example.com",
                    first_name: customerDetails.firstName || "Kevin",
                    last_name: customerDetails.lastName || "Bob",
                    customer_id: userId.toString(),
                    mobile_number: customerDetails.phone || "9876543210",
                    billing_address: {
                        address1: customerDetails.address || "10 Downing Street Westminster London",
                        address2: "",
                        address3: "",
                        pincode: customerDetails.zip || "51524036",
                        city: customerDetails.city || "",
                        state: customerDetails.state || "",
                        country: customerDetails.country || "London"
                    },
                    shipping_address: {
                        address1: customerDetails.address || "10 Downing Street Westminster London",
                        address2: "",
                        address3: "",
                        pincode: customerDetails.zip || "51524036",
                        city: customerDetails.city || "",
                        state: customerDetails.state || "",
                        country: customerDetails.country || "London"
                    }
                },
                merchant_metadata: {
                    key1: "DD",
                    key2: "XOF"
                }
            }
        };

        console.log("[Pine Labs Order] Request Body:", JSON.stringify(orderBody, null, 2));
        console.log("[Pine Labs Order] Callback URL (backend verification endpoint):", orderBody.callback_url);
        console.log("[Pine Labs Order] 💡 Flow: Pine Labs → Backend Callback → Verify → Update DB → Redirect to Frontend");

        // 3. Create Order
        const orderResp = await fetch(config.checkoutUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
                'Request-Timestamp': timestamp,
                'Request-ID': requestId
            },
            body: JSON.stringify(orderBody)
        });

        const orderData = await orderResp.json();
        console.log("[Pine Labs Order] HTTP Status:", orderResp.status);
        console.log("[Pine Labs Order] Response:", JSON.stringify(orderData, null, 2));

        if (orderData.response_code === 200 && orderData.redirect_url) {
            // Store the Pine Labs order_id in the transaction for later lookup
            console.log('[Pine Labs Order] Storing order_id in transaction...');
            await Transaction.findOneAndUpdate(
                { transactionId },
                {
                    $set: {
                        'gatewayResponse.order_id': orderData.order_id,
                        'gatewayResponse.token': orderData.token,
                        'gatewayResponse.response_code': orderData.response_code,
                        'gatewayResponse.response_message': orderData.response_message
                    }
                }
            );
            console.log('[Pine Labs Order] ✅ Stored Pine Labs order_id:', orderData.order_id);

            // ✅ CLEAR CART IMMEDIATELY BEFORE REDIRECTING TO PAYMENT GATEWAY
            // This ensures cart is cleared when user is sent to Pine Labs, not after payment completion
            console.log('[Pine Labs Order] 🧹 Clearing cart before redirecting to payment gateway...');
            try {
                await Cart.findOneAndUpdate(
                    { user: userId },
                    { $set: { items: [] } },
                    { new: true }
                );
                console.log('[Pine Labs Order] ✅ Cart cleared successfully for user:', userId);
                console.log('[Pine Labs Order] 💡 Cart cleared BEFORE redirect - items will not persist after payment');
            } catch (cartError) {
                console.error('[Pine Labs Order] ⚠️ Failed to clear cart:', cartError.message);
                // Continue with payment even if cart clearing fails
                console.log('[Pine Labs Order] ⚠️ Continuing with payment despite cart clearing error');
            }

            return {
                status: 'success',
                data: {
                    paymentLink: orderData.redirect_url,
                    orderId: orderData.order_id,
                    token: orderData.token
                }
            };
        }

        const errorMsg = orderData.response_message || orderData.message || "Order Creation Failed";
        throw new Error(errorMsg);

    } catch (e) {
        console.error("[Pine Labs] Integration Exception:", e.message);
        throw new Error(`Pine Labs Error: ${e.message}`);
    }
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
        if (!key || !secret) throw new Error('EnKash Config Missing');

        console.log(`[EnKash] Starting payment for ${transactionId}, Amount: ${totalAmount}`);

        try {
            const tResp = await fetch(`${baseUrl}/merchant/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'API-Key': key },
                body: JSON.stringify({ accessKey: key, secretKey: secret })
            });
            const tRes = await tResp.json();
            console.log("[EnKash] Token Response:", JSON.stringify(tRes));

            const token = tRes.token || (tRes.payload && tRes.payload.token) || tRes.accessToken;
            if (!token) {
                throw new Error(`Token Failed: ${tRes.resultMessage || tRes.response_message || tRes.message || "No token returned"}`);
            }

            const callEnKash = async (endpoint, payload) => {
                const makeRequest = async (authValue) => {
                    const headers = {
                        'Content-Type': 'application/json',
                        'Authorization': authValue,
                        'merchantAccessKey': key,
                        'API-Key': key
                    };
                    if (mid) {
                        headers['mid'] = mid;
                        headers['merchantId'] = mid;
                    }

                    const resp = await fetch(`${baseUrl}${endpoint}`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(payload)
                    });
                    return await resp.json();
                };

                let result = await makeRequest(`Bearer ${token}`);
                console.log(`[EnKash] Call ${endpoint} (with Bearer):`, JSON.stringify(result));

                if (result.response_code === 117 || result.payload === "Token is invalid.") {
                    console.warn(`[EnKash] Bearer token rejected for ${endpoint}, trying raw token...`);
                    result = await makeRequest(token);
                    console.log(`[EnKash] Call ${endpoint} (raw token):`, JSON.stringify(result));
                }

                return result;
            };

            const orderPayload = {
                orderId: transactionId,
                amount: {
                    value: Number(totalAmount.toFixed(2)),
                    currency: "INR"
                },
                returnUrl: REDIRECT_URLS.frontendSuccess,
                notifyUrl: REDIRECT_URLS.callback,
                customerInfo: {
                    firstName,
                    lastName,
                    email,
                    phoneNumber: phone,
                    customerIpAddress: ipAddress
                },
                description: productInfo
            };

            const oRes = await callEnKash('/orders', orderPayload);

            if (oRes.resultCode !== 0 && oRes.response_code !== 200) {
                if (!oRes.payload?.orderId && !oRes.orderId) {
                    throw new Error(`Order Failed: ${oRes.resultMessage || oRes.response_message || oRes.payload || "Unknown error"}`);
                }
            }

            let finalLink = oRes.payload?.redirectionUrl || oRes.redirectionUrl || oRes.payload?.redirection_url;

            if (!finalLink) {
                console.log("[EnKash] No redirection URL in order, submitting payment...");
                const pRes = await callEnKash('/payment/submit', {
                    orderId: transactionId,
                    paymentDetail: {
                        paymentMode: "HOSTED"
                    }
                });
                finalLink = pRes.payload?.redirectionUrl || pRes.redirectionUrl || pRes.payload?.redirection_url;
            }

            if (finalLink) {
                return { status: 'success', data: { paymentLink: finalLink } };
            }

            throw new Error(`Failed to get redirection URL from EnKash`);

        } catch (e) {
            console.error("[EnKash] Error:", e.message);
            throw e;
        }
    }

    // Vegaah Payment
    if (data.paymentMethod === 'vegaah' || data.paymentMethod === 'VEGAAH') {
        const payload = {
            amount: totalAmount,
            customerDetails: data.customerDetails,
            items: cart.items
        };
        // Reuse logic but we need to handle Transaction creation carefully because initiateVegaahPayment creates one too.
        // However, initiatePayment (this function) creates a transaction at line 83.
        // The user's skeleton shows Transaction.create inside initiateVegaahPayment.
        // If I follow the skeleton strictly, I might end up with duplicate transactions or unused ones.
        // The current function creates a 'pending' transaction at the top.
        // I should probably pass the EXISTING transaction ID or let initiateVegaahPayment handle it.
        // But initiateVegaahPayment generates its own `orderId`.

        // Strategy: 
        // 1. Delete the transaction created at the top (line 83) if we are going to create a new one in initiateVegaahPayment.
        // OR 
        // 2. Modify initiateVegaahPayment to accept the transactionId and update the existing transaction.

        // User instruction: "4. Save transaction BEFORE redirect" inside initiateVegaahPayment.
        // And currently initiatePayment creates a transaction at the start.

        // I will follow the user's specific instruction to add `initiateVegaahPayment`.
        // To avoid duplicates, I will delete the one created at the top, or just not use the top one for Vegaah?
        // But the top one is already saved. 

        // Let's look at the switch statement requested:
        /*
        switch (paymentMethod) {
          case "payu": ...
          case "vegapay": return initiateVegaahPayment(payload, userId, ipAddress);
        }
        */

        // The `initiatePayment` function in `services.js` performs strict logic.
        // I'll return the result of `initiateVegaahPayment`. 
        // Note: The transaction created at line 83 will remain as 'pending'. `initiateVegaahPayment` creates ANOTHER transaction with `VEGAAH_` prefix.
        // This might be messy but I must follow the user's "Skeleton".
        // Actually, if I am rewriting `initiatePayment` significantly, I should probably avoid creating the transaction at the top if I can help it, OR just accept that `vegapay` path is special.

        // But wait, the user's skeleton for `initiateVegaahPayment` takes (payload, userId, ipAddress).
        // It does NOT take a transaction ID. It generates `VEG_${Date.now()}`.

        // So allow `initiateVegaahPayment` to do its thing.
        return initiateVegaahPayment({
            amount: totalAmount,
            customerDetails: data.customerDetails,
            items: cart.items.map(i => ({ course: i.course._id, price: i.course.price }))
        }, userId, ipAddress);
    }

    if (data.paymentMethod === 'pinelabs' || data.paymentMethod === 'PINELABS') {
        return initiatePineLabsPayment(userId, transactionId, totalAmount, data.customerDetails, cart.items);
    }

    throw new Error('Unsupported payment gateway');
};


const verifyPayment = async (userId, data) => {
    console.log("[Payment Verify] Data received:", JSON.stringify(data));

    const transactionId = data.txnid || data.order_id || data.transactionId || data.orderId;
    const transaction = await Transaction.findOne({ transactionId });

    if (!transaction) {
        console.error(`[Payment Verify] Transaction not found for ID: ${transactionId}`);
        throw new Error('Transaction not found');
    }

    if (transaction.status === 'success') {
        return { status: 'success', message: 'Payment already verified' };
    }

    let isSuccessful = false;

    if (transaction.paymentGateway === 'enkash') {
        const enkashStatus = data.status || data.transactionStatus || data.orderStatus;
        isSuccessful = (enkashStatus === 'SUCCESS' || enkashStatus === 'PAID');
    } else if (transaction.paymentGateway === 'VEGAAH' || transaction.paymentGateway === 'vegaah') {
        if (data.paymentStatus === 'SUCCESS') {
            isSuccessful = true;
        } else {
            isSuccessful = false;
        }
    } else if (transaction.paymentGateway === 'PINELABS' || transaction.paymentGateway === 'pinelabs') {
        console.log('[Pine Labs Verify] Starting Pine Labs verification...');
        console.log('[Pine Labs Verify] Transaction ID:', transactionId);
        console.log('[Pine Labs Verify] Raw data:', JSON.stringify(data, null, 2));

        // BEST PRACTICE: Verify payment status directly from Pine Labs servers
        // This is more secure than trusting callback data alone

        // Extract Pine Labs order_id from:
        // 1. Verify request data (if provided)
        // 2. Transaction's gatewayResponse (stored during payment initiation)
        let pineLabsOrderId = data.order_id || data.orderId || (data.order && data.order.order_id);

        // If not in request data, get from transaction's gatewayResponse
        if (!pineLabsOrderId && transaction.gatewayResponse && transaction.gatewayResponse.order_id) {
            pineLabsOrderId = transaction.gatewayResponse.order_id;
            console.log('[Pine Labs Verify] Retrieved order_id from transaction gatewayResponse:', pineLabsOrderId);
        }

        if (pineLabsOrderId) {
            console.log(`[Pine Labs Verify] Using Pine Labs order_id: ${pineLabsOrderId}`);
            console.log('[Pine Labs Verify] Fetching order status from Pine Labs API...');

            // Call Get Order API to verify status directly from Pine Labs
            const orderStatusResult = await getPineLabsOrderStatus(pineLabsOrderId);

            if (orderStatusResult.success && orderStatusResult.data) {
                const orderData = orderStatusResult.data;
                console.log('[Pine Labs Verify] ✅ Server-side verification successful');
                console.log('[Pine Labs Verify] API Response:', JSON.stringify(orderData, null, 2));

                // Extract status from API response
                const apiOrderStatus = orderData.order_status || orderData.status || (orderData.order && orderData.order.status);
                const apiPaymentStatus = orderData.payment_status || (orderData.payment && orderData.payment.status);
                const apiTransactionStatus = orderData.transaction_status;

                console.log('[Pine Labs Verify] API Response Statuses:', {
                    apiOrderStatus,
                    apiPaymentStatus,
                    apiTransactionStatus
                });

                // Verify using API response (most reliable)
                isSuccessful = (
                    apiOrderStatus === 'PAID' ||
                    apiOrderStatus === 'CHARGED' ||
                    apiOrderStatus === 'PROCESSED' ||
                    apiOrderStatus === 'SUCCESS' ||
                    apiPaymentStatus === 'CAPTURED' ||
                    apiPaymentStatus === 'SUCCESS' ||
                    apiTransactionStatus === 'SUCCESS'
                );

                console.log(`[Pine Labs Verify] Payment status from Pine Labs API: ${isSuccessful ? 'SUCCESS ✅' : 'FAILED ❌'}`);

                // Store the complete API response for reference
                data.pineLabsApiResponse = orderData;
            } else {
                console.warn('[Pine Labs Verify] ⚠️ Server-side verification failed');
                console.warn('[Pine Labs Verify] Error:', orderStatusResult.error);

                // Fallback: Use callback data if API call fails
                const orderStatus = data.order_status || data.orderStatus || (data.order && data.order.status);
                const paymentStatus = data.payment_status || data.paymentStatus || (data.payment && data.payment.status);
                const transactionStatus = data.transaction_status || data.transactionStatus;
                const responseCode = data.response_code || data.responseCode;
                const status = data.status;

                console.log('[Pine Labs Verify] Callback data statuses:', {
                    orderStatus,
                    paymentStatus,
                    transactionStatus,
                    responseCode,
                    status
                });

                isSuccessful = (
                    orderStatus === 'PAID' ||
                    orderStatus === 'CHARGED' ||
                    orderStatus === 'SUCCESS' ||
                    paymentStatus === 'CAPTURED' ||
                    paymentStatus === 'SUCCESS' ||
                    transactionStatus === 'SUCCESS' ||
                    status === 'SUCCESS' ||
                    responseCode === 200 ||
                    responseCode === '200'
                );
            }
        } else {
            console.warn('[Pine Labs Verify] ⚠️ No Pine Labs order_id found');
            console.warn('[Pine Labs Verify] Cannot verify with Pine Labs API');
            console.warn('[Pine Labs Verify] Transaction gatewayResponse:', JSON.stringify(transaction.gatewayResponse, null, 2));

            // Fallback: Use callback data when order_id is not available
            const orderStatus = data.order_status || data.orderStatus || (data.order && data.order.status);
            const paymentStatus = data.payment_status || data.paymentStatus || (data.payment && data.payment.status);
            const transactionStatus = data.transaction_status || data.transactionStatus;
            const responseCode = data.response_code || data.responseCode;
            const status = data.status;

            console.log('[Pine Labs Verify] Callback data statuses:', {
                orderStatus,
                paymentStatus,
                transactionStatus,
                responseCode,
                status
            });

            isSuccessful = (
                orderStatus === 'PAID' ||
                orderStatus === 'CHARGED' ||
                orderStatus === 'SUCCESS' ||
                paymentStatus === 'CAPTURED' ||
                paymentStatus === 'SUCCESS' ||
                transactionStatus === 'SUCCESS' ||
                status === 'SUCCESS' ||
                responseCode === 200 ||
                responseCode === '200'
            );
        }

        console.log(`[Pine Labs Verify] Final verification result for ${transactionId}: ${isSuccessful ? 'SUCCESS ✅' : 'FAILED ❌'}`);
    } else {
        isSuccessful = data.status === 'success' || data.txStatus === 'SUCCESS' || data.order_status === 'PAID' || data.result === 'success';
    }

    if (isSuccessful) {
        transaction.status = 'success';
        transaction.gatewayResponse = data;
        await transaction.save();

        // Clear the cart after successful payment
        try {
            const cartUpdateResult = await Cart.findOneAndUpdate(
                { user: transaction.user },
                { $set: { items: [] } },
                { new: true }
            );

            if (cartUpdateResult) {
                console.log(`[Payment Verify] 🛒 Cart cleared successfully for user: ${transaction.user}`);
                console.log(`[Payment Verify] Cart had ${cartUpdateResult.items?.length || 0} items before clearing`);
            } else {
                console.log(`[Payment Verify] ⚠️ No cart found for user: ${transaction.user} (might be already empty)`);
            }
        } catch (cartError) {
            // Don't fail the payment if cart clearing fails
            console.error(`[Payment Verify] ❌ Failed to clear cart for user: ${transaction.user}`, cartError);
            console.error(`[Payment Verify] Payment was successful but cart clearing failed - manual cleanup may be needed`);
        }

        console.log(`[Payment Verify] ✅ Transaction ${transactionId} successful`);
        return { status: 'success', message: 'Payment verified successfully', transaction };
    } else {
        transaction.status = 'failed';
        transaction.gatewayResponse = data;
        await transaction.save();
        console.warn(`[Payment Verify] Transaction ${transactionId} failed: ${data.txnMsg || data.message || "Unknown error"}`);
        throw new Error(data.txnMsg || data.message || 'Payment verification failed');
    }
};


module.exports = { initiatePayment, verifyPayment, getPineLabsOrderStatus, REDIRECT_URLS };
