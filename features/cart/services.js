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
        return cart;
    }

    // 🔧 CLEANUP: Remove ghost items (items with null/undefined course references)
    // This happens when a course is deleted but cart still has reference to it
    const originalItemCount = cart.items.length;
    const validItems = cart.items.filter(item => item.course != null);

    if (validItems.length < originalItemCount) {
        const ghostItemCount = originalItemCount - validItems.length;
        console.log(`[Cart Cleanup] 🧹 Found ${ghostItemCount} ghost item(s) in cart for user ${userId}`);
        console.log(`[Cart Cleanup] Removing invalid course references...`);

        cart.items = validItems;
        await cart.save();

        console.log(`[Cart Cleanup] ✅ Cart cleaned - ${validItems.length} valid items remaining`);
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

    let cart = await Cart.findOne({ user: userId }).populate('items.course');

    if (!cart) {
        cart = new Cart({ user: userId, items: [] });
    }

    // 🔧 CLEANUP: Remove ghost items before checking for duplicates
    // This prevents false "already in cart" errors
    const originalItemCount = cart.items.length;
    const validItems = cart.items.filter(item => item.course != null);

    if (validItems.length < originalItemCount) {
        const ghostItemCount = originalItemCount - validItems.length;
        console.log(`[Add to Cart] 🧹 Found ${ghostItemCount} ghost item(s), cleaning before adding...`);
        cart.items = validItems;
    }

    // Check if item already exists using MongoDB _id (only check valid items)
    const isItemExist = cart.items.some(item =>
        item.course && item.course._id && item.course._id.toString() === course._id.toString()
    );

    if (isItemExist) {
        throw new Error('Course already in cart');
    }

    // Store the MongoDB _id in cart
    cart.items.push({ course: course._id });
    await cart.save();

    console.log(`[Add to Cart] ✅ Added course ${courseId} to cart for user ${userId}`);

    // Return populated cart (getCart will do final cleanup if needed)
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
        const itemCountBeforeClearing = cart.items.length;
        cart.items = [];
        await cart.save();
        // Add metadata about what was cleared
        cart._wasAlreadyEmpty = itemCountBeforeClearing === 0;
        cart._itemsCleared = itemCountBeforeClearing;
    }
    return cart;
};

module.exports = {
    getCart,
    addToCart,
    removeFromCart,
    clearCart
};