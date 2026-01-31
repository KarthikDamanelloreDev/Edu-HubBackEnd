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
        mid: process.env.ENKASH_MID || 'CEKJK1EYSA',
        baseUrl: process.env.ENKASH_URL || 'https://olympus-pg.enkash.in/api/v0'
    },
    vegapay: {
        terminalId: process.env.VEGAAH_TERMINAL_ID,
        password: process.env.VEGAAH_PASSWORD,
        merchantKey: process.env.VEGAAH_MERCHANT_KEY,
        baseUrl: process.env.VEGAAH_URL || 'https://vegaah.concertosoft.com',
        contextPath: process.env.VEGAAH_CONTEXT_PATH || 'CORE_2.2.2',
        merchantIp: process.env.VEGAAH_MERCHANT_IP || '127.0.0.1'
    }
};

/**
 * Vegaah Signature Generator
 * Format: trackId|terminalId|password|merchantkey|amount|currency
 */
const generateVegaahHash = (params) => {
    const { trackId, terminalId, password, merchantKey, amount, currency } = params;
    const hashStr = `${trackId}|${terminalId}|${password}|${merchantKey}|${amount}|${currency}`;
    console.log(`[Vegaah Hash] Input String: ${hashStr}`);
    return crypto.createHash('sha256').update(hashStr).digest('hex').toUpperCase(); // ✅ UPDATE: Uppercase signature
};

/**
 * Vegaah Decryption Utility
 * Based on Java AES defaults (ECB/PKCS5Padding)
 */
