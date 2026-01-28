const express = require('express');
const router = express.Router();
const { registerUser, loginUser, forgotPassword, verifyOTP, resetPassword } = require('./services');
const { validateRegisterStudent, validateRegisterAdmin, validateLogin } = require('./validations');
const { OK, CREATED, BAD_REQUEST, INTERNAL_SERVER_ERROR, NOT_FOUND } = require('../../utils/statuscodes');
const { sendOTPEmail } = require('../../utils/email');

// Forgot Password - Send OTP
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(BAD_REQUEST).json({ message: 'Email is required' });
        }

        const otp = await forgotPassword(email);
        await sendOTPEmail(email, otp);

        res.status(OK).json({ message: 'OTP sent to your email' });
    } catch (err) {
        if (err.message === 'User not found') {
            return res.status(NOT_FOUND).json({ message: err.message });
        }
        console.error(err);
        res.status(INTERNAL_SERVER_ERROR).json({ message: err.message || 'Server error' });
    }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) {
            return res.status(BAD_REQUEST).json({ message: 'Email and OTP are required' });
        }

        await verifyOTP(email, otp);
        res.status(OK).json({ message: 'OTP verified successfully' });
    } catch (err) {
        if (err.message === 'Invalid OTP' || err.message === 'OTP has expired') {
            return res.status(BAD_REQUEST).json({ message: err.message });
        }
        if (err.message === 'User not found') {
            return res.status(NOT_FOUND).json({ message: err.message });
        }
        console.error(err);
        res.status(INTERNAL_SERVER_ERROR).json({ message: 'Server error' });
    }
});

// Reset Password
router.post('/reset-password', async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        if (!email || !otp || !newPassword) {
            return res.status(BAD_REQUEST).json({ message: 'Email, OTP and new password are required' });
        }

        const result = await resetPassword(email, otp, newPassword);
        res.status(OK).json(result);
    } catch (err) {
        if (err.message === 'Invalid or expired OTP') {
            return res.status(BAD_REQUEST).json({ message: err.message });
        }
        if (err.message === 'User not found') {
            return res.status(NOT_FOUND).json({ message: err.message });
        }
        console.error(err);
        res.status(INTERNAL_SERVER_ERROR).json({ message: 'Server error' });
    }
});

// Student Register
router.post('/student/register', async (req, res) => {
    try {
        const errors = validateRegisterStudent(req.body);
        if (errors.length > 0) {
            return res.status(BAD_REQUEST).json({ errors });
        }

        const { firstName, lastName, email, password } = req.body;
        const result = await registerUser({ firstName, lastName, email, password, role: 'student' });

        res.status(CREATED).json(result);
    } catch (err) {
        if (err.message === 'User already exists') {
            return res.status(BAD_REQUEST).json({ message: err.message });
        }
        console.error(err);
        res.status(INTERNAL_SERVER_ERROR).json({ message: 'Server error' });
    }
});

// Student Login
router.post('/student/login', async (req, res) => {
    try {
        const errors = validateLogin(req.body);
        if (errors.length > 0) {
            return res.status(BAD_REQUEST).json({ errors });
        }

        const { email, password } = req.body;
        const result = await loginUser(email, password, 'student');

        res.status(OK).json(result);
    } catch (err) {
        if (err.message === 'Invalid credentials' || err.message === 'Access denied. Invalid role.') {
            return res.status(BAD_REQUEST).json({ message: 'Invalid credentials' });
        }
        console.error(err);
        res.status(INTERNAL_SERVER_ERROR).json({ message: 'Server error' });
    }
});

// Admin Register
router.post('/admin/register', async (req, res) => {
    try {
        const errors = validateRegisterAdmin(req.body);
        if (errors.length > 0) {
            return res.status(BAD_REQUEST).json({ errors });
        }

        const { email, password } = req.body;
        const result = await registerUser({ email, password, role: 'admin' });

        res.status(CREATED).json(result);
    } catch (err) {
        if (err.message === 'User already exists') {
            return res.status(BAD_REQUEST).json({ message: err.message });
        }
        console.error(err);
        res.status(INTERNAL_SERVER_ERROR).json({ message: 'Server error' });
    }
});

// Admin Login
router.post('/admin/login', async (req, res) => {
    try {
        const errors = validateLogin(req.body);
        if (errors.length > 0) {
            return res.status(BAD_REQUEST).json({ errors });
        }

        const { email, password } = req.body;
        const result = await loginUser(email, password, 'admin');

        res.status(OK).json(result);
    } catch (err) {
        if (err.message === 'Invalid credentials' || err.message === 'Access denied. Invalid role.') {
            return res.status(BAD_REQUEST).json({ message: 'Invalid credentials' });
        }
        console.error(err);
        res.status(INTERNAL_SERVER_ERROR).json({ message: 'Server error' });
    }
});

module.exports = router;