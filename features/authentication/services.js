const User = require('./schema');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const registerUser = async (userData) => {
    const { firstName, lastName, email, password, role } = userData;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
        throw new Error('User already exists');
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = new User({
        firstName,
        lastName,
        email,
        password: hashedPassword,
        role
    });

    await user.save();

    // Generate Token
    const payload = {
        user: {
            id: user.id,
            role: user.role
        }
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'secretKey', { expiresIn: '1d' });

    return { token, user };
};

const loginUser = async (email, password, role) => {
    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
        throw new Error('Invalid credentials');
    }

    // Check role to ensure correct login portal is used (optional logic but good for security)
    if (user.role !== role) {
        throw new Error('Access denied. Invalid role.');
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        throw new Error('Invalid credentials');
    }

    // Generate Token
    const payload = {
        user: {
            id: user.id,
            role: user.role
        }
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET || 'secretKey', { expiresIn: '1d' });
    return { token, user };
};

const forgotPassword = async (email) => {
    const user = await User.findOne({ email });
    if (!user) {
        throw new Error('User not found');
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.otp = otp;
    user.otpExpiry = otpExpiry;
    await user.save();

    return otp;
};

const verifyOTP = async (email, otp) => {
    const user = await User.findOne({ email });
    if (!user) {
        throw new Error('User not found');
    }

    if (!user.otp || user.otp !== otp) {
        throw new Error('Invalid OTP');
    }

    if (new Date() > user.otpExpiry) {
        throw new Error('OTP has expired');
    }

    return true;
};

const resetPassword = async (email, otp, newPassword) => {
    const user = await User.findOne({ email });
    if (!user) {
        throw new Error('User not found');
    }

    if (user.otp !== otp || new Date() > user.otpExpiry) {
        throw new Error('Invalid or expired OTP');
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    return { message: 'Password reset successful' };
};

module.exports = {
    registerUser,
    loginUser,
    forgotPassword,
    verifyOTP,
    resetPassword
};