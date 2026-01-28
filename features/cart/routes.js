const express = require('express');
const router = express.Router();
const { getCart, addToCart, removeFromCart, clearCart } = require('./services');
const { validateAddToCart } = require('./validations');
const { OK, CREATED, BAD_REQUEST, INTERNAL_SERVER_ERROR, NOT_FOUND } = require('../../utils/statuscodes');

// NOTE: In a real app, middleware like 'auth' would extract the userId from the token.
// For this task, we'll assume the userId is passed in the header or body for simplicity,
// or we can implement a basic middleware mock if needed.
// However, the best practice is to extract from JWT.
// Let's assume a variable `req.user.id` is populated by an auth middleware.
// Since we haven't set up the auth middleware globally yet, I will simulate it 
// or accept `userId` in the request body/query for testing purposes if auth is not applied.
// BUT the user asked for "neatly", so I should probably use the logic that expects a user.
// I'll add a simple placeholder middleware here or assume the caller handles it.
// To make it functional right away without complex auth setup in every request,
// I will extract `userId` from specific headers like `x-user-id` for now, 
// basically mocking the authenticated user.

const getUserId = (req) => {
    // In production, this comes from req.user.id after JWT verification
    // For now, allow passing it in headers for testing
    return req.headers['x-user-id'] || req.body.userId;
};

// Get Cart
router.get('/', async (req, res) => {
    try {
        // const userId = getUserId(req); 
        // If we strictly follow the auth, we should need a token. 
        // Let's assume the user will provide a valid User ID in header `x-user-id` for testing.

        const userId = req.headers['x-user-id'];
        if (!userId) {
            return res.status(BAD_REQUEST).json({ message: 'User ID required in headers (x-user-id)' });
        }

        const cart = await getCart(userId);
        res.status(OK).json(cart);
    } catch (err) {
        console.error(err);
        res.status(INTERNAL_SERVER_ERROR).json({ message: 'Server error' });
    }
});

// Add to Cart
router.post('/add', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
            return res.status(BAD_REQUEST).json({ message: 'User ID required in headers (x-user-id)' });
        }

        const errors = validateAddToCart(req.body);
        if (errors.length > 0) {
            return res.status(BAD_REQUEST).json({ errors });
        }

        const { courseId } = req.body;
        const cart = await addToCart(userId, courseId);
        res.status(OK).json(cart); // Return updated cart
    } catch (err) {
        if (err.message === 'Course not found') {
            return res.status(NOT_FOUND).json({ message: 'Course not found' });
        }
        if (err.message === 'Course already in cart') {
            return res.status(BAD_REQUEST).json({ message: 'Course already in cart' });
        }
        console.error(err);
        res.status(INTERNAL_SERVER_ERROR).json({ message: 'Server error' });
    }
});

// Remove from Cart
router.delete('/remove/:courseId', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
            return res.status(BAD_REQUEST).json({ message: 'User ID required in headers (x-user-id)' });
        }

        const { courseId } = req.params;
        const cart = await removeFromCart(userId, courseId);
        res.status(OK).json(cart);
    } catch (err) {
        if (err.message === 'Cart not found') {
            return res.status(NOT_FOUND).json({ message: 'Cart not found' });
        }
        console.error(err);
        res.status(INTERNAL_SERVER_ERROR).json({ message: 'Server error' });
    }
});

// Clear Cart
router.delete('/clear', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
            return res.status(BAD_REQUEST).json({ message: 'User ID required in headers (x-user-id)' });
        }

        const cart = await clearCart(userId);
        res.status(OK).json(cart);
    } catch (err) {
        console.error(err);
        res.status(INTERNAL_SERVER_ERROR).json({ message: 'Server error' });
    }
});

module.exports = router;