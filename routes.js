const express = require('express');
const router = express.Router();

// Centralized route for all features
const authenticationRoutes = require('./features/authentication/routes');
const coursesRoutes = require('./features/courses/routes');
const instructorsRoutes = require('./features/instructors/routes');
const dashboardRoutes = require('./features/dashboard/routes');
const cartRoutes = require('./features/cart/routes');
const transactionsRoutes = require('./features/transactions/routes');
const studentRoutes = require('./features/student/routes');

router.use('/authentication', authenticationRoutes);
router.use('/courses', coursesRoutes);
router.use('/instructors', instructorsRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/cart', cartRoutes);
router.use('/transactions', transactionsRoutes);
router.use('/student', studentRoutes);

module.exports = router;
