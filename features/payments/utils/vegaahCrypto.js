const crypto = require("crypto");

function encryptVegaah(data) {
    // Ensure the key is valid hex before using it
    if (!process.env.VEGAAH_MERCHANT_KEY) {
        throw new Error("VEGAAH_MERCHANT_KEY is missing in environment variables");
    }

    const key = Buffer.from(process.env.VEGAAH_MERCHANT_KEY, "hex");
    const iv = Buffer.alloc(16, 0);

    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    let encrypted = cipher.update(JSON.stringify(data), "utf8", "base64");
    encrypted += cipher.final("base64");

    return encrypted;
}

function decryptVegaah(encryptedData) {
    if (!process.env.VEGAAH_MERCHANT_KEY) {
        throw new Error("VEGAAH_MERCHANT_KEY is missing in environment variables");
    }

    const key = Buffer.from(process.env.VEGAAH_MERCHANT_KEY, "hex");
    const iv = Buffer.alloc(16, 0);

    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(encryptedData, "base64", "utf8");
    decrypted += decipher.final("utf8");

    return JSON.parse(decrypted);
}

module.exports = { encryptVegaah, decryptVegaah };
