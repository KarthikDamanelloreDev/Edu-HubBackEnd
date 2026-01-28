const express = require('express');
const router = express.Router();
const { getEnrolledStudents, getAdminStats } = require('./services');
const { OK, INTERNAL_SERVER_ERROR } = require('../../utils/statuscodes');

// Admin: Get Enrolled Students List
router.get('/students', async (req, res) => {
    try {
        const students = await getEnrolledStudents();
        res.status(OK).json(students);
    } catch (err) {
        console.error(err);
        res.status(INTERNAL_SERVER_ERROR).json({ message: 'Server error' });
    }
});

// Admin: Get Dashboard Stats
router.get('/stats', async (req, res) => {
    try {
        const stats = await getAdminStats();
        res.status(OK).json(stats);
    } catch (err) {
        console.error(err);
        res.status(INTERNAL_SERVER_ERROR).json({ message: 'Server error' });
    }
});

module.exports = router;