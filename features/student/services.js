const Transaction = require('../transactions/schema');
const User = require('../authentication/schema');
const Course = require('../courses/schema');

// Get Student Dashboard Profile (Name, Email, Phone, Enrolled Courses)
const getStudentProfile = async (userId) => {
    // 1. Get User Details
    const user = await User.findById(userId).select('-password');
    if (!user) throw new Error('User not found');

    // 2. Get Successful Transactions to find enrolled courses
    const transactions = await Transaction.find({ user: userId, status: 'success' })
        .populate({
            path: 'items.course',
            select: 'title thumbnail slug duration instructorId'
        });

    // 3. Flatten courses list
    // A user might have multiple transactions, collecting all distinct courses
    const purchasedCourses = [];
    const courseIds = new Set();

    transactions.forEach(txn => {
        txn.items.forEach(item => {
            if (item.course && !courseIds.has(item.course._id.toString())) {
                purchasedCourses.push({
                    _id: item.course._id,
                    title: item.course.title,
                    thumbnail: item.course.thumbnail,
                    slug: item.course.slug,
                    duration: item.course.duration,
                    purchaseDate: txn.createdAt
                });
                courseIds.add(item.course._id.toString());
            }
        });
    });

    return {
        profile: {
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            // Assuming phone is stored in user or we pick it from latest transaction customerDetails
            // Since User schema didn't have phone initially, let's try to fetch it from latest transaction if missing
            phone: user.phone || (transactions.length > 0 ? transactions[0].customerDetails?.phone : 'N/A')
        },
        enrolledCourses: purchasedCourses,
        totalCourses: purchasedCourses.length
    };
};

module.exports = {
    getStudentProfile
};