const crypto = require("crypto");

function generateVegaahSignature(data) {
    const secret = process.env.VEGAAH_MERCHANT_KEY;
    if (!secret) {
        throw new Error("VEGAAH_MERCHANT_KEY is missing in environment variables");
    }

    // Formatting based on user request: orderId|amount|currency
    const rawString = `${data.orderId}|${data.amount}|${data.currency}`;

    return crypto
        .createHmac("sha256", secret)
        .update(rawString)
        .digest("hex");
}

module.exports = { generateVegaahSignature };
