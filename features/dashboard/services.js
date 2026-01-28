const Transaction = require('../transactions/schema');
const User = require('../authentication/schema');
const Course = require('../courses/schema');
const Instructor = require('../instructors/schema');

// Admin: Get All Enrolled Students with details
const getEnrolledStudents = async () => {
    // 1. Find all successful transactions
    const transactions = await Transaction.find({ status: 'success' })
        .populate('user', 'firstName lastName email')
        .populate('items.course', 'title price');

    // 2. Aggregate data by Student
    const studentMap = new Map();

    transactions.forEach(txn => {
        if (!txn.user) return; // Skip if user deleted

        const userId = txn.user._id.toString();

        if (!studentMap.has(userId)) {
            studentMap.set(userId, {
                studentId: userId,
                name: `${txn.user.firstName} ${txn.user.lastName}`,
                email: txn.user.email,
                phone: txn.customerDetails?.phone || 'N/A',
                address: txn.customerDetails?.address || 'N/A',
                location: `${txn.customerDetails?.city || ''}, ${txn.customerDetails?.country || ''}`,
                totalSpent: 0,
                purchasedCourses: []
            });
        }

        const student = studentMap.get(userId);

        // Add course details
        txn.items.forEach(item => {
            if (item.course) {
                student.purchasedCourses.push({
                    title: item.course.title,
                    price: item.price,
                    purchaseDate: txn.createdAt,
                    transactionId: txn.transactionId
                });
                student.totalSpent += item.price;
            }
        });
    });

    return Array.from(studentMap.values());
};

// Admin: Dashboard Stats
const getAdminStats = async () => {
    const totalStudents = await User.countDocuments({ role: 'student' });
    const totalCourses = await Course.countDocuments();
    const totalInstructors = await Instructor.countDocuments();
    const totalTransactions = await Transaction.countDocuments();

    // Calculate total revenue from success transactions
    const result = await Transaction.aggregate([
        { $match: { status: 'success' } },
        { $group: { _id: null, totalRevenue: { $sum: '$totalAmount' } } }
    ]);
    const totalRevenue = result.length > 0 ? result[0].totalRevenue : 0;

    return {
        totalStudents,
        totalCourses,
        totalInstructors,
        totalTransactions,
        totalRevenue
    };
};

module.exports = {
    getEnrolledStudents,
    getAdminStats
};