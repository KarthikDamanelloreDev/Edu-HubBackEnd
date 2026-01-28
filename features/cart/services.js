const Cart = require('./schema');
const Course = require('../courses/schema');

// Get cart by user ID
const getCart = async (userId) => {
    let cart = await Cart.findOne({ user: userId }).populate({
        path: 'items.course',
        select: 'title slug thumbnail price originalPrice instructorId duration rating level' // Select fields needed for cart display
    });

    if (!cart) {
        cart = new Cart({ user: userId, items: [] });
        await cart.save();
    }
    return cart;
};

// Add item to cart
const addToCart = async (userId, courseId) => {
    // Verify course exists using custom 'id' field
    const course = await Course.findOne({ id: courseId });
    if (!course) {
        throw new Error('Course not found');
    }

    let cart = await Cart.findOne({ user: userId });

    if (!cart) {
        cart = new Cart({ user: userId, items: [] });
    }

    // Check if item already exists using MongoDB _id
    const isItemExist = cart.items.some(item => item.course.toString() === course._id.toString());
    if (isItemExist) {
        throw new Error('Course already in cart');
    }

    // Store the MongoDB _id in cart
    cart.items.push({ course: course._id });
    await cart.save();

    // Return populated cart
    return await getCart(userId);
};

// Remove item from cart
const removeFromCart = async (userId, courseId) => {
    let cart = await Cart.findOne({ user: userId });

    if (!cart) {
        throw new Error('Cart not found');
    }

    // Try to find course by custom 'id' field to get MongoDB _id
    const course = await Course.findOne({ id: courseId });

    if (course) {
        // Remove using MongoDB _id
        cart.items = cart.items.filter(item => item.course.toString() !== course._id.toString());
    } else {
        // Fallback: try to remove using courseId directly (in case it's already a MongoDB _id)
        cart.items = cart.items.filter(item => item.course.toString() !== courseId);
    }

    await cart.save();

    return await getCart(userId);
};

// Clear cart
const clearCart = async (userId) => {
    let cart = await Cart.findOne({ user: userId });
    if (cart) {
        cart.items = [];
        await cart.save();
    }
    return cart;
};

module.exports = {
    getCart,
    addToCart,
    removeFromCart,
    clearCart
};