const decryptVegaahResponse = (encryptedData, merchantKeyHex) => {
    try {
        const key = Buffer.from(merchantKeyHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-ecb', key, null);
        decipher.setAutoPadding(true);
        let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    } catch (error) {
        console.error("[Vegaah Decrypt] Failed:", error.message);
        throw new Error("Failed to decrypt gateway response");
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

    if (data.paymentMethod === 'vegapay') {
        console.log('[Vegaah PRODUCTION] ========== PAYMENT INITIATION ==========');
        console.log('[Vegaah] Transaction ID:', transactionId);
        console.log('[Vegaah] Amount:', totalAmount);
        console.log('[Vegaah] Environment: PRODUCTION');

        const { terminalId, password, merchantKey, baseUrl, contextPath } = PAYMENT_CONFIG.vegapay;

        if (!terminalId || !merchantKey) {
            throw new Error('Vegaah configuration missing');
        }

        const amountStr = parseFloat(totalAmount).toFixed(2);
        const currency = 'INR'; // ✅ CORRECTED: Use INR for India setup

        // Generate signature
        const signature = generateVegaahHash({
            trackId: transactionId,
            terminalId,
            password,
            merchantKey,
            amount: amountStr,
            currency
        });

        // Build request payload according to documentation (Section 3.2.1, page 7)
        const requestPayload = {
            paymentType: "1", // ✅ CORRECTED: Use "paymentType" not "action"
            order: {           // ✅ CORRECTED: Use nested "order" object
                orderId: transactionId,
                description: productInfo
            },
            terminalId: terminalId,
            password: password,
            merchantIp: PAYMENT_CONFIG.vegapay.merchantIp || '74.220.52.1', // ✅ ADDED: Required for Production
            signature: signature,
            amount: amountStr,
            currency: currency,
            customer: {        // ✅ CORRECTED: Use nested "customer" object with correct field names
                customerEmail: email,
                mobileNumber: phone,
                customerIp: "127.0.0.1", // ✅ ADDED: Required field
                billingAddressStreet: data.customerDetails.address || "N/A",
                billingAddressCity: data.customerDetails.city || "N/A",
                billingAddressState: data.customerDetails.state || "N/A",
                billingAddressPostalCode: data.customerDetails.zip || "000000",
                billingAddressCountry: "IN"
            },
            additionalDetails: {
                userData: JSON.stringify({
                    userId: userId.toString(),
                    productInfo: productInfo
                })
            }
        };

        console.log('[Vegaah] Request Payload:', JSON.stringify(requestPayload, null, 2));

        // ✅ CORRECTED: Use correct API endpoint from documentation
        const apiUrl = `${baseUrl}/${contextPath}/v2/payments/pay-request`;

        console.log('[Vegaah] API URL:', apiUrl);

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(requestPayload)
            });

            console.log('[Vegaah] Response Status:', response.status);
            console.log('[Vegaah] Response Headers:', JSON.stringify(Object.fromEntries(response.headers.entries())));

            const responseText = await response.text();
            console.log('[Vegaah] Raw Response:', responseText.substring(0, 500));
            console.log('[Vegaah] Response Length:', responseText.length);

            // Validate response
            if (!responseText || responseText.trim().length === 0) {
                console.error('[Vegaah] ❌ EMPTY RESPONSE RECEIVED');
                console.error('[Vegaah] This usually indicates:');
                console.error('[Vegaah]   1. IP whitelisting issue - Your server IP may not be whitelisted');
                console.error('[Vegaah]   2. Terminal ID not activated for this environment');
                console.error('[Vegaah]   3. Merchant configuration issue');
                console.error('[Vegaah] Server IP that made the request:', ipAddress);
                console.error('[Vegaah] Terminal ID:', terminalId);
                console.error('[Vegaah] Base URL:', baseUrl);
                throw new Error('Empty response from Vegaah gateway. This may be due to IP whitelisting. Please contact Vegaah support to whitelist your server IP or verify terminal configuration.');
            }

            if (responseText.trim().startsWith('<')) {
                console.error('[Vegaah] Received HTML response - likely wrong endpoint');
                throw new Error('Invalid endpoint - received HTML instead of JSON');
            }

            // Parse JSON response
            let result;
            try {
                result = JSON.parse(responseText);
            } catch (parseError) {
                console.error('[Vegaah] JSON Parse Error:', parseError.message);
                throw new Error('Invalid JSON response from gateway');
            }

            console.log('[Vegaah] Parsed Response:', JSON.stringify(result, null, 2));

            // Check for success (responseCode "001" or "000")
            if (result.responseCode === "001" || result.responseCode === "000") {
                // Extract payment link
                let paymentLink = null;

                if (result.paymentLink && result.paymentLink.linkUrl) {
                    paymentLink = result.paymentLink.linkUrl;
                } else if (result.paymentUrl) {
                    paymentLink = result.paymentUrl;
                } else if (result.redirectUrl) {
                    paymentLink = result.redirectUrl;
                }

                if (paymentLink) {
                    // Fix relative URLs
                    if (paymentLink.startsWith('/')) {
                        paymentLink = `${baseUrl}${paymentLink}`;
                    }

                    console.log('[Vegaah] ✓ SUCCESS! Payment Link:', paymentLink);

                    return {
                        status: 'success',
                        data: {
                            paymentLink: paymentLink
                        }
                    };
                } else {
                    throw new Error('Payment link not found in successful response');
                }
            } else {
                // Error response
                const errorMsg = result.responseDescription || result.message || 'Payment initialization failed';
                console.error('[Vegaah] Gateway Error:', errorMsg);
                throw new Error(`Vegaah: ${errorMsg}`);
            }

        } catch (error) {
            console.error('[Vegaah] Exception:', error.message);
            throw new Error(`Vegaah payment failed: ${error.message}`);
        }
    }

    throw new Error('Unsupported Method');
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
    } else if (transaction.paymentGateway === 'vegapay') {
        console.log('[Vegaah] ========== PAYMENT VERIFICATION ==========');

        let finalData = data;

        // Check if response is encrypted
        if (data.data && typeof data.data === 'string') {
            console.log('[Vegaah] Encrypted response detected, decrypting...');
            try {
                finalData = decryptVegaahResponse(data.data, PAYMENT_CONFIG.vegapay.merchantKey);
            } catch (err) {
                console.error('[Vegaah] Decryption failed:', err.message);
                throw new Error('Failed to decrypt payment response');
            }
        }

        console.log('[Vegaah] Decrypted Data:', JSON.stringify(finalData, null, 2));

        // Verify signature if present
        if (finalData.signature && finalData.transactionId && finalData.amountDetails) {
            const { transactionId, responseCode, amountDetails } = finalData;
            const amount = parseFloat(amountDetails.amount).toFixed(2);
            const merchantKey = PAYMENT_CONFIG.vegapay.merchantKey;

            const hashString = `${transactionId}|${merchantKey}|${responseCode}|${amount}`;
            const expectedSignature = crypto.createHash('sha256').update(hashString).digest('hex');

            console.log('[Vegaah] Signature Verification:');
            console.log('  Hash String:', hashString);
            console.log('  Expected:', expectedSignature);
            console.log('  Received:', finalData.signature);

            if (expectedSignature !== finalData.signature) {
                console.error('[Vegaah] Signature verification failed!');
                throw new Error('Invalid response signature');
            }

            console.log('[Vegaah] ✓ Signature verified successfully');
        }

        // Check payment status
        isSuccessful = (
            finalData.result === 'SUCCESS' ||
            finalData.responseCode === '000' ||
            finalData.responseCode === '001'
        );

        data = finalData;
    } else {
        isSuccessful = data.status === 'success' || data.txStatus === 'SUCCESS' || data.order_status === 'PAID' || data.result === 'success';
    }

    if (isSuccessful) {
        transaction.status = 'success';
        transaction.gatewayResponse = data;
        await transaction.save();

        await Cart.findOneAndUpdate({ user: transaction.user }, { $set: { items: [] } });
        console.log(`[Payment Verify] Transaction ${transactionId} successful`);
        return { status: 'success', message: 'Payment verified successfully', transaction };
    } else {
        transaction.status = 'failed';
        transaction.gatewayResponse = data;
        await transaction.save();
        console.warn(`[Payment Verify] Transaction ${transactionId} failed: ${data.txnMsg || data.message || "Unknown error"}`);
        throw new Error(data.txnMsg || data.message || 'Payment verification failed');
    }
};

module.exports = { initiatePayment, verifyPayment, REDIRECT_URLS };
