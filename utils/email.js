const SibApiV3Sdk = require('sib-api-v3-sdk');

const sendOTPEmail = async (email, otp) => {
    try {
        const defaultClient = SibApiV3Sdk.ApiClient.instance;
        const apiKey = defaultClient.authentications['api-key'];
        apiKey.apiKey = process.env.BREVO_API_KEY;

        const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
        const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

        sendSmtpEmail.subject = "Verify Your Account - EduHub OTP";
        sendSmtpEmail.htmlContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <h1 style="color: #3b82f6;">EduHub</h1>
                </div>
                <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; text-align: center;">
                    <p style="font-size: 16px; color: #475569; margin-bottom: 10px;">Hello,</p>
                    <p style="font-size: 16px; color: #475569; margin-bottom: 30px;">You are receiving this because you (or someone else) have requested a password reset for your account. Your One Time Password (OTP) is:</p>
                    <h2 style="font-size: 32px; color: #1e293b; letter-spacing: 5px; margin: 0;">${otp}</h2>
                    <p style="font-size: 14px; color: #94a3b8; margin-top: 30px;">This OTP is valid for 10 minutes. If you did not request this, please ignore this email.</p>
                </div>
                <div style="text-align: center; margin-top: 20px; color: #94a3b8; font-size: 12px;">
                    &copy; ${new Date().getFullYear()} EduHub Platform. All rights reserved.
                </div>
            </div>
        `;
        sendSmtpEmail.sender = { "name": "EduHub Support", "email": process.env.BREVO_SENDER_EMAIL };
        sendSmtpEmail.to = [{ "email": email }];

        const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
        console.log('OTP Email sent successfully:', data.messageId);
        return data;
    } catch (error) {
        console.error('Error sending OTP Email:', error);
        throw new Error('Failed to send OTP email');
    }
};

module.exports = {
    sendOTPEmail
};
