console.log("Starting seed script...");
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
// require ts-node to handle the following require of .ts file
const { courses } = require('./courses');
const { instructors } = require('./instructors');

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

const Course = require('../features/courses/schema');
const Instructor = require('../features/instructors/schema');

const seedDB = async () => {
    try {
        const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/edu-pro';
        await mongoose.connect(mongoURI);
        console.log('MongoDB Connected for Seeding');

        // Seed Instructors
        await Instructor.deleteMany({});
        console.log('Cleared existing instructors');

        console.log(`Found ${instructors.length} instructors to seed...`);
        await Instructor.insertMany(instructors);
        console.log(`Seeded ${instructors.length} instructors successfully`);

        // Seed Courses
        await Course.deleteMany({});
        console.log('Cleared existing courses');

        console.log(`Found ${courses.length} courses to seed...`);
        await Course.insertMany(courses);
        console.log(`Seeded ${courses.length} courses successfully`);

        // Seed Admin Logic
        const User = require('../features/authentication/schema');
        const Cart = require('../features/cart/schema');
        const Transaction = require('../features/transactions/schema');
        const bcrypt = require('bcryptjs');

        // Clear existing Carts and Transactions
        await Cart.deleteMany({});
        await Transaction.deleteMany({});
        console.log('Cleared existing carts and transactions');

        // Check if admin exists
        const adminEmail = 'eduhubadmin@gmail.com';
        const existingAdmin = await User.findOne({ email: adminEmail });

        if (!existingAdmin) {
            console.log('Seeding Admin User...');
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('123456', salt);

            const adminUser = new User({
                firstName: 'EduHub',
                lastName: 'Admin',
                email: adminEmail,
                password: hashedPassword,
                role: 'admin'
            });

            await adminUser.save();
            console.log('Admin User Seeded Successfully: eduhubadmin@gmail.com');
        } else {
            console.log('Admin user already exists');
        }

        // Seed Sample Student
        const studentEmail = 'student@example.com';
        let student = await User.findOne({ email: studentEmail });

        if (!student) {
            console.log('Seeding Sample Student...');
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('123456', salt);

            student = new User({
                firstName: 'John',
                lastName: 'Doe',
                email: studentEmail,
                password: hashedPassword,
                role: 'student'
            });

            await student.save();
            console.log('Student User Seeded Successfully: student@example.com');
        } else {
            console.log('Student user already exists');
        }

        // Add some courses to student's dashboard via a successful transaction
        const sampleCourses = await Course.find().limit(3);
        if (sampleCourses.length > 0) {
            console.log('Seeding a successful transaction for student...');
            const transaction = new Transaction({
                user: student._id,
                items: sampleCourses.map(c => ({ course: c._id, price: c.price || 499 })),
                totalAmount: sampleCourses.reduce((sum, c) => sum + (c.price || 499), 0),
                currency: 'INR',
                transactionId: 'TXN_' + Date.now(),
                paymentGateway: 'cashfree',
                status: 'success',
                customerDetails: {
                    firstName: student.firstName,
                    lastName: student.lastName,
                    email: student.email,
                    phone: '9876543210'
                }
            });
            await transaction.save();
            console.log(`Seeded dashboard for student with ${sampleCourses.length} courses.`);
        }

        // Add a course to student's cart
        const cartCourse = await Course.findOne({ id: { $nin: sampleCourses.map(c => c.id) } });
        if (cartCourse) {
            console.log('Seeding a cart for student...');
            const cart = new Cart({
                user: student._id,
                items: [{ course: cartCourse._id }]
            });
            await cart.save();
            console.log('Seeded cart with 1 course for student.');
        }

        console.log('All seeding operations completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Seeding Error:', err);
        process.exit(1);
    }
};

seedDB();
